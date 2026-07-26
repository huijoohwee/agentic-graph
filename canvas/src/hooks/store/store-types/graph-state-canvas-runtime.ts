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
import type { Canvas2dRendererId, Canvas3dModeId, CanvasRunMode, CanvasWorkspaceSyncMode, InfiniteCanvasInteractionMode } from '@/lib/config'
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

export interface GraphStateCanvasRuntime {
  canvasDims: { w: number; h: number };
  canvasPos: { x: number; y: number };
  setCanvasDims: (d: { w: number; h: number }) => void;
  setCanvasPos: (p: { x: number; y: number }) => void;
  viewPinned: boolean;
  setViewPinned: (v: boolean) => void;
  toggleViewPinned: () => void;
  fitToScreenMode: boolean;
  setFitToScreenMode: (v: boolean) => void;
  toggleFitToScreenMode: () => void;
  zoomToSelectionMode: boolean;
  setZoomToSelectionMode: (v: boolean) => void;
  toggleZoomToSelectionMode: () => void;
  zoomRequest: ZoomRequest | null;
  requestZoom: (type: ZoomCommandType, opts?: { intent?: ZoomFitIntent }) => void;
  requestZoomTransform: (payload: { k: number; x: number; y: number }) => void;
  requestZoomBounds: (payload: { bounds: { x: number; y: number; w: number; h: number }; insetPx?: number; origin?: { x: number; y: number } }) => void;
  clearZoomRequest: () => void;

  canvasPointerMode2d: 'select' | 'pan';
  canvasPointerMode2dByRenderer: Partial<Record<Canvas2dRendererId, 'select' | 'pan'>>;
  setCanvasPointerMode2d: (mode: 'select' | 'pan') => void;

  graphCanvasArrangeRequest: null | (
    | { type: 'center'; scope: 'selection' | 'all'; at: number }
    | { type: 'distribute'; axis: 'x' | 'y'; at: number }
  );
  requestGraphCanvasArrange: (req: { type: 'center'; scope: 'selection' | 'all' } | { type: 'distribute'; axis: 'x' | 'y' }) => void;
  clearGraphCanvasArrangeRequest: () => void;

