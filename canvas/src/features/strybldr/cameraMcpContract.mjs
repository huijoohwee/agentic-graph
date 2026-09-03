export const CAMERA_MCP_SCHEMA = 'agentic-graph-shared-camera-mcp/v1'

export const CAMERA_WEB_MCP_TOOL_IDS = Object.freeze({
  inspect: 'inspect_local_camera',
  control: 'control_local_camera',
})

export const CAMERA_INVOCATION_COMMANDS = Object.freeze({
  select: '/camera.select',
  frame: '/camera.frame',
  animate: '/camera.animate',
  playback: '/camera.play',
  scrub: '/camera.scrub',
})

export const CAMERA_INVOCATION_SEMANTICS = Object.freeze({
  camera: '#camera',
  shot: '#camera-shot',
  motion: '#camera-motion',
})

export const CAMERA_INVOCATION_BINDINGS = Object.freeze({
  camera: '@camera',
  selectedActor: '@selected-actor',
})
