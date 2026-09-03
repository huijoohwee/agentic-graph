import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  formatExportCliFailure,
  parseExportPublishArgs,
  runExportPublishCli,
} from "../export-publish.mjs";
import {
  parseLiveVerificationArgs,
  resolveCleanGitState,
  runLiveExportVerification,
} from "../verify-export-live.mjs";

const sourceSha = "a".repeat(64);
const gitSha = "b".repeat(40);
const execFileAsync = promisify(execFile);

test("export publish CLI validates the bounded artifact, kind, and provider surface", () => {
  assert.deepEqual(
    parseExportPublishArgs([
      "--artifact", "docs/source.md",
      "--kind", "spreadsheet",
      "--provider", "microsoft",
      "--json",
    ]),
    {
      artifact: "docs/source.md",
      kind: "spreadsheet",
      provider: "microsoft",
      json: true,
      help: false,
    },
  );
  assert.throws(
    () => parseExportPublishArgs(["--artifact", "docs/source.md", "--kind", "pdf"]),
    /spreadsheet or slides/,
  );
  assert.throws(
    () => parseExportPublishArgs(["--artifact", "docs/source.md", "--kind", "slides", "--token", "secret"]),
    /Unsupported argument/,
  );
});

test("export publish CLI invokes the canonical runtime and emits its JSON receipt", async () => {
  const calls = [];
  const logs = [];
  const result = {
    artifact_id: "docs/source.md",
    kind: "slides",
    provider: "google",
    doc_id: "google-slides-document",
    url: "https://docs.google.com/presentation/d/google-slides-document/edit",
    source_sha256: sourceSha,
    fallback_used: false,
  };
  const outcome = await runExportPublishCli([
    "--artifact", "docs/source.md",
    "--kind", "slides",
    "--provider", "google",
    "--json",
  ], {
    repoRoot: "/repo",
    publish: async (...args) => {
      calls.push(args);
      return result;
    },
    io: { log: (value) => logs.push(value) },
  });
  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(calls, [[{
    artifact_id: "docs/source.md",
    kind: "slides",
    target_provider: "google",
  }, { repoRoot: "/repo" }]]);
  assert.deepEqual(JSON.parse(logs[0]), result);
});

test("export CLI error formatting redacts credential-shaped values", () => {
  const failure = formatExportCliFailure(new Error(
    "Bearer live-token client_secret=also-secret refresh_token: third-secret"
      + " https://example.test/?api_key=query-api&token=query-token&code=query-code&sig=query-sig&password=query-password",
  ));
  assert.equal(failure.status, "failed");
  assert.doesNotMatch(
    JSON.stringify(failure),
    /live-token|also-secret|third-secret|query-api|query-token|query-code|query-sig|query-password/,
  );
});

test("live verifier accepts provider and kind lists without duplicate invocations", () => {
  assert.deepEqual(
    parseLiveVerificationArgs([
      "--artifact", "docs/source.md",
      "--providers", "google,microsoft,google",
      "--kinds", "slides,spreadsheet,slides",
    ]),
    {
      artifact: "docs/source.md",
      providers: ["google", "microsoft"],
      kinds: ["slides", "spreadsheet"],
      help: false,
    },
  );
});

