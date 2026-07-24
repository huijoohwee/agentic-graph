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

type ParsedInvocation = Readonly<{
  operation: ImmersiveMediaOperation
  sourceKind?: ImmersiveMediaSourceKind
  mediaUrl?: string
  layerId?: string
}>

const OPERATION_SET = new Set<ImmersiveMediaOperation>(IMMERSIVE_MEDIA_OPERATIONS)
const INVOCATION_KEYS = new Set(['operation', 'sourceKind', 'url', 'layer'])

export function buildImmersiveMediaInvocation(
  operation: ImmersiveMediaOperation,
  fields: Readonly<{ sourceKind?: ImmersiveMediaSourceKind; mediaUrl?: string; layerId?: string }> = {},
): string {
  const mediaBinding = operation === 'source' && fields.mediaUrl
    ? ` ${IMMERSIVE_MEDIA_INVOCATION.mediaBinding}`
    : ''
  const pairs = [
    `operation=${operation}`,
    ...(fields.sourceKind ? [`sourceKind=${fields.sourceKind}`] : []),
    ...(fields.mediaUrl ? [`url=${encodeURIComponent(fields.mediaUrl)}`] : []),
    ...(fields.layerId ? [`layer=${encodeURIComponent(fields.layerId)}`] : []),
  ]
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
  if (operation !== 'source' && (sourceKind || pairs.url)) return null
  if (operation !== 'layer-toggle' && pairs.layer) return null
  return {
    operation,
    ...(sourceKind ? { sourceKind } : {}),
    ...(pairs.url ? { mediaUrl: pairs.url } : {}),
    ...(pairs.layer ? { layerId: pairs.layer } : {}),
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
      inspect: `knowgrph.${IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS.inspect}`,
      control: `knowgrph.${IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS.control}`,
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
      markers: buildImmersiveMediaInvocation('marker-add'),
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
