import { executeToolbarActionControl } from '@/lib/toolbar/toolbarActionControlRuntime'
import { TOOLBAR_ACTION_AGENT_READY_TOOL_IDS } from './toolbarActionAgentReadyContract.mjs'

type ToolbarActionWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}>

export function buildToolbarActionWebMcpToolBuilders(
  findContract: (name: string) => ToolbarActionWebMcpContract,
  execute: (input: Record<string, unknown>) => unknown = executeToolbarActionControl,
) {
  const contract = findContract(TOOLBAR_ACTION_AGENT_READY_TOOL_IDS.controlLocalToolbarAction)
  return {
    [TOOLBAR_ACTION_AGENT_READY_TOOL_IDS.controlLocalToolbarAction]: () => ({
      ...contract,
      name: contract.webName,
      execute: async (input?: Record<string, unknown>) => execute(input || {}),
    }),
  }
}
