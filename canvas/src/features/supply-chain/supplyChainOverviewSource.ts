export const SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH = '/docs/workspace-seeds/agentic-graph-logistics-supply-chain-overview.md' as const
export const SUPPLY_CHAIN_OVERVIEW_SOURCE_BASENAME = 'agentic-graph-logistics-supply-chain-overview.md' as const

export async function loadSupplyChainOverviewWorkspaceSeed(): Promise<string> {
  const { default: text } = await import('../../../../docs/workspace-seeds/agentic-graph-logistics-supply-chain-overview.md?raw')
  return String(text || '')
}
