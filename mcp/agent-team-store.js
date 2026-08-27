import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { AGENT_TEAM_RUN_SCHEMA } from "../contracts/agent-team.schema.js";

const RUN_ID_PATTERN = /^atr_[0-9a-f]{24}$/;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const MAX_EVENT_BYTES = 128 * 1024;
const MAX_LIST_RUNS = 200;
export const AGENT_TEAM_MAX_CHECKPOINTS = 64;
const RUN_STATES = new Set(["queued", "running", "review_pending", "paused", "blocked", "failed", "completed", "canceled"]);
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safeCounter = (value) => Number.isSafeInteger(value) && value >= 0;
const validUsage = (value) => (
  isRecord(value)
  && Object.keys(value).length === 6
  && ["turns", "inputTokens", "outputTokens", "totalTokens"].every((key) => safeCounter(value[key]))
  && value.totalTokens === Math.min(Number.MAX_SAFE_INTEGER, value.inputTokens + value.outputTokens)
  && ["reported", "unreported"].includes(value.costStatus)
  && (
    (value.costStatus === "reported" && typeof value.costUsd === "number" && Number.isFinite(value.costUsd) && value.costUsd >= 0)
    || (value.costStatus === "unreported" && value.costUsd === null)
  )
);
const validAdmittedEnvelope = (value) => (
  isRecord(value)
  && Object.keys(value).length === 6
  && ["inputTokens", "outputTokens", "totalTokens", "timeMs"].every(
    (key) => Number.isSafeInteger(value[key]) && value[key] >= (key === "timeMs" ? 1 : 0),
  )
  && value.totalTokens === value.inputTokens + value.outputTokens
  && typeof value.costUsd === "number"
  && Number.isFinite(value.costUsd)
  && value.costUsd >= 0
  && value.costStatus === "reported"
);
const validExecutionClaim = (claim, state) => (
  claim === null
  || (
    isRecord(claim)
    && Object.keys(claim).length === 9
    && /^ate_[0-9a-f]{24}$/.test(claim.effectId)
    && typeof claim.ownerId === "string"
    && claim.ownerId.length > 0
    && claim.ownerId.length <= 200
    && safeCounter(claim.leaseExpiresAt)
    && state.plan.workflow.allowedBranchIds.includes(claim.branchId)
    && claim.branchId === state.currentBranchId
    && Number.isInteger(claim.attempt)
    && claim.attempt >= 1
    && /^[0-9a-f]{64}$/.test(claim.inputDigest)
    && validAdmittedEnvelope(claim.admittedEnvelope)
    && safeCounter(claim.estimateElapsedMs)
    && safeCounter(claim.inputActiveExecutionMs)
  )
);

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((output, key) => {
    output[key] = stableValue(value[key]);
    return output;
  }, {});
};

export const stableAgentTeamJson = (value) => JSON.stringify(stableValue(value));
export const digestAgentTeamValue = (value) => (
  crypto.createHash("sha256").update(stableAgentTeamJson(value)).digest("hex")
);
export const agentTeamRunIdForKey = (idempotencyKey) => (
  `atr_${crypto.createHash("sha256").update(String(idempotencyKey)).digest("hex").slice(0, 24)}`
);
export const digestAgentTeamPlan = (plan) => {
  const canonical = { ...plan };
  delete canonical.planId;
  delete canonical.planDigest;
  return digestAgentTeamValue(canonical);
};
export const digestAgentTeamCheckpoint = (state) => {
  const canonical = { ...state };
  delete canonical.checkpointDigest;
  return digestAgentTeamValue(canonical);
};
const digestAgentTeamEvent = (event) => digestAgentTeamValue({
  at: event.at,
  stateVersion: event.stateVersion,
  type: event.type,
  previousCheckpointDigest: event.previousCheckpointDigest,
  previousEventDigest: event.previousEventDigest,
  data: event.data,
});

