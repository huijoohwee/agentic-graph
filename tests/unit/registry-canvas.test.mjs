import assert from "node:assert/strict";
import { test } from "node:test";

import { OPERATOR_SCOPE } from "../../src/registry/scope-keys.mjs";
import { projectRegistryCanvas, renderRegistryCanvas } from "../../src/registry/registry-canvas.mjs";
import { validDefinition } from "../support/fixtures.mjs";

test("registry canvas projects operator-visible registered rows", () => {
  const projection = projectRegistryCanvas([validDefinition()], { subscriptionScope: OPERATOR_SCOPE });
  assert.equal(projection.ok, true);
  assert.deepEqual(projection.rows.map((row) => row.trustStatus), ["declared-and-present"]);
});

test("registry canvas refuses non-operator scopes and renders mobile without overflow", () => {
  assert.equal(projectRegistryCanvas([], { subscriptionScope: "Shopper_Scope" }).ok, false);
  const rendered = renderRegistryCanvas(projectRegistryCanvas([validDefinition()]), { widthCssPx: 360, offline: true });
  assert.equal(rendered.hasHorizontalOverflow, false);
  assert.equal(rendered.staleIndicator, true);
});
