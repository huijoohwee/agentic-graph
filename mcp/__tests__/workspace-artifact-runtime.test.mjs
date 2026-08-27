import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createWorkspaceArtifactRuntime } from "../workspace-artifact-runtime.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const fixture = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-artifact-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "workspace")); await fs.mkdir(path.join(root, "external"));
  const workspace = await fs.realpath(path.join(root, "workspace"));
  const external = await fs.realpath(path.join(root, "external"));
  return {
    workspace, external,
    runtime: createWorkspaceArtifactRuntime({
      rootDir: workspace,
      env: {
        AGENTICGRAPH_WORKSPACE_ARTIFACT_ROOTS: JSON.stringify([workspace]),
        AGENTICGRAPH_WORKSPACE_ARTIFACT_EXTERNAL_ROOTS: JSON.stringify([external]),
      },
    }),
  };
};

test("import is digest-fenced, byte-identical, and idempotently reusable", async (t) => {
  const { workspace, external, runtime } = await fixture(t);
  const bytes = Buffer.from("# Imported\nexact bytes\n");
  const sourcePath = path.join(external, "source.md");
  await fs.writeFile(sourcePath, bytes);
  const request = { operation: "import-file", workspaceRoot: workspace, path: "guidelines/imported.md", sourcePath };
  await fs.mkdir(path.join(workspace, "guidelines"));
  const plan = await runtime.plan(request);
  assert.equal(plan.effect, "write");
  assert.equal(plan.contentDigest, sha(bytes));
  const applied = await runtime.apply({ ...request, planDigest: plan.planDigest, operatorAuthorized: true });
  assert.equal(applied.effect, "write");
  assert.deepEqual(await fs.readFile(path.join(workspace, "guidelines/imported.md")), bytes);
  const replayRequest = { ...request, collisionPolicy: "verify-identical" };
  const replayPlan = await runtime.plan(replayRequest);
  assert.equal(replayPlan.effect, "reuse");
  const replay = await runtime.apply({ ...replayRequest, planDigest: replayPlan.planDigest, operatorAuthorized: true });
  assert.equal(replay.effect, "reuse");
  assert.equal(replay.readBack.target.digest, sha(bytes));
  assert.deepEqual(applied.economics, { networkCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
});

test("create, update, export, folder creation, inspect, and trash preserve exact evidence", async (t) => {
  const { workspace, external, runtime } = await fixture(t);
  const apply = async (request) => {
    const plan = await runtime.plan(request);
    return runtime.apply({ ...request, planDigest: plan.planDigest, operatorAuthorized: true });
  };
  await apply({ operation: "create-folder", workspaceRoot: workspace, path: "docs" });
  await apply({ operation: "create-folder", workspaceRoot: workspace, path: ".workspace-trash" });
  await apply({ operation: "create-file", workspaceRoot: workspace, path: "docs/demo.md", content: "one\n" });
  const firstDigest = sha("one\n");
  const updated = await apply({ operation: "update-file", workspaceRoot: workspace, path: "docs/demo.md", content: "two\n", expectedDigest: firstDigest });
  assert.equal(updated.readBack.digest, sha("two\n"));
  const destinationPath = path.join(external, "exported.md");
  await apply({ operation: "export-file", workspaceRoot: workspace, path: "docs/demo.md", destinationPath });
  assert.equal(await fs.readFile(destinationPath, "utf8"), "two\n");
  const inspected = await runtime.plan({ operation: "inspect", workspaceRoot: workspace, path: "docs" });
  assert.deepEqual(inspected.observed.entries, ["demo.md"]);
  const trashed = await apply({ operation: "trash-file", workspaceRoot: workspace, path: "docs/demo.md", trashPath: ".workspace-trash/demo.md", expectedDigest: sha("two\n") });
  assert.equal(trashed.readBack.digest, sha("two\n"));
  await assert.rejects(fs.stat(path.join(workspace, "docs/demo.md")), { code: "ENOENT" });
});

test("stale plans, traversal, undeclared roots, symlinks, and collisions fail closed", async (t) => {
  const { workspace, external, runtime } = await fixture(t);
  await fs.mkdir(path.join(workspace, "docs"));
  const sourcePath = path.join(external, "source.md");
  await fs.writeFile(sourcePath, "before\n");
  const request = { operation: "import-file", workspaceRoot: workspace, path: "docs/import.md", sourcePath };
  const plan = await runtime.plan(request);
  await fs.writeFile(sourcePath, "after\n");
  await assert.rejects(runtime.apply({ ...request, planDigest: plan.planDigest, operatorAuthorized: true }), /Plan digest is stale/u);
  await assert.rejects(runtime.plan({ operation: "inspect", workspaceRoot: workspace, path: "../escape" }), /portable|traversal/u);
  await assert.rejects(runtime.plan({ operation: "inspect", workspaceRoot: external, path: "source.md" }), /configured root/u);
  await fs.symlink(sourcePath, path.join(workspace, "docs", "link.md"));
  await assert.rejects(runtime.plan({ operation: "inspect", workspaceRoot: workspace, path: "docs/link.md" }), /Symbolic-link/u);
  await fs.writeFile(path.join(workspace, "docs", "collision.md"), "occupied\n");
  await assert.rejects(runtime.plan({ operation: "create-file", workspaceRoot: workspace, path: "docs/collision.md", content: "different\n" }), /collision/u);
});
