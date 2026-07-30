import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { execExact } from "./implementation-run-command.js";
import { ImplementationRunStore } from "./implementation-run-store.js";
import { redactEvidence, writeEvidenceArtifact } from "./implementation-run-evidence.js";
import { assertExecutableProof, assertFileProof, executableProof, runManagedProcess } from "./implementation-run-managed-process.js";
import { assertPinnedImplementationRunPolicy, digestVerifierProfiles, loadImplementationRunCoordinationConfig, loadImplementationRunHostConfig } from "./implementation-run-validation.js";
import { AGENTIC_DEVICE_RESULT_SCHEMA, buildAgenticDeviceCommand, parseAgenticDeviceFailure, parseAgenticDeviceResult } from "./implementation-run-acos-adapter.js";
import { bindImplementationRunAdmissionObservation, implementationRunAdmissionResultFields, reconcileImplementationRunAdmissionObservation, settleImplementationRunAdmissionUnavailable } from "./implementation-run-admission-evidence.js";
import { agenticSdlcLedgerResultFields, agenticSdlcRunnerRequestFields, bindAgenticSdlcLedger } from "./implementation-run-agentic-sdlc-ledger.js";
const ACOS_SCHEMA = AGENTIC_DEVICE_RESULT_SCHEMA;
const MAX_INLINE_VERIFICATION_EVIDENCE_BYTES = 32768;
const MAX_CHANGED_PATHS = 1000;
const MAX_CHANGED_PATH_BYTES = 128 * 1024;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const withinAllowed = (candidate, allowedPaths) => allowedPaths.some((allowed) => candidate === allowed || candidate.startsWith(`${allowed}/`));
const pathExists = async (candidate) => { try { await fs.lstat(candidate); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } };

function safeEnvironment(source, names) {
  const baseline = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "NODE_ENV"];
  return Object.fromEntries([...new Set([...baseline, ...names])].filter((name) => typeof source[name] === "string").map((name) => [name, source[name]]));
}

const redactOutput = (value, secrets, maximumBytes) => redactEvidence(value, secrets, maximumBytes).content;

