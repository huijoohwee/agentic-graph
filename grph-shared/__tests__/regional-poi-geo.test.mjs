import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  createRegionalPoiProfile,
  deriveRegionalPoiLongitudeSpan,
  deriveRegionalPoiLocators,
  deriveRegionalPoiRepresentativePoint,
} from '../dist/geospatial/regionalPoiGeo.js'
import {
  SINGAPORE_MAJOR_POI_GEO_PROFILE,
} from '../dist/geospatial/singaporeMajorPoiGeo.js'
import {
  SINGAPORE_MAJOR_POI_IDENTITIES,
} from '../dist/geospatial/singaporeMajorPoiIdentity.js'

const EXPECTED_SURFACE_IDS = [
  'marina-bay-sands:tower-1',
  'marina-bay-sands:tower-2',
  'marina-bay-sands:tower-3',
  'marina-bay-sands:skypark',
  'singapore-flyer:wheel',
  'gardens-by-the-bay:supertree-681695804',
  'gardens-by-the-bay:supertree-572839881',
  'gardens-by-the-bay:supertree-572839873',
  'gardens-by-the-bay:supertree-681695795',
  'esplanade-theatres-on-the-bay:main-building',
  'the-fullerton-hotel:main-building',
  'raffles-hotel:main-building',
]

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen)
}

test('Singapore major POIs are immutable geographic source data', () => {
  const profile = SINGAPORE_MAJOR_POI_GEO_PROFILE
  assert.equal(profile.schema, 'agenticgraph.regional-poi-profile/v1')
  assert.equal(profile.id, 'adm0:SGP:major-pois/v1')
  assert.equal(profile.revision, '2026-07-31.2')
  assert.deepEqual(profile.dataPolicy, {
    storage: 'checked-in',
    runtimeNetwork: 'forbidden',
  })
  assert.deepEqual(
    profile.pois.map(poi => poi.id),
    [
      'marina-bay-sands',
      'singapore-flyer',
      'gardens-by-the-bay',
      'esplanade-theatres-on-the-bay',
      'the-fullerton-hotel',
      'raffles-hotel',
    ],
  )
  assert.deepEqual(profile.pois, SINGAPORE_MAJOR_POI_IDENTITIES)
  assert.deepEqual(
    profile.surfaces.map(surface => surface.id),
    EXPECTED_SURFACE_IDS,
  )
  assert.equal(isDeepFrozen(profile), true)

  for (const surface of profile.surfaces) {
    assert.equal(surface.geometry.type, 'Polygon')
    assert.equal(surface.geometry.coordinates.length, 1)
    const ring = surface.geometry.coordinates[0]
    assert.ok(ring.length >= 4)
    assert.deepEqual(ring[0], ring.at(-1))
    assert.equal(
      ring.every(([longitude, latitude]) => (
        longitude >= 103.85
        && longitude <= 103.87
        && latitude >= 1.27
        && latitude <= 1.30
      )),
      true,
    )
    assert.ok(surface.heightMeters > surface.baseHeightMeters)
    assert.equal(
      surface.provenance.geometry.snapshotAt,
      surface.provenance.height.snapshotAt,
    )
  }

  const serialized = JSON.stringify(profile)
  assert.doesNotMatch(serialized, /position|sizeMeters|localAnchor|legacy|alias/i)
  assert.deepEqual(profile.attribution, [{
    text: '© OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    licenseName: 'Open Data Commons Open Database License 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  }])
})

test('Singapore major POI locators are source-derived and order-independent', () => {
  const profile = SINGAPORE_MAJOR_POI_GEO_PROFILE
  const locators = deriveRegionalPoiLocators(profile)
  assert.equal(isDeepFrozen(locators), true)
  assert.deepEqual(
    locators.map(locator => locator.poiId),
    [
      'marina-bay-sands',
      'singapore-flyer',
      'gardens-by-the-bay',
      'esplanade-theatres-on-the-bay',
      'the-fullerton-hotel',
      'raffles-hotel',
    ],
  )

  for (const locator of locators) {
    const polygons = profile.surfaces
      .filter(surface => surface.poiId === locator.poiId)
      .map(surface => surface.geometry.coordinates)
    assert.deepEqual(
      locator.coordinate,
      deriveRegionalPoiRepresentativePoint(polygons),
    )
    assert.equal(locator.coordinate.every(Number.isFinite), true)
  }

  const reordered = structuredClone(profile)
  reordered.surfaces.reverse()
  assert.deepEqual(deriveRegionalPoiLocators(reordered), locators)
})

