export type RegionalPoiCoordinate = readonly [
  longitude: number,
  latitude: number,
]

export type RegionalPoiLinearRing = readonly RegionalPoiCoordinate[]

export type RegionalPoiPolygon = Readonly<{
  type: 'Polygon'
  coordinates: readonly RegionalPoiLinearRing[]
}>

export type RegionalPoiSourceReference = Readonly<{
  authority: string
  sourceId: string
  sourceUrl: string
  sourceVersion: string
  snapshotAt: string
}>

export type RegionalPoiAccuracy = Readonly<{
  footprint: 'source-polygon'
  height: 'official-published' | 'source-recorded'
  statement: string
}>

export type RegionalPoiProvenance = Readonly<{
  geometry: RegionalPoiSourceReference
  height: RegionalPoiSourceReference
  context: readonly RegionalPoiSourceReference[]
}>

export type RegionalPoiSurface = Readonly<{
  id: string
  poiId: string
  label: string
  category: string
  geometry: RegionalPoiPolygon
  baseHeightMeters: number
  heightMeters: number
  accuracy: RegionalPoiAccuracy
  provenance: RegionalPoiProvenance
}>

export type RegionalPoiIdentity = Readonly<{
  id: string
  label: string
}>

export type RegionalPoiAttribution = Readonly<{
  text: string
  url: string
  licenseName: string
  licenseUrl: string
}>

export type RegionalPoiProfile = Readonly<{
  schema: 'knowgrph.regional-poi-profile/v1'
  id: string
  region: Readonly<{
    code: string
    label: string
  }>
  revision: string
  dataPolicy: Readonly<{
    storage: 'checked-in'
    runtimeNetwork: 'forbidden'
  }>
  attribution: readonly RegionalPoiAttribution[]
  pois: readonly RegionalPoiIdentity[]
  surfaces: readonly RegionalPoiSurface[]
}>

const PROFILE_KEYS = Object.freeze([
  'schema',
  'id',
  'region',
  'revision',
  'dataPolicy',
  'attribution',
  'pois',
  'surfaces',
])
const REGION_KEYS = Object.freeze(['code', 'label'])
const DATA_POLICY_KEYS = Object.freeze(['storage', 'runtimeNetwork'])
const ATTRIBUTION_KEYS = Object.freeze([
  'text',
  'url',
  'licenseName',
  'licenseUrl',
])
const IDENTITY_KEYS = Object.freeze(['id', 'label'])
const SURFACE_KEYS = Object.freeze([
  'id',
  'poiId',
  'label',
  'category',
  'geometry',
  'baseHeightMeters',
  'heightMeters',
  'accuracy',
  'provenance',
])
const GEOMETRY_KEYS = Object.freeze(['type', 'coordinates'])
const ACCURACY_KEYS = Object.freeze(['footprint', 'height', 'statement'])
const PROVENANCE_KEYS = Object.freeze(['geometry', 'height', 'context'])
const SOURCE_REFERENCE_KEYS = Object.freeze([
  'authority',
  'sourceId',
  'sourceUrl',
  'sourceVersion',
  'snapshotAt',
])

function assertRecord(value: unknown, label: string): asserts value is Record<
  string,
  unknown
> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
}

function assertExactKeys(
  value: object,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} must contain only ${expected.join(', ')}`)
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty trimmed string`)
  }
}

function assertUrl(value: unknown, label: string): asserts value is string {
  assertNonEmptyString(value, label)
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new TypeError(`${label} must use https`)
  }
}

