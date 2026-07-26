import type { GraphData, GraphNode, GraphEdge, JSONValue } from '@/lib/graph/types'
import type { GraphSchema, GraphBehavior, PropertySpec } from '@/lib/graph/schema'
import type { ThemeMode, ResolvedThemeMode } from '@/lib/ui/theme'
import type { GraphFieldId, GraphFieldSettings, GraphFieldSettingsById } from '@/features/graph-fields/graphFields'
import type {
  GraphDataTableRowDensity,
} from '@/features/graph-data-table/graphDataTable'
import type { TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import type { MarkdownFrontmatter } from '@/lib/markdown'
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
import type { VersionHistoryEntry } from '@/features/history/versionHistoryTypes'

export interface GraphStateStructure {
  graphDataRevision: number;
  documentSemanticMode: DocumentSemanticMode;
  setDocumentSemanticMode: (mode: DocumentSemanticMode) => void;
  keywordSourceMaxLines: number;
  keywordSourceMaxChars: number;
  keywordGraphPreviewDebounceMs: number;
  keywordGraphFullDebounceMs: number;
  keywordGraphEdgesPerNode: number;
  keywordGraphMaxEdgesCap: number;
  keywordGraphMentionEdgesPerSourceNode: number;
  setKeywordSourceMaxLines: (v: number) => void;
  setKeywordSourceMaxChars: (v: number) => void;
  setKeywordGraphPreviewDebounceMs: (v: number) => void;
  setKeywordGraphFullDebounceMs: (v: number) => void;
  setKeywordGraphEdgesPerNode: (v: number) => void;
  setKeywordGraphMaxEdgesCap: (v: number) => void;
  setKeywordGraphMentionEdgesPerSourceNode: (v: number) => void;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedGroupId: string | null;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  selectedGroupIds: string[];
  collapsedGroupIds: string[];
  collapsedGroupIdsByGraphMetaKey: Record<string, string[]>;
  openWidgetNodeIds: string[];
  openWidgetNodeIdsByRenderer: Partial<Record<Canvas2dRendererId, string[]>>;
  flowWidgetPinnedByNodeId: Record<string, boolean>;
  flowWidgetPinnedByNodeIdByGraphMetaKey: Record<string, Record<string, boolean>>;
  flowWidgetPosByNodeId: Record<string, { top: number; left: number }>;
  flowWidgetPosByNodeIdByGraphMetaKey: Record<string, Record<string, { top: number; left: number }>>;
  flowWidgetWorldPosByNodeId: Record<string, { x: number; y: number }>;
  flowWidgetWorldPosByNodeIdByGraphMetaKey: Record<string, Record<string, { x: number; y: number }>>;
  flowWidgetDraggingNodeId: string | null;
  graphFieldsOpOk: boolean | null;
  graphFieldsOpMsg: string;
  orchestratorOpOk: boolean | null;
  orchestratorOpMsg: string;
  renderOpOk: boolean | null;
  renderOpMsg: string;
  selectionSource: null | 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown';
  setSelectionSource: (src: null | 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown') => void;
  setFlowWidgetPinnedByNodeId: (pinnedById: Record<string, boolean>) => void;
  setFlowWidgetPinnedByNodeIdForGraph: (graphMetaKey: string | null | undefined, pinnedById: Record<string, boolean>) => void;

  isEditMode: boolean;
  workspaceViewMode: WorkspaceViewMode;
  editorWorkspacePane: EditorWorkspacePane
  setEditorWorkspacePane: (pane: EditorWorkspacePane) => void
  workspaceCanvasPaneOpen: boolean
  markdownWorkspaceIndexingInFlight: boolean
  workspaceGraphMutationBlockUntilMs: number
  workspaceGraphMutationBlockKey: string
  workspaceGraphMutationLayoutLockActive: boolean
  setWorkspaceCanvasPaneOpen: (open: boolean) => void
  setMarkdownWorkspaceIndexingInFlight: (inFlight: boolean) => void
  setWorkspaceViewState: (next: { mode: WorkspaceViewMode; paneOpen?: boolean }) => void
  documentStructureBaselineLock: boolean;
  documentStructureBaselineSnapshot: DocumentStructureBaselineSnapshot | null
  setDocumentStructureBaselineLock: (enabled: boolean) => void;
  history: VersionHistoryEntry[];
  historyIndex: number;
  historyRestoreRevision: number;
  recentFiles: RecentFileEntry[];
  historyDebounceMs: number;
  schema: GraphSchema;
  schemaBySemanticMode?: SchemaBySemanticMode | null;
  layoutPositionCacheByMode: Partial<Record<LayoutPositionCacheKey, Record<string, NodePosition2d>>>;
  setLayoutPositionsForMode: (key: LayoutPositionCacheKey, positions: Record<string, NodePosition2d> | null) => void;
  schemaImportLabel: string | null;
  schemaOpOk: boolean | null;
  schemaOpMsg: string;
  graphValidationStatus: 'valid' | 'invalid' | null;
  graphValidationTimestamp: number | null;
  setGraphValidationResult: (status: 'valid' | 'invalid' | null, timestamp: number | null) => void;
  setSchemaImportLabel: (label: string | null) => void;
  setSchemaOpStatus: (ok: boolean | null, msg: string) => void;
  setGraphFieldsOpStatus: (ok: boolean | null, msg: string) => void;
  setOrchestratorOpStatus: (ok: boolean | null, msg: string) => void;
  setRenderOpStatus: (ok: boolean | null, msg: string) => void;

  widgetRegistry: WidgetRegistryEntry[]
  documentWidgetRegistry: WidgetRegistryEntry[]
  effectiveWidgetRegistry: WidgetRegistryEntry[]
  setWidgetRegistry: (entries: WidgetRegistryEntry[]) => void
  setDocumentWidgetRegistry: (
    entries: WidgetRegistryEntry[],
    options?: { graphData?: GraphData | null },
  ) => void
  upsertWidgetRegistryEntry: (
    entry: Omit<WidgetRegistryEntry, 'id' | 'updatedAt'> & { id?: string | null },
  ) => { ok: true; id: string } | { ok: false; message: string }
  removeWidgetRegistryEntry: (id: string) => void
  toggleWidgetRegistryEntryEnabled: (id: string, enabled?: boolean) => void

  designLayerState: DesignLayerState
  designLayerStateByGraphMetaKey: Record<string, DesignLayerState>
  setDesignLayerState: (next: DesignLayerState) => void
  normalizeDesignLayerStateFromNodes: (nodes: DesignLayerNode[]) => void
  toggleDesignLayerHidden: (id: string) => void
  moveDesignLayer: (id: string, dir: 'up' | 'down') => void

  designWireframeCacheEpoch: number
  bumpDesignWireframeCacheEpoch: () => void

  designRendererNodes: DesignLayerNode[]
  setDesignRendererNodes: (nodes: DesignLayerNode[]) => void

  designRendererWebpageLayoutKey: string | null
  designRendererGraphNodesById: Record<string, GraphNode>
  setDesignRendererWebpageGraph: (args: { key: string | null; nodesById: Record<string, GraphNode> }) => void

  designFramePosById: Record<string, DesignFramePos>
  designFramePosByIdByGraphMetaKey: Record<string, Record<string, DesignFramePos>>
  setDesignFramePos: (id: string, pos: DesignFramePos) => void
  setDesignFramePosMany: (patch: Record<string, DesignFramePos>) => void
  clearDesignFramePos: (id: string) => void
  clearAllDesignFramePos: () => void

  designFrameSizeById: Record<string, DesignFrameSize>
  designFrameSizeByIdByGraphMetaKey: Record<string, Record<string, DesignFrameSize>>
  setDesignFrameSize: (id: string, size: DesignFrameSize) => void
  setDesignFrameSizeMany: (patch: Record<string, DesignFrameSize>) => void
  clearDesignFrameSize: (id: string) => void
  clearAllDesignFrameSize: () => void
  lifecycleStage: 'idle' | 'reset' | 'hydrated' | 'committed' | 'rendering' | 'selectionUpdate' | 'edgeMutate' | 'zoomUpdate' | 'minimapQuick' | 'minimapAsync';
  setLifecycleStage: (stage: 'idle' | 'reset' | 'hydrated' | 'committed' | 'rendering' | 'selectionUpdate' | 'edgeMutate' | 'zoomUpdate' | 'minimapQuick' | 'minimapAsync') => void;
  setGraphData: (data: GraphData) => void;
  setGraphDataPreservingLayout: (data: GraphData) => void;
  resyncGraphFieldsFromGraphData: () => void;
  clearGraphData: () => void;
  updateNode: (id: string, updates: Partial<GraphNode>) => void;
  updateGraphMetadata: (updates: Record<string, JSONValue | undefined>) => void;
  flushComposedPositionWritesNow: () => void;
  updateEdge: (id: string, updates: Partial<GraphEdge>) => void;
  addNode: (node: GraphNode) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  createUserSubgraph: (args: { label?: string; memberNodeIds: string[]; parentId?: string | null; kind?: 'subgraph' | 'cluster' }) => { ok: true; id: string } | { ok: false; message: string };
  updateUserSubgraph: (id: string, patch: { label?: string; memberNodeIds?: string[]; parentId?: string | null; kind?: 'subgraph' | 'cluster' }) => { ok: true } | { ok: false; message: string };
  removeUserSubgraph: (id: string) => void;
  addNodesToUserSubgraph: (id: string, nodeIds: string[]) => { ok: true } | { ok: false; message: string };
  removeNodesFromUserSubgraph: (id: string, nodeIds: string[]) => { ok: true } | { ok: false; message: string };
  selectNode: (id: string | null) => void;
  toggleNodeSelectionAdditive: (id: string) => void;
  selectNodesExpanded: (args: { nodeIds: string[]; edgeIds?: string[]; groupIds?: string[]; activeNodeId?: string | null }) => void;
  selectEdge: (id: string | null) => void;
  selectGroup: (id: string | null) => void;
  selectGroupExpanded: (args: { id: string; nodeIds: string[]; edgeIds: string[] }) => void;
  setCollapsedGroupIds: (ids: string[]) => void;
  clearCollapsedGroups: () => void;
  toggleGroupCollapsed: (id: string) => void;
  setOpenWidgetNodeIds: (ids: string[]) => void;
  updateOpenWidgetNodeIds: (updater: (prev: string[]) => string[]) => void;
  setFlowWidgetPosByNodeId: (pos: Record<string, { top: number; left: number }>) => void;
  setFlowWidgetPosByNodeIdForGraph: (graphMetaKey: string | null | undefined, pos: Record<string, { top: number; left: number }>) => void;
  setFlowWidgetWorldPosByNodeId: (pos: Record<string, { x: number; y: number }>) => void;
  setFlowWidgetWorldPosByNodeIdForGraph: (graphMetaKey: string | null | undefined, pos: Record<string, { x: number; y: number }>) => void;
  setFlowWidgetDraggingNodeId: (id: string | null) => void;
  setEditMode: (mode: boolean) => void;
  setWorkspaceViewMode: (mode: WorkspaceViewMode) => void;
  toggleWorkspaceViewMode: () => void;
  addHistory: (label?: string) => void;
  addRecentFile: (entry: Omit<RecentFileEntry, 'id' | 'timestamp'>) => void;
  restoreHistory: (index: number) => void;
  undoHistory: () => void;
  redoHistory: () => void;
  scheduleHistory: (label: string) => void;
  setHistoryDebounceMs: (ms: number) => void;
  replaceHistoryState: (
    history: VersionHistoryEntry[],
    historyIndex: number,
  ) => void;
}
