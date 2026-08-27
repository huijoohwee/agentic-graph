import assert from "node:assert/strict";
import { test } from "node:test";

import { createPendingQueue } from "../../src/registry/pending-queue.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agenticgraph-agentic-commerce-platform", 13, "Offline Change Order Preservation"), () => {
  fc.assert(
    fc.property(fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 100 }), (changes) => {
      const queue = createPendingQueue("client-property");
      for (const change of changes) {
        queue.append({ change });
      }
      const submitted = [];
      while (submitted.length < changes.length) {
        const result = queue.submitHead((entry) => {
          submitted.push(entry.change.change);
          return { acknowledged: true };
        });
        assert.equal(result.status, "acknowledged");
      }
      assert.deepEqual(submitted, changes);
      assert.deepEqual(queue.pendingEntries(), []);
    }),
    propertyConfig(200),
  );
});
