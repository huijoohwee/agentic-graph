import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { isNativeXrRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { QUERY_PARAM_RUNTIME_IDENTITY_PROOF } from '@/lib/routing/queryParams'

const AgenticOsRemoteGrammarAutoHydrationContext = React.createContext(true)

export function resolveAgenticOsRemoteGrammarAutoHydration(args: {
  sourceFilesReady: boolean
  offlineNativeXrActive: boolean
  runtimeIdentityProofRequested: boolean
}): boolean {
  return args.sourceFilesReady
    && (args.runtimeIdentityProofRequested || !args.offlineNativeXrActive)
}

export function AgenticOsRemoteGrammarAutoHydrationBoundary(props: {
  children: React.ReactNode
}): React.ReactElement {
  const sourceFilesReady = useSourceFilesBootstrapReady()
  const runtimeIdentityProofRequested = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get(QUERY_PARAM_RUNTIME_IDENTITY_PROOF) === '1'
  const offlineNativeXrActive = useGraphStore(state => (
    isNativeXrRunReadyDemoActive(
      state.markdownDocumentName,
      state.markdownDocumentText,
    )
  ))
  const autoHydrationAllowed = resolveAgenticOsRemoteGrammarAutoHydration({
    sourceFilesReady,
    offlineNativeXrActive,
    runtimeIdentityProofRequested,
  })
  return (
    <AgenticOsRemoteGrammarAutoHydrationContext.Provider value={autoHydrationAllowed}>
      {props.children}
    </AgenticOsRemoteGrammarAutoHydrationContext.Provider>
  )
}

export function useAgenticOsRemoteGrammarAutoHydration(): boolean {
  return React.useContext(AgenticOsRemoteGrammarAutoHydrationContext)
}