test('regional POI locators center the minimum antimeridian-crossing span', () => {
  const profile = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  profile.id = 'adm0:TST:antimeridian-poi/v1'
  profile.region = { code: 'TST', label: 'Antimeridian Test Region' }
  profile.pois = [{ id: 'crossing-poi', label: 'Crossing POI' }]
  profile.surfaces = [{
    ...profile.surfaces[0],
    id: 'crossing-poi:surface',
    poiId: 'crossing-poi',
    label: 'Crossing POI surface',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [179, 10],
        [-179, 10],
        [-179, 12],
        [179, 12],
        [179, 10],
      ]],
    },
  }]

  assert.deepEqual(deriveRegionalPoiLocators(profile), [{
    coordinate: [-180, 11],
    label: 'Crossing POI',
    poiId: 'crossing-poi',
  }])
})

test('regional longitude spans preserve the minimum wrapped interval', () => {
  const expected = {
    center: -180,
    east: 181,
    spanDegrees: 2,
    west: 179,
  }
  assert.deepEqual(
    deriveRegionalPoiLongitudeSpan([179, -179]),
    expected,
  )
  assert.deepEqual(
    deriveRegionalPoiLongitudeSpan([-179, 179, 179]),
    expected,
  )
  assert.deepEqual(
    deriveRegionalPoiLongitudeSpan([45]),
    {
      center: 45,
      east: 45,
      spanDegrees: 0,
      west: 45,
    },
  )
  assert.throws(
    () => deriveRegionalPoiLongitudeSpan([]),
    /at least one longitude/,
  )
})

