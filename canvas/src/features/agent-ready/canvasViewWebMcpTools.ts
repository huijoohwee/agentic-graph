import { executeCanvasViewControl } from '@/lib/canvas/canvasViewControlRuntime'
import { CANVAS_VIEW_AGENT_READY_TOOL_IDS } from './canvasViewAgentReadyContract.mjs'

type CanvasViewWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}>

export function buildCanvasViewWebMcpToolBuilders(
  findContract: (name: string) => CanvasViewWebMcpContract,
  execute: (input: Record<string, unknown>) => unknown = executeCanvasViewControl,
) {
  const contract = findContract(CANVAS_VIEW_AGENT_READY_TOOL_IDS.controlLocalCanvasView)
  return {
    [CANVAS_VIEW_AGENT_READY_TOOL_IDS.controlLocalCanvasView]: () => ({
      ...contract,
      name: contract.webName,
      execute: async (input?: Record<string, unknown>) => execute(input || {}),
    }),
  }
}
