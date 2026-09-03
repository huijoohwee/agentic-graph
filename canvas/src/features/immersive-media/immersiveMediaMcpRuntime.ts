import {
  addImmersiveMediaMarker,
  captureImmersiveMediaScreenshot,
  closeImmersiveMedia,
  configureImmersiveMedia,
  openImmersiveMedia,
  playImmersiveMediaIntro,
  readImmersiveMediaSnapshot,
  removeImmersiveMediaMarker,
  resetImmersiveMediaView,
  setImmersiveMediaOverlay,
  setImmersiveMediaSource,
  setImmersiveMediaView,
  toggleImmersiveMediaLayer,
  transitionImmersiveMedia,
  zoomImmersiveMedia,
} from './immersiveMediaRuntime'
import {
  IMMERSIVE_MEDIA_INVOCATION,
  IMMERSIVE_MEDIA_MCP_SCHEMA,
  IMMERSIVE_MEDIA_OPERATIONS,
  IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS,
} from './immersiveMediaMcpContract.mjs'
import type {
  ImmersiveMediaMarkerKind,
  ImmersiveMediaProjection,
  ImmersiveMediaSourceKind,
} from './immersiveMediaModel'

export type ImmersiveMediaOperation = (typeof IMMERSIVE_MEDIA_OPERATIONS)[number]

export type ImmersiveMediaControlInput = Readonly<{
  invocation?: string
  operation?: ImmersiveMediaOperation
  sourceKind?: ImmersiveMediaSourceKind
  mediaUrl?: string
  title?: string
  description?: string
  cropped?: boolean
  lensStrength?: number
  transitionDurationMs?: number
  doubleClickZoom?: boolean
  keyboardActions?: boolean
  polygonPattern?: boolean
  yawDegrees?: number
  pitchDegrees?: number
  fieldOfViewDegrees?: number
  markerId?: string
  markerLabel?: string
  markerKind?: ImmersiveMediaMarkerKind
  markerColor?: string
  markerTooltip?: string
  markerLayerId?: string
  markerHoverScale?: number
  markerProjections?: readonly ImmersiveMediaProjection[]
  layerId?: string
  overlayEnabled?: boolean
  download?: boolean
}>

type ParsedInvocation = Readonly<Omit<ImmersiveMediaControlInput, 'invocation'>> & Readonly<{
  operation: ImmersiveMediaOperation
}>

const OPERATION_SET = new Set<ImmersiveMediaOperation>(IMMERSIVE_MEDIA_OPERATIONS)
const INVOCATION_KEYS = new Set([
  'operation', 'sourceKind', 'url', 'title', 'description', 'cropped', 'lensStrength',
  'transitionDurationMs', 'doubleClickZoom', 'keyboardActions', 'polygonPattern', 'yaw',
  'pitch', 'fov', 'markerId', 'markerLabel', 'markerKind', 'markerColor', 'markerTooltip',
  'markerLayer', 'markerHoverScale', 'markerProjections', 'layer', 'overlayEnabled', 'download',
])
const INVOCATION_FIELD_NAMES = Object.freeze({
  sourceKind: 'sourceKind',
  mediaUrl: 'url',
  title: 'title',
  description: 'description',
  cropped: 'cropped',
  lensStrength: 'lensStrength',
  transitionDurationMs: 'transitionDurationMs',
  doubleClickZoom: 'doubleClickZoom',
  keyboardActions: 'keyboardActions',
  polygonPattern: 'polygonPattern',
  yawDegrees: 'yaw',
  pitchDegrees: 'pitch',
  fieldOfViewDegrees: 'fov',
  markerId: 'markerId',
  markerLabel: 'markerLabel',
  markerKind: 'markerKind',
  markerColor: 'markerColor',
  markerTooltip: 'markerTooltip',
  markerLayerId: 'markerLayer',
  markerHoverScale: 'markerHoverScale',
  markerProjections: 'markerProjections',
  layerId: 'layer',
  overlayEnabled: 'overlayEnabled',
  download: 'download',
})

const OPERATION_FIELDS: Readonly<Record<ImmersiveMediaOperation, readonly string[]>> = Object.freeze({
  open: [], close: [], 'reset-view': [], 'zoom-in': [], 'zoom-out': [], intro: [], transition: [],
  'toggle-crop': [], 'toggle-fisheye': [], 'toggle-pattern': [],
  source: ['sourceKind', 'url'],
  configure: ['title', 'description', 'cropped', 'lensStrength', 'transitionDurationMs', 'doubleClickZoom', 'keyboardActions', 'polygonPattern'],
  view: ['yaw', 'pitch', 'fov'],
  'marker-add': ['url', 'markerId', 'markerLabel', 'markerKind', 'markerColor', 'markerTooltip', 'markerLayer', 'markerHoverScale', 'markerProjections', 'yaw', 'pitch'],
  'marker-remove': ['markerId'],
  'layer-toggle': ['layer'],
  overlay: ['overlayEnabled'],
  capture: ['download'],
})

