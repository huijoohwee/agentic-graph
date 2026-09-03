import { controlLocalMotionControl, inspectLocalMotionControl } from '@/features/three/motionControlMcpRuntime'
import { AGENTIC_OS_AGENT_READY_TOOL_IDS } from './agentic-graph-agent-ready-tool-contract.mjs'

type MotionControlWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type MotionControlWebMcpTool = MotionControlWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: MotionControlWebMcpContract,
  execute: MotionControlWebMcpTool['execute'],
): MotionControlWebMcpTool => ({ ...contract, name: contract.webName, execute })

export function buildMotionControlWebMcpToolBuilders(
  findContract: (name: string) => MotionControlWebMcpContract,
): Record<string, () => MotionControlWebMcpTool> {
  const inspectContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalMotionControl)
  const controlContract = findContract(AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalMotionControl)
  return {
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalMotionControl]: () => buildTool(inspectContract, async () => inspectLocalMotionControl()),
    [AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalMotionControl]: () => buildTool(controlContract, async input => controlLocalMotionControl(input || {})),
  }
}
