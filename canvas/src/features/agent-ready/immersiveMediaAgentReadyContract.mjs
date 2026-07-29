import {
  IMMERSIVE_MEDIA_OPERATIONS,
  IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS,
} from '../immersive-media/immersiveMediaMcpContract.mjs'

export const IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS = Object.freeze({
  inspectLocalImmersiveMedia: IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS.inspect,
  controlLocalImmersiveMedia: IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS.control,
})

const IMMERSIVE_MEDIA_CONTROL_FIELDS = Object.freeze({
  operation: { type: 'string', enum: IMMERSIVE_MEDIA_OPERATIONS },
  sourceKind: { type: 'string', enum: ['procedural', 'image', 'video'] },
  mediaUrl: { type: 'string', minLength: 1, maxLength: 2048 },
  title: { type: 'string', maxLength: 80 },
  description: { type: 'string', maxLength: 240 },
  cropped: { type: 'boolean' },
  lensStrength: { type: 'number', minimum: 0, maximum: 1 },
  transitionDurationMs: { type: 'number', minimum: 0, maximum: 5000 },
  doubleClickZoom: { type: 'boolean' },
  keyboardActions: { type: 'boolean' },
  polygonPattern: { type: 'boolean' },
  yawDegrees: { type: 'number', minimum: -180, maximum: 180 },
  pitchDegrees: { type: 'number', minimum: -80, maximum: 80 },
  fieldOfViewDegrees: { type: 'number', minimum: 28, maximum: 105 },
  markerId: { type: 'string', minLength: 1, maxLength: 80 },
  markerLabel: { type: 'string', maxLength: 80 },
  markerKind: { type: 'string', enum: ['pin', 'element', 'video', 'youtube', 'chroma'] },
  markerColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  markerTooltip: { type: 'string', maxLength: 160 },
  markerLayerId: { type: 'string', minLength: 1, maxLength: 80 },
  markerHoverScale: { type: 'number', minimum: 1, maximum: 2 },
  markerProjections: {
    type: 'array',
    uniqueItems: true,
    items: { type: 'string', enum: ['compass', 'map', 'plan'] },
  },
  layerId: { type: 'string', minLength: 1, maxLength: 80 },
  overlayEnabled: { type: 'boolean' },
  download: { type: 'boolean' },
})

const IMMERSIVE_MEDIA_INPUT_SCHEMA = Object.freeze({
  oneOf: [{
    type: 'object',
    additionalProperties: false,
    required: ['invocation'],
    properties: {
      invocation: {
        type: 'string',
        minLength: 1,
        pattern: '\\S',
        description: 'Native invocation such as /media.immersive @canvas #canvas-media operation=open.',
      },
    },
  }, {
    type: 'object',
    additionalProperties: false,
    required: ['operation'],
    properties: IMMERSIVE_MEDIA_CONTROL_FIELDS,
  }],
})

export function buildImmersiveMediaAgentReadyToolContracts({
  buildWebName,
  readOnlyAnnotations,
  mutationAnnotations,
}) {
  return [{
    name: IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.inspectLocalImmersiveMedia,
    webName: buildWebName(IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.inspectLocalImmersiveMedia),
    title: 'Inspect Local Immersive Media',
    description: 'Inspect the browser-local immersive media source, panorama crop, shared Camera view, navigation, marker projections, layers, transition, overlay, capture state, and strict /media.immersive @canvas #canvas-media grammar.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['schema', 'webMcpTools', 'invocationGrammar', 'media', 'capabilities', 'runtime'],
    },
    annotations: readOnlyAnnotations,
  }, {
    name: IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.controlLocalImmersiveMedia,
    webName: buildWebName(IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.controlLocalImmersiveMedia),
    title: 'Control Local Immersive Media',
    description: 'Control zero-config or approved immersive media, crop, lens, transitions, input, markers, layers, overlays, and shared-Canvas capture without creating another renderer, Camera, or persistence owner.',
    inputSchema: IMMERSIVE_MEDIA_INPUT_SCHEMA,
    outputSchema: { type: 'object', additionalProperties: true, required: ['ok', 'message'] },
    annotations: mutationAnnotations,
  }]
}
