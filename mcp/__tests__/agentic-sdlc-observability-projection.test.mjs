import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  extractFlowFromMarkdown,
  kgcRoundTripEquivalent,
} from "../../contracts/kgc-document.schema.js";
import {
  AGENTIC_SDLC_CANVAS_PROJECTION_SCHEMA,
  AGENTIC_SDLC_OBSERVABILITY_INVOCATION,
  AGENTIC_SDLC_OBSERVABILITY_VIEWS,
  AgenticSdlcProjectionError,
  projectAgenticSdlcCanvas,
} from "../agentic-sdlc-observability-projection.js";
import {
  AGENTIC_SDLC_OBSERVATION_OUTPUT_SCHEMA,
} from "../agentic-sdlc-observability-tool-contract.js";
const NODE_TYPES = [
  "run", "criterion", "vcc", "task", "transition", "dispatch", "return",
  "check", "evidence", "finding", "budget", "receipt", "gate", "checkpoint",
];
const EDGE_TYPES = [
  "defines", "covers", "dependsOn", "transitionsTo", "dispatchedAs",
  "returnedAs", "verifiedBy", "evidencedBy", "consumes", "gatedBy", "persistedAs",
];
const VIEW_TYPES = {
  overview: ["run", "task", "finding", "budget", "receipt", "gate", "checkpoint"],
  plan: ["run", "criterion", "vcc", "task", "budget"],
  execution: ["run", "task", "transition", "dispatch", "return", "check"],
  evidence: ["run", "task", "check", "evidence", "finding", "checkpoint"],
  economics: ["run", "task", "budget"],
  recovery: ["run", "task", "transition", "gate", "checkpoint"],
  receipts: ["run", "receipt", "gate", "checkpoint"],
  full: NODE_TYPES,
};
const result = (id, status = "passed") => ({
  checkRunId: id,
  status,
  exitCode: status === "passed" ? 0 : 1,
  summary: `${id} ${status}`,
  artifactRevision: "artifact-001",
  counts: {
    total: 1,
    passed: status === "passed" ? 1 : 0,
    failed: status === "passed" ? 0 : 1,
    errored: 0,
    skipped: 0,
  },
});
const fixtureRun = () => ({
  schema: "agentic-sdlc-run/v1",
  runId: "sdlc-run-001",
  vccs: [
    {
      conditionId: "VCC:2",
      criterionId: "AC/2",
      endState: "Recovery is resumable.",
      statedCheck: "node --test recovery",
    },
    {
      conditionId: "VCC:1",
      criterionId: "AC/1",
      endState: "Projection is deterministic.",
      statedCheck: "node --test projection",
    },
  ],
  tasks: [
    {
      taskId: "2",
      text: "Render the projection",
      state: "verified",
      vccIds: ["VCC:2"],
      criterionIds: ["AC/2"],
      dependencyIds: ["1"],
      budgets: { tokens: 80, iterations: 3, wallClockMs: 20_000, contextTokens: 2_000 },
    },
    {
      taskId: "1",
      text: "Normalize the run",
      state: "verified",
      vccIds: ["VCC:1"],
      criterionIds: ["AC/1"],
      dependencyIds: [],
      capabilityGrants: [{
        capabilityClass: "filesystem-write",
        artifactGlobs: ["mcp/**"],
      }],
      budgets: { tokens: 50, iterations: 2, wallClockMs: 10_000, contextTokens: 1_000 },
    },
  ],
  transitions: [
    {
      taskId: "2",
      ordinal: 1,
      sequence: 1,
      from: "in-progress",
      to: "verified",
      role: "evaluator",
      mechanismId: "deterministic-suite",
      artifactRevision: "artifact-001",
    },
    {
      taskId: "1",
      ordinal: 2,
      sequence: 2,
      from: "in-progress",
      to: "verified",
      role: "evaluator",
      mechanismId: "deterministic-suite",
      artifactRevision: "artifact-001",
    },
    {
      taskId: "1",
      ordinal: 1,
      sequence: 1,
      from: "ready",
      to: "in-progress",
      role: "implementer",
      mechanismId: "implementation-worker",
      artifactRevision: "artifact-001",
    },
  ],
  dispatches: [{
    taskId: "1",
    taskText: "Normalize the run",
    derivationRevision: "vcc-revision-001",
    budgets: { tokens: 50, iterations: 2, wallClockMs: 10_000, contextTokens: 1_000 },
  }],
  returns: [{
    taskId: "1",
    idempotencyKey: "return:1",
    namedCheck: "node --test projection",
    checkRunId: "check:projection",
    namedCheckResult: result("check:projection"),
    existingVerificationLane: "npm run runtime:check",
    existingVerificationResult: result("check:runtime"),
    consumption: { tokens: 34, iterations: 1, wallClockMs: 1_200, contextTokens: 600 },
    propertyResults: [{
      propertyId: "PROP:ordering",
      checkName: "ordering property",
      checkRunId: "check:property",
      recordedResult: result("check:property"),
    }],
  }],
  evidence: [
    {
      evidenceId: "evidence:projection",
      conditionId: "VCC:1",
      taskId: "1",
      checkName: "projection evidence",
      checkRunId: "check:evidence",
      recordedResult: result("check:evidence"),
      surface: "authoring",
      artifactRevision: "artifact-001",
    },
    {
      evidenceId: "evidence:render",
      conditionId: "VCC:2",
      taskId: "2",
      checkName: "render evidence",
      checkRunId: "check:render",
      recordedResult: result("check:render"),
      surface: "runtime",
      artifactRevision: "artifact-001",
    },
  ],
  priorFindings: [{
    findingType: "stale-collaboration-fence",
    severity: "blocker",
    guidelineAnchor: "conformance-findings#1",
    artifactReference: "task:1",
    evidenceExcerpt: "Synthetic finding",
    remediation: {
      class: "local-reproducible-check",
      statement: "Renew the exact lease.",
      state: "proposed",
      operatorInstructionRef: null,
    },
  }],
  humanGateEvents: [{
    gateId: "gate:scope",
    taskId: "2",
    trigger: "scope-change",
    resolution: "approved",
    operatorDecisionReference: "decision:scope",
  }],
  persistedTerminals: [{
    taskId: "1",
    state: "verified",
    transitionOrdinal: 2,
    ledgerRevision: "ledger:2",
    checkpointDigest: "a".repeat(64),
  }],
  recoveryEvents: [{
    eventId: "recovery:1",
    taskId: "2",
    checkpointTransitionOrdinal: 1,
    continuationTransitionOrdinal: 2,
    artifactRevision: "artifact-001",
    recoveryCheck: result("check:recovery"),
    partialApplied: false,
    resumed: true,
    artifactReverified: true,
    previousTerminalState: null,
    redispatched: false,
    rederived: false,
  }],
  persistence: {
    outsideWorkingContext: true,
    storageReference: "local-ledger:sdlc-run-001",
    reconstructable: true,
    checkpointDigest: "b".repeat(64),
    reconstructionCheck: result("check:reconstruct"),
  },
  consumption: { tokens: 91, iterations: 3, wallClockMs: 2_800, contextTokens: 1_400 },
  guidelineLoadCost: {
    events: [{
      eventId: "load:1",
      guideline: "execution",
      stage: "run-start",
      subjectId: null,
      tokens: 12,
      loadedSectionAnchors: ["module-index"],
    }],
  },
  releaseLifecycle: {
    receipts: [
      {
        receiptType: "future-provider-publication-receipt",
        receiptId: "receipt:publication",
        status: "recorded",
        digest: "c".repeat(64),
        integrationReceiptDigest: "d".repeat(64),
        opaqueProviderField: "preserved",
      },
      {
        receiptType: "integration-receipt",
        receiptId: "receipt:integration",
        status: "recorded",
        digest: "d".repeat(64),
      },
    ],
  },
  productionLifecycle: {
    candidate: {
      schema: "legacy-candidate-that-must-not-win",
      status: "awaiting-human-authorization",
    },
  },
});
const normalizedFixtureRun = () => {
  const run = fixtureRun();
  const transitions = run.transitions;
  const dispatch = run.dispatches[0];
  const taskReturn = run.returns[0];
  run.vccs = run.vccs.map(({ conditionId, statedCheck, ...item }) => ({
    ...item, id: conditionId, check: statedCheck,
  }));
  run.tasks = run.tasks.map((task) => {
    const { taskId, vccIds, dependencyIds, budgets, capabilityGrants, ...item } = task;
    return {
      ...item,
      id: taskId,
      sourceVccIds: vccIds,
      dependencies: dependencyIds,
      effectiveBudgets: budgets,
      effectiveCapabilityGrants: capabilityGrants ?? [],
      transitions: transitions.filter((transition) => transition.taskId === taskId),
      dispatch: taskId === "1" ? {
        ...dispatch,
        text: dispatch.taskText,
        tracedCriteria: task.criterionIds,
      } : {},
      return: taskId === "1" ? {
        ...taskReturn,
        checkResult: taskReturn.namedCheckResult,
        existingVerificationLane: {
          ...taskReturn.existingVerificationResult,
          name: taskReturn.existingVerificationLane,
        },
      } : {},
    };
  });
  run.evidenceReferences = run.evidence.map((item) => ({
    ...item,
    id: item.evidenceId,
    namedCheck: item.checkName,
    checkRanInTask: true,
  }));
  run.reportedAggregateConsumption = run.consumption;
  run.guidelineLoadEvents = run.guidelineLoadCost.events;
  run.humanGateEvents = run.humanGateEvents.map((item) => ({ ...item, id: item.gateId }));
  run.recoveryEvents = run.recoveryEvents.map((item) => ({ ...item, id: item.eventId }));
  for (const key of [
    "transitions", "dispatches", "returns", "evidence", "consumption", "guidelineLoadCost",
  ]) delete run[key];
  return run;
};
const fixtureInput = (overrides = {}) => ({
  normalizedRun: normalizedFixtureRun(),
  implementationRun: {
    runId: "ir_111111111111111111111111",
    revision: 7,
    ledgerDigest: "e".repeat(64),
    state: "delivery_ready",
  },
  source: {
    repository: "huijoohwee/agentic-graph",
    revision: "1".repeat(40),
    agenticCanvasOsRevision: "2".repeat(40),
  },
  conformance: {
    runtimeReady: true,
    findingCounts: { blocker: 0, major: 0, minor: 0 },
    metrics: {
      taskCount: 2,
      verifiedTaskCount: 2,
      evidenceReferenceCount: 2,
    },
  },
  view: "full",
  limit: 200,
  ...overrides,
});

