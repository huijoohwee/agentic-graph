import test from "node:test";
import assert from "node:assert/strict";

import { buildBundleIndexMarkdown, buildBundleSummaryHtml } from "../lib/submission-bundle.js";

function sampleBundle() {
  return {
    proofFileName: "runtime-proof.json",
    demoPackFileName: "runtime-demo-pack.json",
    briefFileName: "runtime-submission-brief.md",
    demoPackArtifact: {
      runId: "run-proof-1",
      manifestState: "blocked",
      manifestMode: "live",
      proofSummary: {
        authSessionStatus: 201,
        runSubmissionStatus: 202,
        readbackStatus: 200,
      },
      demoPack: {
        urls: [
          { kind: "frontend", url: "https://app.example.vercel.app", reachable: true },
          { kind: "agent-api", url: "https://api.example.aws", reachable: true },
        ],
        sections: [
          { dimension: "Agent Overview", evidence: "Autonomous remix agent.", verified: true },
          { dimension: "Failure Handling", evidence: "Persisted read-back works.", verified: true },
        ],
      },
    },
  };
}

test("buildBundleIndexMarkdown includes bundle files and judge sections", () => {
  const markdown = buildBundleIndexMarkdown(sampleBundle());
  assert.match(markdown, /^# AgenticGraph Submission Bundle — run-proof-1/m);
  assert.match(markdown, /\[runtime-proof\.json\]\(\.\/runtime-proof\.json\)/);
  assert.match(markdown, /## Reachable URLs/);
  assert.match(markdown, /### Agent Overview/);
});

test("buildBundleSummaryHtml renders a review page with links and section cards", () => {
  const html = buildBundleSummaryHtml(sampleBundle());
  assert.match(html, /<title>AgenticGraph Submission Bundle<\/title>/);
  assert.match(html, /index\.md/);
  assert.match(html, /runtime-submission-brief\.md/);
  assert.match(html, /Autonomous remix agent\./);
  assert.match(html, /https:\/\/api\.example\.aws/);
});
