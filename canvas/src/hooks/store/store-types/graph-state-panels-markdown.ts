import type { GraphData, GraphNode, GraphEdge, JSONValue } from '@/lib/graph/types'
import type { GraphSchema, GraphBehavior, PropertySpec } from '@/lib/graph/schema'
import type { ThemeMode, ResolvedThemeMode } from '@/lib/ui/theme'
import type { GraphFieldId, GraphFieldSettings, GraphFieldSettingsById } from '@/features/graph-fields/graphFields'
import type {
  GraphDataTableColumnKey,
  GraphDataTableColumnVisibilityByKey,
  GraphDataTableFilterClause,
  GraphDataTableFilterMatch,
  GraphDataTableRowDensity,
  GraphDataTableSortRule,
} from '@/features/graph-data-table/graphDataTable'
import type { TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import type { MarkdownFrontmatter } from '@/lib/markdown'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import type { ZoomCommandType, ZoomFitIntent, ZoomRequest } from '@/lib/zoom/requests'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { ViewportControlsPreset } from '@/lib/config.viewport-controls'
import type { Canvas2dRendererId, Canvas3dModeId, CanvasWorkspaceSyncMode, InfiniteCanvasInteractionMode } from '@/lib/config'
import type { DesignLayerNode, DesignLayerState } from '@/features/design/designLayersState'
import type { DesignFramePos, DesignFrameSize } from '@/hooks/store/designRendererSlice'
import type { SaveFilePickerHandle } from '@/lib/graph/save'
import type {
  BottomSurfaceTab,
  CanvasSnapshotFns,
  ChatExchangeLogEntry,
  ChatExchangeLogEntryInput,
  DesignSystemPageId,
  DocumentSemanticMode,
  DocumentStructureBaselineSnapshot,
  EditorWorkspacePane,
  GraphDataTableFreezeMode,
  GraphDataTableScope,
  GraphHoverPreviewConfig,
  LayoutPositionCacheKey,
  LocalMarkdownFolderAccessMode,
  MonacoCapabilityLoadMode,
  NodePosition2d,
  PdfImportOcrMode,
  PdfImportProvider,
  RecentFileEntry,
  SchemaBySemanticMode,
  SourceFile,
  ThreeCameraPose,
  ThreeCameraSnapshotFns,
  ThreeGlbSnapshotFns,
  ThreeLayoutSnapshotFns,
  UiLogEntry,
  UiLogEntryInput,
  UiToast,
  UiToastInput,
  WorkspaceViewMode,
} from './core'

export interface GraphStatePanelsMarkdown {
  autoEnableGeospatialOnGeoImport: boolean;
  setAutoEnableGeospatialOnGeoImport: (v: boolean) => void;

  pdfImportIncludeImages: boolean;
  pdfImportMaxPages: number;
  pdfImportMaxPdfBytes: number;
  pdfImportFetchTimeoutMs: number;
  pdfImportUploadTimeoutMs: number;
  pdfImportConvertTimeoutMs: number;
  pdfImportStreamDecodeCacheMaxBytes: number;
  pdfImportContentStreamMaxDecodeBytes: number;
  pdfImportPageContentMaxBytes: number;
  pdfImportCmapMaxBytes: number;
  pdfImportMaxToUnicodeStreamBytes: number;
  pdfImportToUnicodeMaxDecodeBytes: number;
  pdfImportImageStreamMaxDecodeBytes: number;
  pdfImportMaxTextContentBytesPerPage: number;
  pdfImportMaxTextStreamBytes: number;
  pdfImportMaxFormXObjectBytes: number;
  pdfImportMaxFormXObjectStreamBytes: number;
  pdfImportMaxFormXObjectCount: number;
  pdfImportEmbedImages: boolean;
  pdfImportMaxExtractedImagesPerPage: number;
  pdfImportMaxEmbeddedImagesPerPage: number;
  pdfImportMaxEmbeddedTotalBytes: number;
  pdfImportMaxEmbeddedAssetBytes: number;
  pdfImportReconstructTables: boolean;
  pdfImportTableMinColumns: number;
  pdfImportTableMinRows: number;
  pdfImportTableMaxRows: number;
  pdfImportProvider: PdfImportProvider;
  pdfImportDoclingEndpoint: string | null;
  pdfImportProviderFallbackToNative: boolean;
  pdfImportOcrEnabled: boolean;
  pdfImportOcrMode: PdfImportOcrMode;
  bottomSurfaceHeightRatio: number;
  bottomSurfaceCollapsed: boolean;
  floatingPanelWidthRatio: number;
  floatingPanelZIndex: number;
  bottomSurfaceTab: BottomSurfaceTab;
  requestedHistorySubTab: string | null;
  requestHistorySubTab: (subTab: string | null) => void;
  launchSpotlightMode: 'tour' | 'stats';
  enableLaunchSpotlight: boolean;
  statusPanelPinned: boolean;
  workspaceAutosaveEnabled: boolean;
  frontmatterModeEnabled: boolean;
  multiDimTableModeEnabled: boolean;
  schemaDeriveCacheCapacity: number;
  graphFieldSettingsById: GraphFieldSettingsById;
  selectedGraphFieldId: GraphFieldId | null;
  graphRagWorkflowJsonText: string | null;
  graphDataTableVisibleColumns: GraphDataTableColumnVisibilityByKey;
  graphDataTableColumnOrder: GraphDataTableColumnKey[];
  graphDataTableAggregateKeys: GraphDataTableColumnKey[];
  graphDataTableFilterMatch: GraphDataTableFilterMatch;
  graphDataTableFilterClauses: GraphDataTableFilterClause[];
  graphDataTableSortRules: GraphDataTableSortRule[];
  graphDataTableGroupKey: GraphDataTableColumnKey | '';
  graphDataTableAutoSortEnabled: boolean;
  graphDataTableRowDensity: GraphDataTableRowDensity;
  graphDataTableDisableAutoScroll: boolean;
  graphDataTableColumnWidths: Partial<Record<GraphDataTableColumnKey, number>>;
  graphDataTableFreezeFirstDataColumn: GraphDataTableFreezeMode;
  graphDataTableFreezeFirstDataColumnByScope: Record<GraphDataTableScope, GraphDataTableFreezeMode>;
  graphDataTableAggregateDefaultVizMode: 'none' | 'radial' | 'bars' | 'sparkline';
  graphDataTableAggregateIncludeMixedNumericFields: boolean;
  graphDataTableAggregateIncludeIdAsNumeric: boolean;
  graphDataTableAggregateIncludeSourceAsNumeric: boolean;
  graphDataTableAggregateIncludeTargetAsNumeric: boolean;
  graphDataTableNumericSampleLimit: number;
  graphDataTableNumericSampleMinCount: number;
  graphDataTableNumericSampleMinRatio: number;
  spotlightMargin: number;
  spotlightNearTopThreshold: number;
  graphDataTableFrozenDragStepNoneLabelPx: number;
  graphDataTableFrozenDragStepLabelIdPx: number;
  graphDataTableVirtualOverscanRows: number;
  graphDataTableOverscanMultiplier: number;
  graphDataTableVirtualMinRows: number;
  graphDataTableVirtualDebugLogRanges: boolean;
  graphHoverPreviewConfig: GraphHoverPreviewConfig;
  setGraphHoverPreviewConfig: (config: Partial<GraphHoverPreviewConfig>) => void;
  markdownDocumentName: string | null;
  markdownDocumentText: string | null;
  markdownDocumentApplyViewPreset: boolean;
  markdownDocumentApplyRevision: number;
  markdownTokens: TokenWithLines[] | null;
  markdownTokensPath: string | null;
  markdownTokensKey: string | null;
  markdownTokensMeta: MarkdownFrontmatter | null;
  markdownTokensStartLineOffset: number | null;
  markdownDocumentSourceUrl: string | null;
  jsonSourceDocumentName: string | null;
  jsonSourceDocumentText: string | null;
  markdownPreviewMermaidFocusCode: string | null;
  markdownPreviewMermaidFocusConfig: Record<string, unknown> | null;
  markdownPreviewActiveMediaKey: string | null;
  setMarkdownTokens: (args: {
    tokens: TokenWithLines[] | null
    path?: string | null
    key?: string | null
    meta?: MarkdownFrontmatter | null
    startLineOffset?: number | null
  }) => void;
  setUiIconScale: (scale: 'compact' | 'default') => void;
  setUiOverlayOpacity: (v: number) => void;
  setUiPanelOpacity: (v: number) => void;
  setUiToolbarOpacity: (v: number) => void;
  setMediaNodeOpacity: (v: number) => void;
  setChatProvider: (provider: string) => void;
  setChatApiKey: (apiKey: string | null) => void;
  setChatEndpointUrl: (url: string | null) => void;
  setChatModel: (model: string | null) => void;
  setChatTemperature: (v: number) => void;
  setChatSystemPrompt: (v: string | null) => void;
  setIntegrationConfigsJson: (v: string | null) => void;

  setPdfImportIncludeImages: (v: boolean) => void;
  setPdfImportMaxPages: (v: number) => void;
  setPdfImportMaxPdfBytes: (v: number) => void;
  setPdfImportFetchTimeoutMs: (v: number) => void;
  setPdfImportUploadTimeoutMs: (v: number) => void;
  setPdfImportConvertTimeoutMs: (v: number) => void;
  setPdfImportStreamDecodeCacheMaxBytes: (v: number) => void;
  setPdfImportContentStreamMaxDecodeBytes: (v: number) => void;
  setPdfImportPageContentMaxBytes: (v: number) => void;
  setPdfImportCmapMaxBytes: (v: number) => void;
  setPdfImportMaxToUnicodeStreamBytes: (v: number) => void;
  setPdfImportToUnicodeMaxDecodeBytes: (v: number) => void;
  setPdfImportImageStreamMaxDecodeBytes: (v: number) => void;
  setPdfImportMaxTextContentBytesPerPage: (v: number) => void;
  setPdfImportMaxTextStreamBytes: (v: number) => void;
  setPdfImportMaxFormXObjectBytes: (v: number) => void;
  setPdfImportMaxFormXObjectStreamBytes: (v: number) => void;
  setPdfImportMaxFormXObjectCount: (v: number) => void;
  setPdfImportEmbedImages: (v: boolean) => void;
  setPdfImportMaxExtractedImagesPerPage: (v: number) => void;
  setPdfImportMaxEmbeddedImagesPerPage: (v: number) => void;
  setPdfImportMaxEmbeddedTotalBytes: (v: number) => void;
  setPdfImportMaxEmbeddedAssetBytes: (v: number) => void;
  setPdfImportReconstructTables: (v: boolean) => void;
  setPdfImportTableMinColumns: (v: number) => void;
  setPdfImportTableMinRows: (v: number) => void;
  setPdfImportTableMaxRows: (v: number) => void;
  setPdfImportProvider: (v: PdfImportProvider) => void;
  setPdfImportDoclingEndpoint: (v: string | null) => void;
  setPdfImportProviderFallbackToNative: (v: boolean) => void;
  setPdfImportOcrEnabled: (v: boolean) => void;
  setPdfImportOcrMode: (v: PdfImportOcrMode) => void;
  setBottomSurfaceHeightRatio: (v: number) => void;
  setBottomSurfaceCollapsed: (v: boolean) => void;
  setFloatingPanelWidthRatio: (v: number) => void;
  setFloatingPanelZIndex: (v: number) => void;
  setBottomSurfaceTab: (tab: BottomSurfaceTab) => void;
  setLaunchSpotlightMode: (mode: 'tour' | 'stats') => void;
  setEnableLaunchSpotlight: (v: boolean) => void;
  setStatusPanelPinned: (v: boolean) => void;
  setWorkspaceAutosaveEnabled: (v: boolean) => void;
  setFrontmatterModeEnabled: (enabled: boolean) => void;
  setMultiDimTableModeEnabled: (enabled: boolean) => void;
  setSchemaDeriveCacheCapacity: (n: number) => void;
  setGraphFieldSettingsById: (next: GraphFieldSettingsById) => void;
  patchGraphFieldSetting: (fieldId: GraphFieldId, patch: Partial<GraphFieldSettings>) => void;
  removeGraphFieldSetting: (fieldId: GraphFieldId) => void;
  setSelectedGraphFieldId: (id: GraphFieldId | null) => void;
  setGraphRagWorkflowJsonText: (text: string | null) => void;
  setGraphDataTableVisibleColumns: (next: GraphDataTableColumnVisibilityByKey) => void;
  setGraphDataTableColumnOrder: (next: GraphDataTableColumnKey[]) => void;
  setGraphDataTableAggregateKeys: (next: GraphDataTableColumnKey[]) => void;
  setGraphDataTableFilterMatch: (match: GraphDataTableFilterMatch) => void;
  setGraphDataTableFilterClauses: (
    updater: GraphDataTableFilterClause[] | ((prev: GraphDataTableFilterClause[]) => GraphDataTableFilterClause[]),
  ) => void;
  setGraphDataTableSortRules: (
    updater: GraphDataTableSortRule[] | ((prev: GraphDataTableSortRule[]) => GraphDataTableSortRule[]),
  ) => void;
  setGraphDataTableGroupKey: (key: GraphDataTableColumnKey | '') => void;
  setGraphDataTableAutoSortEnabled: (v: boolean) => void;
  setGraphDataTableRowDensity: (v: GraphDataTableRowDensity) => void;
  setGraphDataTableDisableAutoScroll: (v: boolean) => void;
  setGraphDataTableColumnWidth: (key: GraphDataTableColumnKey, width: number) => void;
  setGraphDataTableFreezeFirstDataColumn: (scope: GraphDataTableScope, v: GraphDataTableFreezeMode) => void;
  setGraphDataTableAggregateDefaultVizMode: (v: 'none' | 'radial' | 'bars' | 'sparkline') => void;
  setGraphDataTableAggregateIncludeMixedNumericFields: (v: boolean) => void;
  setGraphDataTableAggregateIncludeIdAsNumeric: (v: boolean) => void;
  setGraphDataTableAggregateIncludeSourceAsNumeric: (v: boolean) => void;
  setGraphDataTableAggregateIncludeTargetAsNumeric: (v: boolean) => void;
  setGraphDataTableNumericSampleLimit: (v: number) => void;
  setGraphDataTableNumericSampleMinCount: (v: number) => void;
  setGraphDataTableNumericSampleMinRatio: (v: number) => void;
  setSpotlightMargin: (v: number) => void;
  setSpotlightNearTopThreshold: (v: number) => void;
  setGraphDataTableFrozenDragStepNoneLabelPx: (v: number) => void;
  setGraphDataTableFrozenDragStepLabelIdPx: (v: number) => void;
  setGraphDataTableVirtualOverscanRows: (v: number) => void;
  setGraphDataTableOverscanMultiplier: (v: number) => void;
  setGraphDataTableVirtualMinRows: (v: number) => void;
  setGraphDataTableVirtualDebugLogRanges: (v: boolean) => void;
  setMarkdownDocument: (
    name: string | null,
    text: string | null,
    opts?: { autoEnableFrontmatter?: boolean; applyViewPreset?: boolean; forceRevision?: boolean },
  ) => void;
  setActiveMarkdownDocument: (args: {
    name: string
    text: string
    sourceUrl?: string | null
    jsonSourceText?: string | null
    canonicalMarkdownText?: string | null
    expectedCurrentDocumentName?: string | null
    expectedCurrentDocumentText?: string | null
    autoEnableFrontmatter?: boolean
    applyViewPreset?: boolean
    recent?: Omit<RecentFileEntry, 'id' | 'timestamp'> | null
    applyToGraph?: boolean
    forceApplyToGraph?: boolean; canvasWorkspacePreset?: CanvasWorkspaceFrontmatterPreset | null
    normalizeMermaidMmd?: boolean
  }) => Promise<boolean>
  applyMarkdownDocumentToGraph: (
    name: string,
    text: string,
    opts?: { force?: boolean; preset?: CanvasWorkspaceFrontmatterPreset | null; applyViewPreset?: boolean; requireActiveMarkdownDocument?: boolean },
  ) => Promise<boolean>;
  setJsonSourceDocument: (name: string | null, text: string | null) => void;
  setMarkdownDocumentSourceUrl: (url: string | null) => void;
  setMarkdownPreviewMermaidFocus: (
    focus: { code: string; frontmatterConfig: Record<string, unknown> | null } | null,
  ) => void;
  setMarkdownPreviewActiveMediaKey: (key: string | null) => void;
  setUiPanelKeyValueTextSizeClass: (className: string) => void;
  setUiPanelTextFontClass: (className: string) => void;
  setUiPanelKeyValueInputClass: (className: string) => void;
  setUiPanelRowDensityDefaultClass: (className: string) => void;
  setUiPanelRowDensityCompactClass: (className: string) => void;
  setUiPanelMonospaceTextClass: (className: string) => void;
  setUiPanelMicroLabelTextSizeClass: (className: string) => void;
  setUiHeaderRowHeightClass: (className: string) => void;
  setUiHeaderRowPaddingClass: (className: string) => void;
  setUiSectionHeaderRowHeightClass: (className: string) => void;
  setUiSectionHeaderRowPaddingClass: (className: string) => void;
  setUiIconFormat: (format: 'default' | 'minimal' | '1') => void;
  setUiIconStrokeWidth: (width: number) => void;
  setUiIconColorClass: (className: string) => void;
  setUiIconHoverBgClass: (className: string) => void;
  setUiIconButtonPaddingClass: (className: string) => void;
  setUiIconPillClass: (className: string) => void;
  setUiIconPillLegendTextSizeClass: (className: string) => void;
  setUiIconPillBadgeTextSizeClass: (className: string) => void;
  setUiIconBadgeChipClass: (className: string) => void;
  setUiIconBadgeChipTextSizeClass: (className: string) => void;
  setUiIconAnimationEnabled: (v: boolean) => void;
  setSelectionFlashDurationMs: (v: number) => void;
  setSelectionFlashOpacity: (v: number) => void;
  setMarkdownSelectionFlashMode: (v: 'auto' | 'manual') => void;
}