const assertTypedOrder = (items, ranks) => {
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const expected = [...items].sort((left, right) =>
    ranks.indexOf(left.type) - ranks.indexOf(right.type)
    || (Object.hasOwn(left, "source")
      ? compare(left.source, right.source) || compare(left.target, right.target)
      : 0)
    || compare(left.id, right.id));
  assert.deepEqual(items.map((item) => item.id), expected.map((item) => item.id));
};

test("real normalized ACOS records emit all Canvas types and parser-compatible KGC", () => {
  const input = fixtureInput();
  assert.equal(input.normalizedRun.transitions, undefined);
  assert.ok(input.normalizedRun.tasks[0].dispatch);
  assert.ok(input.normalizedRun.evidenceReferences);
  const projection = projectAgenticSdlcCanvas(input);
  assert.equal(projection.schema, AGENTIC_SDLC_CANVAS_PROJECTION_SCHEMA);
  assert.equal(projection.ordering, "type_rank_then_id");
  assert.match(projection.projectionDigest, /^[0-9a-f]{64}$/);
  assert.match(projection.pageDigest, /^[0-9a-f]{64}$/);
  assert.equal(projection.graphData.type, "Graph");
  assert.equal(projection.graphData.context, "agentic-sdlc-observability");
  assert.equal(projection.graphData.metadata.invocation, AGENTIC_SDLC_OBSERVABILITY_INVOCATION);
  const capabilityTask = projection.graphData.nodes.find(
    (node) => node.type === "task" && node.properties.source.id === "1",
  );
  assert.equal(capabilityTask.properties.source.effectiveCapabilityGrants[0].capabilityClass, "filesystem-write");
  const validateProjection = new Ajv2020({ strict: false }).compile({
    $defs: AGENTIC_SDLC_OBSERVATION_OUTPUT_SCHEMA.$defs,
    ...AGENTIC_SDLC_OBSERVATION_OUTPUT_SCHEMA.properties.projection,
  });
  assert.equal(validateProjection(projection), true, JSON.stringify(validateProjection.errors));
  assert.deepEqual(
    new Set(projection.graphData.nodes.map((node) => node.type)),
    new Set(NODE_TYPES),
  );
  assert.ok(projection.graphData.edges.length > EDGE_TYPES.length);
  assert.deepEqual(
    new Set(projection.graphData.edges.map((edge) => edge.type)),
    new Set(EDGE_TYPES),
  );
  assertTypedOrder(projection.graphData.nodes, NODE_TYPES);
  assertTypedOrder(projection.graphData.edges, EDGE_TYPES);
  assert.equal(new Set(projection.graphData.nodes.map((node) => node.id)).size, projection.graphData.nodes.length);
  assert.equal(new Set(projection.graphData.edges.map((edge) => edge.id)).size, projection.graphData.edges.length);
  const nodeIds = new Set(projection.graphData.nodes.map((node) => node.id));
  for (const edge of projection.graphData.edges) {
    assert.ok(nodeIds.has(edge.source), edge.source);
    assert.ok(nodeIds.has(edge.target), edge.target);
  }

  assert.equal(kgcRoundTripEquivalent({ canvasDocumentMarkdown: projection.kgcMarkdown }), true);
  const parsed = extractFlowFromMarkdown(projection.kgcMarkdown);
  assert.deepEqual(parsed.nodes.map((node) => node.id), projection.graphData.nodes.map((node) => node.id));
  assert.deepEqual(
    parsed.edges.map((edge) => [edge.source, edge.target]),
    projection.graphData.edges.map((edge) => [edge.source, edge.target]),
  );
});

