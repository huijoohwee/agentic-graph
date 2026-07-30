import {
  AGENT_TEAM_CONTROL_INPUT_SCHEMA,
  AGENT_TEAM_CONTROL_OUTPUT_SCHEMA,
  AGENT_TEAM_LIST_INPUT_SCHEMA,
  AGENT_TEAM_LIST_OUTPUT_SCHEMA,
  AGENT_TEAM_PLAN_INPUT_SCHEMA,
  AGENT_TEAM_PLAN_OUTPUT_SCHEMA,
  AGENT_TEAM_START_INPUT_SCHEMA,
  AGENT_TEAM_START_OUTPUT_SCHEMA,
  AGENT_TEAM_TOOL_NAMES,
} from "../contracts/agent-team.schema.js";

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
});
const LOCAL_EXECUTION = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: true,
});
const LOCAL_CONTROL = Object.freeze({
  ...LOCAL_EXECUTION,
  destructiveHint: true,
});

const descriptor = (name, description, inputSchema, outputSchema, annotations) => ({
  name,
  description,
  inputSchema,
  outputSchema,
  annotations,
});

export function buildAgentTeamToolDefinitions({ toolNames, withDefaults }) {
  const names = {
    plan: toolNames.agentTeamPlan,
    start: toolNames.agentTeamStart,
    list: toolNames.agentTeamList,
    control: toolNames.agentTeamControl,
  };
  for (const [key, expected] of Object.entries(AGENT_TEAM_TOOL_NAMES)) {
    if (names[key] !== expected) throw new Error(`Shared local MCP tool name drifted for agent-team ${key}.`);
  }
  return [
    withDefaults(descriptor(
      names.plan,
      "Use this when a local MCP host needs a zero-model, read-only plan for one exact source-revision-fenced role-based agent team without creating a run or invoking an execution adapter.",
      AGENT_TEAM_PLAN_INPUT_SCHEMA,
      AGENT_TEAM_PLAN_OUTPUT_SCHEMA,
      READ_ONLY,
    ), READ_ONLY),
    withDefaults(descriptor(
      names.start,
      "Use this when a local MCP host needs to idempotently start one durable bounded agent-team plan through a configured host-owned Agent Orchestration adapter.",
      AGENT_TEAM_START_INPUT_SCHEMA,
      AGENT_TEAM_START_OUTPUT_SCHEMA,
      LOCAL_EXECUTION,
    ), LOCAL_EXECUTION),
    withDefaults(descriptor(
      names.list,
      "Use this when a local MCP host needs sanitized durable agent-team run summaries without exposing private specialist output or starting execution.",
      AGENT_TEAM_LIST_INPUT_SCHEMA,
      AGENT_TEAM_LIST_OUTPUT_SCHEMA,
      READ_ONLY,
    ), READ_ONLY),
    withDefaults(descriptor(
      names.control,
      "Use this when a local MCP host needs a state-version-fenced pause, resume, cancel, retry, review request, or review receipt transition for one durable agent-team run.",
      AGENT_TEAM_CONTROL_INPUT_SCHEMA,
      AGENT_TEAM_CONTROL_OUTPUT_SCHEMA,
      LOCAL_CONTROL,
    ), LOCAL_CONTROL),
  ];
}
