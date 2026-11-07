import React from 'react'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useSourceFilesBootstrapSnapshot } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH } from './supplyChainOverviewSource'

export function useSupplyChainOverviewRoute(variant: string): void {
  const activePath = useMarkdownExplorerStore(state => state.activePath)
  const setActivePath = useMarkdownExplorerStore(state => state.setActivePath)
  const bootstrap = useSourceFilesBootstrapSnapshot()
  const requested = variant === 'workspace' && typeof window !== 'undefined'
    && ['1', 'overview'].includes(new URLSearchParams(window.location.search).get('kgSupplyChain') || '')
  const previousRequested = React.useRef(false)
  const selected = React.useRef(false)

  React.useEffect(() => {
    if (!requested) {
      previousRequested.current = false
      selected.current = false
    } else {
      if (!previousRequested.current) selected.current = false
      previousRequested.current = true
      if (bootstrap.phase === 'ready' && !selected.current) {
        selected.current = true
        if (activePath !== SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH) setActivePath(SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH)
        window.dispatchEvent(new CustomEvent(MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT, {
          detail: { path: SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH },
        }))
      }
    }
  }, [activePath, bootstrap.phase, requested, setActivePath])
}