test('Singapore surface heights and provenance match the dated authorities', () => {
  const rows = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(surface => ({
    id: surface.id,
    base: surface.baseHeightMeters,
    top: surface.heightMeters,
    source: surface.provenance.geometry.sourceId,
    version: surface.provenance.geometry.sourceVersion,
    timestamp: surface.provenance.geometry.snapshotAt,
  }))
  assert.deepEqual(rows, [
    {
      id: 'marina-bay-sands:tower-1',
      base: 0,
      top: 193,
      source: 'openstreetmap:way/116801004',
      version: '24',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'marina-bay-sands:tower-2',
      base: 0,
      top: 193,
      source: 'openstreetmap:way/172307472',
      version: '20',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'marina-bay-sands:tower-3',
      base: 0,
      top: 193,
      source: 'openstreetmap:way/172307471',
      version: '22',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'marina-bay-sands:skypark',
      base: 193,
      top: 207,
      source: 'openstreetmap:way/116800998',
      version: '37',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'singapore-flyer:wheel',
      base: 0,
      top: 165,
      source: 'openstreetmap:way/230082125',
      version: '19',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'gardens-by-the-bay:supertree-681695804',
      base: 17,
      top: 33,
      source: 'openstreetmap:way/681695804',
      version: '4',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'gardens-by-the-bay:supertree-572839881',
      base: 0,
      top: 46,
      source: 'openstreetmap:way/572839881',
      version: '6',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'gardens-by-the-bay:supertree-572839873',
      base: 33,
      top: 36,
      source: 'openstreetmap:way/572839873',
      version: '6',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'gardens-by-the-bay:supertree-681695795',
      base: 27,
      top: 33,
      source: 'openstreetmap:way/681695795',
      version: '4',
      timestamp: '2026-07-31T00:00:00Z',
    },
    {
      id: 'esplanade-theatres-on-the-bay:main-building',
      base: 0,
      top: 13,
      source: 'openstreetmap:way/97582570',
      version: '33',
      timestamp: '2024-04-14T16:45:20Z',
    },
    {
      id: 'the-fullerton-hotel:main-building',
      base: 0,
      top: 25,
      source: 'openstreetmap:way/46595395',
      version: '27',
      timestamp: '2024-04-12T11:55:48Z',
    },
    {
      id: 'raffles-hotel:main-building',
      base: 0,
      top: 14,
      source: 'openstreetmap:way/254815862',
      version: '8',
      timestamp: '2023-12-05T10:20:00Z',
    },
  ])

  const additionalBuildings = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.slice(-3)
  assert.deepEqual(
    additionalBuildings.map(surface => ({
      category: surface.category,
      geometryUrl: surface.provenance.geometry.sourceUrl,
      height: surface.accuracy.height,
      heightSource: surface.provenance.height.sourceId,
      context: surface.provenance.context,
    })),
    [
      {
        category: 'theatre',
        geometryUrl: 'https://www.openstreetmap.org/way/97582570',
        height: 'source-recorded',
        heightSource: 'openstreetmap:way/97582570',
        context: [],
      },
      {
        category: 'heritage-hotel',
        geometryUrl: 'https://www.openstreetmap.org/way/46595395',
        height: 'source-recorded',
        heightSource: 'openstreetmap:way/46595395',
        context: [],
      },
      {
        category: 'heritage-hotel',
        geometryUrl: 'https://www.openstreetmap.org/way/254815862',
        height: 'source-recorded',
        heightSource: 'openstreetmap:way/254815862',
        context: [],
      },
    ],
  )
  assert.match(additionalBuildings[1].accuracy.statement, /height tag/i)
  assert.match(additionalBuildings[1].accuracy.statement, /building:height/i)

  const tower = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces[0]
  assert.deepEqual(tower.geometry.coordinates[0], [
    [103.8605263, 1.2827539],
    [103.8604802, 1.2827859],
    [103.8601414, 1.2830212],
    [103.8599199, 1.2827024],
    [103.8598409, 1.2825888],
    [103.8602258, 1.2823215],
    [103.8605263, 1.2827539],
  ])
  assert.match(
    tower.accuracy.statement,
    /official.*191 metres.*200 metres/i,
  )
  const supertrees = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.filter(
    surface => surface.category === 'supertree',
  )
  assert.equal(
    supertrees.every(surface => (
      surface.provenance.context[0]?.sourceUrl
        === 'https://www.gardensbythebay.com.sg/en/about-us/media-room/2007.html'
      && /25 to 50 metre range/.test(surface.accuracy.statement)
    )),
    true,
  )
})

test('Singapore Flyer uses exact OSM massing with its official height', () => {
  const flyer = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.find(
    surface => surface.id === 'singapore-flyer:wheel',
  )
  assert.ok(flyer)
  assert.equal(flyer.accuracy.footprint, 'source-polygon')
  assert.equal(flyer.accuracy.height, 'official-published')
  assert.deepEqual(flyer.geometry.coordinates[0], [
    [103.8625828, 1.2890295],
    [103.8636235, 1.2898476],
    [103.8636678, 1.2897913],
    [103.8626271, 1.2889732],
    [103.8625828, 1.2890295],
  ])
  assert.equal(
    flyer.provenance.geometry.sourceUrl,
    'https://www.openstreetmap.org/way/230082125',
  )
  assert.equal(flyer.provenance.geometry.sourceVersion, '19')
  assert.equal(
    flyer.provenance.height.sourceUrl,
    'https://www.singaporeflyer.com/en/fun-facts',
  )
  assert.match(flyer.accuracy.statement, /geographic massing only/i)
  assert.match(flyer.accuracy.statement, /not the wheel morphology/i)
})

