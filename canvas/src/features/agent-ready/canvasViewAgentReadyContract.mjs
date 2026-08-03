import {
  CANVAS_VIEW_CONTROL_OPTION_IDS,
  CANVAS_VIEW_MCP_TOOL_NAME,
} from '../../lib/canvas/canvasViewInvocationContract.mjs'

export const CANVAS_VIEW_AGENT_READY_TOOL_IDS = Object.freeze({
  controlLocalCanvasView: 'control_local_canvas_view',
})

export const CANVAS_VIEW_AGENT_READY_MCP_TOOL_NAME = CANVAS_VIEW_MCP_TOOL_NAME

const CANVAS_VIEW_CONTROL_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'status', 'optionId', 'invocation', 'mcpTool'],
  properties: {
    schema: { const: 'knowgrph-canvas-view-control/v1' },
    status: { const: 'applied' },
    optionId: { type: 'string', enum: CANVAS_VIEW_CONTROL_OPTION_IDS },
    invocation: { type: 'string', pattern: '^/canvas\\.view\\.set\\s+#canvas-view\\s+@canvas-view\\s+option=' },
    mcpTool: { const: CANVAS_VIEW_MCP_TOOL_NAME },
  },
})

export const buildCanvasViewAgentReadyToolContracts = ({ buildWebName }) => [{
  name: CANVAS_VIEW_AGENT_READY_TOOL_IDS.controlLocalCanvasView,
  webName: buildWebName(CANVAS_VIEW_AGENT_READY_TOOL_IDS.controlLocalCanvasView),
  title: 'Control Local Canvas View',
  description: 'Apply one canonical Canvas View Mode row value through the same browser-local selection owner used by the toolbar. Accepts an option id or the strict /canvas.view.set #canvas-view @canvas-view option=<id> invocation.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      invocation: {
        type: 'string',
        minLength: 1,
        maxLength: 512,
        pattern: '^/canvas\\.view\\.set\\s+#canvas-view\\s+@canvas-view\\s+option=',
      },
      optionId: { type: 'string', enum: CANVAS_VIEW_CONTROL_OPTION_IDS },
    },
    oneOf: [
      { required: ['invocation'], not: { required: ['optionId'] } },
      { required: ['optionId'], not: { required: ['invocation'] } },
    ],
  },
  outputSchema: CANVAS_VIEW_CONTROL_OUTPUT_SCHEMA,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: false,
  },
}]
