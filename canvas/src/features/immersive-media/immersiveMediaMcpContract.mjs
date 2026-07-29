export const IMMERSIVE_MEDIA_MCP_SCHEMA = 'knowgrph-immersive-media-mcp/v1'

export const IMMERSIVE_MEDIA_WEB_MCP_TOOL_IDS = Object.freeze({
  inspect: 'inspect_local_immersive_media',
  control: 'control_local_immersive_media',
})

export const IMMERSIVE_MEDIA_INVOCATION = Object.freeze({
  command: '/media.immersive',
  canvasBinding: '@canvas',
  mediaBinding: '@media-url',
  semantic: '#canvas-media',
})

export const IMMERSIVE_MEDIA_OPERATIONS = Object.freeze([
  'open',
  'close',
  'source',
  'configure',
  'view',
  'reset-view',
  'zoom-in',
  'zoom-out',
  'intro',
  'transition',
  'marker-add',
  'marker-remove',
  'layer-toggle',
  'overlay',
  'capture',
  'toggle-crop',
  'toggle-fisheye',
  'toggle-pattern',
])