export function createImplementationRunSupervisor({ rootDir, runId, token, env = process.env, spawnImpl = spawn, acosInvoker = null, admissionBinder = bindImplementationRunAdmissionObservation, now = () => new Date() }) {
  const store = new ImplementationRunStore({ rootDir, now });
  let stopped = false;
  let coordinationHealthy = true;
  let handoffInProgress = false;
  let acosCallTail = Promise.resolve();
  let wakeHeartbeat = null;
  let attemptDeadline = Number.POSITIVE_INFINITY;
  const remainingBudget = (ceiling = Number.POSITIVE_INFINITY) => {
    const remaining = attemptDeadline - Date.now();
    if (remaining <= 0) throw Object.assign(new Error("Implementation-run attempt deadline is exhausted."), { code: "ATTEMPT_TIMEOUT" });
    return Math.max(1, Math.min(ceiling, remaining));
  };

  async function ownedUpdate(eventType, eventData, mutate) {
    return store.update(runId, { eventType, eventData }, (current) => {
      if (current.supervisor?.token !== token) throw Object.assign(new Error("Supervisor ownership was fenced."), { code: "SUPERVISOR_FENCED" });
      const next = mutate(current);
      next.supervisor.heartbeatAt = now().toISOString();
      return next;
    });
  }

  async function callAcosNow(state, action, positional = "", repository = state.spec.repoRoot, options = {}) {
    const host = loadImplementationRunCoordinationConfig(env);
    const [trustedRoot, suppliedRoot] = await Promise.all([fs.realpath(host.agenticCanvasOsRoot), fs.realpath(state.spec.agenticCanvasOsRoot)]);
    if (trustedRoot !== suppliedRoot) throw new Error("Stored ACOS root does not match trusted host authority.");
    await assertAcosCommandAuthority(state, trustedRoot);
    await assertTargetOrigin(state);
    const script = path.join(state.spec.agenticCanvasOsRoot, "scripts", "device-branch.mjs");
    const sessionId = `knowgrph-${runId}`;
    const statuses = { start: "active", resume: "active", heartbeat: "active", review: "review_ready", park: "parked" };
    const provision = action === "start" ? options.provision !== false : false;
    let parsed;
    if (acosInvoker) {
      const injected = await acosInvoker({ state, action, positional, repository, sessionId, provision });
      parsed = parseAgenticDeviceResult(JSON.stringify(injected), { action, expectedStatus: statuses[action], sessionId, expectedProvisioned: action === "start" ? provision : undefined });
    } else {
      const argv = buildAgenticDeviceCommand({ scriptPath: script, action, positional, sessionId, repository, worktreePath: state.plan.derivedWorktreePath, leaseTtlSeconds: state.spec.bounds.leaseTtlSeconds, provision });
      const result = await runManagedProcess({
        store, rootDir, runId, token, phase: `acos:${action}`, executable: process.execPath, argv,
        cwd: state.spec.agenticCanvasOsRoot,
        env: { ...safeEnvironment(env, ["GH_TOKEN", "GITHUB_TOKEN"]), AGENTIC_SESSION_ID: sessionId },
        timeoutMs: action === "park" ? 300000 : remainingBudget(300000),
        maxOutputBytes: 65536,
        proof: await executableProof(process.execPath), spawnImpl,
      });
      if (!result.ok) {
        const machineError = parseAgenticDeviceFailure(result.stdout, action);
        const failure = new Error(machineError?.error?.message || `ACOS ${action} failed: ${redactOutput(result.stderr || result.message, Object.values(env), 2000)}`);
        failure.code = machineError?.error?.code || "ACOS_COMMAND_FAILED";
        failure.acosResult = machineError;
        throw failure;
      }
      parsed = parseAgenticDeviceResult(result.stdout, { action, expectedStatus: statuses[action], sessionId, expectedProvisioned: action === "start" ? provision : undefined });
    }
    if (!parsed.branch.endsWith(`/${state.plan.acosSemanticScope}`)) throw new Error("ACOS returned a branch outside the run-owned semantic scope.");
    return parsed;
  }

  function callAcos(...args) {
    const invoke = () => callAcosNow(...args);
    const pending = acosCallTail.then(invoke, invoke);
    acosCallTail = pending.catch(() => undefined);
    return pending;
  }

  function assertContinuation(previous, next) {
    if (next.branch !== previous.coordination.branch || path.resolve(next.worktreePath) !== path.resolve(previous.coordination.worktreePath) || next.pullRequest?.url !== previous.coordination.pullRequest?.url || Number(next.lease?.epoch || 0) < Number(previous.coordination.lease?.epoch || 0)) {
      throw new Error("Reconciled ACOS ownership does not match the stored branch, worktree, pull request, or lease epoch.");
    }
    return next;
  }

  async function resumeCoordination(state) {
    try {
      const active = await callAcos(state, "heartbeat", "", state.coordination.worktreePath);
      return assertContinuation(state, active);
    } catch (heartbeatError) {
      try {
        const resumed = await callAcos(state, "resume", state.coordination.branch, state.coordination.worktreePath);
        return assertContinuation(state, resumed);
      } catch (resumeError) {
        try {
          const active = await callAcos(state, "heartbeat", "", state.coordination.worktreePath);
          return assertContinuation(state, active);
        } catch (reconcileError) {
          resumeError.message = `ACOS ownership is neither a provable same-session active lease nor resumable handoff. heartbeat: ${heartbeatError.message}; resume: ${resumeError.message}; reconciliation: ${reconcileError.message}`;
          throw resumeError;
        }
      }
    }
  }

  async function reactivateExpiredCoordination(state) {
    try {
      const active = await callAcos(state, "heartbeat", "", state.coordination.worktreePath);
      return assertContinuation(state, active);
    } catch {
      try {
        const resumed = await callAcos(state, "resume", state.coordination.branch, state.coordination.worktreePath);
        return assertContinuation(state, resumed);
      } catch (resumeError) {
        try {
          const active = await callAcos(state, "heartbeat", "", state.coordination.worktreePath);
          return assertContinuation(state, active);
        } catch {
          const clean = await execExact("git", ["-C", state.coordination.worktreePath, "status", "--porcelain"], { cwd: state.coordination.worktreePath, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
          if (!clean.ok || clean.stdout.trim()) throw Object.assign(new Error("Expired lease reactivation requires a clean task worktree; preserve and resolve partial work manually or cancel instead of auto-parking it."), { code: "MANUAL_RECOVERY_REQUIRED" });
          const parked = assertContinuation(state, await callAcos(state, "park", "", state.coordination.worktreePath));
          const parkedState = { ...state, coordination: parked };
          try {
            const resumed = await callAcos(parkedState, "resume", parked.branch, parked.worktreePath);
            return assertContinuation(parkedState, resumed);
          } catch (error) {
            error.message = `Expired same-session lease was safely parked but its resume could not be proven: ${error.message}; prior resume: ${resumeError.message}`;
            throw error;
          }
        }
      }
    }
  }

  async function reconcileClaiming(state) {
    try { return await callAcos(state, "heartbeat", "", state.plan.derivedWorktreePath); } catch {
      return callAcos(state, "start", state.plan.acosSemanticScope, state.plan.derivedWorktreePath, { provision: false });
    }
  }

  async function heartbeat() {
    while (!stopped) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => { wakeHeartbeat = null; resolve(); }, 30000);
        wakeHeartbeat = () => { clearTimeout(timer); wakeHeartbeat = null; resolve(); };
      });
      if (stopped) return;
      if (handoffInProgress) continue;
      let state = await store.read(runId);
      if (state.supervisor?.token !== token) return;
      try {
        if (state.coordination?.lease?.status === "active" && ["claiming", "provisioning", "running", "verifying"].includes(state.state)) {
          const result = await callAcos(state, "heartbeat", "", state.coordination.worktreePath);
          state = await ownedUpdate("coordination.heartbeat", { leaseEpoch: result.lease.epoch }, (current) => {
            const activePhase = ["claiming", "provisioning", "running", "verifying"].includes(current.state);
            const currentEpoch = Number(current.coordination?.lease?.epoch || 0);
            if (handoffInProgress || !activePhase || current.coordination?.status !== "active" || currentEpoch > Number(result.lease?.epoch || 0)) return current;
            current.coordination = result;
            return current;
          });
        } else {
          await ownedUpdate("supervisor.heartbeat", {}, (current) => current);
        }
      } catch (error) {
        coordinationHealthy = false;
        await ownedUpdate("supervisor.heartbeat_failed", { message: error.message }, (current) => {
          current.error = { code: "heartbeat_failed", message: error.message };
          return current;
        }).catch(() => undefined);
      }
    }
  }

  async function park(state) {
    if (!state.coordination?.worktreePath) return { ok: true, action: "park", status: "not_created", worktreePath: state.plan.derivedWorktreePath };
    let exists;
    try { await fs.lstat(state.coordination.worktreePath); exists = true; } catch (error) {
      if (error?.code === "ENOENT") exists = false;
      else return { schema: ACOS_SCHEMA, ok: false, action: "park", status: "error", error: { code: "worktree_probe_failed", message: error.message } };
    }
    if (!exists) return state.coordination?.branch || state.coordination?.lease ? { schema: ACOS_SCHEMA, ok: false, action: "park", status: "error", error: { code: "owned_worktree_missing", message: "The owned task worktree disappeared before its remote lease and draft pull request could be proven parked." } } : { ok: true, action: "park", status: "not_created", worktreePath: state.coordination.worktreePath };
    try { return await callAcos(state, "park", "", state.coordination.worktreePath); } catch (firstError) {
      try { return await callAcos(state, "park", "", state.coordination.worktreePath); } catch (error) {
        return { schema: ACOS_SCHEMA, ok: false, action: "park", status: "error", error: { code: "park_failed", message: `${firstError.message}; replay: ${error.message}` } };
      }
    }
  }

  async function fail(stateName, code, message, state, evidence = null) {
    const parked = ["paused", "canceled"].includes(stateName) ? await park(state) : null;
    return ownedUpdate("run.failed", { code, parked: parked?.ok === true, ...(evidence ? { evidence } : {}) }, (current) => {
      const cleanupOk = !["paused", "canceled"].includes(stateName) || parked?.ok === true;
      current.state = cleanupOk ? stateName : "blocked";
      current.error = cleanupOk ? { code, message } : { code: "coordination_cleanup_failed", message: `${message} Cleanup also failed: ${parked?.error?.message || "unknown park failure"}` };
      current.result = { ...(current.result || {}), ...(parked ? { parked } : {}), ...(evidence ? { failureEvidence: evidence } : {}) };
      if (current.result) current.result.controlDispositionPending = null;
      if (parked?.ok === true) current.coordination = parked;
      current.supervisor.status = "stopped";
      return current;
    });
  }

  async function runChild(state, runner, requestPath, outputArtifact) {
    const replacements = { "{{requestPath}}": requestPath, "{{workspacePath}}": state.coordination.worktreePath, "{{runId}}": runId };
    const argv = runner.args.map((argument) => Object.entries(replacements).reduce((value, [placeholder, replacement]) => value.split(placeholder).join(replacement), argument));
    const childEnv = { ...safeEnvironment(env, runner.environment), AGENTIC_SESSION_ID: `knowgrph-${runId}` };
    const secrets = runner.environment.map((name) => String(env[name] || "")).filter(Boolean);
    const outcome = await runManagedProcess({
      store, rootDir, runId, token, phase: "runner", executable: runner.executable, argv,
      cwd: state.coordination.worktreePath, env: childEnv, timeoutMs: remainingBudget(state.spec.bounds.maxRuntimeMs),
      maxOutputBytes: state.spec.bounds.maxOutputBytes, proof: state.plan.executableProofs.find((entry) => entry.role === "runner"), spawnImpl,
      shouldContinue: async () => {
      const latest = await store.read(runId).catch(() => null);
        return Boolean(latest) && latest.supervisor?.token === token && coordinationHealthy && !["pause", "cancel"].includes(latest.control?.action);
      },
    });
    const log = redactEvidence(`stdout: ${outcome.stdout}\nstderr: ${outcome.stderr}`, secrets, state.spec.bounds.maxOutputBytes);
    const receipt = await writeEvidenceArtifact({ store, runId, fileName: outputArtifact, content: log.content, supervisorToken: token, truncated: outcome.outputTruncated || log.truncated });
    return { ...outcome, outputBytes: receipt.bytes, outputTruncated: receipt.truncated, outputReceipt: receipt };
  }

  async function runVerification(state, verifier, proof) {
    return runManagedProcess({
      store, rootDir, runId, token, phase: proof.role, executable: verifier.executable, argv: verifier.args, cwd: state.coordination.worktreePath,
      env: safeEnvironment(env, verifier.environment), timeoutMs: remainingBudget(verifier.timeoutMs), maxOutputBytes: state.spec.bounds.maxOutputBytes, proof, spawnImpl,
      shouldContinue: async () => {
        const latest = await store.read(runId).catch(() => null);
        return Boolean(latest) && latest.supervisor?.token === token && coordinationHealthy && !["pause", "cancel"].includes(latest.control?.action);
      },
    });
  }

  async function changedPaths(state) {
    const worktree = state.coordination.worktreePath;
    const baseSha = state.coordination.lease.baseSha;
    const tracked = await execExact("git", ["-C", worktree, "diff", "--name-only", baseSha, "--"], { cwd: worktree, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
    const untracked = await execExact("git", ["-C", worktree, "ls-files", "--others", "--exclude-standard"], { cwd: worktree, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
    if (!tracked.ok || !untracked.ok) throw new Error("Unable to inspect implementation-run changed paths.");
    const paths = [...new Set(`${tracked.stdout}\n${untracked.stdout}`.split(/\r?\n/).map((entry) => entry.trim().replaceAll("\\", "/")).filter(Boolean))].sort();
    if (paths.length > MAX_CHANGED_PATHS || Buffer.byteLength(JSON.stringify(paths)) > MAX_CHANGED_PATH_BYTES) throw new Error("Implementation-run changed-path evidence exceeds its durable count or byte bound.");
    return paths;
  }

  async function assertRemoteFence(state, expectedSha) {
    const result = await execExact("git", ["-C", state.coordination.worktreePath, "ls-remote", "--heads", "origin", `refs/heads/${state.coordination.branch}`], { cwd: state.coordination.worktreePath, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
    const remoteSha = result.stdout.trim().split(/\s+/)[0] || "";
    if (!result.ok || remoteSha !== expectedSha) throw new Error(`Remote branch fence changed unexpectedly (${remoteSha || "missing"}).`);
  }

  async function assertCanonicalUnchanged(state) {
    const checks = await Promise.all([
      execExact("git", ["-C", state.spec.repoRoot, "branch", "--show-current"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", state.spec.repoRoot, "rev-parse", "HEAD"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", state.spec.repoRoot, "status", "--porcelain"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", state.spec.repoRoot, "ls-remote", "--heads", "origin", "refs/heads/main"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", state.spec.repoRoot, "remote", "get-url", "--all", "origin"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", state.spec.repoRoot, "remote", "get-url", "--push", "--all", "origin"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
    ]);
    const remoteMain = checks[3].stdout.trim().split(/\s+/)[0] || "";
    const identity = { fetchUrls: checks[4].stdout.trim().split(/\r?\n/).filter(Boolean), pushUrls: checks[5].stdout.trim().split(/\r?\n/).filter(Boolean) };
    if (checks.some((check) => !check.ok) || checks[0].stdout.trim() !== "main" || checks[1].stdout.trim() !== state.plan.sourceRevision || checks[2].stdout.trim() || remoteMain !== state.plan.sourceRevision || JSON.stringify(identity) !== JSON.stringify(state.plan.originIdentity)) throw new Error("Canonical main or origin identity changed during the isolated implementation run.");
  }

  async function assertTargetOrigin(state) {
    const [fetch, push] = await Promise.all([
      execExact("git", ["-C", state.spec.repoRoot, "remote", "get-url", "--all", "origin"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", state.spec.repoRoot, "remote", "get-url", "--push", "--all", "origin"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
    ]);
    const identity = { fetchUrls: fetch.stdout.trim().split(/\r?\n/).filter(Boolean), pushUrls: push.stdout.trim().split(/\r?\n/).filter(Boolean) };
    if (!fetch.ok || !push.ok || JSON.stringify(identity) !== JSON.stringify(state.plan.originIdentity)) throw new Error("Target repository origin identity changed after preflight.");
  }

  async function assertSafeChangedPaths(state, candidates) {
    const workspaceReal = await fs.realpath(state.coordination.worktreePath);
    for (const candidate of candidates) {
      if (!withinAllowed(candidate, state.spec.allowedPaths)) throw new Error(`Changed path is outside allowedPaths: ${candidate}`);
      const absolute = path.resolve(workspaceReal, candidate);
      const lexical = path.relative(workspaceReal, absolute);
      if (!lexical || lexical.startsWith("..") || path.isAbsolute(lexical) || lexical.replaceAll("\\", "/") !== candidate) throw new Error(`Changed path has unsafe lexical identity: ${candidate}`);
      const stat = await fs.lstat(absolute).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
      if (stat?.isSymbolicLink()) throw new Error(`Changed symbolic links are forbidden: ${candidate}`);
      let existingParent = path.dirname(absolute);
      while (existingParent !== workspaceReal && !await pathExists(existingParent)) existingParent = path.dirname(existingParent);
      for (let cursor = existingParent; cursor !== workspaceReal; cursor = path.dirname(cursor)) {
        if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error(`Changed path parent is a symbolic link: ${candidate}`);
      }
      const parentReal = await fs.realpath(existingParent);
      const relative = path.relative(workspaceReal, parentReal);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Changed path parent escapes the worktree: ${candidate}`);
    }
  }

  async function waitForRegistration() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const state = await store.read(runId);
      if (state.supervisor?.token !== token) return false;
      if (state.supervisor?.status === "active" && state.supervisor.pid === process.pid) {
        await ownedUpdate("supervisor.handshake", { epoch: state.supervisor.epoch }, (current) => {
          current.supervisor.handshakeAt = now().toISOString();
          return current;
        });
        return true;
      }
      await sleep(25);
    }
    return false;
  }

  async function assertExecutableMatches(proof) {
    await assertExecutableProof(proof);
  }

  async function assertAcosCommandAuthority(state, trustedRoot) {
    const checks = await Promise.all([
      execExact("git", ["-C", trustedRoot, "branch", "--show-current"], { cwd: trustedRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", trustedRoot, "rev-parse", "HEAD"], { cwd: trustedRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", trustedRoot, "status", "--porcelain"], { cwd: trustedRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
    ]);
    if (checks.some((check) => !check.ok) || checks[0].stdout.trim() !== "main" || checks[1].stdout.trim() !== state.plan.acosRevision || checks[2].stdout.trim()) throw new Error("Trusted ACOS source changed before lifecycle execution.");
    const proof = state.plan.acosScriptProof;
    if (!proof || await fs.realpath(path.join(trustedRoot, "scripts", "device-branch.mjs")) !== proof.path) throw new Error("Trusted ACOS device script identity changed before lifecycle execution.");
    await assertFileProof(proof);
  }

  async function assertCoordinationAuthority(state) {
    const host = loadImplementationRunCoordinationConfig(env);
    const [trustedAcos, storedAcos, repoReal, worktreeRootReal] = await Promise.all([
      fs.realpath(host.agenticCanvasOsRoot), fs.realpath(state.spec.agenticCanvasOsRoot), fs.realpath(state.spec.repoRoot), fs.realpath(state.spec.worktreeRoot),
    ]);
    if (trustedAcos !== storedAcos) throw new Error("Stored ACOS root no longer matches trusted host configuration.");
    if (!host.repositories.some((entry) => path.resolve(entry.repoRoot) === state.spec.repoRoot && path.resolve(entry.worktreeRoot) === state.spec.worktreeRoot)) throw new Error("Stored repository identity is no longer registered by the host.");
    const registered = host.repositories.find((entry) => path.resolve(entry.repoRoot) === state.spec.repoRoot && path.resolve(entry.worktreeRoot) === state.spec.worktreeRoot);
    const [registeredRepoReal, registeredWorktreeReal] = await Promise.all([fs.realpath(registered.repoRoot), fs.realpath(registered.worktreeRoot)]);
    if (repoReal !== registeredRepoReal || worktreeRootReal !== registeredWorktreeReal) throw new Error("Stored repository or worktree root no longer matches trusted real paths.");
    const acosChecks = await Promise.all([
      execExact("git", ["-C", trustedAcos, "branch", "--show-current"], { cwd: trustedAcos, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", trustedAcos, "rev-parse", "HEAD"], { cwd: trustedAcos, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
      execExact("git", ["-C", trustedAcos, "status", "--porcelain"], { cwd: trustedAcos, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 }),
    ]);
    if (acosChecks.some((check) => !check.ok) || acosChecks[0].stdout.trim() !== "main" || acosChecks[1].stdout.trim() !== state.plan.acosRevision || acosChecks[2].stdout.trim()) throw new Error("Trusted ACOS root changed after preflight.");
  }

  async function assertExecutionAuthority(state) {
    const host = loadImplementationRunHostConfig(env);
    for (const proof of state.plan.executableProofs || []) await assertExecutableMatches(proof);
    const registeredRunner = host.runners[state.spec.runnerId];
    const runnerPath = registeredRunner ? await fs.realpath(registeredRunner.executable) : "";
    if (!registeredRunner || runnerPath !== state.plan.runner?.executable || JSON.stringify(registeredRunner.args) !== JSON.stringify(state.plan.runner.args) || JSON.stringify(registeredRunner.environment) !== JSON.stringify(state.plan.runner.environment)) throw new Error("Registered runner configuration changed after preflight.");
    const verifiers = [];
    for (const requested of state.spec.verification) {
      const registered = host.verifiers[requested.profileId];
      if (!registered) throw new Error(`Registered verifier profile disappeared after preflight: ${requested.profileId}`);
      verifiers.push({ id: requested.profileId, ...registered, executable: await fs.realpath(registered.executable) });
    }
    if (JSON.stringify(verifiers) !== JSON.stringify(state.plan.verifiers) || digestVerifierProfiles(verifiers) !== state.plan.verifierConfigDigest) throw new Error("Registered verifier configuration changed after preflight.");
    await assertPinnedImplementationRunPolicy(state, state.plan.runner, verifiers);
    return { runner: state.plan.runner, verifiers };
  }

  async function assertAllowedPathRoots(state) {
    const workspaceReal = await fs.realpath(state.coordination.worktreePath);
    const workspaceStat = await fs.lstat(state.coordination.worktreePath);
    if (workspaceStat.isSymbolicLink()) throw new Error("Provisioned task worktree identity is unsafe.");
    const registry = await execExact("git", ["-C", state.spec.repoRoot, "worktree", "list", "--porcelain"], { cwd: state.spec.repoRoot, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
    if (!registry.ok || !registry.stdout.split(/\n\n+/).some((entry) => entry.includes(`worktree ${workspaceReal}\n`) && entry.includes(`branch refs/heads/${state.coordination.branch}`))) throw new Error("Provisioned task worktree is not registered on the expected branch.");
    for (const allowed of state.spec.allowedPaths) {
      let current = workspaceReal;
      for (const part of allowed.split("/")) {
        current = path.join(current, part);
        const stat = await fs.lstat(current).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
        if (!stat) break;
        if (stat.isSymbolicLink()) throw new Error(`allowedPaths contains a symbolic-link component in the task worktree: ${allowed}`);
      }
    }
  }

  async function settleReviewResult(review) {
    let current = await ownedUpdate("coordination.review_settled", { pullRequestUrl: review.pullRequest.url }, (state) => {
      const candidate = state.result || {};
      const disposition = state.control?.action;
      state.coordination = review;
      state.coordinationIntent = null;
      state.result = { ...candidate, pullRequest: review.pullRequest, handoffPending: false, automaticMerge: false, deployment: false };
      if (disposition === "pause" || disposition === "cancel") {
        state.state = "queued";
        state.result.controlDispositionPending = disposition;
      } else {
        state.state = "delivery_ready";
        state.error = null;
        state.supervisor.status = "stopped";
      }
      return state;
    });
    if (["pause", "cancel"].includes(current.result?.controlDispositionPending)) {
      const disposition = current.result.controlDispositionPending;
      const resumed = await resumeCoordination(current);
      current = await ownedUpdate(`coordination.resumed_for_${disposition}`, {}, (state) => { state.coordination = resumed; return state; });
      return fail(disposition === "pause" ? "paused" : "canceled", `operator_${disposition}`, `Review-time ${disposition} was applied only after the PR handoff was resumed into an active draft lane.`, current);
    }
    return current;
  }

  async function execute() {
    let state = await store.read(runId);
    if (state.supervisor?.token !== token) return;
    try {
      attemptDeadline = Date.now() + state.spec.bounds.maxRuntimeMs;
      const pendingControl = state.control?.action;
      if (pendingControl === "cancel" && !state.coordination?.branch && !await pathExists(state.plan.derivedWorktreePath)) return fail("canceled", "operator_cancel", "Run cancel request applied before coordination existed.", state);
      await assertCoordinationAuthority(state);
      state = await reconcileImplementationRunAdmissionObservation({ state, store, runId, supervisorToken: token, updateOwned: ownedUpdate });
      if (state.coordinationIntent?.action === "review") {
        handoffInProgress = true;
        const review = await callAcos(state, "review", "", state.coordination.worktreePath);
        return settleReviewResult(review);
      }
      if (pendingControl === "pause" || pendingControl === "cancel") {
        if (state.coordination?.status === "review_ready") {
          const resumed = await resumeCoordination(state);
          state = await ownedUpdate("coordination.resumed_for_control", {}, (current) => { current.coordination = resumed; return current; });
        } else if (state.coordination?.status === "claiming" && await pathExists(state.plan.derivedWorktreePath)) {
          const reconciled = await reconcileClaiming(state);
          state = await ownedUpdate("coordination.reconciled_for_control", {}, (current) => { current.coordination = reconciled; return current; });
        }
        return fail(pendingControl === "pause" ? "paused" : "canceled", `operator_${pendingControl}`, `Run ${pendingControl} request applied.`, state);
      }
      const authority = await assertExecutionAuthority(state);
      const runner = authority.runner;
      state = await ownedUpdate("run.claiming", { attempt: state.attempt + 1 }, (current) => {
        current.state = "claiming";
        current.attempt += 1;
        current.error = null;
        current.coordination ||= { status: "claiming", worktreePath: current.plan.derivedWorktreePath };
        return current;
      });
      await assertCanonicalUnchanged(state);
      let coordination;
      const previousCoordination = state.coordination;
      const firstClaim = !previousCoordination?.branch;
      if (state.coordination?.branch && state.coordination?.status === "review_ready") {
        coordination = await resumeCoordination(state);
      } else if (state.coordination?.branch && state.coordination?.status === "parked") {
        coordination = await resumeCoordination(state);
      } else if (state.coordination?.branch && state.coordination?.status === "active") {
        try {
          coordination = state.retryContext?.fromErrorCode === "lease_reactivation_required"
            ? await reactivateExpiredCoordination(state)
            : await callAcos(state, "heartbeat", "", state.coordination.worktreePath);
        } catch (error) {
          if (error.code === "MANUAL_RECOVERY_REQUIRED") throw error;
          throw Object.assign(new Error(`Active lease cannot be renewed safely; explicit lease reactivation is required. ${error.message}`), { code: "LEASE_REACTIVATION_REQUIRED", acosResult: error.acosResult });
        }
      } else if (await pathExists(state.plan.derivedWorktreePath)) {
        coordination = await reconcileClaiming(state);
      } else if (!state.coordination?.branch) {
        coordination = await callAcos(state, "start", state.plan.acosSemanticScope, state.spec.repoRoot);
      } else {
        throw new Error(`Unsupported coordination recovery status: ${state.coordination.status || "unknown"}`);
      }
      if (path.resolve(coordination.worktreePath) !== path.resolve(state.plan.derivedWorktreePath)) throw new Error("ACOS coordination worktree does not match the plan.");
      if (firstClaim && coordination.lease?.baseSha !== state.plan.sourceRevision) throw new Error("ACOS initial claim base does not match the planned source revision.");
      if (!firstClaim && previousCoordination?.branch && (coordination.branch !== previousCoordination.branch || coordination.pullRequest?.url !== previousCoordination.pullRequest?.url || !coordination.lease?.fenceSha || Number(coordination.lease?.epoch || 0) < Number(previousCoordination.lease?.epoch || 0))) throw new Error("ACOS resumed coordination identity failed branch, pull-request, epoch, or fence validation.");
      state = await ownedUpdate("run.provisioned", { branch: coordination.branch, pullRequestUrl: coordination.pullRequest?.url || null }, (current) => {
        current.state = "provisioning";
        current.coordination = coordination;
        current.retryContext = null;
        return current;
      });
      const control = state.control?.action;
      if (control === "pause" || control === "cancel") return fail(control === "pause" ? "paused" : "canceled", `operator_${control}`, `Run ${control} requested before runner launch.`, state);
      await assertAllowedPathRoots(state);
      await assertRemoteFence(state, state.coordination.lease.fenceSha);
      state = await admissionBinder({ state, store, runId, supervisorToken: token, evaluationTime: state.updatedAt, updateOwned: ownedUpdate });
      const artifactScope = `attempt-${String(state.attempt).padStart(4, "0")}-revision-${String(state.revision).padStart(10, "0")}`;
      const requestReceipt = await writeEvidenceArtifact({ store, runId, fileName: `${artifactScope}-runner-request.json`, content: `${JSON.stringify({
        schema: "knowgrph-implementation-run-request/v1",
        runId,
        invocation: state.spec.invocation,
        workItem: state.spec.workItem,
        workspacePath: state.coordination.worktreePath,
        allowedPaths: state.spec.allowedPaths,
        ...agenticSdlcRunnerRequestFields(state.spec.agenticSdlcLedgerPath),
      }, null, 2)}\n`, supervisorToken: token });
      await assertPinnedImplementationRunPolicy(state, runner, authority.verifiers);
      await assertExecutableMatches(state.plan.executableProofs.find((proof) => proof.role === "runner"));
      state = await ownedUpdate("run.running", { runnerId: state.spec.runnerId, request: { artifact: requestReceipt.artifact, digest: requestReceipt.digest, bytes: requestReceipt.bytes, truncated: requestReceipt.truncated } }, (current) => { current.state = "running"; return current; });
      const child = await runChild(state, runner, requestReceipt.path, `${artifactScope}-runner-output.log`);
      state = await store.read(runId);
      if (state.supervisor?.token !== token) return;
      const runnerReceipt = { requestArtifact: requestReceipt.artifact, requestDigest: requestReceipt.digest, requestBytes: requestReceipt.bytes, requestTruncated: requestReceipt.truncated, outputArtifact: child.outputReceipt.artifact, outputDigest: child.outputReceipt.digest, outputBytes: child.outputReceipt.bytes, outputTruncated: child.outputReceipt.truncated, code: child.code, signal: child.signal || null, timedOut: child.timedOut, processErrorCode: child.errorCode || null };
      state = await ownedUpdate("runner.evidence", { runner: runnerReceipt }, (current) => { current.result = { ...(current.result || {}), runner: runnerReceipt }; return current; });
      if (!coordinationHealthy) return fail("blocked", "heartbeat_failed", "Coordination heartbeat failed while the runner was active.", state, { runner: runnerReceipt });
      if (state.control?.action === "pause" || state.control?.action === "cancel") return fail(state.control.action === "pause" ? "paused" : "canceled", `operator_${state.control.action}`, `Run ${state.control.action} request applied.`, state, { runner: runnerReceipt });
      if (child.errorCode) return fail("blocked", child.errorCode, child.message, state, { runner: runnerReceipt });
      if (child.timedOut || !child.ok) return fail("failed", child.timedOut ? "runner_timeout" : "runner_failed", `Runner exited with ${child.timedOut ? "timeout" : `code ${child.code}`}.`, state, { runner: runnerReceipt });
      state = await ownedUpdate("run.verifying", { runner: runnerReceipt }, (current) => { current.state = "verifying"; current.result = { ...(current.result || {}), runner: runnerReceipt }; return current; });
      let paths = await changedPaths(state);
      if (!paths.length) return fail("blocked", "no_changes", "Runner produced no reviewable changes.", state);
      await assertSafeChangedPaths(state, paths);
      const evidence = [];
      for (const verifier of authority.verifiers) {
        state = await store.read(runId);
        if (state.supervisor?.token !== token) return;
        if (!coordinationHealthy) return fail("blocked", "heartbeat_failed", "Coordination heartbeat failed during verification.", state);
        if (state.control?.action === "pause" || state.control?.action === "cancel") return fail(state.control.action === "pause" ? "paused" : "canceled", `operator_${state.control.action}`, `Run ${state.control.action} request applied during verification.`, state);
        const proof = state.plan.executableProofs.find((entry) => entry.role === `verification[${evidence.length}]`);
        await assertPinnedImplementationRunPolicy(state, runner, authority.verifiers);
        await assertExecutableMatches(proof);
        const result = await runVerification(state, verifier, proof);
        const outputArtifact = `${artifactScope}-verification-${String(evidence.length).padStart(3, "0")}.log`;
        const verifierSecrets = verifier.environment.map((name) => String(env[name] || "")).filter(Boolean), output = redactEvidence(`stdout: ${result.stdout}\nstderr: ${result.stderr}`, verifierSecrets, state.spec.bounds.maxOutputBytes);
        const outputReceipt = await writeEvidenceArtifact({ store, runId, fileName: outputArtifact, content: output.content, supervisorToken: token, truncated: result.outputTruncated || output.truncated });
        const stdout = redactOutput(result.stdout, verifierSecrets, 512);
        const stderr = redactOutput(result.stderr, verifierSecrets, 512);
        const baseReceipt = { step: evidence.length, profileId: verifier.id, executable: path.basename(verifier.executable).slice(0, 255), argumentCount: verifier.args.length, ok: result.ok, code: result.code, signal: result.signal || null, timedOut: result.timedOut, outputBytes: outputReceipt.bytes, outputTruncated: outputReceipt.truncated, outputArtifact, outputDigest: outputReceipt.digest, processErrorCode: result.errorCode || null };
        evidence.push({ ...baseReceipt, stdoutPreview: redactOutput(stdout, [], 512), stderrPreview: redactOutput(stderr, [], 512) });
        while (Buffer.byteLength(JSON.stringify(evidence)) > MAX_INLINE_VERIFICATION_EVIDENCE_BYTES) {
          let target = null;
          for (const candidate of evidence) for (const field of ["stdoutPreview", "stderrPreview"]) {
            if (!target || Buffer.byteLength(candidate[field]) > target.bytes) target = { candidate, field, bytes: Buffer.byteLength(candidate[field]) };
          }
          if (!target?.bytes) throw new Error("Verification receipt metadata exceeds its durable inline evidence bound.");
          target.candidate[target.field] = target.candidate[target.field].slice(0, Math.floor(target.candidate[target.field].length / 2));
        }
        state = await ownedUpdate("verification.evidence", { receipt: baseReceipt }, (current) => current);
        if (result.interrupted) {
          state = await store.read(runId);
          if (state.supervisor?.token !== token) return;
          if (!coordinationHealthy) return fail("blocked", "heartbeat_failed", "Coordination heartbeat failed during verification.", state);
          if (state.control?.action === "pause" || state.control?.action === "cancel") return fail(state.control.action === "pause" ? "paused" : "canceled", `operator_${state.control.action}`, `Run ${state.control.action} request interrupted verification.`, state);
          return fail("blocked", "verification_interrupted", `Verification was interrupted without an authorized control reason: ${verifier.id}.`, state, { verification: evidence });
        }
        if (result.errorCode) return fail("blocked", result.errorCode, result.message, state, { verification: evidence });
        if (!result.ok) return fail("failed", "verification_failed", `Verification failed for ${verifier.id}.`, state, { verification: evidence });
        await assertSafeChangedPaths(state, await changedPaths(state));
      }
      state = await bindAgenticSdlcLedger({ state: await store.read(runId), store, runId, supervisorToken: token, updateOwned: ownedUpdate });
      state = await store.read(runId);
      if (state.supervisor?.token !== token) return;
      if (!coordinationHealthy) return fail("blocked", "heartbeat_failed", "Coordination heartbeat failed before review handoff.", state);
      if (state.control?.action === "pause" || state.control?.action === "cancel") return fail(state.control.action === "pause" ? "paused" : "canceled", `operator_${state.control.action}`, `Run ${state.control.action} request applied before review.`, state);
      paths = await changedPaths(state);
      if (!paths.length) return fail("blocked", "no_changes", "Verification removed all reviewable changes.", state);
      await assertSafeChangedPaths(state, paths);
      await assertCanonicalUnchanged(state);
      await assertRemoteFence(state, state.coordination.lease.fenceSha);
      const clean = await execExact("git", ["-C", state.coordination.worktreePath, "status", "--porcelain"], { cwd: state.coordination.worktreePath, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
      const head = await execExact("git", ["-C", state.coordination.worktreePath, "rev-parse", "HEAD"], { cwd: state.coordination.worktreePath, env: safeEnvironment(env, []), timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
      if (!clean.ok || clean.stdout.trim() || !head.ok || head.stdout.trim() === state.coordination.lease.fenceSha) return fail("blocked", "review_commit_required", "Runner must leave a clean worktree with a committed change beyond the lease fence.", state);
      state = await ownedUpdate("coordination.review_requested", { headSha: head.stdout.trim() }, (current) => {
        current.coordinationIntent = { action: "review", requestedAt: now().toISOString() };
        current.result = { runner: current.result?.runner || null, ...implementationRunAdmissionResultFields(current.result), ...agenticSdlcLedgerResultFields(current.result), changedPaths: paths, verification: evidence, headSha: head.stdout.trim(), handoffPending: true, automaticMerge: false, deployment: false };
        return current;
      });
      handoffInProgress = true;
      const review = await callAcos(state, "review", "", state.coordination.worktreePath);
      return settleReviewResult(review);
    } catch (error) {
      state = await store.read(runId).catch(() => state);
      if (error.code === "SUPERVISOR_FENCED") return;
      if (["pause", "cancel"].includes(state.result?.controlDispositionPending) && state.control?.action === state.result.controlDispositionPending) {
        return ownedUpdate("control.disposition_deferred", { action: state.control.action, message: error.message }, (current) => {
          current.state = "queued";
          current.error = { code: "control_disposition_pending", message: `The ${current.control.action} disposition remains pending until active draft ownership is proven: ${error.message}` };
          current.supervisor.status = "stopped";
          return current;
        });
      }
      if (error.code === "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE") { handoffInProgress = true; return settleImplementationRunAdmissionUnavailable({ state, message: error.message, park, updateOwned: ownedUpdate }); }
      const failureCode = error.code === "LEASE_REACTIVATION_REQUIRED" ? "lease_reactivation_required" : error.code === "MANUAL_RECOVERY_REQUIRED" ? "manual_recovery_required" : error.code === "LEDGER_CONFORMANCE_FAILED" ? "agentic_sdlc_conformance_failed" : "supervisor_failed";
      return fail("blocked", failureCode, error.message, state, error.acosResult || null);
    }
  }

  async function run() {
    if (!await waitForRegistration()) return;
    const heartbeatPromise = heartbeat();
    try { return await execute(); } finally { stopped = true; wakeHeartbeat?.(); await heartbeatPromise; }
  }
  return { run };
}
