import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import Ajv from "ajv";

import {
  AGENT_TEAM_CONTROL_INPUT_SCHEMA,
  AGENT_TEAM_LIST_INPUT_SCHEMA,
  AGENT_TEAM_PLAN_INPUT_SCHEMA,
  AGENT_TEAM_START_INPUT_SCHEMA,
  AGENT_TEAM_TOOL_NAMES,
  effectiveAgentTeamBounds,
  validateAgentTeamPlanRequest,
} from "../contracts/agent-team.schema.js";
import { createRunningAgentAdapterRegistry } from "../contracts/agent-model-runtime.js";
import { createAgentTeamControlHandler } from "./agent-team-control-runtime.js";
import { executeAgentTeamRun } from "./agent-team-executor.js";
import { resolveAgentTeamInvocation } from "./agent-team-invocation.js";
import { buildAgentTeamPlanCore, createAgentTeamPlanResolver } from "./agent-team-plan-runtime.js";
import {
  agentTeamError,
  publicAgentTeamList,
  publicAgentTeamPlan,
  publicAgentTeamStartSnapshot,
  snapshotAgentTeamRun,
  ZERO_AGENT_TEAM_USAGE,
} from "./agent-team-result.js";
import { loadLocalAgentTeamSource } from "./agent-team-source.js";
import {
  AgentTeamStore,
  agentTeamCheckpointId,
  agentTeamRunIdForKey,
  digestAgentTeamPlan,
} from "./agent-team-store.js";
import {
  foldAgentTeamActiveInterval,
  normalizeAgentTeamTimestamp,
} from "./agent-team-time.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlanInputSchema = ajv.compile(AGENT_TEAM_PLAN_INPUT_SCHEMA);
const validateStartInputSchema = ajv.compile(AGENT_TEAM_START_INPUT_SCHEMA);
const validateListInputSchema = ajv.compile(AGENT_TEAM_LIST_INPUT_SCHEMA);
const validateControlInputSchema = ajv.compile(AGENT_TEAM_CONTROL_INPUT_SCHEMA);
const PLAN_CACHE_LIMIT = 500;

const planIdForKey = (key) => (
  `atp_${crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 24)}`
);
const receiptKeyFor = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");

const schemaError = (operation, validator, context = {}) => agentTeamError(operation, {
  code: "invalid_input",
  message: `Agent-team ${operation} input failed validation.`,
  trustedDetails: true,
  details: (validator.errors || []).map((entry) => ({
    path: entry.instancePath || entry.schemaPath,
    reason: entry.message || "invalid",
  })),
}, context);

const contextForPlan = (plan) => ({
  teamId: plan?.teamId || null,
  teamRevision: plan?.teamRevision || null,
  state: plan ? "planned" : null,
  stateVersion: plan ? 1 : null,
  planDigest: plan?.planDigest || null,
  evidence: plan?.evidence || [],
  usage: ZERO_AGENT_TEAM_USAGE,
});

const contextForState = (state) => ({
  teamId: state?.plan?.teamId || null,
  teamRevision: state?.plan?.teamRevision || null,
  runId: state?.runId || null,
  state: state?.state || null,
  stateVersion: state?.stateVersion ?? null,
  planDigest: state?.planDigest || null,
  evidence: state?.plan?.evidence || [],
  usage: state?.usage || ZERO_AGENT_TEAM_USAGE,
});

