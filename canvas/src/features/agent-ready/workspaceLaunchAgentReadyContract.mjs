import {
  WORKSPACE_LAUNCH_MCP_TOOL_NAME,
  WORKSPACE_LAUNCH_OPTION_IDS,
} from '../../lib/toolbar/workspaceLaunchInvocationContract.mjs'

export const WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS = Object.freeze({
  controlLocalWorkspaceLaunch: 'control_local_workspace_launch',
})

const WORKSPACE_LAUNCH_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'status', 'optionId', 'invocation', 'mcpTool', 'message'],
  properties: {
    schema: { const: 'knowgrph-workspace-launch-control/v1' },
    status: { type: 'string', enum: ['applied', 'requested-user-input'] },
    optionId: { type: 'string', enum: WORKSPACE_LAUNCH_OPTION_IDS },
    invocation: { type: 'string', pattern: '^/workspace\\.launch\\s+#workspace-launch\\s+@canvas\\s+option=' },
    mcpTool: { const: WORKSPACE_LAUNCH_MCP_TOOL_NAME },
    message: { type: 'string', minLength: 1 },
  },
})

export const buildWorkspaceLaunchAgentReadyToolContracts = ({ buildWebName }) => [{
  name: WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS.controlLocalWorkspaceLaunch,
  webName: buildWebName(WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS.controlLocalWorkspaceLaunch),
  title: 'Control Local Workspace Launch',
  description: 'Invoke one canonical Launch menu row through its existing browser-local owner. File and folder chooser rows return requested-user-input instead of claiming silent completion.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      invocation: { type: 'string', minLength: 1, maxLength: 512, pattern: '^/workspace\\.launch\\s+#workspace-launch\\s+@canvas\\s+option=' },
      optionId: { type: 'string', enum: WORKSPACE_LAUNCH_OPTION_IDS },
    },
    oneOf: [
      { required: ['invocation'], not: { required: ['optionId'] } },
      { required: ['optionId'], not: { required: ['invocation'] } },
    ],
  },
  outputSchema: WORKSPACE_LAUNCH_OUTPUT_SCHEMA,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: false,
  },
}]
