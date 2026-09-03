import {
  controlLocalImmersiveMedia,
  inspectLocalImmersiveMedia,
  type ImmersiveMediaControlInput,
} from '@/features/immersive-media/immersiveMediaMcpRuntime'
import { AGENTIC_OS_AGENT_READY_TOOL_IDS } from './agentic-graph-agent-ready-tool-contract.mjs'

type ImmersiveMediaWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type ImmersiveMediaWebMcpTool = ImmersiveMediaWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: ImmersiveMediaWebMcpContract,
  execute: ImmersiveMediaWebMcpTool['execute'],
): ImmersiveMediaWebMcpTool => ({ ...contract, name: contract.webName, execute })

export function buildImmersiveMediaWebMcpToolBuilders(
  findContract: (name: string) => ImmersiveMediaWebMcpContract,
): Record<string, () => ImmersiveMediaWebMcpTool> {
  const inspectContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalImmersiveMedia)
  const controlContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalImmersiveMedia)
  return {
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalImmersiveMedia]: () =>
      buildTool(inspectContract, async () => inspectLocalImmersiveMedia()),
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalImmersiveMedia]: () =>
      buildTool(controlContract, async input =>
        controlLocalImmersiveMedia((input || {}) as ImmersiveMediaControlInput)),
  }
}
