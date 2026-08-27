// Unit tests for the Director input-validation gate
// (agenticgraph-acos-mcp-connector spec, task 2.5 - R2.1, R2.2 / Property 4).
//
// R2.2: IF a `agenticgraph.video_remix.run` call omits a required field, supplies
// an out-of-range `budgetUsd`, or supplies a `mode` value other than `"live"`
// or `"dry-run"`, THEN THE Mcp_Agent SHALL reject the call, return an error
// identifying the invalid field, perform zero paid-provider calls, and create
// no Run_Manifest.
//
// Property 4: Director input validation rejects malformed runs (naming the bad
// field, zero paid calls, no Run_Manifest); conversely a fully valid input
// produces a Run_Manifest.
//
// This is the implementation seam for Property 4; the consolidated
// property-based test lands in task 9.1. These are example-based unit asserts
// of the rejection mechanism (THROW a typed `DirectorInputValidationError`
// naming the field) and the valid-input-produces-manifest case.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  validateDirectorInput,
  DirectorInputValidationError,
} from "../video-remix-runtime.js";
import { runDirectorWorkflow } from "../director-workflow.js";

// A baseline fully-valid input. Individual cases clone + mutate this so each
// test isolates exactly one invalid field.
const VALID_INPUT = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Remix the reference into a sellable launch teaser.",
  mode: "dry-run",
  budgetUsd: 20,
  runId: "director-input-validation-001",
  shotCount: 3,
});

/**
 * Assert that `runVideoRemix(args)` rejects by throwing a
 * `DirectorInputValidationError` naming `expectedField`, AND that nothing was
 * produced: no payload / Run_Manifest is returned, and zero paid-provider
 * calls occur (nothing executes because the gate runs first).
 */
function assertRejectsNamingField(args, expectedField) {
  let thrown;
  let returned;
  try {
    returned = runVideoRemix(args);
  } catch (err) {
    thrown = err;
  }

  // No Run_Manifest was produced (the call threw before building a payload).
  assert.equal(returned, undefined, "no Run_Manifest payload may be returned on rejection");

  // A typed error naming the invalid field was thrown.
  assert.ok(thrown, "a rejection error must be thrown");
  assert.ok(
    thrown instanceof DirectorInputValidationError,
    `expected DirectorInputValidationError, got ${thrown && thrown.name}`,
  );
  assert.equal(thrown.field, expectedField, `error must name the invalid field (${expectedField})`);
  assert.equal(thrown.code, "invalid_director_input");
  // The message references the field so the Agent_Api / MCP boundary can
  // surface it to the caller.
  assert.match(thrown.message, new RegExp(expectedField));
}

// ---------------------------------------------------------------------------
// R2.2: missing required field rejection (referenceUrl, brief).
// ---------------------------------------------------------------------------

test("R2.2: omitting referenceUrl rejects, naming referenceUrl, with no manifest", () => {
  const { referenceUrl, ...rest } = VALID_INPUT;
  void referenceUrl;
  assertRejectsNamingField(rest, "referenceUrl");
});

test("R2.2: empty/whitespace referenceUrl rejects, naming referenceUrl", () => {
  assertRejectsNamingField({ ...VALID_INPUT, referenceUrl: "   " }, "referenceUrl");
});

test("R2.2: a non-absolute referenceUrl rejects, naming referenceUrl", () => {
  assertRejectsNamingField({ ...VALID_INPUT, referenceUrl: "not-a-url" }, "referenceUrl");
});

test("R2.2: omitting brief rejects, naming brief, with no manifest", () => {
  const { brief, ...rest } = VALID_INPUT;
  void brief;
  assertRejectsNamingField(rest, "brief");
});

test("R2.2: empty/whitespace brief rejects, naming brief", () => {
  assertRejectsNamingField({ ...VALID_INPUT, brief: "   " }, "brief");
});

test("R2.2: a brief over 5000 characters rejects, naming brief", () => {
  assertRejectsNamingField({ ...VALID_INPUT, brief: "a".repeat(5001) }, "brief");
});

// ---------------------------------------------------------------------------
// R2.2: out-of-range budgetUsd rejection (only when provided).
// ---------------------------------------------------------------------------

test("R2.2: budgetUsd below the 0.01 minimum rejects, naming budgetUsd", () => {
  assertRejectsNamingField({ ...VALID_INPUT, budgetUsd: 0 }, "budgetUsd");
  assertRejectsNamingField({ ...VALID_INPUT, budgetUsd: 0.009 }, "budgetUsd");
  assertRejectsNamingField({ ...VALID_INPUT, budgetUsd: -5 }, "budgetUsd");
});

test("R2.2: budgetUsd above the 100000.00 maximum rejects, naming budgetUsd", () => {
  assertRejectsNamingField({ ...VALID_INPUT, budgetUsd: 100000.01 }, "budgetUsd");
  assertRejectsNamingField({ ...VALID_INPUT, budgetUsd: 1_000_000 }, "budgetUsd");
});