export function createAgentTeamRuntime({
  rootDir,
  env = process.env,
  docsResolver,
  sourceResolver,
  referenceVerifier,
  reviewReceiptVerifier,
  controlAuthorizer,
  adapterRegistry,
  defaultAdapterId,
  supervisorId,
  effectLeaseMs = 65_000,
  now = () => new Date(),
  nowMs = () => Date.now(),
} = {}) {
  const runtimeRoot = path.resolve(rootDir || process.cwd());
  const store = new AgentTeamStore({ rootDir: runtimeRoot, now });
  const registry = adapterRegistry || createRunningAgentAdapterRegistry([]);
  const configuredAdapterId = String(defaultAdapterId || env.AGENTICGRAPH_AGENT_TEAM_ADAPTER_ID || "").trim();
  const requestedSupervisorId = String(supervisorId || "").trim();
  if (requestedSupervisorId.length > 200) {
    throw new TypeError("Agent-team supervisorId must be at most 200 characters.");
  }
  const runtimeSupervisorId = requestedSupervisorId || `ats_${crypto.randomUUID()}`;
  const runtimeEffectLeaseMs = Math.max(
    1_000,
    Math.min(3_600_000, Number.isFinite(effectLeaseMs) ? Math.trunc(effectLeaseMs) : 65_000),
  );
  const plans = new Map();
  const planBindings = new Map();
  const activeExecutions = new Map();
  const activeControllers = new Map();

  const resolveSource = sourceResolver || ((identity) => loadLocalAgentTeamSource(identity, { rootDir: runtimeRoot }));
  const resolveInvocation = (invocation) => resolveAgentTeamInvocation(invocation, {
    rootDir: runtimeRoot,
    env,
    ...(docsResolver ? { docsResolver } : {}),
  });

  const planResolver = createAgentTeamPlanResolver({
    resolveInvocation,
    resolveSource,
    referenceVerifier,
  });

  const executionAdapter = () => {
    if (!configuredAdapterId) return null;
    const adapter = registry.resolve(configuredAdapterId);
    return (
      adapter?.configured === true
      && adapter.replaySafe === true
      && adapter.estimateZeroSpend === true
      && typeof adapter.id === "string"
      && adapter.id === configuredAdapterId
      && adapter.id.length <= 200
      && typeof adapter.revision === "string"
      && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,159}$/.test(adapter.revision)
      && typeof adapter.estimate === "function"
      && typeof adapter.execute === "function"
    ) ? adapter : null;
  };

  async function plan(input) {
    if (!validatePlanInputSchema(input)) return schemaError("plan", validatePlanInputSchema);
    const semanticValidation = validateAgentTeamPlanRequest(input);
    if (!semanticValidation.ok) {
      return agentTeamError("plan", {
        code: "invalid_team_plan",
        message: "Agent-team plan failed semantic validation.",
        trustedDetails: true,
        details: semanticValidation.issues,
      });
    }
    if (typeof referenceVerifier !== "function") {
      return agentTeamError("plan", {
        code: "reference_verifier_unavailable",
        message: "No host-owned Agent Definition, Agent Orchestration, and review-policy reference verifier is configured.",
      });
    }
    let resolved;
    try {
      resolved = await planResolver.resolve(input.invocation, input.teamSource, input.bounds.maxStageTimeMs);
    } catch (error) {
      return agentTeamError("plan", error);
    }
    const team = resolved.source.document;
    const bounds = effectiveAgentTeamBounds(team.bounds, input.bounds);
    if (team.workflow.allowedBranchIds.length > bounds.maxTurns) {
      return agentTeamError("plan", {
        code: "turn_bound_too_low",
        message: "Effective maxTurns is lower than the exact workflow branch count.",
      }, { teamId: team.teamId, teamRevision: team.teamRevision });
    }
    const core = buildAgentTeamPlanCore({
      team,
      sourceRevision: resolved.invocationEvidence.sourceRevision,
      requestedTask: input.requestedTask,
      bounds,
      evidence: resolved.evidence,
      resolvedReferences: resolved.resolvedReferences,
    });
    const planDigest = digestAgentTeamPlan(core);
    const planId = planIdForKey(input.idempotencyKey);
    const bindingKey = receiptKeyFor(input.idempotencyKey);
    const priorDigest = planBindings.get(bindingKey);
    if (priorDigest && priorDigest !== planDigest) {
      return agentTeamError("plan", {
        code: "idempotency_conflict",
        message: "Plan idempotency key is already bound to different exact inputs.",
      }, { teamId: team.teamId, teamRevision: team.teamRevision });
    }
    if (!plans.has(planId) && plans.size >= PLAN_CACHE_LIMIT) {
      return agentTeamError("plan", {
        code: "plan_cache_full",
        message: "The bounded ephemeral plan cache is full.",
      }, { teamId: team.teamId, teamRevision: team.teamRevision });
    }
    const compiled = Object.freeze({ ...core, planId, planDigest });
    planBindings.set(bindingKey, planDigest);
    plans.set(planId, compiled);
    return publicAgentTeamPlan(compiled);
  }

  async function execute(runId, signal) {
    if (activeExecutions.has(runId)) {
      await activeExecutions.get(runId);
      const latest = await store.read(runId);
      return latest.state === "queued" ? execute(runId, signal) : latest;
    }
    const adapter = executionAdapter();
    if (!adapter) return store.read(runId);
    const promise = executeAgentTeamRun({
      store,
      runId,
      adapter,
      signal,
      nowMs,
      supervisorId: runtimeSupervisorId,
      effectLeaseMs: runtimeEffectLeaseMs,
      onController(controller) {
        if (controller) activeControllers.set(runId, controller);
        else activeControllers.delete(runId);
      },
    }).finally(() => {
      activeExecutions.delete(runId);
      activeControllers.delete(runId);
    });
    activeExecutions.set(runId, promise);
    return promise;
  }

  async function recordStartReceipt(state) {
    let current = state;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (current.startReceipt?.snapshot) return current;
      const resultStateVersion = current.stateVersion + 1;
      const snapshot = snapshotAgentTeamRun(current, {
        stateVersion: resultStateVersion,
        checkpointId: agentTeamCheckpointId(current.runId, resultStateVersion),
        transitionSequence: current.transitionSequence + 1,
      });
      try {
        return await store.update(current.runId, {
          expectedStateVersion: current.stateVersion,
          eventType: "start.receipt_recorded",
          eventData: { resultStateVersion: snapshot.stateVersion },
        }, (candidate) => {
          candidate.startReceipt = { snapshot };
          return candidate;
        });
      } catch (error) {
        if (error?.code !== "state_version_conflict") throw error;
        current = await store.read(current.runId);
      }
    }
    throw Object.assign(new Error("The exact start result could not be recorded atomically."), {
      code: "start_receipt_recording_conflict",
    });
  }

  async function start(input, { signal } = {}) {
    if (!validateStartInputSchema(input)) return schemaError("start", validateStartInputSchema);
    const requestedRunId = agentTeamRunIdForKey(input.idempotencyKey);
    let existing;
    try {
      existing = await store.readOptional(requestedRunId);
    } catch (error) {
      return agentTeamError("start", error);
    }
    if (
      existing
      && (
        existing.plan.planId !== input.planId
        || existing.planDigest !== input.planDigest
        || existing.plan.teamRevision !== input.teamRevision
      )
    ) {
      return agentTeamError("start", {
        code: "idempotency_conflict",
        message: "Start idempotency key is already bound to a different exact plan.",
      }, contextForState(existing));
    }
    if (existing?.startReceipt?.snapshot) {
      return publicAgentTeamStartSnapshot(existing, existing.startReceipt.snapshot);
    }
    if (
      existing?.state === "running"
      && existing.executionClaim
      && existing.executionClaim.ownerId !== runtimeSupervisorId
      && Number(existing.executionClaim.leaseExpiresAt || 0) > nowMs()
    ) {
      return agentTeamError("start", {
        code: "start_in_progress",
        message: "The original start is still owned by an unexpired durable execution claim.",
      }, contextForState(existing));
    }
    const compiled = plans.get(input.planId) || existing?.plan;
    if (!compiled) {
      return agentTeamError("start", {
        code: "plan_not_available",
        message: "The exact zero-model plan is not available in this runtime; call plan again.",
      });
    }
    const planContext = contextForPlan(compiled);
    if (
      input.planDigest !== compiled.planDigest
      || input.teamRevision !== compiled.teamRevision
      || input.expectedStateVersion !== 1
    ) {
      return agentTeamError("start", {
        code: "plan_fence_mismatch",
        message: "Plan id, digest, team revision, or planned state version is stale.",
      }, planContext);
    }
    if (existing && !["queued", "running"].includes(existing.state)) {
      return agentTeamError("start", {
        code: "start_replay_snapshot_unavailable",
        message: "The prior start settled without an exact recorded response; it will not be re-executed.",
      }, contextForState(existing));
    }
    const adapter = executionAdapter();
    if (!adapter) {
      return agentTeamError("start", {
        code: "execution_adapter_unavailable",
        message: "No configured host-owned Agent Orchestration execution adapter is available.",
      }, planContext);
    }
    if (
      existing
      && (
        existing.adapterId !== configuredAdapterId
        || existing.adapterRevision !== adapter.revision
      )
    ) {
      return agentTeamError("start", {
        code: "execution_adapter_fence_mismatch",
        message: "The exact persisted execution adapter is unavailable.",
      }, contextForState(existing));
    }
    try {
      await planResolver.revalidate(compiled);
    } catch (error) {
      return agentTeamError("start", error, planContext);
    }
    let created;
    try {
      created = existing
        ? { created: false, state: existing }
        : await store.create({
            plan: compiled,
            idempotencyKey: input.idempotencyKey,
            adapterId: configuredAdapterId,
            adapterRevision: adapter.revision,
          });
      let state = await execute(created.state.runId, signal);
      if (state.state === "running") {
        const latest = await store.read(state.runId);
        if (latest.startReceipt?.snapshot) {
          return publicAgentTeamStartSnapshot(latest, latest.startReceipt.snapshot);
        }
        if (latest.state === "running") {
          return agentTeamError("start", {
            code: "start_in_progress",
            message: "Another durable supervisor owns the unsettled start execution.",
          }, contextForState(latest));
        }
        state = latest;
      }
      const recorded = await recordStartReceipt(state);
      return publicAgentTeamStartSnapshot(recorded, recorded.startReceipt.snapshot);
    } catch (error) {
      return agentTeamError("start", error, created?.state ? contextForState(created.state) : planContext);
    }
  }

  async function list(input = {}) {
    if (!validateListInputSchema(input)) return schemaError("list", validateListInputSchema);
    try {
      const states = await store.list(input);
      return publicAgentTeamList(states, { includeCompletedResult: Boolean(input.runId) });
    } catch (error) {
      return agentTeamError("list", error);
    }
  }

  const handleControl = createAgentTeamControlHandler({
    store,
    controlAuthorizer,
    reviewReceiptVerifier,
    executionAdapter,
    configuredAdapterId,
    planResolver,
    activeControllers,
    execute,
    nowMs,
  });
  const control = (input, options) => (
    validateControlInputSchema(input)
      ? handleControl(input, options)
      : schemaError("control", validateControlInputSchema)
  );

  async function recover() {
    const adapter = executionAdapter();
    const recoverySet = await store.listForRecovery({ states: ["queued", "running"], limit: 200 });
    const candidates = recoverySet.states;
    if (!adapter) return {
      recovered: 0,
      pending: candidates.length,
      corrupt: recoverySet.corrupt,
      adapterAvailable: false,
    };
    let recovered = 0;
    let pending = 0;
    const blockRecoveryCandidate = async (state, code, message) => {
      const blockedAtMs = normalizeAgentTeamTimestamp(nowMs());
      let blocked;
      try {
        blocked = await store.update(state.runId, {
          expectedStateVersion: state.stateVersion,
          eventType: "run.recovery_blocked",
          eventData: { code },
        }, (current) => {
          current.state = "blocked";
          foldAgentTeamActiveInterval(current, blockedAtMs);
          if (current.executionClaim) {
            current.currentBranchId = null;
            current.executionClaim = null;
            current.usage = { ...current.usage, costUsd: null, costStatus: "unreported" };
          }
          current.error = { code, message };
          return current;
        });
      } catch (error) {
        if (error?.code === "state_version_conflict") return false;
        throw error;
      }
      if (blocked && !blocked.startReceipt?.snapshot) {
        await recordStartReceipt(blocked);
      }
      return true;
    };
    for (const state of candidates) {
      if (
        state.executionClaim
        && Number(state.executionClaim.leaseExpiresAt || 0) > nowMs()
      ) {
        pending += 1;
        continue;
      }
      if (
        state.adapterId !== configuredAdapterId
        || state.adapterRevision !== adapter.revision
        || state.usage.costStatus !== "reported"
      ) {
        if (!await blockRecoveryCandidate(
          state,
          "continuation_fence_mismatch",
          "Recovery could not prove the exact adapter and remaining budget fence.",
        )) pending += 1;
        continue;
      }
      try {
        await planResolver.revalidate(state.plan);
      } catch {
        if (!await blockRecoveryCandidate(
          state,
          "continuation_revalidation_failed",
          "Recovery failed exact source, invocation, or owner revalidation.",
        )) pending += 1;
        continue;
      }
      let settled = await execute(state.runId);
      if (settled.stateVersion === state.stateVersion && settled.state === "running") {
        pending += 1;
      } else {
        if (!settled.startReceipt?.snapshot && settled.state !== "running") {
          settled = await recordStartReceipt(settled);
        }
        recovered += 1;
      }
    }
    return { recovered, pending, corrupt: recoverySet.corrupt, adapterAvailable: true };
  }

  return {
    plan,
    start,
    list,
    control,
    recover,
    store,
    configuredAdapterId,
  };
}

export async function runAgentTeamTool(toolName, args, { runtime, signal, ...options } = {}) {
  const owner = runtime || createAgentTeamRuntime(options);
  if (toolName === AGENT_TEAM_TOOL_NAMES.plan) return owner.plan(args);
  if (toolName === AGENT_TEAM_TOOL_NAMES.start) return owner.start(args, { signal });
  if (toolName === AGENT_TEAM_TOOL_NAMES.list) return owner.list(args);
  if (toolName === AGENT_TEAM_TOOL_NAMES.control) return owner.control(args, { signal });
  return agentTeamError("control", { code: "unknown_tool", message: `Unknown agent-team tool: ${toolName}` });
}

export const isAgentTeamToolName = (toolName) => Object.values(AGENT_TEAM_TOOL_NAMES).includes(toolName);
