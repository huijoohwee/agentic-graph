import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  createAdlcLedgerReceipt,
} from "../adlc-ledger-runtime.js";
import {
  ADLC_OBSERVATION_SCHEMA,
  createAdlcObservabilityRuntime,
} from "../adlc-observability-runtime.js";
import {
  ADLC_OBSERVATION_OUTPUT_SCHEMA,
} from "../adlc-observability-tool-contract.js";
import { readStableBoundedFile } from "../bounded-file-reader.js";
import { ImplementationRunStore } from "../implementation-run-store.js";

const ACOS_REVISION = "a".repeat(40);
const PROJECTION_DIGEST = "b".repeat(64);
const PAGE_DIGEST = "c".repeat(64);
const LEDGER = Object.freeze({
  schema: "agentic-sdlc-run/v1",
  runId: "canonical-run-001",
});
const LEDGER_TEXT = `${JSON.stringify(LEDGER, null, 2)}\n`;
const LEDGER_DIGEST = `sha256:${crypto.createHash("sha256").update(LEDGER_TEXT).digest("hex")}`;
const invocation = {
  action: "/adlc.observe",
  semantic: "#adlc-observability",
  bindings: ["@implementation-run", "@canvas", "@runtime-proof"],
};

const normalizedRun = Object.freeze({
  schema: "agentic-sdlc-run/v1",
  runId: LEDGER.runId,
  vccs: [],
  tasks: [{ id: "1", state: "verified" }],
  evidenceReferences: [],
  recoveryEvents: [],
  humanGateEvents: [],
  operatorDecisions: [],
});
const conformance = Object.freeze({
  schema: "agentic-sdlc-execution-conformance/v1",
  runId: LEDGER.runId,
  runtimeReady: true,
  admissionReady: true,
  readiness: { localRung: "runtime-ready", deliveredRung: "undocumented" },
  controlFailures: [],
  findings: [],
  findingCounts: { "self-graded-verdict": 0 },
  severityCounts: { blocker: 0, major: 0, minor: 0 },
  metrics: {
    taskCount: 1,
    vccCount: 1,
    coveredVccCount: 1,
    verifiedTaskCount: 1,
    evidenceReferenceCount: 1,
    bridgeCoverageRatio: 1,
    boundaryClosed: true,
    persistenceComplete: true,
    humanGatesClosed: true,
    economicsWithinEstimate: true,
    totalTokenConsumption: 12,
  },
});
const evaluator = Object.freeze({
  assertCanonicalRunSchema(value) {
    assert.equal(value.schema, "agentic-sdlc-run/v1");
  },
  normalizeCanonicalRun() {
    return normalizedRun;
  },
  validateExecutionRun() {
    return conformance;
  },
  stableJson: JSON.stringify,
});

const projection = Object.freeze({
  schema: "adlc-canvas-projection/v1",
  projectionDigest: PROJECTION_DIGEST,
  pageDigest: PAGE_DIGEST,
  view: "execution",
  ordering: "type_rank_then_id",
  page: {
    cursor: null,
    nextCursor: null,
    offset: 0,
    limit: 100,
    count: 1,
    total: 1,
    stubCount: 0,
    truncated: false,
  },
  graphData: {
    type: "Graph",
    context: "adlc-observability",
    metadata: {
      schema: "adlc-canvas-projection/v1",
      invocation:
        "/adlc.observe #adlc-observability @implementation-run @canvas @runtime-proof",
      runId: LEDGER.runId,
      view: "execution",
      recordSetDigest: PROJECTION_DIGEST,
      projectionDigest: PROJECTION_DIGEST,
      status: { verified: true, deliveryReady: true, deployed: false },
    },
    nodes: [{
      id: "run:canonical-run-001",
      label: "canonical-run-001",
      type: "run",
      properties: {},
    }],
    edges: [],
  },
  agenticOsMarkdown:
    "---\nschema: adlc-canvas-projection/v1\nkgCanvas2dRenderer: storyboard\n---\n",
});

