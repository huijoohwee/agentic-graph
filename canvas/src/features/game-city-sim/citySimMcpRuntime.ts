import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  CITY_SIM_INVOCATION_PREFIX,
  parseCitySimInvocation,
  type CitySimOperation,
} from './citySimInvocation'
import {
  CITY_SIM_DOCUMENT_PATH,
  type CityAdviceScope,
  type CityZoningType,
} from './citySimModel'
import {
  readCitySimSnapshot,
} from './citySimRuntime'
import { executeCitySimInvocation } from './citySimInvocationRuntime'
import { dispatchCityOperation } from './citySimOperationRuntime'
import {
  CITY_SIM_MCP_SCHEMA,
  CITY_SIM_WEB_MCP_TOOL_IDS,
} from './citySimMcpContract.mjs'

export type CitySimControlInput = Readonly<{
  invocation?: string
  operation?: CitySimOperation
  parcel?: string
  type?: CityZoningType
  scope?: CityAdviceScope
}>

type CitySimControlOptions = Readonly<{
  workspace?: WorkspaceFs
  webglSupported?: boolean
}>

const NO_ARGUMENT_OPERATIONS = new Set<CitySimOperation>([
  'open',
  'start',
  'stop',
  'restart',
  'save',
  'reset',
  'exit',
])

function structuredInvocation(input: CitySimControlInput): string | null {
  const keys = Object.keys(input)
  if (keys.some(key => !['operation', 'parcel', 'type', 'scope'].includes(key))) return null
  const operation = input.operation
  if (!operation) return null
  if (NO_ARGUMENT_OPERATIONS.has(operation)) {
    return keys.length === 1
      ? `${CITY_SIM_INVOCATION_PREFIX} operation=${operation}`
      : null
  }
  if (operation === 'zone') {
    return keys.length === 3 && input.parcel && input.type
      ? `${CITY_SIM_INVOCATION_PREFIX} operation=zone parcel=${input.parcel} type=${input.type}`
      : null
  }
  if (operation === 'advise') {
    if (!input.scope || input.type) return null
    const expectedKeyCount = input.parcel ? 3 : 2
    return keys.length === expectedKeyCount
      ? `${CITY_SIM_INVOCATION_PREFIX} operation=advise scope=${input.scope}${
          input.parcel ? ` parcel=${input.parcel}` : ''
        }`
      : null
  }
  return null
}

export function buildCitySimInvocation(input: Omit<CitySimControlInput, 'invocation'>): string {
  const invocation = structuredInvocation(input)
  if (!invocation) throw new Error('City control fields do not form one supported operation.')
  return invocation
}

export function inspectLocalCitySim() {
  const snapshot = readCitySimSnapshot()
  return {
    schema: CITY_SIM_MCP_SCHEMA,
    webMcpTools: {
      inspect: `knowgrph.${CITY_SIM_WEB_MCP_TOOL_IDS.inspect}`,
      control: `knowgrph.${CITY_SIM_WEB_MCP_TOOL_IDS.control}`,
    },
    invocationGrammar: {
      prefix: CITY_SIM_INVOCATION_PREFIX,
      operations: [
        'open',
        'start',
        'stop',
        'restart',
        'zone',
        'advise',
        'save',
        'reset',
        'exit',
      ],
    },
    snapshot,
    persistence: {
      path: CITY_SIM_DOCUMENT_PATH,
      policy: 'explicit-save-read-back',
    },
    runtime: {
      simulationOwner: 'browser-local-city-runtime',
      modelCalls: 0,
      estimatedCostUsd: 0,
      networkRequired: false,
    },
  } as const
}

function rejectedCityControl(code: string, message: string) {
  return {
    ok: false,
    code,
    message,
    city: inspectLocalCitySim(),
  } as const
}

export async function controlLocalCitySim(
  input: CitySimControlInput,
  options: CitySimControlOptions = {},
) {
  const keys = Object.keys(input)
  let result: ReturnType<typeof readCitySimSnapshot>
  if (input.invocation !== undefined) {
    if (keys.length !== 1) {
      return rejectedCityControl(
        'mixed-payload',
        'Use either one native City invocation or structured fields, never both.',
      )
    }
    const execution = await executeCitySimInvocation(input.invocation, options)
    if (execution.ok === false) {
      return rejectedCityControl(execution.error.code, execution.error.message)
    }
    result = execution.snapshot
  } else {
    const invocation = structuredInvocation(input)
    if (!invocation) {
      return rejectedCityControl(
        'invalid-structured-input',
        'Use one supported City operation with its exact required fields.',
      )
    }
    const parsed = parseCitySimInvocation(invocation)
    if (parsed.ok === false) {
      return rejectedCityControl(parsed.error.code, parsed.error.message)
    }
    result = await dispatchCityOperation(parsed.invocation, options)
  }
  return {
    ok: result.lastResult?.ok === true,
    code: result.lastResult?.code || 'runtime-result-unavailable',
    message: result.message,
    operation: result.lastResult?.operation || null,
    city: inspectLocalCitySim(),
  }
}
