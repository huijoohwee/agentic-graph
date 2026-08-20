import type { MinorUnits, MutationEvent, Quote, Rejection } from './bundle-types'

export const MAX_BUNDLE_LEGS = 20
export const MAX_BUNDLE_EDGES = 20
export const DEFAULT_CASCADE_WALL_MS = 10_000
export const HOLD_TTL_MS = 120_000
export const CASCADE_RECOVERY_DELAY_MS = 1_000
export const CASCADE_RECOVERY_MAX_DELAY_MS = 300_000
export const SETTLEMENT_HOLD_PROTECTION_MS = 86_400_000
export const CASCADE_POST_DISCOVERY_RESERVE_MS = 2_500
export const CASCADE_POST_DISCOVERY_RESERVE_RATIO = 0.25

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CASCADE_ID_PATTERN = /^(?:[A-Za-z0-9]|~)[A-Za-z0-9._:~-]{0,510}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

export function isCascadeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && CASCADE_ID_PATTERN.test(value)
}

export function isMinorUnits(value: unknown): value is MinorUnits {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isSignedMinorUnits(value: unknown): value is MinorUnits {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function minorUnits(value: number): MinorUnits {
  if (!isMinorUnits(value)) throw new TypeError('minor-units-invalid')
  return value
}

export function signedMinorUnits(value: number): MinorUnits {
  if (!isSignedMinorUnits(value)) throw new TypeError('signed-minor-units-invalid')
  return value
}

export function isCurrency(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY_PATTERN.test(value)
}

export function readMutationEvent(value: unknown, bundleId: string): MutationEvent | Rejection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('mutation-event-malformed')
  const record = value as Record<string, unknown>
  const legId = record.leg_id
  const eventId = record.event_id
  if (!isIdentifier(bundleId) || !isIdentifier(legId) || !isIdentifier(eventId)) {
    return reject('mutation-event-malformed')
  }
  return Object.freeze({ bundleId, legId, eventId })
}

export function readQuote(value: unknown, expectedLegId: string): Quote | Rejection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('requote-malformed')
  const record = value as Record<string, unknown>
  if (
    record.kind !== 'offer'
    || record.legId !== expectedLegId
    || !isIdentifier(record.offerId)
    || !isIdentifier(record.agentId)
    || !isMinorUnits(record.amountMinor)
    || !isCurrency(record.currency)
    || (record.priceVerification !== 'verified' && record.priceVerification !== 'deterministic-demo')
    || !isMinorUnits(record.promptTokens)
    || !isMinorUnits(record.completionTokens)
    || typeof record.dollarCost !== 'number'
    || !Number.isFinite(record.dollarCost)
    || record.dollarCost < 0
  ) return reject('requote-malformed')
  const provenance = readStringRecord(record.provenance)
  if (!provenance) return reject('requote-malformed')
  return Object.freeze({
    kind: 'offer', legId: expectedLegId, offerId: record.offerId, amountMinor: record.amountMinor,
    currency: record.currency, priceVerification: record.priceVerification,
    agentId: record.agentId, promptTokens: record.promptTokens,
    completionTokens: record.completionTokens, dollarCost: record.dollarCost, provenance,
  })
}

export function cascadeIdFor(event: MutationEvent): string {
  const legacy = `${event.bundleId}:${event.legId}:${event.eventId}`
  if (
    legacy.length <= 128
    && !event.bundleId.includes(':')
    && !event.legId.includes(':')
    && !event.eventId.includes(':')
  ) return legacy
  return `~${encodeTuplePart(event.bundleId)}${encodeTuplePart(event.legId)}${encodeTuplePart(event.eventId)}`
}

export function reject(reason: string, details?: Rejection['details']): Rejection {
  return Object.freeze({ kind: 'rejected', reason, ...(details ? { details } : {}) })
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.some(([key, item]) => !isIdentifier(key) || typeof item !== 'string' || item.length > 1024)) return null
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>)
}

function encodeTuplePart(value: string): string {
  return `${value.length.toString(36)}:${value}`
}
