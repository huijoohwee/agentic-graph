import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  ADLC_RUN_SCHEMA, createAdlcLedgerReceipt, loadAdlcEvaluator, evaluateAdlcLedger,
} from "../adlc-ledger-runtime.js";
import {
  LEGACY_RUN_SCHEMA, LEGACY_LEDGER_RECEIPT_SCHEMA, LEGACY_LEDGER_EVENT,
} from "../adlc-legacy-ledger.js";
import { bindAdlcLedger } from "../implementation-run-adlc-ledger.js";
import {
  createAdlcObservabilityRuntime, runAdlcObservabilityTool,
} from "../adlc-observability-runtime.js";
import { ADLC_OBSERVATION_OUTPUT_SCHEMA } from "../adlc-observability-tool-contract.js";
import { buildAgenticGraphLocalMcpToolDefinitions } from "../local-tool-contract.js";

const sha = "a".repeat(40);
const digest = (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`;
const invocation = { action: "/adlc.observe", semantic: "#adlc-observability",
  bindings: ["@implementation-run", "@canvas", "@runtime-proof"] };

function observationFixture({ legacy = true, sourceSchema = LEGACY_RUN_SCHEMA } = {}) {
  const ledger = { schema: sourceSchema, runId: "historical-source", tasks: [], vccs: [],
    evidenceReferences: [], recoveryEvents: [], humanGateEvents: [], operatorDecisions: [] };
  const content = `${JSON.stringify(ledger, null, 2)}\n`;
  const fields = { artifact: "historical.json", digest: digest(content), bytes: Buffer.byteLength(content),
    canonicalRunId: ledger.runId, ledgerRevision: 1, acosRevision: sha };
  const receipt = legacy ? { schema: LEGACY_LEDGER_RECEIPT_SCHEMA, ...fields }
    : createAdlcLedgerReceipt({ canonicalSchema: sourceSchema, ...fields });
  const state = { runId: `ir_${"b".repeat(24)}`, revision: 2, state: "review_ready",
    spec: { agenticCanvasOsRoot: "/historical/exact-checkout" },
    plan: { acosRevision: sha, supportedAcosRevision: sha },
    result: legacy ? { agenticSdlcLedger: receipt } : { adlcLedger: receipt } };
  const events = [{ type: legacy ? LEGACY_LEDGER_EVENT : "adlc.ledger_bound", revision: 2,
    data: { ...fields, ...(legacy ? {} : { canonicalSchema: sourceSchema }), runtimeReady: false } }];
  const store = { read: async () => state, events: async () => events,
    readArtifact: async (_runId, artifact, expected) => {
      assert.equal(artifact, fields.artifact);
      assert.equal(expected.expectedDigest, digest(content));
      assert.equal(expected.expectedBytes, Buffer.byteLength(content));
      return { content };
    } };
  const request = { invocation, view: "overview", runId: state.runId, expectedRevision: 2, expectedLedgerDigest: fields.digest };
  return { state, events, receipt, ledger, content, store, request };
}

// This evaluator proves only the historical adapter boundary, never installed native readiness.
function historicalEvaluator(ledger) {
  return { assertCanonicalRunSchema: value => assert.equal(value.schema, LEGACY_RUN_SCHEMA),
    normalizeCanonicalRun: () => ledger,
    validateExecutionRun: () => ({ runId: ledger.runId, runtimeReady: false, admissionReady: false,
      findings: [], controlFailures: [], metrics: {} }), stableJson: JSON.stringify };
}

test("native discovery exposes only ADLC and rejects the former invocation and tool", async () => {
  const names = buildAgenticGraphLocalMcpToolDefinitions().map(item => item.name);
  assert.equal(names.filter(name => name === "agentic-graph.adlc.observe").length, 1);
  assert.equal(names.some(name => name.includes("agentic_sdlc")), false);
  let calls = 0;
  const result = await runAdlcObservabilityTool("agentic-graph.agentic_sdlc.observe", {},
    { runtime: { observe: () => { calls += 1; } } });
  assert.equal(result.error.code, "invalid_request");
  assert.equal(calls, 0);
  const fixture = observationFixture();
  const runtime = createAdlcObservabilityRuntime({ store: fixture.store });
  const rejected = await runtime.observe({ ...fixture.request,
    invocation: { ...invocation, action: "/sdlc.observe" } });
  assert.equal(rejected.error.code, "invalid_request");
});

test("native projection reads exact historical receipts without rewriting their source", async () => {
  for (const legacy of [true, false]) {
    const fixture = observationFixture({ legacy });
    const original = JSON.stringify({ state: fixture.state, events: fixture.events, content: fixture.content });
    const runtime = createAdlcObservabilityRuntime({ store: fixture.store,
      evaluatorLoader: async options => {
        assert.equal(options.canonicalSchema, LEGACY_RUN_SCHEMA);
        assert.equal(options.expectedRevision, fixture.receipt.acosRevision);
        return historicalEvaluator(fixture.ledger);
      } });
    const result = await runAdlcObservabilityTool("agentic-graph.adlc.observe", fixture.request, { runtime });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.source.canonicalSchema, LEGACY_RUN_SCHEMA);
    assert.equal(result.source.receiptSchema, fixture.receipt.schema);
    assert.equal(result.source.ledgerDigest, digest(fixture.content));
    assert.equal(result.status.runtimeReady, false);
    const validate = new Ajv2020({ strict: false }).compile(ADLC_OBSERVATION_OUTPUT_SCHEMA);
    assert.equal(validate(result), true, JSON.stringify(validate.errors));
    assert.equal(JSON.stringify({ state: fixture.state, events: fixture.events, content: fixture.content }), original);
  }
});

test("old and native receipt fields, schemas, and binding events cannot be mixed", async () => {
  for (const mutate of [
    fixture => { fixture.state.result.adlcLedger = fixture.receipt; },
    fixture => { fixture.state.result = { adlcLedger: fixture.receipt }; },
    fixture => { fixture.receipt.schema = "adlc-ledger-receipt/v1"; },
    fixture => { fixture.events[0].type = "adlc.ledger_bound"; },
    fixture => { fixture.events[0].data.canonicalSchema = ADLC_RUN_SCHEMA; },
    fixture => { fixture.events.push(structuredClone(fixture.events[0])); },
    fixture => { fixture.events[0].data.digest = `sha256:${"f".repeat(64)}`; },
    fixture => { fixture.events[0].revision += 1; },
    fixture => { fixture.state.plan.supportedAcosRevision = "f".repeat(40); },
  ]) {
    const fixture = observationFixture();
    mutate(fixture);
    let evaluated = 0;
    const runtime = createAdlcObservabilityRuntime({ store: fixture.store,
      evaluatorLoader: async () => { evaluated += 1; return historicalEvaluator(fixture.ledger); } });
    const result = await runtime.observe(fixture.request);
    assert.equal(result.ok, false);
    assert.equal(evaluated, 0);
  }
  const native = observationFixture({ legacy: false });
  native.events[0].type = LEGACY_LEDGER_EVENT;
  const result = await createAdlcObservabilityRuntime({ store: native.store }).observe(native.request);
  assert.equal(result.ok, false);
});

test("historical evaluation cannot mutate or relabel the immutable source into native conformance", () => {
  const ledger = { schema: LEGACY_RUN_SCHEMA, runId: "source" };
  for (const callback of ["assertCanonicalRunSchema", "normalizeCanonicalRun", "validateExecutionRun"]) {
    const evaluator = historicalEvaluator(ledger);
    evaluator[callback] = source => { source.schema = ADLC_RUN_SCHEMA; return source; };
    assert.throws(() => evaluateAdlcLedger(ledger, evaluator), { code: "LEDGER_SCHEMA_INVALID" });
    assert.deepEqual(ledger, { schema: LEGACY_RUN_SCHEMA, runId: "source" });
  }
  const normalized = { ...ledger };
  const conformance = { runId: "source", runtimeReady: false };
  const evaluated = evaluateAdlcLedger(ledger, { assertCanonicalRunSchema() {},
    normalizeCanonicalRun: () => normalized, validateExecutionRun: () => conformance });
  normalized.schema = ADLC_RUN_SCHEMA;
  conformance.runtimeReady = true;
  assert.equal(evaluated.normalizedRun.schema, LEGACY_RUN_SCHEMA);
  assert.equal(evaluated.conformance.runtimeReady, false);
  assert.equal(Object.isFrozen(evaluated.normalizedRun), true);
  assert.equal(Object.isFrozen(evaluated.conformance), true);
});

test("historical run identity keeps its original whitespace while honoring the original canonical trim", () => {
  const ledger = { schema: LEGACY_RUN_SCHEMA, runId: " source " };
  const bytes = JSON.stringify(ledger);
  const result = evaluateAdlcLedger(ledger, { assertCanonicalRunSchema() {},
    normalizeCanonicalRun: value => ({ ...value, runId: value.runId.trim() }),
    validateExecutionRun: value => ({ runId: value.runId.trim(), runtimeReady: false }) });
  assert.equal(result.normalizedRun.runId, "source");
  assert.equal(result.conformance.runId, "source");
  assert.equal(JSON.stringify(ledger), bytes);
});

test("native source identity is checked before selecting a historical evaluator", async () => {
  const fixture = observationFixture({ legacy: false, sourceSchema: ADLC_RUN_SCHEMA });
  fixture.state.result.adlcLedger = { ...fixture.receipt, canonicalSchema: LEGACY_RUN_SCHEMA };
  fixture.events[0].data.canonicalSchema = LEGACY_RUN_SCHEMA;
  let calls = 0;
  const result = await createAdlcObservabilityRuntime({ store: fixture.store,
    evaluatorLoader: async () => { calls += 1; return historicalEvaluator(fixture.ledger); } }).observe(fixture.request);
  assert.equal(result.error.code, "ledger_schema_invalid");
  assert.equal(calls, 0);
});

test("native canonical conformance remains explicitly unavailable and nonretryable", async () => {
  const fixture = observationFixture({ legacy: false, sourceSchema: ADLC_RUN_SCHEMA });
  let projections = 0;
  const result = await createAdlcObservabilityRuntime({ store: fixture.store,
    projector: async () => { projections += 1; } }).observe(fixture.request);
  assert.equal(result.error.code, "adlc_evaluator_unavailable");
  assert.equal(result.error.retryable, false);
  assert.equal(projections, 0);
  assert.equal(result.conformance, undefined);
  const validate = new Ajv2020({ strict: false }).compile(ADLC_OBSERVATION_OUTPUT_SCHEMA);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
});

test("a real clean checkout without the retired evaluator fails before ledger writes", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "adlc-missing-owner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git(["init", "--quiet", "--initial-branch=main"]);
  await writeFile(path.join(root, "README.md"), "Current owner has no canonical run evaluator.\n");
  git(["add", "README.md"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "source"]);
  const revision = git(["rev-parse", "HEAD"]);
  assert.equal(git(["status", "--porcelain"]), "");
  await assert.rejects(loadAdlcEvaluator({ canonicalSchema: LEGACY_RUN_SCHEMA,
    agenticCanvasOsRoot: root, expectedRevision: revision }), { code: "ADLC_EVALUATOR_UNAVAILABLE" });
  const historical = observationFixture();
  historical.state.spec.agenticCanvasOsRoot = root;
  historical.receipt.acosRevision = revision;
  historical.events[0].data.acosRevision = revision;
  historical.state.plan = { acosRevision: revision, supportedAcosRevision: revision };
  const blocked = await createAdlcObservabilityRuntime({ store: historical.store }).observe(historical.request);
  assert.equal(blocked.error.code, "adlc_evaluator_unavailable");
  assert.equal(blocked.error.retryable, false);
  assert.equal(blocked.projection, undefined);
  const workspace = await mkdtemp(path.join(tmpdir(), "adlc-source-ledger-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  for (const schema of [ADLC_RUN_SCHEMA, LEGACY_RUN_SCHEMA]) {
    await writeFile(path.join(workspace, "ledger.json"), JSON.stringify({ schema, runId: "source" }));
    const state = { spec: { adlcLedgerPath: "ledger.json", allowedPaths: ["ledger.json"], agenticCanvasOsRoot: root },
      coordination: { worktreePath: workspace }, plan: { acosRevision: revision }, result: {} };
    const original = JSON.stringify(state);
    let writes = 0;
    await assert.rejects(bindAdlcLedger({ state, runId: "run", supervisorToken: "token",
      store: { writeArtifact: async () => { writes += 1; } }, updateOwned: async () => { writes += 1; } }),
    { code: "ADLC_EVALUATOR_UNAVAILABLE" });
    assert.equal(writes, 0);
    assert.equal(JSON.stringify(state), original);
  }
});
