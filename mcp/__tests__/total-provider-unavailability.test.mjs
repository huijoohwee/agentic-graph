// Unit tests for total-provider-unavailability handling
// (agentic-graph-acos-mcp-connector spec, task 2.8 - R5.5).
//
// R5.5: IF the Ai_Gateway reports that all providers are unavailable, THEN the
//   affected harness SHALL return a structured degraded error identifying the
//   unavailable providers, and THE Director SHALL set Run_State to `blocked`
//   without consuming additional retries.
//
// This is the implementation seam for the R5.5 portion of failure handling; the
// consolidated property-based test lands in task 9.1. These are example-based
// unit asserts of the DETERMINISTIC, PURE, timer-free model:
//   * total provider unavailability is a SEPARATE branch from the bounded-retry
//     schedule (`unavailableProviders` arg) — it does NOT flow through
//     `buildBoundedRetryPlan`, so it consumes no retries;
//   * the affected harness returns a structured degraded error NAMING the
//     unavailable providers;
//   * the Director sets Run_State `blocked`;
//   * the appended canonical failure record's `finalRetryCount` equals the
//     CURRENT retryCount (no increment), so "without consuming additional
//     retries" is observable.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  normalizeUnavailableProviders,
  buildProviderUnavailabilityDegradedError,
} from "../video-remix-runtime.js";

const BASE_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Total-provider-unavailability handling.",
  mode: "dry-run",
  runId: "provider-unavailability-001",
});

// Three source cards so research is not a weak signal — lets the tests
// attribute `blocked` to provider unavailability (R5.5) rather than to the
// weak-signal halt (R4.5).
const THREE_SOURCE_CARDS = Object.freeze([
  { url: "https://example.com/a", sourceId: "source-1" },
  { url: "https://example.com/b", sourceId: "source-2" },
  { url: "https://example.com/c", sourceId: "source-3" },
]);

const PROVIDER_UNAVAILABLE_REASON = "provider_unavailable_degraded";

// ---------------------------------------------------------------------------
// normalizeUnavailableProviders: de-duplicates and cleans provider names.
// ---------------------------------------------------------------------------

test("normalizeUnavailableProviders accepts a single name, an array, and objects", () => {
  assert.deepEqual(normalizeUnavailableProviders("byteplus"), ["byteplus"]);
  assert.deepEqual(normalizeUnavailableProviders(["byteplus", "exa"]), ["byteplus", "exa"]);
  assert.deepEqual(
    normalizeUnavailableProviders([{ provider: "byteplus" }, { name: "exa" }, { id: "external_video_provider" }]),
    ["byteplus", "exa", "external_video_provider"],
  );
});

test("normalizeUnavailableProviders drops blanks, de-duplicates, and preserves order", () => {
  assert.deepEqual(
    normalizeUnavailableProviders(["byteplus", "", "  ", "exa", "byteplus"]),
    ["byteplus", "exa"],
  );
  assert.deepEqual(normalizeUnavailableProviders(undefined), []);
  assert.deepEqual(normalizeUnavailableProviders(null), []);
  assert.deepEqual(normalizeUnavailableProviders([]), []);
});

// ---------------------------------------------------------------------------
// buildProviderUnavailabilityDegradedError: structured, names providers, no
// retries consumed.
// ---------------------------------------------------------------------------

test("R5.5: the degraded error is structured and identifies the unavailable providers", () => {
  const error = buildProviderUnavailabilityDegradedError({
    stageId: "research",
    providers: ["byteplus", "exa"],
    retryCount: 0,
  });
  assert.equal(error.kind, "degraded_error");
  assert.equal(error.code, "all_providers_unavailable");
  assert.equal(error.degraded, true);
  assert.equal(error.stageId, "research");
  assert.deepEqual(error.unavailableProviders, ["byteplus", "exa"]);
  assert.equal(error.reason, PROVIDER_UNAVAILABLE_REASON);
  // No additional retries consumed (R5.5).
  assert.equal(error.retriesConsumed, 0);
  assert.equal(error.finalRetryCount, 0);
  // The message names the providers so the cause is human-observable.
  assert.match(error.message, /byteplus/);
  assert.match(error.message, /exa/);
});

test("R5.5: the degraded error keeps finalRetryCount at the CURRENT retryCount (no increment)", () => {
  // A stage already mid-retry (retryCount = 2) that hits total unavailability
  // must NOT have its count incremented — retries are not consumed.
  const error = buildProviderUnavailabilityDegradedError({
    stageId: "storyboard",
    providers: ["external_video_provider"],
    retryCount: 2,
  });
  assert.equal(error.finalRetryCount, 2);
  assert.equal(error.retriesConsumed, 0);
});