test("projection is deterministic under source collection permutations and does not mutate input", () => {
  const firstInput = fixtureInput();
  const before = structuredClone(firstInput);
  const first = projectAgenticSdlcCanvas(firstInput);
  assert.deepEqual(firstInput, before);

  const permuted = fixtureInput();
  for (const key of [
    "vccs", "tasks", "priorFindings", "humanGateEvents", "persistedTerminals", "recoveryEvents",
  ]) permuted.normalizedRun[key].reverse();
  for (const task of permuted.normalizedRun.tasks) task.transitions.reverse();
  permuted.normalizedRun.releaseLifecycle.receipts.reverse();
  const second = projectAgenticSdlcCanvas(permuted);
  assert.deepEqual(second, first);
});

test("typed IDs keep punctuation-distinct source IDs collision-free", () => {
  const input = fixtureInput();
  input.normalizedRun.tasks = [
    { taskId: "task:a/b", text: "Slash", state: "verified", dependencyIds: [] },
    { taskId: "task:a:b", text: "Colon", state: "verified", dependencyIds: [] },
  ];
  const projection = projectAgenticSdlcCanvas(input);
  const tasks = projection.graphData.nodes.filter(
    (node) => node.type === "task" && node.properties.stub !== true,
  );
  assert.equal(tasks.length, 2);
  assert.notEqual(tasks[0].id, tasks[1].id);
});

