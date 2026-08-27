export const FLIGHT_SIM_MCP_SCHEMA = 'agenticgraph-flight-sim-mcp/v1'

export const FLIGHT_SIM_WEB_MCP_TOOL_IDS = Object.freeze({
  inspect: 'inspect_local_flight_sim',
  control: 'control_local_flight_sim',
})

export const FLIGHT_SIM_INVOCATION_COMMANDS = Object.freeze({
  control: '/flight.sim',
})

export const FLIGHT_SIM_INVOCATION_SEMANTICS = Object.freeze({
  flight: '#flight',
})

export const FLIGHT_SIM_INVOCATION_BINDINGS = Object.freeze({
  canvas: '@canvas',
})

export const FLIGHT_SIM_CONTROL_OPERATIONS = Object.freeze([
  'open',
  'start',
  'stop',
  'restart',
  'throttle',
  'mission-foundation',
  'mission-night',
  'mission-systems',
  'failure-none',
  'failure-engine',
  'failure-instruments',
  'failure-controls',
  'voice-on',
  'voice-off',
  'coach',
  'save',
  'exit',
])
