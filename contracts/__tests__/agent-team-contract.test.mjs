import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_TEAM_HARD_BOUNDS,
  AGENT_TEAM_INVOCATION,
  AGENT_TEAM_SOURCE_SCHEMA,
  effectiveAgentTeamBounds,
  validateAgentTeamPlanRequest,
  validateAgentTeamSourceDocument,
} from "../agent-team.schema.js";

const sourceDocument = () => ({
  schema: AGENT_TEAM_SOURCE_SCHEMA,
  teamId: "team.analysis",
  teamRevision: "team-revision-1",
  source: { uri: "teams/analysis.json", digest: "a".repeat(64) },
  manager: {
    participantId: "lead",
    agentId: "agent.lead",
    agentRevision: "agent-revision-1",
    role: "Coordinator",
    goal: "Own the exact workflow result.",
    persona: "Concise and methodical.",
  },
  specialists: [{
    participantId: "research",
    agentId: "agent.research",
    agentRevision: "agent-revision-3",
    role: "Research specialist",
    goal: "Return source-grounded evidence.",
    persona: "Skeptical and precise.",
  }],
  workflow: {
    workflowId: "workflow.analysis",
    workflowRevision: "workflow-revision-2",
    allowedBranchIds: ["delegate-research"],
  },
  reviewPolicy: {
    policyId: "review.standard",
    policyRevision: "review-revision-1",
  },
  bounds: { ...AGENT_TEAM_HARD_BOUNDS },
});

test("agent-team source preserves exact owner revisions while persona grants no authority fields", () => {
  const document = sourceDocument();
  const result = validateAgentTeamSourceDocument(document);
  assert.deepEqual(result, { ok: true, issues: [] });
  assert.deepEqual(Object.keys(document.manager).sort(), [
    "agentId", "agentRevision", "goal", "participantId", "persona", "role",
  ]);
  assert.equal("tools" in document.manager, false);
  assert.equal("authority" in document.manager, false);
});

test("agent-team source rejects additional properties at every closed object boundary", () => {
  const cases = [
    ["rootOverride", (document) => { document.rootOverride = true; }],
    ["source.fetch", (document) => { document.source.fetch = "https://example.invalid"; }],
    ["manager.tools", (document) => { document.manager.tools = ["unowned-tool"]; }],
    ["specialists[0].authority", (document) => { document.specialists[0].authority = "admin"; }],
    ["workflow.model", (document) => { document.workflow.model = "caller-selected"; }],
    ["reviewPolicy.bypass", (document) => { document.reviewPolicy.bypass = true; }],
    ["bounds.unbounded", (document) => { document.bounds.unbounded = true; }],
  ];

  for (const [expectedPath, mutate] of cases) {
    const document = sourceDocument();
    mutate(document);
    const result = validateAgentTeamSourceDocument(document);
    assert.equal(result.ok, false, expectedPath);
    assert.ok(
      result.issues.some(({ path, reason }) => (
        path === expectedPath && reason === "additional property is not allowed"
      )),
      expectedPath,
    );
  }
});

test("agent-team hard maxima fail closed with the canonical field names", () => {
  const document = sourceDocument();
  document.bounds.maxTurns = 25;
  document.bounds.maxDelegationDepth = 5;
  document.bounds.maxFanout = 9;
  document.bounds.maxRetriesPerTurn = 3;
  document.bounds.maxStageTimeMs = 60_001;
  document.bounds.maxRunTimeMs = 900_001;
  document.bounds.maxTokens = 120_001;
  document.bounds.maxCostUsd = 5.01;
  const result = validateAgentTeamSourceDocument(document);
  assert.equal(result.ok, false);
  assert.deepEqual(
    new Set(result.issues.map((entry) => entry.path)),
    new Set(Object.keys(AGENT_TEAM_HARD_BOUNDS).map((field) => `bounds.${field}`)),
  );
});

test("plan input requires the exact source-revision-fenced tuple", () => {
  const valid = {
    invocation: {
      command: AGENT_TEAM_INVOCATION.command,
      semantic: AGENT_TEAM_INVOCATION.semantic,
      binding: AGENT_TEAM_INVOCATION.binding,
      sourceRevision: "b".repeat(40),
    },
    teamSource: { uri: "teams/analysis.json", digest: "a".repeat(64) },
    requestedTask: "Compare the bounded evidence.",
    bounds: { ...AGENT_TEAM_HARD_BOUNDS },
    idempotencyKey: "plan-key-0001",
  };
  assert.deepEqual(validateAgentTeamPlanRequest(valid), { ok: true, issues: [] });
  assert.equal(validateAgentTeamPlanRequest({
    ...valid,
    invocation: { ...valid.invocation, binding: "@invented-team" },
  }).ok, false);
  assert.equal(validateAgentTeamPlanRequest({
    ...valid,
    invocation: { ...valid.invocation, sourceRevision: "main" },
  }).ok, false);
});

test("effective bounds take the lowest exact source and caller value", () => {
  const source = { ...AGENT_TEAM_HARD_BOUNDS, maxTurns: 20, maxCostUsd: 4 };
  const caller = { ...AGENT_TEAM_HARD_BOUNDS, maxTurns: 10, maxCostUsd: 2 };
  const effective = effectiveAgentTeamBounds(source, caller);
  assert.equal(effective.maxTurns, 10);
  assert.equal(effective.maxCostUsd, 2);
  assert.equal(effective.maxFanout, 8);
});

test("semantic and JSON bounds share the 100ms time minima", () => {
  const document = sourceDocument();
  document.bounds.maxStageTimeMs = 99;
  document.bounds.maxRunTimeMs = 99;
  const result = validateAgentTeamSourceDocument(document);
  assert.equal(result.ok, false);
  assert.deepEqual(
    new Set(result.issues.map((entry) => entry.path)),
    new Set(["bounds.maxStageTimeMs", "bounds.maxRunTimeMs"]),
  );
});