async function runtimeFixture(t, { realProjector = false } = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-sdlc-observe-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = new ImplementationRunStore({ rootDir });
  const created = await store.create({
    spec: {
      idempotencyKey: "adlc-observation-fixture",
      agenticCanvasOsRoot: path.join(rootDir, "agentic-canvas-os"),
    },
    plan: {
      acosRevision: ACOS_REVISION,
      supportedAcosRevision: ACOS_REVISION,
    },
  });
  await store.writeArtifact(
    created.state.runId,
    "adlc-run.a0001.fixture.json",
    LEDGER_TEXT,
  );
  const receipt = createAdlcLedgerReceipt({
    canonicalSchema: "agentic-sdlc-run/v1",
    artifact: "adlc-run.a0001.fixture.json",
    digest: LEDGER_DIGEST,
    bytes: Buffer.byteLength(LEDGER_TEXT),
    canonicalRunId: LEDGER.runId,
    ledgerRevision: created.state.revision,
    acosRevision: ACOS_REVISION,
  });
  const state = await store.update(
    created.state.runId,
    {
      expectedRevision: created.state.revision,
      eventType: "adlc.ledger_bound",
      eventData: {
        canonicalSchema: receipt.canonicalSchema,
        artifact: receipt.artifact,
        digest: receipt.digest,
        bytes: receipt.bytes,
        canonicalRunId: receipt.canonicalRunId,
        ledgerRevision: receipt.ledgerRevision,
        acosRevision: receipt.acosRevision,
        runtimeReady: true,
      },
    },
    (current) => {
      current.state = "delivery_ready";
      current.result = { adlcLedger: receipt };
      return current;
    },
  );
  let projectionCalls = 0;
  const runtimeOptions = {
    rootDir,
    store,
    evaluatorLoader: async () => evaluator,
  };
  if (!realProjector) runtimeOptions.projector = async (request) => {
      projectionCalls += 1;
      assert.deepEqual(request.normalizedRun, normalizedRun);
      assert.deepEqual(request.conformance, conformance);
      assert.equal(request.view, "execution");
      return projection;
    };
  const runtime = createAdlcObservabilityRuntime(runtimeOptions);
  return {
    rootDir,
    store,
    state,
    receipt,
    runtime,
    projectionCalls: () => projectionCalls,
  };
}

test("observer verifies the immutable ledger and keeps canonical, delivery, and deployment status distinct", async (t) => {
  const fixture = await runtimeFixture(t);
  const request = {
    invocation,
    runId: fixture.state.runId,
    expectedRevision: fixture.state.revision,
    expectedLedgerDigest: fixture.receipt.digest,
    view: "execution",
    limit: 100,
  };
  const first = await fixture.runtime.observe(request);
  const validateOutput = new Ajv2020({ strict: false }).compile(
    ADLC_OBSERVATION_OUTPUT_SCHEMA,
  );
  assert.equal(
    validateOutput(first),
    true,
    new Ajv2020().errorsText(validateOutput.errors),
  );
  assert.equal(first.schema, ADLC_OBSERVATION_SCHEMA);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(first.status, {
    runtimeReady: true,
    localReadiness: "runtime-ready",
    verified: true,
    verifiedTaskCount: 1,
    deliveryReady: true,
    deployed: false,
    deployBoundary: "closed",
  });
  assert.equal(first.source.canonicalRunId, LEDGER.runId);
  assert.equal(first.source.ledgerDigest, LEDGER_DIGEST);
  assert.equal(first.conformance.valid, true);
  assert.equal(first.conformance.metrics.totalTokenConsumption, 12);
  assert.deepEqual(first.economics, {
    modelCalls: 0,
    networkCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
    providerSpendUsd: 0,
  });
  assert.equal(first.cache.status, "miss");
  const second = await fixture.runtime.observe(request);
  assert.equal(second.ok, true);
  assert.equal(second.cache.status, "hit");
  assert.equal(fixture.projectionCalls(), 1);
});

test("observer fails closed on run revision, receipt, and artifact digest drift", async (t) => {
  const fixture = await runtimeFixture(t);
  const base = {
    invocation,
    runId: fixture.state.runId,
    expectedRevision: fixture.state.revision,
    expectedLedgerDigest: fixture.receipt.digest,
    view: "execution",
  };
  assert.equal(
    (await fixture.runtime.observe({ ...base, expectedRevision: 1 })).error.code,
    "revision_conflict",
  );
  assert.equal(
    (await fixture.runtime.observe({
      ...base,
      expectedLedgerDigest: `sha256:${"d".repeat(64)}`,
    })).error.code,
    "ledger_digest_mismatch",
  );

  await fs.writeFile(
    path.join(
      fixture.store.runDir(fixture.state.runId),
      fixture.receipt.artifact,
    ),
    `${LEDGER_TEXT} `,
    "utf8",
  );
  const drifted = await fixture.runtime.observe(base);
  assert.equal(drifted.ok, false);
  assert.equal(drifted.error.code, "ledger_digest_mismatch");
  assert.deepEqual(drifted.economics, {
    modelCalls: 0,
    networkCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
    providerSpendUsd: 0,
  });
});

test("observer reports a typed unavailable state instead of fabricating a canonical ledger", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-sdlc-observe-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = new ImplementationRunStore({ rootDir });
  const { state } = await store.create({
    spec: {
      idempotencyKey: "adlc-observation-missing-ledger",
      agenticCanvasOsRoot: path.join(rootDir, "agentic-canvas-os"),
    },
    plan: {
      acosRevision: ACOS_REVISION,
      supportedAcosRevision: ACOS_REVISION,
    },
  });
  const runtime = createAdlcObservabilityRuntime({
    rootDir,
    store,
    evaluatorLoader: async () => {
      throw new Error("must not load");
    },
    projector: async () => {
      throw new Error("must not project");
    },
  });
  const result = await runtime.observe({
    invocation,
    runId: state.runId,
    expectedRevision: state.revision,
    expectedLedgerDigest: LEDGER_DIGEST,
    view: "overview",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "canonical_ledger_unavailable");
});

