import { controlLocalCamera, inspectLocalCamera } from '@/features/strybldr/cameraMcpRuntime'
import { AGENTICGRAPH_AGENT_READY_TOOL_IDS } from './agenticgraphAgentReadyToolContract.mjs'

type CameraWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type CameraWebMcpTool = CameraWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: CameraWebMcpContract,
  execute: CameraWebMcpTool['execute'],
): CameraWebMcpTool => ({
  ...contract,
  name: contract.webName,
  execute,
})

export function buildCameraWebMcpToolBuilders(
  findContract: (name: string) => CameraWebMcpContract,
): Record<string, () => CameraWebMcpTool> {
  const inspectContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCamera)
  const controlContract = findContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalCamera)
  return {
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCamera]: () => buildTool(
      inspectContract,
      async () => inspectLocalCamera(),
    ),
    [AGENTICGRAPH_AGENT_READY_TOOL_IDS.controlLocalCamera]: () => buildTool(
      controlContract,
      async input => controlLocalCamera(input || {}),
    ),
  }
}
