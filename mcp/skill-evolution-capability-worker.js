import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { SourceTextModule, SyntheticModule } from "node:vm";

const MAX_RPC_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const FORBIDDEN_RUNTIME_MARKER = ["skill", "opt"].join("");
const ADAPTER_BUILTINS = new Set(["node:crypto"]);
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

function boundedMessage(message) {
  const text = JSON.stringify(message, (_key, value) => {
    if (["bigint", "function", "symbol", "undefined"].includes(typeof value)) {
      throw new TypeError("Capability result contains a non-JSON value");
    }
    return value;
  });
  if (Buffer.byteLength(text) > MAX_RPC_BYTES) throw new TypeError("Capability result is too large");
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

function safeError(error) {
  const code = PUBLIC_ERROR_CODES.has(error?.code) ? error.code : "adapter_failed";
  return { code, ...(safeCost(error?.cost) ? { cost: safeCost(error.cost) } : {}) };
}

async function verifiedModule(rootArg, moduleArg, expectedDigest) {
  if (!SHA256.test(expectedDigest)) throw new Error("invalid digest");
  const root = path.resolve(rootArg);
  const modulePath = path.resolve(moduleArg);
  const relative = path.relative(root, modulePath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("module outside root");
  }
  const source = await fs.readFile(modulePath);
  if (createHash("sha256").update(source).digest("hex") !== expectedDigest) throw new Error("source drift");
  if (source.toString("utf8").toLowerCase().includes(FORBIDDEN_RUNTIME_MARKER)) {
    throw new Error("forbidden dependency");
  }
  return { root, modulePath, source: source.toString("utf8") };
}

async function loadSelfContainedModule({ modulePath, source }, expectedDigest) {
  const builtinCache = new Map();
  const rejectDynamicImport = () => {
    throw new Error("dynamic imports are not permitted in a self-contained adapter");
  };
  const module = new SourceTextModule(source, {
    identifier: `skill-evolution-adapter:${expectedDigest}`,
    initializeImportMeta(meta) {
      meta.url = `skill-evolution-adapter:${expectedDigest}`;
    },
    importModuleDynamically: rejectDynamicImport,
  });
  await module.link(async (specifier) => {
    if (!ADAPTER_BUILTINS.has(specifier)) {
      throw new Error("adapter import is outside the pinned capability surface");
    }
    if (!builtinCache.has(specifier)) {
      const namespace = await import(specifier);
      const exportNames = Object.getOwnPropertyNames(namespace);
      builtinCache.set(specifier, new SyntheticModule(exportNames, function exposeBuiltin() {
        for (const name of exportNames) this.setExport(name, namespace[name]);
      }, { identifier: specifier }));
    }
    return builtinCache.get(specifier);
  });
  await module.evaluate();
  return module.namespace;
}

function validateCapability(value, role) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("missing capability");
  const expected = ROLE_METHODS[role];
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
    throw new Error("capability surface mismatch");
  }
  if (expected.some((method) => typeof value[method] !== "function")) throw new Error("missing method");
  return value;
}

const [rootArg, moduleArg, expectedDigest, role] = process.argv.slice(2);
const methods = ROLE_METHODS[role];
const controllers = new Map();

async function send(message) {
  if (!process.connected) return;
  let outgoing;
  try {
    outgoing = boundedMessage(message);
  } catch {
    outgoing = { type: "result", id: message?.id || "invalid", ok: false, error: { code: "adapter_failed" } };
  }
  if (!process.connected) return;
  try { process.send(outgoing); } catch { /* parent disconnect ends the worker */ }
}

let capability;
const boot = (async () => {
  if (!methods) throw new Error("unknown role");
  const verified = await verifiedModule(rootArg, moduleArg, expectedDigest);
  const namespace = await loadSelfContainedModule(verified, expectedDigest);
  const candidate = typeof namespace.createSkillEvolutionAdapter === "function"
    ? await namespace.createSkillEvolutionAdapter({ rootDir: verified.root, moduleDigest: expectedDigest, role })
    : namespace.default;
  await verifiedModule(rootArg, moduleArg, expectedDigest);
  capability = validateCapability(candidate, role);
  await send({ type: "ready", role });
})();

process.on("message", async (message) => {
  if (message?.type === "cancel" && typeof message.id === "string") {
    controllers.get(message.id)?.abort();
    return;
  }
  if (message?.type !== "call" || typeof message.id !== "string" || !methods?.includes(message.method)) {
    await send({ type: "result", id: message?.id || "invalid", ok: false, error: { code: "adapter_unavailable" } });
    return;
  }
  const controller = new AbortController();
  controllers.set(message.id, controller);
  try {
    await boot;
    const payload = boundedMessage(message.payload || {});
    const value = await capability[message.method]({ ...payload, signal: controller.signal });
    await send({ type: "result", id: message.id, ok: true, value });
  } catch (error) {
    await send({ type: "result", id: message.id, ok: false, error: safeError(error) });
  } finally {
    controllers.delete(message.id);
  }
});

process.once("disconnect", () => {
  for (const controller of controllers.values()) controller.abort();
  process.exit(0);
});

boot.catch(async () => {
  await send({ type: "boot_failed", role });
  process.exit(1);
});
