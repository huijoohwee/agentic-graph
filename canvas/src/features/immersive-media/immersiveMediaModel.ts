export const IMMERSIVE_MEDIA_SCHEMA = 'knowgrph-immersive-media/v1'

export type ImmersiveMediaSourceKind = 'procedural' | 'image' | 'video'
export type ImmersiveMediaMarkerKind = 'pin' | 'element' | 'video' | 'youtube' | 'chroma'
export type ImmersiveMediaProjection = 'compass' | 'map' | 'plan'

export type ImmersiveMediaCrop = Readonly<{
  horizontalStartDegrees: number
  horizontalSpanDegrees: number
  verticalStartDegrees: number
  verticalSpanDegrees: number
}>

export type ImmersiveMediaView = Readonly<{
  yawDegrees: number
  pitchDegrees: number
  fieldOfViewDegrees: number
  lensStrength: number
}>

export type ImmersiveMediaMarker = Readonly<{
  id: string
  label: string
  kind: ImmersiveMediaMarkerKind
  yawDegrees: number
  pitchDegrees: number
  color: string
  layerId: string
  tooltip: string
  hoverScale: number
  projections: readonly ImmersiveMediaProjection[]
  mediaUrl?: string
}>

export type ImmersiveMediaLayer = Readonly<{
  id: string
  label: string
  visible: boolean
  opacity: number
}>

export type ImmersiveMediaOverlay = Readonly<{
  enabled: boolean
  widthPercent: number
  opacity: number
  title: string
  description: string
}>

export type ImmersiveMediaCapture = Readonly<{
  byteLength: number
  mediaType: string
  capturedAt: string
}>

export type ImmersiveMediaSnapshot = Readonly<{
  schema: typeof IMMERSIVE_MEDIA_SCHEMA
  revision: number
  active: boolean
  phase: 'idle' | 'entering' | 'ready' | 'transitioning' | 'error'
  source: Readonly<{ kind: ImmersiveMediaSourceKind; url: string }>
  title: string
  description: string
  crop: ImmersiveMediaCrop
  view: ImmersiveMediaView
  transitionDurationMs: number
  transitionRevision: number
  introRevision: number
  navigation: Readonly<{
    doubleClickZoom: boolean
    keyboardActions: boolean
    items: readonly string[]
    customElementLabel: string
  }>
  markers: readonly ImmersiveMediaMarker[]
  layers: readonly ImmersiveMediaLayer[]
  polygonPattern: boolean
  overlay: ImmersiveMediaOverlay
  hoveredMarkerId: string | null
  selectedMarkerId: string | null
  lastCapture: ImmersiveMediaCapture | null
  lastAction: string
  message: string
  error: string | null
}>

export const DEFAULT_IMMERSIVE_MEDIA_CROP: ImmersiveMediaCrop = Object.freeze({
  horizontalStartDegrees: 0,
  horizontalSpanDegrees: 360,
  verticalStartDegrees: 0,
  verticalSpanDegrees: 180,
})

export const CROPPED_IMMERSIVE_MEDIA_CROP: ImmersiveMediaCrop = Object.freeze({
  horizontalStartDegrees: 35,
  horizontalSpanDegrees: 290,
  verticalStartDegrees: 18,
  verticalSpanDegrees: 144,
})

export const DEFAULT_IMMERSIVE_MEDIA_VIEW: ImmersiveMediaView = Object.freeze({
  yawDegrees: 0,
  pitchDegrees: 0,
  fieldOfViewDegrees: 68,
  lensStrength: 0,
})

export const DEFAULT_IMMERSIVE_MEDIA_MARKERS: readonly ImmersiveMediaMarker[] = Object.freeze([
  Object.freeze({
    id: 'marker-overlook',
    label: 'Overlook',
    kind: 'pin' as const,
    yawDegrees: -32,
    pitchDegrees: 8,
    color: '#67e8f9',
    layerId: 'places',
    tooltip: 'Shared marker projected on compass, map, and plan.',
    hoverScale: 1.35,
    projections: Object.freeze(['compass', 'map', 'plan'] as const),
  }),
  Object.freeze({
    id: 'marker-custom-element',
    label: 'Info element',
    kind: 'element' as const,
    yawDegrees: 38,
    pitchDegrees: -4,
    color: '#fbbf24',
    layerId: 'places',
    tooltip: 'Custom element with a runtime-owned tooltip.',
    hoverScale: 1.45,
    projections: Object.freeze(['compass', 'map'] as const),
  }),
  Object.freeze({
    id: 'marker-video',
    label: 'Video element',
    kind: 'video' as const,
    yawDegrees: 102,
    pitchDegrees: 4,
    color: '#a78bfa',
    layerId: 'media',
    tooltip: 'Generic video marker; an approved URL can replace the placeholder.',
    hoverScale: 1.25,
    projections: Object.freeze(['map', 'plan'] as const),
  }),
  Object.freeze({
    id: 'marker-youtube',
    label: 'YouTube element',
    kind: 'youtube' as const,
    yawDegrees: 148,
    pitchDegrees: 6,
    color: '#fb7185',
    layerId: 'media',
    tooltip: 'Opt-in YouTube element; add an approved video URL to activate its embed.',
    hoverScale: 1.28,
    projections: Object.freeze(['compass', 'map'] as const),
  }),
  Object.freeze({
    id: 'marker-chroma',
    label: 'Chroma marker',
    kind: 'chroma' as const,
    yawDegrees: -118,
    pitchDegrees: -10,
    color: '#34d399',
    layerId: 'media',
    tooltip: 'Color-keyed marker rendered by the local shader path.',
    hoverScale: 1.3,
    projections: Object.freeze(['compass', 'plan'] as const),
  }),
])

