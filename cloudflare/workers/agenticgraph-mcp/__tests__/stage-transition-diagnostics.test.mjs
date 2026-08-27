// Unit tests for stage-transition diagnostics
// (knowgrph-acos-mcp-connector spec, task 1.5 - R14.5 / Property 27).
//
//   WHEN a Director run transitions from one stage to another, THE Mcp_Agent
//   SHALL emit an observability diagnostic record containing the run id, the
//   originating stage id, the destination stage id, a UTC timestamp, and the
//   transition outcome status.
//
// These tests exercise the pure derivation/emission helpers against real
// Director output (`runVideoRemix`) and synthetic manifests so the diagnostics
// can be validated under Node without booting workerd. The McpAgent wiring in
// `index.ts` reuses the same `emitStageTransitionDiagnostics` helper with an
// injectable emitter, unified with the task 1.3 persistence diagnostic sink.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runVideoRemix } from "../../../../mcp/video-remix-runtime.js";
import {
  buildStageTransitionDiagnostic,
  deriveStageTransitionDiagnostics,
  emitStageTransitionDiagnostics,
  STAGE_TRANSITION_DIAGNOSTIC_TYPE,
} from "../run-manifest-store.mjs";

const REQUIRED_FIELDS = Object.freeze([
  "runId",
  "fromStage",
  "toStage",
  "utcTimestamp",
  "outcomeStatus",
]);

function assertCompleteDiagnostic(diagnostic) {
  // Exactly the five enumerated fields (task 1.5).
  assert.deepEqual(
    Object.keys(diagnostic).sort(),
    [...REQUIRED_FIELDS].sort(),
    "diagnostic carries exactly the five required fields",
  );
  assert.ok(diagnostic.runId && typeof diagnostic.runId === "string", "runId present");
  assert.ok(
    diagnostic.fromStage && typeof diagnostic.fromStage === "string",
    "fromStage present",
  );
  assert.ok(
    diagnostic.toStage && typeof diagnostic.toStage === "string",
    "toStage present",
  );
  assert.ok(
    diagnostic.outcomeStatus && typeof diagnostic.outcomeStatus === "string",
    "outcomeStatus present",
  );
  // utcTimestamp must be a valid ISO-8601 UTC string that round-trips.
  assert.equal(typeof diagnostic.utcTimestamp, "string");
  const parsed = new Date(diagnostic.utcTimestamp);
  assert.ok(!Number.isNaN(parsed.getTime()), "utcTimestamp parses to a valid date");
  assert.equal(
    parsed.toISOString(),
    diagnostic.utcTimestamp,
    "utcTimestamp is a canonical ISO-8601 UTC string",
  );
}

// ---------------------------------------------------------------------------
// buildStageTransitionDiagnostic
// ---------------------------------------------------------------------------

test("buildStageTransitionDiagnostic emits exactly the five required fields", () => {
  const diagnostic = buildStageTransitionDiagnostic({
    runId: "run-1",
    fromStage: "research",
    toStage: "storyboard",
    outcomeStatus: "complete",
    nowMs: 1_700_000_000_000,
  });
  assertCompleteDiagnostic(diagnostic);
  assert.equal(diagnostic.runId, "run-1");
  assert.equal(diagnostic.fromStage, "research");
  assert.equal(diagnostic.toStage, "storyboard");
  assert.equal(diagnostic.outcomeStatus, "complete");
  assert.equal(diagnostic.utcTimestamp, "2023-11-14T22:13:20.000Z");
});

test("buildStageTransitionDiagnostic falls back to 'unknown' outcome status", () => {
  const diagnostic = buildStageTransitionDiagnostic({
    runId: "run-1",
    fromStage: "render",
    toStage: "checkout",
    outcomeStatus: null,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(diagnostic.outcomeStatus, "unknown");
});

// ---------------------------------------------------------------------------
// deriveStageTransitionDiagnostics - representative Director run (the core
// completeness assertion required by task 1.5 / Property 27).
// ---------------------------------------------------------------------------

test("representative Director run emits one complete diagnostic per stage transition", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Stage-transition diagnostics completeness for a representative run.",
    mode: "live",
    runId: "stage-transition-rep-001",
    shotCount: 3,
    approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
    sourceCards: [
      { sourceId: "s1", url: "https://example.com/a" },
      { sourceId: "s2", url: "https://example.com/b" },
      { sourceId: "s3", url: "https://example.com/c" },
    ],
  });

  const stages = payload.stages;
  assert.ok(Array.isArray(stages) && stages.length >= 2, "run produced an ordered stage sequence");

  const diagnostics = deriveStageTransitionDiagnostics(payload);

  // Completeness: exactly one diagnostic per consecutive transition.
  assert.equal(
    diagnostics.length,
    stages.length - 1,
    "one diagnostic per transition (N stages -> N-1 transitions)",
  );

  diagnostics.forEach((diagnostic, index) => {
    assertCompleteDiagnostic(diagnostic);
    // Each diagnostic ties the run id and the actual from/to stage ids.
    assert.equal(diagnostic.runId, "stage-transition-rep-001");
    assert.equal(diagnostic.fromStage, stages[index].id);
    assert.equal(diagnostic.toStage, stages[index + 1].id);
    // outcomeStatus reflects the destination stage's status.
    assert.equal(diagnostic.outcomeStatus, stages[index + 1].status);
  });
});

