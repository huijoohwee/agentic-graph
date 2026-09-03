// =============================================================================
// Media artifact contract SSOT — unit tests
// agentic-graph-widget-canvas-media spec · Task 1 · Requirements R3.3, R3.4, R3.5, R6.1
// Pure helpers/validators: ZERO network calls, deterministic (sha256 via WebCrypto).
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AGENTIC_OS_CLOUDFLARE_ACCOUNT_ID,
  AGENTIC_OS_MEDIA_BUCKET,
  AGENTIC_OS_MEDIA_HOST,
  AGENTIC_OS_MEDIA_ROUTE_PREFIX,
  RESPONSIVE_PROOF_CLASSES,
  MEDIA_LOGICAL_FRAME,
  FORBIDDEN_EPHEMERAL_FIELDS,
  mediaObjectKey,
  buildDurableR2Url,
  isDurableR2Url,
  sha256Hex,
  validateProvenanceChain,
  validateResponsiveLayoutMetadata,
  validateArtifactRecord,
  buildProvenanceChain,
  createArtifactRecord,
} from "../media-artifact.schema.js";

// Reachable via the aggregate entry point too (SSOT).
import * as contracts from "../index.js";

const pathsOf = (result) => result.errors.map((e) => e.path);

function completeProvenance(overrides = {}) {
  return buildProvenanceChain({
    goalRef: "goal:demo",
    briefRef: "brief:demo",
    planRef: "plan:demo",
    toolCalls: [{ tool: "image", inputHash: "abc", outputRef: "art:1" }],
    verificationChecks: [{ checkId: "persist", status: "passed" }],
    ...overrides,
  });
}

function completeRecord(overrides = {}) {
  return createArtifactRecord({
    runId: "run1",
    stageId: "render",
    shotId: "shot1",
    ext: "png",
    kind: "image",
    contentHash: "deadbeef",
    version: 1,
    provenance: completeProvenance(),
    ...overrides,
  });
}

// --- 0. SSOT reachability + stable constants --------------------------------

test("media-artifact contract is re-exported from the aggregate entry point", () => {
  assert.equal(typeof contracts.mediaObjectKey, "function");
  assert.equal(typeof contracts.buildDurableR2Url, "function");
  assert.equal(typeof contracts.validateArtifactRecord, "function");
  assert.equal(contracts.AGENTIC_OS_MEDIA_BUCKET, AGENTIC_OS_MEDIA_BUCKET);
});

test("canonical Cloudflare storage constants are fixed", () => {
  assert.equal(AGENTIC_OS_CLOUDFLARE_ACCOUNT_ID, "170e89fdb8679ff2fcc2900e25ed04f4");
  assert.equal(AGENTIC_OS_MEDIA_BUCKET, "agentic-graph-media");
  assert.equal(AGENTIC_OS_MEDIA_HOST, "airvio.co");
  assert.equal(AGENTIC_OS_MEDIA_ROUTE_PREFIX, "/api/storage/media/");
});

test("the five responsive proof classes and 16:9 logical frame are fixed (R1.1, R1.2)", () => {
  assert.deepEqual(RESPONSIVE_PROOF_CLASSES.map((c) => [...c]), [
    [320, 640], [390, 844], [768, 1024], [1366, 768], [1920, 1080],
  ]);
  assert.deepEqual({ ...MEDIA_LOGICAL_FRAME }, { w: 1920, h: 1080 });
});

// --- 1. key scheme formatting (R3.3) ----------------------------------------

test("mediaObjectKey emits runs/{runId}/{stageId}/{shotId}.{ext} (R3.3)", () => {
  assert.equal(
    mediaObjectKey({ runId: "r1", stageId: "render", shotId: "s3", ext: "mp4" }),
    "runs/r1/render/s3.mp4",
  );
});

test("mediaObjectKey normalizes a leading dot and uppercase ext", () => {
  assert.equal(
    mediaObjectKey({ runId: "r1", stageId: "render", shotId: "s3", ext: ".PNG" }),
    "runs/r1/render/s3.png",
  );
});

test("mediaObjectKey rejects unsafe segments and bad ext", () => {
  assert.throws(() => mediaObjectKey({ runId: "../x", stageId: "s", shotId: "h", ext: "png" }), TypeError);
  assert.throws(() => mediaObjectKey({ runId: "a/b", stageId: "s", shotId: "h", ext: "png" }), TypeError);
  assert.throws(() => mediaObjectKey({ runId: "r", stageId: "s", shotId: "h", ext: "" }), TypeError);
  assert.throws(() => mediaObjectKey({ runId: "r", stageId: "s", shotId: "h", ext: "p g" }), TypeError);
  assert.throws(() => mediaObjectKey({}), TypeError);
});

// --- 2. durable url formatting (R3.4) ---------------------------------------

test("buildDurableR2Url returns the storage-worker media url (R3.4)", () => {
  assert.equal(
    buildDurableR2Url({ runId: "r1", stageId: "render", shotId: "s3", ext: "mp4" }),
    "https://airvio.co/api/storage/media/runs/r1/render/s3.mp4",
  );
});

