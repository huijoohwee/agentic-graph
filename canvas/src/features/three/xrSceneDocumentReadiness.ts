import { readSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { isXrPhysicsRuntimeRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'

export type XrSceneDocumentReadinessInput = Readonly<{
  sourceFilesBootstrapReady: boolean
  graphData: unknown
  markdownDocumentName: unknown
  markdownDocumentText: unknown
}>

export function resolveXrSceneDocumentReady(input: XrSceneDocumentReadinessInput): boolean {
  const explicitXrRunReadyDemo = isXrPhysicsRuntimeRunReadyDemoActive('', '')
  return Boolean(
    input.sourceFilesBootstrapReady
    && (
      explicitXrRunReadyDemo
      || (
        input.graphData
        && String(input.markdownDocumentName || '').trim()
        && String(input.markdownDocumentText || '').trim()
      )
    ),
  )
}

export function readXrSceneDocumentReady(): boolean {
  const state = useGraphStore.getState()
  return resolveXrSceneDocumentReady({
    sourceFilesBootstrapReady: readSourceFilesBootstrapReady(),
    graphData: state.graphData,
    markdownDocumentName: state.markdownDocumentName,
    markdownDocumentText: state.markdownDocumentText,
  })
}
