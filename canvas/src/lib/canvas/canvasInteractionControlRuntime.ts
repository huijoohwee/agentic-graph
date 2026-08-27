import {
  CANVAS_INTERACTION_MCP_TOOL_NAME,
  buildCanvasInteractionInvocation,
  isCanvasInteractionControlOptionId,
  parseCanvasInteractionInvocation,
} from './canvasInteractionInvocationContract.mjs'

export type CanvasInteractionControlOptionId =
  | 'navigate:clear-selection'
  | 'viewLock:on'
  | 'viewLock:off'
  | 'selectMode:multi'
  | 'selectMode:single'
  | 'canvasInteraction:interactive'
  | 'canvasInteraction:static'
  | 'runMode:auto'
  | 'runMode:manual'

export type CanvasInteractionControlResult = Readonly<{
  schema: 'agenticgraph-canvas-interaction-control/v1'
  status: 'applied'
  optionId: CanvasInteractionControlOptionId
  invocation: string
  mcpTool: typeof CANVAS_INTERACTION_MCP_TOOL_NAME
}>

type CanvasInteractionControlHandler = (optionId: CanvasInteractionControlOptionId) => void

let activeHandler: CanvasInteractionControlHandler | null = null

export function registerCanvasInteractionControlHandler(handler: CanvasInteractionControlHandler): () => void {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export function executeCanvasInteractionControl(input: Record<string, unknown>): CanvasInteractionControlResult {
  const hasInvocation = typeof input.invocation === 'string' && input.invocation.trim().length > 0
  const hasOptionId = typeof input.optionId === 'string' && input.optionId.trim().length > 0
  if (hasInvocation === hasOptionId) {
    throw new Error('Provide exactly one Canvas Interaction invocation or option id.')
  }
  const parsed = hasInvocation
    ? parseCanvasInteractionInvocation(input.invocation)
    : {
        optionId: String(input.optionId || '').trim(),
        invocation: buildCanvasInteractionInvocation(input.optionId),
      }
  if (!isCanvasInteractionControlOptionId(parsed.optionId)) {
    throw new Error('A canonical Canvas Interaction option id is required.')
  }
  if (!activeHandler) throw new Error('The browser-local Canvas Interaction owner is unavailable.')
  activeHandler(parsed.optionId as CanvasInteractionControlOptionId)
  return Object.freeze({
    schema: 'agenticgraph-canvas-interaction-control/v1',
    status: 'applied',
    optionId: parsed.optionId as CanvasInteractionControlOptionId,
    invocation: parsed.invocation,
    mcpTool: CANVAS_INTERACTION_MCP_TOOL_NAME,
  })
}
