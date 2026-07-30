import assert from "node:assert/strict";
import test from "node:test";
import Ajv from "ajv";

import {
  AGENT_TEAM_TOOL_NAMES,
  AGENT_TEAM_TOOL_OUTPUT_SCHEMA,
} from "../../contracts/agent-team.schema.js";
import { validateAgentTeamBudgetEnvelope } from "../agent-team-adapter.js";
import { agentTeamError } from "../agent-team-result.js";
import { buildAgentTeamToolDefinitions } from "../agent-team-tool-contract.js";
import {
  adapterRecord,
  createFixture,
  delegateResponse,
  planAndStart,
  runtimeFor,
} from "./agent-team-test-kit.mjs";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateOutput = ajv.compile(AGENT_TEAM_TOOL_OUTPUT_SCHEMA);
const wireValue = (value) => JSON.parse(JSON.stringify(value));

test("closed output schema accepts every operation's success and error projections", async (t) => {
  const fixture = await createFixture(t);
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: adapterRecord({ execute: async () => delegateResponse }),
  });
  const planSuccess = await runtime.plan(fixture.planInput);
  const planError = await runtime.plan({ unexpected: true });
  const startSuccess = await runtime.start({
    planId: planSuccess.result.planId,
    planDigest: planSuccess.planDigest,
    teamRevision: planSuccess.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "output-contract-start",
  });
  const startError = await runtime.start({ unexpected: true });
  const listSuccess = await runtime.list({ runId: startSuccess.runId });
  const broadListSuccess = await runtime.list({});
  const listError = await runtime.list({ runId: `atr_${"0".repeat(24)}` });
  const controlError = await runtime.control({ unexpected: true });

  const blockedFixture = await createFixture(t);
  const blockedRuntime = runtimeFor({
    rootDir: blockedFixture.rootDir,
    docsResolver: blockedFixture.docs.resolver,
    adapter: adapterRecord({
      estimate: async () => ({ inputTokens: 120_001, outputTokens: 0, costUsd: 0, timeMs: 1 }),
      execute: async () => { throw new Error("must not execute"); },
    }),
  });
  const { started: blockedStart } = await planAndStart(
    blockedRuntime,
    blockedFixture.planInput,
    "output-contract-blocked",
  );
  const blockedListSuccess = await blockedRuntime.list({ runId: blockedStart.runId });
  const controlSuccess = await blockedRuntime.control({
    runId: blockedStart.runId,
    expectedStateVersion: blockedStart.stateVersion,
    action: "cancel",
    idempotencyKey: "output-contract-cancel",
    reason: "Validate the exact successful control projection.",
  });

  for (const output of [
    planSuccess,
    planError,
    startSuccess,
    startError,
    blockedStart,
    listSuccess,
    broadListSuccess,
    blockedListSuccess,
    listError,
    controlSuccess,
    controlError,
  ]) {
    assert.equal(validateOutput(wireValue(output)), true, JSON.stringify(validateOutput.errors));
  }
});

test("closed output schema rejects extra properties at every public boundary", async (t) => {
  const fixture = await createFixture(t);
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: adapterRecord({ execute: async () => delegateResponse }),
  });
  const { planned, started } = await planAndStart(runtime, fixture.planInput, "output-negative-start");
  const listed = await runtime.list({ runId: started.runId });
  const cases = [];

  const top = wireValue(planned);
  top.privateLeak = true;
  cases.push(top);
  const result = wireValue(planned);
  result.result.privateLeak = true;
  cases.push(result);
  const evidence = wireValue(planned);
  evidence.evidence[0].privateLeak = true;
  cases.push(evidence);
  const run = wireValue(listed);
  run.result.runs[0].privateLeak = true;
  cases.push(run);
  const noncompletedStart = wireValue(started);
  noncompletedStart.state = "running";
  cases.push(noncompletedStart);
  const controlWithAnswer = wireValue(started);
  controlWithAnswer.operation = "control";
  cases.push(controlWithAnswer);
  const pausedExactList = wireValue(listed);
  pausedExactList.state = "paused";
  pausedExactList.result.runs[0].state = "paused";
  cases.push(pausedExactList);
  const broadListWithAnswer = wireValue(await runtime.list({}));
  broadListWithAnswer.result.runs[0].finalAnswer = started.result.finalAnswer;
  cases.push(broadListWithAnswer);
  const error = wireValue(await runtime.control({ unexpected: true }));
  error.error.privateLeak = true;
  cases.push(error);

  cases.forEach((output, index) => {
    assert.equal(validateOutput(output), false, `negative output case ${index} unexpectedly validated`);
  });
});

test("public error normalization suppresses arbitrary messages and untrusted details", () => {
  const sentinel = "/secret/provider/private-sentinel";
  const output = agentTeamError("plan", {
    code: "c".repeat(500),
    message: sentinel,
    details: [{
      path: sentinel,
      reason: sentinel,
    }],
  });
  assert.equal(output.error.code, "agent_team_runtime_error");
  assert.equal(JSON.stringify(output).includes(sentinel), false);
  assert.equal(Object.hasOwn(output.error, "details"), false);
  assert.equal(validateOutput(wireValue(output)), true, JSON.stringify(validateOutput.errors));
});

test("each MCP descriptor rejects every other operation's output", () => {
  const toolNames = {
    agentTeamPlan: AGENT_TEAM_TOOL_NAMES.plan,
    agentTeamStart: AGENT_TEAM_TOOL_NAMES.start,
    agentTeamList: AGENT_TEAM_TOOL_NAMES.list,
    agentTeamControl: AGENT_TEAM_TOOL_NAMES.control,
  };
  const descriptors = buildAgentTeamToolDefinitions({
    toolNames,
    withDefaults: (definition) => definition,
  });
  const operations = ["plan", "start", "list", "control"];
  const outputs = operations.map((operation) => agentTeamError(operation, {
    code: "invalid_input",
    message: "suppressed",
  }));
  descriptors.forEach((descriptor, index) => {
    const validate = ajv.compile(descriptor.outputSchema);
    outputs.forEach((output, outputIndex) => {
      assert.equal(validate(wireValue(output)), outputIndex === index);
    });
  });
});

test("budget envelopes reject unsafe integers before bounded arithmetic", () => {
  assert.throws(
    () => validateAgentTeamBudgetEnvelope({
      inputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: 1,
      costUsd: 0,
      timeMs: 1,
    }),
    (error) => error?.code === "adapter_budget_envelope_unavailable",
  );
});

test("adapter estimate exceptions are reduced to a fixed public failure", async (t) => {
  const fixture = await createFixture(t);
  const sentinel = "ESTIMATE_PRIVATE_SENTINEL";
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: adapterRecord({
      estimate: async () => {
        throw Object.assign(new Error(sentinel), { code: sentinel });
      },
      execute: async () => {
        throw new Error("must not execute");
      },
    }),
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "estimate-error-sanitized");
  const persisted = await runtime.store.read(started.runId);

  assert.equal(started.state, "blocked");
  assert.equal(started.error.code, "adapter_budget_envelope_unavailable");
  assert.equal(JSON.stringify([started, persisted]).includes(sentinel), false);
  assert.equal(validateOutput(wireValue(started)), true, JSON.stringify(validateOutput.errors));
});
