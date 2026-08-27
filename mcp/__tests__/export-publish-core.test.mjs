import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXPORT_PUBLISH_CONTRACT_VERSION,
  ExportPublishError,
  createExportIdentity,
  validateExportPublishRequest,
  validateExportPublishResult,
} from "../export-publish-contract.js";
import {
  parseExportArtifactFrontmatter,
  readExportArtifact,
} from "../export-artifact-reader.js";

const withTempDir = async (callback) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-export-core-"));
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

test("export.publish request validation applies Google default and rejects shape drift", () => {
  assert.deepEqual(
    validateExportPublishRequest({ artifact_id: "docs/model.md", kind: "spreadsheet" }),
    { artifact_id: "docs/model.md", kind: "spreadsheet", target_provider: "google" },
  );
  assert.deepEqual(
    validateExportPublishRequest({ artifact_id: "docs/deck.md", kind: "slides", target_provider: "microsoft" }),
    { artifact_id: "docs/deck.md", kind: "slides", target_provider: "microsoft" },
  );
  assert.throws(
    () => validateExportPublishRequest({ artifact_id: "docs/deck.md", kind: "document" }),
    (error) => error instanceof ExportPublishError && error.code === "INVALID_EXPORT_REQUEST",
  );
  assert.throws(
    () => validateExportPublishRequest({ artifact_id: "docs/deck.md", kind: "slides", token: "forbidden" }),
    /Unsupported field/,
  );
  assert.throws(
    () => validateExportPublishRequest({ artifact_id: "docs/deck.md\nforged", kind: "slides" }),
    /control characters/,
  );
});

test("export.publish result validation preserves the canonical provider-neutral response", () => {
  const sourceSha = "a".repeat(64);
  const result = validateExportPublishResult({
    schema: EXPORT_PUBLISH_CONTRACT_VERSION,
    artifact_id: "docs/deck.md",
    kind: "slides",
    provider: "google",
    doc_id: "presentation-123",
    url: "https://docs.google.com/presentation/d/presentation-123/edit",
    url_or_file_id: "https://docs.google.com/presentation/d/presentation-123/edit",
    fallback_used: false,
    source_sha256: sourceSha,
  });
  assert.equal(result.provider, "google");
  assert.equal(result.source_sha256, sourceSha);
  assert.throws(
    () => validateExportPublishResult({ ...result, url: "http://example.test/deck" }),
    (error) => error.code === "INVALID_EXPORT_RESULT",
  );
});

test("export identities include artifact, provider, and kind without delimiter collisions", () => {
  const first = createExportIdentity({ artifact_id: "docs/a::b.md", provider: "google", kind: "slides" });
  const second = createExportIdentity({ artifact_id: "docs/a.md", provider: "google", kind: "spreadsheet" });
  assert.equal(first.key, '["docs/a::b.md","google","slides"]');
  assert.notEqual(first.key, second.key);
});

test("artifact reader returns bounded Markdown, required title, and source digest without mutation", async () => {
  await withTempDir(async (repoRoot) => {
    await fs.mkdir(path.join(repoRoot, "docs"));
    const source = `---\ntitle: "Investor Model"\ndoc_type: financial-model\n---\n\n# Model\n\n| Year | Revenue |\n|---|---:|\n| 1 | 100 |\n`;
    const filePath = path.join(repoRoot, "docs", "model.md");
    await fs.writeFile(filePath, source, "utf8");
    const before = await fs.readFile(filePath);
    const artifact = await readExportArtifact("docs/model.md", { repoRoot });
    const after = await fs.readFile(filePath);
    assert.equal(artifact.title, "Investor Model");
    assert.match(artifact.body, /^# Model/);
    assert.equal(artifact.source_sha256, createHash("sha256").update(before).digest("hex"));
    assert.deepEqual(after, before);
  });
});

test("artifact frontmatter parser supports YAML quoting and rejects missing title or credential fields", () => {
  assert.equal(
    parseExportArtifactFrontmatter("---\ntitle: 'Founder''s Deck'\ntags:\n  - investor\n---\n# Deck\n").title,
    "Founder's Deck",
  );
  assert.throws(
    () => parseExportArtifactFrontmatter("---\ntype: deck\n---\n# Deck\n"),
    (error) => error.code === "ARTIFACT_INVALID" && /requires title/.test(error.message),
  );
  assert.throws(
    () => parseExportArtifactFrontmatter("---\ntitle: Deck\nrefresh_token: unsafe\n---\n# Deck\n"),
    /must not contain credential field/,
  );
  assert.throws(
    () => parseExportArtifactFrontmatter("---\ntitle: Deck\nprovider:\n  client_secret: unsafe\n---\n# Deck\n"),
    /must not contain credential field/,
  );
  for (const credentialKey of ["google_client_secret", "oauth_access_token", "provider.private-key"]) {
    assert.throws(
      () => parseExportArtifactFrontmatter(`---\ntitle: Deck\n${credentialKey}: unsafe\n---\n# Deck\n`),
      /must not contain credential field/,
    );
  }
});

test("artifact reader rejects traversal, symlink escapes, missing files, and oversize inputs", async () => {
  await withTempDir(async (repoRoot) => {
    await fs.mkdir(path.join(repoRoot, "docs"));
    await fs.writeFile(path.join(repoRoot, "docs", "large.md"), "---\ntitle: Large\n---\n# 123456789\n", "utf8");
    const outsidePath = path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-outside.md`);
    await fs.writeFile(outsidePath, "---\ntitle: Outside\n---\n# Outside\n", "utf8");
    await fs.symlink(outsidePath, path.join(repoRoot, "docs", "escape.md"));
    try {
      await assert.rejects(readExportArtifact("../outside.md", { repoRoot }), (error) => error.code === "ARTIFACT_INVALID");
      await assert.rejects(readExportArtifact("docs/escape.md", { repoRoot }), (error) => error.code === "ARTIFACT_INVALID");
      await assert.rejects(readExportArtifact("docs/missing.md", { repoRoot }), (error) => error.code === "ARTIFACT_NOT_FOUND");
      await assert.rejects(readExportArtifact("docs/large.md", { repoRoot, maxBytes: 16 }), (error) => error.code === "ARTIFACT_INVALID");
    } finally {
      await fs.rm(outsidePath, { force: true });
    }
  });
});