test("views expose only their exact record kinds while preserving valid endpoints", () => {
  assert.deepEqual(AGENTIC_SDLC_OBSERVABILITY_VIEWS, Object.keys(VIEW_TYPES));
  for (const view of AGENTIC_SDLC_OBSERVABILITY_VIEWS) {
    const projection = projectAgenticSdlcCanvas(fixtureInput({ view }));
    const allowed = new Set(VIEW_TYPES[view]);
    assert.ok(projection.graphData.nodes.every((node) => allowed.has(node.type)), view);
    const ids = new Set(projection.graphData.nodes.map((node) => node.id));
    assert.ok(projection.graphData.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)), view);
  }
});

test("status keeps verification, delivery readiness, and deployment independent", () => {
  const explicit = projectAgenticSdlcCanvas(fixtureInput()).graphData.metadata.status;
  assert.deepEqual(explicit, { verified: true, deliveryReady: true, deployed: false });

  const input = fixtureInput({ conformance: {} });
  input.normalizedRun.productionLifecycle.readiness = { status: "verified-build" };
  delete input.implementationRun.state;
  const honest = projectAgenticSdlcCanvas(input).graphData.metadata.status;
  assert.deepEqual(honest, { verified: false, deliveryReady: null, deployed: false });

  const runtimeInput = fixtureInput({ conformance: {} });
  runtimeInput.implementationRun.state = "delivery_ready";
  const runtimeAligned = projectAgenticSdlcCanvas(runtimeInput).graphData.metadata.status;
  assert.deepEqual(runtimeAligned, { verified: false, deliveryReady: true, deployed: false });
});

