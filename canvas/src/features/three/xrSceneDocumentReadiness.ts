import { readSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { isXrPhysicsRuntimeRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import { graphHasXrAuthoringSource } from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import { resolveXrMotionReferencePersistedValue } from './xrMotionReferencePersistedValue'
import type { GraphData } from '@/lib/graph/types'

export type XrSceneDocumentReadinessInput = Readonly<{
  sourceFilesBootstrapReady: boolean
  graphData: unknown
  markdownDocumentName: unknown
  markdownDocumentText: unknown
}>

/** A loaded document permits authoring; only authored XR content admits a stage. */
export function resolveXrDocumentStageAuthority(input: Pick<XrSceneDocumentReadinessInput,
  'graphData' | 'markdownDocumentName' | 'markdownDocumentText'
>): 'native-controller' | 'motion-reference' | undefined {
  if (isXrPhysicsRuntimeRunReadyDemoActive(String(input.markdownDocumentName || ''), String(input.markdownDocumentText || ''))) return 'native-controller'
  if (!String(input.markdownDocumentName || '').trim() || !String(input.markdownDocumentText || '').trim()) return undefined
  if (graphHasXrAuthoringSource(input.graphData)) return 'native-controller'
  const persisted = resolveXrMotionReferencePersistedValue((input.graphData as Partial<GraphData> | null)?.metadata)
  return persisted && typeof persisted === 'object' && !Array.isArray(persisted) ? 'motion-reference' : undefined
}

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
