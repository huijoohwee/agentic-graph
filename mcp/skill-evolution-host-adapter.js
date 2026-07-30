import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RPC_BYTES = 256 * 1024;
const CANCEL_GRACE_MS = 25;
const FORBIDDEN_RUNTIME_MARKER = ["skill", "opt"].join("");
const WORKER_PATH = fileURLToPath(new URL("./skill-evolution-capability-worker.js", import.meta.url));
const ROLE_METHODS = Object.freeze({
  authorization: Object.freeze(["authorize"]),
  sourceVerifier: Object.freeze(["verifySources", "verifyMutation"]),
  trainingExecutor: Object.freeze(["executeTraining"]),
  candidate: Object.freeze(["proposeCandidate"]),
  heldOut: Object.freeze(["executeValidation", "evaluateValidation"]),
});
const PUBLIC_ERROR_CODES = new Set([
  "adapter_failed",
  "adapter_unavailable",
  "bound_exceeded",
  "canceled",
  "source_drift",
  "timeout",
  "unauthorized",
]);

function runtimeError(code, message, cost) {
  const error = Object.assign(new Error(message), { code });
  if (cost) error.cost = cost;
  return error;
}

function publicError(role, code = "adapter_failed", cost) {
  const safeCode = PUBLIC_ERROR_CODES.has(code) ? code : "adapter_failed";
  const messages = {
    adapter_unavailable: `The ${role} skill-evolution capability is unavailable.`,
    bound_exceeded: `The ${role} skill-evolution capability exceeded its admitted bound.`,
    canceled: `The ${role} skill-evolution capability was canceled.`,
    source_drift: "The configured skill-evolution capability source drifted.",
    timeout: `The ${role} skill-evolution capability exceeded its deadline.`,
    unauthorized: "Host authorization for skill evolution was denied.",
  };
  return runtimeError(safeCode, messages[safeCode] || `The ${role} skill-evolution capability failed.`, cost);
}

function boundedJsonClone(value, label) {
  let text;
  try {
    text = JSON.stringify(value, (_key, entry) => {
      if (["bigint", "function", "symbol", "undefined"].includes(typeof entry)) {
        throw new TypeError(`${label} contains a non-JSON value`);
      }
      return entry;
    });
  } catch {
    throw runtimeError("adapter_failed", `${label} must be bounded JSON.`);
  }
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_RPC_BYTES) {
    throw runtimeError("adapter_failed", `${label} exceeds the bounded capability exchange.`);
  }
  return JSON.parse(text);
}

function safeCost(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { tokens, costUsd, durationMs } = value;
  if (!Number.isSafeInteger(tokens) || tokens < 0
    || !Number.isFinite(costUsd) || costUsd < 0
    || !Number.isSafeInteger(durationMs) || durationMs < 0) return undefined;
  return { tokens, costUsd, durationMs };
}

function resolveTimeout(value, env) {
  const configured = value ?? Number(env.KNOWGRPH_SKILL_EVOLUTION_ADAPTER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > MAX_TIMEOUT_MS) {
    throw new TypeError(`callTimeoutMs must be an integer from 1 through ${MAX_TIMEOUT_MS}`);
  }
  return configured;
}

async function realpathInside(rootDir, requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath.trim() || requestedPath.includes("\0")) {
    throw runtimeError("adapter_unavailable", "Skill-evolution adapter module is not configured.");
  }
  const root = await fs.realpath(path.resolve(rootDir));
  const candidate = await fs.realpath(path.resolve(root, requestedPath.trim())).catch(() => "");
  const relative = candidate ? path.relative(root, candidate) : "..";
  if (!candidate || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw runtimeError("adapter_unavailable", "Skill-evolution adapter module must resolve inside the Knowgrph repository.");
  }
  const stat = await fs.stat(candidate);
  if (!stat.isFile() || ![".js", ".mjs"].includes(path.extname(candidate))) {
    throw runtimeError("adapter_unavailable", "Skill-evolution adapter module must be a JavaScript module file.");
  }
  return { root, candidate };
}

function sanitizedChildEnv() {
  return Object.freeze({ LANG: "C", LC_ALL: "C", TZ: "UTC" });
}

