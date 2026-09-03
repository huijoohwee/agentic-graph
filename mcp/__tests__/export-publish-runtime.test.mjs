import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readExportArtifact } from "../export-artifact-reader.js";
import { acquireExportIdentityLock } from "../export-identity-lock.js";
import { createExportIdentity } from "../export-publish-contract.js";
import { ExportProviderError } from "../export-provider-http.js";
import { runExportPublish, runExportPublishTool } from "../export-publish-runtime.js";

const artifact = Object.freeze({
  artifact_id: "docs/investor-pack.md",
  title: "Investor Pack",
  body: "# Thesis\n\n- Durable demand",
  markdown: "---\ntitle: Investor Pack\n---\n\n# Thesis\n\n- Durable demand\n",
  source_sha256: "c".repeat(64),
});

const receipt = (provider, suffix = "1") => ({
  provider,
  externalId: `${provider}-${suffix}`,
  url: provider === "google"
    ? `https://docs.google.com/presentation/d/${provider}-${suffix}/edit`
    : `https://onedrive.live.com/?id=${provider}-${suffix}`,
  mimeType: provider === "google"
    ? "application/vnd.google-apps.presentation"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  created: true,
  apiCalls: 3,
  cleanup: async () => true,
});

const runtimeOptions = ({ adapters, ledgerWrites = [], readArtifact, ...overrides }) => ({
  env: {},
  adapters,
  readArtifact: readArtifact || (async () => artifact),
  findLatest: async () => null,
  appendLedger: async (entry) => {
    ledgerWrites.push(entry);
    return entry;
  },
  ...overrides,
});

test("missing credentials fail closed before outbound calls and write no ledger identity", async () => {
  let outboundCalls = 0;
  let ledgerWrites = 0;
  const fetchImpl = async () => {
    outboundCalls += 1;
    throw new Error("fetch must not run");
  };

  await assert.rejects(
    runExportPublish(
      { artifact_id: artifact.artifact_id, kind: "slides" },
      {
        env: {},
        readArtifact: async () => artifact,
        fetchImpl,
        appendLedger: async () => { ledgerWrites += 1; },
      },
    ),
    (error) => error.code === "PROVIDER_NOT_CONFIGURED",
  );
  assert.equal(outboundCalls, 0);
  assert.equal(ledgerWrites, 0);
});

test("a transient Google failure falls back once to Microsoft and reports fallback_used=true", async () => {
  const attempts = [];
  const ledgerWrites = [];
  const adapters = {
    google: {
      isConfigured: () => true,
      publish: async () => {
        attempts.push("google");
        throw new ExportProviderError("Quota temporarily exhausted", {
          provider: "google",
          code: "PROVIDER_HTTP_ERROR",
          status: 429,
          retryable: true,
        });
      },
    },
    microsoft: {
      isConfigured: () => true,
      publish: async () => {
        attempts.push("microsoft");
        return receipt("microsoft");
      },
    },
  };

  const result = await runExportPublish(
    { artifact_id: artifact.artifact_id, kind: "slides" },
    runtimeOptions({ adapters, ledgerWrites }),
  );

  assert.deepEqual(attempts, ["google", "microsoft"]);
  assert.equal(result.provider, "microsoft");
  assert.equal(result.fallback_used, true);
  assert.equal(ledgerWrites.length, 1);
  assert.equal(ledgerWrites[0].status, "success");
  assert.equal(ledgerWrites[0].fallback_used, true);
  assert.equal(ledgerWrites[0].doc_id, "microsoft-1");
});

test("an explicit Microsoft request skips Google and reports fallback_used=false", async () => {
  let googleCalls = 0;
  let microsoftCalls = 0;
  const ledgerWrites = [];
  const adapters = {
    google: {
      isConfigured: () => true,
      publish: async () => { googleCalls += 1; },
    },
    microsoft: {
      isConfigured: () => true,
      publish: async () => {
        microsoftCalls += 1;
        return receipt("microsoft", "explicit");
      },
    },
  };

  const result = await runExportPublish(
    { artifact_id: artifact.artifact_id, kind: "slides", target_provider: "microsoft" },
    runtimeOptions({ adapters, ledgerWrites }),
  );

  assert.equal(googleCalls, 0);
  assert.equal(microsoftCalls, 1);
  assert.equal(result.provider, "microsoft");
  assert.equal(result.fallback_used, false);
  assert.equal(ledgerWrites[0].fallback_used, false);
});

