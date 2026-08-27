import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHostedSubmissionFlowSteps,
  resolveHostedSubmissionFlowConfig,
} from "../lib/hosted-submission-flow.js";

test("resolveHostedSubmissionFlowConfig derives deterministic output paths", () => {
  const config = resolveHostedSubmissionFlowConfig({
    FRONTEND_URL: "https://airvio.co/agenticgraph",
    MCP_ENDPOINT: "https://airvio.co/agenticgraph/control-plane/mcp",
    ARTIFACTS_DIR: "./tmp-artifacts",
  });

  assert.equal(config.frontendUrl, "https://airvio.co/agenticgraph");
  assert.equal(config.mcpEndpoint, "https://airvio.co/agenticgraph/control-plane/mcp");
  assert.match(config.proofOutputPath, /tmp-artifacts\/runtime-proof\.json$/);
  assert.match(config.demoPackOutputPath, /tmp-artifacts\/runtime-demo-pack\.json$/);
  assert.match(config.submissionBriefOutputPath, /tmp-artifacts\/runtime-submission-brief\.md$/);
  assert.match(config.submissionBundleDir, /tmp-artifacts\/submission-bundle$/);
});

test("buildHostedSubmissionFlowSteps returns the full ordered deployed flow", () => {
  const config = resolveHostedSubmissionFlowConfig({
    FRONTEND_URL: "https://airvio.co/agenticgraph",
  });
  const steps = buildHostedSubmissionFlowSteps(config);

  assert.deepEqual(
    steps.map((step) => step.id),
    ["verify", "proof", "demo-pack", "submission-brief", "bundle"],
  );
  assert.equal(steps[0].script, "./scripts/verify-deployed-runtime.mjs");
  assert.equal(steps[1].env.PROOF_OUTPUT_PATH, config.proofOutputPath);
  assert.deepEqual(steps[4].args, [
    config.proofOutputPath,
    config.demoPackOutputPath,
    config.submissionBriefOutputPath,
  ]);
});

test("resolveHostedSubmissionFlowConfig requires FRONTEND_URL", () => {
  assert.throws(
    () => resolveHostedSubmissionFlowConfig({}),
    /FRONTEND_URL/,
  );
});
