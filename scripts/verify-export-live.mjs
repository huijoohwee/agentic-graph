#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { readExportArtifact } from "../mcp/export-artifact-reader.js";
import {
  describeGoogleAuth,
  describeMicrosoftAuth,
} from "../mcp/export-provider-auth.js";
import { verifyFleetLedger } from "../mcp/export-ledger.js";
import { sanitizeProviderMessage } from "../mcp/export-provider-http.js";
import { runExportPublish } from "../mcp/export-publish-runtime.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const knownProviders = new Set(["google", "microsoft"]);
const knownKinds = new Set(["spreadsheet", "slides"]);
const receiptSchema = "agentic-graph-export-live-verification/v1";

const safeErrorMessage = (error) => sanitizeProviderMessage(
  error instanceof Error ? error.message : error,
  "Live export verification failed",
);

export const EXPORT_LIVE_USAGE = `Usage:
  npm run export:verify:live -- --artifact <repo-relative.md> [options]

Options:
  --providers <list>  Comma-separated google,microsoft list (default: both).
  --kinds <list>      Comma-separated spreadsheet,slides list (default: both).
  --help              Show this help text.

The verifier creates an isolated local ledger, publishes every provider/kind
pair twice, and proves stable document identity from one clean exact Git SHA
without deleting artifacts or changing provider sharing permissions.`;

const uniqueList = (value, allowed, label) => {
  const values = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) throw new Error(`${label} requires at least one value.`);
  const unknown = values.filter((item) => !allowed.has(item));
  if (unknown.length > 0) throw new Error(`${label} contains unsupported value(s): ${unknown.join(", ")}.`);
  return [...new Set(values)];
};

const optionValue = (argv, index, label) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${label} requires a value.`);
  return value;
};

export function parseLiveVerificationArgs(argv) {
  const options = {
    artifact: "",
    providers: ["google", "microsoft"],
    kinds: ["spreadsheet", "slides"],
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--artifact") {
      options.artifact = optionValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--providers") {
      options.providers = uniqueList(optionValue(argv, index, argument), knownProviders, argument);
      index += 1;
      continue;
    }
    if (argument === "--kinds") {
      options.kinds = uniqueList(optionValue(argv, index, argument), knownKinds, argument);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}.`);
  }
  if (!options.help && !options.artifact) throw new Error("--artifact is required.");
  return Object.freeze({
    ...options,
    providers: Object.freeze([...options.providers]),
    kinds: Object.freeze([...options.kinds]),
  });
}

const readExactGitHead = async (cwd) => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", "HEAD"], { cwd, encoding: "utf8" });
  const gitSha = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(gitSha)) throw new Error("Unable to resolve an exact Git commit SHA.");
  return gitSha;
};

export const resolveCleanGitState = async (cwd) => {
  const beforeSha = await readExactGitHead(cwd);
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd, encoding: "utf8" },
  );
  const afterSha = await readExactGitHead(cwd);
  if (beforeSha !== afterSha) {
    return Object.freeze({ clean: false, reason: "GIT_HEAD_CHANGED_DURING_PREFLIGHT" });
  }
  const changedPathCount = stdout.split(/\r?\n/).filter(Boolean).length;
  if (changedPathCount > 0) {
    return Object.freeze({ clean: false, reason: "GIT_WORKTREE_DIRTY", changed_path_count: changedPathCount });
  }
  return Object.freeze({ clean: true, git_sha: afterSha });
};

const createIsolatedLedgerPath = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-live-"));
  return path.join(directory, "FLEET.md");
};

const authDescriptors = Object.freeze({
  google: describeGoogleAuth,
  microsoft: describeMicrosoftAuth,
});

const assertLiveReceipt = ({ result, provider, kind, sourceSha }) => {
  if (result?.provider !== provider) {
    throw new Error(`${provider}/${kind} returned provider ${result?.provider || "<missing>"}.`);
  }
  if (result?.kind !== kind) throw new Error(`${provider}/${kind} returned an unexpected kind.`);
  if (!result?.doc_id) throw new Error(`${provider}/${kind} returned no document ID.`);
  let url;
  try {
    url = new URL(result.url);
  } catch {
    throw new Error(`${provider}/${kind} returned an invalid URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${provider}/${kind} returned a non-HTTPS or credential-bearing URL.`);
  }
  if (result.source_sha256 !== sourceSha) {
    throw new Error(`${provider}/${kind} returned a mismatched source digest.`);
  }
  if (result.fallback_used !== false) {
    throw new Error(`${provider}/${kind} unexpectedly used provider fallback.`);
  }
};

const timedPublish = async ({ publish, input, runtimeOptions, now }) => {
  const startedAtMs = now();
  const result = await publish(input, runtimeOptions);
  const finishedAtMs = now();
  return Object.freeze({ result, duration_ms: Math.max(0, finishedAtMs - startedAtMs) });
};

const publicRunReceipt = (timed) => Object.freeze({
  doc_id: timed.result.doc_id,
  url: timed.result.url,
  duration_ms: timed.duration_ms,
});