test("a non-retryable Google failure does not invoke Microsoft fallback", async () => {
  let microsoftCalls = 0;
  const ledgerWrites = [];
  const adapters = {
    google: {
      isConfigured: () => true,
      publish: async () => {
        throw new ExportProviderError("Invalid range", {
          provider: "google",
          code: "PROVIDER_HTTP_ERROR",
          status: 400,
          retryable: false,
        });
      },
    },
    microsoft: {
      isConfigured: () => true,
      publish: async () => {
        microsoftCalls += 1;
        return receipt("microsoft");
      },
    },
  };

  await assert.rejects(
    runExportPublish(
      { artifact_id: artifact.artifact_id, kind: "slides" },
      runtimeOptions({ adapters, ledgerWrites }),
    ),
    (error) => error.code === "EXPORT_FAILED"
      && error.details.attempts.length === 1
      && error.details.attempts[0].provider === "google",
  );
  assert.equal(microsoftCalls, 0);
  assert.equal(ledgerWrites.length, 1);
  assert.equal(ledgerWrites[0].provider, "google");
  assert.equal(ledgerWrites[0].status, "failure");
  assert.equal(Object.hasOwn(ledgerWrites[0], "doc_id"), false);
});

test("two provider failures return a bounded typed tool error and no doc_id ledger field", async () => {
  const attempts = [];
  const ledgerWrites = [];
  const adapters = {
    google: {
      isConfigured: () => true,
      publish: async () => {
        attempts.push("google");
        throw new ExportProviderError("Gateway unavailable", {
          provider: "google",
          code: "PROVIDER_NETWORK_ERROR",
          retryable: true,
        });
      },
    },
    microsoft: {
      isConfigured: () => true,
      publish: async () => {
        attempts.push("microsoft");
        throw new ExportProviderError('Graph rejected the upload client_secret: "must-not-leak"', {
          provider: "microsoft",
          code: "PROVIDER_HTTP_ERROR",
          status: 403,
        });
      },
    },
  };

  const toolResult = await runExportPublishTool(
    { artifact_id: artifact.artifact_id, kind: "slides" },
    runtimeOptions({ adapters, ledgerWrites }),
  );

  assert.deepEqual(attempts, ["google", "microsoft"]);
  assert.equal(toolResult.isError, true);
  assert.equal(toolResult.payload.error.code, "EXPORT_FAILED");
  assert.equal(toolResult.payload.error.provider, "microsoft");
  assert.doesNotMatch(JSON.stringify(toolResult.payload), /must-not-leak/);
  assert.deepEqual(
    toolResult.payload.error.details.attempts.map((failure) => failure.provider),
    ["google", "microsoft"],
  );
  assert.equal(ledgerWrites.length, 1);
  assert.equal(ledgerWrites[0].status, "failure");
  assert.equal(ledgerWrites[0].api_calls, 0);
  assert.equal(Object.hasOwn(ledgerWrites[0], "doc_id"), false);
  assert.equal(Object.hasOwn(ledgerWrites[0], "url"), false);
});

