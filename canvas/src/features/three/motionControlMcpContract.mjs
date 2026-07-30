export const MOTION_CONTROL_MCP_SCHEMA = 'knowgrph-motion-control-mcp/v2'

export const MOTION_CONTROL_WEB_MCP_TOOL_IDS = Object.freeze({
  inspect: 'inspect_local_motion_control',
  control: 'control_local_motion_control',
})

export const MOTION_CONTROL_INVOCATION_COMMANDS = Object.freeze({
  control: '/motion.control',
})

export const MOTION_CONTROL_INVOCATION_SEMANTICS = Object.freeze({
  pose: '#pose',
})

export const MOTION_CONTROL_INVOCATION_BINDINGS = Object.freeze({
  canvas: '@canvas',
})
