import {
  activateXrSceneSurface,
  isXrGameplaySurfaceView,
  XR_SCENE_FLOATING_PANEL_VIEWS,
} from '@/features/three/xrSceneSurfaceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { runCanvasSurfaceOwnershipTransaction } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'
import { readWebglSupport } from '@/lib/three/webglSupport'
import {
  CROPPED_IMMERSIVE_MEDIA_CROP,
  DEFAULT_IMMERSIVE_MEDIA_CROP,
  DEFAULT_IMMERSIVE_MEDIA_VIEW,
  clampNumber,
  createDefaultImmersiveMediaSnapshot,
  freezeImmersiveMediaSnapshot,
  normalizeColor,
  normalizeMediaUrl,
  normalizeYoutubeEmbedUrl,
  type ImmersiveMediaMarker,
  type ImmersiveMediaMarkerKind,
  type ImmersiveMediaProjection,
  type ImmersiveMediaSnapshot,
  type ImmersiveMediaSourceKind,
} from './immersiveMediaModel'

type GraphStoreState = ReturnType<typeof useGraphStore.getState>
type PreviousCanvasSurface = Readonly<Pick<
  GraphStoreState,
  | 'canvasRenderMode'
  | 'canvas3dMode'
  | 'canvasRenderModeLastFree'
  | 'canvasRenderModeIsAuto'
  | 'floatingPanelOpen'
  | 'floatingPanelView'
>>

type RuntimeUpdate = Partial<Omit<ImmersiveMediaSnapshot, 'schema' | 'revision'>>
type Listener = () => void

let snapshot = createDefaultImmersiveMediaSnapshot()
let previousSurface: PreviousCanvasSurface | null = null
const listeners = new Set<Listener>()

export function readImmersiveMediaSnapshot(): ImmersiveMediaSnapshot {
  return snapshot
}

export function subscribeImmersiveMediaSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(update: RuntimeUpdate): ImmersiveMediaSnapshot {
  snapshot = freezeImmersiveMediaSnapshot({
    ...snapshot,
    ...update,
    revision: snapshot.revision + 1,
  })
  for (const listener of listeners) listener()
  return snapshot
}

function capturePreviousSurface(): PreviousCanvasSurface {
  const state = useGraphStore.getState()
  return Object.freeze({
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
  })
}

function restorePreviousSurface(): void {
  const previous = previousSurface
  previousSurface = null
  if (!previous) return
  runCanvasSurfaceOwnershipTransaction(() => {
    const state = useGraphStore.getState()
    state.setCanvas3dMode(previous.canvas3dMode)
    state.setCanvasRenderMode(previous.canvasRenderMode)
    state.setFloatingPanelView(previous.floatingPanelView)
    state.setFloatingPanelOpen(previous.floatingPanelOpen)
    useGraphStore.setState({
      canvasRenderModeLastFree: previous.canvasRenderModeLastFree,
      canvasRenderModeIsAuto: previous.canvasRenderModeIsAuto,
    })
  })
}

function currentPanelView() {
  const view = useGraphStore.getState().floatingPanelView
  return XR_SCENE_FLOATING_PANEL_VIEWS.find(candidate => candidate === view) || 'media'
}

function activateImmersiveMediaSurface(): boolean {
  const panelView = currentPanelView()
  return activateXrSceneSurface({
    panelView: isXrGameplaySurfaceView(panelView) ? undefined : panelView,
    openPanel: true,
  })
}

export function openImmersiveMedia(): ImmersiveMediaSnapshot {
  if (snapshot.active) {
    activateImmersiveMediaSurface()
    return publish({
      phase: 'ready',
      lastAction: 'open',
      message: 'Immersive media is already open on the shared Canvas.',
      error: null,
    })
  }
  if (!readWebglSupport()) {
    return publish({
      active: false,
      phase: 'error',
      lastAction: 'open',
      message: 'WebGL is unavailable; immersive media stayed closed.',
      error: 'webgl-unavailable',
    })
  }
  const previous = capturePreviousSurface()
  publish({
    phase: 'entering',
    lastAction: 'open',
    message: 'Opening immersive media on the shared Canvas…',
    error: null,
  })
  const activated = activateImmersiveMediaSurface()
  if (!activated) {
    return publish({
      active: false,
      phase: 'error',
      lastAction: 'open',
      message: 'The current document cannot enter the shared XR Canvas.',
      error: 'shared-xr-surface-unavailable',
    })
  }
  previousSurface = previous
  return publish({
    active: true,
    phase: 'ready',
    introRevision: snapshot.introRevision + 1,
    transitionRevision: snapshot.transitionRevision + 1,
    lastAction: 'open',
    message: 'Immersive media opened with the zero-config local panorama.',
    error: null,
  })
}

