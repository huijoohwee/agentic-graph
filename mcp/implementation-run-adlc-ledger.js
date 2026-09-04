import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { readStableBoundedFile } from "./bounded-file-reader.js";
import { assertNativeLedgerBinding } from "./adlc-legacy-ledger.js";
import {
  createAdlcLedgerReceipt,
  evaluateAdlcLedger,
  loadAdlcEvaluator,
  ADLC_SOURCE_SCHEMAS,
} from "./adlc-ledger-runtime.js";

const MAX_ADLC_LEDGER_BYTES = 10 * 1024 * 1024;
const SHA256_PREFIX_LENGTH = "sha256:".length;

const ledgerFailure = (message, code = "LEDGER_SCHEMA_INVALID") =>
  Object.assign(new Error(message), { code });

const withinAllowed = (candidate, allowedPaths) =>
  allowedPaths.some((allowed) =>
    candidate === allowed || candidate.startsWith(`${allowed}/`));

async function readLedger(state) {
  const relativePath = state.spec.adlcLedgerPath;
  if (!withinAllowed(relativePath, state.spec.allowedPaths)) {
    throw ledgerFailure("ADLC ledger path is outside the run's declared write scope.");
  }
  const workspaceStat = await fs.lstat(state.coordination.worktreePath);
  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) {
    throw ledgerFailure("ADLC ledger worktree identity is unsafe.");
  }
  const workspaceReal = await fs.realpath(state.coordination.worktreePath);
  const absolutePath = path.resolve(workspaceReal, relativePath);
  const lexical = path.relative(workspaceReal, absolutePath).replaceAll("\\", "/");
  if (!lexical || lexical !== relativePath || lexical.startsWith("../")) {
    throw ledgerFailure("ADLC ledger path has an unsafe worktree identity.");
  }
  let content;
  try {
    ({ content } = await readStableBoundedFile({
      filePath: absolutePath,
      containingDirectory: workspaceReal,
      minimumBytes: 2,
      maximumBytes: MAX_ADLC_LEDGER_BYTES,
    }));
  } catch {
    throw ledgerFailure(
      "ADLC ledger must be a stable non-symlink bounded file inside the task worktree.",
    );
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
    return { content, ledger: JSON.parse(decoded) };
  } catch {
    throw ledgerFailure("ADLC ledger must contain valid UTF-8 JSON.");
  }
}

async function persistImmutableLedger({
  state,
  store,
  runId,
  supervisorToken,
  content,
}) {
  const contentDigest =
    `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
  const artifactName = [
    "adlc-run",
    `a${String(state.attempt).padStart(4, "0")}`,
    contentDigest.slice(SHA256_PREFIX_LENGTH, SHA256_PREFIX_LENGTH + 16),
    "json",
  ].join(".");
  try {
    const artifactPath = await store.writeArtifact(
      runId,
      artifactName,
      content,
      { supervisorToken },
    );
    return {
      path: artifactPath,
      artifact: artifactName,
      digest: contentDigest,
      bytes: content.byteLength,
      truncated: false,
    };
  } catch (error) {
    if (error?.code !== "ARTIFACT_EXISTS") throw error;
    return store.readArtifact(runId, artifactName, {
      expectedDigest: contentDigest,
      expectedBytes: content.byteLength,
      requireUtf8: true,
    });
  }
}

export const adlcRunnerRequestFields = (ledgerPath) => ({
  adlcLedgerPath: ledgerPath || null,
  directive: ledgerPath
    ? `Implement only the work item in this isolated worktree, provide an already-authoritative canonical source ledger with its original schema at ${ledgerPath}, commit review-ready changes, and do not push, merge, deploy, or mutate canonical main. Native ADLC conformance is unavailable without an owning evaluator.`
    : "Implement only the work item in this isolated worktree, commit review-ready changes, and do not push, merge, deploy, or mutate canonical main.",
});

export const adlcLedgerResultFields = (result) =>
  result?.adlcLedger
    ? { adlcLedger: result.adlcLedger }
    : {};

export async function bindAdlcLedger({
  state,
  store,
  runId,
  supervisorToken,
  updateOwned,
}) {
  assertNativeLedgerBinding(state);
  if (!state.spec.adlcLedgerPath) return state;
  const { content, ledger } = await readLedger(state);
  if (!ADLC_SOURCE_SCHEMAS.includes(ledger?.schema)) throw ledgerFailure("Unsupported canonical ledger source schema.");
  const evaluator = await loadAdlcEvaluator({
    canonicalSchema: ledger.schema,
    agenticCanvasOsRoot: state.spec.agenticCanvasOsRoot,
    expectedRevision: state.plan.acosRevision,
  });
  const evaluated = evaluateAdlcLedger(ledger, evaluator);
  const artifact = await persistImmutableLedger({
    state,
    store,
    runId,
    supervisorToken,
    content,
  });
  const receipt = createAdlcLedgerReceipt({
    canonicalSchema: evaluated.normalizedRun.schema,
    artifact: artifact.artifact,
    digest: artifact.digest,
    bytes: artifact.bytes,
    canonicalRunId: evaluated.normalizedRun.runId,
    ledgerRevision: state.revision,
    acosRevision: state.plan.acosRevision,
  });
  const bound = await updateOwned(
    "adlc.ledger_bound",
    {
      canonicalSchema: receipt.canonicalSchema,
      artifact: receipt.artifact,
      digest: receipt.digest,
      bytes: receipt.bytes,
      canonicalRunId: receipt.canonicalRunId,
      ledgerRevision: receipt.ledgerRevision,
      acosRevision: receipt.acosRevision,
      runtimeReady: evaluated.conformance.runtimeReady,
    },
    (current) => {
      current.result = {
        ...(current.result || {}),
        adlcLedger: receipt,
      };
      return current;
    },
  );
  if (!evaluated.conformance.runtimeReady) {
    throw ledgerFailure(
      "The independent ADLC evaluator did not mark the canonical ledger runtime-ready.",
      "LEDGER_CONFORMANCE_FAILED",
    );
  }
  return bound;
}