test('regional POI validation rejects stale aliases and invalid geometry', () => {
  const stale = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  stale.surfaces[0].legacySurfaceAlias = 'tower-west'
  assert.throws(
    () => createRegionalPoiProfile(stale),
    /must contain only/,
  )

  const staleFootprintClass = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  staleFootprintClass.surfaces[4].accuracy.footprint =
    'metric-presentation-footprint'
  assert.throws(
    () => createRegionalPoiProfile(staleFootprintClass),
    /accuracy\.footprint is unsupported/,
  )

  const openRing = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  openRing.surfaces[0].geometry.coordinates[0].at(-1)[0] += 0.000001
  assert.throws(
    () => createRegionalPoiProfile(openRing),
    /must be closed/,
  )

  const degenerateRing = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  degenerateRing.surfaces[0].geometry.coordinates = [[
    [103.86, 1.28],
    [103.861, 1.28],
    [103.862, 1.28],
    [103.86, 1.28],
  ]]
  assert.throws(
    () => createRegionalPoiProfile(degenerateRing),
    /self-intersect|non-zero area/,
  )

  const selfIntersectingRing = structuredClone(
    SINGAPORE_MAJOR_POI_GEO_PROFILE,
  )
  selfIntersectingRing.surfaces[0].geometry.coordinates = [[
    [103.86, 1.28],
    [103.862, 1.282],
    [103.86, 1.282],
    [103.862, 1.28],
    [103.86, 1.28],
  ]]
  assert.throws(
    () => createRegionalPoiProfile(selfIntersectingRing),
    /must not self-intersect/,
  )

  const outsideHole = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  outsideHole.surfaces[0].geometry.coordinates = [[
    [103.86, 1.28],
    [103.864, 1.28],
    [103.864, 1.284],
    [103.86, 1.284],
    [103.86, 1.28],
  ], [
    [103.865, 1.281],
    [103.866, 1.281],
    [103.866, 1.282],
    [103.865, 1.282],
    [103.865, 1.281],
  ]]
  assert.throws(
    () => createRegionalPoiProfile(outsideHole),
    /strictly inside its outer ring/,
  )

  const overlappingHoles = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  overlappingHoles.surfaces[0].geometry.coordinates = [[
    [103.86, 1.28],
    [103.866, 1.28],
    [103.866, 1.286],
    [103.86, 1.286],
    [103.86, 1.28],
  ], [
    [103.861, 1.281],
    [103.864, 1.281],
    [103.864, 1.284],
    [103.861, 1.284],
    [103.861, 1.281],
  ], [
    [103.863, 1.283],
    [103.865, 1.283],
    [103.865, 1.285],
    [103.863, 1.285],
    [103.863, 1.283],
  ]]
  assert.throws(
    () => createRegionalPoiProfile(overlappingHoles),
    /holes must not intersect or contain one another/,
  )

  const validHole = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  validHole.surfaces[0].geometry.coordinates = [[
    [103.86, 1.28],
    [103.864, 1.28],
    [103.864, 1.284],
    [103.86, 1.284],
    [103.86, 1.28],
  ], [
    [103.861, 1.281],
    [103.863, 1.281],
    [103.863, 1.283],
    [103.861, 1.283],
    [103.861, 1.281],
  ]]
  assert.doesNotThrow(() => createRegionalPoiProfile(validHole))

  const unknownPoi = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  unknownPoi.surfaces[0].poiId = 'not-declared'
  assert.throws(
    () => createRegionalPoiProfile(unknownPoi),
    /references an unknown POI/,
  )

  const orphanPoi = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  orphanPoi.pois.push({ id: 'orphan-poi', label: 'Orphan POI' })
  assert.throws(
    () => createRegionalPoiProfile(orphanPoi),
    /POI orphan-poi requires at least one surface/,
  )
})

test('the checked-in Singapore geometry has an exact revision digest', () => {
  const canonical = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(surface => ({
    id: surface.id,
    geometry: surface.geometry,
    baseHeightMeters: surface.baseHeightMeters,
    heightMeters: surface.heightMeters,
    provenance: surface.provenance,
  }))
  const digest = createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
  assert.equal(
    digest,
    '0de647529528b0dc76663d6ecb4029e7074d93db9c6b6e45aecce0175ba4870e',
  )
})
