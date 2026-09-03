import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_DEFINITION_REGISTRY,
  compileAgentRun,
  executeAgentRun,
  listAgentDefinitions,
  resolveAgentDefinition,
  validateAgentDefinitionRegistry,
} from "../agent-runtime.schema.js";
import {
  AGENT_MODEL_RUNTIME_SCHEMA,
  createRunningAgentAdapterRegistry,
} from "../agent-model-runtime.js";

test("registry exposes the six exact agent invocations without broad aliases", () => {
  assert.deepEqual(
    listAgentDefinitions().map((definition) => definition.invocation),
    [
      "/collaboration-manager-agent",
      "/evidence-scout-agent",
      "/risk-reviewer-agent",
      "/investment-research-agent",
      "/sme-care-agent",
      "/video-agent",
    ],
  );
  assert.equal(resolveAgentDefinition("/research-agent"), null);
  assert.equal(resolveAgentDefinition("/care-agent"), null);
  assert.equal(resolveAgentDefinition("/sme-agent"), null);
});

test("SME Care compiles the internal SME risk skill through the shared public invocation", () => {
  const result = compileAgentRun({ invocation: "/sme-care-agent", brief: "Assess a typed SME profile.", mode: "dry-run", runId: "sme-contract" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload.plan.skill, {
    variant: "agent.sme",
    id: "sme.risk.profile",
    inputSchemaRef: "agentic-graph-sme-profile/v1",
    outputSchemaRef: "agentic-graph-sme-risk-run/v1",
    runtimeKernel: "sme.risk.profile",
  });
  assert.equal(result.payload.plan.topology.pattern, "fan-out/fan-in");
  assert.equal(result.payload.plan.topology.maxIterations, 1);
  assert.equal(result.payload.plan.bounds.maxWallSeconds, 300);
  assert.equal(result.payload.plan.bounds.tokenBudget, 100000);
});

test("every registered agent compiles through the same deterministic zero-spend kernel", () => {
  for (const definition of listAgentDefinitions()) {
    const result = compileAgentRun({
      agentDefinitionId: definition.id,
      brief: `Exercise ${definition.id}`,
      mode: "dry-run",
      runId: `proof-${definition.id}`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.payload.status, "planned");
    assert.equal(result.payload.plan.profileId, definition.planProfile);
    assert.equal(result.payload.budgetMeters.paidProviderCalls, 0);
    assert.ok(result.payload.plan.tasks.length > 0);
  }
});

test("a future agent is added by one definition that reuses an existing profile", () => {
  const fixture = structuredClone(AGENT_DEFINITION_REGISTRY);
  fixture.agents.push({
    ...structuredClone(fixture.agents[0]),
    id: "agent.future-domain",
    title: "Future Domain Agent",
  });
  assert.deepEqual(validateAgentDefinitionRegistry(fixture), { valid: true, errors: [] });
});

test("unknown agents fail with a typed validation error", () => {
  const result = compileAgentRun({ agentDefinitionId: "agent.unknown", brief: "test" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalid_agent_run_input");
});

test("live prepared-agent execution rejects conflicting legacy provider routing", () => {
  const result = compileAgentRun({
    invocation: "/sme-care-agent",
    brief: "Assess the protection gap.",
    mode: "live",
    providerMode: "mock",
    approvals: ["paid-model-call"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalid_agent_run_input");
  assert.equal(result.error.details[0].path, "providerMode");
});

test("live execution requires approval, model resolution, and an exact registered adapter", async () => {
  const input = {
    invocation: "/sme-care-agent",
    brief: "Assess the protection gap.",
    mode: "live",
    runId: "live-proof",
  };
  const withheld = await executeAgentRun(input);
  assert.equal(withheld.payload.status, "approval_required");
  assert.equal(withheld.payload.budgetMeters.paidProviderCalls, 0);

  const blocked = await executeAgentRun({ ...input, approvals: ["paid-model-call"] });
  assert.equal(blocked.payload.status, "blocked");
  assert.equal(blocked.payload.error.code, "model_resolver_unavailable");

  const modelResolver = async () => ({
    status: "ready",
    packet: {
      schemaVersion: AGENT_MODEL_RUNTIME_SCHEMA,
      provider: { id: "cloudflare-workers-ai", revision: "test/v1", adapterId: "cloudflare-workers-ai" },
      model: { id: "operator-selected-model", features: ["text"] },
      transport: { id: "test-binding", delivery: "complete", connection: "per-run" },
    },
  });
  const adapterBlocked = await executeAgentRun(
    { ...input, approvals: ["paid-model-call"] },
    { modelResolver, runningAgentAdapters: createRunningAgentAdapterRegistry() },
  );
  assert.equal(adapterBlocked.payload.error.code, "running_agent_adapter_unavailable");
  assert.equal(adapterBlocked.payload.error.adapterId, "cloudflare-workers-ai");

  const completed = await executeAgentRun(
    { ...input, approvals: ["paid-model-call"] },
    {
      modelResolver,
      runningAgentAdapters: createRunningAgentAdapterRegistry([
        { id: "cloudflare-workers-ai", execute: async () => ({ text: "review-ready result" }) },
      ]),
    },
  );
  assert.equal(completed.ok, true);
  assert.equal(completed.payload.status, "completed");
  assert.equal(completed.payload.result.text, "review-ready result");
  assert.equal(completed.payload.modelRuntime.model.id, "operator-selected-model");
});
