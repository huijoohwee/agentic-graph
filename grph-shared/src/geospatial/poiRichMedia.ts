import type { JSONValue } from '../graph/types.js'
import { hashSignatureParts } from '../hash/signature.js'

export type GeoPoiRichMediaProperties = Record<string, JSONValue>

export type GeoPoiRichMediaRow = {
  key: string
  label: string
  value: string
}

const MAX_PROPERTY_DEPTH = 4
const MAX_OBJECT_KEYS = 80
const MAX_ARRAY_ITEMS = 80
const MAX_ROW_VALUE_LENGTH = 220

const ADDRESS_KEYS = [
  'formatted_address',
  'formatted address',
  'display_address',
  'display address',
  'address',
  'vicinity',
  'street_address',
  'street address',
  'street',
] as const

const CATEGORY_KEYS = [
  'business_type',
  'business type',
  'category',
  'agenticOsategory',
  'kg category',
  'cat',
  'kind',
  'type',
  'region type',
] as const

const SOURCE_LABELS: Record<string, string> = {
  kgSourceDocumentPath: 'Source document',
  kgSourceTableStartLine: 'Source table line',
}

const READ_ONLY_KEYS = new Set([
  'id',
  'label',
  'name',
  'title',
  'geo',
  'geometry',
  'coordinates',
  'coordinate',
  'coords',
  'lat',
  'latitude',
  'lng',
  'lon',
  'longitude',
  'x',
  'y',
])

const normalizeLookupKey = (value: unknown): string => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
)

const normalizeCaseKey = (value: unknown): string => normalizeLookupKey(value).replace(/\s+/g, '')

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)

const normalizeJsonValue = (value: unknown, depth: number): JSONValue | undefined => {
  if (value === null) return null
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? text : undefined
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    if (depth <= 0) return undefined
    const out: JSONValue[] = []
    const limit = Math.min(value.length, MAX_ARRAY_ITEMS)
    for (let i = 0; i < limit; i += 1) {
      const normalized = normalizeJsonValue(value[i], depth - 1)
      if (normalized === undefined) continue
      out.push(normalized)
    }
    return out.length ? out : undefined
  }
  if (isPlainRecord(value)) {
    if (depth <= 0) return undefined
    const out: Record<string, JSONValue> = {}
    const keys = Object.keys(value).slice(0, MAX_OBJECT_KEYS)
    for (const key of keys) {
      const trimmedKey = String(key || '').trim()
      if (!trimmedKey) continue
      const normalized = normalizeJsonValue(value[key], depth - 1)
      if (normalized === undefined) continue
      out[trimmedKey] = normalized
    }
    return Object.keys(out).length ? out : undefined
  }
  return undefined
}

export function normalizeGeoPoiRichMediaProperties(value: unknown): GeoPoiRichMediaProperties {
  if (!isPlainRecord(value)) return {}
  const normalized = normalizeJsonValue(value, MAX_PROPERTY_DEPTH)
  return isPlainRecord(normalized) ? normalized as GeoPoiRichMediaProperties : {}
}

const readPropertyBySemanticKey = (
  properties: GeoPoiRichMediaProperties | null | undefined,
  keys: readonly string[],
): JSONValue | undefined => {
  if (!properties) return undefined
  const wanted = new Set(keys.map(normalizeCaseKey).filter(Boolean))
  if (wanted.size === 0) return undefined
  for (const [key, value] of Object.entries(properties)) {
    if (!wanted.has(normalizeCaseKey(key))) continue
    return value
  }
  return undefined
}

const stringifyPropertyValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    const parts = value.map(stringifyPropertyValue).filter(Boolean)
    return parts.join(', ')
  }
  if (isPlainRecord(value)) {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value || '').trim()
}

export function readGeoPoiPropertyText(
  properties: GeoPoiRichMediaProperties | null | undefined,
  keys: readonly string[],
): string {
  return stringifyPropertyValue(readPropertyBySemanticKey(properties, keys))
}

