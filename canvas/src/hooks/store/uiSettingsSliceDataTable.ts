
import type { StoreApi } from 'zustand'
import type { GraphState, GraphDataTableScope, GraphDataTableFreezeMode, GraphHoverPreviewConfig } from './types'
import type { GraphFieldId, GraphFieldSettingsById } from '@/features/graph-fields/graphFields'
import type {
  GraphDataTableColumnKey,
  GraphDataTableColumnVisibilityByKey,
  GraphDataTableFilterClause,
  GraphDataTableFilterMatch,
  GraphDataTableRowDensity,
  GraphDataTableSortRule,
} from '@/features/graph-data-table/graphDataTable'
import type { TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'

type SetGraph = StoreApi<GraphState>['setState']

export const createUiSettingsDataTableSlice = (set: SetGraph)=> ({
  setSchemaDeriveCacheCapacity: (n: number) => set({ schemaDeriveCacheCapacity: n }),
  setGraphFieldSettingsById: (next: GraphFieldSettingsById) =>
    set(state => (state.graphFieldSettingsById === next ? state : { graphFieldSettingsById: next })),
  setSelectedGraphFieldId: (id: GraphFieldId | null) =>
    set(state => (state.selectedGraphFieldId === id ? state : { selectedGraphFieldId: id })),
  setGraphDataTableVisibleColumns: (next: GraphDataTableColumnVisibilityByKey) => set({ graphDataTableVisibleColumns: next }),
  setGraphDataTableColumnOrder: (next: GraphDataTableColumnKey[]) =>
    set({ graphDataTableColumnOrder: Array.from(new Set(next)) as GraphDataTableColumnKey[] }),
  setGraphDataTableAggregateKeys: (next: GraphDataTableColumnKey[]) => set({ graphDataTableAggregateKeys: next }),
  setGraphDataTableFilterMatch: (match: GraphDataTableFilterMatch) => set({ graphDataTableFilterMatch: match }),
  setGraphDataTableFilterClauses: (
    updater: GraphDataTableFilterClause[] | ((prev: GraphDataTableFilterClause[]) => GraphDataTableFilterClause[]),
  ) =>
    set(state => ({
      graphDataTableFilterClauses: typeof updater === 'function' ? updater(state.graphDataTableFilterClauses) : updater,
    })),
  setGraphDataTableSortRules: (
    updater: GraphDataTableSortRule[] | ((prev: GraphDataTableSortRule[]) => GraphDataTableSortRule[]),
  ) =>
    set(state => ({
      graphDataTableSortRules: typeof updater === 'function' ? updater(state.graphDataTableSortRules) : updater,
    })),
  setGraphDataTableGroupKey: (key: GraphDataTableColumnKey | '') => set({ graphDataTableGroupKey: key }),
  setGraphDataTableAutoSortEnabled: (v: boolean) => set({ graphDataTableAutoSortEnabled: v }),
  setGraphDataTableRowDensity: (v: GraphDataTableRowDensity) => set({ graphDataTableRowDensity: v }),
  setGraphDataTableDisableAutoScroll: (v: boolean) => set({ graphDataTableDisableAutoScroll: v }),
  setGraphDataTableColumnWidth: (key: GraphDataTableColumnKey, width: number) =>
    set(state => ({ graphDataTableColumnWidths: { ...state.graphDataTableColumnWidths, [key]: width } })),
  setGraphDataTableFreezeFirstDataColumn: (scope: GraphDataTableScope, v: GraphDataTableFreezeMode) =>
    set(state => ({
      graphDataTableFreezeFirstDataColumn: scope === 'all' ? v : state.graphDataTableFreezeFirstDataColumn,
      graphDataTableFreezeFirstDataColumnByScope: { ...state.graphDataTableFreezeFirstDataColumnByScope, [scope]: v },
    })),
  setGraphDataTableAggregateDefaultVizMode: (v: 'none' | 'radial' | 'bars' | 'sparkline') =>
    set({ graphDataTableAggregateDefaultVizMode: v }),
  setGraphDataTableAggregateIncludeMixedNumericFields: (v: boolean) =>
    set({ graphDataTableAggregateIncludeMixedNumericFields: v }),
  setGraphDataTableAggregateIncludeIdAsNumeric: (v: boolean) => set({ graphDataTableAggregateIncludeIdAsNumeric: v }),
  setGraphDataTableAggregateIncludeSourceAsNumeric: (v: boolean) => set({ graphDataTableAggregateIncludeSourceAsNumeric: v }),
  setGraphDataTableAggregateIncludeTargetAsNumeric: (v: boolean) => set({ graphDataTableAggregateIncludeTargetAsNumeric: v }),
  setGraphDataTableNumericSampleLimit: (v: number) => set({ graphDataTableNumericSampleLimit: v }),
  setGraphDataTableNumericSampleMinCount: (v: number) => set({ graphDataTableNumericSampleMinCount: v }),
  setGraphDataTableNumericSampleMinRatio: (v: number) => set({ graphDataTableNumericSampleMinRatio: v }),
  setGraphDataTableFrozenDragStepNoneLabelPx: (v: number) => set({ graphDataTableFrozenDragStepNoneLabelPx: v }),
  setGraphDataTableFrozenDragStepLabelIdPx: (v: number) => set({ graphDataTableFrozenDragStepLabelIdPx: v }),
  setGraphDataTableVirtualOverscanRows: (v: number) => set({ graphDataTableVirtualOverscanRows: v }),
  setGraphDataTableOverscanMultiplier: (v: number) => set({ graphDataTableOverscanMultiplier: v }),
  setGraphDataTableVirtualMinRows: (v: number) => set({ graphDataTableVirtualMinRows: v }),
  setGraphDataTableVirtualDebugLogRanges: (v: boolean) => set({ graphDataTableVirtualDebugLogRanges: v }),
  setSelectionFlashDurationMs: (v: number) => {
    const n = Number.isFinite(v) ? Number(v) : 500;
    const clamped = n < 100 ? 100 : n > 2000 ? 2000 : n;
    set({ selectionFlashDurationMs: clamped });
  },
  setSelectionFlashOpacity: (v: number) => {
    const n = Number.isFinite(v) ? Number(v) : 0.18;
    const clamped = n < 0 ? 0 : n > 1 ? 1 : n;
    set({ selectionFlashOpacity: clamped });
  },
  setMarkdownSelectionFlashMode: (v: 'auto' | 'manual') => set({ markdownSelectionFlashMode: v }),

  setSpotlightMargin: (v: number) => {
    const n = Number.isFinite(v) ? Number(v) : 8;
    set({ spotlightMargin: n >= 0 ? n : 0 });
  },
  setSpotlightNearTopThreshold: (v: number) => {
    const n = Number.isFinite(v) ? Number(v) : 96;
    set({ spotlightNearTopThreshold: n >= 0 ? n : 0 });
  },
  setGraphId: (id: string) => set({ graphId: id }),
  setEnableTabSync: (v: boolean) => set({ enableTabSync: v }),
  setEnableVirtualTables: (v: boolean) => set({ enableVirtualTables: v }),
  setAiKgTraversalRan: (v: boolean) => set({ aiKgTraversalRan: !!v }),
  setRequestAiKgTraversal: (v: boolean) => set({ requestAiKgTraversal: !!v }),
  setLastTraversalSummary: (summary: TraversalSummary | null) => {
    const next = summary || null;
    set({ lastTraversalSummary: next });
  },
  youtubeTranscriptOutputDir: '.agentic-graph-workspace/youtube-transcripts',
  setYoutubeTranscriptOutputDir: (v: string | null) => set({ youtubeTranscriptOutputDir: v }),

  youtubeTranscriptOutputFormat: 'markdown' as const,
  setYoutubeTranscriptOutputFormat: (v: 'markdown' | 'json') => set({ youtubeTranscriptOutputFormat: v }),

  webpageImportIncludeImages: true,
  setWebpageImportIncludeImages: (v: boolean) => set({ webpageImportIncludeImages: v }),

  webpageImportView: 'html' as const,
  setWebpageImportView: (v: 'markdown' | 'json' | 'html') => set({ webpageImportView: v }),

  webpageViewerScriptPolicy: 'allow' as const,
  setWebpageViewerScriptPolicy: (v: 'strip' | 'allow') => set({ webpageViewerScriptPolicy: v === 'allow' ? 'allow' : 'strip' }),

  webpageArtifactFidelityMaxLevel: 4,
  setWebpageArtifactFidelityMaxLevel: (v: number) => {
    const n = Number.isFinite(v) ? Math.floor(Number(v)) : 4
    set({ webpageArtifactFidelityMaxLevel: n < 1 ? 1 : n > 4 ? 4 : n })
  },

  websiteImportDiscoverSitemap: true,
  setWebsiteImportDiscoverSitemap: (v: boolean) => set({ websiteImportDiscoverSitemap: !!v }),

  websiteImportGenerateWebpageArtifactDocs: true,
  setWebsiteImportGenerateWebpageArtifactDocs: (v: boolean) => set({ websiteImportGenerateWebpageArtifactDocs: !!v }),

  websiteImportMaxPages: 100,
  setWebsiteImportMaxPages: (v: number) => {
    const n = Number.isFinite(v) ? Math.floor(Number(v)) : 100
    set({ websiteImportMaxPages: n < 1 ? 1 : n > 500 ? 500 : n })
  },

  websiteImportConcurrency: 4,
  setWebsiteImportConcurrency: (v: number) => {
    const n = Number.isFinite(v) ? Math.floor(Number(v)) : 4
    set({ websiteImportConcurrency: n < 1 ? 1 : n > 12 ? 12 : n })
  },

  websiteImportOutputDirRel: 'agentic-graph-workspace/website-imports',
  setWebsiteImportOutputDirRel: (v: string) => set({ websiteImportOutputDirRel: String(v || '').trim() }),

  setPdfImportIncludeImages: (v: boolean) => set({ pdfImportIncludeImages: v }),
})
