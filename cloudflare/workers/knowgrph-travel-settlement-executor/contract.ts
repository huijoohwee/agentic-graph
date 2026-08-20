export const SETTLEMENT_PATH = '/v1/net-settlements'
export const LIVE_PATH = '/livez'
export const READY_PATH = '/readyz'
export const EFFECT_CONTRACT = 'knowgrph.net-settlement-effect/v1'
export const ISSUANCE_COMPONENT = 'Issuance_Service'

export const MAX_REQUEST_BYTES = 16 * 1024
export const MAX_RESPONSE_BYTES = 32 * 1024

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CASCADE_ID_PATTERN = /^(?:[A-Za-z0-9]|~)[A-Za-z0-9._:~-]{0,510}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/

export type NetSettlementRequest = Readonly<{
  operation: 'settleNet'
  cascadeId: string
  bundleId: string
  principalId: string
  amountMinor: number
  currency: string
  caller: 'Issuance_Service'
}>

export type EffectReceipt = Readonly<{
  ok: true
  contract: typeof EFFECT_CONTRACT
  providerBacked: true
  idempotencyKey: string
  cascadeId: string
  bundleId: string
  principalId: string
  amountMinor: number
  currency: string
  effect: 'charged' | 'refunded'
  settlementId: string
  providerReference: string
}>

export type SemanticConflict = Readonly<{
  ok: false
  contract: typeof EFFECT_CONTRACT
  code: 'idempotency-conflict'
  idempotencyKey: string
  definitive: true
  effectApplied: false
}>

export type DefinitiveRejection = Readonly<{
  ok: false
  contract: typeof EFFECT_CONTRACT
  code: 'settlement-effect-rejected'
  idempotencyKey: string
  definitive: true
  effectApplied: false
}>

export type ProviderReadiness = Readonly<{
  ok: true
  contract: typeof EFFECT_CONTRACT
  providerBacked: true
  capability: 'settleNet'
  authenticated: true
  providerId: string
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key))
}

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value)

export const parseSettlementRequest = (value: unknown): NetSettlementRequest | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'operation',
    'cascadeId',
    'bundleId',
    'principalId',
    'amountMinor',
    'currency',
    'caller',
  ])) return null
  if (
    value.operation !== 'settleNet'
    || typeof value.cascadeId !== 'string'
    || !CASCADE_ID_PATTERN.test(value.cascadeId)
    || !isIdentifier(value.bundleId)
    || !isIdentifier(value.principalId)
    || typeof value.amountMinor !== 'number'
    || !Number.isSafeInteger(value.amountMinor)
    || value.amountMinor === 0
    || typeof value.currency !== 'string'
    || !CURRENCY_PATTERN.test(value.currency)
    || value.caller !== ISSUANCE_COMPONENT
  ) return null
  return Object.freeze({
    operation: 'settleNet',
    cascadeId: value.cascadeId,
    bundleId: value.bundleId,
    principalId: value.principalId,
    amountMinor: value.amountMinor,
    currency: value.currency,
    caller: ISSUANCE_COMPONENT,
  })
}

export const parseEffectReceipt = (
  value: unknown,
  request: NetSettlementRequest,
): EffectReceipt | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'ok',
    'contract',
    'providerBacked',
    'idempotencyKey',
    'cascadeId',
    'bundleId',
    'principalId',
    'amountMinor',
    'currency',
    'effect',
    'settlementId',
    'providerReference',
  ])) return null
  const expectedEffect = request.amountMinor > 0 ? 'charged' : 'refunded'
  if (
    value.ok !== true
    || value.contract !== EFFECT_CONTRACT
    || value.providerBacked !== true
    || value.idempotencyKey !== request.cascadeId
    || value.cascadeId !== request.cascadeId
    || value.bundleId !== request.bundleId
    || value.principalId !== request.principalId
    || value.amountMinor !== request.amountMinor
    || value.currency !== request.currency
    || value.effect !== expectedEffect
    || !isIdentifier(value.settlementId)
    || !isIdentifier(value.providerReference)
  ) return null
  return Object.freeze({
    ok: true,
    contract: EFFECT_CONTRACT,
    providerBacked: true,
    idempotencyKey: request.cascadeId,
    cascadeId: request.cascadeId,
    bundleId: request.bundleId,
    principalId: request.principalId,
    amountMinor: request.amountMinor,
    currency: request.currency,
    effect: expectedEffect,
    settlementId: value.settlementId,
    providerReference: value.providerReference,
  })
}