export function resolveGeoPoiAddressFromProperties(
  properties: GeoPoiRichMediaProperties | null | undefined,
): string {
  const direct = readGeoPoiPropertyText(properties, ADDRESS_KEYS)
  if (direct) return direct
  const street = readGeoPoiPropertyText(properties, ['street'])
  const postcode = readGeoPoiPropertyText(properties, ['postcode', 'postal', 'postal code'])
  const city = readGeoPoiPropertyText(properties, ['city'])
  const country = readGeoPoiPropertyText(properties, ['country_code', 'country code', 'country'])
  return [street, postcode, city, country].filter(Boolean).join(', ')
}

export function resolveGeoPoiCategoryFromProperties(
  properties: GeoPoiRichMediaProperties | null | undefined,
): string {
  return readGeoPoiPropertyText(properties, CATEGORY_KEYS)
}

const formatPropertyLabel = (key: string): string => {
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key]
  const trimmed = String(key || '').trim()
  if (!trimmed) return ''
  if (/^[A-Z0-9*()/% .-]{1,12}$/.test(trimmed)) return trimmed
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase())
}

const truncateRowValue = (value: string): string => {
  const text = value.trim()
  if (text.length <= MAX_ROW_VALUE_LENGTH) return text
  return `${text.slice(0, MAX_ROW_VALUE_LENGTH - 1).trim()}...`
}

const rowRank = (key: string): number => {
  const normalized = normalizeLookupKey(key)
  if (/\b(rank|score|topsis|signal|verdict|decision|priority)\b/.test(normalized) || normalized === 'c*') return 0
  if (/\b(count|density|radius|distance|duration|time|eta|competition|catchment|accessibility|retail|residential|commercial|mall|mrt|transit)\b/.test(normalized)) return 1
  if (/\b(region|area|district|postcode|postal|business|category|type)\b/.test(normalized)) return 2
  if (/\b(source|document|line)\b/.test(normalized)) return 4
  return 3
}

export function buildGeoPoiRichMediaRows(args: {
  properties?: GeoPoiRichMediaProperties | null
  address?: string | null
  category?: string | null
  maxRows?: number | null
}): GeoPoiRichMediaRow[] {
  const properties = args.properties || {}
  const maxRows = Math.max(0, Math.floor(Number(args.maxRows ?? 18)))
  if (maxRows === 0) return []
  const address = String(args.address || '').trim().toLowerCase()
  const category = String(args.category || '').trim().toLowerCase()
  const rows: Array<GeoPoiRichMediaRow & { rank: number; index: number }> = []
  const seen = new Set<string>()
  let index = 0

  for (const [key, rawValue] of Object.entries(properties)) {
    const lookupKey = normalizeLookupKey(key)
    const caseKey = normalizeCaseKey(key)
    if (!lookupKey || READ_ONLY_KEYS.has(lookupKey) || READ_ONLY_KEYS.has(caseKey)) continue
    const value = truncateRowValue(stringifyPropertyValue(rawValue))
    if (!value) continue
    const valueKey = value.toLowerCase()
    const isAddressDuplicate = address && ADDRESS_KEYS.some(k => normalizeCaseKey(k) === caseKey) && valueKey === address
    const isCategoryDuplicate = category && CATEGORY_KEYS.some(k => normalizeCaseKey(k) === caseKey) && valueKey === category
    if (isAddressDuplicate || isCategoryDuplicate) continue
    const label = formatPropertyLabel(key)
    if (!label) continue
    const dedupKey = `${normalizeLookupKey(label)}:${valueKey}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    rows.push({ key, label, value, rank: rowRank(key), index })
    index += 1
  }

  rows.sort((left, right) => (
    left.rank - right.rank
    || left.index - right.index
    || left.label.localeCompare(right.label)
  ))
  return rows.slice(0, maxRows).map(({ rank: _rank, index: _index, ...row }) => row)
}

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return stringifyPropertyValue(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (!isPlainRecord(value)) return ''
  const keys = Object.keys(value).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function buildGeoPoiRichMediaSemanticKey(args: {
  label?: string | null
  lat?: number | null
  lng?: number | null
  properties?: GeoPoiRichMediaProperties | null
}): string {
  const lat = Number(args.lat)
  const lng = Number(args.lng)
  return hashSignatureParts([
    'geo-poi-rich-media',
    String(args.label || '').trim(),
    Number.isFinite(lat) ? lat.toFixed(6) : '',
    Number.isFinite(lng) ? lng.toFixed(6) : '',
    stableStringify(args.properties || {}),
  ])
}
