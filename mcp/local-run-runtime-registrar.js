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
  createAdlcObservabilityRuntime,
  isAdlcObserveToolName,
  runAdlcObservabilityTool,
} from "./adlc-observability-runtime.js";
import { createLocalAgentTeamHost } from "./agent-team-local-host.js";

export function createLocalRunRuntimeRegistrar({
  rootDir,
  env,
  agentTeamOptions = {},
  implementationRunOptions = {},
  adlcObservabilityOptions = {},
} = {}) {
  const agentTeamHost = createLocalAgentTeamHost({ rootDir, env });
  const implementationRun = createImplementationRunRuntime({
    rootDir,
    env,
    ...implementationRunOptions,
  });
  const adlcObservability = createAdlcObservabilityRuntime({
    rootDir,
    ...adlcObservabilityOptions,
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
        || isAdlcObserveToolName(toolName);
    },
    async run(toolName, args, { signal } = {}) {
      if (isAdlcObserveToolName(toolName)) {
        return runAdlcObservabilityTool(toolName, args, {
          runtime: adlcObservability,
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
    adlcObservability,
    agentTeam,
    agentTeamHostReadiness: agentTeamHost.readiness,
  });
}