function encodeInvocationValue(value: unknown): string {
  return encodeURIComponent(Array.isArray(value) ? value.join(',') : String(value))
}

function parseBoolean(value: string | undefined): boolean | undefined | null {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parseNumber(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function parseProjectionList(value: string | undefined): readonly ImmersiveMediaProjection[] | undefined | null {
  if (value === undefined) return undefined
  const values = value.split(',').filter(Boolean)
  if (!values.length || new Set(values).size !== values.length) return null
  if (!values.every(value => ['compass', 'map', 'plan'].includes(value))) return null
  return values as readonly ImmersiveMediaProjection[]
}

export function buildImmersiveMediaInvocation(
  operation: ImmersiveMediaOperation,
  fields: Readonly<Omit<ImmersiveMediaControlInput, 'invocation' | 'operation'>> = {},
): string {
  const mediaBinding = fields.mediaUrl
    ? ` ${IMMERSIVE_MEDIA_INVOCATION.mediaBinding}`
    : ''
  const pairs = [`operation=${operation}`]
  for (const [field, key] of Object.entries(INVOCATION_FIELD_NAMES)) {
    const value = fields[field as keyof typeof fields]
    if (value !== undefined) pairs.push(`${key}=${encodeInvocationValue(value)}`)
  }
  return `${IMMERSIVE_MEDIA_INVOCATION.command} ${IMMERSIVE_MEDIA_INVOCATION.canvasBinding}${mediaBinding} ${IMMERSIVE_MEDIA_INVOCATION.semantic} ${pairs.join(' ')}`
}

function parseImmersiveMediaInvocation(value: unknown): ParsedInvocation | null {
  const invocation = String(value || '').trim()
  if (!invocation) return null
  const tokens = invocation.split(/\s+/).filter(Boolean)
  const commands = tokens.filter(token => token.startsWith('/'))
  const bindings = tokens.filter(token => token.startsWith('@'))
  const semantics = tokens.filter(token => token.startsWith('#'))
  if (commands.length !== 1 || commands[0] !== IMMERSIVE_MEDIA_INVOCATION.command) return null
  if (semantics.length !== 1 || semantics[0] !== IMMERSIVE_MEDIA_INVOCATION.semantic) return null
  if (!bindings.includes(IMMERSIVE_MEDIA_INVOCATION.canvasBinding)) return null
  if (new Set(bindings).size !== bindings.length || bindings.length > 2) return null
  if (bindings.some(binding => ![
    IMMERSIVE_MEDIA_INVOCATION.canvasBinding,
    IMMERSIVE_MEDIA_INVOCATION.mediaBinding,
  ].includes(binding))) return null

  const pairs: Record<string, string> = {}
  for (const token of tokens.slice(1).filter(token => !token.startsWith('@') && !token.startsWith('#'))) {
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) return null
    const key = token.slice(0, separator)
    if (!INVOCATION_KEYS.has(key) || Object.hasOwn(pairs, key)) return null
    try {
      pairs[key] = decodeURIComponent(token.slice(separator + 1))
    } catch {
      return null
    }
  }
  const operation = pairs.operation as ImmersiveMediaOperation
  if (!OPERATION_SET.has(operation)) return null
  const sourceKind = pairs.sourceKind as ImmersiveMediaSourceKind | undefined
  if (sourceKind && !['procedural', 'image', 'video'].includes(sourceKind)) return null
  const mediaBindingPresent = bindings.includes(IMMERSIVE_MEDIA_INVOCATION.mediaBinding)
  if (mediaBindingPresent !== Boolean(pairs.url)) return null
  if (Object.keys(pairs).some(key => key !== 'operation' && !OPERATION_FIELDS[operation].includes(key))) return null
  if (sourceKind && operation !== 'source') return null
  if (pairs.url && !['source', 'marker-add'].includes(operation)) return null
  if (pairs.url && operation === 'source' && !sourceKind) return null
  if (operation === 'source' && sourceKind === 'procedural' && pairs.url) return null
  const booleanFields = ['cropped', 'doubleClickZoom', 'keyboardActions', 'polygonPattern', 'overlayEnabled', 'download'] as const
  const parsedBooleans = Object.fromEntries(booleanFields.map(key => [key, parseBoolean(pairs[key])])) as Record<typeof booleanFields[number], boolean | undefined | null>
  if (Object.values(parsedBooleans).some(value => value === null)) return null
  const numberFields = ['lensStrength', 'transitionDurationMs', 'yaw', 'pitch', 'fov', 'markerHoverScale'] as const
  const parsedNumbers = Object.fromEntries(numberFields.map(key => [key, parseNumber(pairs[key])])) as Record<typeof numberFields[number], number | undefined | null>
  if (Object.values(parsedNumbers).some(value => value === null)) return null
  const markerProjections = parseProjectionList(pairs.markerProjections)
  if (markerProjections === null) return null
  const markerKind = pairs.markerKind as ImmersiveMediaMarkerKind | undefined
  if (markerKind && !['pin', 'element', 'video', 'youtube', 'chroma'].includes(markerKind)) return null
  return {
    operation,
    ...(sourceKind ? { sourceKind } : {}),
    ...(pairs.url ? { mediaUrl: pairs.url } : {}),
    ...(pairs.title ? { title: pairs.title } : {}),
    ...(pairs.description ? { description: pairs.description } : {}),
    ...(parsedBooleans.cropped !== undefined ? { cropped: parsedBooleans.cropped } : {}),
    ...(parsedNumbers.lensStrength !== undefined ? { lensStrength: parsedNumbers.lensStrength } : {}),
    ...(parsedNumbers.transitionDurationMs !== undefined ? { transitionDurationMs: parsedNumbers.transitionDurationMs } : {}),
    ...(parsedBooleans.doubleClickZoom !== undefined ? { doubleClickZoom: parsedBooleans.doubleClickZoom } : {}),
    ...(parsedBooleans.keyboardActions !== undefined ? { keyboardActions: parsedBooleans.keyboardActions } : {}),
    ...(parsedBooleans.polygonPattern !== undefined ? { polygonPattern: parsedBooleans.polygonPattern } : {}),
    ...(parsedNumbers.yaw !== undefined ? { yawDegrees: parsedNumbers.yaw } : {}),
    ...(parsedNumbers.pitch !== undefined ? { pitchDegrees: parsedNumbers.pitch } : {}),
    ...(parsedNumbers.fov !== undefined ? { fieldOfViewDegrees: parsedNumbers.fov } : {}),
    ...(pairs.markerId ? { markerId: pairs.markerId } : {}),
    ...(pairs.markerLabel ? { markerLabel: pairs.markerLabel } : {}),
    ...(markerKind ? { markerKind } : {}),
    ...(pairs.markerColor ? { markerColor: pairs.markerColor } : {}),
    ...(pairs.markerTooltip ? { markerTooltip: pairs.markerTooltip } : {}),
    ...(pairs.markerLayer ? { markerLayerId: pairs.markerLayer } : {}),
    ...(parsedNumbers.markerHoverScale !== undefined ? { markerHoverScale: parsedNumbers.markerHoverScale } : {}),
    ...(markerProjections ? { markerProjections } : {}),
    ...(pairs.layer ? { layerId: pairs.layer } : {}),
    ...(parsedBooleans.overlayEnabled !== undefined ? { overlayEnabled: parsedBooleans.overlayEnabled } : {}),
    ...(parsedBooleans.download !== undefined ? { download: parsedBooleans.download } : {}),
  }
}

function normalizeControl(input: ImmersiveMediaControlInput): ImmersiveMediaControlInput | null {
  if (!input || typeof input !== 'object') return null
  if (input.invocation !== undefined) {
    if (Object.keys(input).length !== 1) return null
    return parseImmersiveMediaInvocation(input.invocation)
  }
  const operation = input.operation
  return operation && OPERATION_SET.has(operation) ? input : null
}

export function inspectLocalImmersiveMedia() {
  const media = readImmersiveMediaSnapshot()
  return {
    schema: IMMERSIVE_MEDIA_MCP_SCHEMA,
    webMcpTools: {
      inspect: `agentic-graph.${IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS.inspect}`,
      control: `agentic-graph.${IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS.control}`,
    },
    invocationGrammar: {
      open: buildImmersiveMediaInvocation('open'),
      close: buildImmersiveMediaInvocation('close'),
      zeroConfig: buildImmersiveMediaInvocation('source', { sourceKind: 'procedural' }),
      cropped: buildImmersiveMediaInvocation('toggle-crop'),
      fisheye: buildImmersiveMediaInvocation('toggle-fisheye'),
      transition: buildImmersiveMediaInvocation('transition'),
      intro: buildImmersiveMediaInvocation('intro'),
      capture: buildImmersiveMediaInvocation('capture'),
      markers: buildImmersiveMediaInvocation('marker-add', {
        markerId: 'marker-example',
        markerKind: 'element',
        markerLabel: 'Example marker',
        markerProjections: ['compass', 'map', 'plan'],
      }),
      layers: buildImmersiveMediaInvocation('layer-toggle', { layerId: 'media' }),
    },
    media,
    capabilities: {
      zeroConfig: true,
      croppedPanorama: true,
      customNavigation: true,
      description: true,
      lensEffect: true,
      transition: true,
      introAnimation: true,
      doubleClickZoom: media.navigation.doubleClickZoom,
      keyboardActions: media.navigation.keyboardActions,
      screenshot: true,
      markerProjections: ['compass', 'map', 'plan'],
      markerKinds: ['pin', 'element', 'video', 'youtube', 'chroma'],
      youtubeElement: true,
      customTooltip: true,
      hoverScaling: true,
      markerLayers: true,
      polygonPattern: true,
      partialOverlay: true,
    },
    runtime: {
      rendererOwner: 'existing-r3f-canvas',
      cameraInputOwner: 'shared-three-controls',
      captureOwner: 'existing-canvas-snapshot',
      stateOwner: 'browser-local-immersive-media-runtime',
      externalDependencies: [],
      networkRequiredForDefault: false,
    },
  }
}

function result(operation: ImmersiveMediaOperation, ok = true) {
  const media = inspectLocalImmersiveMedia()
  return {
    ok: ok && !media.media.error,
    operation,
    message: media.media.message,
    media,
  }
}

export async function controlLocalImmersiveMedia(input: ImmersiveMediaControlInput) {
  const control = normalizeControl(input)
  if (!control?.operation) {
    return {
      ok: false,
      message: 'Use a supported structured operation or native /media.immersive @canvas #canvas-media invocation.',
    }
  }
  const operation = control.operation
  if (operation === 'open') openImmersiveMedia()
  else if (operation === 'close') closeImmersiveMedia()
  else if (operation === 'source') {
    setImmersiveMediaSource({ kind: control.sourceKind, url: control.mediaUrl })
  } else if (operation === 'configure') {
    configureImmersiveMedia(control)
  } else if (operation === 'view') {
    setImmersiveMediaView(control)
  } else if (operation === 'reset-view') resetImmersiveMediaView()
  else if (operation === 'zoom-in') zoomImmersiveMedia('in')
  else if (operation === 'zoom-out') zoomImmersiveMedia('out')
  else if (operation === 'intro') playImmersiveMediaIntro()
  else if (operation === 'transition') transitionImmersiveMedia()
  else if (operation === 'layer-toggle') toggleImmersiveMediaLayer(control.layerId || '')
  else if (operation === 'overlay') {
    setImmersiveMediaOverlay(control.overlayEnabled ?? !readImmersiveMediaSnapshot().overlay.enabled)
  } else if (operation === 'toggle-crop') {
    configureImmersiveMedia({ cropped: readImmersiveMediaSnapshot().crop.horizontalSpanDegrees === 360 })
  } else if (operation === 'toggle-fisheye') {
    configureImmersiveMedia({ lensStrength: readImmersiveMediaSnapshot().view.lensStrength > 0 ? 0 : 0.72 })
  } else if (operation === 'toggle-pattern') {
    configureImmersiveMedia({ polygonPattern: !readImmersiveMediaSnapshot().polygonPattern })
  } else if (operation === 'marker-add') {
    addImmersiveMediaMarker({
      id: control.markerId,
      label: control.markerLabel,
      kind: control.markerKind,
      color: control.markerColor,
      tooltip: control.markerTooltip,
      layerId: control.markerLayerId,
      hoverScale: control.markerHoverScale,
      projections: control.markerProjections,
      mediaUrl: control.mediaUrl,
      yawDegrees: control.yawDegrees,
      pitchDegrees: control.pitchDegrees,
    })
  } else if (operation === 'marker-remove') {
    removeImmersiveMediaMarker(control.markerId || '')
  } else if (operation === 'capture') {
    const capture = await captureImmersiveMediaScreenshot(control.download === true)
    return { ...result(operation, capture.ok), capture: capture.capture }
  }
  return result(operation)
}