export const agentTeamCheckpointId = (runId, stateVersion) => (
  `atc_${crypto.createHash("sha256").update(`${runId}:${stateVersion}`).digest("hex").slice(0, 24)}`
);
const validAgentTeamState = (state, runId) => {
  const participants = new Set((state.plan?.participants || []).map((participant) => participant.participantId));
  const allowedBranches = state.plan?.workflow?.allowedBranchIds || [];
  return (
    state.schema === AGENT_TEAM_RUN_SCHEMA
    && state.runId === runId
    && Number.isInteger(state.stateVersion)
    && state.stateVersion >= 1
    && state.stateVersion <= AGENT_TEAM_MAX_CHECKPOINTS
    && state.transitionSequence === state.stateVersion
    && state.checkpointId === agentTeamCheckpointId(runId, state.stateVersion)
    && state.checkpointDigest === digestAgentTeamCheckpoint(state)
    && typeof state.latestEventDigest === "string"
    && state.planDigest === state.plan?.planDigest
    && state.planDigest === digestAgentTeamPlan(state.plan)
    && RUN_STATES.has(state.state)
    && participants.has(state.currentConversationOwnerParticipantId)
    && participants.has(state.finalAnswerOwnerParticipantId)
    && Array.isArray(state.completedBranchIds)
    && new Set(state.completedBranchIds).size === state.completedBranchIds.length
    && state.completedBranchIds.every((branchId) => allowedBranches.includes(branchId))
    && validUsage(state.usage)
    && safeCounter(state.activeExecutionMs)
    && (
      (state.state === "running" && safeCounter(state.activeSince))
      || (state.state !== "running" && state.activeSince === null)
    )
    && isRecord(state.controlReceipts)
    && Object.keys(state.controlReceipts).length <= 64
    && (
      (state.currentBranchId === null && state.executionClaim === null)
      || (allowedBranches.includes(state.currentBranchId) && state.executionClaim !== null)
    )
    && validExecutionClaim(state.executionClaim, state)
  );
};
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class AgentTeamStore {
  constructor({ rootDir, now = () => new Date() }) {
    this.rootDir = path.resolve(rootDir);
    this.baseDir = path.join(this.rootDir, ".agenticgraph-workspace", "agent-team-runs");
    this.now = now;
  }

  runDir(runId) {
    if (!RUN_ID_PATTERN.test(String(runId))) throw Object.assign(new Error("Invalid agent-team run id."), { code: "invalid_run_id" });
    return path.join(this.baseDir, runId);
  }

  statePath(runId) { return path.join(this.runDir(runId), "state.json"); }
  eventsDir(runId) { return path.join(this.runDir(runId), "events"); }
  eventPath(runId, stateVersion) { return path.join(this.eventsDir(runId), `${String(stateVersion).padStart(6, "0")}.json`); }

  async ensureSafeDirectory(directory) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw Object.assign(new Error("Agent-team state directory failed its local safety fence."), { code: "unsafe_state_path" });
    }
  }

  async ensureBaseDirectory() {
    const workspace = path.join(this.rootDir, ".agenticgraph-workspace");
    for (const directory of [workspace, this.baseDir]) {
      try {
        await fs.mkdir(directory, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      await this.ensureSafeDirectory(directory);
    }
    const rootReal = await fs.realpath(this.rootDir);
    const baseReal = await fs.realpath(this.baseDir);
    const relative = path.relative(rootReal, baseReal);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw Object.assign(new Error("Agent-team state escapes runtime root."), { code: "unsafe_state_path" });
    }
  }

  async writeAtomic(filePath, value, maximumBytes = MAX_STATE_BYTES) {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > maximumBytes) {
      throw Object.assign(new Error("Durable agent-team record exceeds its byte bound."), { code: "durable_state_too_large" });
    }
    const parentDirectory = path.dirname(filePath);
    const temporaryDirectory = path.basename(parentDirectory) === "events"
      ? path.dirname(parentDirectory)
      : parentDirectory;
    const temporary = path.join(
      temporaryDirectory,
      `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`,
    );
    await fs.writeFile(temporary, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      await fs.rename(temporary, filePath);
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  }

  async withLock(runId, callback) {
    await this.ensureBaseDirectory();
    await this.ensureSafeDirectory(this.runDir(runId));
    const lockPath = path.join(this.runDir(runId), ".state.lock");
    const deadline = Date.now() + 5_000;
    while (true) {
      try {
        const handle = await fs.open(lockPath, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: this.now().toISOString() }));
          return await callback();
        } finally {
          await handle.close();
          await fs.unlink(lockPath).catch(() => undefined);
        }
      } catch (error) {
        if (error?.code !== "EEXIST" || Date.now() >= deadline) throw error;
        const stat = await fs.stat(lockPath).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > 30_000) await fs.unlink(lockPath).catch(() => undefined);
        await delay(20);
      }
    }
  }

  async create({ plan, idempotencyKey, adapterId, adapterRevision }) {
    const runId = agentTeamRunIdForKey(idempotencyKey);
    const startDigest = digestAgentTeamValue({ planDigest: plan.planDigest, adapterId, adapterRevision });
    await this.ensureBaseDirectory();
    const staging = path.join(this.baseDir, `.init-${runId}-${crypto.randomUUID()}`);
    try {
      await fs.mkdir(staging, { mode: 0o700 });
      await fs.mkdir(path.join(staging, "events"), { mode: 0o700 });
      const timestamp = this.now().toISOString();
      const state = {
        schema: AGENT_TEAM_RUN_SCHEMA,
        runId,
        state: "queued",
        stateVersion: 1,
        transitionSequence: 1,
        checkpointId: agentTeamCheckpointId(runId, 1),
        previousCheckpointDigest: null,
        latestEventDigest: null,
        startDigest,
        startReceipt: { snapshot: null },
        planDigest: plan.planDigest,
        plan,
        adapterId,
        adapterRevision,
        currentBranchId: null,
        executionClaim: null,
        currentConversationOwnerParticipantId: plan.owners.initialConversationOwnerParticipantId,
        finalAnswerOwnerParticipantId: plan.owners.initialFinalAnswerOwnerParticipantId,
        completedBranchIds: [],
        attemptsByBranchId: {},
        privateMessages: [],
        lastSettlement: null,
        maxDelegationDepthObserved: 0,
        maxFanoutObserved: 0,
        finalAnswer: null,
        review: {
          status: "not_requested",
          policyId: plan.reviewPolicy.policyId,
          policyRevision: plan.reviewPolicy.policyRevision,
          question: null,
          allowedDecisions: [],
          evidenceReferences: [],
          receiptId: null,
          decision: null,
          verificationDigest: null,
        },
        usage: { turns: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costStatus: "reported" },
        controlReceipts: {},
        trace: [{ sequence: 1, type: "run.queued", at: timestamp, taskId: null, roleId: null }],
        createdAt: timestamp,
        updatedAt: timestamp,
        activeExecutionMs: 0,
        activeSince: null,
        error: null,
      };
      const initialEvent = {
        at: timestamp,
        stateVersion: 1,
        type: "run.queued",
        previousCheckpointDigest: null,
        previousEventDigest: null,
        data: { planDigest: plan.planDigest },
      };
      initialEvent.eventDigest = digestAgentTeamEvent(initialEvent);
      state.latestEventDigest = initialEvent.eventDigest;
      state.checkpointDigest = digestAgentTeamCheckpoint(state);
      if (!validAgentTeamState(state, runId)) {
        throw Object.assign(new Error("Initial agent-team state violated durable invariants."), {
          code: "invalid_transition",
        });
      }
      await this.writeAtomic(path.join(staging, "state.json"), state);
      await this.writeAtomic(
        path.join(staging, "events", "000001.json"),
        {
          ...initialEvent,
          stateDigest: state.checkpointDigest,
        },
        MAX_EVENT_BYTES,
      );
      await fs.rename(staging, this.runDir(runId));
      return { created: true, state };
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error;
      const state = await this.read(runId);
      if (state.startDigest !== startDigest) {
        throw Object.assign(new Error("Start idempotency key is already bound to a different plan or adapter."), { code: "idempotency_conflict" });
      }
      return { created: false, state };
    }
  }

  async read(runId) {
    let stat;
    try {
      await this.ensureSafeDirectory(this.baseDir);
      await this.ensureSafeDirectory(this.runDir(runId));
      stat = await fs.lstat(this.statePath(runId));
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw Object.assign(new Error("Agent-team run was not found."), { code: "run_not_found" });
      }
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES) {
      throw Object.assign(new Error("Unsafe or oversized agent-team state file."), { code: "invalid_durable_state" });
    }
    let state;
    try {
      state = JSON.parse(await fs.readFile(this.statePath(runId), "utf8"));
    } catch {
      throw Object.assign(new Error("Agent-team checkpoint is not valid JSON."), { code: "invalid_durable_state" });
    }
    if (!validAgentTeamState(state, runId)) {
      throw Object.assign(new Error("Agent-team checkpoint failed its schema or digest fence."), { code: "invalid_durable_state" });
    }
    await this.ensureSafeDirectory(this.eventsDir(runId));
    let previousCheckpointDigest = null;
    let previousEventDigest = null;
    let latestPreviousDigest = null;
    let latestEvent;
    try {
      const eventEntries = (await fs.readdir(this.eventsDir(runId), { withFileTypes: true }))
        .sort((left, right) => left.name.localeCompare(right.name));
      const expectedEventNames = Array.from(
        { length: state.stateVersion },
        (_, index) => `${String(index + 1).padStart(6, "0")}.json`,
      );
      const hasUncommittedSuccessor = eventEntries.length === expectedEventNames.length + 1;
      if (
        (!hasUncommittedSuccessor && eventEntries.length !== expectedEventNames.length)
        || eventEntries.slice(0, expectedEventNames.length).some((entry, index) => (
          entry.name !== expectedEventNames[index]
          || !entry.isFile()
          || entry.isSymbolicLink()
        ))
      ) throw new Error("unexpected event ledger entry");
      if (hasUncommittedSuccessor) {
        const orphanName = `${String(state.stateVersion + 1).padStart(6, "0")}.json`;
        const orphanEntry = eventEntries.at(-1);
        const orphanPath = this.eventPath(runId, state.stateVersion + 1);
        const orphanStat = await fs.lstat(orphanPath);
        if (!orphanStat.isFile() || orphanStat.isSymbolicLink() || orphanStat.size > MAX_EVENT_BYTES) {
          throw new Error("unsafe uncommitted event successor");
        }
        const orphan = JSON.parse(await fs.readFile(orphanPath, "utf8"));
        if (
          orphanEntry.name !== orphanName
          || !orphanEntry.isFile()
          || orphanEntry.isSymbolicLink()
          || orphan.stateVersion !== state.stateVersion + 1
          || orphan.previousCheckpointDigest !== state.checkpointDigest
          || orphan.previousEventDigest !== state.latestEventDigest
          || orphan.eventDigest !== digestAgentTeamEvent(orphan)
          || typeof orphan.stateDigest !== "string"
        ) throw new Error("invalid uncommitted event successor");
      }
      for (let version = 1; version <= state.stateVersion; version += 1) {
        const eventPath = this.eventPath(runId, version);
        const eventStat = await fs.lstat(eventPath);
        if (!eventStat.isFile() || eventStat.isSymbolicLink() || eventStat.size > MAX_EVENT_BYTES) {
          throw new Error("unsafe event");
        }
        const event = JSON.parse(await fs.readFile(eventPath, "utf8"));
        if (
          event.stateVersion !== version
          || event.previousCheckpointDigest !== previousCheckpointDigest
          || event.previousEventDigest !== previousEventDigest
          || event.eventDigest !== digestAgentTeamEvent(event)
          || typeof event.stateDigest !== "string"
        ) {
          throw new Error("forked event chain");
        }
        latestPreviousDigest = previousCheckpointDigest;
        previousCheckpointDigest = event.stateDigest;
        previousEventDigest = event.eventDigest;
        latestEvent = event;
      }
    } catch {
      throw Object.assign(new Error("Agent-team checkpoint event chain is missing, corrupt, or unsafe."), { code: "invalid_durable_state" });
    }
    if (
      state.previousCheckpointDigest !== latestPreviousDigest
      || state.latestEventDigest !== latestEvent.eventDigest
      || latestEvent.stateDigest !== state.checkpointDigest
      || latestEvent.type !== state.trace?.at(-1)?.type
    ) {
      throw Object.assign(new Error("Agent-team checkpoint event forked from durable state."), { code: "invalid_durable_state" });
    }
    return state;
  }

  async readOptional(runId) {
    try {
      await fs.lstat(this.statePath(runId));
      return await this.read(runId);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async update(runId, { expectedStateVersion, eventType, eventData = {} }, mutate) {
    return this.withLock(runId, async () => {
      const current = await this.read(runId);
      if (Number.isInteger(expectedStateVersion) && current.stateVersion !== expectedStateVersion) {
        throw Object.assign(new Error(`Run state version is ${current.stateVersion}, not ${expectedStateVersion}.`), { code: "state_version_conflict" });
      }
      if (current.stateVersion >= AGENT_TEAM_MAX_CHECKPOINTS) {
        throw Object.assign(new Error("The durable agent-team checkpoint limit is exhausted."), {
          code: "checkpoint_limit_exceeded",
        });
      }
      const next = await mutate(structuredClone(current));
      if (!next || next.runId !== runId || next.schema !== AGENT_TEAM_RUN_SCHEMA || next.planDigest !== current.planDigest) {
        throw Object.assign(new Error("Agent-team transition returned invalid state."), { code: "invalid_transition" });
      }
      next.stateVersion = current.stateVersion + 1;
      next.transitionSequence = current.transitionSequence + 1;
      next.checkpointId = agentTeamCheckpointId(runId, next.stateVersion);
      next.previousCheckpointDigest = current.checkpointDigest;
      next.updatedAt = this.now().toISOString();
      next.trace = [
        ...(Array.isArray(next.trace) ? next.trace : []).slice(-63),
        {
          sequence: next.transitionSequence,
          type: eventType,
          at: next.updatedAt,
          branchId: eventData.branchId || next.currentBranchId,
          participantId: next.currentConversationOwnerParticipantId,
        },
      ];
      const event = {
        at: next.updatedAt,
        stateVersion: next.stateVersion,
        type: eventType,
        previousCheckpointDigest: next.previousCheckpointDigest,
        previousEventDigest: current.latestEventDigest,
        data: eventData,
      };
      event.eventDigest = digestAgentTeamEvent(event);
      next.latestEventDigest = event.eventDigest;
      next.checkpointDigest = digestAgentTeamCheckpoint(next);
      if (!validAgentTeamState(next, runId)) {
        throw Object.assign(new Error("Agent-team transition violated durable state invariants."), {
          code: "invalid_transition",
        });
      }
      await this.writeAtomic(this.eventPath(runId, next.stateVersion), {
        ...event,
        stateDigest: next.checkpointDigest,
      }, MAX_EVENT_BYTES);
      await this.writeAtomic(this.statePath(runId), next);
      return next;
    });
  }

  async list({ runId = "", states: stateFilter = [], limit = 50 } = {}) {
    if (runId) return [await this.read(runId)];
    const boundedLimit = Math.max(1, Math.min(MAX_LIST_RUNS, Number(limit) || 50));
    try {
      const stat = await fs.lstat(this.baseDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw Object.assign(new Error("Unsafe agent-team state directory."), { code: "unsafe_state_path" });
      }
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const entries = (await fs.readdir(this.baseDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && RUN_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    const output = [];
    for (const candidate of entries) {
      const state = await this.read(candidate);
      if (!Array.isArray(stateFilter) || stateFilter.length === 0 || stateFilter.includes(state.state)) output.push(state);
      if (output.length >= boundedLimit) break;
    }
    return output;
  }

  async listForRecovery({ states: stateFilter = [], limit = MAX_LIST_RUNS } = {}) {
    const boundedLimit = Math.max(1, Math.min(MAX_LIST_RUNS, Number(limit) || MAX_LIST_RUNS));
    let entries;
    try {
      const stat = await fs.lstat(this.baseDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw Object.assign(new Error("Unsafe agent-team state directory."), { code: "unsafe_state_path" });
      }
      entries = (await fs.readdir(this.baseDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && RUN_ID_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .reverse();
    } catch (error) {
      if (error?.code === "ENOENT") return { states: [], corrupt: 0 };
      throw error;
    }
    const states = [];
    let corrupt = 0;
    for (const runId of entries) {
      try {
        const state = await this.read(runId);
        if (!stateFilter.length || stateFilter.includes(state.state)) states.push(state);
      } catch {
        corrupt += 1;
      }
      if (states.length >= boundedLimit) break;
    }
    return { states, corrupt };
  }
}
