import {
  FLIGHT_SIM_CONTROL_OPERATIONS,
  FLIGHT_SIM_WEB_MCP_TOOL_IDS,
} from '../game-flight-sim/flightSimMcpContract.mjs'

export const FLIGHT_SIM_AGENT_READY_TOOL_IDS = Object.freeze({
  inspectLocalFlightSim: FLIGHT_SIM_WEB_MCP_TOOL_IDS.inspect,
  controlLocalFlightSim: FLIGHT_SIM_WEB_MCP_TOOL_IDS.control,
})

const buildStructuredOperationSchema = (operation) => ({
  type: 'object',
  additionalProperties: false,
  required: operation === 'throttle' ? ['operation', 'throttle'] : ['mission', 'failure'].includes(operation) ? ['operation', `${operation}Id`] : ['operation'],
  properties: {
    operation: { const: operation },
    ...(['mission', 'failure'].includes(operation) ? { [`${operation}Id`]: { type: 'string', minLength: 1, maxLength: 96, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' } } : {}),
    ...(operation === 'throttle'
      ? { throttle: { type: 'number', minimum: 0, maximum: 1 } }
      : {}),
  },
})

const FLIGHT_SIM_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['invocation'],
      properties: {
        invocation: {
          type: 'string',
          minLength: 1,
          pattern: '\\S',
          description: 'Native invocation such as /flight.sim @canvas #flight operation=throttle throttle=0.75.',
        },
      },
    },
    ...FLIGHT_SIM_CONTROL_OPERATIONS.map(buildStructuredOperationSchema),
    { type: 'object', additionalProperties: false, required: ['operation'], properties: { operation: { type: 'string', minLength: 1, maxLength: 96, pattern: '^[a-z][a-z0-9-]*$', not: { enum: [...FLIGHT_SIM_CONTROL_OPERATIONS] }, description: 'An alias declared by the admitted authored training profile; unknown aliases are rejected by the runtime.' } } },
  ],
})

export function buildFlightSimAgentReadyToolContracts({
  buildWebName,
  readOnlyAnnotations,
  mutationAnnotations,
}) {
  return [{
    name: FLIGHT_SIM_AGENT_READY_TOOL_IDS.inspectLocalFlightSim,
    webName: buildWebName(FLIGHT_SIM_AGENT_READY_TOOL_IDS.inspectLocalFlightSim),
    title: 'Inspect Local Flight Sim',
    description: 'Inspect the browser-local Flight Sim lifecycle, deterministic aircraft state, authored procedural XR terrain ownership, mission score, systems checklist, night-flight state, practice failure, voice instructor, pending Decision persistence, and strict /flight.sim @canvas #flight grammar.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      oneOf: [{
        type: 'object',
        additionalProperties: true,
        required: ['schema', 'webMcpTools', 'invocationGrammar', 'flightSim', 'training', 'decisions', 'runtime'],
      }, {
        type: 'object',
        additionalProperties: true,
        required: ['ok', 'errorCode', 'message'],
        properties: {
          ok: { const: false },
          errorCode: { type: 'string' },
          message: { type: 'string' },
        },
      }],
    },
    annotations: readOnlyAnnotations,
  }, {
    name: FLIGHT_SIM_AGENT_READY_TOOL_IDS.controlLocalFlightSim,
    webName: buildWebName(FLIGHT_SIM_AGENT_READY_TOOL_IDS.controlLocalFlightSim),
    title: 'Control Local Flight Sim',
    description: 'Select a scored flight-training mission, choose a bounded practice failure, control voice coaching, open or fly the deterministic Flight Sim, and save a terminal debrief through structured fields or /flight.sim @canvas #flight without creating another Canvas, ECS world, persistence owner, network route, or deployment surface. Read-only inspection remains a separate tool.',
    inputSchema: FLIGHT_SIM_INPUT_SCHEMA,
    outputSchema: { type: 'object', additionalProperties: true, required: ['ok', 'message'] },
    annotations: mutationAnnotations,
  }]
}
