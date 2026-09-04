import { buildAgentTeamToolDefinitions } from "./agent-team-tool-contract.js";
import { buildAdlcObservabilityToolDefinitions } from "./adlc-observability-tool-contract.js";
import { buildImplementationRunToolDefinitions } from "./implementation-run-tool-contract.js";

export const buildLocalRunToolDefinitions = (options) => [
  ...buildImplementationRunToolDefinitions(options),
  ...buildAdlcObservabilityToolDefinitions(options),
  ...buildAgentTeamToolDefinitions(options),
];
