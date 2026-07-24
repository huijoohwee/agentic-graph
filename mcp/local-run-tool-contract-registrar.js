import { buildAgentTeamToolDefinitions } from "./agent-team-tool-contract.js";
import { buildImplementationRunToolDefinitions } from "./implementation-run-tool-contract.js";

export const buildLocalRunToolDefinitions = (options) => [
  ...buildImplementationRunToolDefinitions(options),
  ...buildAgentTeamToolDefinitions(options),
];