test("source hash drift rejects the receipt and compensates a newly-created external artifact", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-source-guard-"));
  const artifactPath = path.join(repoRoot, "docs", "deck.md");
  let cleanupCalls = 0;
  const ledgerWrites = [];
  try {
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, "---\ntitle: Deck\n---\n\n# Original\n\n- Stable\n", "utf8");
    const adapters = {
      google: { isConfigured: () => false, publish: async () => null },
      microsoft: {
        isConfigured: () => true,
        publish: async () => {
          await fs.writeFile(artifactPath, "---\ntitle: Deck\n---\n\n# Changed during publish\n", "utf8");
          return {
            ...receipt("microsoft", "source-drift"),
            cleanup: async () => { cleanupCalls += 1; return true; },
          };
        },
      },
    };

    await assert.rejects(
      runExportPublish(
        { artifact_id: "docs/deck.md", kind: "slides", target_provider: "microsoft" },
        runtimeOptions({
          adapters,
          ledgerWrites,
          repoRoot,
          readArtifact: readExportArtifact,
        }),
      ),
      (error) => error.code === "EXPORT_FAILED"
        && error.details.attempts[0].code === "EXPORT_FAILED",
    );
    assert.equal(cleanupCalls, 1);
    assert.equal(ledgerWrites.length, 1);
    assert.equal(ledgerWrites[0].status, "failure");
    assert.equal(Object.hasOwn(ledgerWrites[0], "doc_id"), false);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("concurrent first publishes across distinct ledgers serialize lookup through append", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-identity-race-"));
  let activePublishes = 0;
  let maximumActivePublishes = 0;
  let createdArtifacts = 0;
  let latest = null;
  const existingIds = [];
  try {
    const adapters = {
      google: {
        isConfigured: () => true,
        publish: async ({ existing }) => {
          activePublishes += 1;
          maximumActivePublishes = Math.max(maximumActivePublishes, activePublishes);
          existingIds.push(existing?.external_id ?? null);
          const created = !existing;
          const externalId = existing?.external_id ?? `google-${++createdArtifacts}`;
          await new Promise((resolve) => setTimeout(resolve, 30));
          activePublishes -= 1;
          return { ...receipt("google", externalId.replace("google-", "")), externalId, created };
        },
      },
      microsoft: { isConfigured: () => false, publish: async () => null },
    };
    const sharedOptions = runtimeOptions({
      adapters,
      publicationNamespace: path.join(directory, "repository"),
      identityLockOptions: {
        lockRoot: path.join(directory, "locks"),
        timeoutMs: 1_000,
        retryMs: 5,
      },
      findLatest: async () => latest,
      appendLedger: async (entry) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        latest = { ...entry, external_id: entry.doc_id };
        return entry;
      },
    });

    const results = await Promise.all([
      runExportPublish(
        { artifact_id: artifact.artifact_id, kind: "slides" },
        { ...sharedOptions, ledgerPath: path.join(directory, "canonical-FLEET.md") },
      ),
      runExportPublish(
        { artifact_id: artifact.artifact_id, kind: "slides" },
        { ...sharedOptions, ledgerPath: path.join(directory, "live-proof-FLEET.md") },
      ),
    ]);

    assert.equal(maximumActivePublishes, 1);
    assert.equal(createdArtifacts, 1);
    assert.deepEqual(existingIds, [null, "google-1"]);
    assert.deepEqual(results.map((result) => result.doc_id), ["google-1", "google-1"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("the same identity in distinct repository namespaces does not collide", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-identity-namespace-"));
  const lockRoot = path.join(directory, "locks");
  const identityKey = createExportIdentity({
    artifact_id: artifact.artifact_id,
    provider: "google",
    kind: "slides",
  }).key;
  let releaseFirst;
  let releaseSecond;
  try {
    releaseFirst = await acquireExportIdentityLock({
      identityKey,
      publicationNamespace: path.join(directory, "repository-a"),
    }, { lockRoot, timeoutMs: 100, retryMs: 5 });
    releaseSecond = await acquireExportIdentityLock({
      identityKey,
      publicationNamespace: path.join(directory, "repository-b"),
    }, { lockRoot, timeoutMs: 30, retryMs: 5 });
  } finally {
    if (releaseSecond) await releaseSecond();
    if (releaseFirst) await releaseFirst();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a live identity owner forces a bounded fail-closed timeout", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-identity-timeout-"));
  const publicationNamespace = path.join(directory, "repository");
  const lockRoot = path.join(directory, "locks");
  const identity = createExportIdentity({
    artifact_id: artifact.artifact_id,
    provider: "google",
    kind: "slides",
  });
  const release = await acquireExportIdentityLock({ identityKey: identity.key, publicationNamespace }, {
    lockRoot,
    timeoutMs: 100,
    retryMs: 5,
    staleMs: 1,
  });
  let providerCalls = 0;
  try {
    const toolResult = await runExportPublishTool(
      { artifact_id: artifact.artifact_id, kind: "slides" },
      runtimeOptions({
        adapters: {
          google: {
            isConfigured: () => true,
            publish: async () => { providerCalls += 1; return receipt("google"); },
          },
          microsoft: { isConfigured: () => false, publish: async () => null },
        },
        publicationNamespace,
        identityLockOptions: { lockRoot, timeoutMs: 30, retryMs: 5, staleMs: 1 },
      }),
    );
    assert.equal(toolResult.isError, true);
    assert.equal(toolResult.payload.error.code, "LEDGER_LOCK_TIMEOUT");
    assert.equal(providerCalls, 0);
  } finally {
    await release();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a demonstrably dead cross-process owner is recovered after the stale bound", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-identity-stale-"));
  const publicationNamespace = path.join(directory, "repository");
  const lockRoot = path.join(directory, "locks");
  const identityKey = createExportIdentity({
    artifact_id: artifact.artifact_id,
    provider: "google",
    kind: "slides",
  }).key;
  const moduleUrl = new URL("../export-identity-lock.js", import.meta.url).href;
  const childScript = `
    import { acquireExportIdentityLock } from ${JSON.stringify(moduleUrl)};
    await acquireExportIdentityLock(
      ${JSON.stringify({ identityKey, publicationNamespace })},
      ${JSON.stringify({ lockRoot, timeoutMs: 500, retryMs: 5, staleMs: 1 })},
    );
    process.stdout.write("LOCKED\\n");
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", childScript], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childStderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { childStderr += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`child lock acquisition timed out: ${childStderr}`)), 2_000);
      child.stdout.setEncoding("utf8");
      child.stdout.once("data", (chunk) => {
        clearTimeout(timer);
        if (chunk.includes("LOCKED")) resolve();
        else reject(new Error(`unexpected child output: ${chunk}`));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`child exited before acquiring lock (${code}): ${childStderr}`));
      });
    });
    child.kill("SIGKILL");
    await once(child, "exit");
    await new Promise((resolve) => setTimeout(resolve, 5));

    const release = await acquireExportIdentityLock({ identityKey, publicationNamespace }, {
      lockRoot,
      timeoutMs: 1_000,
      retryMs: 5,
      staleMs: 1,
    });
    await release();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await fs.rm(directory, { recursive: true, force: true });
  }
});
