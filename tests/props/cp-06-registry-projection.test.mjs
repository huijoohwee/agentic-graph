import assert from "node:assert/strict";
import { test } from "node:test";

import { projectRegistryCanvas } from "../../src/registry/registry-canvas.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";
import { validDefinition } from "../support/fixtures.mjs";

test(tag("knowgrph-agentic-commerce-platform", 6, "Registry Projection Consistency"), () => {
  fc.assert(
    fc.property(fc.array(fc.string({ minLength: 1, maxLength: 16 }), { minLength: 0, maxLength: 20 }), (agentIds) => {
      const uniqueIds = [...new Set(agentIds)];
      const definitions = uniqueIds.map((agentId) => validDefinition({ agentId, contentHash: `hash-${agentId}` }));
      const projection = projectRegistryCanvas(definitions);
      assert.deepEqual(projection.rows.map((row) => row.agentId).sort(), uniqueIds.sort());
    }),
    propertyConfig(200),
  );
});