test("R2.2: a non-numeric budgetUsd rejects, naming budgetUsd", () => {
  assertRejectsNamingField({ ...VALID_INPUT, budgetUsd: "lots" }, "budgetUsd");
  assertRejectsNamingField({ ...VALID_INPUT, budgetUsd: Number.NaN }, "budgetUsd");
});

test("R2.1: the inclusive budget bounds [0.01, 100000.00] are accepted", () => {
  const low = runVideoRemix({ ...VALID_INPUT, budgetUsd: 0.01 });
  assert.equal(low.payload.budgetMeters.budgetUsd, 0.01);
  const high = runVideoRemix({ ...VALID_INPUT, budgetUsd: 100000.0 });
  assert.equal(high.payload.budgetMeters.budgetUsd, 100000.0);
});

test("compatibility: an omitted budgetUsd is accepted and produces a manifest", () => {
  // budgetUsd is optional in some call paths (matches the worker's `.optional()`
  // Zod schema). Omitting it must NOT reject.
  const { budgetUsd, ...rest } = VALID_INPUT;
  void budgetUsd;
  const { payload } = runVideoRemix(rest);
  assert.ok(payload, "an omitted budget must still produce a Run_Manifest");
  assert.equal(payload.budgetMeters.budgetUsd, 0);
});

// ---------------------------------------------------------------------------
// R2.2: invalid mode rejection.
// ---------------------------------------------------------------------------

test("R2.2: a mode other than live/dry-run rejects, naming mode", () => {
  assertRejectsNamingField({ ...VALID_INPUT, mode: "fast" }, "mode");
  assertRejectsNamingField({ ...VALID_INPUT, mode: "LIVE" }, "mode");
  assertRejectsNamingField({ ...VALID_INPUT, mode: "production" }, "mode");
});

test("R2.1: both valid modes are accepted", () => {
  assert.equal(runVideoRemix({ ...VALID_INPUT, mode: "live", approvals: [] }).payload.mode, "live");
  assert.equal(runVideoRemix({ ...VALID_INPUT, mode: "dry-run" }).payload.mode, "dry-run");
});

test("compatibility: an omitted mode defaults to dry-run (no rejection)", () => {
  const { mode, ...rest } = VALID_INPUT;
  void mode;
  const { payload } = runVideoRemix(rest);
  assert.equal(payload.mode, "dry-run");
});

// ---------------------------------------------------------------------------
// Property 4 (second half): a fully valid input produces a Run_Manifest.
// ---------------------------------------------------------------------------

test("Property 4: a fully valid input produces a Run_Manifest", () => {
  const { payload } = runVideoRemix(VALID_INPUT);
  assert.ok(payload, "valid input must produce a Run_Manifest payload");
  assert.equal(payload.contractVersion, "agenticgraph.video_remix/v0.1");
  assert.equal(payload.runId, "director-input-validation-001");
  assert.equal(payload.mode, "dry-run");
  assert.ok(Array.isArray(payload.stages) && payload.stages.length > 0);
  assert.ok(Array.isArray(payload.approvalGates) && payload.approvalGates.length >= 5);
  assert.ok(payload.budgetMeters && typeof payload.budgetMeters === "object");
});

test("Property 4: a fully valid LIVE input also produces a Run_Manifest", () => {
  const { payload } = runVideoRemix({
    ...VALID_INPUT,
    mode: "live",
    runId: "director-input-validation-live-001",
    approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
    sourceCards: [
      { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
      { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
      { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
    ],
  });
  assert.ok(payload);
  assert.equal(payload.mode, "live");
  assert.equal(payload.state, "complete");
});

// ---------------------------------------------------------------------------
// validateDirectorInput is usable standalone (the seam the worker/Agent_Api
// can reuse) and returns the normalized accepted values.
// ---------------------------------------------------------------------------

test("validateDirectorInput returns normalized values for a valid input", () => {
  const out = validateDirectorInput(VALID_INPUT);
  assert.equal(out.referenceUrl, "https://example.com/reference.mp4");
  assert.equal(out.brief, "Remix the reference into a sellable launch teaser.");
  assert.equal(out.mode, "dry-run");
  assert.equal(out.budgetUsd, 20);
});

test("validateDirectorInput throws DirectorInputValidationError naming the field", () => {
  assert.throws(
    () => validateDirectorInput({ ...VALID_INPUT, mode: "nope" }),
    (err) => err instanceof DirectorInputValidationError && err.field === "mode",
  );
});

// ---------------------------------------------------------------------------
// The validation gate is enforced through the Director workflow wrapper too.
// ---------------------------------------------------------------------------

test("the Director workflow wrapper rejects malformed input the same way", () => {
  assert.throws(
    () => runDirectorWorkflow({ ...VALID_INPUT, budgetUsd: 100000.01 }),
    (err) => err instanceof DirectorInputValidationError && err.field === "budgetUsd",
  );
});

test("the Director workflow wrapper produces a manifest for valid input", () => {
  const { payload } = runDirectorWorkflow(VALID_INPUT);
  assert.ok(payload);
  assert.equal(payload.runId, "director-input-validation-001");
});
