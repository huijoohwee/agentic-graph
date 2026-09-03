import { controlLocalCamera, inspectLocalCamera } from '@/features/strybldr/cameraMcpRuntime'
import { AGENTIC_OS_AGENT_READY_TOOL_IDS } from './agentic-graph-agent-ready-tool-contract.mjs'

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
  const inspectContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalCamera)
  const controlContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalCamera)
  return {
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalCamera]: () => buildTool(
      inspectContract,
      async () => inspectLocalCamera(),
    ),
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalCamera]: () => buildTool(
      controlContract,
      async input => controlLocalCamera(input || {}),
    ),
  }
}
