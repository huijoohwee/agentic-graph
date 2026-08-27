import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkersAiModelResolver,
  hasWorkersAiModelRuntimeConfiguration,
  WORKERS_AI_AGENT_ADAPTER_ID,
} from "../agent-runtime-model-resolver.mjs";

const requirements = {
  providerId: WORKERS_AI_AGENT_ADAPTER_ID,
  features: ["text"],
  transport: { delivery: "complete", connection: "per-run" },
};

test("Workers AI model resolution stays blocked until binding and operator model selection are present", async () => {
  assert.equal(hasWorkersAiModelRuntimeConfiguration({}), false);
  assert.equal(hasWorkersAiModelRuntimeConfiguration({ AI: {} }), false);
  assert.equal(
    (await createWorkersAiModelResolver({})({ requirements })).reason,
    "workers_ai_binding_unavailable",
  );
  assert.equal(
    (await createWorkersAiModelResolver({ AI: {} })({ requirements })).reason,
    "workers_ai_model_id_unconfigured",
  );
});

test("Workers AI resolver returns the registered adapter packet without invoking the binding", async () => {
  let providerCalls = 0;
  const env = {
    AI: { run: async () => { providerCalls += 1; } },
    KNOWGRPH_AGENT_MODEL_ID: "operator-selected-model",
  };
  const result = await createWorkersAiModelResolver(env)({ requirements });
  assert.equal(result.status, "ready");
  assert.equal(result.packet.provider.adapterId, WORKERS_AI_AGENT_ADAPTER_ID);
  assert.equal(result.packet.model.id, "operator-selected-model");
  assert.deepEqual(result.packet.transport, {
    id: "workers-ai-binding",
    delivery: "complete",
    connection: "per-run",
    source: "registered-adapter-capability",
  });
  assert.equal(providerCalls, 0);
});
