export const CANVAS_INTERACTION_COMMAND_TOKEN = '/canvas.interaction.tune'
export const CANVAS_INTERACTION_SEMANTIC_TOKEN = '#canvas-interaction'
export const CANVAS_INTERACTION_BINDING_TOKEN = '@canvas'
export const CANVAS_INTERACTION_MCP_TOOL_NAME = 'agenticgraph.control_local_canvas_interaction'

export const CANVAS_INTERACTION_CONTROL_OPTION_IDS = Object.freeze([
  'navigate:clear-selection',
  'viewLock:on',
  'viewLock:off',
  'selectMode:multi',
  'selectMode:single',
  'canvasInteraction:interactive',
  'canvasInteraction:static',
  'runMode:auto',
  'runMode:manual',
])

const CANVAS_INTERACTION_CONTROL_OPTION_ID_SET = new Set(CANVAS_INTERACTION_CONTROL_OPTION_IDS)

export const isCanvasInteractionControlOptionId = value => (
  CANVAS_INTERACTION_CONTROL_OPTION_ID_SET.has(String(value || '').trim())
)

export const buildCanvasInteractionInvocation = optionId => {
  const normalizedOptionId = String(optionId || '').trim()
  if (!isCanvasInteractionControlOptionId(normalizedOptionId)) {
    throw new Error('A canonical Canvas Interaction option id is required.')
  }
  return `${CANVAS_INTERACTION_COMMAND_TOKEN} ${CANVAS_INTERACTION_SEMANTIC_TOKEN} ${CANVAS_INTERACTION_BINDING_TOKEN} option=${normalizedOptionId}`
}

export const parseCanvasInteractionInvocation = invocationRaw => {
  const invocation = String(invocationRaw || '').trim()
  const match = invocation.match(/^\/canvas\.interaction\.tune\s+#canvas-interaction\s+@canvas\s+option=([^\s]+)$/)
  const optionId = String(match?.[1] || '').trim()
  if (!isCanvasInteractionControlOptionId(optionId)) {
    throw new Error('Canvas Interaction invocation must use the canonical command tuple and option id.')
  }
  return { invocation: buildCanvasInteractionInvocation(optionId), optionId }
}
