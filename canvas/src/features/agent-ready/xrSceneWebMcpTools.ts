import { controlLocalXrScene, inspectLocalXrSceneAssets } from '@/features/three/xrSceneMcpRuntime'
import { AGENTICGRAPH_AGENT_READY_TOOL_IDS } from './agenticgraphAgentReadyToolContract.mjs'

type XrSceneWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type XrSceneWebMcpTool = XrSceneWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: XrSceneWebMcpContract,
  execute: XrSceneWebMcpTool['execute'],
): XrSceneWebMcpTool => ({
  ...contract,
  name: contract.webName,
  execute,
})

export function buildXrSceneWebMcpToolBuilders(
  findContract: (name: string) => XrSceneWebMcpContract,
): Record<string, () => XrSceneWebMcpTool> {
  const inspectContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalXrSceneAssets)
  const controlContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalXrScene)
  return {
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalXrSceneAssets]: () => buildTool(
      inspectContract,
      async () => inspectLocalXrSceneAssets(),
    ),
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalXrScene]: () => buildTool(
      controlContract,
      async input => controlLocalXrScene(input || {}),
    ),
  }
}
