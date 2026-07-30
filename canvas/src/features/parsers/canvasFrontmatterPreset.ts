import { useGraphStore } from '@/hooks/useGraphStore'
import type { DocumentSemanticMode } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import type { Canvas2dRendererId, Canvas3dModeId } from '@/lib/config'
import { isStoryboardCanvas2dRenderer, isFrontmatterOnlyPolicyActive, resolveCanvas2dRendererId } from '@/lib/config.render'
import { normalizeCanvas3dMode } from '@/lib/canvas/canvas3dMode'
import {
  parseCanvasWorkspaceFrontmatterPreset,
  readBottomSurfaceTabPreset,
  readCanvasWorkspaceFrontmatterPresetFromMeta,
  readFloatingPanelViewPreset,
  type CanvasWorkspaceFrontmatterPreset,
} from '@/lib/markdown/frontmatter'
import {
  beginCanvasFrontmatterSurfaceRequest,
  requestCanvasFrontmatterGeospatialSurface,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import {
  activateXrSceneSurface,
  XR_SCENE_FLOATING_PANEL_VIEWS,
} from '@/features/three/xrSceneSurfaceRuntime'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readNormalizedCanvasWorkspacePreset(meta: Record<string, unknown> | null): CanvasWorkspaceFrontmatterPreset | null {
  if (!meta) return null
  const raw = isRecord(meta.canvasWorkspacePreset) ? meta.canvasWorkspacePreset as Record<string, unknown> : null
  if (!raw) return null
  const readMode2d3d = (value: unknown): '2d' | '3d' | undefined => {
    const text = String(value || '').trim()
    return text === '2d' || text === '3d' ? text : undefined
  }
  const readSurface = (value: unknown): '2d' | '3d' | 'xr' | 'geo-xr' | 'geospatial' | undefined => {
    const text = String(value || '').trim()
    return text === '2d' || text === '3d' || text === 'xr' || text === 'geo-xr' || text === 'geospatial' ? text : undefined
  }
  const readSemantic = (value: unknown): 'document' | 'keyword' | undefined => {
    const text = String(value || '').trim()
    return text === 'document' || text === 'keyword' ? text : undefined
  }
  const readBool = (value: unknown): boolean | undefined => typeof value === 'boolean' ? value : undefined
  const canvasSurfaceMode = readSurface(raw.canvasSurfaceMode)
  const canvasRenderMode = readMode2d3d(raw.canvasRenderMode)
  const canvas2dRenderer = resolveCanvas2dRendererId(raw.canvas2dRenderer)
  const videoSequenceTimelineEnabled = readBool(raw.videoSequenceTimelineEnabled)
  const bottomPanelOpen = readBool(raw.bottomPanelOpen)
  const bottomPanelTab = readBottomSurfaceTabPreset(raw.bottomPanelTab)
  const floatingPanelOpen = readBool(raw.floatingPanelOpen)
  const floatingPanelView = readFloatingPanelViewPreset(raw.floatingPanelView)
  const canvas3dMode = raw.canvas3dMode == null ? undefined : normalizeCanvas3dMode(raw.canvas3dMode)
  const documentSemanticMode = readSemantic(raw.documentSemanticMode)
  const frontmatterModeEnabled = readBool(raw.frontmatterModeEnabled)
  const multiDimTableModeEnabled = readBool(raw.multiDimTableModeEnabled)
  const documentStructureBaselineLock = readBool(raw.documentStructureBaselineLock)

  if (
    canvasSurfaceMode === undefined &&
    canvasRenderMode === undefined &&
    canvas2dRenderer === undefined &&
    videoSequenceTimelineEnabled === undefined &&
    bottomPanelOpen === undefined &&
    bottomPanelTab === undefined &&
    floatingPanelOpen === undefined &&
    floatingPanelView === undefined &&
    canvas3dMode === undefined &&
    documentSemanticMode === undefined &&
    frontmatterModeEnabled === undefined &&
    multiDimTableModeEnabled === undefined &&
    documentStructureBaselineLock === undefined
  ) {
    return null
  }

  return {
    canvasSurfaceMode,
    canvasRenderMode,
    canvas2dRenderer,
    videoSequenceTimelineEnabled,
    canvas3dMode,
    documentSemanticMode,
    bottomPanelOpen,
    bottomPanelTab,
    floatingPanelOpen,
    floatingPanelView,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    documentStructureBaselineLock,
  }
}

const VIDEO_SEQUENCE_FLOATING_PANEL_VIEWS = new Set(['timeline', 'flowchart', 'gantt'])

function shouldRetainVideoSequenceFloatingPanelView(value: unknown): boolean {
  return VIDEO_SEQUENCE_FLOATING_PANEL_VIEWS.has(String(value || '').trim())
}

function resolveCanvasSurfacePreset(args: {
  preset: CanvasWorkspaceFrontmatterPreset | null
  defaultCanvasSurfaceMode?: '2d' | '3d' | 'xr' | 'geo-xr' | 'geospatial'
  defaultCanvasRenderMode?: '2d' | '3d'
  defaultCanvas3dMode?: Canvas3dModeId
}): {
  geospatialModeEnabled?: boolean
  canvasRenderMode?: '2d' | '3d'
  canvas3dMode?: Canvas3dModeId
} {
  const canvasSurfaceMode = args.preset?.canvasSurfaceMode ?? args.defaultCanvasSurfaceMode
  if (canvasSurfaceMode === 'geospatial') {
    return {
      geospatialModeEnabled: true,
      canvasRenderMode: '2d',
      canvas3dMode: args.preset?.canvas3dMode ?? args.defaultCanvas3dMode ?? '3d',
    }
  }
  if (canvasSurfaceMode === 'geo-xr') {
    return {
      geospatialModeEnabled: true,
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
    }
  }
  if (canvasSurfaceMode === '3d') {
    return {
      geospatialModeEnabled: false,
      canvasRenderMode: '3d',
      canvas3dMode: args.preset?.canvas3dMode ?? args.defaultCanvas3dMode ?? '3d',
    }
  }
  if (canvasSurfaceMode === 'xr') {
    return {
      geospatialModeEnabled: false,
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
    }
  }
  if (canvasSurfaceMode === '2d') {
    return {
      geospatialModeEnabled: false,
      canvasRenderMode: '2d',
      canvas3dMode: args.preset?.canvas3dMode ?? args.defaultCanvas3dMode ?? '3d',
    }
  }
  const canvasRenderMode = args.preset?.canvasRenderMode ?? args.defaultCanvasRenderMode
  return {
    geospatialModeEnabled: args.preset?.canvasRenderMode ? false : undefined,
    canvasRenderMode,
    canvas3dMode: args.preset?.canvas3dMode ?? args.defaultCanvas3dMode ?? (canvasRenderMode === '2d' ? '3d' : undefined),
  }
}

export function resolveCanvasFrontmatterPreset(args: {
  preset?: CanvasWorkspaceFrontmatterPreset | null
  graphData?: GraphData | null
  rawText?: string | null
}): CanvasWorkspaceFrontmatterPreset | null {
  if (args.preset) return args.preset
  const rawText = String(args.rawText || '')
  const fromText = rawText ? parseCanvasWorkspaceFrontmatterPreset(rawText) : null
  if (fromText) return fromText

  const metadata = isRecord(args.graphData?.metadata) ? (args.graphData?.metadata as Record<string, unknown>) : null
  const frontmatterMeta = metadata && isRecord(metadata.frontmatterMeta) ? (metadata.frontmatterMeta as Record<string, unknown>) : null
  return readCanvasWorkspaceFrontmatterPresetFromMeta(frontmatterMeta) || readNormalizedCanvasWorkspacePreset(metadata)
}

export function applyCanvasFrontmatterPreset(args: {
  preset?: CanvasWorkspaceFrontmatterPreset | null
  graphData?: GraphData | null
  rawText?: string | null
  defaultCanvasSurfaceMode?: '2d' | '3d' | 'xr' | 'geo-xr' | 'geospatial'
  defaultCanvasRenderMode?: '2d' | '3d'
  defaultCanvas3dMode?: Canvas3dModeId
  defaultCanvas2dRenderer?: Canvas2dRendererId
  defaultDocumentSemanticMode?: DocumentSemanticMode
  defaultFrontmatterModeEnabled?: boolean
  defaultMultiDimTableModeEnabled?: boolean
  defaultDocumentStructureBaselineLock?: boolean
  disableMultiDimTableMode?: boolean
}): boolean {
  const preset = resolveCanvasFrontmatterPreset(args)
  const store = useGraphStore.getState()
  let changed = false
  const surfacePreset = resolveCanvasSurfacePreset({
    preset,
    defaultCanvasSurfaceMode: args.defaultCanvasSurfaceMode,
    defaultCanvasRenderMode: args.defaultCanvasRenderMode,
    defaultCanvas3dMode: args.defaultCanvas3dMode,
  })
  const isCurrentSurfaceRequest = beginCanvasFrontmatterSurfaceRequest()
  const documentStructureBaselineLock =
    preset?.documentStructureBaselineLock ?? args.defaultDocumentStructureBaselineLock
  const videoSequenceTimelineEnabled = preset?.videoSequenceTimelineEnabled === true
  const requestedCanvas2dRenderer = preset?.canvas2dRenderer ?? args.defaultCanvas2dRenderer
  const canvas2dRenderer = videoSequenceTimelineEnabled && (!requestedCanvas2dRenderer || requestedCanvas2dRenderer === 'gantt')
    ? 'media'
    : requestedCanvas2dRenderer
  const storyboardWidgetLandingRequested =
    isStoryboardCanvas2dRenderer(canvas2dRenderer) &&
    (surfacePreset.canvasRenderMode ?? store.canvasRenderMode) === '2d'
  const frontmatterOnlyPolicyActive = isFrontmatterOnlyPolicyActive({
    canvasRenderMode: surfacePreset.canvasRenderMode ?? store.canvasRenderMode,
    canvas2dRenderer: canvas2dRenderer ?? store.canvas2dRenderer,
  })
  if (
    frontmatterOnlyPolicyActive &&
    documentStructureBaselineLock !== true &&
    store.documentStructureBaselineLock !== false
  ) {
    store.setDocumentStructureBaselineLock(false)
    changed = true
  }

  if (documentStructureBaselineLock === false && store.documentStructureBaselineLock !== false) {
    store.setDocumentStructureBaselineLock(false)
    changed = true
  }

  const explicitCanvasSurfaceRequested = !!(
    preset?.canvasSurfaceMode ||
    preset?.canvasRenderMode ||
    preset?.canvas3dMode ||
    preset?.canvas2dRenderer ||
    args.defaultCanvasSurfaceMode ||
    args.defaultCanvasRenderMode ||
    args.defaultCanvas3dMode ||
    args.defaultCanvas2dRenderer
  )
  if (
    explicitCanvasSurfaceRequested &&
    documentStructureBaselineLock !== true &&
    store.documentStructureBaselineLock === true
  ) {
    store.setDocumentStructureBaselineLock(false)
    changed = true
  }

  const geospatialModeEnabled = surfacePreset.geospatialModeEnabled
  const canvasRenderMode = surfacePreset.canvasRenderMode
  const canvas3dMode = surfacePreset.canvas3dMode
  const xrScenePanelView = XR_SCENE_FLOATING_PANEL_VIEWS.find(view => view === preset?.floatingPanelView)
  const sharedXrSurfaceRequested = canvasRenderMode === '3d' && canvas3dMode === 'xr'
  const effectiveCanvasRenderMode = canvasRenderMode ?? store.canvasRenderMode
  const effectiveCanvas3dMode = canvas3dMode ?? store.canvas3dMode
  const sharedXrPanelRequested = Boolean(xrScenePanelView)
    && effectiveCanvasRenderMode === '3d'
    && effectiveCanvas3dMode === 'xr'
  const sharedXrSurfaceRouted = sharedXrSurfaceRequested || sharedXrPanelRequested
  const activateSharedXrSurface = (): boolean => {
    const before = useGraphStore.getState()
    const activated = activateXrSceneSurface({
      ...(preset?.canvasSurfaceMode === 'geo-xr' ? { geospatialComposite: true } : {}),
      ...(xrScenePanelView ? { panelView: xrScenePanelView } : {}),
      ...(preset?.floatingPanelOpen === true ? { openPanel: true } : {}),
    })
    const after = useGraphStore.getState()
    if (!activated) {
      after.pushUiToast({
        id: 'frontmatter:xr-scene:unavailable',
        kind: 'error',
        message: `The document requested a shared ${preset?.canvasSurfaceMode === 'geo-xr' ? 'Geo+XR' : 'XR'} Mode surface that is unavailable.`,
      })
    }
    if (activated && preset?.floatingPanelOpen === false) {
      after.setFloatingPanelOpen(false)
    }
    if (activated && (
      before.canvasRenderMode !== after.canvasRenderMode
      || before.canvas3dMode !== after.canvas3dMode
      || before.floatingPanelView !== after.floatingPanelView
      || before.floatingPanelOpen !== after.floatingPanelOpen
    )) changed = true
    return activated
  }
  if (typeof geospatialModeEnabled === 'boolean') {
    void requestCanvasFrontmatterGeospatialSurface(
      geospatialModeEnabled,
      {
        isCurrent: isCurrentSurfaceRequest,
        ...(sharedXrSurfaceRouted
          ? { afterCommit: activateSharedXrSurface }
          : {}),
      },
    )
    if (sharedXrSurfaceRouted) changed = true
  } else if (sharedXrSurfaceRouted) {
    activateSharedXrSurface()
  }
  if (!sharedXrSurfaceRouted) {
    if (canvasRenderMode === '3d' && canvas3dMode && useGraphStore.getState().canvas3dMode !== canvas3dMode) {
      store.setCanvas3dMode(canvas3dMode)
      changed = true
    }
    if (canvasRenderMode && store.canvasRenderMode !== canvasRenderMode) {
      if (store.documentStructureBaselineLock === true && documentStructureBaselineLock !== true) {
        store.setDocumentStructureBaselineLock(false)
      }
      store.setCanvasRenderMode(canvasRenderMode)
      if (useGraphStore.getState().canvasRenderMode === canvasRenderMode) changed = true
    }
  }
  if (canvas3dMode === '3d' && store.canvas3dMode !== '3d') {
    store.setCanvas3dMode('3d')
    changed = true
  }
  if (canvas2dRenderer) {
    const current = useGraphStore.getState()
    if (current.canvas2dRenderer !== canvas2dRenderer) {
      if (current.documentStructureBaselineLock === true && documentStructureBaselineLock !== true) {
        current.setDocumentStructureBaselineLock(false)
      }
      current.setCanvas2dRenderer(canvas2dRenderer)
      if (useGraphStore.getState().canvas2dRenderer === canvas2dRenderer) changed = true
    }
  }
  if (videoSequenceTimelineEnabled) {
    const current = useGraphStore.getState()
    if (current.bottomSurfaceTab !== 'timeline') {
      current.setBottomSurfaceTab('timeline')
      changed = true
    }
    if (current.bottomSurfaceCollapsed === true) {
      current.setBottomSurfaceCollapsed(false)
      changed = true
    }
    if (!shouldRetainVideoSequenceFloatingPanelView(current.floatingPanelView)) {
      current.setFloatingPanelView('timeline')
      changed = true
    }
    if (current.floatingPanelOpen !== true) {
      current.setFloatingPanelOpen(true)
      changed = true
    }
  }

  if (preset?.bottomPanelTab) {
    const current = useGraphStore.getState()
    if (current.bottomSurfaceTab !== preset.bottomPanelTab) {
      current.setBottomSurfaceTab(preset.bottomPanelTab)
      changed = true
    }
  }
  if (preset?.bottomPanelOpen === true) {
    const current = useGraphStore.getState()
    if (current.bottomSurfaceCollapsed === true) {
      current.setBottomSurfaceCollapsed(false)
      changed = true
    }
  }
  if (preset?.bottomPanelOpen === false) {
    const current = useGraphStore.getState()
    if (current.bottomSurfaceCollapsed !== true) {
      current.setBottomSurfaceCollapsed(true)
      changed = true
    }
  }
  if (preset?.floatingPanelView && !(sharedXrSurfaceRouted && xrScenePanelView)) {
    const current = useGraphStore.getState()
    if (current.floatingPanelView !== preset.floatingPanelView) {
      current.setFloatingPanelView(preset.floatingPanelView)
      changed = true
    }
  }
  if (preset?.floatingPanelOpen === true && !(sharedXrSurfaceRouted && xrScenePanelView)) {
    const current = useGraphStore.getState()
    if (current.floatingPanelOpen !== true) {
      current.setFloatingPanelOpen(true)
      changed = true
    }
  }
  if (preset?.floatingPanelOpen === false && !sharedXrSurfaceRouted) {
    const current = useGraphStore.getState()
    if (current.floatingPanelOpen !== false) {
      current.setFloatingPanelOpen(false)
      changed = true
    }
  }

  if (!sharedXrSurfaceRequested && canvas3dMode && useGraphStore.getState().canvas3dMode !== canvas3dMode) {
    store.setCanvas3dMode(canvas3dMode)
    changed = true
  }

  const documentSemanticMode = frontmatterOnlyPolicyActive
    ? 'document'
    : (preset?.documentSemanticMode ?? args.defaultDocumentSemanticMode)
  if (documentSemanticMode && store.documentSemanticMode !== documentSemanticMode) {
    store.setDocumentSemanticMode(documentSemanticMode)
    changed = true
  }

  const frontmatterModeEnabled = frontmatterOnlyPolicyActive
    ? true
    : (preset?.frontmatterModeEnabled ?? args.defaultFrontmatterModeEnabled)
  const multiDimTableModeEnabled = frontmatterOnlyPolicyActive || storyboardWidgetLandingRequested || args.disableMultiDimTableMode === true
    ? false
    : (preset?.multiDimTableModeEnabled ?? args.defaultMultiDimTableModeEnabled)

  if (typeof frontmatterModeEnabled === 'boolean' && frontmatterModeEnabled === false && store.frontmatterModeEnabled !== false) {
    store.setFrontmatterModeEnabled(false)
    changed = true
  }
  if (typeof multiDimTableModeEnabled === 'boolean' && multiDimTableModeEnabled === false && store.multiDimTableModeEnabled !== false) {
    store.setMultiDimTableModeEnabled(false)
    changed = true
  }
  if (typeof multiDimTableModeEnabled === 'boolean' && multiDimTableModeEnabled === true && store.multiDimTableModeEnabled !== true) {
    store.setMultiDimTableModeEnabled(true)
    changed = true
  }
  if (typeof frontmatterModeEnabled === 'boolean' && frontmatterModeEnabled === true && store.frontmatterModeEnabled !== true) {
    store.setFrontmatterModeEnabled(true)
    changed = true
  }

  if (
    documentStructureBaselineLock === true &&
    store.documentStructureBaselineLock !== documentStructureBaselineLock
  ) {
    store.setDocumentStructureBaselineLock(documentStructureBaselineLock)
    changed = true
  }

  return !!preset || changed
}
