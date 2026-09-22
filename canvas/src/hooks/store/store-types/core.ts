import type { GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { Canvas2dRendererId, Canvas3dModeId } from '@/lib/config'
import type { LayoutMode2d } from '@/lib/graph/layoutMode'

export type DesignSystemPageId = 'hub' | 'tokens' | 'utilities'
export type MonacoCapabilityLoadMode = 'lazy' | 'eager'

export type DesignSystemSlice = {
  designSystemRequestedPage: DesignSystemPageId | null
  setDesignSystemRequestedPage: (page: DesignSystemPageId | null) => void
}

export type CanvasVideoCaptureOptions = {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}
export type CanvasVideoCaptureResult =
  | { status: 'unsupported'; reason: string }
  | { status: 'captured'; blob: Blob; evidence: {
      durationSeconds: number; decodedFrames: number; renderedFrames: number; width: number; height: number; sampleHashes: string[]
    } }

export type CanvasSnapshotFns = {
  captureVideo?: (options: CanvasVideoCaptureOptions) => Promise<CanvasVideoCaptureResult>;
  capturePng?: (pixelRatio?: number) => Promise<Blob | null>;
  captureSvg?: () => Promise<string | null>;
};

export type ThreeCameraPose = {
  position: { x: number; y: number; z: number }
  quaternion: { x: number; y: number; z: number; w: number }
  target: { x: number; y: number; z: number }
  fov?: number
  zoom?: number
}

export type ThreeCameraSnapshotFns = {
  capturePose: () => ThreeCameraPose | null
  restorePose: (pose: ThreeCameraPose) => void
}

export type ThreeGlbSnapshotFns = {
  captureGlb: () => Promise<Blob | null>
  captureGltf?: () => Promise<Blob | null>
}

export type ThreeLayoutSnapshotFns = {
  capturePositions: () => Record<string, [number, number, number]> | null
}

export type GraphDataTableScope = 'all' | 'nodes' | 'edges';

export type GraphDataTableFreezeMode = 'none' | 'label' | 'id';

export type LayoutMode = LayoutMode2d;
export type NodePosition2d = { x: number; y: number };
export type LayoutPositionCacheKey = string;

export type DocumentSemanticMode = 'document' | 'keyword'

export type BottomSurfaceTab =
  | 'stats'
  | 'history'
  | 'documentVersionGraph'
  | 'flowchart'
  | 'gitGraph'
  | 'gantt'
  | 'timeline'
  | 'architecture'
  | 'eventModeling'

export type SchemaBySemanticMode = Record<DocumentSemanticMode, GraphSchema>

export type WorkspaceViewMode = 'canvas' | 'editor'

export type EditorWorkspacePane = 'markdown'

export type PdfImportProvider = 'native' | 'docling-remote'

export type PdfImportOcrMode = 'fallback' | 'always'

export type DocumentStructureBaselineSnapshot = {
  graphDataRevision: number
  documentSemanticMode: DocumentSemanticMode
  frontmatterModeEnabled: boolean
  canvasRenderMode: '2d' | '3d'
  canvas3dMode: Canvas3dModeId
  canvas2dRenderer: Canvas2dRendererId
  canvasRenderModeLastFree: '2d' | '3d'
  canvasRenderModeIsAuto: boolean
  viewPinned: boolean
  fitToScreenMode: boolean
  zoomToSelectionMode: boolean
  zoomState: null | { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }
  zoomStateByKey: Record<string, { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }>
  selectedNodeId: string | null
  selectedEdgeId: string | null
  selectedGroupId: string | null
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedGroupIds: string[]
  collapsedGroupIds: string[]
}

export type UiToastKind = 'neutral' | 'success' | 'warning' | 'error'

export type UiActionTone = 'neutral' | 'warning' | 'danger' | 'primary'

export type UiAction = {
  id: string
  label: string
  tone?: UiActionTone
}

export type UiToast = {
  id: string
  kind: UiToastKind
  message: string
  createdAtMs: number
  expiresAtMs: number | null
  dismissible: boolean
  busy?: boolean
  actions?: UiAction[]
}

export type UiToastInput = {
  id: string
  kind?: UiToastKind
  message: string
  ttlMs?: number | null
  dismissible?: boolean
  busy?: boolean
  log?: boolean
  actions?: UiAction[]
}

export type UiLogKind = UiToastKind

export type UiLogEntry = {
  id: string
  kind: UiLogKind
  message: string
  tsMs: number
  source: string | null
  actions?: UiAction[]
}

export type UiLogEntryInput = {
  kind?: UiLogKind
  message: string
  tsMs?: number
  source?: string | null
  actions?: UiAction[]
}

export type ChatExchangeLogEntry = {
  id: string
  request: string
  response: string
  snippet: string
  tsMs: number
  status: 'ok' | 'error' | 'aborted'
  model: string | null
}

export type ChatExchangeLogEntryInput = {
  request: string
  response: string
  snippet?: string
  tsMs?: number
  status?: 'ok' | 'error' | 'aborted'
  model?: string | null
}

export type GraphHoverPreviewConfig = {
  showNodeId: boolean;
  showNodeName: boolean;
  showNodeLabel: boolean;
  showNodeDescription: boolean;
  showNodeProperties: boolean;
  showEdgeId: boolean;
  showEdgeLabel: boolean;
  showEdgeWeight: boolean;
  showEdgeProperties: boolean;
};

export type RecentFileEntry = {
  id: string
  name: string
  path?: string
  url?: string
  timestamp: number
  type: 'json' | 'jsonld' | 'markdown' | 'csv' | 'graphml' | 'cypher' | 'url' | 'html'
}

export type SourceFile = {
  id: string
  name: string
  text: string
  enabled: boolean
  geoLayerEnabled?: boolean
  status: 'idle' | 'loading' | 'parsed' | 'error'
  error?: string
  parsedParserId?: string
  parsedTextHash?: string
  parsedGraphRevision?: number
  parsedGraphData?: GraphData
  source?: {
    kind: 'url' | 'local'
    url?: string
    path?: string
  }
}

export type LocalMarkdownFolderAccessMode = 'fs-access' | 'opfs' | 'file-input'