function permissionArgs(readPaths) {
  const flag = process.allowedNodeEnvironmentFlags.has("--permission")
    ? "--permission"
    : process.allowedNodeEnvironmentFlags.has("--experimental-permission")
      ? "--experimental-permission"
      : null;
  if (!flag) throw runtimeError("adapter_unavailable", "This Node runtime cannot isolate adapter filesystem writes.");
  return [flag, ...readPaths.map((readPath) => `--allow-fs-read=${readPath}`)];
}

function waitForWorker(workerPromise, role, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, publicError(role, "canceled"));
    workerPromise.then(
      (entry) => finish(resolve, entry),
      (error) => finish(reject, error),
    );
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
    timer = setTimeout(() => finish(reject, publicError(role, "timeout")), timeoutMs);
    timer.unref?.();
  });
}

export function createSkillEvolutionHostAdapter({
  rootDir = process.cwd(),
  env = process.env,
  forkProcess = fork,
  callTimeoutMs,
} = {}) {
  if (typeof forkProcess !== "function") throw new TypeError("forkProcess must be a function");
  const configuredPath = String(env.KNOWGRPH_SKILL_EVOLUTION_ADAPTER_MODULE || "").trim();
  const configuredDigest = String(env.KNOWGRPH_SKILL_EVOLUTION_ADAPTER_SHA256 || "").trim();
  const defaultTimeoutMs = resolveTimeout(callTimeoutMs, env);
  let resolved;
  let sequence = 0;

  const readVerifiedSource = async () => {
    if (!SHA256.test(configuredDigest)) {
      throw runtimeError("adapter_unavailable", "KNOWGRPH_SKILL_EVOLUTION_ADAPTER_SHA256 must be an exact lowercase SHA-256 digest.");
    }
    resolved ||= await realpathInside(rootDir, configuredPath);
    const source = await fs.readFile(resolved.candidate);
    const actualDigest = createHash("sha256").update(source).digest("hex");
    if (actualDigest !== configuredDigest) {
      throw runtimeError("source_drift", "The configured skill-evolution adapter module digest drifted.");
    }
    if (source.toString("utf8").toLowerCase().includes(FORBIDDEN_RUNTIME_MARKER)) {
      throw runtimeError("adapter_unavailable", "The configured adapter violates the Skill Evolution clean-room dependency boundary.");
    }
    return resolved;
  };

  const stopWorker = (entry) => {
    if (entry.stopped) return;
    entry.stopped = true;
    if (entry.child.connected) entry.child.disconnect();
    if (!entry.child.killed) entry.child.kill();
  };

  const failWorker = (entry, error) => {
    entry.readyReject?.(error);
    entry.readyReject = null;
    for (const pending of entry.pending.values()) pending.reject(error);
    entry.pending.clear();
    stopWorker(entry);
  };

  const handleMessage = (entry, raw) => {
    let message;
    try {
      message = boundedJsonClone(raw, "Capability response");
    } catch {
      failWorker(entry, publicError(entry.role));
      return;
    }
    if (message?.type === "ready" && message.role === entry.role) {
      entry.ready = true;
      entry.readyResolve?.();
      entry.readyResolve = null;
      entry.readyReject = null;
      return;
    }
    if (message?.type === "boot_failed" && message.role === entry.role) {
      failWorker(entry, publicError(entry.role, "adapter_unavailable"));
      return;
    }
    if (message?.type !== "result" || typeof message.id !== "string") {
      failWorker(entry, publicError(entry.role));
      return;
    }
    const pending = entry.pending.get(message.id);
    if (!pending) return;
    entry.pending.delete(message.id);
    if (message.ok === true) pending.resolve(message.value);
    else pending.reject(publicError(entry.role, message.error?.code, safeCost(message.error?.cost)));
    stopWorker(entry);
  };

  const ensureWorker = async (role) => {
    await readVerifiedSource();
    let child;
    try {
      child = forkProcess(
        WORKER_PATH,
        [resolved.root, resolved.candidate, configuredDigest, role],
      {
        cwd: resolved.root,
        env: sanitizedChildEnv(),
        execArgv: [
          "--experimental-vm-modules",
          ...permissionArgs([WORKER_PATH, resolved.candidate]),
        ],
        serialization: "json",
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        },
      );
    } catch {
      throw publicError(role, "adapter_unavailable");
    }
    const entry = { role, child, pending: new Map(), ready: false, stopped: false };
    entry.readyPromise = new Promise((resolve, reject) => {
      entry.readyResolve = resolve;
      entry.readyReject = reject;
    });
    child.on("message", (message) => handleMessage(entry, message));
    child.once("error", () => failWorker(entry, publicError(role, "adapter_unavailable")));
    child.once("exit", () => failWorker(entry, publicError(role, "adapter_unavailable")));
    const startupTimer = setTimeout(
      () => failWorker(entry, publicError(role, "timeout")),
      defaultTimeoutMs,
    );
    startupTimer.unref?.();
    entry.readyPromise.finally(() => clearTimeout(startupTimer)).catch(() => {});
    await entry.readyPromise;
    return entry;
  };

  const cancelPending = (entry, id, code) => {
    const pending = entry.pending.get(id);
    if (!pending) return;
    entry.pending.delete(id);
    pending.reject(publicError(entry.role, code));
    try { entry.child.send({ type: "cancel", id }); } catch { /* process exit handles cleanup */ }
    const timer = setTimeout(() => {
      stopWorker(entry);
    }, CANCEL_GRACE_MS);
    timer.unref?.();
  };

  const call = (role, method) => async (rawPayload = {}) => {
    if (!ROLE_METHODS[role]?.includes(method)) throw publicError(role, "adapter_unavailable");
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      throw runtimeError("adapter_failed", "Capability payload must be an object.");
    }
    const signal = rawPayload.signal;
    if (signal?.aborted) throw publicError(role, "canceled");
    const payload = boundedJsonClone(
      Object.fromEntries(Object.entries(rawPayload).filter(([key]) => key !== "signal")),
      "Capability request",
    );
    const remainingMs = payload.remainingBudget?.durationMs;
    const totalTimeoutMs = Number.isSafeInteger(remainingMs) && remainingMs > 0
      ? Math.min(defaultTimeoutMs, remainingMs)
      : defaultTimeoutMs;
    const startedAt = Date.now();
    let entry;
    const workerPromise = ensureWorker(role);
    try {
      entry = await waitForWorker(workerPromise, role, signal, totalTimeoutMs);
    } catch (error) {
      workerPromise.then(stopWorker).catch(() => {});
      if (PUBLIC_ERROR_CODES.has(error?.code)) throw error;
      throw publicError(role, "adapter_unavailable");
    }
    if (signal?.aborted) {
      stopWorker(entry);
      throw publicError(role, "canceled");
    }
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    if (elapsedMs >= totalTimeoutMs) {
      stopWorker(entry);
      throw publicError(role, "timeout");
    }
    const id = `${role}:${++sequence}`;
    const message = boundedJsonClone({ type: "call", id, method, payload }, "Capability request");
    const timeoutMs = Math.max(1, totalTimeoutMs - elapsedMs);

    return new Promise((resolve, reject) => {
      entry.child.ref?.();
      entry.child.channel?.ref?.();
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
      };
      const settle = (callback) => (value) => { cleanup(); callback(value); };
      const onAbort = () => cancelPending(entry, id, "canceled");
      const timer = setTimeout(() => cancelPending(entry, id, "timeout"), timeoutMs);
      timer.unref?.();
      entry.pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
      signal?.addEventListener?.("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      try {
        entry.child.send(message, (error) => {
          if (error) cancelPending(entry, id, "adapter_unavailable");
        });
      } catch {
        cancelPending(entry, id, "adapter_unavailable");
      }
    });
  };

  return Object.freeze({
    authorize: call("authorization", "authorize"),
    sourceVerifier: Object.freeze({
      verifySources: call("sourceVerifier", "verifySources"),
      verifyMutation: call("sourceVerifier", "verifyMutation"),
    }),
    trainingExecutor: Object.freeze({ executeTraining: call("trainingExecutor", "executeTraining") }),
    candidate: Object.freeze({ proposeCandidate: call("candidate", "proposeCandidate") }),
    heldOut: Object.freeze({
      executeValidation: call("heldOut", "executeValidation"),
      evaluateValidation: call("heldOut", "evaluateValidation"),
    }),
  });
}

export const SKILL_EVOLUTION_HOST_ADAPTER_METHODS = ROLE_METHODS;