test("live Git preflight returns only a clean exact SHA and detects untracked changes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-git-state-"));
  try {
    await execFileAsync("git", ["init", "--quiet"], { cwd: directory });
    await fs.writeFile(path.join(directory, "source.md"), "# Source\n", "utf8");
    await execFileAsync("git", ["add", "source.md"], { cwd: directory });
    await execFileAsync("git", [
      "-c", "user.name=agentic-graph Test",
      "-c", "user.email=agentic-graph-test@example.invalid",
      "commit", "--quiet", "-m", "test source",
    ], { cwd: directory });

    const clean = await resolveCleanGitState(directory);
    assert.equal(clean.clean, true);
    assert.match(clean.git_sha, /^[0-9a-f]{40}$/);

    await fs.writeFile(path.join(directory, "untracked.md"), "dirty\n", "utf8");
    const dirty = await resolveCleanGitState(directory);
    assert.deepEqual(dirty, {
      clean: false,
      reason: "GIT_WORKTREE_DIRTY",
      changed_path_count: 1,
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("live verifier blocks before artifact, ledger, or provider calls when credentials are absent", async () => {
  let calls = 0;
  const outcome = await runLiveExportVerification({
    artifact: "docs/source.md",
    providers: ["google", "microsoft"],
    kinds: ["spreadsheet", "slides"],
  }, {
    env: {},
    now: () => Date.parse("2026-07-19T00:00:00.000Z"),
    resolveGitState: async () => ({ clean: true, git_sha: gitSha }),
    authDescriptors: {
      google: () => ({ configured: false }),
      microsoft: () => ({ configured: false }),
    },
    readArtifact: async () => { calls += 1; },
    publish: async () => { calls += 1; },
    createIsolatedLedgerPath: async () => { calls += 1; },
  });
  assert.equal(outcome.exitCode, 2);
  assert.equal(outcome.receipt.status, "blocked");
  assert.deepEqual(outcome.receipt.missing_providers, ["google", "microsoft"]);
  assert.equal(calls, 0);
  assert.doesNotMatch(JSON.stringify(outcome.receipt), /token|secret/i);
});

test("live verifier blocks a dirty Git tree before auth, artifact, ledger, or provider calls", async () => {
  const calls = [];
  const outcome = await runLiveExportVerification({
    artifact: "docs/source.md",
    providers: ["google", "microsoft"],
    kinds: ["spreadsheet", "slides"],
  }, {
    env: {},
    now: () => Date.parse("2026-07-19T00:00:00.000Z"),
    resolveGitState: async () => ({
      clean: false,
      reason: "GIT_WORKTREE_DIRTY",
      changed_path_count: 3,
    }),
    authDescriptors: {
      google: () => { calls.push("google-auth"); return { configured: true }; },
      microsoft: () => { calls.push("microsoft-auth"); return { configured: true }; },
    },
    readArtifact: async () => { calls.push("artifact"); },
    publish: async () => { calls.push("provider"); },
    createIsolatedLedgerPath: async () => { calls.push("ledger-create"); },
    verifyLedger: async () => { calls.push("ledger-verify"); },
  });

  assert.equal(outcome.exitCode, 2);
  assert.equal(outcome.receipt.status, "blocked");
  assert.equal(outcome.receipt.reason, "GIT_WORKTREE_DIRTY");
  assert.equal(outcome.receipt.changed_path_count, 3);
  assert.equal(outcome.receipt.git_sha, undefined);
  assert.deepEqual(calls, []);
});

test("live verifier fails closed when clean Git preflight lacks an exact SHA", async () => {
  let calls = 0;
  await assert.rejects(
    runLiveExportVerification({
      artifact: "docs/source.md",
      providers: ["google"],
      kinds: ["slides"],
    }, {
      resolveGitState: async () => ({ clean: true, git_sha: "main" }),
      authDescriptors: { google: () => { calls += 1; return { configured: true }; } },
      readArtifact: async () => { calls += 1; },
      publish: async () => { calls += 1; },
      createIsolatedLedgerPath: async () => { calls += 1; },
    }),
    /exact commit SHA/,
  );
  assert.equal(calls, 0);
});

test("live verifier runs every provider and kind twice and proves stable document identity", async () => {
  const calls = [];
  let currentTime = Date.parse("2026-07-19T00:00:00.000Z");
  const outcome = await runLiveExportVerification({
    artifact: "docs/source.md",
    providers: ["google", "microsoft"],
    kinds: ["spreadsheet", "slides"],
  }, {
    env: { PROVIDER_TEST_SENTINEL: "present" },
    now: () => {
      currentTime += 5;
      return currentTime;
    },
    repoRoot: "/repo",
    resolveGitState: async () => ({ clean: true, git_sha: gitSha }),
    authDescriptors: {
      google: () => ({ configured: true }),
      microsoft: () => ({ configured: true }),
    },
    readArtifact: async () => ({ source_sha256: sourceSha }),
    createIsolatedLedgerPath: async () => "/tmp/isolated-export-proof/FLEET.md",
    publish: async (input, runtimeOptions) => {
      calls.push({ input, runtimeOptions });
      const docId = `${input.target_provider}-${input.kind}-document`;
      return {
        ...input,
        provider: input.target_provider,
        doc_id: docId,
        url: `https://example.test/${input.target_provider}/${input.kind}/${docId}`,
        source_sha256: sourceSha,
        fallback_used: false,
      };
    },
    verifyLedger: async ({ ledgerPath }) => ({
      ledger_path: ledgerPath,
      entry_count: 8,
      head_hash: "c".repeat(64),
    }),
  });

  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.receipt.status, "passed");
  assert.equal(outcome.receipt.git_sha, gitSha);
  assert.equal(outcome.receipt.checks.length, 4);
  assert.ok(outcome.receipt.checks.every((check) => check.stable_document_identity));
  assert.equal(calls.length, 8);
  assert.ok(calls.every(({ runtimeOptions }) => (
    runtimeOptions.env.AGENTIC_OS_EXPORT_FLEET_PATH === "/tmp/isolated-export-proof/FLEET.md"
    && runtimeOptions.env.AGENTIC_OS_EXPORT_MICROSOFT_FALLBACK_ENABLED === "false"
  )));
  assert.deepEqual(
    calls.map(({ input }) => `${input.target_provider}/${input.kind}`),
    [
      "google/spreadsheet", "google/spreadsheet",
      "google/slides", "google/slides",
      "microsoft/spreadsheet", "microsoft/spreadsheet",
      "microsoft/slides", "microsoft/slides",
    ],
  );
});

test("live verifier rejects Git drift that occurs during provider publication", async () => {
  let gitReads = 0;
  await assert.rejects(
    runLiveExportVerification({
      artifact: "docs/source.md",
      providers: ["google"],
      kinds: ["spreadsheet"],
    }, {
      resolveGitState: async () => {
        gitReads += 1;
        return gitReads === 1
          ? { clean: true, git_sha: gitSha }
          : { clean: false, reason: "GIT_WORKTREE_DIRTY", changed_path_count: 1 };
      },
      authDescriptors: { google: () => ({ configured: true }) },
      readArtifact: async () => ({ source_sha256: sourceSha }),
      createIsolatedLedgerPath: async () => "/tmp/isolated-export-proof/FLEET.md",
      publish: async (input) => ({
        ...input,
        provider: "google",
        doc_id: "stable-google-sheet",
        url: "https://docs.google.com/spreadsheets/d/stable-google-sheet/edit",
        source_sha256: sourceSha,
        fallback_used: false,
      }),
      verifyLedger: async () => ({ entry_count: 2, head_hash: "c".repeat(64) }),
    }),
    /Git state changed during live provider verification/,
  );
  assert.equal(gitReads, 2);
});

test("live verifier rejects a provider that creates a second document on rerun", async () => {
  let invocation = 0;
  await assert.rejects(
    runLiveExportVerification({
      artifact: "docs/source.md",
      providers: ["google"],
      kinds: ["slides"],
    }, {
      env: {},
      now: () => Date.parse("2026-07-19T00:00:00.000Z"),
      resolveGitState: async () => ({ clean: true, git_sha: gitSha }),
      authDescriptors: { google: () => ({ configured: true }) },
      readArtifact: async () => ({ source_sha256: sourceSha }),
      createIsolatedLedgerPath: async () => "/tmp/isolated-export-proof/FLEET.md",
      publish: async (input) => {
        invocation += 1;
        return {
          ...input,
          provider: "google",
          doc_id: `document-${invocation}`,
          url: `https://docs.google.com/presentation/d/document-${invocation}/edit`,
          source_sha256: sourceSha,
          fallback_used: false,
        };
      },
    }),
    /created a second document/,
  );
});
