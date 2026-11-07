import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { extractEmbeddedGeoJsonFeatureCollections } from '@/lib/markdown/embeddedGeoJson'

export const LOCAL_POI_MAX_BYTES = 500_000
export const LOCAL_POI_VISIBLE_LIMIT = 50

export type LocalPoiPrecision = 'exact' | 'coarse'
export type LocalPoiCategory = 'shop' | 'store' | 'f&b' | 'plantation' | 'property'
export type LocalPoiProperties = {
  id: string
  name: string
  name_ms?: string
  name_zh?: string
  category: LocalPoiCategory | 'Region'
  region: string
  source: string
  source_ref: string
  updated: string
  license_ref: string
  precision: LocalPoiPrecision
  localPoiRole: 'place' | 'region'
  label: string
  kgCategory: string
  kgLabelVisible: boolean
  kgFillColor?: string
  kgFillOpacity?: number
}
export type LocalPoiFeature = Feature<Geometry, LocalPoiProperties>
export type LocalPoiFeatureCollection = FeatureCollection<Geometry, LocalPoiProperties> & { attribution: string }

export type LocalPoiManifest = {
  schema: 'agentic-graph/local-poi-manifest/v1'
  source: string
  license: string
  attribution: string
  inputBytes: number
  outputBytes: number
  inputSha256: string
  outputSha256: string
  sourceAsOf: string
  operatorAttestations: {
    rights: true
    publicFields: true
    exactPoints: boolean
    coarseRegionPolygons: boolean
  }
  pointCount: number
  regionCount: number
  withheldCount: number
  categories: string[]
  categoryCounts: Record<string, number>
}

export type LocalPoiApproval = {
  source: string
  license: string
  attribution: string
  rightsAttested: boolean
  publicFieldsReviewed: boolean
  approvedExactPoints: boolean
  approvedRegionPolygons: boolean
}

export type LocalPoiValidationResult =
  | { ok: true; featureCollection: LocalPoiFeatureCollection; manifest: LocalPoiManifest }
  | { ok: false; error: string }

const GEOSTACK_PLACES_SOURCE_PATH = 'docs/workspace-seeds/agentic-graph-maps-places.md'
const GEOSTACK_DEMO_SOURCE = 'geostack-synthetic-demo'
const GEOSTACK_DEMO_LICENSE = 'generated-demo-data'
const GEOSTACK_DEMO_ATTRIBUTION = 'Synthetic demonstration data; no real businesses or site recommendation.'
const GEOSTACK_DEMO_CATEGORIES = new Set<LocalPoiCategory>(['shop', 'store', 'f&b', 'plantation', 'property'])

type RecordValue = Record<string, unknown>

const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

/** Read only the canonical synthetic places fixture already used by the active map. */
export function buildActiveGeoStackPlacesPreview(sourcePath: string, markdownText: string): LocalPoiFeatureCollection | null {
  const normalizedPath = String(sourcePath || '').replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
  if (normalizedPath !== GEOSTACK_PLACES_SOURCE_PATH) return null
  const block = extractEmbeddedGeoJsonFeatureCollections(markdownText).find(candidate =>
    (candidate.featureCollection as unknown as RecordValue).attribution === GEOSTACK_DEMO_ATTRIBUTION,
  )
  if (!block) return null

  const features: LocalPoiFeature[] = []
  let pointCount = 0
  let regionCount = 0
  for (const raw of block.featureCollection.features) {
    if (!isRecord(raw) || !isRecord(raw.properties) || !isRecord(raw.geometry)) return null
    const props = raw.properties
    const id = boundedText(raw.id, 120)
    const name = boundedText(props.name, 120)
    const region = boundedText(props.region, 80)
    const sourceRef = boundedText(props.source_ref, 120)
    const updated = typeof props.updated === 'string' ? props.updated.trim() : ''
    if (!id?.startsWith('synthetic:demo-') || !name?.startsWith('Synthetic Demo') || !region || !sourceRef
      || props.source !== GEOSTACK_DEMO_SOURCE || props.license_ref !== GEOSTACK_DEMO_LICENSE || !isIsoDate(updated)) return null

    let role: 'place' | 'region'
    let category: LocalPoiProperties['category']
    let geometry: Geometry
    if (raw.geometry.type === 'Point' && props.precision === 'exact') {
      const coordinates = normalizePosition(raw.geometry.coordinates)
      const rawCategory = boundedText(props.category, 60)?.toLowerCase() ?? ''
      if (!coordinates || !GEOSTACK_DEMO_CATEGORIES.has(rawCategory as LocalPoiCategory)) return null
      role = 'place'
      category = rawCategory as LocalPoiCategory
      geometry = { type: 'Point', coordinates }
      pointCount += 1
    } else if (raw.geometry.type === 'Polygon' && props.role === 'region' && props.precision === 'coarse') {
      const coordinates = normalizePolygon(raw.geometry.coordinates)
      if (!coordinates || id !== 'synthetic:demo-region') return null
      role = 'region'
      category = 'Region'
      geometry = { type: 'Polygon', coordinates }
      regionCount += 1
    } else return null

    features.push({
      type: 'Feature', id, geometry,
      properties: {
        id, name, category,
        region,
        source: GEOSTACK_DEMO_SOURCE,
        source_ref: sourceRef,
        updated,
        license_ref: GEOSTACK_DEMO_LICENSE,
        precision: props.precision as LocalPoiPrecision,
        localPoiRole: role,
        label: name,
        kgCategory: category,
        kgLabelVisible: role === 'place',
        ...(role === 'region' ? { kgFillColor: '#2563eb', kgFillOpacity: 0.2 } : {}),
      },
    })
  }
  if (pointCount !== 6 || regionCount !== 1) return null
  return {
    type: 'FeatureCollection',
    attribution: GEOSTACK_DEMO_ATTRIBUTION,
    features,
  }
}

