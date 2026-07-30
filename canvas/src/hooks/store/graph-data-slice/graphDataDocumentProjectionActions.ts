import type { TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import { persistGraphDataToLocalStorage } from '@/hooks/store/graphDataPersistence'
import { isJsonValue } from '@/lib/graph/jsonValue'
import type { GraphData, JSONValue } from '@/lib/graph/types'
import { syncGraphFieldsWithGraphData, withGraphDataRevision } from '@/hooks/store/graphDataSliceUtils'
import type { GetGraph, SetGraph } from './graphDataSliceAccess'
import { isReadOnlyKnowledgeGraphProjection } from '@/features/knowledge-graph/knowledgeGraphProjectionPolicy'

export function createGraphDataDocumentProjectionActions(set: SetGraph, get: GetGraph) {
  return {
    resyncGraphFieldsFromGraphData: () => {
      const current = get().graphData
      if (!current) return
      try {
        syncGraphFieldsWithGraphData(get, current)
      } catch {
        void 0
      }
    },

    setMarkdownTokens: (args: {
      tokens: import('@/features/markdown/ui/markdownPreviewLex').TokenWithLines[] | null
      path?: string | null
      key?: string | null
      meta?: import('@/lib/markdown').MarkdownFrontmatter | null
      startLineOffset?: number | null
    }) => {
      set(state => {
        const nextPath = args.path ?? null
        const nextKey = args.key ?? null
        const nextMeta = args.meta ?? null
        const nextOffset = args.startLineOffset ?? null
        if (
          state.markdownTokens === args.tokens &&
          state.markdownTokensPath === nextPath &&
          state.markdownTokensKey === nextKey &&
          state.markdownTokensMeta === nextMeta &&
          state.markdownTokensStartLineOffset === nextOffset
        ) return state
        return {
          markdownTokens: args.tokens,
          markdownTokensPath: nextPath,
          markdownTokensKey: nextKey,
          markdownTokensMeta: nextMeta,
          markdownTokensStartLineOffset: nextOffset,
        }
      })
    },

    setJsonSourceDocument: (name: string | null, text: string | null) => {
      const nextName = typeof name === 'string' && name.trim() ? name.trim() : null
      const trimmed = typeof text === 'string' ? text.trim() : ''
      const nextText = trimmed ? text : null
      set(state => ({
        ...state,
        jsonSourceDocumentName: nextText ? nextName : null,
        jsonSourceDocumentText: nextText,
      }))
    },

    setMarkdownPreviewMermaidFocus: (
      focus: { code: string; frontmatterConfig: Record<string, unknown> | null } | null,
    ) => {
      if (!focus) {
        set({ markdownPreviewMermaidFocusCode: null, markdownPreviewMermaidFocusConfig: null })
        return
      }
      const cfg = focus.frontmatterConfig
      set({
        markdownPreviewMermaidFocusCode: typeof focus.code === 'string' ? focus.code : '',
        markdownPreviewMermaidFocusConfig:
          cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : null,
      })
    },

    setMarkdownPreviewActiveMediaKey: (key: string | null) => {
      const nextKey = typeof key === 'string' ? key.trim() : ''
      set({ markdownPreviewActiveMediaKey: nextKey || null })
    },

    setMarkdownDocumentSourceUrl: (url: string | null) => {
      set({ markdownDocumentSourceUrl: url })
    },

    setGraphRagWorkflowJsonText: (text: string | null) => {
      const nextText = typeof text === 'string' ? text : null
      set({ graphRagWorkflowJsonText: nextText })
      const graphData = get().graphData
      if (!graphData) return
      if (isReadOnlyKnowledgeGraphProjection(graphData)) return

      const nextMetadata = { ...(graphData.metadata || {}) } as Record<string, JSONValue>
      const trimmed = typeof nextText === 'string' ? nextText.trim() : ''
      if (!trimmed) {
        delete nextMetadata.graphRagWorkflowJsonText
        delete nextMetadata.graphRagWorkflowJsonLd
      } else {
        nextMetadata.graphRagWorkflowJsonText = nextText as unknown as JSONValue
        try {
          const parsed = JSON.parse(trimmed) as unknown
          if (isJsonValue(parsed) && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const type = (parsed as Record<string, unknown>)['@type']
            if (type === 'rag:GraphRAGWorkflow' || type === 'GraphRAGWorkflow') {
              nextMetadata.graphRagWorkflowJsonLd = parsed as JSONValue
            } else delete nextMetadata.graphRagWorkflowJsonLd
          } else delete nextMetadata.graphRagWorkflowJsonLd
        } catch {
          delete nextMetadata.graphRagWorkflowJsonLd
        }
      }

      const nextRevision = (get().graphDataRevision || 0) + 1
      const nextGraphData = withGraphDataRevision({ ...graphData, metadata: nextMetadata } as GraphData, nextRevision)
      set({ graphData: nextGraphData, graphDataRevision: nextRevision })
      try { persistGraphDataToLocalStorage(nextGraphData) } catch { void 0 }
      try { get().scheduleHistory('Update GraphRAG workflow') } catch { void 0 }
    },

    setLastTraversalSummary: (summary: TraversalSummary | null) => {
      set({ lastTraversalSummary: summary })
    },
  }
}
