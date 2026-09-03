import { controlLocalAnimation, inspectLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import { AGENTIC_OS_AGENT_READY_TOOL_IDS } from './agentic-graph-agent-ready-tool-contract.mjs'

type XrAnimationWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type XrAnimationWebMcpTool = XrAnimationWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: XrAnimationWebMcpContract,
  execute: XrAnimationWebMcpTool['execute'],
): XrAnimationWebMcpTool => ({ ...contract, name: contract.webName, execute })

export function buildXrAnimationWebMcpToolBuilders(
  findContract: (name: string) => XrAnimationWebMcpContract,
): Record<string, () => XrAnimationWebMcpTool> {
  const inspectContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalAnimation)
  const controlContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalAnimation)
  return {
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalAnimation]: () => buildTool(inspectContract, async () => inspectLocalAnimation()),
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalAnimation]: () => buildTool(controlContract, async input => controlLocalAnimation(input || {})),
  }
}
