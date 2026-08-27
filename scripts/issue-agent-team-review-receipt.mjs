#!/usr/bin/env node
import path from "node:path";

import { AgentTeamStore } from "../mcp/agent-team-store.js";
import { LocalAgentTeamReviewStore } from "../mcp/agent-team-local-review-store.js";

const parseArgs = (argv) => Object.fromEntries(argv.map((entry) => {
  const match = entry.match(/^--([a-z-]+)=(.*)$/);
  if (!match) throw new Error(`Invalid argument: ${entry}`);
  return [match[1], match[2]];
}));

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(args.repository || process.cwd());
  const runId = String(args["run-id"] || "").trim();
  const decision = String(args.decision || "").trim();
  if (!/^atr_[0-9a-f]{24}$/.test(runId)) throw new Error("--run-id must be an exact Agent Team run id.");
  if (!["approve", "revise", "reject"].includes(decision)) {
    throw new Error("--decision must be approve, revise, or reject.");
  }
  const state = await new AgentTeamStore({ rootDir }).read(runId);
  if (state.state !== "review_pending" || state.review?.status !== "pending") {
    throw new Error(`Agent Team run ${runId} is not review_pending.`);
  }
  const issued = await new LocalAgentTeamReviewStore({ rootDir }).issue({
    runId: state.runId,
    planDigest: state.planDigest,
    checkpointId: state.checkpointId,
    stateVersion: state.stateVersion,
    policyId: state.plan.reviewPolicy.policyId,
    policyRevision: state.plan.reviewPolicy.policyRevision,
    decision,
  });
  process.stdout.write(`${JSON.stringify({
    schema: "agenticgraph.agent-team-local-review-issue/v1",
    runId,
    ...issued,
  }, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
