import { controlLocalGroupPanel } from './groupPanelMcpRuntime'
import { GROUP_PANEL_AGENT_READY_TOOL_IDS } from './groupPanelContract.mjs'

type GroupPanelWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}>

export function buildGroupPanelWebMcpToolBuilders(
  findContract: (name: string) => GroupPanelWebMcpContract,
) {
  const contract = findContract(GROUP_PANEL_AGENT_READY_TOOL_IDS.controlLocalGroupPanel)
  return {
    [GROUP_PANEL_AGENT_READY_TOOL_IDS.controlLocalGroupPanel]: () => ({
      ...contract,
      name: contract.webName,
      execute: async (input?: Record<string, unknown>) => controlLocalGroupPanel(input || {}),
    }),
  }
}

