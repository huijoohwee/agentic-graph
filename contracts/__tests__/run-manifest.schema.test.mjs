// =============================================================================
// Run_Manifest SSOT schema — unit + property tests
// agenticgraph-acos-mcp-connector spec · Task 8.1 · Requirements R2.1, R5.4
// Pure validator: ZERO network calls, deterministic.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateRunManifest,
  createRunManifest,
  RUN_STATE,
  RUN_STATE_VALUES,
  RUN_MODE,
  RUN_MODE_VALUES,
  STAGE_ID,
  STAGE_ID_VALUES,
  STAGE_STATUS,
  STAGE_STATUS_VALUES,
  APPROVAL_GATE_ID,
  APPROVAL_GATE_ID_VALUES,
  APPROVAL_GATE_STATE,
  APPROVAL_GATE_STATE_VALUES,
} from "../run-manifest.schema.js";

// --- helpers ----------------------------------------------------------------

/** A complete, canonical, schema-valid Run_Manifest (design Data Models). */
function completeManifest(overrides = {}) {
  return {
    runId: "run-abc",
    state: RUN_STATE.BLOCKED,
    mode: RUN_MODE.LIVE,
    stages: [
      { id: STAGE_ID.RESEARCH, status: STAGE_STATUS.COMPLETED, retryCount: 0, costLog: null, artifact: null },
      {
        id: STAGE_ID.STORYBOARD,
        status: STAGE_STATUS.APPROVAL_REQUIRED,
        retryCount: 2,
        costLog: { model: "byteplus", estimated_cost_usd: 0 },
        artifact: { plan: "dry-run" },
      },
    ],
    approvalGates: [
      { gateId: APPROVAL_GATE_ID.PAID_MODEL_CALL, approvalState: APPROVAL_GATE_STATE.PENDING, estimatedCostUsd: 0, token: null },
      { gateId: APPROVAL_GATE_ID.RENDER_ACTION, approvalState: APPROVAL_GATE_STATE.APPROVED, estimatedCostUsd: 4.2, token: { signature: "x" } },
    ],
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [{ stageId: STAGE_ID.RENDER, finalRetryCount: 8, reason: "provider unavailable" }],
    reconciliationFlags: ["run-abc:ledger-mismatch"],
    ...overrides,
  };
}

const pathsOf = (result) => result.errors.map((e) => e.path);

// --- 1. A complete valid Run_Manifest passes --------------------------------

test("a complete, canonical Run_Manifest is valid with no errors", () => {
  const result = validateRunManifest(completeManifest());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("the createRunManifest factory produces a schema-valid manifest", () => {
  assert.equal(validateRunManifest(createRunManifest()).valid, true);
  assert.equal(validateRunManifest(createRunManifest({ runId: "r1", mode: RUN_MODE.DRY_RUN })).valid, true);
});

// --- 2. Each missing top-level field is flagged with a path + reason --------

const TOP_LEVEL_FIELDS = [
  "runId",
  "state",
  "mode",
  "stages",
  "approvalGates",
  "budgetMeters",
  "demoPack",
  "failures",
  "reconciliationFlags",
];

for (const field of TOP_LEVEL_FIELDS) {
  test(`missing top-level field "${field}" is flagged with path + reason`, () => {
    const m = completeManifest();
    delete m[field];
    const result = validateRunManifest(m);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === field);
    assert.ok(err, `expected an error at path "${field}"`);
    assert.match(err.reason, /missing/);
    assert.equal(typeof err.reason, "string");
  });
}

// --- 3. Invalid top-level field types are flagged ---------------------------

test("non-object manifest is flagged at the root path", () => {
  for (const bad of [undefined, null, 42, "x", [], true]) {
    const result = validateRunManifest(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.path === ""));
  }
});

test("non-array stages / approvalGates / failures / reconciliationFlags flagged", () => {
  const r1 = validateRunManifest(completeManifest({ stages: {} }));
  assert.ok(pathsOf(r1).includes("stages"));
  const r2 = validateRunManifest(completeManifest({ approvalGates: "no" }));
  assert.ok(pathsOf(r2).includes("approvalGates"));
  const r3 = validateRunManifest(completeManifest({ failures: 1 }));
  assert.ok(pathsOf(r3).includes("failures"));
  const r4 = validateRunManifest(completeManifest({ reconciliationFlags: {} }));
  assert.ok(pathsOf(r4).includes("reconciliationFlags"));
});

test("budgetMeters missing sub-fields are each flagged by path", () => {
  const r = validateRunManifest(completeManifest({ budgetMeters: { estimatedCostUsd: 0 } }));
  assert.equal(r.valid, false);
  assert.ok(pathsOf(r).includes("budgetMeters.actualCostUsd"));
  assert.ok(pathsOf(r).includes("budgetMeters.providerSpendUsd"));
});

test("negative budgetMeters values are flagged", () => {
  const r = validateRunManifest(completeManifest({ budgetMeters: { estimatedCostUsd: -1, actualCostUsd: 0, providerSpendUsd: 0 } }));
  assert.ok(pathsOf(r).includes("budgetMeters.estimatedCostUsd"));
});

test("demoPack must be an object or null", () => {
  assert.equal(validateRunManifest(completeManifest({ demoPack: { sections: [] } })).valid, true);
  assert.equal(validateRunManifest(completeManifest({ demoPack: "x" })).valid, false);
});

// --- 4. Enum validation: state, approvalState, stage status -----------------

