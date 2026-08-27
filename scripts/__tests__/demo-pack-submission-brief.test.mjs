import test from "node:test";
import assert from "node:assert/strict";

import { buildSubmissionBriefMarkdown } from "../lib/demo-pack-submission-brief.js";

function sampleArtifact() {
  return {
    artifactVersion: "1",
    generatedAt: "2026-06-10T00:00:00.000Z",
    runId: "run-proof-1",
    manifestState: "blocked",
    manifestMode: "live",
    proofSummary: {
      authSessionStatus: 201,
      runSubmissionStatus: 202,
      readbackStatus: 200,
      persistedAt: "2026-06-10T00:00:10.000Z",
      sameRunId: true,
      sameState: true,
      sameMode: true,
    },
    demoPackValidation: { valid: true, errors: [] },
    supplementalUrls: [
      { kind: "control_plane", url: "https://airvio.co/agenticgraph/control-plane/mcp/health" },
    ],
    demoPack: {
      urls: [
        { kind: "frontend", url: "https://app.example.vercel.app", reachable: true },
        { kind: "worker", url: "https://api.example.aws", reachable: true },
        { kind: "worker-health", url: "https://api.example.aws/health", reachable: true },
      ],
      sections: [
        { dimension: "Agent Overview", evidence: "Autonomous remix agent.", verified: true },
        { dimension: "Autonomy & Decision-Making", evidence: "Director chooses next stage.", verified: true },
        { dimension: "Actions & Tool Use", evidence: "Calls research, storyboard, render, publish.", verified: true },
        { dimension: "Orchestration", evidence: "Thin AWS REST to Cloudflare MCP flow.", verified: true },
        { dimension: "Human-in-the-Loop", evidence: "Approval gates halt spend-bearing steps.", verified: true },
        { dimension: "Failure Handling", evidence: "Fail-closed responses and persisted read-back.", verified: true },
        { dimension: "Demo & Presentation", evidence: "Hosted proof and Demo_Pack exported.", verified: true },
      ],
    },
  };
}

test("buildSubmissionBriefMarkdown renders a structured markdown brief", () => {
  const markdown = buildSubmissionBriefMarkdown(sampleArtifact());
  assert.match(markdown, /^# AgenticGraph Submission Brief — run-proof-1/m);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Reachable URLs/);
  assert.match(markdown, /## Judge Dimensions/);
  assert.match(markdown, /## Validation/);
  assert.match(markdown, /Autonomous remix agent\./);
});

test("buildSubmissionBriefMarkdown accepts a title override", () => {
  const markdown = buildSubmissionBriefMarkdown(sampleArtifact(), {
    title: "Custom Judge Brief",
  });
  assert.match(markdown, /^# Custom Judge Brief/m);
});
