import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  createRegionalPoiProfile,
} from '../dist/geospatial/regionalPoiGeo.js'
import {
  SINGAPORE_MAJOR_POI_GEO_PROFILE,
} from '../dist/geospatial/singaporeMajorPoiGeo.js'

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
]

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen)
}

test('Singapore major POIs are immutable geographic source data', () => {
  const profile = SINGAPORE_MAJOR_POI_GEO_PROFILE
  assert.equal(profile.schema, 'knowgrph.regional-poi-profile/v1')
  assert.equal(profile.id, 'adm0:SGP:major-pois/v1')
  assert.deepEqual(profile.dataPolicy, {
    storage: 'checked-in',
    runtimeNetwork: 'forbidden',
  })
  assert.deepEqual(
    profile.pois.map(poi => poi.id),
    ['marina-bay-sands', 'singapore-flyer', 'gardens-by-the-bay'],
  )
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
    assert.equal(surface.provenance.geometry.snapshotAt, '2026-07-31T00:00:00Z')
    assert.equal(surface.provenance.height.snapshotAt, '2026-07-31T00:00:00Z')
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

test('Singapore surface heights and provenance match the dated authorities', () => {
  const rows = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(surface => ({
    id: surface.id,
    base: surface.baseHeightMeters,
    top: surface.heightMeters,
    source: surface.provenance.geometry.sourceId,
    version: surface.provenance.geometry.sourceVersion,
  }))
  assert.deepEqual(rows, [
    {
      id: 'marina-bay-sands:tower-1',
      base: 0,
      top: 193,
      source: 'openstreetmap:way/116801004',
      version: '24',
    },
    {
      id: 'marina-bay-sands:tower-2',
      base: 0,
      top: 193,
      source: 'openstreetmap:way/172307472',
      version: '20',
    },
    {
      id: 'marina-bay-sands:tower-3',
      base: 0,
      top: 193,
      source: 'openstreetmap:way/172307471',
      version: '22',
    },
    {
      id: 'marina-bay-sands:skypark',
      base: 193,
      top: 207,
      source: 'openstreetmap:way/116800998',
      version: '37',
    },
    {
      id: 'singapore-flyer:wheel',
      base: 0,
      top: 165,
      source: 'openstreetmap:way/230082125',
      version: '19',
    },
    {
      id: 'gardens-by-the-bay:supertree-681695804',
      base: 17,
      top: 33,
      source: 'openstreetmap:way/681695804',
      version: '4',
    },
    {
      id: 'gardens-by-the-bay:supertree-572839881',
      base: 0,
      top: 46,
      source: 'openstreetmap:way/572839881',
      version: '6',
    },
    {
      id: 'gardens-by-the-bay:supertree-572839873',
      base: 33,
      top: 36,
      source: 'openstreetmap:way/572839873',
      version: '6',
    },
    {
      id: 'gardens-by-the-bay:supertree-681695795',
      base: 27,
      top: 33,
      source: 'openstreetmap:way/681695795',
      version: '4',
    },
  ])

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

  const unknownPoi = structuredClone(SINGAPORE_MAJOR_POI_GEO_PROFILE)
  unknownPoi.surfaces[0].poiId = 'not-declared'
  assert.throws(
    () => createRegionalPoiProfile(unknownPoi),
    /references an unknown POI/,
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
    '5c76b6babd7e22c85bc5a670e10a4a13bdad36d7ed2dd9964c177af9b0570a77',
  )
})
