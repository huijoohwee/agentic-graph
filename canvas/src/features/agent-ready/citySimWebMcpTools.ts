import {
  controlLocalCitySim,
  inspectLocalCitySim,
} from '@/features/game-city-sim/citySimMcpRuntime'
import { AGENTICGRAPH_AGENT_READY_TOOL_IDS } from './agenticgraphAgentReadyToolContract.mjs'

type CitySimWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type CitySimWebMcpTool = CitySimWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: CitySimWebMcpContract,
  execute: CitySimWebMcpTool['execute'],
): CitySimWebMcpTool => ({ ...contract, name: contract.webName, execute })

export function buildCitySimWebMcpToolBuilders(
  findContract: (name: string) => CitySimWebMcpContract,
): Record<string, () => CitySimWebMcpTool> {
  const inspectContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCitySim)
  const controlContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalCitySim)
  return {
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCitySim]: () =>
      buildTool(inspectContract, async () => inspectLocalCitySim()),
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalCitySim]: () =>
      buildTool(controlContract, async input => controlLocalCitySim(input || {})),
  }
}
