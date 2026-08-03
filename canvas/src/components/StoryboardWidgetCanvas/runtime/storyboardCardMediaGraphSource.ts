import { syncActiveMarkdownDocumentTextFromParsedGraph, writeActiveMarkdownDocumentTextIfPresent } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { publishWorkspaceSourceTextRevision } from '@/features/workspace-fs/workspaceSourceTextTransaction'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import {
  resolveStoryboardCardMediaGraphSourceGraph,
  resolveStoryboardCardMediaGraphSourceOwner,
  shouldUpdateStoryboardCardMediaGraphActiveDocument,
  type StoryboardCardMediaGraphSourceOwner,
} from './storyboardCardMediaGraphSourceOwner'

export type StoryboardCardMediaGraphPersistenceOptions = {
  label?: string
  source?: 'sourceFiles' | 'gitGraph'
  sourceOwner?: StoryboardCardMediaGraphSourceOwner
}

export function resolveStoryboardCardMediaGraphPersistenceText(args: {
  activeText: string
  synchronizedText?: string | null
}): string {
  return typeof args.synchronizedText === 'string'
    ? args.synchronizedText
    : String(args.activeText || '')
}

export type StoryboardCardMediaGraphSourceSynchronization = {
  ownerPath: string
  persistenceState: ReturnType<typeof useGraphStore.getState>
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  text: string
}

export function synchronizeStoryboardCardMediaGraphSource(graphData: GraphData, options?: StoryboardCardMediaGraphPersistenceOptions): StoryboardCardMediaGraphSourceSynchronization | null {
  const ownerResolution = resolveStoryboardCardMediaGraphSourceOwner({
    state: useGraphStore.getState(),
    sourceOwner: options?.sourceOwner,
  })
  const state = ownerResolution.state
  const sourceGraphData = resolveStoryboardCardMediaGraphSourceGraph({
    graphData,
    ownerFile: ownerResolution.ownerFile,
    ownerText: String(state.markdownDocumentText || ''),
  })
  const sourceSync = syncActiveMarkdownDocumentTextFromParsedGraph({
    state,
    sourceFiles: state.sourceFiles || [],
    parsedGraphData: sourceGraphData,
  })
  if (!sourceSync.accepted) return null
  const persistenceText = resolveStoryboardCardMediaGraphPersistenceText({
    activeText: String(state.markdownDocumentText || ''),
    synchronizedText: sourceSync.markdownDocumentText,
  })
  const persistenceState = {
    ...state,
    sourceFiles: sourceSync.sourceFiles,
    markdownDocumentName: sourceSync.markdownDocumentName ?? state.markdownDocumentName,
    markdownDocumentText: persistenceText,
  }
  if (typeof sourceSync.markdownDocumentText === 'string') {
    publishWorkspaceSourceTextRevision(ownerResolution.ownerPath)
    useGraphStore.setState(current => {
      if (!shouldUpdateStoryboardCardMediaGraphActiveDocument({
        currentDocumentName: current.markdownDocumentName,
        ownerPath: ownerResolution.ownerPath,
      })) return { sourceFiles: sourceSync.sourceFiles }
      return {
        sourceFiles: sourceSync.sourceFiles,
        markdownDocumentName: sourceSync.markdownDocumentName ?? current.markdownDocumentName,
        markdownDocumentText: persistenceText,
        markdownDocumentApplyViewPreset: false,
        markdownTokens: null,
        markdownTokensPath: null,
        markdownTokensKey: null,
        markdownTokensMeta: null,
        markdownTokensStartLineOffset: null,
      }
    })
  }
  return {
    ownerPath: ownerResolution.ownerPath,
    persistenceState,
    sourceFiles: sourceSync.sourceFiles,
    text: persistenceText,
  }
}

export async function persistStoryboardCardMediaGraphSourceSynchronization(
  synchronization: StoryboardCardMediaGraphSourceSynchronization,
  options?: StoryboardCardMediaGraphPersistenceOptions,
): Promise<boolean> {
  const persisted = await writeActiveMarkdownDocumentTextIfPresent({
    state: synchronization.persistenceState,
    sourceFiles: synchronization.sourceFiles,
    text: synchronization.text,
    label: options?.label || 'Storyboard media graph',
    source: options?.source,
  })
  if (!persisted) throw new Error('Unable to persist the generated Canvas document to the workspace.')
  return true
}

export async function persistStoryboardCardMediaGraphSource(graphData: GraphData, options?: StoryboardCardMediaGraphPersistenceOptions): Promise<boolean> {
  const synchronized = synchronizeStoryboardCardMediaGraphSource(graphData, options)
  if (!synchronized) return false
  return persistStoryboardCardMediaGraphSourceSynchronization(synchronized, options)
}
