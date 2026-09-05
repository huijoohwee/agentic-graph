import { isValidXrplClassicAddress } from './xrplClassicAddress.js'

export const AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT = 'agentic-commerce.paid-resource/v1'
export const AGENTIC_COMMERCE_PAID_RESOURCE_ID = 'agentic-commerce.travel-requote/v1'
export const AGENTIC_COMMERCE_PAID_RESOURCE_PATH = '/api/payments/commerce/x402/xrpl/travel-requote'
export const AGENTIC_COMMERCE_PAID_RESOURCE_PROVIDER = 'agent-flight'
export const AGENTIC_COMMERCE_PAID_RESOURCE_METHOD = 'POST'
export const AGENTIC_COMMERCE_PAID_RESOURCE_ASSET = 'XRP'
export const AGENTIC_COMMERCE_PAID_RESOURCE_SCHEME = 'exact'
export const AGENTIC_COMMERCE_PAID_RESOURCE_X402_VERSION = 2

export const AGENTIC_COMMERCE_PAID_RESOURCE_STATES = Object.freeze([
  'challenged',
  'verifying',
  'executing',
  'settling',
  'settlement_unknown',
  'fulfilled',
  'expired',
] as const)

export type AgenticCommercePaidResourceState = typeof AGENTIC_COMMERCE_PAID_RESOURCE_STATES[number]

export const AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES = Object.freeze({
  idempotencyKey: 'IDEMPOTENCY-KEY',
  paymentRequired: 'PAYMENT-REQUIRED',
  paymentSignature: 'PAYMENT-SIGNATURE',
  paymentResponse: 'PAYMENT-RESPONSE',
} as const)

export const AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS = Object.freeze({
  network: 'XRPL_X402_NETWORK',
  payToAddress: 'XRPL_X402_PAY_TO_ADDRESS',
  amountDrops: 'XRPL_X402_AMOUNT_DROPS',
  sourceTag: 'XRPL_X402_SOURCE_TAG',
  destinationTag: 'XRPL_X402_DESTINATION_TAG',
  facilitatorUrl: 'XRPL_X402_FACILITATOR_URL',
  rpcUrl: 'XRPL_X402_RPC_URL',
  maxTimeoutSeconds: 'XRPL_X402_MAX_TIMEOUT_SECONDS',
} as const)

export type AgenticCommercePaidResourceEnv = Readonly<Record<string, unknown>>
export type AgenticCommercePaidResourceNetwork = 'xrpl:0' | 'xrpl:1' | 'xrpl:2'

export type AgenticCommercePaidResourceConfiguration = Readonly<{
  network: AgenticCommercePaidResourceNetwork
  payToAddress: string
  amountDrops: string
  sourceTag: number
  destinationTag: number | null
  facilitatorUrl: string
  rpcUrl: string
  maxTimeoutSeconds: number
}>

export type AgenticCommercePaidResourceConfigurationResult =
  | Readonly<{ ok: true; config: AgenticCommercePaidResourceConfiguration }>
  | Readonly<{ ok: false; fields: readonly string[] }>

export type AgenticCommercePaidResourcePaymentRequirements = Readonly<{
  scheme: typeof AGENTIC_COMMERCE_PAID_RESOURCE_SCHEME
  network: AgenticCommercePaidResourceNetwork
  amount: string
  asset: typeof AGENTIC_COMMERCE_PAID_RESOURCE_ASSET
  payTo: string
  maxTimeoutSeconds: number
  extra: Readonly<{
    invoiceId: string
    sourceTag: number
    destinationTag?: number
  }>
}>

export type AgenticCommercePaidResourcePaymentRequired = Readonly<{
  x402Version: typeof AGENTIC_COMMERCE_PAID_RESOURCE_X402_VERSION
  error: 'Payment required'
  resource: Readonly<{
    url: string
    description: string
    mimeType: 'application/json'
  }>
  accepts: AgenticCommercePaidResourcePaymentRequirements[]
}>

const XRPL_NETWORKS = new Set<AgenticCommercePaidResourceNetwork>(['xrpl:0', 'xrpl:1', 'xrpl:2'])
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const MAX_XRP_DROPS = 100_000_000_000_000_000n
const MAX_XRPL_TAG = 4_294_967_295

const readEnvString = (env: AgenticCommercePaidResourceEnv, key: string): string =>
  String(env[key] ?? '').trim()

const uniqueFrozen = (values: string[]): readonly string[] => Object.freeze([...new Set(values)])

const parseServiceUrl = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  try {
    const parsed = new URL(text)
    const loopback = parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '[::1]'
    if (
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || !parsed.hostname
    ) return null
    parsed.pathname = parsed.pathname.replace(/\/+$/u, '') || '/'
    return parsed.toString().replace(/\/$/u, '')
  } catch {
    return null
  }
}