// ---------------------------------------------------------------------------
// Integration: the runtime Run_Manifest surfaces the R5.5 fail-closed path.
// ---------------------------------------------------------------------------

test("R5.5: total provider unavailability sets Run_State blocked and returns a degraded error naming providers", () => {
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations: 8,
    sourceCards: THREE_SOURCE_CARDS,
    unavailableProviders: ["byteplus", "exa"],
    providerUnavailableTool: "agentic-graph.video_remix.research",
  });

  // Director sets Run_State blocked (R5.5) — attributable to provider
  // unavailability, not a weak signal (three sources supplied).
  assert.equal(payload.state, "blocked");

  // The affected harness returned a structured degraded error NAMING the
  // unavailable providers (R5.5).
  assert.equal(payload.providerUnavailability.degraded, true);
  assert.equal(payload.providerUnavailability.errors.length, 1);
  const [degradedError] = payload.providerUnavailability.errors;
  assert.equal(degradedError.code, "all_providers_unavailable");
  assert.equal(degradedError.stageId, "research");
  assert.deepEqual(degradedError.unavailableProviders, ["byteplus", "exa"]);

  // A canonical failure record is appended to the top-level Run_Manifest
  // `failures[]` with the sibling reason code.
  assert.ok(Array.isArray(payload.failures));
  assert.equal(payload.failures.length, 1);
  const [record] = payload.failures;
  assert.deepEqual(Object.keys(record).sort(), ["finalRetryCount", "reason", "stageId"]);
  assert.equal(record.stageId, "research");
  assert.equal(record.reason, PROVIDER_UNAVAILABLE_REASON);
  // finalRetryCount equals the CURRENT retryCount (default 0) — no increment.
  assert.equal(record.finalRetryCount, 0);

  // The validation check + guardrail hold.
  const check = payload.validation.checks.find(
    (c) => c.id === "provider_unavailability_degrades_without_consuming_retries",
  );
  assert.ok(check && check.ok === true);
  assert.equal(payload.guardrails.providerUnavailabilityFailsClosedWithoutConsumingRetries, true);
});

test("R5.5: no additional retries are consumed — the bounded-retry schedule is not advanced", () => {
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations: 8,
    sourceCards: THREE_SOURCE_CARDS,
    unavailableProviders: ["byteplus"],
    providerUnavailableTool: "agentic-graph.video_remix.research",
  });

  // The provider-unavailability failure did NOT route through the bounded-retry
  // schedule: it is not exhausted, schedules no backoff, and its finalRetryCount
  // is NOT the maxIterations bound (that would mean retries were consumed).
  const entry = payload.failureHandling.failures.find((f) => f.providerUnavailability);
  assert.ok(entry, "a provider-unavailability failure entry is recorded");
  assert.equal(entry.exhausted, false);
  assert.equal(entry.backoffMs, 0);
  assert.equal(entry.finalRetryCount, entry.retryCount); // no increment
  assert.notEqual(entry.finalRetryCount, payload.maxIterations); // retries NOT consumed to the bound
  assert.equal(entry.runState, "blocked");

  // The appended canonical record likewise does not reach the bound.
  assert.equal(payload.failures[0].finalRetryCount, 0);
  assert.notEqual(payload.failures[0].finalRetryCount, payload.maxIterations);
});

test("R5.5: finalRetryCount reflects the stage's current retry count without incrementing it", () => {
  // A stage already at retryCount = 3 when total unavailability is detected:
  // the record reflects 3, NOT 4 (no additional retry consumed).
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations: 8,
    sourceCards: THREE_SOURCE_CARDS,
    unavailableProviders: ["exa", "byteplus"],
    providerUnavailableTool: "agentic-graph.video_remix.storyboard",
    providerUnavailableAtRetryCount: 3,
  });
  assert.equal(payload.state, "blocked");
  assert.equal(payload.failures.length, 1);
  assert.equal(payload.failures[0].stageId, "storyboard");
  assert.equal(payload.failures[0].finalRetryCount, 3); // current count, no increment
  assert.equal(payload.failures[0].reason, PROVIDER_UNAVAILABLE_REASON);
});

test("R5.5 (converse): with no provider unavailability, the degraded path is inert", () => {
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations: 8,
    sourceCards: THREE_SOURCE_CARDS,
  });
  assert.equal(payload.providerUnavailability.degraded, false);
  assert.deepEqual(payload.providerUnavailability.errors, []);
  assert.deepEqual(payload.failures, []);
  // The guardrail and check hold vacuously.
  const check = payload.validation.checks.find(
    (c) => c.id === "provider_unavailability_degrades_without_consuming_retries",
  );
  assert.ok(check && check.ok === true);
  assert.equal(payload.guardrails.providerUnavailabilityFailsClosedWithoutConsumingRetries, true);
});