export async function runLiveExportVerification(options, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? Date.now;
  const startedAtMs = now();
  const currentRepoRoot = dependencies.repoRoot ?? repoRoot;
  const getGitState = dependencies.resolveGitState ?? resolveCleanGitState;
  const gitState = await getGitState(currentRepoRoot);
  if (!gitState || gitState.clean !== true) {
    const reason = gitState?.reason === "GIT_HEAD_CHANGED_DURING_PREFLIGHT"
      ? gitState.reason
      : "GIT_WORKTREE_DIRTY";
    const finishedAtMs = now();
    return Object.freeze({
      exitCode: 2,
      receipt: Object.freeze({
        schema: receiptSchema,
        status: "blocked",
        reason,
        changed_path_count: Number.isInteger(gitState?.changed_path_count)
          ? gitState.changed_path_count
          : undefined,
        requested_providers: options.providers,
        requested_kinds: options.kinds,
        artifact_id: options.artifact,
        started_at: new Date(startedAtMs).toISOString(),
        finished_at: new Date(finishedAtMs).toISOString(),
        duration_ms: Math.max(0, finishedAtMs - startedAtMs),
      }),
    });
  }
  const gitSha = gitState.git_sha;
  if (!/^[0-9a-f]{40}$/.test(gitSha)) {
    throw new Error("Clean Git preflight did not return an exact commit SHA.");
  }
  const descriptors = dependencies.authDescriptors ?? authDescriptors;
  const missingProviders = options.providers.filter((provider) => !descriptors[provider](env).configured);
  if (missingProviders.length > 0) {
    const finishedAtMs = now();
    return Object.freeze({
      exitCode: 2,
      receipt: Object.freeze({
        schema: receiptSchema,
        status: "blocked",
        reason: "PROVIDER_CREDENTIALS_MISSING",
        missing_providers: Object.freeze(missingProviders),
        requested_providers: options.providers,
        requested_kinds: options.kinds,
        artifact_id: options.artifact,
        git_sha: gitSha,
        started_at: new Date(startedAtMs).toISOString(),
        finished_at: new Date(finishedAtMs).toISOString(),
        duration_ms: Math.max(0, finishedAtMs - startedAtMs),
      }),
    });
  }

  const publish = dependencies.publish ?? runExportPublish;
  const readArtifact = dependencies.readArtifact ?? readExportArtifact;
  const makeLedgerPath = dependencies.createIsolatedLedgerPath ?? createIsolatedLedgerPath;
  const verifyLedger = dependencies.verifyLedger ?? verifyFleetLedger;
  const artifactBefore = await readArtifact(options.artifact, { repoRoot: currentRepoRoot });
  const ledgerPath = await makeLedgerPath();
  const runtimeEnv = {
    ...env,
    AGENTIC_OS_EXPORT_FLEET_PATH: ledgerPath,
    AGENTIC_OS_EXPORT_MICROSOFT_FALLBACK_ENABLED: "false",
  };
  const runtimeOptions = { env: runtimeEnv, repoRoot: currentRepoRoot };
  const checks = [];

  for (const provider of options.providers) {
    for (const kind of options.kinds) {
      const input = { artifact_id: options.artifact, kind, target_provider: provider };
      const first = await timedPublish({ publish, input, runtimeOptions, now });
      assertLiveReceipt({ result: first.result, provider, kind, sourceSha: artifactBefore.source_sha256 });
      const second = await timedPublish({ publish, input, runtimeOptions, now });
      assertLiveReceipt({ result: second.result, provider, kind, sourceSha: artifactBefore.source_sha256 });
      if (first.result.doc_id !== second.result.doc_id) {
        throw new Error(`${provider}/${kind} created a second document instead of updating in place.`);
      }
      checks.push(Object.freeze({
        provider,
        kind,
        stable_document_identity: true,
        first: publicRunReceipt(first),
        second: publicRunReceipt(second),
      }));
    }
  }

  const artifactAfter = await readArtifact(options.artifact, { repoRoot: currentRepoRoot });
  if (artifactAfter.source_sha256 !== artifactBefore.source_sha256) {
    throw new Error("The source artifact changed during live provider verification.");
  }
  const ledger = await verifyLedger({ ledgerPath, env: runtimeEnv, repoRoot: currentRepoRoot });
  const expectedEntryCount = options.providers.length * options.kinds.length * 2;
  if (ledger.entry_count !== expectedEntryCount) {
    throw new Error(`The isolated ledger contains ${ledger.entry_count} entries; expected ${expectedEntryCount}.`);
  }
  const finalGitState = await getGitState(currentRepoRoot);
  if (finalGitState?.clean !== true || finalGitState.git_sha !== gitSha) {
    throw new Error("Git state changed during live provider verification.");
  }
  const finishedAtMs = now();
  return Object.freeze({
    exitCode: 0,
    receipt: Object.freeze({
      schema: receiptSchema,
      status: "passed",
      artifact_id: options.artifact,
      source_sha256: artifactBefore.source_sha256,
      git_sha: gitSha,
      providers: options.providers,
      kinds: options.kinds,
      started_at: new Date(startedAtMs).toISOString(),
      finished_at: new Date(finishedAtMs).toISOString(),
      duration_ms: Math.max(0, finishedAtMs - startedAtMs),
      isolated_ledger: Object.freeze({
        path: ledgerPath,
        entry_count: ledger.entry_count,
        head_hash: ledger.head_hash,
      }),
      checks: Object.freeze(checks),
    }),
  });
}

export async function runLiveExportVerificationCli(argv, dependencies = {}) {
  const options = parseLiveVerificationArgs(argv);
  const io = dependencies.io ?? console;
  if (options.help) {
    io.log(EXPORT_LIVE_USAGE);
    return Object.freeze({ exitCode: 0, receipt: null });
  }
  const outcome = await runLiveExportVerification(options, dependencies);
  io.log(JSON.stringify(outcome.receipt));
  return outcome;
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runLiveExportVerificationCli(process.argv.slice(2)).then(({ exitCode }) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(JSON.stringify({
      schema: receiptSchema,
      status: "failed",
      error: {
        code: String(error?.code || "LIVE_EXPORT_VERIFICATION_FAILED").slice(0, 128),
        message: safeErrorMessage(error),
      },
    }));
    process.exitCode = 1;
  });
}
