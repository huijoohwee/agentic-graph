import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeRegistryStates } from "../../src/registry/registry-canvas.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";
import { validDefinition } from "../support/fixtures.mjs";

test(tag("agentic-graph-agentic-commerce-platform", 7, "CRDT Merge Confluence"), () => {
  fc.assert(
    fc.property(fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 10 }), fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 10 }), (leftIds, rightIds) => {
      const left = leftIds.map((agentId) => validDefinition({ agentId, contentHash: `hash-${agentId}` }));
      const right = rightIds.map((agentId) => validDefinition({ agentId, contentHash: `hash-${agentId}` }));
      assert.deepEqual(mergeRegistryStates(left, right), mergeRegistryStates(right, left));
    }),
    propertyConfig(300),
  );
});
