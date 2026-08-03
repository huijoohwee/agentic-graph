import { executeWorkspaceLaunchControl } from '@/lib/toolbar/workspaceLaunchControlRuntime'
import { WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS } from './workspaceLaunchAgentReadyContract.mjs'

type WorkspaceLaunchWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}>

export function buildWorkspaceLaunchWebMcpToolBuilders(
  findContract: (name: string) => WorkspaceLaunchWebMcpContract,
  execute: (input: Record<string, unknown>) => unknown = executeWorkspaceLaunchControl,
) {
  const contract = findContract(WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS.controlLocalWorkspaceLaunch)
  return {
    [WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS.controlLocalWorkspaceLaunch]: () => ({
      ...contract,
      name: contract.webName,
      execute: async (input?: Record<string, unknown>) => execute(input || {}),
    }),
  }
}
