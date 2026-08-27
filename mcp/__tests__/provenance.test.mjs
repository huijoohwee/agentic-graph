// =============================================================================
// Provenance recorder — unit tests
// agenticgraph-widget-canvas-media spec · Task 4 · Requirements R6.1, R6.6
//
// Covers:
//   1. A complete chain is built and validates.
//   2. A missing goalRef/briefRef/planRef throws MissingProvenanceComponentError
//      naming the missing field.
//   3. serialize → deserialize is field-for-field identical (R6.5).
//   4. Both `goal`/`brief`/`plan` and `goalRef`/`briefRef`/`planRef` input
//      conventions produce equivalent chains.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildProvenanceChain,
  assertComplete,
  MissingProvenanceComponentError,
  serializeProvenanceChain,
  deserializeProvenanceChain,
} from "../video-remix/provenance.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal complete chain using the canonical `*Ref` naming convention. */
function completeChainRef(overrides = {}) {
  return buildProvenanceChain({
    goalRef:  "goal:demo",
    briefRef: "brief:demo",
    planRef:  "plan:demo",
    toolCalls: [{ tool: "image", inputHash: "abc123" }],
    verificationChecks: [{ checkId: "persist", status: "passed" }],
    ...overrides,
  });
}

/** Minimal complete chain using the short `goal`/`brief`/`plan` naming convention. */
function completeChainShort(overrides = {}) {
  return buildProvenanceChain({
    goal:  "goal:demo",
    brief: "brief:demo",
    plan:  "plan:demo",
    toolCalls: [{ tool: "image", inputHash: "abc123" }],
    verificationChecks: [{ checkId: "persist", status: "passed" }],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. A complete chain is built and validates
// ---------------------------------------------------------------------------

test("buildProvenanceChain produces a chain with all required fields (goalRef naming)", () => {
  const chain = completeChainRef();
  assert.equal(chain.goalRef,  "goal:demo");
  assert.equal(chain.briefRef, "brief:demo");
  assert.equal(chain.planRef,  "plan:demo");
  assert.ok(Array.isArray(chain.toolCalls));
  assert.ok(Array.isArray(chain.verificationChecks));
  assert.equal(chain.toolCalls.length, 1);
  assert.equal(chain.verificationChecks.length, 1);
});

test("assertComplete does not throw for a complete chain (goalRef naming)", () => {
  assert.doesNotThrow(() => assertComplete(completeChainRef()));
});

test("assertComplete does not throw for a complete chain (short naming)", () => {
  assert.doesNotThrow(() => assertComplete(completeChainShort()));
});

test("buildProvenanceChain defaults toolCalls and verificationChecks to empty arrays", () => {
  const chain = buildProvenanceChain({ goalRef: "g", briefRef: "b", planRef: "p" });
  assert.deepEqual(chain.toolCalls, []);
  assert.deepEqual(chain.verificationChecks, []);
});

// ---------------------------------------------------------------------------
// 2. Missing goalRef / briefRef / planRef throws MissingProvenanceComponentError
//    naming the field (R6.6)
// ---------------------------------------------------------------------------

test("assertComplete throws MissingProvenanceComponentError for a missing goalRef", () => {
  const chain = buildProvenanceChain({ goalRef: "", briefRef: "b", planRef: "p" });
  assert.throws(
    () => assertComplete(chain),
    (err) => {
      assert.ok(err instanceof MissingProvenanceComponentError, "must be MissingProvenanceComponentError");
      assert.ok(
        Array.isArray(err.missingComponents) && err.missingComponents.includes("goalRef"),
        `missingComponents should include 'goalRef', got: ${JSON.stringify(err.missingComponents)}`,
      );
      return true;
    },
  );
});

test("assertComplete throws MissingProvenanceComponentError for a missing briefRef", () => {
  const chain = buildProvenanceChain({ goalRef: "g", briefRef: "", planRef: "p" });
  assert.throws(
    () => assertComplete(chain),
    (err) => {
      assert.ok(err instanceof MissingProvenanceComponentError);
      assert.ok(err.missingComponents.includes("briefRef"));
      return true;
    },
  );
});

test("assertComplete throws MissingProvenanceComponentError for a missing planRef", () => {
  const chain = buildProvenanceChain({ goalRef: "g", briefRef: "b", planRef: "" });
  assert.throws(
    () => assertComplete(chain),
    (err) => {
      assert.ok(err instanceof MissingProvenanceComponentError);
      assert.ok(err.missingComponents.includes("planRef"));
      return true;
    },
  );
});

test("assertComplete names ALL missing refs when multiple are absent", () => {
  const chain = buildProvenanceChain({ goalRef: "", briefRef: "", planRef: "" });
  assert.throws(
    () => assertComplete(chain),
    (err) => {
      assert.ok(err instanceof MissingProvenanceComponentError);
      assert.ok(err.missingComponents.includes("goalRef"),  "must list goalRef");
      assert.ok(err.missingComponents.includes("briefRef"), "must list briefRef");
      assert.ok(err.missingComponents.includes("planRef"),  "must list planRef");
      return true;
    },
  );
});

test("MissingProvenanceComponentError carries a descriptive message", () => {
  const chain = buildProvenanceChain({ goalRef: "", briefRef: "b", planRef: "p" });
  assert.throws(
    () => assertComplete(chain),
    (err) => {
      assert.ok(typeof err.message === "string" && err.message.length > 0);
      assert.ok(err.message.includes("goalRef"), "message should name the missing field");
      return true;
    },
  );
});

test("MissingProvenanceComponentError.name is 'MissingProvenanceComponentError'", () => {
  const err = new MissingProvenanceComponentError(["goalRef"]);
  assert.equal(err.name, "MissingProvenanceComponentError");
  assert.ok(err instanceof Error);
});

// ---------------------------------------------------------------------------
// 3. serialize → deserialize is field-for-field identical (R6.5)
// ---------------------------------------------------------------------------

test("serialize → deserialize round-trip is field-for-field identical (R6.5)", () => {
  const original = completeChainRef();
  const json = serializeProvenanceChain(original);
  const restored = deserializeProvenanceChain(json);
  assert.deepEqual(restored, original);
});

test("serialize produces a valid JSON string", () => {
  const chain = completeChainRef();
  const json = serializeProvenanceChain(chain);
  assert.equal(typeof json, "string");
  assert.doesNotThrow(() => JSON.parse(json));
});

test("deserialize round-trip preserves all scalar ref fields", () => {
  const chain = completeChainRef();
  const restored = deserializeProvenanceChain(serializeProvenanceChain(chain));
  assert.equal(restored.goalRef,  chain.goalRef);
  assert.equal(restored.briefRef, chain.briefRef);
  assert.equal(restored.planRef,  chain.planRef);
});

test("deserialize round-trip preserves toolCalls and verificationChecks", () => {
  const chain = completeChainRef();
  const restored = deserializeProvenanceChain(serializeProvenanceChain(chain));
  assert.deepEqual(restored.toolCalls,          chain.toolCalls);
  assert.deepEqual(restored.verificationChecks, chain.verificationChecks);
});

test("deserialize round-trip of a chain with empty lists is identical", () => {
  const chain = buildProvenanceChain({ goalRef: "g", briefRef: "b", planRef: "p" });
  const restored = deserializeProvenanceChain(serializeProvenanceChain(chain));
  assert.deepEqual(restored, chain);
});

test("serialize throws TypeError for non-object input", () => {
  for (const bad of [null, undefined, "string", 42, [], true]) {
    assert.throws(() => serializeProvenanceChain(bad), TypeError);
  }
});

test("deserialize throws TypeError for non-string input", () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.throws(() => deserializeProvenanceChain(bad), TypeError);
  }
});

test("deserialize throws SyntaxError for invalid JSON", () => {
  assert.throws(() => deserializeProvenanceChain("{not valid json}"), SyntaxError);
});

// ---------------------------------------------------------------------------
// 4. Both naming conventions produce equivalent chains
// ---------------------------------------------------------------------------

test("goal/brief/plan naming convention produces the same chain as goalRef/briefRef/planRef", () => {
  const refConvention = buildProvenanceChain({
    goalRef:  "goal:demo",
    briefRef: "brief:demo",
    planRef:  "plan:demo",
    toolCalls: [],
    verificationChecks: [],
  });

  const shortConvention = buildProvenanceChain({
    goal:  "goal:demo",
    brief: "brief:demo",
    plan:  "plan:demo",
    toolCalls: [],
    verificationChecks: [],
  });

  assert.deepEqual(shortConvention, refConvention);
});

test("both naming conventions pass assertComplete when refs are non-empty", () => {
  const refChain   = buildProvenanceChain({ goalRef: "g", briefRef: "b", planRef: "p" });
  const shortChain = buildProvenanceChain({ goal:    "g", brief:    "b", plan:   "p" });
  assert.doesNotThrow(() => assertComplete(refChain));
  assert.doesNotThrow(() => assertComplete(shortChain));
});

test("goal/brief/plan values are stored as goalRef/briefRef/planRef in the chain output", () => {
  const chain = buildProvenanceChain({ goal: "my-goal", brief: "my-brief", plan: "my-plan" });
  assert.equal(chain.goalRef,  "my-goal");
  assert.equal(chain.briefRef, "my-brief");
  assert.equal(chain.planRef,  "my-plan");
  assert.equal("goal"  in chain, false, "alias key 'goal' must not appear on output");
  assert.equal("brief" in chain, false, "alias key 'brief' must not appear on output");
  assert.equal("plan"  in chain, false, "alias key 'plan' must not appear on output");
});

test("when both conventions are supplied, goal/brief/plan values take precedence", () => {
  const chain = buildProvenanceChain({
    goal:    "short-goal",
    goalRef: "ref-goal",
    brief:   "short-brief",
    briefRef: "ref-brief",
    plan:    "short-plan",
    planRef: "ref-plan",
  });
  assert.equal(chain.goalRef,  "short-goal",  "goal should take precedence over goalRef");
  assert.equal(chain.briefRef, "short-brief", "brief should take precedence over briefRef");
  assert.equal(chain.planRef,  "short-plan",  "plan should take precedence over planRef");
});
