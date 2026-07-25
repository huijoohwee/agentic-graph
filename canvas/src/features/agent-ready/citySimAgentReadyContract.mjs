import { CITY_SIM_WEB_MCP_TOOL_IDS } from '../game-city-sim/citySimMcpContract.mjs'

export const CITY_SIM_AGENT_READY_TOOL_IDS = Object.freeze({
  inspectLocalCitySim: CITY_SIM_WEB_MCP_TOOL_IDS.inspect,
  controlLocalCitySim: CITY_SIM_WEB_MCP_TOOL_IDS.control,
})

const NATIVE_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['invocation'],
  properties: {
    invocation: {
      type: 'string',
      minLength: 1,
      pattern: '\\S',
      description: 'Native invocation beginning /game.city @canvas #civic.',
    },
  },
})

const SIMPLE_OPERATIONS = Object.freeze([
  'open',
  'start',
  'stop',
  'restart',
  'save',
  'reset',
  'exit',
])

const STRUCTURED_INPUT_SCHEMAS = Object.freeze([
  ...SIMPLE_OPERATIONS.map(operation => ({
    type: 'object',
    additionalProperties: false,
    required: ['operation'],
    properties: { operation: { const: operation } },
  })),
  {
    type: 'object',
    additionalProperties: false,
    required: ['operation', 'parcel', 'type'],
    properties: {
      operation: { const: 'zone' },
      parcel: { type: 'string', pattern: '^r\\d{2}c\\d{2}$' },
      type: { type: 'string', enum: ['residential', 'commercial', 'industrial'] },
    },
  },
  {
    type: 'object',
    additionalProperties: false,
    required: ['operation', 'scope'],
    properties: {
      operation: { const: 'advise' },
      scope: { type: 'string', enum: ['parcel', 'district'] },
      parcel: { type: 'string', pattern: '^r\\d{2}c\\d{2}$' },
    },
  },
])

export function buildCitySimAgentReadyToolContracts({
  buildWebName,
  readOnlyAnnotations,
  mutationAnnotations,
}) {
  return [{
    name: CITY_SIM_AGENT_READY_TOOL_IDS.inspectLocalCitySim,
    webName: buildWebName(CITY_SIM_AGENT_READY_TOOL_IDS.inspectLocalCitySim),
    title: 'Inspect Local City Simulation',
    description: 'Inspect the deterministic browser-local city grid, lifecycle, zero-cost Advisor, explicit WorkspaceFs persistence state, and shared-Canvas ownership without mutation.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['schema', 'webMcpTools', 'invocationGrammar', 'snapshot', 'persistence', 'runtime'],
    },
    annotations: readOnlyAnnotations,
  }, {
    name: CITY_SIM_AGENT_READY_TOOL_IDS.controlLocalCitySim,
    webName: buildWebName(CITY_SIM_AGENT_READY_TOOL_IDS.controlLocalCitySim),
    title: 'Control Local City Simulation',
    description: 'Apply exactly one supported local city lifecycle, zoning, Advice, or explicit Save operation through structured fields or the strict native grammar.',
    inputSchema: {
      oneOf: [NATIVE_INPUT_SCHEMA, ...STRUCTURED_INPUT_SCHEMAS],
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['ok', 'code', 'message', 'city'],
      properties: {
        ok: { type: 'boolean' },
        code: { type: 'string', minLength: 1 },
        message: { type: 'string' },
      },
    },
    annotations: mutationAnnotations,
  }]
}