test("observer enforces the closed invocation, view, and cursor contract without relying on transport validation", async (t) => {
  const fixture = await runtimeFixture(t);
  const base = {
    invocation,
    runId: fixture.state.runId,
    expectedRevision: fixture.state.revision,
    expectedLedgerDigest: fixture.receipt.digest,
    view: "execution",
  };
  const extraBinding = await fixture.runtime.observe({
    ...base,
    invocation: {
      ...invocation,
      bindings: [...invocation.bindings, "@extra"],
    },
  });
  assert.equal(extraBinding.error.code, "invalid_request");
  const missingView = { ...base };
  delete missingView.view;
  assert.equal(
    (await fixture.runtime.observe(missingView)).error.code,
    "unsupported_view",
  );
  assert.equal(
    (await fixture.runtime.observe({ ...base, cursor: "not+a+cursor" })).error.code,
    "invalid_request",
  );
});

test("bounded artifact reads reject digest drift and symbolic links", async (t) => {
  const fixture = await runtimeFixture(t);
  const exact = await fixture.store.readArtifact(
    fixture.state.runId,
    fixture.receipt.artifact,
    {
      expectedDigest: fixture.receipt.digest,
      expectedBytes: fixture.receipt.bytes,
    },
  );
  assert.equal(exact.content, LEDGER_TEXT);
  await assert.rejects(
    fixture.store.readArtifact(fixture.state.runId, fixture.receipt.artifact, {
      expectedDigest: `sha256:${"e".repeat(64)}`,
    }),
    (error) => error.code === "ARTIFACT_DIGEST_MISMATCH",
  );
  const outside = path.join(fixture.rootDir, "outside.json");
  await fs.writeFile(outside, LEDGER_TEXT, "utf8");
  const linked = path.join(
    fixture.store.runDir(fixture.state.runId),
    "linked-ledger.json",
  );
  await fs.symlink(outside, linked);
  await assert.rejects(
    fixture.store.readArtifact(fixture.state.runId, "linked-ledger.json"),
    (error) => error.code === "ARTIFACT_UNSAFE",
  );
  await fixture.store.writeArtifact(
    fixture.state.runId,
    "invalid-utf8.json",
    Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
  );
  await assert.rejects(
    fixture.store.readArtifact(fixture.state.runId, "invalid-utf8.json", {
      requireUtf8: true,
    }),
    (error) => error.code === "ARTIFACT_UTF8_INVALID",
  );
});

test("bounded file reads reject a pathname replacement after opening", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-bounded-read-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "artifact.json");
  const replacement = path.join(root, "replacement.json");
  await fs.writeFile(target, "original", "utf8");
  await fs.writeFile(replacement, "replacement", "utf8");
  await assert.rejects(
    readStableBoundedFile({
      filePath: target,
      containingDirectory: root,
      maximumBytes: 100,
      afterOpen: async () => fs.rename(replacement, target),
    }),
    (error) => error.code === "BOUNDED_FILE_CHANGED",
  );
});

test("runtime validates real projection output and freezes cached values", async (t) => {
  const fixture = await runtimeFixture(t, { realProjector: true });
  const request = {
    invocation,
    runId: fixture.state.runId,
    expectedRevision: fixture.state.revision,
    expectedLedgerDigest: fixture.receipt.digest,
    view: "execution",
  };
  const first = await fixture.runtime.observe(request);
  const validate = new Ajv2020({ strict: false }).compile(
    ADLC_OBSERVATION_OUTPUT_SCHEMA,
  );
  assert.equal(validate(first), true, JSON.stringify(validate.errors));
  assert.equal(first.status.verified, false);
  assert.equal(Object.isFrozen(first.projection.graphData.metadata.status), true);
  assert.throws(() => {
    first.projection.graphData.metadata.status.deployed = true;
  }, TypeError);
  const second = await fixture.runtime.observe(request);
  assert.equal(second.cache.status, "hit");
  assert.equal(second.projection.graphData.metadata.status.deployed, false);
});

test("observer rejects a receipt that is not joined to its durable binding revision", async (t) => {
  const fixture = await runtimeFixture(t);
  const drifted = await fixture.store.update(
    fixture.state.runId,
    {
      expectedRevision: fixture.state.revision,
      eventType: "test.receipt_revision_drift",
    },
    (current) => {
      current.result.adlcLedger = {
        ...current.result.adlcLedger,
        ledgerRevision: current.result.adlcLedger.ledgerRevision + 1,
      };
      return current;
    },
  );
  const result = await fixture.runtime.observe({
    invocation,
    runId: drifted.runId,
    expectedRevision: drifted.revision,
    expectedLedgerDigest: drifted.result.adlcLedger.digest,
    view: "overview",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "canonical_ledger_unavailable");
});
