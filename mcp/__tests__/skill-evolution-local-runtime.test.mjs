import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  createLocalSkillEvolutionRuntime,
  resolveSkillEvolutionStateDirectory,
} from "../skill-evolution-local-runtime.js";

test("default durable state is repository and operator namespaced outside the repository", () => {
  const left = resolveSkillEvolutionStateDirectory({}, "/workspace/agentic-graph-a");
  const right = resolveSkillEvolutionStateDirectory({}, "/workspace/agentic-graph-b");
  const otherOperator = resolveSkillEvolutionStateDirectory(
    { AGENTIC_OS_SKILL_EVOLUTION_NAMESPACE: "operator-b" },
    "/workspace/agentic-graph-a",
  );
  assert.notEqual(left, right);
  assert.notEqual(left, otherOperator);
  assert.equal(path.isAbsolute(left), true);
});

test("canonical runtime rejects a state directory inside its repository", () => {
  const rootDir = path.resolve("/workspace/agentic-graph");
  assert.throws(
    () => createLocalSkillEvolutionRuntime({
      rootDir,
      env: { AGENTIC_OS_SKILL_EVOLUTION_STATE_DIR: path.join(rootDir, ".state") },
    }),
    /outside the agentic-graph repository/,
  );
});
