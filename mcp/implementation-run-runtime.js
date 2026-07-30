import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../canvas/src/features/agent-ready/knowgrphLocalMcpToolNames.mjs";
import { digestImplementationRunSpec, implementationRunIdForKey, ImplementationRunStore } from "./implementation-run-store.js";
import { cleanupManagedProcesses, pidAlive, processMarker } from "./implementation-run-managed-process.js";
import { loadImplementationRunHostConfig, preflightImplementationRun, validateImplementationRunSpec } from "./implementation-run-validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, "implementation-run-supervisor-cli.js");
const TERMINAL_STATES = new Set(["canceled"]);
const CONTROL_ACTIONS = new Set(["pause", "cancel", "retry", "review"]);
const REVIEW_DECISIONS = new Set(["accept", "changes_requested"]);
const RUN_ID = /^ir_[a-f0-9]{24}$/;
const MAX_HEARTBEAT_AGE_MS = 120000;
const MAX_AGGREGATE_LIST_BYTES = 128 * 1024;
const MAX_PLAN_BYTES = 384 * 1024;
const MAX_SPAWN_ENV_BYTES = 256 * 1024;
const RECOVERABLE_STATES = new Set(["queued", "claiming", "provisioning", "running", "verifying"]);
const LIFECYCLE_STATES = new Set([...RECOVERABLE_STATES, "delivery_ready", "paused", "blocked", "failed", "canceled"]);
const requiresAdmissionFinalization = (state) => {
  const receipt = state.result?.agenticSdlcAdmissionObservation;
  return Boolean(
    state.spec?.agenticSdlcLedgerPath
    && (
      state.agenticSdlcAdmissionObservationPending
      || ["pending", "bound"].includes(receipt?.artifactStatus)
    ),
  );
};