export const isAgenticCommercePaidResourceXrplAddress = (value: unknown): boolean =>
  typeof value === 'string' && isValidXrplClassicAddress(value.trim())

export const isAgenticCommercePaidResourceAmountDrops = (value: unknown): boolean => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^[1-9]\d*$/u.test(text)) return false
  try {
    return BigInt(text) <= MAX_XRP_DROPS
  } catch {
    return false
  }
}

export const parseAgenticCommercePaidResourceXrplTag = (value: unknown): number | null => {
  const text = typeof value === 'number' && Number.isInteger(value)
    ? String(value)
    : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,10}$/u.test(text)) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_XRPL_TAG ? parsed : null
}

export const isAgenticCommercePaidResourceInvoiceId = (value: unknown): value is string =>
  typeof value === 'string' && SHA256_HEX_PATTERN.test(value)

export const isAgenticCommercePaidResourceIdempotencyKey = (value: unknown): value is string =>
  typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value)

export const readAgenticCommercePaidResourceConfiguration = (
  env: AgenticCommercePaidResourceEnv,
): AgenticCommercePaidResourceConfigurationResult => {
  const network = readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.network)
  const payToAddress = readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.payToAddress)
  const amountDrops = readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.amountDrops)
  const sourceTagText = readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.sourceTag)
  const destinationTagText = readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.destinationTag)
  const facilitatorUrl = parseServiceUrl(readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.facilitatorUrl))
  const rpcUrl = parseServiceUrl(readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.rpcUrl))
  const maxTimeoutText = readEnvString(env, AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.maxTimeoutSeconds)
  const sourceTag = parseAgenticCommercePaidResourceXrplTag(sourceTagText)
  const destinationTag = destinationTagText
    ? parseAgenticCommercePaidResourceXrplTag(destinationTagText)
    : null
  const maxTimeoutSeconds = Number(maxTimeoutText)
  const fields: string[] = []

  if (!XRPL_NETWORKS.has(network as AgenticCommercePaidResourceNetwork)) {
    fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.network)
  }
  if (!isAgenticCommercePaidResourceXrplAddress(payToAddress)) {
    fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.payToAddress)
  }
  if (!isAgenticCommercePaidResourceAmountDrops(amountDrops)) {
    fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.amountDrops)
  }
  if (sourceTag === null) fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.sourceTag)
  if (destinationTagText && destinationTag === null) {
    fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.destinationTag)
  }
  if (!facilitatorUrl) fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.facilitatorUrl)
  if (!rpcUrl) fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.rpcUrl)
  if (
    !/^[1-9]\d*$/u.test(maxTimeoutText)
    || !Number.isSafeInteger(maxTimeoutSeconds)
    || maxTimeoutSeconds > 300
  ) fields.push(AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.maxTimeoutSeconds)

  if (fields.length > 0) return Object.freeze({ ok: false, fields: uniqueFrozen(fields) })
  return Object.freeze({
    ok: true,
    config: Object.freeze({
      network: network as AgenticCommercePaidResourceNetwork,
      payToAddress,
      amountDrops,
      sourceTag: sourceTag as number,
      destinationTag,
      facilitatorUrl: facilitatorUrl as string,
      rpcUrl: rpcUrl as string,
      maxTimeoutSeconds,
    }),
  })
}

const canonicalValue = (value: unknown, ancestors: Set<object>): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('canonical_json_cycle')
    ancestors.add(value)
    const output = value.map(item => canonicalValue(item, ancestors))
    ancestors.delete(value)
    return output
  }
  if (value && typeof value === 'object') {
    if (ancestors.has(value)) throw new TypeError('canonical_json_cycle')
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('canonical_json_object_required')
    ancestors.add(value)
    const output = Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalValue(entry, ancestors)]))
    ancestors.delete(value)
    return output
  }
  throw new TypeError('canonical_json_value_unsupported')
}

export const canonicalizeAgenticCommercePaidResourceJson = (value: unknown): string =>
  JSON.stringify(canonicalValue(value, new Set()))

export const sha256AgenticCommercePaidResourceHex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const buildAgenticCommercePaidResourceTransportDigest = async (args: {
  network: string
  facilitatorUrl: string
  rpcUrl: string
}): Promise<string> => `sha256:${await sha256AgenticCommercePaidResourceHex(
  canonicalizeAgenticCommercePaidResourceJson({
    network: args.network,
    facilitatorUrl: args.facilitatorUrl,
    rpcUrl: args.rpcUrl,
  }),
)}`

export const buildAgenticCommercePaidResourceRequestDigestInput = (args: {
  idempotencyKey: string
  request: unknown
}) => {
  if (!isAgenticCommercePaidResourceIdempotencyKey(args.idempotencyKey)) {
    throw new TypeError('paid_resource_idempotency_key_invalid')
  }
  return Object.freeze({
    contract: AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT,
    resource: AGENTIC_COMMERCE_PAID_RESOURCE_ID,
    method: AGENTIC_COMMERCE_PAID_RESOURCE_METHOD,
    path: AGENTIC_COMMERCE_PAID_RESOURCE_PATH,
    idempotencyKey: args.idempotencyKey,
    request: canonicalValue(args.request, new Set()),
  })
}

