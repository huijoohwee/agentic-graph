import {
  TOOLBAR_ACTION_IDS,
  TOOLBAR_ACTION_MCP_TOOL_NAME,
} from '../../lib/toolbar/toolbarActionInvocationContract.mjs'

export const TOOLBAR_ACTION_AGENT_READY_TOOL_IDS = Object.freeze({
  controlLocalToolbarAction: 'control_local_toolbar_action',
})

const TOOLBAR_ACTION_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'status', 'actionId', 'invocation', 'mcpTool', 'message'],
  properties: {
    schema: { const: 'knowgrph-toolbar-action-control/v1' },
    status: { type: 'string', enum: ['applied', 'blocked'] },
    actionId: { type: 'string', enum: TOOLBAR_ACTION_IDS },
    invocation: { type: 'string', pattern: '^/toolbar\\.invoke\\s+#toolbar-action\\s+@canvas\\s+action=' },
    mcpTool: { const: TOOLBAR_ACTION_MCP_TOOL_NAME },
    message: { type: 'string', minLength: 1 },
  },
})

export const buildToolbarActionAgentReadyToolContracts = ({ buildWebName }) => [{
  name: TOOLBAR_ACTION_AGENT_READY_TOOL_IDS.controlLocalToolbarAction,
  webName: buildWebName(TOOLBAR_ACTION_AGENT_READY_TOOL_IDS.controlLocalToolbarAction),
  title: 'Control Local Main Toolbar Action',
  description: 'Invoke one canonical Main Toolbar action through the same browser-local owner used by its visible semantic button. Specialized Launch, Interaction, Canvas View, and Zoom controls retain their dedicated tools.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      invocation: { type: 'string', minLength: 1, maxLength: 512, pattern: '^/toolbar\\.invoke\\s+#toolbar-action\\s+@canvas\\s+action=' },
      actionId: { type: 'string', enum: TOOLBAR_ACTION_IDS },
    },
    oneOf: [
      { required: ['invocation'], not: { required: ['actionId'] } },
      { required: ['actionId'], not: { required: ['invocation'] } },
    ],
  },
  outputSchema: TOOLBAR_ACTION_OUTPUT_SCHEMA,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: false,
  },
}]
