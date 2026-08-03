import { executeCanvasInteractionControl } from '@/lib/canvas/canvasInteractionControlRuntime'
import { CANVAS_INTERACTION_AGENT_READY_TOOL_IDS } from './canvasInteractionAgentReadyContract.mjs'

type CanvasInteractionWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}>

export function buildCanvasInteractionWebMcpToolBuilders(
  findContract: (name: string) => CanvasInteractionWebMcpContract,
  execute: (input: Record<string, unknown>) => unknown = executeCanvasInteractionControl,
) {
  const contract = findContract(CANVAS_INTERACTION_AGENT_READY_TOOL_IDS.controlLocalCanvasInteraction)
  return {
    [CANVAS_INTERACTION_AGENT_READY_TOOL_IDS.controlLocalCanvasInteraction]: () => ({
      ...contract,
      name: contract.webName,
      execute: async (input?: Record<string, unknown>) => execute(input || {}),
    }),
  }
}
