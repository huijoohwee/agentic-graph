import assert from "node:assert/strict";
import { test } from "node:test";

import { allocateMinorUnits } from "../../src/commission/minor-unit-allocation.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

const weightsArbitrary = fc.uniqueArray(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 12 }),
    weight: fc.integer({ min: 1, max: 10_000 }),
  }),
  { minLength: 1, maxLength: 12, selector: value => value.id },
);

test(tag("agenticgraph-native-marketplace-layer", 20, "Allocation Order Metamorphic"), () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 1_000_000 }),
    weightsArbitrary,
    fc.integer(),
    (totalMinor, weights, seed) => {
      const shuffled = fc.sample(fc.shuffledSubarray(weights, { minLength: weights.length, maxLength: weights.length }), {
        seed,
        numRuns: 1,
      })[0];
      assert.deepEqual(
        allocateMinorUnits({ totalMinor, weights }).shares,
        allocateMinorUnits({ totalMinor, weights: shuffled }).shares,
      );
    },
  ), propertyConfig(300));
});