export const parseSemanticConflict = (
  value: unknown,
  request: NetSettlementRequest,
): SemanticConflict | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'ok', 'contract', 'code', 'idempotencyKey', 'definitive', 'effectApplied',
  ])) return null
  if (
    value.ok !== false
    || value.contract !== EFFECT_CONTRACT
    || value.code !== 'idempotency-conflict'
    || value.idempotencyKey !== request.cascadeId
    || value.definitive !== true
    || value.effectApplied !== false
  ) return null
  return Object.freeze({
    ok: false,
    contract: EFFECT_CONTRACT,
    code: 'idempotency-conflict',
    idempotencyKey: request.cascadeId,
    definitive: true,
    effectApplied: false,
  })
}

export const parseDefinitiveRejection = (
  value: unknown,
  request: NetSettlementRequest,
): DefinitiveRejection | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'ok', 'contract', 'code', 'idempotencyKey', 'definitive', 'effectApplied',
  ])) return null
  if (
    value.ok !== false
    || value.contract !== EFFECT_CONTRACT
    || value.code !== 'settlement-effect-rejected'
    || value.idempotencyKey !== request.cascadeId
    || value.definitive !== true
    || value.effectApplied !== false
  ) return null
  return Object.freeze({
    ok: false,
    contract: EFFECT_CONTRACT,
    code: 'settlement-effect-rejected',
    idempotencyKey: request.cascadeId,
    definitive: true,
    effectApplied: false,
  })
}

export const parseProviderReadiness = (value: unknown): ProviderReadiness | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'ok', 'contract', 'providerBacked', 'capability', 'authenticated', 'providerId',
  ])) return null
  if (
    value.ok !== true
    || value.contract !== EFFECT_CONTRACT
    || value.providerBacked !== true
    || value.capability !== 'settleNet'
    || value.authenticated !== true
    || !isIdentifier(value.providerId)
  ) return null
  return Object.freeze({
    ok: true,
    contract: EFFECT_CONTRACT,
    providerBacked: true,
    capability: 'settleNet',
    authenticated: true,
    providerId: value.providerId,
  })
}

const declaredLengthIsAllowed = (header: string | null, limit: number): boolean => {
  if (header === null) return true
  if (!/^(?:0|[1-9][0-9]*)$/.test(header)) return false
  const length = Number(header)
  return Number.isSafeInteger(length) && length <= limit
}

export const readBoundedBytes = async (
  body: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  limit: number,
): Promise<Uint8Array | null> => {
  if (!declaredLengthIsAllowed(declaredLength, limit)) {
    if (body) {
      try {
        await body.cancel('declared-body-too-large')
      } catch {
        // The caller still fails closed if an already-errored stream cannot be cancelled.
      }
    }
    return null
  }
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > limit) {
        await reader.cancel('body-too-large')
        return null
      }
      chunks.push(next.value)
    }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const parseJsonBytes = (bytes: Uint8Array): unknown | null => {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export const isCanonicalJsonBytes = (bytes: Uint8Array, value: unknown): boolean => {
  let canonical: Uint8Array
  try {
    canonical = new TextEncoder().encode(JSON.stringify(value))
  } catch {
    return false
  }
  if (canonical.byteLength !== bytes.byteLength) return false
  return canonical.every((byte, index) => byte === bytes[index])
}
