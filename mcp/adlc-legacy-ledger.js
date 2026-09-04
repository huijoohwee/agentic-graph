import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  snapshotPinnedEvaluatorDependencies,
} from "./evaluator-dependency-snapshot.js";

export const LEGACY_LEDGER_RECEIPT_SCHEMA =
  "agentic-sdlc-ledger-receipt/v1";

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ARTIFACT = /^[a-z0-9][a-z0-9._-]{0,119}$/;
const RECEIPT_KEYS = Object.freeze([
  "schema",
  "artifact",
  "digest",
  "bytes",
  "canonicalRunId",
  "ledgerRevision",
  "acosRevision",
]);

const fail = (code, message) => Object.assign(new Error(message), { code });
const within = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;

function sanitizedGitEnvironment() {
  const environment = {};
  for (const name of process.platform === "win32"
    ? ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP"]
    : ["PATH", "TMPDIR"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  return {
    ...environment,
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: nullDevice,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LC_ALL: "C",
  };
}

async function checkoutSnapshot(root, exec) {
  const run = (args) => exec("git", [
    "-c", `core.worktree=${root}`,
    "-c", "core.bare=false",
    "-c", "core.fsmonitor=false",
    "-c", "status.showUntrackedFiles=all",
    "-C", root,
    ...args,
  ], {
    encoding: "utf8",
    env: sanitizedGitEnvironment(),
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  const firstRevision = (await run(["rev-parse", "HEAD"])).stdout.trim();
  const status = (await run(["status", "--porcelain"])).stdout.trim();
  const secondRevision = (await run(["rev-parse", "HEAD"])).stdout.trim();
  if (firstRevision !== secondRevision) {
    throw fail("ACOS_REVISION_MISMATCH", "The Agentic Canvas OS evaluator revision changed during inspection.");
  }
  return Object.freeze({ revision: firstRevision, status });
}

export function validateLegacyLedgerReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw fail("CANONICAL_LEDGER_UNAVAILABLE", "The implementation run has no canonical Agentic SDLC ledger receipt.");
  }
  const keys = Object.keys(input).sort();
  if (
    keys.length !== RECEIPT_KEYS.length
    || keys.some((key, index) => key !== [...RECEIPT_KEYS].sort()[index])
  ) {
    throw fail(
      "LEDGER_RECEIPT_INVALID",
      "The canonical Agentic SDLC ledger receipt contains missing or unknown fields.",
    );
  }
  if (input.schema !== LEGACY_LEDGER_RECEIPT_SCHEMA) {
    throw fail("LEDGER_RECEIPT_INVALID", "The canonical Agentic SDLC ledger receipt schema is unsupported.");
  }
  if (!ARTIFACT.test(String(input.artifact || ""))) {
    throw fail("LEDGER_RECEIPT_INVALID", "The canonical Agentic SDLC ledger artifact name is invalid.");
  }
  if (!DIGEST.test(String(input.digest || ""))) {
    throw fail("LEDGER_RECEIPT_INVALID", "The canonical Agentic SDLC ledger digest is invalid.");
  }
  if (!Number.isSafeInteger(input.bytes) || input.bytes < 2) {
    throw fail("LEDGER_RECEIPT_INVALID", "The canonical Agentic SDLC ledger byte count is invalid.");
  }
  if (typeof input.canonicalRunId !== "string" || !input.canonicalRunId.trim()) {
    throw fail("LEDGER_RECEIPT_INVALID", "The canonical Agentic SDLC run identity is missing.");
  }
  if (!Number.isSafeInteger(input.ledgerRevision) || input.ledgerRevision < 1) {
    throw fail("LEDGER_RECEIPT_INVALID", "The canonical Agentic SDLC ledger revision is invalid.");
  }
  if (!SHA.test(String(input.acosRevision || ""))) {
    throw fail("LEDGER_RECEIPT_INVALID", "The canonical Agentic SDLC evaluator revision is invalid.");
  }
  return Object.freeze({
    schema: input.schema,
    artifact: input.artifact,
    digest: input.digest,
    bytes: input.bytes,
    canonicalRunId: input.canonicalRunId.trim(),
    ledgerRevision: input.ledgerRevision,
    acosRevision: input.acosRevision,
  });
}

export async function loadLegacyLedgerEvaluator({
  agenticCanvasOsRoot,
  expectedRevision,
  exec = execFileAsync,
} = {}) {
  if (!path.isAbsolute(String(agenticCanvasOsRoot || ""))) {
    throw fail("ACOS_REVISION_MISMATCH", "The Agentic Canvas OS evaluator root must be an absolute trusted path.");
  }
  if (!SHA.test(String(expectedRevision || ""))) {
    throw fail("ACOS_REVISION_MISMATCH", "The expected Agentic Canvas OS evaluator revision is invalid.");
  }
  try {
    const suppliedRootStat = await fs.lstat(agenticCanvasOsRoot);
    if (!suppliedRootStat.isDirectory() || suppliedRootStat.isSymbolicLink()) {
      throw fail("ACOS_REVISION_MISMATCH", "The Agentic Canvas OS evaluator root is unsafe.");
    }
    const root = await fs.realpath(agenticCanvasOsRoot);
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw fail("ACOS_REVISION_MISMATCH", "The Agentic Canvas OS evaluator root is unsafe.");
    }
    const before = await checkoutSnapshot(root, exec);
    if (before.revision !== expectedRevision || before.status) {
      throw fail(
        "ACOS_REVISION_MISMATCH",
        "The Agentic Canvas OS evaluator checkout does not match the exact clean receipt revision.",
      );
    }
    const modulePath = path.join(root, "scripts", "agentic-sdlc", "index.mjs");
    const moduleStat = await fs.lstat(modulePath).catch((error) => {
      if (error.code === "ENOENT") throw fail("ADLC_EVALUATOR_UNAVAILABLE",
        "The exact historical evaluator is unavailable; restore its receipt-pinned checkout for read-only observation.");
      throw error;
    });
    const moduleReal = await fs.realpath(modulePath);
    if (!within(root, moduleReal) || !moduleStat.isFile() || moduleStat.isSymbolicLink()) {
      throw fail("ACOS_REVISION_MISMATCH", "The Agentic Canvas OS evaluator module is unsafe.");
    }
    const dependencyBefore = await snapshotPinnedEvaluatorDependencies(root);
    const evaluator = await import(
      `${pathToFileURL(moduleReal).href}?revision=${expectedRevision}`
    );
    for (const name of [
      "assertCanonicalRunSchema",
      "normalizeCanonicalRun",
      "validateExecutionRun",
      "stableJson",
    ]) {
      if (typeof evaluator[name] !== "function") {
        throw fail("ACOS_REVISION_MISMATCH", `The Agentic Canvas OS evaluator does not export ${name}.`);
      }
    }
    const [
      finalRoot,
      finalModule,
      finalSuppliedRootStat,
      finalRootStat,
      finalModuleStat,
    ] = await Promise.all([
      fs.realpath(agenticCanvasOsRoot),
      fs.realpath(modulePath),
      fs.lstat(agenticCanvasOsRoot),
      fs.lstat(root),
      fs.lstat(modulePath),
    ]);
    const after = await checkoutSnapshot(root, exec);
    const dependencyAfter = await snapshotPinnedEvaluatorDependencies(root);
    if (finalRoot !== root || finalModule !== moduleReal
      || !sameFile(suppliedRootStat, finalSuppliedRootStat)
      || finalSuppliedRootStat.isSymbolicLink()
      || !sameFile(rootStat, finalRootStat) || !sameFile(moduleStat, finalModuleStat)
      || after.revision !== before.revision || after.status !== before.status
      || dependencyAfter.identity !== dependencyBefore.identity
      || dependencyAfter.ajvVersion !== dependencyBefore.ajvVersion
      || dependencyAfter.bytes !== dependencyBefore.bytes
      || dependencyAfter.files !== dependencyBefore.files) {
      throw fail(
        "ACOS_REVISION_MISMATCH",
        "The Agentic Canvas OS evaluator identity changed while it was loaded.",
      );
    }
    return evaluator;
  } catch (error) {
    if (["ACOS_REVISION_MISMATCH", "ADLC_EVALUATOR_UNAVAILABLE"].includes(error?.code)) throw error;
    throw fail(
      "ACOS_REVISION_MISMATCH",
      "The exact clean Agentic Canvas OS evaluator could not be loaded.",
    );
  }
}

export const LEGACY_RUN_SCHEMA = "agentic-sdlc-run/v1";
export const LEGACY_LEDGER_EVENT = "agentic_sdlc.ledger_bound";
export function legacyCanonicalRunId(ledger) {
  const id = typeof ledger?.runId === "string" ? ledger.runId.trim() : "";
  if (!id) throw fail("LEDGER_SCHEMA_INVALID", "Historical canonical run identity is missing.");
  return id;
}
export function readLegacyLedgerBinding(result) {
  if (!result || !Object.hasOwn(result, "agenticSdlcLedger")) return null;
  if (Object.hasOwn(result, "adlcLedger")) throw fail("LEDGER_RECEIPT_INVALID", "Conflicting native and historical ledger receipts.");
  return validateLegacyLedgerReceipt(result.agenticSdlcLedger);
}
export function assertNativeLedgerBinding(state) {
  if (Object.hasOwn(state.spec, "agenticSdlcLedgerPath") || Object.hasOwn(state.result || {}, "agenticSdlcLedger"))
    throw fail("LEDGER_RECEIPT_INVALID", "Historical ledger bindings are read-only; start a new native ADLC request.");
}
