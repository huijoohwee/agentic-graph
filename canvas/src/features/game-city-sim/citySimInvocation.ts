import {
  isCanonicalRegionalPoiIdentityId,
  isCityZoningType,
  type CityAdviceScope,
  type CityZoningType,
} from './citySimModel'

export const CITY_SIM_INVOCATION_PREFIX = '/game.city @canvas #civic' as const

export const CITY_SIM_OPERATIONS = [
  'open',
  'start',
  'stop',
  'restart',
  'zone',
  'advise',
  'save',
  'reset',
  'exit',
] as const

export type CitySimOperation = (typeof CITY_SIM_OPERATIONS)[number]

export type ParsedCitySimInvocation = Readonly<{
  operation: CitySimOperation
  parcelId: string | null
  zoningType: CityZoningType | null
  scope: CityAdviceScope | null
}>

export type CitySimInvocationError = Readonly<{
  code:
    | 'mixed-payload'
    | 'invalid-prefix'
    | 'duplicate-sigil'
    | 'malformed-argument'
    | 'duplicate-argument'
    | 'unknown-argument'
    | 'missing-operation'
    | 'unsupported-operation'
    | 'missing-argument'
    | 'unexpected-argument'
    | 'invalid-parcel'
    | 'unsupported-zone'
    | 'unsupported-scope'
  message: string
}>

export type CitySimInvocationResult =
  | Readonly<{ ok: true; invocation: ParsedCitySimInvocation }>
  | Readonly<{ ok: false; error: CitySimInvocationError }>

const OPERATION_SET = new Set<string>(CITY_SIM_OPERATIONS)
const ACCEPTED_KEYS = new Set(['operation', 'parcel', 'type', 'scope'])

function failure(
  code: CitySimInvocationError['code'],
  message: string,
): CitySimInvocationResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message }),
  })
}

function countToken(tokens: readonly string[], expected: string): number {
  return tokens.filter(token => token === expected).length
}

function rejectUnexpectedArguments(
  operation: CitySimOperation,
  args: ReadonlyMap<string, string>,
  allowed: readonly string[],
): CitySimInvocationResult | null {
  const allowedSet = new Set(['operation', ...allowed])
  const unexpected = [...args.keys()].find(key => !allowedSet.has(key))
  return unexpected
    ? failure(
        'unexpected-argument',
        `Argument ${unexpected} is not valid for operation=${operation}.`,
      )
    : null
}

export function parseCitySimInvocation(raw: string): CitySimInvocationResult {
  const input = String(raw || '').trim()
  if (/[{}[\]]/.test(input)) {
    return failure(
      'mixed-payload',
      'City native input cannot be mixed with a structured payload.',
    )
  }
  const tokens = input.split(/\s+/).filter(Boolean)
  for (const sigil of ['/game.city', '@canvas', '#civic']) {
    const count = countToken(tokens, sigil)
    if (count > 1) {
      return failure('duplicate-sigil', `City input contains ${count} copies of ${sigil}.`)
    }
    if (count === 0) {
      return failure('invalid-prefix', `City input requires exactly one ${sigil}.`)
    }
  }
  if (
    tokens[0] !== '/game.city'
    || tokens[1] !== '@canvas'
    || tokens[2] !== '#civic'
  ) {
    return failure(
      'invalid-prefix',
      `City native input must begin exactly with ${CITY_SIM_INVOCATION_PREFIX}.`,
    )
  }

  const args = new Map<string, string>()
  for (const token of tokens.slice(3)) {
    const separator = token.indexOf('=')
    if (
      separator <= 0
      || separator !== token.lastIndexOf('=')
      || separator === token.length - 1
    ) {
      return failure(
        'malformed-argument',
        `City argument ${token} must use a non-empty key=value form.`,
      )
    }
    const key = token.slice(0, separator)
    const value = token.slice(separator + 1)
    if (!ACCEPTED_KEYS.has(key)) {
      return failure('unknown-argument', `City argument ${key} is unsupported.`)
    }
    if (args.has(key)) {
      return failure('duplicate-argument', `City argument ${key} was provided more than once.`)
    }
    args.set(key, value)
  }

  const operationValue = args.get('operation')
  if (!operationValue) {
    return failure(
      'missing-operation',
      'City native input requires operation=<supported-operation>.',
    )
  }
  if (!OPERATION_SET.has(operationValue)) {
    return failure(
      'unsupported-operation',
      `City operation ${operationValue} is unsupported.`,
    )
  }
  const operation = operationValue as CitySimOperation
  const parcelId = args.get('parcel') ?? null
  const zoningTypeValue = args.get('type') ?? null
  const scopeValue = args.get('scope') ?? null

  if (parcelId && !isCanonicalRegionalPoiIdentityId(parcelId)) {
    return failure(
      'invalid-parcel',
      `City parcel ${parcelId} must use a canonical RegionalPoiIdentity id.`,
    )
  }
  if (zoningTypeValue && !isCityZoningType(zoningTypeValue)) {
    return failure(
      'unsupported-zone',
      `City zoning type ${zoningTypeValue} is unsupported.`,
    )
  }
  if (scopeValue && scopeValue !== 'parcel' && scopeValue !== 'district') {
    return failure(
      'unsupported-scope',
      `City advisor scope ${scopeValue} is unsupported.`,
    )
  }

  if (operation === 'zone') {
    const unexpected = rejectUnexpectedArguments(operation, args, ['parcel', 'type'])
    if (unexpected) return unexpected
    if (!parcelId) {
      return failure(
        'missing-argument',
        'operation=zone requires parcel=<regional-poi-identity-id>.',
      )
    }
    if (!zoningTypeValue) {
      return failure(
        'missing-argument',
        'operation=zone requires type=<residential|commercial|industrial>.',
      )
    }
  } else if (operation === 'advise') {
    const unexpected = rejectUnexpectedArguments(operation, args, ['scope', 'parcel'])
    if (unexpected) return unexpected
    if (!scopeValue) {
      return failure(
        'missing-argument',
        'operation=advise requires scope=<parcel|district>.',
      )
    }
  } else {
    const unexpected = rejectUnexpectedArguments(operation, args, [])
    if (unexpected) return unexpected
  }

  return Object.freeze({
    ok: true,
    invocation: Object.freeze({
      operation,
      parcelId,
      zoningType: zoningTypeValue as CityZoningType | null,
      scope: scopeValue as CityAdviceScope | null,
    }),
  })
}
