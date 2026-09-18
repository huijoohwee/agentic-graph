export type KeyTypeValue = Record<string, unknown> & { key: string; type: string; value: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// A field is one envelope. Never recursively unwrap its object payload: that
// payload may itself legitimately contain key/type/value or a domain value key.
function envelopeError(raw: unknown, expectedKey?: string): string | null {
  if (!isRecord(raw) || Object.keys(raw).length !== 3
    || !Object.hasOwn(raw, 'key') || !Object.hasOwn(raw, 'type') || !Object.hasOwn(raw, 'value')) {
    return 'expected exact { key, type, value } wrapper'
  }
  if (typeof raw.key !== 'string' || !raw.key.trim()) return 'wrapper key must be a non-empty string'
  if (expectedKey && raw.key !== expectedKey) return `expected key "${expectedKey}" but found "${raw.key}"`
  if (typeof raw.type !== 'string' || !raw.type.trim()) return 'wrapper type must be a non-empty string'
  const actualType = raw.value === null ? 'null' : Array.isArray(raw.value) ? 'array' : typeof raw.value
  // Semantic types (markdown, url, image, etc.) belong to their existing schema
  // owners. Primitive types never coerce values; function source stays text.
  const expectedType = raw.type === 'function' ? 'string' : raw.type
  if (['string', 'number', 'boolean', 'object', 'array', 'null'].includes(expectedType)
    && (actualType !== expectedType || (expectedType === 'number' && !Number.isFinite(raw.value)))) {
    return `type "${raw.type}" does not match ${actualType} value`
  }
  return null
}

export function isKeyTypeValue(raw: unknown, expectedKey?: string): raw is KeyTypeValue {
  return envelopeError(raw, expectedKey) === null
}

export function unwrapKeyTypeValue(raw: unknown, expectedKey?: string): unknown {
  return isKeyTypeValue(raw, expectedKey) ? raw.value : raw
}

export function readKeyTypeValueField(args: {
  raw: unknown
  path: string
  expectedKey?: string
  warnings: string[]
  requireTyped?: boolean
}): unknown {
  const { raw, path, expectedKey, warnings, requireTyped = false } = args
  if (isKeyTypeValue(raw, expectedKey)) return raw.value
  const looksLikeEnvelope = isRecord(raw) && (Object.hasOwn(raw, 'key') || Object.hasOwn(raw, 'type')
    || (Object.hasOwn(raw, 'value') && Object.keys(raw).length === 1))
  if (looksLikeEnvelope) {
    warnings.push(`Flow typed envelope malformed at ${path}: ${envelopeError(raw, expectedKey)}`)
  } else if (requireTyped) {
    warnings.push(`Flow typed envelope required at ${path}`)
  }
  return raw
}

export function normalizeKeyTypeValueRecord(args: {
  rawRecord: Record<string, unknown>
  recordPath: string
  warnings: string[]
  requireTyped?: boolean
}): Record<string, unknown> {
  const { rawRecord, recordPath, warnings, requireTyped } = args
  return Object.fromEntries(Object.entries(rawRecord).map(([key, raw]) => [
    key,
    readKeyTypeValueField({ raw, path: `${recordPath}.${key}`, expectedKey: key, warnings, requireTyped }),
  ]))
}