test("isDurableR2Url accepts durable urls and rejects ephemeral/foreign urls", () => {
  assert.equal(isDurableR2Url("https://airvio.co/api/storage/media/runs/r1/render/s3.mp4"), true);
  assert.equal(isDurableR2Url("https://byteplus.example/tmp/abc?sig=xyz"), false);
  assert.equal(isDurableR2Url("https://airvio.co/api/storage/blob/ws/doc.md"), false);
  assert.equal(isDurableR2Url(""), false);
  assert.equal(isDurableR2Url(null), false);
});

// --- 3. sha256Hex content hash (R3.9 dedupe key) ----------------------------

test("sha256Hex computes the known digest of the empty input", async () => {
  const hex = await sha256Hex(new Uint8Array());
  assert.equal(hex, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("sha256Hex is deterministic and accepts ArrayBuffer + views", async () => {
  const bytes = new TextEncoder().encode("agentic-graph");
  const a = await sha256Hex(bytes);
  const b = await sha256Hex(bytes.buffer);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

// --- 4. ArtifactRecord: durable-only, no ephemeral field (R3.4, R3.5) -------

test("a complete ArtifactRecord is valid with no errors", () => {
  const result = validateArtifactRecord(completeRecord());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("createArtifactRecord never emits an ephemeral-url field (R3.5)", () => {
  const record = completeRecord();
  for (const forbidden of FORBIDDEN_EPHEMERAL_FIELDS) {
    assert.equal(forbidden in record, false, `record must not carry ${forbidden}`);
  }
  // and only the durable url is present as the media reference
  assert.equal(isDurableR2Url(record.durableR2Url), true);
});

test("an ArtifactRecord carrying any ephemeral provider url field is flagged (R3.5)", () => {
  for (const forbidden of FORBIDDEN_EPHEMERAL_FIELDS) {
    const record = { ...completeRecord(), [forbidden]: "https://byteplus.example/tmp/x" };
    const result = validateArtifactRecord(record);
    assert.equal(result.valid, false, `${forbidden} should invalidate the record`);
    assert.ok(pathsOf(result).includes(forbidden));
  }
});

test("a non-durable media url is flagged (R3.4)", () => {
  const record = { ...completeRecord(), durableR2Url: "https://byteplus.example/tmp/x" };
  const result = validateArtifactRecord(record);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("durableR2Url"));
});

test("an incomplete provenance chain invalidates the record (R6.1)", () => {
  const record = { ...completeRecord(), provenance: buildProvenanceChain({ goalRef: "g" }) };
  const result = validateArtifactRecord(record);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).some((p) => p.startsWith("provenance")));
});

// --- 5. ProvenanceChain validator (R6.1) ------------------------------------

test("a complete provenance chain is valid", () => {
  assert.equal(validateProvenanceChain(completeProvenance()).valid, true);
});

test("missing goal/brief/plan refs are each flagged (R6.1)", () => {
  for (const ref of ["goalRef", "briefRef", "planRef"]) {
    const chain = completeProvenance({ [ref]: "" });
    const result = validateProvenanceChain(chain);
    assert.equal(result.valid, false, `${ref} should be required`);
    assert.ok(pathsOf(result).includes(ref));
  }
});

test("non-array tool calls / verification checks are flagged", () => {
  assert.ok(pathsOf(validateProvenanceChain({ goalRef: "g", briefRef: "b", planRef: "p", toolCalls: "x", verificationChecks: [] })).includes("toolCalls"));
  assert.ok(pathsOf(validateProvenanceChain({ goalRef: "g", briefRef: "b", planRef: "p", toolCalls: [], verificationChecks: "x" })).includes("verificationChecks"));
});

// --- 6. ResponsiveLayoutMetadata validator (R1.1, R1.9) ---------------------

test("a valid layout with the 1920x1080 frame passes", () => {
  const layout = {
    frame: { w: 1920, h: 1080 },
    widgets: [{ id: "w1", kind: "image", x: 0, y: 0, z: 1, wPct: 50, hPct: 50 }],
    edges: [],
  };
  assert.equal(validateResponsiveLayoutMetadata(layout).valid, true);
});

test("a wrong logical frame is flagged (R1.1)", () => {
  const layout = { frame: { w: 1280, h: 720 }, widgets: [] };
  const result = validateResponsiveLayoutMetadata(layout);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("frame"));
});

test("widget with non-numeric coordinates is flagged", () => {
  const layout = { frame: { w: 1920, h: 1080 }, widgets: [{ id: "w1", kind: "video", x: "0", y: 0, z: 0, wPct: 1, hPct: 1 }] };
  const result = validateResponsiveLayoutMetadata(layout);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("widgets[0].x"));
});

// --- 7. totality: malformed inputs never throw ------------------------------

test("validators are total: garbage inputs never throw", () => {
  for (const bad of [undefined, null, 0, "x", true, [], NaN]) {
    assert.doesNotThrow(() => validateArtifactRecord(bad));
    assert.doesNotThrow(() => validateProvenanceChain(bad));
    assert.doesNotThrow(() => validateResponsiveLayoutMetadata(bad));
    assert.equal(validateArtifactRecord(bad).valid, false);
  }
});