const errorPayload = (code, message, details = undefined) => ({
  schema: "knowgrph-implementation-run-result/v1",
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});
const nextAction = (state) => {
  if (state.state === "delivery_ready") return "review the ready pull request; merge and deployment remain manual";
  if (state.state === "canceled") return "none";
  if (state.error?.code === "lease_reactivation_required") return "retry with the current revision for fenced same-session reactivation, or cancel to park";
  if (state.error?.code === "manual_recovery_required") return "preserve and resolve dirty task-worktree changes manually, then retry or cancel";
  if (state.error?.code === "agentic_sdlc_admission_unavailable") return "the lane is parked; land the repository-owned evaluator and authoring evidence contract, then start a new exact-revision run";
  if (["paused", "blocked", "failed"].includes(state.state)) return "retry or cancel using the current revision";
  return "wait, pause, or cancel using the current revision";
};
const publicState = (state) => ({
  schema: "knowgrph-implementation-run-result/v1",
  ok: true,
  runId: state.runId,
  state: state.state,
  revision: state.revision,
  attempt: state.attempt,
  supervisorLaunches: state.supervisorLaunches || 0,
  automaticRestarts: state.automaticRestarts || 0,
  workItem: state.spec?.workItem ? { id: state.spec.workItem.id, objective: state.spec.workItem.objective, acceptance: state.spec.workItem.acceptance } : null,
  nextAction: nextAction(state),
  updatedAt: state.updatedAt,
  containment: state.plan?.containment,
  coordination: state.coordination,
  supervisor: state.supervisor ? { status: state.supervisor.status, epoch: state.supervisor.epoch, heartbeatAt: state.supervisor.heartbeatAt } : null,
  review: state.review,
  result: state.result,
  error: state.error,
});
const clipped = (value, maximum = 512) => typeof value === "string" && value.length > maximum ? `${value.slice(0, maximum)}…` : value;
const publicSummary = (state) => ({
  schema: "knowgrph-implementation-run-result/v1", ok: true, runId: state.runId, state: state.state, revision: state.revision, attempt: state.attempt,
  workItem: state.spec?.workItem ? { id: clipped(state.spec.workItem.id, 120), objective: clipped(state.spec.workItem.objective, 512), acceptanceCount: state.spec.workItem.acceptance?.length || 0 } : null,
  nextAction: nextAction(state), updatedAt: state.updatedAt,
  coordination: state.coordination ? { status: state.coordination.status, branch: clipped(state.coordination.branch, 240), pullRequest: state.coordination.pullRequest ? { number: state.coordination.pullRequest.number, url: clipped(state.coordination.pullRequest.url, 512) } : null, leaseEpoch: state.coordination.lease?.epoch || null } : null,
  supervisor: state.supervisor ? { status: state.supervisor.status, epoch: state.supervisor.epoch, heartbeatAt: state.supervisor.heartbeatAt } : null,
  review: state.review ? { decision: state.review.decision, decidedAt: state.review.decidedAt } : null,
  result: state.result ? { changedPathCount: state.result.changedPaths?.length || 0, verificationCount: state.result.verification?.length || state.result.failureEvidence?.verification?.length || 0, pullRequest: state.result.pullRequest ? { number: state.result.pullRequest.number, url: clipped(state.result.pullRequest.url, 512) } : null, agenticSdlcAdmissionObservation: state.result.agenticSdlcAdmissionObservation || null, automaticMerge: false, deployment: false } : null,
  error: state.error ? { code: clipped(state.error.code, 120), message: clipped(state.error.message, 512) } : null,
});
const sanitizedSupervisorEnvironment = (env, state) => {
  let runnerEnvironment = [];
  let verifierEnvironment = [];
  try {
    const host = loadImplementationRunHostConfig(env);
    const registered = host.runners[state.spec.runnerId];
    const planned = state.plan.runner ? { executable: state.plan.runner.executable, args: state.plan.runner.args, environment: state.plan.runner.environment } : null;
    if (registered && JSON.stringify(registered) === JSON.stringify(planned)) runnerEnvironment = planned.environment;
    for (const verifier of state.plan.verifiers || []) {
      const candidate = host.verifiers[verifier.id];
      const pinned = { executable: verifier.executable, args: verifier.args, environment: verifier.environment, timeoutMs: verifier.timeoutMs, cwd: verifier.cwd };
      if (candidate && JSON.stringify(candidate) === JSON.stringify(pinned)) verifierEnvironment.push(...pinned.environment);
    }
  } catch { /* preflight reports invalid host authority */ }
  const names = [
    "PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "NODE_ENV", "AGENTIC_SESSION_ID",
    "KNOWGRPH_IMPLEMENTATION_RUNNERS_JSON", "KNOWGRPH_IMPLEMENTATION_VERIFIERS_JSON", "KNOWGRPH_IMPLEMENTATION_REPOSITORIES_JSON",
    "KNOWGRPH_IMPLEMENTATION_ACOS_ROOT", "GH_TOKEN", "GITHUB_TOKEN", ...runnerEnvironment, ...verifierEnvironment,
  ];
  return Object.fromEntries([...new Set(names)].filter((name) => typeof env[name] === "string").map((name) => [name, env[name]]));
};

