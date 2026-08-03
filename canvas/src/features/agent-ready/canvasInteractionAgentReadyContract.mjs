import {
  CANVAS_INTERACTION_CONTROL_OPTION_IDS,
  CANVAS_INTERACTION_MCP_TOOL_NAME,
} from '../../lib/canvas/canvasInteractionInvocationContract.mjs'

export const CANVAS_INTERACTION_AGENT_READY_TOOL_IDS = Object.freeze({
  controlLocalCanvasInteraction: 'control_local_canvas_interaction',
})

export const CANVAS_INTERACTION_AGENT_READY_MCP_TOOL_NAME = CANVAS_INTERACTION_MCP_TOOL_NAME

const CANVAS_INTERACTION_CONTROL_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'status', 'optionId', 'invocation', 'mcpTool'],
  properties: {
    schema: { const: 'knowgrph-canvas-interaction-control/v1' },
    status: { const: 'applied' },
    optionId: { type: 'string', enum: CANVAS_INTERACTION_CONTROL_OPTION_IDS },
    invocation: { type: 'string', pattern: '^/canvas\\.interaction\\.tune\\s+#canvas-interaction\\s+@canvas\\s+option=' },
    mcpTool: { const: CANVAS_INTERACTION_MCP_TOOL_NAME },
  },
})

export const buildCanvasInteractionAgentReadyToolContracts = ({ buildWebName }) => [{
  name: CANVAS_INTERACTION_AGENT_READY_TOOL_IDS.controlLocalCanvasInteraction,
  webName: buildWebName(CANVAS_INTERACTION_AGENT_READY_TOOL_IDS.controlLocalCanvasInteraction),
  title: 'Control Local Canvas Interaction',
  description: 'Apply one canonical Interaction toolbar row value through the same browser-local action owner used by the toolbar. Accepts an option id or the strict /canvas.interaction.tune #canvas-interaction @canvas option=<id> invocation.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      invocation: {
        type: 'string',
        minLength: 1,
        maxLength: 512,
        pattern: '^/canvas\\.interaction\\.tune\\s+#canvas-interaction\\s+@canvas\\s+option=',
      },
      optionId: { type: 'string', enum: CANVAS_INTERACTION_CONTROL_OPTION_IDS },
    },
    oneOf: [
      { required: ['invocation'], not: { required: ['optionId'] } },
      { required: ['optionId'], not: { required: ['invocation'] } },
    ],
  },
  outputSchema: CANVAS_INTERACTION_CONTROL_OUTPUT_SCHEMA,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
}]
