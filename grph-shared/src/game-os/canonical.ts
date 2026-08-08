import { hashStringToHex } from '../hash/stringHash.js'
import type { GameOsJsonValue } from './types.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value == null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export const compareGameOsText = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1

export const canonicalizeGameOsValue = (value: unknown, path = '$'): GameOsJsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value as GameOsJsonValue
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite numbers.`)
    return Object.is(value, -0) ? 0 : value
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalizeGameOsValue(entry, `${path}[${index}]`))
  }
  if (!isPlainObject(value)) throw new TypeError(`${path} must be canonical JSON data.`)
  const canonical: Record<string, GameOsJsonValue> = {}
  for (const key of Object.keys(value).sort(compareGameOsText)) {
    const child = value[key]
    if (child === undefined) throw new TypeError(`${path}.${key} must not be undefined.`)
    canonical[key] = canonicalizeGameOsValue(child, `${path}.${key}`)
  }
  return canonical
}

export const canonicalGameOsString = (value: unknown): string =>
  JSON.stringify(canonicalizeGameOsValue(value))

export const canonicalGameOsBytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(canonicalGameOsString(value))

export const gameOsDigest = (value: unknown): string =>
  `fnv1a32:${hashStringToHex(canonicalGameOsString(value))}`

export const cloneCanonicalGameOsValue = <Value>(value: Value): Value =>
  JSON.parse(canonicalGameOsString(value)) as Value

export const deepFreezeGameOsValue = <Value>(value: Value): Readonly<Value> => {
  if (value != null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeGameOsValue(child)
    }
    Object.freeze(value)
  }
  return value
}