test("invalid Run_State is flagged at path 'state'", () => {
  const r = validateRunManifest(completeManifest({ state: "paused" }));
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.path === "state");
  assert.ok(err && /one of/.test(err.reason));
});

test("every valid Run_State is accepted", () => {
  for (const state of RUN_STATE_VALUES) {
    assert.equal(validateRunManifest(completeManifest({ state })).valid, true, state);
  }
});

test("invalid mode is flagged at path 'mode'", () => {
  assert.equal(validateRunManifest(completeManifest({ mode: "simulate" })).valid, false);
  for (const mode of RUN_MODE_VALUES) {
    assert.equal(validateRunManifest(completeManifest({ mode })).valid, true, mode);
  }
});

test("invalid stage status is flagged at the stage path", () => {
  const m = completeManifest();
  m.stages[0].status = "halted";
  const r = validateRunManifest(m);
  assert.equal(r.valid, false);
  assert.ok(pathsOf(r).includes("stages[0].status"));
});

test("every valid stage status is accepted", () => {
  for (const status of STAGE_STATUS_VALUES) {
    const m = completeManifest();
    m.stages[0].status = status;
    assert.equal(validateRunManifest(m).valid, true, status);
  }
});

test("invalid stage id and approval gate enums are flagged by path", () => {
  const m = completeManifest();
  m.stages[0].id = "ingest";
  m.approvalGates[0].gateId = "mystery-gate";
  m.approvalGates[0].approvalState = "maybe";
  const r = validateRunManifest(m);
  assert.equal(r.valid, false);
  assert.ok(pathsOf(r).includes("stages[0].id"));
  assert.ok(pathsOf(r).includes("approvalGates[0].gateId"));
  assert.ok(pathsOf(r).includes("approvalGates[0].approvalState"));
});

test("all six approval gate ids and three states are accepted", () => {
  for (const gateId of APPROVAL_GATE_ID_VALUES) {
    for (const approvalState of APPROVAL_GATE_STATE_VALUES) {
      const m = completeManifest({
        approvalGates: [{ gateId, approvalState, estimatedCostUsd: 1, token: null }],
      });
      assert.equal(validateRunManifest(m).valid, true, `${gateId}/${approvalState}`);
    }
  }
});

// --- 5. retryCount / failure record domain ----------------------------------

test("negative or non-integer retryCount is flagged (R5.1)", () => {
  const m = completeManifest();
  m.stages[0].retryCount = -1;
  assert.ok(pathsOf(validateRunManifest(m)).includes("stages[0].retryCount"));
  m.stages[0].retryCount = 1.5;
  assert.ok(pathsOf(validateRunManifest(m)).includes("stages[0].retryCount"));
});

test("failure record requires stageId, finalRetryCount, reason (R5.4)", () => {
  const m = completeManifest({ failures: [{ stageId: "nope", finalRetryCount: -1 }] });
  const r = validateRunManifest(m);
  assert.equal(r.valid, false);
  assert.ok(pathsOf(r).includes("failures[0].stageId"));
  assert.ok(pathsOf(r).includes("failures[0].finalRetryCount"));
  assert.ok(pathsOf(r).includes("failures[0].reason"));
});

// --- 6. Empty arrays are valid ----------------------------------------------

test("empty stages/approvalGates/failures/reconciliationFlags arrays are valid", () => {
  const r = validateRunManifest(
    completeManifest({ stages: [], approvalGates: [], failures: [], reconciliationFlags: [] }),
  );
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

// --- 7. Malformed input never throws (property-style, deterministic) --------

test("malformed input never throws and always returns a result shape", () => {
  const circular = {};
  circular.self = circular;
  const inputs = [
    undefined, null, 0, NaN, Infinity, "", "str", true, false,
    [], [1, 2], {}, { runId: 1 }, Symbol.iterator && {},
    { stages: [null, 1, "x", {}] },
    { approvalGates: [null, [], 5] },
    { failures: [undefined, {}, { stageId: 1 }] },
    { budgetMeters: null },
    { reconciliationFlags: [1, "", null, "ok"] },
    circular,
    completeManifest(),
  ];
  for (const input of inputs) {
    let result;
    assert.doesNotThrow(() => {
      result = validateRunManifest(input);
    }, `threw on input: ${String(input)}`);
    assert.equal(typeof result.valid, "boolean");
    assert.ok(Array.isArray(result.errors));
    for (const e of result.errors) {
      assert.equal(typeof e.path, "string");
      assert.equal(typeof e.reason, "string");
    }
  }
});

// Bounded exhaustive sweep: corrupting any single nested field keeps the
// validator total (never throws) and yields at least one structured error.
test("single-field corruption sweep stays total and reports errors", () => {
  const corruptions = [
    (m) => { m.runId = ""; },
    (m) => { m.state = 123; },
    (m) => { m.mode = null; },
    (m) => { m.stages[0] = "x"; },
    (m) => { delete m.stages[0].costLog; },
    (m) => { m.stages[0].artifact = 7; },
    (m) => { m.approvalGates[0].token = 5; },
    (m) => { m.approvalGates[0].estimatedCostUsd = "free"; },
    (m) => { m.budgetMeters.providerSpendUsd = "x"; },
    (m) => { m.reconciliationFlags[0] = ""; },
  ];
  for (const corrupt of corruptions) {
    const m = completeManifest();
    corrupt(m);
    let result;
    assert.doesNotThrow(() => {
      result = validateRunManifest(m);
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 1);
  }
});