export function createImplementationRunRuntime({ rootDir, env = process.env, spawnImpl = spawn, now = () => new Date(), recoveryIntervalMs = 30000, supportedAcosRevision } = {}) {
  const runtimeRoot = path.resolve(rootDir || process.cwd());
  const store = new ImplementationRunStore({ rootDir: runtimeRoot, now });
  let recoveryPromise = null;
  let recoveryMonitor = null;
  let recoveryCursor = "";

  async function launchSupervisor(runId, { expectedRevision, reason }) {
    const token = crypto.randomUUID();
    let state = await store.read(runId);
    if (Number.isInteger(expectedRevision) && state.revision !== expectedRevision) throw Object.assign(new Error(`Run revision is ${state.revision}, not expected ${expectedRevision}.`), { code: "REVISION_CONFLICT" });
    const launchFence = JSON.stringify({ state: state.state, attempt: state.attempt, control: state.control, retryContext: state.retryContext, coordination: state.coordination, supervisor: state.supervisor });
    const cleanup = await cleanupManagedProcesses(state);
    if (!cleanup.ok) {
      return store.update(runId, { expectedRevision: state.revision, eventType: "supervisor.relaunch_blocked", eventData: { reason, code: cleanup.code } }, (current) => {
        current.state = "blocked";
        current.error = { code: cleanup.code, message: cleanup.message };
        current.supervisor = { ...current.supervisor, token, pid: null, processMarker: null, status: "fenced", heartbeatAt: now().toISOString() };
        return current;
      });
    }
    state = await store.read(runId);
    const currentFence = JSON.stringify({ state: state.state, attempt: state.attempt, control: state.control, retryContext: state.retryContext, coordination: state.coordination, supervisor: state.supervisor });
    if (currentFence !== launchFence) throw Object.assign(new Error("Run ownership changed while managed child cleanup was completing."), { code: "REVISION_CONFLICT" });
    if (cleanup.count) {
      state = await store.update(runId, { expectedRevision: state.revision, eventType: "processes.reconciled", eventData: { reason, count: cleanup.count } }, (current) => {
        current.activeProcesses = {};
        return current;
      });
    }
    const automaticRelaunch = ["unexpected_exit", "server_recovery"].includes(reason);
    if (automaticRelaunch && Number(state.automaticRestarts || 0) >= Number(state.spec.bounds.maxAttempts || 1) * 2) {
      return store.update(runId, { expectedRevision: state.revision, eventType: "supervisor.launch_exhausted", eventData: { reason } }, (current) => {
        current.state = "blocked";
        current.error = { code: "supervisor_launch_limit", message: "The bounded supervisor launch allowance is exhausted before another worker can be started." };
        current.supervisor = { ...current.supervisor, token, pid: null, processMarker: null, status: "fenced", heartbeatAt: now().toISOString() };
        return current;
      });
    }
    state = await store.update(runId, { expectedRevision: state.revision, eventType: "supervisor.fenced", eventData: { reason } }, (current) => {
      current.supervisorLaunches = Number(current.supervisorLaunches || 0) + 1;
      if (automaticRelaunch) current.automaticRestarts = Number(current.automaticRestarts || 0) + 1;
      current.supervisor = {
        pid: null,
        token,
        epoch: Number(current.supervisor?.epoch || 0) + 1,
        status: "launching",
        heartbeatAt: now().toISOString(),
      };
      return current;
    });
    let child;
    let registered = false;
    let exited = false;
    const reconcileExit = async () => {
      const current = await store.read(runId).catch(() => null);
      if (!current || current.supervisor?.token !== token || current.supervisor?.status !== "active") return;
      if (
        current.attempt >= current.spec.bounds.maxAttempts
        && !requiresAdmissionFinalization(current)
      ) {
        await store.update(runId, { expectedRevision: current.revision, eventType: "supervisor.exit_exhausted", eventData: { reason } }, (owned) => {
          if (owned.supervisor?.token !== token) return owned;
          owned.state = "blocked";
          owned.error = { code: "attempt_limit", message: "Supervisor exited unexpectedly and the attempt bound is exhausted." };
          owned.supervisor = { ...owned.supervisor, token: crypto.randomUUID(), pid: null, processMarker: null, status: "fenced", heartbeatAt: now().toISOString() };
          return owned;
        }).catch(() => undefined);
        return;
      }
      await launchSupervisor(runId, { expectedRevision: current.revision, reason: "unexpected_exit" }).catch(() => undefined);
    };
    try {
      const supervisorEnv = sanitizedSupervisorEnvironment(env, state);
      if (Buffer.byteLength(JSON.stringify(supervisorEnv)) > MAX_SPAWN_ENV_BYTES) throw Object.assign(new Error("Supervisor environment exceeds the bounded spawn input."), { code: "PROCESS_INPUT_TOO_LARGE" });
      child = spawnImpl(process.execPath, [WORKER_PATH, "--root", runtimeRoot, "--run", runId, "--token", token], {
        cwd: runtimeRoot,
        detached: true,
        shell: false,
        stdio: ["ignore", "ignore", "ignore"],
        env: supervisorEnv,
        windowsHide: true,
      });
      child.once("exit", () => { exited = true; if (registered) void reconcileExit(); });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Supervisor process did not start within 5 seconds.")), 5000);
        child.once("spawn", () => { clearTimeout(timer); resolve(); });
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
      });
      if (!Number.isInteger(child.pid) || child.pid < 1) throw new Error("Supervisor process has no valid PID.");
      child.unref?.();
      const marker = await processMarker(child.pid);
      state = await store.update(runId, { expectedRevision: state.revision, eventType: "supervisor.launched", eventData: { epoch: state.supervisor.epoch } }, (current) => {
        if (current.supervisor.token !== token) throw Object.assign(new Error("Supervisor token was fenced before launch registration."), { code: "SUPERVISOR_FENCED" });
        current.supervisor.pid = child.pid;
        current.supervisor.processMarker = marker;
        current.supervisor.status = "active";
        current.supervisor.heartbeatAt = now().toISOString();
        return current;
      });
      registered = true;
      if (exited) void reconcileExit();
      return state;
    } catch (error) {
      if (child?.pid) {
        const failedPid = child.pid;
        const failedMarker = await processMarker(failedPid);
        try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM"); } catch { child.kill?.("SIGTERM"); }
        const killTimer = setTimeout(async () => {
          if (child.exitCode !== null || !failedMarker || await processMarker(failedPid) !== failedMarker) return;
          try { process.kill(process.platform === "win32" ? failedPid : -failedPid, "SIGKILL"); } catch { /* already stopped */ }
        }, 2000);
        child.once?.("exit", () => clearTimeout(killTimer));
        killTimer.unref?.();
      }
      const current = await store.read(runId);
      if (current.supervisor?.token !== token) return current;
      state = await store.update(runId, { expectedRevision: current.revision, eventType: "supervisor.launch_failed", eventData: { code: error.code || "launch_failed" } }, (owned) => {
        if (owned.supervisor?.token !== token) throw Object.assign(new Error("Supervisor launch was fenced."), { code: "SUPERVISOR_FENCED" });
        owned.supervisor = { ...owned.supervisor, pid: null, status: "failed", heartbeatAt: now().toISOString() };
        owned.state = "blocked";
        owned.error = { code: "supervisor_launch_failed", message: error.message };
        return owned;
      });
      return state;
    }
  }

  async function plan(raw) {
    const validation = validateImplementationRunSpec(raw);
    if (!validation.ok) return errorPayload("invalid_arguments", "Implementation-run specification is invalid.", validation.errors);
    const preflight = await preflightImplementationRun(validation.spec, { env, supportedAcosRevision });
    const admissionStatus = validation.spec.agenticSdlcLedgerPath
      ? "unevaluated"
      : "not_requested";
    const implementationReady =
      preflight.ok && admissionStatus === "not_requested";
    const result = {
      schema: "knowgrph-implementation-run-plan/v1",
      ok: preflight.ok,
      ready: implementationReady,
      supervisorReady: preflight.ok,
      implementationReady,
      admissionStatus,
      mutation: "none",
      invocation: validation.spec.invocation,
      workItem: validation.spec.workItem,
      sourceRevision: preflight.sourceRevision,
      originUrl: preflight.originUrl,
      originIdentity: preflight.originIdentity,
      acosRevision: preflight.acosRevision,
      supportedAcosRevision: preflight.supportedAcosRevision,
      acosScriptProof: preflight.acosScriptProof,
      derivedWorktreePath: preflight.worktreePath,
      acosSemanticScope: preflight.acosSemanticScope,
      containment: preflight.containment,
      policy: preflight.policy,
      runner: preflight.runner ? { id: validation.spec.runnerId, executable: preflight.runner.executable, args: preflight.runner.args, environment: preflight.runner.environment, shell: false } : null,
      verifiers: preflight.verifiers,
      verifierConfigDigest: preflight.verifierConfigDigest,
      executableProofs: preflight.executableProofs,
      diagnostics: preflight.diagnostics,
      ...(preflight.ok ? { normalizedSpec: validation.spec } : {}),
    };
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_PLAN_BYTES) return errorPayload("plan_too_large", `Implementation-run plan exceeds its ${MAX_PLAN_BYTES}-byte bound.`);
    return result;
  }

  async function start(raw) {
    const validation = validateImplementationRunSpec(raw);
    if (!validation.ok) return errorPayload("invalid_arguments", "Implementation-run specification is invalid.", validation.errors);
    const replayRunId = implementationRunIdForKey(validation.spec.idempotencyKey);
    try {
      const existing = await store.read(replayRunId);
      if (existing.specDigest !== digestImplementationRunSpec(validation.spec)) return errorPayload("IDEMPOTENCY_CONFLICT", "idempotencyKey is already bound to a different implementation-run specification.");
      return { ...publicState(existing), idempotent: true };
    } catch (error) {
      if (error?.code !== "ENOENT") return errorPayload("state_read_failed", error.message);
    }
    const planned = await plan(validation.spec);
    if (!planned.ok) {
      const unsupported = planned.diagnostics?.find((entry) => entry.code === "acos_revision_unsupported");
      return errorPayload(unsupported?.code || "preflight_failed", "Implementation-run preflight failed without mutation.", planned.diagnostics || planned.error?.details);
    }
    let created;
    try { created = await store.create({ spec: planned.normalizedSpec, plan: { ...planned, normalizedSpec: undefined } }); } catch (error) {
      return errorPayload(error.code || "state_create_failed", error.message);
    }
    if (!created.created) return { ...publicState(created.state), idempotent: true };
    const launched = await launchSupervisor(created.state.runId, { expectedRevision: created.state.revision, reason: "start" });
    return { ...publicState(launched), idempotent: false };
  }

  async function list(args = {}) {
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some((key) => !["runId", "cursor", "states", "limit", "includeEvents"].includes(key))) return errorPayload("invalid_arguments", "List request contains unsupported fields.");
    if (args.runId && !RUN_ID.test(String(args.runId))) return errorPayload("invalid_run_id", "runId is invalid.");
    if (args.cursor && !RUN_ID.test(String(args.cursor))) return errorPayload("invalid_cursor", "cursor is invalid.");
    if (args.runId && args.cursor) return errorPayload("invalid_arguments", "cursor cannot be combined with an exact runId.");
    if (args.states && (!Array.isArray(args.states) || args.states.length > 20 || args.states.some((state) => !LIFECYCLE_STATES.has(state)))) return errorPayload("invalid_states", "states must contain at most 20 known lifecycle states.");
    if (typeof args.limit !== "undefined" && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200)) return errorPayload("invalid_arguments", "limit must be an integer from 1 to 200.");
    if (typeof args.includeEvents !== "undefined" && typeof args.includeEvents !== "boolean") return errorPayload("invalid_arguments", "includeEvents must be boolean.");
    if (args.includeEvents && !args.runId) return errorPayload("invalid_arguments", "includeEvents requires an exact runId.");
    try {
      if (args.runId) {
        const state = await store.read(args.runId);
        const run = args.includeEvents ? { ...publicState(state), events: await store.events(args.runId) } : publicState(state);
        return { schema: "knowgrph-implementation-run-list/v1", ok: true, count: 1, runs: [run], unreadableRunCount: 0, unreadableRuns: [] };
      }
      const page = await store.runIdPage({ afterRunId: args.cursor || "", limit: 500 });
      const unreadableRuns = [];
      let unreadableRunCount = 0;
      const selected = [];
      let matchedCount = 0;
      let lastScanned = args.cursor || "";
      const stateFilter = new Set(args.states || []);
      const resultLimit = args.limit || 50;
      for (const runId of page.runIds) {
        lastScanned = runId;
        try {
          const state = await store.read(runId);
          if (!Number.isFinite(Date.parse(state.updatedAt))) throw Object.assign(new Error("Run updatedAt is invalid."), { code: "invalid_updated_at" });
          if (stateFilter.size && !stateFilter.has(state.state)) continue;
          matchedCount += 1;
          selected.push(publicSummary(state));
          if (selected.length >= resultLimit) break;
        } catch (error) {
          unreadableRunCount += 1;
          if (unreadableRuns.length < 50) unreadableRuns.push({ runId, code: error?.code === "invalid_updated_at" ? "invalid_updated_at" : error?.code === "DURABLE_STATE_TOO_LARGE" ? "state_too_large" : "unreadable_run" });
        }
      }
      const scannedAllPage = lastScanned === page.runIds.at(-1) || page.runIds.length === 0;
      let nextCursor = (!scannedAllPage || page.hasMore) && lastScanned ? lastScanned : null;
      const response = { schema: "knowgrph-implementation-run-list/v1", ok: true, ordering: "run_id_ascending", cursor: args.cursor || null, nextCursor, continuation: nextCursor ? { cursor: nextCursor, reason: "bounded_run_id_page" } : null, count: selected.length, matchedCount, scannedCount: page.runIds.indexOf(lastScanned) + 1, runs: selected, unreadableRunCount, unreadableRuns, discoveryTruncated: Boolean(nextCursor) || unreadableRunCount > unreadableRuns.length, truncated: Boolean(nextCursor) };
      while (response.runs.length && Buffer.byteLength(JSON.stringify(response)) > MAX_AGGREGATE_LIST_BYTES) { response.runs.pop(); response.count = response.runs.length; response.nextCursor = response.runs.at(-1)?.runId || args.cursor || null; response.continuation = response.nextCursor ? { cursor: response.nextCursor, reason: "response_byte_bound" } : null; response.discoveryTruncated = response.truncated = true; }
      return response;
    } catch (error) {
      return errorPayload(error.code === "ENOENT" ? "run_not_found" : "state_read_failed", error.message);
    }
  }

  async function control(args = {}) {
    const keys = Object.keys(args);
    if (keys.some((key) => !["runId", "action", "expectedRevision", "reviewDecision", "note"].includes(key))) return errorPayload("invalid_arguments", "Control request contains unsupported fields.");
    if (!RUN_ID.test(String(args.runId || "")) || !CONTROL_ACTIONS.has(args.action) || !Number.isInteger(args.expectedRevision) || args.expectedRevision < 1) return errorPayload("invalid_arguments", "runId, action, and a positive expectedRevision are required.");
    if ((args.action === "review") !== REVIEW_DECISIONS.has(args.reviewDecision)) return errorPayload("invalid_arguments", "reviewDecision is required only for review and must be accept or changes_requested.");
    if (typeof args.note !== "undefined" && (typeof args.note !== "string" || args.note.length > 2000)) return errorPayload("invalid_arguments", "note must be at most 2000 characters.");
    let next;
    let launchForControl = false;
    let identityBlocked = false;
    try {
      const observed = await store.read(args.runId);
      const observedMarker = await processMarker(observed.supervisor?.pid);
      const supervisorIdentityValid = observed.revision === args.expectedRevision && Boolean(observedMarker) && observedMarker === observed.supervisor?.processMarker && observed.supervisor?.status === "active";
      const liveSupervisorIdentityUnproven = observed.revision === args.expectedRevision && pidAlive(observed.supervisor?.pid) && !supervisorIdentityValid;
      next = await store.update(args.runId, { expectedRevision: args.expectedRevision, eventType: `control.${args.action}`, eventData: { reviewDecision: args.reviewDecision || null } }, (current) => {
        if (args.action !== "review" && liveSupervisorIdentityUnproven) {
          identityBlocked = true;
          current.state = "blocked";
          current.control = null;
          current.error = { code: "supervisor_identity_unproven", message: "The recorded supervisor PID is live but its process identity does not match; control is fenced and automatic relaunch is unsafe." };
          current.supervisor = { ...current.supervisor, token: crypto.randomUUID(), status: "fenced", fencedAt: now().toISOString() };
          return current;
        }
        if (args.action === "retry") {
          if (
            current.error?.code === "agentic_sdlc_admission_unavailable"
          ) {
            throw Object.assign(
              new Error(
                "Retry cannot resolve unavailable Agentic SDLC admission; start a new exact-revision run after the evaluator and authoring evidence contract land.",
              ),
              { code: "NEW_RUN_REQUIRED" },
            );
          }
          if (["pause", "cancel"].includes(current.result?.controlDispositionPending)) {
            current.state = "queued";
            current.control = { action: current.result.controlDispositionPending, requestedAt: now().toISOString(), requestId: crypto.randomUUID() };
            current.error = null;
            return current;
          }
          if (!["paused", "blocked", "failed"].includes(current.state)) throw Object.assign(new Error(`retry is unavailable from ${current.state}.`), { code: "INVALID_TRANSITION" });
          if (current.attempt >= current.spec.bounds.maxAttempts && !requiresAdmissionFinalization(current)) throw Object.assign(new Error("Retry attempt bound is exhausted."), { code: "ATTEMPT_LIMIT" });
          current.retryContext = { fromErrorCode: current.error?.code || null, requestedAt: now().toISOString() };
          current.state = "queued";
          current.control = null;
          current.error = null;
          current.review = { decision: "pending", note: "", decidedAt: null };
          return current;
        }
        if (current.result?.controlDispositionPending) throw Object.assign(new Error("A review-time control disposition is already being applied."), { code: "INVALID_TRANSITION" });
        if (args.action === "review") {
          if (current.state !== "delivery_ready") throw Object.assign(new Error("review requires delivery_ready state."), { code: "INVALID_TRANSITION" });
          current.review = { decision: args.reviewDecision, note: String(args.note || ""), decidedAt: now().toISOString() };
          if (args.reviewDecision === "changes_requested") {
            current.state = "queued";
            current.control = { action: "pause", requestedAt: now().toISOString(), requestId: crypto.randomUUID() };
            current.result = { ...(current.result || {}), controlDispositionPending: "pause" };
            launchForControl = true;
          }
          return current;
        }
        if (current.state === "delivery_ready" && args.action !== "cancel") throw Object.assign(new Error(`${args.action} is unavailable from delivery_ready.`), { code: "INVALID_TRANSITION" });
        if (TERMINAL_STATES.has(current.state)) throw Object.assign(new Error(`${args.action} is unavailable from ${current.state}.`), { code: "INVALID_TRANSITION" });
        if (args.action === "pause" && !RECOVERABLE_STATES.has(current.state)) throw Object.assign(new Error(`pause is unavailable from ${current.state}.`), { code: "INVALID_TRANSITION" });
        if (args.action === "cancel" && !RECOVERABLE_STATES.has(current.state)) {
          if (["parked", "not_created"].includes(current.coordination?.status)) {
            current.state = "canceled";
            current.control = null;
            current.error = { code: "operator_cancel", message: "Run canceled after coordination was safely parked." };
            return current;
          }
          if (current.state === "delivery_ready" && current.coordination?.status === "review_ready") {
            current.state = "queued";
            current.result = { ...(current.result || {}), controlDispositionPending: "cancel" };
          }
          launchForControl = true;
        }
        current.control = { action: args.action, requestedAt: now().toISOString(), requestId: crypto.randomUUID() };
        if (!supervisorIdentityValid) launchForControl = true;
        return current;
      });
      if (identityBlocked) return publicState(next);
      if (args.action === "retry") next = await launchSupervisor(args.runId, { expectedRevision: next.revision, reason: "retry" });
      else if (launchForControl) next = await launchSupervisor(args.runId, { expectedRevision: next.revision, reason: `control_${args.action}` });
      return publicState(next);
    } catch (error) {
      return errorPayload(error.code || "control_failed", error.message);
    }
  }

  async function recoverOnce() {
    const recovered = [];
    const page = await store.runIdPage({ afterRunId: recoveryCursor, limit: 200 });
    for (const runId of page.runIds) {
      try {
      const state = await store.read(runId);
      if (!RECOVERABLE_STATES.has(state.state)) continue;
      const heartbeatAge = now().getTime() - Date.parse(state.supervisor?.heartbeatAt || 0);
      const alive = pidAlive(state.supervisor?.pid);
      const marker = alive ? await processMarker(state.supervisor.pid) : "";
      const identityMatches = Boolean(marker && marker === state.supervisor?.processMarker);
      if (alive && identityMatches && heartbeatAge <= MAX_HEARTBEAT_AGE_MS) continue;
      if (alive) {
        const blocked = await store.update(state.runId, { expectedRevision: state.revision, eventType: "recovery.blocked", eventData: { reason: "live_pid_stale_heartbeat" } }, (current) => {
          current.supervisor = { ...current.supervisor, token: crypto.randomUUID(), status: "fenced", fencedAt: now().toISOString() };
          current.state = "blocked";
          current.error = { code: "supervisor_unresponsive", message: identityMatches ? "Supervisor process identity is valid but its token-bound heartbeat is stale; automatic replacement is unsafe." : "Supervisor PID identity cannot be proven; automatic replacement is unsafe." };
          return current;
        });
        recovered.push(publicState(blocked));
      } else if (
        state.attempt < state.spec.bounds.maxAttempts
        || requiresAdmissionFinalization(state)
      ) {
        recovered.push(publicState(await launchSupervisor(state.runId, { expectedRevision: state.revision, reason: "server_recovery" })));
      } else {
        const blocked = await store.update(state.runId, { expectedRevision: state.revision, eventType: "recovery.exhausted" }, (current) => {
          current.supervisor = { ...current.supervisor, token: crypto.randomUUID(), status: "fenced", fencedAt: now().toISOString() };
          current.state = "blocked";
          current.error = { code: "attempt_limit", message: "Supervisor recovery attempt bound is exhausted." };
          return current;
        });
        recovered.push(publicState(blocked));
      }
      } catch {
        continue;
      }
    }
    recoveryCursor = page.hasMore ? page.runIds.at(-1) : "";
    return recovered;
  }

  async function recover() {
    if (!recoveryPromise) recoveryPromise = recoverOnce().finally(() => { recoveryPromise = null; });
    const result = await recoveryPromise;
    if (!recoveryMonitor && Number.isInteger(recoveryIntervalMs) && recoveryIntervalMs >= 25) {
      recoveryMonitor = setInterval(() => { void recover().catch(() => undefined); }, recoveryIntervalMs);
      recoveryMonitor.unref?.();
    }
    return result;
  }

  function stopMonitoring() {
    if (recoveryMonitor) clearInterval(recoveryMonitor);
    recoveryMonitor = null;
  }

  return { plan, start, list, control, recover, stopMonitoring, store };
}

export async function runImplementationRunTool(toolName, args, options = {}) {
  const runtime = options.runtime || createImplementationRunRuntime(options);
  if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunPlan) return runtime.plan(args);
  if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunStart) return runtime.start(args);
  if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunList) return runtime.list(args);
  if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunControl) return runtime.control(args);
  return errorPayload("unknown_tool", `Unknown implementation-run tool: ${toolName}`);
}

export const isImplementationRunToolName = (toolName) => [
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunPlan,
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunStart,
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunList,
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES.implementationRunControl,
].includes(toolName);