const boundedText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/u.test(text)) return null
  return text
}

const hasEmailAddress = (value: string): boolean =>
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)

const hasPhoneNumber = (value: string): boolean => {
  const candidates: string[] = value.match(/(?:\+\d[\d().\s-]{5,}\d|\(\d{2,}\)[\d\s.-]{4,}\d|\d{2,}[-\s]\d{2,}[-\s]\d{2,})/gu) || []
  return candidates.some(candidate => {
    const digits = candidate.replace(/\D/gu, '').length
    return digits >= 7 && digits <= 15
  })
}

const hasContactDetails = (value: string): boolean => hasEmailAddress(value) || hasPhoneNumber(value)

const normalizeMetadata = (value: unknown): string | null => boundedText(value, 240)

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const LOCAL_POI_CATEGORIES = new Set<LocalPoiCategory>(['shop', 'store', 'f&b', 'plantation', 'property'])

const sha256 = async (value: Uint8Array): Promise<string | null> => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  const digest = await subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const normalizePosition = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null
  const longitude = value[0]
  const latitude = value[1]
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null
  return [longitude, latitude]
}

const normalizeRing = (value: unknown): Array<[number, number]> | null => {
  if (!Array.isArray(value) || value.length < 4) return null
  const positions = value.map(normalizePosition)
  if (positions.some(position => position === null)) return null
  const normalized = positions as Array<[number, number]>
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return null
  return normalized
}

const normalizePolygon = (value: unknown): Array<Array<[number, number]>> | null => {
  if (!Array.isArray(value) || value.length === 0) return null
  const rings = value.map(normalizeRing)
  if (rings.some(ring => ring === null)) return null
  return rings as Array<Array<[number, number]>>
}

const normalizeMultiPolygon = (value: unknown): Array<Array<Array<[number, number]>>> | null => {
  if (!Array.isArray(value) || value.length === 0) return null
  const polygons = value.map(normalizePolygon)
  if (polygons.some(polygon => polygon === null)) return null
  return polygons as Array<Array<Array<[number, number]>>>
}