export const DEFAULT_IMMERSIVE_MEDIA_LAYERS: readonly ImmersiveMediaLayer[] = Object.freeze([
  Object.freeze({ id: 'places', label: 'Places', visible: true, opacity: 1 }),
  Object.freeze({ id: 'media', label: 'Media', visible: true, opacity: 0.95 }),
  Object.freeze({ id: 'pattern', label: 'Polygon pattern', visible: true, opacity: 0.42 }),
])

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

export function normalizeColor(value: unknown, fallback = '#67e8f9'): string {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback
}

export function normalizeMediaUrl(value: unknown): string | null {
  const url = String(value || '').trim()
  if (!url || url.length > 2048) return null
  if (url.startsWith('data:')) return /^data:(image|video)\//i.test(url) ? url : null
  try {
    const parsed = new URL(url, typeof window === 'undefined' ? 'https://local.invalid' : window.location.href)
    return ['http:', 'https:', 'blob:'].includes(parsed.protocol) ? url : null
  } catch {
    return null
  }
}

export function normalizeYoutubeEmbedUrl(value: unknown): string | null {
  const url = String(value || '').trim()
  if (!url || url.length > 2048) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const videoId = host === 'youtu.be'
      ? parsed.pathname.split('/').filter(Boolean)[0]
      : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)
        ? parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:embed|shorts)\/([^/?#]+)/)?.[1]
        : null
    return videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : null
  } catch {
    return null
  }
}

export function freezeImmersiveMediaSnapshot(
  snapshot: Omit<ImmersiveMediaSnapshot, 'schema'> & { schema?: typeof IMMERSIVE_MEDIA_SCHEMA },
): ImmersiveMediaSnapshot {
  const navigationItems = Object.isFrozen(snapshot.navigation.items)
    ? snapshot.navigation.items
    : Object.freeze([...snapshot.navigation.items])
  const markers = Object.isFrozen(snapshot.markers)
    ? snapshot.markers
    : Object.freeze(snapshot.markers.map(marker => Object.isFrozen(marker)
      ? marker
      : Object.freeze({
          ...marker,
          projections: Object.isFrozen(marker.projections)
            ? marker.projections
            : Object.freeze([...marker.projections]),
        })))
  const layers = Object.isFrozen(snapshot.layers)
    ? snapshot.layers
    : Object.freeze(snapshot.layers.map(layer => Object.isFrozen(layer)
      ? layer
      : Object.freeze({ ...layer })))
  return Object.freeze({
    ...snapshot,
    schema: IMMERSIVE_MEDIA_SCHEMA,
    source: Object.freeze({ ...snapshot.source }),
    crop: Object.freeze({ ...snapshot.crop }),
    view: Object.freeze({ ...snapshot.view }),
    navigation: Object.freeze({
      ...snapshot.navigation,
      items: navigationItems,
    }),
    markers,
    layers,
    overlay: Object.freeze({ ...snapshot.overlay }),
    lastCapture: snapshot.lastCapture ? Object.freeze({ ...snapshot.lastCapture }) : null,
  })
}

export function createDefaultImmersiveMediaSnapshot(): ImmersiveMediaSnapshot {
  return freezeImmersiveMediaSnapshot({
    revision: 0,
    active: false,
    phase: 'idle',
    source: { kind: 'procedural', url: '' },
    title: 'Immersive media',
    description: 'Zero-config local panorama with shared navigation, markers, layers, and capture.',
    crop: DEFAULT_IMMERSIVE_MEDIA_CROP,
    view: DEFAULT_IMMERSIVE_MEDIA_VIEW,
    transitionDurationMs: 700,
    transitionRevision: 0,
    introRevision: 0,
    navigation: {
      doubleClickZoom: true,
      keyboardActions: true,
      items: ['intro', 'reset', 'zoom-in', 'zoom-out', 'capture'],
      customElementLabel: 'Info',
    },
    markers: DEFAULT_IMMERSIVE_MEDIA_MARKERS,
    layers: DEFAULT_IMMERSIVE_MEDIA_LAYERS,
    polygonPattern: true,
    overlay: {
      enabled: true,
      widthPercent: 34,
      opacity: 0.72,
      title: 'Partial overlay',
      description: 'One bounded overlay leaves the panorama and markers interactive.',
    },
    hoveredMarkerId: null,
    selectedMarkerId: null,
    lastCapture: null,
    lastAction: 'reset',
    message: 'Ready to open the zero-config local panorama.',
    error: null,
  })
}
