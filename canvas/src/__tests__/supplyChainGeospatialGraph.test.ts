import assert from 'node:assert/strict'
import test from 'node:test'
import type { GraphData } from '@/lib/graph/types'
import { buildSupplyChainGeospatialGraphData, getSupplyChainFacilityBounds } from '@/features/supply-chain/supplyChainGeospatialGraph'
import { SUPPLY_CHAIN_SCENARIO } from '@/features/supply-chain/supplyChainScenario'

type GeoPoint = readonly [number, number]
type PolygonFeature = {
  id: string
  geometry: { coordinates: readonly (readonly GeoPoint[])[] }
  properties: Record<string, unknown>
}
type LineFeature = {
  id: string
  geometry: { coordinates: readonly GeoPoint[] }
}

function geodesicMeters(a: GeoPoint, b: GeoPoint): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const [lng1, lat1] = a.map(radians) as [number, number]
  const [lng2, lat2] = b.map(radians) as [number, number]
  const dLat = lat2 - lat1
  const dLng = lng2 - lng1
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function buildGraph() {
  return buildSupplyChainGeospatialGraphData({
    graphData: { nodes: [], edges: [] } as unknown as GraphData,
    selection: { kind: 'consignment', id: 'consignment.air-2048' },
    modeFilter: 'all',
    entityFilter: 'all',
    showLabels: true,
    timeSeconds: 0,
  })
}

function featureCollection<T>(metadata: Record<string, unknown>, key: string): T[] {
  const collection = metadata[key] as { features: T[] } | undefined
  assert.ok(collection && Array.isArray(collection.features), `${key} should be a feature collection`)
  return collection.features
}

test('regional facility anchors place the airport, port and rail gateway in their real locations', () => {
  const graph = buildGraph()
  const nodes = graph.nodes as Array<{ id: string; properties?: { geo?: { lng?: number; lat?: number } } }>
  const point = (facilityId: string): GeoPoint => {
    const node = nodes.find(candidate => candidate.id === `supply-chain:${facilityId}`)
    assert.ok(node?.properties?.geo, `${facilityId} should have a geospatial point`)
    return [node.properties.geo.lng!, node.properties.geo.lat!]
  }

  assert.deepEqual(point('facility.airport'), [103.989325, 1.359211])
  assert.deepEqual(point('facility.seaport'), [103.768333, 1.286667])
  assert.deepEqual(point('facility.rail'), [103.723270, 1.535345])
  assert.equal(SUPPLY_CHAIN_SCENARIO.facilities.length, 12)
})

test('airport, port and rail footprints retain metre-based operating dimensions', () => {
  const graph = buildGraph()
  const metadata = graph.metadata as Record<string, unknown>
  const areas = featureCollection<PolygonFeature>(metadata, 'kgGeospatialAreaFeatures')
  const runway = areas.find(feature => feature.id === 'runway-02l')
  const terminalYard = areas.find(feature => feature.id === 'supply-chain:asset:facility.seaport:terminal-yard')
  const container = areas.find(feature => feature.id.startsWith('supply-chain:asset:facility.seaport:container-'))
  const railPlatform = areas.find(feature => feature.id === 'supply-chain:asset:facility.rail:rail-platform')

  assert.deepEqual(runway?.properties.kgDimensionsMeters, [4000, 60])
  assert.deepEqual(terminalYard?.properties.kgDimensionsMeters, [1240, 420])
  assert.deepEqual(container?.properties.kgDimensionsMeters, [12.19, 2.44])
  assert.deepEqual(railPlatform?.properties.kgDimensionsMeters, [300, 48])

  const runwayRing = runway?.geometry.coordinates[0]
  assert.ok(runwayRing && runwayRing.length >= 5)
  assert.ok(Math.abs(geodesicMeters(runwayRing[0]!, runwayRing[1]!) - 4000) < 5)
  assert.ok(Math.abs(geodesicMeters(runwayRing[1]!, runwayRing[2]!) - 60) < 2)

  const runwayCenters: Readonly<Record<string, GeoPoint>> = {
    'runway-02l': [103.9844778, 1.3656111],
    'runway-02c': [103.9919889, 1.3454],
    'runway-02r': [104.006875, 1.3390333],
  }
  for (const [runwayId, expectedCenter] of Object.entries(runwayCenters)) {
    const feature = areas.find(candidate => candidate.id === runwayId)
    const ring = feature?.geometry.coordinates[0]
    assert.ok(ring && ring.length >= 5, `${runwayId} should have a runway footprint`)
    const center: GeoPoint = [
      (ring[0]![0] + ring[1]![0] + ring[2]![0] + ring[3]![0]) / 4,
      (ring[0]![1] + ring[1]![1] + ring[2]![1] + ring[3]![1]) / 4,
    ]
    assert.ok(geodesicMeters(center, expectedCenter) < 1, `${runwayId} should be centered on its published endpoints`)
  }
})

test('facility focus bounds include full airport runways and the compact seaport terminal footprint', () => {
  const airport = getSupplyChainFacilityBounds('facility.airport')
  const seaport = getSupplyChainFacilityBounds('facility.seaport')
  assert.ok(airport)
  assert.ok(seaport)

  assert.ok(airport[0] < 103.984 && airport[2] > 104.007)
  assert.ok(airport[1] < 1.339 && airport[3] > 1.366)
  assert.ok(seaport[0] < 103.763 && seaport[2] > 103.773)
  assert.ok(seaport[2] - seaport[0] < 0.02)
  assert.equal(getSupplyChainFacilityBounds('facility.unknown'), null)
})

test('scenario route endpoints stay attached to their WGS84 facility anchors', () => {
  const graph = buildGraph()
  const metadata = graph.metadata as Record<string, unknown>
  const routes = featureCollection<LineFeature>(metadata, 'kgGeospatialLineFeatures')
  const airportDrayage = routes.find(feature => feature.id === 'supply-chain:leg.origin-air')
  const seaDrayage = routes.find(feature => feature.id === 'supply-chain:leg.origin-sea')
  const facility = (id: string) => SUPPLY_CHAIN_SCENARIO.facilities.find(item => item.id === id)!.geo

  assert.deepEqual(airportDrayage?.geometry.coordinates[0], facility('facility.origin'))
  assert.deepEqual(airportDrayage?.geometry.coordinates.at(-1), facility('facility.airport'))
  assert.deepEqual(seaDrayage?.geometry.coordinates[0], facility('facility.origin'))
  assert.deepEqual(seaDrayage?.geometry.coordinates.at(-1), facility('facility.seaport'))
})
