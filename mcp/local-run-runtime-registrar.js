import {
  createAgentTeamRuntime,
  isAgentTeamToolName,
  runAgentTeamTool,
} from "./agent-team-runtime.js";
import {
  createImplementationRunRuntime,
  isImplementationRunToolName,
  runImplementationRunTool,
} from "./implementation-run-runtime.js";
import {
  createAgenticSdlcObservabilityRuntime,
  isAgenticSdlcObserveToolName,
  runAgenticSdlcObservabilityTool,
} from "./agentic-sdlc-observability-runtime.js";
import { createLocalAgentTeamHost } from "./agent-team-local-host.js";

export function createLocalRunRuntimeRegistrar({
  rootDir,
  env,
  agentTeamOptions = {},
  implementationRunOptions = {},
  agenticSdlcObservabilityOptions = {},
} = {}) {
  const agentTeamHost = createLocalAgentTeamHost({ rootDir, env });
  const implementationRun = createImplementationRunRuntime({
    rootDir,
    env,
    ...implementationRunOptions,
  });
  const agenticSdlcObservability = createAgenticSdlcObservabilityRuntime({
    rootDir,
    ...agenticSdlcObservabilityOptions,
  });
  const agentTeam = createAgentTeamRuntime({
    rootDir,
    env,
    ...agentTeamHost.options,
    ...agentTeamOptions,
  });
  return Object.freeze({
    canHandle(toolName) {
      return isImplementationRunToolName(toolName)
        || isAgentTeamToolName(toolName)
        || isAgenticSdlcObserveToolName(toolName);
    },
    async run(toolName, args, { signal } = {}) {
      if (isAgenticSdlcObserveToolName(toolName)) {
        return runAgenticSdlcObservabilityTool(toolName, args, {
          runtime: agenticSdlcObservability,
        });
      }
      if (isImplementationRunToolName(toolName)) {
        return runImplementationRunTool(toolName, args, { runtime: implementationRun });
      }
      if (isAgentTeamToolName(toolName)) {
        return runAgentTeamTool(toolName, args, { runtime: agentTeam, signal });
      }
      return {
        ok: false,
        error: { code: "unknown_local_run_tool", message: `Unknown local run tool: ${toolName}` },
      };
    },
    async recover() {
      const [implementationRuns, agentTeams] = await Promise.all([
        implementationRun.recover(),
        agentTeam.recover(),
      ]);
      return { implementationRuns, agentTeams };
    },
    stopMonitoring() {
      implementationRun.stopMonitoring?.();
    },
    implementationRun,
    agenticSdlcObservability,
    agentTeam,
    agentTeamHostReadiness: agentTeamHost.readiness,
  });
}