test("verified requires the independent evaluator result and joined evidence metrics", () => {
  for (const conformance of [
    { runtimeReady: false, metrics: { taskCount: 2, verifiedTaskCount: 2, evidenceReferenceCount: 2 } },
    { runtimeReady: true, metrics: { taskCount: 2, verifiedTaskCount: 1, evidenceReferenceCount: 2 } },
    { runtimeReady: true, metrics: { taskCount: 2, verifiedTaskCount: 2, evidenceReferenceCount: 0 } },
  ]) {
    const status = projectAgenticSdlcCanvas(
      fixtureInput({ conformance }),
    ).graphData.metadata.status;
    assert.equal(status.verified, false);
  }
});

test("verified requires every task to join its evaluator transition to its own evidence", () => {
  const missingTaskEvidence = fixtureInput();
  missingTaskEvidence.normalizedRun.evidenceReferences =
    missingTaskEvidence.normalizedRun.evidenceReferences.filter((item) => item.taskId === "1");
  missingTaskEvidence.conformance.metrics.evidenceReferenceCount = 1;
  assert.equal(
    projectAgenticSdlcCanvas(missingTaskEvidence).graphData.metadata.status.verified,
    false,
  );

  const externalCheck = fixtureInput();
  externalCheck.normalizedRun.evidenceReferences
    .find((item) => item.taskId === "2").checkRanInTask = false;
  assert.equal(
    projectAgenticSdlcCanvas(externalCheck).graphData.metadata.status.verified,
    false,
  );
});

test("rejected ACOS-normalized records omit undefined object fields and remain observable", () => {
  const input = fixtureInput({
    conformance: {
      runtimeReady: false,
      findings: [{
        findingType: "self-graded-verdict",
        severity: "blocker",
        guidelineAnchor: "execution#independent-evaluator",
        artifactReference: "task:1",
        evidenceExcerpt: "Independent verification is missing.",
      }],
      metrics: { taskCount: 2, verifiedTaskCount: 2, evidenceReferenceCount: 1 },
    },
  });
  const firstTask = input.normalizedRun.tasks.find((task) => task.id === "1");
  firstTask.dispatch.priorFindings = undefined;
  firstTask.return.constraintViolations = undefined;
  firstTask.return.failingFirstWitness = undefined;
  const projection = projectAgenticSdlcCanvas(input);
  assert.equal(projection.graphData.metadata.status.verified, false);
  assert.ok(projection.graphData.nodes.some((node) =>
    node.type === "finding"
    && node.properties.source.findingType === "self-graded-verdict"));
});