export function closeImmersiveMedia(): ImmersiveMediaSnapshot {
  if (!snapshot.active) {
    return publish({
      phase: 'idle',
      lastAction: 'close',
      message: 'Immersive media is already closed.',
      error: null,
    })
  }
  restorePreviousSurface()
  return publish({
    active: false,
    phase: 'idle',
    hoveredMarkerId: null,
    selectedMarkerId: null,
    lastAction: 'close',
    message: 'Immersive media closed and restored the previous Canvas surface.',
    error: null,
  })
}

export function setImmersiveMediaSource(input: Readonly<{
  kind?: ImmersiveMediaSourceKind
  url?: string
}>): ImmersiveMediaSnapshot {
  const kind = input.kind || (input.url ? 'image' : 'procedural')
  if (!['procedural', 'image', 'video'].includes(kind)) {
    return publish({ lastAction: 'source', error: 'unsupported-source-kind', message: 'Use procedural, image, or video.' })
  }
  const url = kind === 'procedural' ? '' : normalizeMediaUrl(input.url)
  if (kind !== 'procedural' && !url) {
    return publish({ lastAction: 'source', error: 'invalid-media-url', message: 'The media URL is missing or unsupported.' })
  }
  return publish({
    source: { kind, url: url || '' },
    phase: snapshot.active ? 'transitioning' : snapshot.phase,
    transitionRevision: snapshot.transitionRevision + 1,
    lastAction: 'source',
    message: kind === 'procedural' ? 'Restored the zero-config local panorama.' : `Prepared the approved ${kind} source.`,
    error: null,
  })
}

export function configureImmersiveMedia(input: Readonly<{
  title?: string
  description?: string
  cropped?: boolean
  lensStrength?: number
  transitionDurationMs?: number
  doubleClickZoom?: boolean
  keyboardActions?: boolean
  polygonPattern?: boolean
}>): ImmersiveMediaSnapshot {
  const title = input.title === undefined ? snapshot.title : String(input.title).trim().slice(0, 80)
  const description = input.description === undefined
    ? snapshot.description
    : String(input.description).trim().slice(0, 240)
  const crop = input.cropped === undefined
    ? snapshot.crop
    : input.cropped ? CROPPED_IMMERSIVE_MEDIA_CROP : DEFAULT_IMMERSIVE_MEDIA_CROP
  return publish({
    title: title || 'Immersive media',
    description,
    crop,
    view: {
      ...snapshot.view,
      lensStrength: clampNumber(input.lensStrength, 0, 1, snapshot.view.lensStrength),
    },
    transitionDurationMs: Math.round(clampNumber(
      input.transitionDurationMs,
      0,
      5000,
      snapshot.transitionDurationMs,
    )),
    navigation: {
      ...snapshot.navigation,
      doubleClickZoom: input.doubleClickZoom ?? snapshot.navigation.doubleClickZoom,
      keyboardActions: input.keyboardActions ?? snapshot.navigation.keyboardActions,
    },
    polygonPattern: input.polygonPattern ?? snapshot.polygonPattern,
    lastAction: 'configure',
    message: 'Immersive presentation settings updated.',
    error: null,
  })
}

export function setImmersiveMediaView(input: Readonly<{
  yawDegrees?: number
  pitchDegrees?: number
  fieldOfViewDegrees?: number
}>): ImmersiveMediaSnapshot {
  return publish({
    view: {
      ...snapshot.view,
      yawDegrees: clampNumber(input.yawDegrees, -180, 180, snapshot.view.yawDegrees),
      pitchDegrees: clampNumber(input.pitchDegrees, -80, 80, snapshot.view.pitchDegrees),
      fieldOfViewDegrees: clampNumber(
        input.fieldOfViewDegrees,
        28,
        105,
        snapshot.view.fieldOfViewDegrees,
      ),
    },
    lastAction: 'view',
    message: 'Shared Camera view updated.',
    error: null,
  })
}

export function zoomImmersiveMedia(direction: 'in' | 'out'): ImmersiveMediaSnapshot {
  const delta = direction === 'in' ? -10 : 10
  const fieldOfViewDegrees = clampNumber(
    snapshot.view.fieldOfViewDegrees + delta,
    28,
    105,
    snapshot.view.fieldOfViewDegrees,
  )
  return publish({
    view: {
      ...snapshot.view,
      fieldOfViewDegrees,
    },
    lastAction: `zoom-${direction}`,
    message: `Zoomed ${direction} to ${Math.round(fieldOfViewDegrees)}° field of view.`,
    error: null,
  })
}

