import type { JSONValue } from '@/lib/graph/types'
import { readKeyTypeValueField } from '@/lib/graph/keyTypeValue'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const toJsonValue = (value: unknown): JSONValue | undefined => {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const out: JSONValue[] = []
    for (let i = 0; i < value.length; i += 1) {
      const item = toJsonValue(value[i])
      if (typeof item !== 'undefined') out.push(item)
    }
    return out
  }
  if (isRecord(value)) {
    const out: Record<string, JSONValue> = {}
    for (const [key, raw] of Object.entries(value)) {
      const item = toJsonValue(raw)
      if (typeof item !== 'undefined') out[key] = item
    }
    return out
  }
  return undefined
}

export const readString = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : (typeof value === 'number' || typeof value === 'boolean')
      ? String(value).trim()
      : ''

export const unwrapStructuredFieldValue = (raw: unknown, key: string): unknown =>
  readKeyTypeValueField({
    raw,
    path: `structuredContent.${key}`,
    expectedKey: key || undefined,
    warnings: [],
  })

export const mergeStructuredProperties = (record: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...record }
  const assignIfMissing = (keyRaw: unknown, valueRaw: unknown) => {
    const key = readString(unwrapStructuredFieldValue(keyRaw, 'key'))
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) return
    out[key] = unwrapStructuredFieldValue(valueRaw, key)
  }
  const properties = record.properties
  if (isRecord(properties)) {
    for (const [key, value] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(out, key)) continue
      out[key] = unwrapStructuredFieldValue(value, key)
    }
  } else if (Array.isArray(properties)) {
    for (const item of properties) {
      if (!isRecord(item)) continue
      assignIfMissing(item.key, item)
    }
  }
  return out
}

export const readFieldValue = (record: Record<string, unknown>, key: string): unknown =>
  unwrapStructuredFieldValue(record[key], key)

export const readFirstString = (record: Record<string, unknown>, keys: readonly string[]): string => {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i] as string
    const value = readString(readFieldValue(record, key))
    if (value) return value
  }
  return ''
}