test("nested projection values fail closed at the public recursive JSON bounds", () => {
  for (const mutate of [
    (input) => {
      input.normalizedRun.tasks[0].capabilityEvents =
        Array.from({ length: 201 }, (_, index) => ({ index }));
    },
    (input) => {
      input.normalizedRun.tasks[0].oversized =
        Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`k${index}`, index]));
    },
    (input) => {
      input.normalizedRun.tasks[0].oversized = "x".repeat(16_385);
    },
  ]) {
    const input = fixtureInput();
    mutate(input);
    assert.throws(
      () => projectAgenticSdlcCanvas(input),
      (error) => error instanceof AgenticSdlcProjectionError
        && error.code === "projection_too_large",
    );
  }
});

test("release receipts take precedence and preserve unknown receipt types and properties", () => {
  const projection = projectAgenticSdlcCanvas(fixtureInput({ view: "receipts" }));
  const receipts = projection.graphData.nodes.filter((node) => node.type === "receipt");
  assert.deepEqual(
    receipts.map((node) => node.properties.receiptType).sort(),
    ["future-provider-publication-receipt", "integration-receipt"],
  );
  assert.ok(receipts.some((node) => node.properties.source.opaqueProviderField === "preserved"));
  assert.ok(receipts.every((node) => node.properties.source.schema !== "legacy-candidate-that-must-not-win"));
  assert.ok(projection.graphData.edges.some((edge) =>
    edge.type === "transitionsTo"
    && receipts.some((node) => node.id === edge.source)
    && receipts.some((node) => node.id === edge.target)));
});

test("cursor pagination is complete, stable, digest-bound, and endpoint-safe", () => {
  let cursor = null;
  let projectionDigest = null;
  let total = null;
  let primaryCount = 0;
  const primaryIds = new Set();
  const pageDigests = new Set();
  do {
    const page = projectAgenticSdlcCanvas(fixtureInput({ cursor, limit: 3 }));
    projectionDigest ??= page.projectionDigest;
    total ??= page.page.total;
    assert.equal(page.projectionDigest, projectionDigest);
    assert.equal(page.page.cursor, cursor);
    pageDigests.add(page.pageDigest);
    const ids = new Set(page.graphData.nodes.map((node) => node.id));
    assert.ok(page.graphData.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
    const primary = page.graphData.nodes.filter((node) => node.properties.stubReason !== "page_endpoint");
    assert.equal(primary.length, page.page.count);
    primaryCount += primary.length;
    for (const node of primary) {
      assert.equal(primaryIds.has(node.id), false);
      primaryIds.add(node.id);
    }
    cursor = page.page.nextCursor;
  } while (cursor);
  assert.equal(primaryCount, total);
  assert.equal(primaryIds.size, total);
  assert.ok(pageDigests.size > 1);

  const first = projectAgenticSdlcCanvas(fixtureInput({ limit: 3 }));
  const changed = fixtureInput({ cursor: first.page.nextCursor, limit: 3 });
  changed.normalizedRun.tasks[0].text = "Changed after cursor issue";
  assert.throws(
    () => projectAgenticSdlcCanvas(changed),
    (error) => error instanceof AgenticSdlcProjectionError && error.code === "stale_cursor",
  );
  assert.throws(
    () => projectAgenticSdlcCanvas(fixtureInput({ cursor: "not+a+cursor", limit: 3 })),
    (error) => error instanceof AgenticSdlcProjectionError && error.code === "invalid_cursor",
  );
});

test("invalid projection requests fail with stable typed errors", () => {
  assert.throws(
    () => projectAgenticSdlcCanvas(fixtureInput({ view: "dashboard" })),
    (error) => error instanceof AgenticSdlcProjectionError && error.code === "invalid_view",
  );
  assert.throws(
    () => projectAgenticSdlcCanvas(fixtureInput({
      normalizedRun: { schema: "other/v1", runId: "x" },
    })),
    (error) => error instanceof AgenticSdlcProjectionError
      && error.code === "invalid_projection_input",
  );
  assert.throws(
    () => projectAgenticSdlcCanvas(fixtureInput({ limit: 201 })),
    (error) => error instanceof AgenticSdlcProjectionError
      && error.code === "invalid_projection_input",
  );
});
