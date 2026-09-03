export const XR_ANIMATION_MCP_SCHEMA = 'agentic-graph-xr-animation-mcp/v1'

export const XR_ANIMATION_WEB_MCP_TOOL_IDS = Object.freeze({
  inspect: 'inspect_local_animation',
  control: 'control_local_animation',
})

export const XR_ANIMATION_INVOCATION_COMMANDS = Object.freeze({
  control: '/animation.control',
})

export const XR_ANIMATION_INVOCATION_SEMANTICS = Object.freeze({
  characterMotion: '#character-motion',
  actionPath: '#action-path',
})

export const XR_ANIMATION_INVOCATION_BINDINGS = Object.freeze({
  selectedActor: '@selected-actor',
  canvas: '@canvas',
})
