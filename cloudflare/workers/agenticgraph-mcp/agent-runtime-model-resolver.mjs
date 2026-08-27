import { AGENT_MODEL_RUNTIME_SCHEMA } from "../../../contracts/agent-model-runtime.js";

export const WORKERS_AI_AGENT_ADAPTER_ID = "cloudflare-workers-ai";
export const WORKERS_AI_MODEL_ID_ENV = "KNOWGRPH_AGENT_MODEL_ID";

export const hasWorkersAiModelRuntimeConfiguration = (env = {}) =>
  Boolean(env.AI && String(env[WORKERS_AI_MODEL_ID_ENV] || "").trim());

export function createWorkersAiModelResolver(env = {}) {
  return async ({ requirements } = {}) => {
    if (!env.AI) return { status: "blocked", reason: "workers_ai_binding_unavailable" };
    const modelId = String(env[WORKERS_AI_MODEL_ID_ENV] || "").trim();
    if (!modelId) return { status: "blocked", reason: "workers_ai_model_id_unconfigured" };
    if (requirements?.providerId !== WORKERS_AI_AGENT_ADAPTER_ID) {
      return { status: "blocked", reason: "workers_ai_provider_not_selected" };
    }
    if (!requirements?.features?.every((feature) => feature === "text")) {
      return { status: "blocked", reason: "workers_ai_model_features_unsupported" };
    }
    if (requirements?.transport?.delivery !== "complete" || requirements?.transport?.connection !== "per-run") {
      return { status: "blocked", reason: "workers_ai_transport_unsupported" };
    }

    return {
      status: "ready",
      packet: {
        schemaVersion: AGENT_MODEL_RUNTIME_SCHEMA,
        provider: {
          id: WORKERS_AI_AGENT_ADAPTER_ID,
          revision: "workers-ai-binding/v1",
          adapterId: WORKERS_AI_AGENT_ADAPTER_ID,
        },
        model: { id: modelId, features: ["text"], source: "operator-environment" },
        transport: {
          id: "workers-ai-binding",
          delivery: "complete",
          connection: "per-run",
          source: "registered-adapter-capability",
        },
      },
    };
  };
}