export async function validateLocalPoiGeoJson(
  text: string,
  sourceBytes: Uint8Array,
  approval: LocalPoiApproval,
): Promise<LocalPoiValidationResult> {
  const inputBytes = sourceBytes.byteLength
  if (!Number.isFinite(inputBytes) || inputBytes <= 0 || inputBytes > LOCAL_POI_MAX_BYTES) {
    return { ok: false, error: 'Choose a GeoJSON file of 500 kB or less.' }
  }
  const source = normalizeMetadata(approval.source)
  const license = normalizeMetadata(approval.license)
  const attribution = normalizeMetadata(approval.attribution)
  if (!source || !license || !attribution) {
    return { ok: false, error: 'Enter the source, license, and required attribution before loading the file.' }
  }
  if ([source, license, attribution].some(hasContactDetails)) {
    return { ok: false, error: 'Use public source, license, and attribution text without personal contact details.' }
  }
  if (!approval.rightsAttested) {
    return { ok: false, error: 'Confirm that you have rights to use this dataset and provide its attribution.' }
  }
  if (!approval.publicFieldsReviewed) {
    return { ok: false, error: 'Confirm that public fields contain no personal names or contact details.' }
  }

  try {
    const decodedSource = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes).replace(/^\uFEFF/u, '')
    const parsedSource = String(text || '').replace(/^\uFEFF/u, '')
    if (decodedSource !== parsedSource) {
      return { ok: false, error: 'The parsed text does not match the selected file bytes.' }
    }
  } catch {
    return { ok: false, error: 'The selected file must be readable UTF-8 GeoJSON.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(String(text || '').replace(/^\uFEFF/u, '')) as unknown
  } catch {
    return { ok: false, error: 'The selected file is not valid JSON.' }
  }
  if (!isRecord(parsed) || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    return { ok: false, error: 'Use a GeoJSON FeatureCollection.' }
  }

  const features: LocalPoiFeature[] = []
  const usedIds = new Set<string>()
  const categories = new Set<string>()
  const categoryCounts = new Map<string, number>()
  let pointCount = 0
  let regionCount = 0
  let withheldCount = 0

  for (let index = 0; index < parsed.features.length; index += 1) {
    const raw = parsed.features[index]
    if (!isRecord(raw) || raw.type !== 'Feature' || !isRecord(raw.geometry)) {
      withheldCount += 1
      continue
    }
    const geometryRecord = raw.geometry
    const properties = isRecord(raw.properties) ? raw.properties : {}
    const precision = properties.precision
    let geometry: Geometry | null = null
    let role: 'place' | 'region'
    const categoryValue = (boundedText(properties.category, 60) ?? '').toLowerCase()

    if (geometryRecord.type === 'Point') {
      if (precision !== 'exact' || !approval.approvedExactPoints) {
        withheldCount += 1
        continue
      }
      const coordinates = normalizePosition(geometryRecord.coordinates)
      if (!coordinates) return { ok: false, error: `Feature ${index + 1} has invalid point coordinates.` }
      geometry = { type: 'Point', coordinates }
      role = 'place'
      if (!LOCAL_POI_CATEGORIES.has(categoryValue as LocalPoiCategory)) {
        return { ok: false, error: `Feature ${index + 1} has an unsupported category.` }
      }
    } else if (geometryRecord.type === 'Polygon' || geometryRecord.type === 'MultiPolygon') {
      if (properties.role !== 'region' || precision !== 'coarse' || !approval.approvedRegionPolygons) {
        withheldCount += 1
        continue
      }
      if (geometryRecord.type === 'Polygon') {
        const coordinates = normalizePolygon(geometryRecord.coordinates)
        if (!coordinates) return { ok: false, error: `Feature ${index + 1} has invalid region geometry.` }
        geometry = { type: 'Polygon', coordinates }
      } else {
        const coordinates = normalizeMultiPolygon(geometryRecord.coordinates)
        if (!coordinates) return { ok: false, error: `Feature ${index + 1} has invalid region geometry.` }
        geometry = { type: 'MultiPolygon', coordinates }
      }
      role = 'region'
    } else {
      withheldCount += 1
      continue
    }

    const rawId = boundedText(raw.id ?? properties.id, 120)
    if (!rawId || !/^[^:\s]+:[^:\s]+$/u.test(rawId)) {
      return { ok: false, error: `Feature ${index + 1} needs a stable source:id value.` }
    }
    if (usedIds.has(rawId)) return { ok: false, error: `Feature ${index + 1} repeats a stable ID.` }
    usedIds.add(rawId)
    const id = rawId
    const name = boundedText(properties.name, 120)
    const region = boundedText(properties.region, 80)
    const sourceRef = boundedText(properties.source_ref ?? rawId.split(':').slice(1).join(':'), 120)
    const updated = typeof properties.updated === 'string' ? properties.updated.trim() : ''
    if (!name || !region || !sourceRef || !isIsoDate(updated)) {
      return { ok: false, error: `Feature ${index + 1} is missing name, region, source reference, or ISO update date.` }
    }
    const rawSourceName = properties.source
    const rawLicenseRef = properties.license_ref
    const sourceName = rawSourceName == null || rawSourceName === '' ? source : boundedText(rawSourceName, 120)
    const licenseRef = rawLicenseRef == null || rawLicenseRef === '' ? license : boundedText(rawLicenseRef, 120)
    if (!sourceName || !licenseRef || /[\u0000-\u001f\u007f]/u.test(updated) || updated.length > 10) {
      return { ok: false, error: `Feature ${index + 1} has invalid provenance fields.` }
    }
    if ([rawId, sourceName, licenseRef].some(hasContactDetails)) {
      return { ok: false, error: `Feature ${index + 1} includes personal contact details in its provenance fields.` }
    }
    const category = role === 'place'
      ? categoryValue as LocalPoiCategory
      : 'Region'
    const rawNameMs = properties.name_ms == null ? '' : properties.name_ms
    const rawNameZh = properties.name_zh == null ? '' : properties.name_zh
    const nameMs = rawNameMs ? boundedText(rawNameMs, 120) : null
    const nameZh = rawNameZh ? boundedText(rawNameZh, 120) : null
    if ((rawNameMs && !nameMs) || (rawNameZh && !nameZh)) {
      return { ok: false, error: `Feature ${index + 1} has an invalid search alias.` }
    }
    if ([name, region, sourceRef, nameMs, nameZh].some(value => value !== null && hasContactDetails(value))) {
      return { ok: false, error: `Feature ${index + 1} includes an email address or phone number in a public directory field.` }
    }
    const outputProperties: LocalPoiProperties = {
      id,
      name,
      category,
      ...(nameMs ? { name_ms: nameMs } : {}),
      ...(nameZh ? { name_zh: nameZh } : {}),
      region,
      source: sourceName,
      source_ref: sourceRef,
      updated,
      license_ref: licenseRef,
      precision: precision as LocalPoiPrecision,
      localPoiRole: role,
      label: name,
      kgCategory: category,
      kgLabelVisible: role === 'place',
      ...(role === 'region' ? { kgFillColor: '#2563eb', kgFillOpacity: 0.2 } : {}),
    }
    features.push({ type: 'Feature', id, properties: outputProperties, geometry })
    if (role === 'place') {
      pointCount += 1
      categories.add(category)
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
    } else {
      regionCount += 1
    }
  }

  if (features.length === 0) return { ok: false, error: 'No approved places or region polygons remain after validation.' }

  const featureCollection: LocalPoiFeatureCollection = { type: 'FeatureCollection', attribution, features }
  const outputText = JSON.stringify(featureCollection)
  const outputBytesBuffer = new TextEncoder().encode(outputText)
  const outputBytes = outputBytesBuffer.byteLength
  if (outputBytes > LOCAL_POI_MAX_BYTES) {
    return { ok: false, error: 'Allowlisted output exceeds 500 kB; reduce the local dataset before export.' }
  }
  let inputSha256: string | null
  let outputSha256: string | null
  try {
    [inputSha256, outputSha256] = await Promise.all([sha256(sourceBytes), sha256(outputBytesBuffer)])
  } catch {
    return { ok: false, error: 'SHA-256 manifest generation failed; no dataset was loaded.' }
  }
  if (!inputSha256 || !outputSha256) {
    return { ok: false, error: 'SHA-256 is unavailable in this browser; no dataset was loaded.' }
  }
  const sourceAsOf = features.reduce((latest, feature) =>
    feature.properties.updated > latest ? feature.properties.updated : latest, '')
  return {
    ok: true,
    featureCollection,
    manifest: {
      schema: 'agentic-graph/local-poi-manifest/v1',
      source,
      license,
      attribution,
      inputBytes,
      outputBytes,
      inputSha256,
      outputSha256,
      sourceAsOf,
      operatorAttestations: {
        rights: true,
        publicFields: true,
        exactPoints: approval.approvedExactPoints,
        coarseRegionPolygons: approval.approvedRegionPolygons,
      },
      pointCount,
      regionCount,
      withheldCount,
      categories: [...categories].sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
      categoryCounts: Object.fromEntries([...categoryCounts].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)),
    },
  }
}

export function searchLocalPoiFeatures(
  featureCollection: LocalPoiFeatureCollection,
  query: string,
  category: string,
): LocalPoiFeature[] {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  return featureCollection.features.filter(feature => {
    const properties = feature.properties
    if (properties.localPoiRole === 'region' && (!normalizedQuery || category !== 'all')) return false
    if (category !== 'all' && properties.category !== category) return false
    if (!normalizedQuery) return true
    return `${properties.name}\n${properties.name_ms ?? ''}\n${properties.name_zh ?? ''}\n${properties.category}\n${properties.region}`
      .toLowerCase().includes(normalizedQuery)
  })
}

export function limitLocalPoiVisibleFeatures(features: LocalPoiFeature[]): LocalPoiFeature[] {
  return features.slice(0, LOCAL_POI_VISIBLE_LIMIT)
}
