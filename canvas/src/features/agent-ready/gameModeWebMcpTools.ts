import { controlLocalGameMode, inspectLocalGameMode } from '@/features/game-fps/gameModeMcpRuntime'
import { AGENTIC_OS_AGENT_READY_TOOL_IDS } from './agentic-graph-agent-ready-tool-contract.mjs'

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
  const inspectContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalGameMode)
  const controlContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalGameMode)
  return {
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalGameMode]: () => buildTool(inspectContract, async () => inspectLocalGameMode()),
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalGameMode]: () => buildTool(controlContract, async input => controlLocalGameMode(input || {})),
  }
}
