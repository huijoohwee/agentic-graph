import assert from "node:assert/strict";
import { test } from "node:test";

import { boundaryReport, evaluateDeployOperation } from "../../src/runtime/deploy-boundary.mjs";

test("deploy boundary register stays closed and rejects boundary crossing", () => {
  assert.deepEqual(boundaryReport().boundaryRegister.map((row) => row.state), ["closed", "closed", "closed"]);
  assert.equal(evaluateDeployOperation({ capability: "local execute", targetBoundary: "Prod_Mirror" }).ok, false);
});
