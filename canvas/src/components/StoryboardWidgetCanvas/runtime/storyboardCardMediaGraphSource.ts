import { syncActiveMarkdownDocumentTextFromParsedGraph, writeActiveMarkdownDocumentTextIfPresent } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
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

export async function persistStoryboardCardMediaGraphSource(graphData: GraphData, options?: StoryboardCardMediaGraphPersistenceOptions): Promise<boolean> {
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
  if (!sourceSync.accepted) return false
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
  const persisted = await writeActiveMarkdownDocumentTextIfPresent({
    state: persistenceState,
    sourceFiles: sourceSync.sourceFiles,
    text: persistenceText,
    label: options?.label || 'Storyboard media graph',
    source: options?.source,
  })
  if (!persisted) throw new Error('Unable to persist the generated Canvas document to the workspace.')
  return true
}