  storyboardWidgetLayoutRebalanceRequest: null | { type: 'balanced-spread'; at: number };
  requestStoryboardWidgetLayoutRebalance: () => void;
  clearStoryboardWidgetLayoutRebalanceRequest: () => void;
  zoomState: null | { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number };
  setZoomState: (z: { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }) => void;
  zoomStateByKey: Record<string, { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }>
  setZoomStateForKey: (
    key: string,
    z: { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number } | null,
  ) => void
  threeCameraRequest: null | { type: 'in' | 'out' | 'fit' | 'reset' | 'selection'; at: number };
  requestThreeCamera: (type: 'in' | 'out' | 'fit' | 'reset' | 'selection') => void;
  clearThreeCameraRequest: () => void;
  edgeCreationRequest: null | { type: 'create' | 'update-source' | 'update-target'; fromId: string; at: number };
  requestEdgeCreation: (req: { type: 'create' | 'update-source' | 'update-target'; fromId: string }) => void;
  clearEdgeCreationRequest: () => void;
  minimapPreview: { nodesPath: string; edgesPath: string; sx: number; bounds: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } };
  minimapAbortController: AbortController | null;
  cancelMinimapWorker: () => void;
  computeMinimapPreviewQuick: () => void;
  computeMinimapPreviewAsync: () => void;
  setSchema: (schema: GraphSchema) => void;
  updateNodeStyle: (type: string, style: Partial<{ color: string }>) => void;
  updateEdgeStyle: (label: string, style: Partial<GraphSchema['edgeStyles'][string]>) => void;
  setBehavior: (b: Partial<GraphBehavior>) => void;
  updateNodeSize: (type: string, size: Partial<{ radius: number }>) => void;
  updateNodeStroke: (type: string, stroke: Partial<{ color: string; width: number }>) => void;
  setLabelStyles: (styles: Partial<{ fontSize: number; color: string }>) => void;
  setLabelOffset: (off: Partial<{ dx: number; dy: number }>) => void;
  setLinkDistanceByLabel: (label: string, dist: number) => void;
  setCharge: (val: number) => void;
  setCollisionByType: (type: string, radius: number) => void;
  setAlphaDecay: (val: number) => void;
  setThreeConfig: (cfg: Partial<GraphSchema['three']>) => void;
  upsertNodeValidation: (type: string, v: Partial<{ required?: string[]; types?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>; patterns?: Record<string, string>; ranges?: Record<string, { min?: number; max?: number }>; uniqueness?: string[]; severity?: 'error' | 'warn' }>) => void;
  upsertEdgeValidation: (label: string, v: Partial<{ required?: string[]; types?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>; patterns?: Record<string, string>; ranges?: Record<string, { min?: number; max?: number }>; uniqueness?: string[]; severity?: 'error' | 'warn' }>) => void;
  setEndpointMatrix: (label: string, sources: string[], targets: string[]) => void;
  setCardinalityNodeType: (type: string, minEdges?: number, maxEdges?: number) => void;
  setCardinalityEdgeLabel: (label: string, maxPerNode?: number) => void;
  setNodeTemplate: (type: string, tpl: Record<string, JSONValue>) => void;
  setEdgeTemplate: (label: string, tpl: Record<string, JSONValue>) => void;
  setLodHideLabelsBelow: (scale: number) => void;
  setHighContrast: (v: boolean) => void;
  setNodeShape: (type: string, shape: 'circle' | 'rect' | 'diamond' | 'hex' | 'image') => void;
  setEdgeArrow: (label: string, arrow: boolean) => void;
  setSelectMode: (mode: 'single' | 'multi' | 'lasso') => void;
  setCreateMode: (mode: 'shift-drag' | 'click-source-target' | 'panel-only') => void;
  setHover: (v: Partial<{ intensity: number; debounceMs: number }>) => void;
  setSerialization: (v: Partial<GraphSchema['serialization']>) => void;
  addNodeType: (type: string) => void;
  renameNodeType: (oldType: string, newType: string) => void;
  removeNodeType: (type: string) => void;
  addEdgeLabel: (label: string) => void;
  renameEdgeLabel: (oldLabel: string, newLabel: string) => void;
  removeEdgeLabel: (label: string) => void;
  upsertNodeProperty: (type: string, key: string, spec: PropertySpec) => void;
  removeNodeProperty: (type: string, key: string) => void;
  upsertEdgeProperty: (label: string, key: string, spec: PropertySpec) => void;
  removeEdgeProperty: (label: string, key: string) => void;
  graphId: string;
  tabId: string;
  enableTabSync: boolean;
  enableVirtualTables: boolean;
  aiKgTraversalRan: boolean;
  requestAiKgTraversal: boolean;
  schemaLastExportHash: string | null;
  schemaLintCount: number | null;
  schemaLintExamplePath: string | null;
  schemaLintExamplePaths: string[] | null;
  setGraphId: (id: string) => void;
  setEnableTabSync: (v: boolean) => void;
  setEnableVirtualTables: (v: boolean) => void;
  setAiKgTraversalRan: (v: boolean) => void;
  setRequestAiKgTraversal: (v: boolean) => void;
  lastTraversalSummary: TraversalSummary | null;
  setLastTraversalSummary: (summary: TraversalSummary | null) => void;
  setSchemaLastExportSnapshot: (schema: GraphSchema | null) => void;
  setSchemaLintSummary: (count: number, examplePath: string | null, examplePaths?: string[] | null) => void;
  setSchemaLintActivePath: (examplePath: string | null) => void;
  clearSchemaLintSummary: () => void;
  canvasRenderMode: '2d' | '3d';
  canvas3dMode: Canvas3dModeId;
  canvas2dRenderer: Canvas2dRendererId;
  viewportControlsPreset: ViewportControlsPreset;
  infiniteCanvasInteractionMode: InfiniteCanvasInteractionMode;
  canvasWorkspaceSyncMode: CanvasWorkspaceSyncMode;
  canvasRunMode: CanvasRunMode;
  storyboardWidgetSelectionOnDrag: boolean;
  storyboardWidgetOverlayWheelProxyEnabled: boolean;
  flowWheelZoomSpeedMultiplier: number;
  flowWheelZoomIncrementMultiplier: number;
  flowWheelZoomSmoothMinDurationMs: number;
  flowWheelZoomSmoothMaxDurationMs: number;
  zoomDurationFitMs: number;
  zoomDurationSelectionMs: number;
  wheelZoomCtrlMetaBoostMultiplier: number;
  viewportFitFillRatio: number;
  viewportFitReferenceWidth: number;
  viewportFitReferenceHeight: number;
  frontmatterFlowInitialFitFillRatio: number;
  frontmatterFlowOverlayFitProxyScalePhone: number;
  frontmatterFlowOverlayFitProxyScaleTablet: number;
  frontmatterFlowOverlayFitProxyScaleLaptop: number;
  frontmatterFlowOverlayFitProxyScaleDesktop: number;
  graphDragAlphaTarget2d: number;
  canvasInteractionSpeedMultiplier: number;
  canvasPanSpeedMultiplier: number;
  canvasRenderModeLastFree: '2d' | '3d';
  canvasRenderModeIsAuto: boolean;
  setCanvasRenderMode: (m: '2d' | '3d') => void;
  setCanvas3dMode: (m: Canvas3dModeId) => void;
  setCanvas2dRenderer: (id: Canvas2dRendererId) => void;
  setViewportControlsPreset: (preset: ViewportControlsPreset) => void;
  setInfiniteCanvasInteractionMode: (mode: InfiniteCanvasInteractionMode) => void;
  setCanvasWorkspaceSyncMode: (mode: CanvasWorkspaceSyncMode) => void;
  setCanvasRunMode: (mode: CanvasRunMode) => void;
  setStoryboardWidgetSelectionOnDrag: (v: boolean) => void;
  setStoryboardWidgetOverlayWheelProxyEnabled: (v: boolean) => void;
  setFlowWheelZoomSpeedMultiplier: (v: number) => void;
  setFlowWheelZoomIncrementMultiplier: (v: number) => void;
  setFlowWheelZoomSmoothMinDurationMs: (v: number) => void;
  setFlowWheelZoomSmoothMaxDurationMs: (v: number) => void;
  setZoomDurationFitMs: (v: number) => void;
  setZoomDurationSelectionMs: (v: number) => void;
  setWheelZoomCtrlMetaBoostMultiplier: (v: number) => void;
  setViewportFitFillRatio: (v: number) => void;
  setViewportFitReferenceWidth: (v: number) => void;
  setViewportFitReferenceHeight: (v: number) => void;
  setFrontmatterFlowInitialFitFillRatio: (v: number) => void;
  setFrontmatterFlowOverlayFitProxyScalePhone: (v: number) => void;
  setFrontmatterFlowOverlayFitProxyScaleTablet: (v: number) => void;
  setFrontmatterFlowOverlayFitProxyScaleLaptop: (v: number) => void;
  setFrontmatterFlowOverlayFitProxyScaleDesktop: (v: number) => void;
  setGraphDragAlphaTarget2d: (v: number) => void;
  setCanvasInteractionSpeedMultiplier: (v: number) => void;
  setCanvasPanSpeedMultiplier: (v: number) => void;
  resetAll: () => void;
  canvasSnapshotFns: { '2d'?: CanvasSnapshotFns; '3d'?: CanvasSnapshotFns };
  registerCanvasSnapshotFns: (mode: '2d' | '3d', fns: CanvasSnapshotFns | null) => void;
  captureCanvasPngSnapshot: (mode?: '2d' | '3d', pixelRatio?: number) => Promise<Blob | null>;
  captureCanvasSvgSnapshot: (mode?: '2d' | '3d') => Promise<string | null>;
  threeCameraSnapshotFns: ThreeCameraSnapshotFns | null;
  registerThreeCameraSnapshotFns: (fns: ThreeCameraSnapshotFns | null) => void;
  captureThreeCameraPose: () => ThreeCameraPose | null;
  restoreThreeCameraPose: (pose: ThreeCameraPose | null) => void;
  threeGlbSnapshotFns: ThreeGlbSnapshotFns | null;
  registerThreeGlbSnapshotFns: (fns: ThreeGlbSnapshotFns | null) => void;
  captureThreeGlbSnapshot: () => Promise<Blob | null>;
  captureThreeGltfSnapshot: () => Promise<Blob | null>;

  threeLayoutSnapshotFns: ThreeLayoutSnapshotFns | null;
  registerThreeLayoutSnapshotFns: (fns: ThreeLayoutSnapshotFns | null) => void;
  captureThreeLayoutPositions: () => Record<string, [number, number, number]> | null;
}