export function resetImmersiveMediaView(): ImmersiveMediaSnapshot {
  return publish({
    view: DEFAULT_IMMERSIVE_MEDIA_VIEW,
    lastAction: 'reset-view',
    message: 'Shared Camera view reset.',
    error: null,
  })
}

export function playImmersiveMediaIntro(): ImmersiveMediaSnapshot {
  return publish({
    phase: snapshot.active ? 'transitioning' : snapshot.phase,
    introRevision: snapshot.introRevision + 1,
    transitionRevision: snapshot.transitionRevision + 1,
    lastAction: 'intro',
    message: 'Intro animation queued on the shared Camera.',
    error: null,
  })
}

export function transitionImmersiveMedia(): ImmersiveMediaSnapshot {
  return publish({
    phase: snapshot.active ? 'transitioning' : snapshot.phase,
    transitionRevision: snapshot.transitionRevision + 1,
    lastAction: 'transition',
    message: 'Bounded panorama transition queued.',
    error: null,
  })
}

export function completeImmersiveMediaTransition(revision: number): ImmersiveMediaSnapshot {
  if (
    !snapshot.active
    || snapshot.phase !== 'transitioning'
    || revision !== snapshot.transitionRevision
  ) return snapshot
  const completedAction = snapshot.lastAction
  return publish({
    phase: 'ready',
    message: completedAction === 'intro'
      ? 'Intro animation completed.'
      : completedAction === 'transition'
        ? 'Panorama transition completed.'
        : 'Immersive media transition completed.',
  })
}

export function toggleImmersiveMediaLayer(layerId: string): ImmersiveMediaSnapshot {
  const id = String(layerId || '').trim()
  const layer = snapshot.layers.find(candidate => candidate.id === id)
  if (!layer) {
    return publish({ lastAction: 'layer-toggle', error: 'unknown-layer', message: `Unknown layer: ${id || '(empty)'}.` })
  }
  return publish({
    layers: snapshot.layers.map(candidate => candidate.id === id
      ? { ...candidate, visible: !candidate.visible }
      : candidate),
    lastAction: 'layer-toggle',
    message: `${layer.label} layer ${layer.visible ? 'hidden' : 'shown'}.`,
    error: null,
  })
}

export function setImmersiveMediaOverlay(enabled: boolean): ImmersiveMediaSnapshot {
  return publish({
    overlay: { ...snapshot.overlay, enabled },
    lastAction: 'overlay',
    message: `Partial overlay ${enabled ? 'shown' : 'hidden'}.`,
    error: null,
  })
}

export function setImmersiveMediaPolygonPattern(enabled: boolean): ImmersiveMediaSnapshot {
  return publish({
    polygonPattern: enabled,
    lastAction: 'polygon',
    message: `Polygon marker pattern ${enabled ? 'shown' : 'hidden'}.`,
    error: null,
  })
}

export function addImmersiveMediaMarker(input: Readonly<{
  id?: string
  label?: string
  kind?: ImmersiveMediaMarkerKind
  yawDegrees?: number
  pitchDegrees?: number
  color?: string
  layerId?: string
  tooltip?: string
  hoverScale?: number
  projections?: readonly ImmersiveMediaProjection[]
  mediaUrl?: string
}>): ImmersiveMediaSnapshot {
  const id = String(input.id || `marker-${snapshot.revision + 1}`).trim().slice(0, 80)
  if (!id || snapshot.markers.some(marker => marker.id === id)) {
    return publish({ lastAction: 'marker-add', error: 'duplicate-marker', message: 'Marker id must be non-empty and unique.' })
  }
  const kind = input.kind || 'pin'
  if (!['pin', 'element', 'video', 'youtube', 'chroma'].includes(kind)) {
    return publish({ lastAction: 'marker-add', error: 'unsupported-marker-kind', message: 'Unsupported marker kind.' })
  }
  const layerId = String(input.layerId || 'places').trim()
  if (!snapshot.layers.some(layer => layer.id === layerId)) {
    return publish({ lastAction: 'marker-add', error: 'unknown-layer', message: `Unknown marker layer: ${layerId}.` })
  }
  const mediaUrl = input.mediaUrl === undefined
    ? undefined
    : kind === 'youtube'
      ? normalizeYoutubeEmbedUrl(input.mediaUrl)
      : normalizeMediaUrl(input.mediaUrl)
  if (input.mediaUrl !== undefined && !mediaUrl) {
    return publish({ lastAction: 'marker-add', error: 'invalid-media-url', message: 'Marker media URL is unsupported.' })
  }
  const projections = (input.projections || ['compass', 'map', 'plan'])
    .filter((projection): projection is ImmersiveMediaProjection => ['compass', 'map', 'plan'].includes(projection))
  const marker: ImmersiveMediaMarker = {
    id,
    label: String(input.label || id).trim().slice(0, 80),
    kind,
    yawDegrees: clampNumber(input.yawDegrees, -180, 180, 0),
    pitchDegrees: clampNumber(input.pitchDegrees, -80, 80, 0),
    color: normalizeColor(input.color),
    layerId,
    tooltip: String(input.tooltip || input.label || id).trim().slice(0, 160),
    hoverScale: clampNumber(input.hoverScale, 1, 2, 1.3),
    projections,
    ...(mediaUrl ? { mediaUrl } : {}),
  }
  return publish({
    markers: [...snapshot.markers, marker],
    lastAction: 'marker-add',
    message: `Added ${marker.label}.`,
    error: null,
  })
}

