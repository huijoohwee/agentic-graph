import assert from "node:assert/strict";
import { test } from "node:test";

import { allocateMinorUnits } from "../../src/commission/minor-unit-allocation.mjs";

test("minor-unit allocation conserves exact and remainder totals", () => {
  assert.deepEqual(allocateMinorUnits({
    totalMinor: 12,
    weights: [{ id: "a", weight: 1 }, { id: "b", weight: 1 }],
  }).shares, [{ id: "a", amountMinor: 6 }, { id: "b", amountMinor: 6 }]);
  assert.deepEqual(allocateMinorUnits({
    totalMinor: 10,
    weights: [{ id: "b", weight: 1 }, { id: "a", weight: 1 }, { id: "c", weight: 1 }],
  }).shares, [
    { id: "a", amountMinor: 4 },
    { id: "b", amountMinor: 3 },
    { id: "c", amountMinor: 3 },
  ]);
});

test("minor-unit allocation rejects invalid totals, weights, and duplicate identifiers", () => {
  for (const totalMinor of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(allocateMinorUnits({ totalMinor, weights: [{ id: "a", weight: 1 }] }).ok, false);
  }
  assert.deepEqual(allocateMinorUnits({ totalMinor: 1, weights: [] }), {
    ok: false,
    reason: "invalid-allocation-weights",
  });
  assert.deepEqual(allocateMinorUnits({
    totalMinor: 1,
    weights: [{ id: "a", weight: 1 }, { id: "a", weight: 2 }],
  }), { ok: false, reason: "duplicate-allocation-identifier" });
});