function assertSnapshot(value: unknown, label: string): asserts value is string {
  assertNonEmptyString(value, label)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    throw new TypeError(`${label} must be a UTC second-precision timestamp`)
  }
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be a valid timestamp`)
  }
}

function cloneSourceReference(
  input: RegionalPoiSourceReference,
  label: string,
): RegionalPoiSourceReference {
  assertRecord(input, label)
  assertExactKeys(input, SOURCE_REFERENCE_KEYS, label)
  assertNonEmptyString(input.authority, `${label}.authority`)
  assertNonEmptyString(input.sourceId, `${label}.sourceId`)
  assertUrl(input.sourceUrl, `${label}.sourceUrl`)
  assertNonEmptyString(input.sourceVersion, `${label}.sourceVersion`)
  assertSnapshot(input.snapshotAt, `${label}.snapshotAt`)
  return Object.freeze({ ...input })
}

function cloneCoordinate(
  input: RegionalPoiCoordinate,
  label: string,
): RegionalPoiCoordinate {
  if (!Array.isArray(input) || input.length !== 2) {
    throw new TypeError(`${label} must be [longitude, latitude]`)
  }
  const [longitude, latitude] = input
  if (
    !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    throw new RangeError(`${label} longitude must be within [-180, 180]`)
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`${label} latitude must be within [-90, 90]`)
  }
  return Object.freeze([longitude, latitude])
}

function cloneRing(
  input: RegionalPoiLinearRing,
  label: string,
): RegionalPoiLinearRing {
  if (!Array.isArray(input) || input.length < 4) {
    throw new TypeError(`${label} must contain at least four coordinates`)
  }
  const ring = input.map((coordinate, index) => (
    cloneCoordinate(coordinate, `${label}[${index}]`)
  ))
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new TypeError(`${label} must be closed`)
  }
  return Object.freeze(ring)
}

function cloneSurface(
  input: RegionalPoiSurface,
  index: number,
): RegionalPoiSurface {
  const label = `surfaces[${index}]`
  assertRecord(input, label)
  assertExactKeys(input, SURFACE_KEYS, label)
  assertNonEmptyString(input.id, `${label}.id`)
  assertNonEmptyString(input.poiId, `${label}.poiId`)
  assertNonEmptyString(input.label, `${label}.label`)
  assertNonEmptyString(input.category, `${label}.category`)
  assertRecord(input.geometry, `${label}.geometry`)
  assertExactKeys(input.geometry, GEOMETRY_KEYS, `${label}.geometry`)
  if (input.geometry.type !== 'Polygon') {
    throw new TypeError(`${label}.geometry.type must be Polygon`)
  }
  if (!Array.isArray(input.geometry.coordinates) || input.geometry.coordinates.length === 0) {
    throw new TypeError(`${label}.geometry.coordinates must contain a ring`)
  }
  const coordinates = Object.freeze(input.geometry.coordinates.map(
    (ring, ringIndex) => cloneRing(
      ring,
      `${label}.geometry.coordinates[${ringIndex}]`,
    ),
  ))
  if (!Number.isFinite(input.baseHeightMeters) || input.baseHeightMeters < 0) {
    throw new RangeError(`${label}.baseHeightMeters must be finite and non-negative`)
  }
  if (
    !Number.isFinite(input.heightMeters)
    || input.heightMeters <= input.baseHeightMeters
  ) {
    throw new RangeError(`${label}.heightMeters must exceed its base height`)
  }
  assertRecord(input.accuracy, `${label}.accuracy`)
  assertExactKeys(input.accuracy, ACCURACY_KEYS, `${label}.accuracy`)
  if (input.accuracy.footprint !== 'source-polygon') {
    throw new TypeError(`${label}.accuracy.footprint is unsupported`)
  }
  if (
    input.accuracy.height !== 'source-recorded'
    && input.accuracy.height !== 'official-published'
  ) {
    throw new TypeError(`${label}.accuracy.height is unsupported`)
  }
  assertNonEmptyString(input.accuracy.statement, `${label}.accuracy.statement`)
  assertRecord(input.provenance, `${label}.provenance`)
  assertExactKeys(input.provenance, PROVENANCE_KEYS, `${label}.provenance`)
  if (!Array.isArray(input.provenance.context)) {
    throw new TypeError(`${label}.provenance.context must be an array`)
  }

  return Object.freeze({
    id: input.id,
    poiId: input.poiId,
    label: input.label,
    category: input.category,
    geometry: Object.freeze({ type: 'Polygon', coordinates }),
    baseHeightMeters: input.baseHeightMeters,
    heightMeters: input.heightMeters,
    accuracy: Object.freeze({ ...input.accuracy }),
    provenance: Object.freeze({
      geometry: cloneSourceReference(
        input.provenance.geometry,
        `${label}.provenance.geometry`,
      ),
      height: cloneSourceReference(
        input.provenance.height,
        `${label}.provenance.height`,
      ),
      context: Object.freeze(input.provenance.context.map(
        (source, sourceIndex) => cloneSourceReference(
          source,
          `${label}.provenance.context[${sourceIndex}]`,
        ),
      )),
    }),
  })
}

export function createRegionalPoiProfile(
  input: RegionalPoiProfile,
): RegionalPoiProfile {
  assertRecord(input, 'profile')
  assertExactKeys(input, PROFILE_KEYS, 'profile')
  if (input.schema !== 'knowgrph.regional-poi-profile/v1') {
    throw new TypeError('profile.schema is unsupported')
  }
  assertNonEmptyString(input.id, 'profile.id')
  assertRecord(input.region, 'profile.region')
  assertExactKeys(input.region, REGION_KEYS, 'profile.region')
  assertNonEmptyString(input.region.code, 'profile.region.code')
  assertNonEmptyString(input.region.label, 'profile.region.label')
  assertNonEmptyString(input.revision, 'profile.revision')
  assertRecord(input.dataPolicy, 'profile.dataPolicy')
  assertExactKeys(input.dataPolicy, DATA_POLICY_KEYS, 'profile.dataPolicy')
  if (
    input.dataPolicy.storage !== 'checked-in'
    || input.dataPolicy.runtimeNetwork !== 'forbidden'
  ) {
    throw new TypeError('profile.dataPolicy must require checked-in offline data')
  }
  if (
    !Array.isArray(input.attribution)
    || input.attribution.length === 0
    || !Array.isArray(input.pois)
    || input.pois.length === 0
    || !Array.isArray(input.surfaces)
    || input.surfaces.length === 0
  ) {
    throw new TypeError('profile requires attribution, POIs, and surfaces')
  }

  const attribution = Object.freeze(input.attribution.map((entry, index) => {
    const label = `profile.attribution[${index}]`
    assertRecord(entry, label)
    assertExactKeys(entry, ATTRIBUTION_KEYS, label)
    assertNonEmptyString(entry.text, `${label}.text`)
    assertUrl(entry.url, `${label}.url`)
    assertNonEmptyString(entry.licenseName, `${label}.licenseName`)
    assertUrl(entry.licenseUrl, `${label}.licenseUrl`)
    return Object.freeze({
      text: entry.text,
      url: entry.url,
      licenseName: entry.licenseName,
      licenseUrl: entry.licenseUrl,
    })
  }))
  const pois = Object.freeze(input.pois.map((poi, index) => {
    const label = `profile.pois[${index}]`
    assertRecord(poi, label)
    assertExactKeys(poi, IDENTITY_KEYS, label)
    assertNonEmptyString(poi.id, `${label}.id`)
    assertNonEmptyString(poi.label, `${label}.label`)
    return Object.freeze({
      id: poi.id,
      label: poi.label,
    })
  }))
  const surfaces = Object.freeze(input.surfaces.map(cloneSurface))
  const poiIds = new Set(pois.map(poi => poi.id))
  if (poiIds.size !== pois.length) {
    throw new TypeError('profile POI IDs must be unique')
  }
  const surfaceIds = new Set(surfaces.map(surface => surface.id))
  if (surfaceIds.size !== surfaces.length) {
    throw new TypeError('profile surface IDs must be unique')
  }
  for (const surface of surfaces) {
    if (!poiIds.has(surface.poiId)) {
      throw new TypeError(`surface ${surface.id} references an unknown POI`)
    }
  }

  return Object.freeze({
    schema: input.schema,
    id: input.id,
    region: Object.freeze({ ...input.region }),
    revision: input.revision,
    dataPolicy: Object.freeze({ ...input.dataPolicy }),
    attribution,
    pois,
    surfaces,
  })
}