test("derived transitions cover the full research -> ... -> checkout chain", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Ordered chain coverage.",
    mode: "dry-run",
    runId: "stage-transition-chain-001",
    shotCount: 2,
  });
  const diagnostics = deriveStageTransitionDiagnostics(payload);
  const chain = [
    diagnostics[0]?.fromStage,
    ...diagnostics.map((d) => d.toStage),
  ];
  // Every adjacent pair in the source-owned stage sequence becomes a transition.
  assert.deepEqual(chain, payload.stages.map((s) => s.id));
  assert.ok(chain.includes("research"));
  assert.ok(chain.includes("storyboard"));
  assert.ok(chain.includes("render"));
  assert.ok(chain.includes("checkout"));
});

test("early-halt (weak_signal) run still emits complete diagnostics carrying the halt outcome", () => {
  // Live run with paid-model-call approved but no source cards -> research is
  // weak_signal and storyboard is blocked: the transition diagnostics must
  // still be complete and carry the halt outcome statuses.
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Early-halt weak-signal transition diagnostics.",
    mode: "live",
    runId: "stage-transition-halt-001",
    shotCount: 2,
    approvals: ["paid-model-call"],
  });

  const diagnostics = deriveStageTransitionDiagnostics(payload);
  assert.equal(diagnostics.length, payload.stages.length - 1);
  diagnostics.forEach((diagnostic, index) => {
    assertCompleteDiagnostic(diagnostic);
    assert.equal(diagnostic.toStage, payload.stages[index + 1].id);
    assert.equal(diagnostic.outcomeStatus, payload.stages[index + 1].status);
  });

  // The research -> storyboard transition should reflect the blocked/weak
  // destination status (not a generic "complete").
  const researchToStoryboard = diagnostics.find(
    (d) => d.fromStage === "research" && d.toStage === "storyboard",
  );
  assert.ok(researchToStoryboard, "research -> storyboard transition present");
  assert.match(
    researchToStoryboard.outcomeStatus,
    /blocked|weak/,
    "destination outcome reflects the early-halt status",
  );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("deriveStageTransitionDiagnostics returns [] for fewer than two stages", () => {
  assert.deepEqual(deriveStageTransitionDiagnostics({ runId: "r", stages: [] }), []);
  assert.deepEqual(
    deriveStageTransitionDiagnostics({ runId: "r", stages: [{ id: "only", status: "complete" }] }),
    [],
  );
});

test("deriveStageTransitionDiagnostics tolerates missing/!-object manifests", () => {
  assert.deepEqual(deriveStageTransitionDiagnostics(null), []);
  assert.deepEqual(deriveStageTransitionDiagnostics(undefined), []);
  assert.deepEqual(deriveStageTransitionDiagnostics("nope"), []);
  assert.deepEqual(deriveStageTransitionDiagnostics({ runId: "r" }), []);
});

test("deriveStageTransitionDiagnostics skips stages without an id", () => {
  const diagnostics = deriveStageTransitionDiagnostics({
    runId: "run-skip",
    stages: [
      { id: "research", status: "complete" },
      { status: "orphan-no-id" },
      { id: "render", status: "complete" },
    ],
  });
  // The id-less middle stage is skipped, leaving a single research -> render
  // transition.
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].fromStage, "research");
  assert.equal(diagnostics[0].toStage, "render");
});

// ---------------------------------------------------------------------------
// emitStageTransitionDiagnostics - injectable emitter (capture in tests; the
// McpAgent dispatch path in index.ts uses the same helper).
// ---------------------------------------------------------------------------

test("emitStageTransitionDiagnostics forwards each diagnostic to an injected emitter", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Injectable emitter capture.",
    mode: "dry-run",
    runId: "stage-transition-emit-001",
    shotCount: 2,
  });

  const captured = [];
  const returned = emitStageTransitionDiagnostics({
    manifest: payload,
    emit: (diagnostic) => captured.push(diagnostic),
  });

  assert.equal(captured.length, payload.stages.length - 1);
  assert.deepEqual(captured, returned);
  captured.forEach(assertCompleteDiagnostic);
});

test("emitStageTransitionDiagnostics never lets a throwing emitter escape", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Throwing emitter is swallowed.",
    mode: "dry-run",
    runId: "stage-transition-throw-001",
    shotCount: 2,
  });

  let calls = 0;
  assert.doesNotThrow(() => {
    emitStageTransitionDiagnostics({
      manifest: payload,
      emit: () => {
        calls += 1;
        throw new Error("emitter blew up");
      },
    });
  });
  assert.equal(calls, payload.stages.length - 1, "every transition was still attempted");
});

test("STAGE_TRANSITION_DIAGNOSTIC_TYPE is a stable discriminator", () => {
  assert.equal(STAGE_TRANSITION_DIAGNOSTIC_TYPE, "stage_transition");
});
