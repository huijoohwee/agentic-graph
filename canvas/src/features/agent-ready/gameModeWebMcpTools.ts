import { controlLocalGameMode, inspectLocalGameMode } from '@/features/game-fps/gameModeMcpRuntime'
import { AGENTICGRAPH_AGENT_READY_TOOL_IDS } from './agenticgraphAgentReadyToolContract.mjs'

type GameModeWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type GameModeWebMcpTool = GameModeWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: GameModeWebMcpContract,
  execute: GameModeWebMcpTool['execute'],
): GameModeWebMcpTool => ({ ...contract, name: contract.webName, execute })

export function buildGameModeWebMcpToolBuilders(
  findContract: (name: string) => GameModeWebMcpContract,
): Record<string, () => GameModeWebMcpTool> {
  const inspectContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalGameMode)
  const controlContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalGameMode)
  return {
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalGameMode]: () => buildTool(inspectContract, async () => inspectLocalGameMode()),
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalGameMode]: () => buildTool(controlContract, async input => controlLocalGameMode(input || {})),
  }
}
