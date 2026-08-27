import { createRunningAgentAdapterRegistry } from "../../../contracts/agent-model-runtime.js";
import {
  createWorkersAiModelResolver,
  WORKERS_AI_AGENT_ADAPTER_ID,
} from "./agent-runtime-model-resolver.mjs";

type AgentExecutionContext = {
  input: { brief?: unknown; context?: unknown };
  run: { runId: string; agentDefinitionId: string };
  preparedAgent: {
    instructions: string[];
    modelRuntime: {
      provider: { id: string; adapterId: string };
      model: { id: string };
    };
  };
};

const readTextResult = (result: Record<string, unknown>): string => {
  if (typeof result.response === "string") return result.response;
  if (typeof result.result === "string") return result.result;
  const first = Array.isArray(result.choices) ? result.choices[0] : null;
  if (first && typeof first === "object" && "message" in first) {
    const message = first.message;
    if (message && typeof message === "object" && "content" in message && typeof message.content === "string") {
      return message.content;
    }
  }
  return JSON.stringify(result);
};

export function createWorkersAiAgentAdapter(env: Env) {
  return {
    id: WORKERS_AI_AGENT_ADAPTER_ID,
    async execute(context: AgentExecutionContext): Promise<Record<string, unknown>> {
      const model = String(context.preparedAgent.modelRuntime.model.id || "").trim();
      const provider = context.preparedAgent.modelRuntime.provider;
      if (!env.AI || !model || provider.id !== WORKERS_AI_AGENT_ADAPTER_ID || provider.adapterId !== WORKERS_AI_AGENT_ADAPTER_ID) {
        throw new Error("Prepared Workers AI model runtime is unavailable or incompatible.");
      }
      const system = context.preparedAgent.instructions.join("\n");
      const result = await env.AI.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: String(context.input.brief || "") },
        ],
        max_tokens: 2048,
      }, {
        tags: ["knowgrph", context.run.agentDefinitionId, context.run.runId].map((tag) => tag.slice(0, 50)),
      });
      return {
        provider: WORKERS_AI_AGENT_ADAPTER_ID,
        model,
        text: readTextResult(result),
        ...("usage" in result && result.usage && typeof result.usage === "object" ? { usage: result.usage } : {}),
      };
    },
  };
}

export function createWorkersAiRunningAgentRuntime(env: Env) {
  return {
    modelResolver: createWorkersAiModelResolver(env),
    runningAgentAdapters: createRunningAgentAdapterRegistry([
      createWorkersAiAgentAdapter(env),
    ]),
  };
}