export const buildAgenticCommercePaidResourceRequestIdentity = async (args: {
  idempotencyKey: string
  request: unknown
}) => {
  const input = buildAgenticCommercePaidResourceRequestDigestInput(args)
  const requestJson = canonicalizeAgenticCommercePaidResourceJson(input)
  const requestDigest = await sha256AgenticCommercePaidResourceHex(requestJson)
  const invoiceId = await sha256AgenticCommercePaidResourceHex(canonicalizeAgenticCommercePaidResourceJson({
    contract: AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT,
    resource: AGENTIC_COMMERCE_PAID_RESOURCE_ID,
    idempotencyKey: args.idempotencyKey,
    requestDigest,
  }))
  return Object.freeze({ requestJson, requestDigest, invoiceId })
}

export const buildAgenticCommercePaidResourceUrl = (baseUrl: string): string => {
  const parsed = new URL(baseUrl)
  const loopback = parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]'
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))
    || parsed.username || parsed.password || !parsed.hostname) {
    throw new TypeError('paid_resource_base_url_invalid')
  }
  return new URL(AGENTIC_COMMERCE_PAID_RESOURCE_PATH, parsed.origin).toString()
}

export const buildAgenticCommercePaidResourcePaymentRequirements = (args: {
  config: AgenticCommercePaidResourceConfiguration
  invoiceId: string
}): AgenticCommercePaidResourcePaymentRequirements => {
  if (!isAgenticCommercePaidResourceInvoiceId(args.invoiceId)) {
    throw new TypeError('paid_resource_invoice_id_invalid')
  }
  const extra = Object.freeze({
    invoiceId: args.invoiceId,
    sourceTag: args.config.sourceTag,
    ...(args.config.destinationTag === null ? {} : { destinationTag: args.config.destinationTag }),
  })
  return Object.freeze({
    scheme: AGENTIC_COMMERCE_PAID_RESOURCE_SCHEME,
    network: args.config.network,
    amount: args.config.amountDrops,
    asset: AGENTIC_COMMERCE_PAID_RESOURCE_ASSET,
    payTo: args.config.payToAddress,
    maxTimeoutSeconds: args.config.maxTimeoutSeconds,
    extra,
  })
}

export const buildAgenticCommercePaidResourcePaymentRequired = (args: {
  baseUrl: string
  config: AgenticCommercePaidResourceConfiguration
  invoiceId: string
}): AgenticCommercePaidResourcePaymentRequired => {
  const accepts: AgenticCommercePaidResourcePaymentRequirements[] = [
    buildAgenticCommercePaidResourcePaymentRequirements(args),
  ]
  Object.freeze(accepts)
  return Object.freeze({
    x402Version: AGENTIC_COMMERCE_PAID_RESOURCE_X402_VERSION,
    error: 'Payment required',
    resource: Object.freeze({
      url: buildAgenticCommercePaidResourceUrl(args.baseUrl),
      description: 'Verified live flight requote',
      mimeType: 'application/json' as const,
    }),
    accepts,
  })
}

export const buildAgenticCommercePaidResourcePaymentRequirementsDigest = async (
  requirements: AgenticCommercePaidResourcePaymentRequirements,
): Promise<string> => `sha256:${await sha256AgenticCommercePaidResourceHex(
  canonicalizeAgenticCommercePaidResourceJson(requirements),
)}`

export const buildAgenticCommercePaidResourcePaymentRequiredDigest = async (
  paymentRequired: AgenticCommercePaidResourcePaymentRequired,
): Promise<string> => `sha256:${await sha256AgenticCommercePaidResourceHex(
  canonicalizeAgenticCommercePaidResourceJson(paymentRequired),
)}`

export const buildAgenticCommercePaidResourceDiscoveryProjection = (args: {
  baseUrl: string
  config: AgenticCommercePaidResourceConfiguration
}) => Object.freeze({
  contract: AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT,
  id: AGENTIC_COMMERCE_PAID_RESOURCE_ID,
  provider: AGENTIC_COMMERCE_PAID_RESOURCE_PROVIDER,
  method: AGENTIC_COMMERCE_PAID_RESOURCE_METHOD,
  url: buildAgenticCommercePaidResourceUrl(args.baseUrl),
  payment: Object.freeze({
    protocol: 'x402',
    version: AGENTIC_COMMERCE_PAID_RESOURCE_X402_VERSION,
    scheme: AGENTIC_COMMERCE_PAID_RESOURCE_SCHEME,
    network: args.config.network,
    asset: AGENTIC_COMMERCE_PAID_RESOURCE_ASSET,
    amount: args.config.amountDrops,
  }),
})
