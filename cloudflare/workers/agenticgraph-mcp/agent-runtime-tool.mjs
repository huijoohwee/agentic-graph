import {
  AGENT_RUN_INPUT_SCHEMA,
  AGENT_RUN_OUTPUT_SCHEMA,
  AGENT_RUNTIME_TOOL_NAME,
  compileAgentRun,
  executeAgentRun,
} from "../../../contracts/agent-runtime.schema.js";

export { AGENT_RUNTIME_TOOL_NAME };

export const AGENT_RUNTIME_TOOL_DEFINITION = Object.freeze({
  name: AGENT_RUNTIME_TOOL_NAME,
  title: "Knowgrph Agent Runtime",
  description:
    "Resolve and run a registered agent through one reusable kernel. Dry-run is deterministic and zero-spend; live mode requires approval, model resolution, and an exact registered adapter.",
  inputSchema: AGENT_RUN_INPUT_SCHEMA,
  outputSchema: AGENT_RUN_OUTPUT_SCHEMA,
});

const toToolResult = (result) => ({
  ok: result.ok,
  structuredContent:
    result.payload || { status: "blocked", error: result.error },
  text: JSON.stringify(result.payload || result.error, null, 2),
});

export function executeAgentRuntimeTool(rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  return toToolResult(compileAgentRun(args));
}

export async function executeAgentRuntimeToolAsync(rawArgs = {}, deps = {}) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  return toToolResult(
    await executeAgentRun(args, {
      modelResolver: deps.agentModelResolver,
      runningAgentAdapters: deps.runningAgentAdapters,
    }),
  );
}
