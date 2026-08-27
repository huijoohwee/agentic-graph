import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  createLocalSkillEvolutionRuntime,
  resolveSkillEvolutionStateDirectory,
} from "../skill-evolution-local-runtime.js";

test("default durable state is repository and operator namespaced outside the repository", () => {
  const left = resolveSkillEvolutionStateDirectory({}, "/workspace/agenticgraph-a");
  const right = resolveSkillEvolutionStateDirectory({}, "/workspace/agenticgraph-b");
  const otherOperator = resolveSkillEvolutionStateDirectory(
    { AGENTICGRAPH_SKILL_EVOLUTION_NAMESPACE: "operator-b" },
    "/workspace/agenticgraph-a",
  );
  assert.notEqual(left, right);
  assert.notEqual(left, otherOperator);
  assert.equal(path.isAbsolute(left), true);
});

test("canonical runtime rejects a state directory inside its repository", () => {
  const rootDir = path.resolve("/workspace/agenticgraph");
  assert.throws(
    () => createLocalSkillEvolutionRuntime({
      rootDir,
      env: { AGENTICGRAPH_SKILL_EVOLUTION_STATE_DIR: path.join(rootDir, ".state") },
    }),
    /outside the AgenticGraph repository/,
  );
});
