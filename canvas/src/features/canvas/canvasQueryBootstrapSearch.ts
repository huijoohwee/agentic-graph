import { QUERY_PARAM_OPEN_EDITOR_WORKSPACE } from '@/lib/routing/queryParams'

export const shouldOpenEditorWorkspaceFromSearch = (search: string): boolean => {
  const raw = String(search || '')
  if (!raw) return false
  const params = new URLSearchParams(raw)
  const explicitlyRequested = String(params.get(QUERY_PARAM_OPEN_EDITOR_WORKSPACE) || '').trim().length > 0
  const supplyChainOverviewRequested = ['1', 'overview'].includes(String(params.get('kgSupplyChain') || '').trim())
  return explicitlyRequested || supplyChainOverviewRequested
}
