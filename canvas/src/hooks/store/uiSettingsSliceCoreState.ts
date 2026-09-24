
import type { StoreApi } from 'zustand'
import type { BottomSurfaceTab, DocumentSemanticMode, GraphDataTableFreezeMode, GraphDataTableScope, GraphHoverPreviewConfig, GraphState } from './types'
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
import { applyThemeMode, getSystemTheme, persistDarkThemeVariant, persistThemeMode, resolveThemeMode, type DarkThemeVariant, type ResolvedThemeMode, type ThemeMode } from '@/lib/ui/theme'
import { getLocalStorage } from '@/lib/persistence'
import { readInitialSessionTabId } from './uiSettingsSliceSession'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

type KeywordDefaults = {
  sourceMaxLines: number
  sourceMaxChars: number
  previewDebounceMs: number
  fullDebounceMs: number
  edgesPerNode: number
  maxEdgesCap: number
  mentionEdgesPerSourceNode: number
}

export const createUiSettingsCoreState = (
  set: SetGraph,
  get: GetGraph,
  themeMode: ThemeMode,
  darkThemeVariant: DarkThemeVariant,
  resolvedThemeMode: ResolvedThemeMode,
  keywordDefaults: KeywordDefaults,
)=> ({
  themeMode,
  darkThemeVariant,
  resolvedThemeMode,
  setThemeMode: (mode: ThemeMode) => {
    persistThemeMode(getLocalStorage(), mode);
    applyThemeMode(mode, get().darkThemeVariant);
    set({ themeMode: mode, resolvedThemeMode: resolveThemeMode(mode) });
  },
  setDarkThemeVariant: (variant: DarkThemeVariant) => {
    persistDarkThemeVariant(getLocalStorage(), variant);
    applyThemeMode(get().themeMode, variant);
    set({ darkThemeVariant: variant });
  },
  refreshResolvedThemeModeFromSystem: () => {
    set((state) => {
      if (state.themeMode !== 'system') return {} as Partial<GraphState>;
      const next = getSystemTheme();
      applyThemeMode('system', state.darkThemeVariant);
      if (state.resolvedThemeMode === next) return {} as Partial<GraphState>;
      return { resolvedThemeMode: next };
    });
  },
  selectionFlashDurationMs: 500,
  selectionFlashOpacity: 0.18,
  markdownSelectionFlashMode: 'auto' as const,
  bottomSurfaceHeightRatio: 0.35,
  floatingPanelWidthRatio: 0.3,
  floatingPanelZIndex: 40,
  bottomSurfaceTab: 'stats' as BottomSurfaceTab,
  frontmatterModeEnabled: true,
  multiDimTableModeEnabled: false,
  documentSemanticMode: 'document' as DocumentSemanticMode,
  keywordSourceMaxLines: keywordDefaults.sourceMaxLines,
  keywordSourceMaxChars: keywordDefaults.sourceMaxChars,
  keywordGraphPreviewDebounceMs: keywordDefaults.previewDebounceMs,
  keywordGraphFullDebounceMs: keywordDefaults.fullDebounceMs,
  keywordGraphEdgesPerNode: keywordDefaults.edgesPerNode,
  keywordGraphMaxEdgesCap: keywordDefaults.maxEdgesCap,
  keywordGraphMentionEdgesPerSourceNode: keywordDefaults.mentionEdgesPerSourceNode,
  schemaDeriveCacheCapacity: 50,
  graphFieldSettingsById: {} as GraphFieldSettingsById,
  selectedGraphFieldId: null as GraphFieldId | null,
  graphRagWorkflowJsonText: null as string | null,
  graphDataTableVisibleColumns: {} as GraphDataTableColumnVisibilityByKey,
  graphDataTableColumnOrder: [] as GraphDataTableColumnKey[],
  graphDataTableAggregateKeys: [] as GraphDataTableColumnKey[],
  graphDataTableFilterMatch: 'all' as GraphDataTableFilterMatch,
  graphDataTableFilterClauses: [] as GraphDataTableFilterClause[],
  graphDataTableSortRules: [] as GraphDataTableSortRule[],
  graphDataTableGroupKey: '' as GraphDataTableColumnKey | '',
  graphDataTableAutoSortEnabled: true,
  graphDataTableRowDensity: 'standard' as GraphDataTableRowDensity,
  graphDataTableDisableAutoScroll: false,
  graphDataTableColumnWidths: {},
  graphDataTableFreezeFirstDataColumn: 'none' as GraphDataTableFreezeMode,
  graphDataTableFreezeFirstDataColumnByScope: {
    all: 'none',
    nodes: 'none',
    edges: 'none',
  } as Record<GraphDataTableScope, GraphDataTableFreezeMode>,
  graphDataTableAggregateDefaultVizMode: 'none' as const,
  graphDataTableAggregateIncludeMixedNumericFields: false,
  graphDataTableAggregateIncludeIdAsNumeric: false,
  graphDataTableAggregateIncludeSourceAsNumeric: false,
  graphDataTableAggregateIncludeTargetAsNumeric: false,
  graphDataTableNumericSampleLimit: 100,
  graphDataTableNumericSampleMinCount: 5,
  graphDataTableNumericSampleMinRatio: 0.8,
  spotlightMargin: 8,
  spotlightNearTopThreshold: 96,
  graphDataTableFrozenDragStepNoneLabelPx: 120,
  graphDataTableFrozenDragStepLabelIdPx: 200,
  graphDataTableVirtualOverscanRows: 5,
  graphDataTableOverscanMultiplier: 1.5,
  graphDataTableVirtualMinRows: 10,
  graphDataTableVirtualDebugLogRanges: false,
  graphHoverPreviewConfig: {
    showNodeId: false,
    showNodeName: true,
    showNodeLabel: true,
    showNodeDescription: true,
    showNodeProperties: true,
    showEdgeId: false,
    showEdgeLabel: true,
    showEdgeWeight: true,
    showEdgeProperties: true,
  },
  setGraphHoverPreviewConfig: (config: Partial<GraphHoverPreviewConfig>) =>
    set((state) => ({
      graphHoverPreviewConfig: { ...state.graphHoverPreviewConfig, ...config },
    })),
  graphId: 'default',
  tabId: readInitialSessionTabId(),
  enableTabSync: true,
  enableVirtualTables: true,
  aiKgTraversalRan: false,
  requestAiKgTraversal: false,
  schemaLastExportHash: null as string | null,
  schemaLintCount: null as number | null,
  schemaLintExamplePath: null as string | null,
  schemaLintExamplePaths: null as string[] | null,
  lastTraversalSummary: null as TraversalSummary | null,

})