export function removeImmersiveMediaMarker(markerId: string): ImmersiveMediaSnapshot {
  const id = String(markerId || '').trim()
  if (!snapshot.markers.some(marker => marker.id === id)) {
    return publish({ lastAction: 'marker-remove', error: 'unknown-marker', message: `Unknown marker: ${id || '(empty)'}.` })
  }
  return publish({
    markers: snapshot.markers.filter(marker => marker.id !== id),
    hoveredMarkerId: snapshot.hoveredMarkerId === id ? null : snapshot.hoveredMarkerId,
    selectedMarkerId: snapshot.selectedMarkerId === id ? null : snapshot.selectedMarkerId,
    lastAction: 'marker-remove',
    message: `Removed ${id}.`,
    error: null,
  })
}

export function setHoveredImmersiveMediaMarker(markerId: string | null): ImmersiveMediaSnapshot {
  if (snapshot.hoveredMarkerId === markerId) return snapshot
  return publish({ hoveredMarkerId: markerId })
}

export function setSelectedImmersiveMediaMarker(markerId: string | null): ImmersiveMediaSnapshot {
  if (snapshot.selectedMarkerId === markerId) return snapshot
  const marker = markerId
    ? snapshot.markers.find(candidate => candidate.id === markerId)
    : null
  if (markerId && !marker) return snapshot
  return publish({
    selectedMarkerId: markerId,
    lastAction: marker ? 'marker-select' : 'marker-clear',
    message: marker ? `Selected ${marker.label}.` : 'Cleared the immersive marker selection.',
    error: null,
  })
}

export function focusImmersiveMediaMarker(
  markerId: string,
  projection: ImmersiveMediaProjection,
): ImmersiveMediaSnapshot {
  const marker = snapshot.markers.find(candidate => candidate.id === markerId)
  if (!marker || !marker.projections.includes(projection)) return snapshot
  if (snapshot.selectedMarkerId === marker.id) {
    return publish({
      hoveredMarkerId: null,
      selectedMarkerId: null,
      lastAction: 'marker-clear',
      message: `Cleared ${marker.label} from the ${projection} projection.`,
      error: null,
    })
  }
  return publish({
    hoveredMarkerId: null,
    selectedMarkerId: marker.id,
    view: {
      ...snapshot.view,
      yawDegrees: marker.yawDegrees,
      pitchDegrees: marker.pitchDegrees,
    },
    lastAction: 'marker-focus',
    message: `Focused ${marker.label} from the ${projection} projection.`,
    error: null,
  })
}

export async function captureImmersiveMediaScreenshot(download = false): Promise<{
  ok: boolean
  message: string
  capture: ImmersiveMediaSnapshot['lastCapture']
}> {
  const blob = await useGraphStore.getState().captureCanvasPngSnapshot('3d', 1)
  if (!blob) {
    publish({ lastAction: 'capture', error: 'snapshot-unavailable', message: 'The shared Canvas snapshot owner is unavailable.' })
    return { ok: false, message: snapshot.message, capture: null }
  }
  const capture = Object.freeze({
    byteLength: blob.size,
    mediaType: blob.type || 'image/png',
    capturedAt: new Date().toISOString(),
  })
  if (download && typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'agenticgraph-immersive-media.png'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  publish({
    lastCapture: capture,
    lastAction: 'capture',
    message: `Captured ${capture.byteLength} PNG bytes from the shared Canvas.`,
    error: null,
  })
  return { ok: true, message: snapshot.message, capture }
}

export function resetImmersiveMediaRuntimeForTests(): void {
  previousSurface = null
  snapshot = createDefaultImmersiveMediaSnapshot()
  for (const listener of listeners) listener()
}
