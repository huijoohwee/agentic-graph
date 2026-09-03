import type { CanvasViewOptionId } from '@/components/toolbar/canvasViewTypes'
import {
  CANVAS_VIEW_MCP_TOOL_NAME,
  buildCanvasViewInvocation,
  isCanvasViewControlOptionId,
  parseCanvasViewInvocation,
} from './canvasViewInvocationContract.mjs'

export type CanvasViewControlResult = Readonly<{
  schema: 'agentic-graph-canvas-view-control/v1'
  status: 'applied'
  optionId: CanvasViewOptionId
  invocation: string
  mcpTool: typeof CANVAS_VIEW_MCP_TOOL_NAME
}>

type CanvasViewControlHandler = (optionId: CanvasViewOptionId) => void

let activeHandler: CanvasViewControlHandler | null = null

export function registerCanvasViewControlHandler(handler: CanvasViewControlHandler): () => void {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export function executeCanvasViewControl(input: Record<string, unknown>): CanvasViewControlResult {
  const parsed = input.invocation
    ? parseCanvasViewInvocation(input.invocation)
    : {
        optionId: String(input.optionId || '').trim(),
        invocation: buildCanvasViewInvocation(input.optionId),
      }
  if (!isCanvasViewControlOptionId(parsed.optionId)) throw new Error('A canonical Canvas View option id is required.')
  if (!activeHandler) throw new Error('The browser-local Canvas View owner is unavailable.')
  activeHandler(parsed.optionId as CanvasViewOptionId)
  return Object.freeze({
    schema: 'agentic-graph-canvas-view-control/v1',
    status: 'applied',
    optionId: parsed.optionId as CanvasViewOptionId,
    invocation: parsed.invocation,
    mcpTool: CANVAS_VIEW_MCP_TOOL_NAME,
  })
}
