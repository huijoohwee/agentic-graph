import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { projectLocalMetersToGeospatial, SINGAPORE_FLIGHT_GEO_REFERENCE } from '@/lib/gympgrph/api'
import {
  projectSupplyChainScenario,
  scenarioConsignment,
  SUPPLY_CHAIN_SCENARIO,
  type SupplyChainFacility,
  type SupplyChainFacilityKind,
  type SupplyChainMode,
} from './supplyChainScenario'
import type { SupplyChainEntityFilter, SupplyChainSelection } from './supplyChainViewStore'

const SCENARIO = SUPPLY_CHAIN_SCENARIO
const ANCHOR = SINGAPORE_FLIGHT_GEO_REFERENCE.anchor
const MODE_COLORS: Readonly<Record<SupplyChainMode, string>> = Object.freeze({
  road: '#315be8',
  rail: '#8b5cf6',
  air: '#0e9f9a',
  sea: '#087ea4',
  reverse: '#d38b24',
})
const FACILITY_COLORS: Readonly<Record<SupplyChainFacilityKind, string>> = Object.freeze({
  supplier: '#2563eb',
  production: '#7c3aed',
  consolidation: '#475569',
  airport: '#0891b2',
  seaport: '#0f766e',
  'rail-terminal': '#7c3aed',
  'cross-dock': '#d97706',
  'regional-hub': '#2563eb',
  fulfillment: '#0891b2',
  'delivery-station': '#16a34a',
  destination: '#15803d',
  returns: '#ca8a04',
})

type Coordinate = readonly [number, number]
type LocalPoint = readonly [east: number, north: number]
type Feature = {
  type: 'Feature'
  id: string
  geometry: { type: 'LineString' | 'Polygon'; coordinates: unknown }
  properties: Record<string, unknown>
}

const toLngLat = ([east, north]: LocalPoint, anchor: Coordinate = ANCHOR): Coordinate => projectLocalMetersToGeospatial(east, north, anchor)

const facilityNodeId = (id: string) => `supply-chain:${id}`
const resourceNodeId = (id: string) => `supply-chain:${id}`

function rectangleFeature(args: {
  id: string
  label: string
  center: LocalPoint
  anchor?: Coordinate
  width: number
  height: number
  rotation?: number
  color: string
  opacity?: number
  stroke?: string
  strokeWidth?: number
}): Feature {
  const angle = (args.rotation || 0) * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const halfWidth = args.width / 2
  const halfHeight = args.height / 2
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ] as const
  const ring: Coordinate[] = corners.map(([x, y]) => toLngLat([
    args.center[0] + x * cos - y * sin,
    args.center[1] + x * sin + y * cos,
  ], args.anchor))
  ring.push(ring[0]!)
  return {
    type: 'Feature',
    id: args.id,
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {
      label: args.label,
      kgFillColor: args.color,
      kgFillOpacity: args.opacity ?? 0.64,
      kgStrokeColor: args.stroke || '#ffffff',
      kgStrokeWidth: args.strokeWidth ?? 1.2,
      kgStrokeOpacity: 0.9,
      kgScenarioFeature: true,
      kgDimensionsMeters: [args.width, args.height],
    },
  }
}

function lineFeature(args: {
  id: string
  label: string
  coordinates: readonly LocalPoint[]
  anchor?: Coordinate
  color: string
  width: number
  opacity?: number
  dashed?: boolean
}): Feature {
  return {
    type: 'Feature',
    id: args.id,
    geometry: { type: 'LineString', coordinates: args.coordinates.map(point => toLngLat(point, args.anchor)) },
    properties: {
      label: args.label,
      kgCategory: 'infrastructure',
      kgColor: args.color,
      kgWidth: args.width,
      kgOpacity: args.opacity ?? 0.82,
      kgDashed: args.dashed === true,
    },
  }
}

function facilityAssetFeatures(facility: SupplyChainFacility): Feature[] {
  const area = (id: string, label: string, x: number, y: number, width: number, height: number, fill = '#cbd5e1', rotation = -12) => rectangleFeature({
    id: `supply-chain:asset:${facility.id}:${id}`,
    label: `${facility.code} · ${label}`,
    center: [x, y],
    anchor: facility.geo,
    width,
    height,
    rotation,
    color: fill,
    stroke: '#ffffff',
  })
  const line = (id: string, label: string, points: readonly LocalPoint[], width = 2.4, fill = '#64748b') => lineFeature({
    id: `supply-chain:asset:${facility.id}:${id}`,
    label: `${facility.code} · ${label}`,
    coordinates: points,
    anchor: facility.geo,
    color: fill,
    width,
  })

  switch (facility.kind) {
    case 'airport': {
      // Runway centers are the WGS84 midpoint of the published threshold/end
      // coordinates; the 4,000 × 60 m plan-view footprint uses AIP dimensions.
      const runways: readonly { id: string; label: string; center: Coordinate }[] = [
        { id: '02l', label: 'Runway 02L/20R · 4,000 × 60 m', center: [103.9844778, 1.3656111] },
        { id: '02c', label: 'Runway 02C/20C · 4,000 × 60 m', center: [103.9919889, 1.3454] },
        { id: '02r', label: 'Runway 02R/20L · 4,000 × 60 m', center: [104.006875, 1.3390333] },
      ]
      const runwayAngle = 67
      const runwayAxis = (offset: number): LocalPoint => [
        Math.cos(runwayAngle * Math.PI / 180) * offset,
        Math.sin(runwayAngle * Math.PI / 180) * offset,
      ]
      return [
        ...runways.flatMap(runway => [
          rectangleFeature({ id: `runway-${runway.id}`, label: runway.label, center: [0, 0], anchor: runway.center, width: 4000, height: 60, rotation: runwayAngle, color: '#475569', opacity: 0.78, stroke: '#f8fafc', strokeWidth: 1.5 }),
          lineFeature({ id: `runway-centerline-${runway.id}`, label: `${runway.label} centerline`, coordinates: [runwayAxis(-1920), runwayAxis(1920)], anchor: runway.center, color: '#f8fafc', width: 1, dashed: true }),
        ]),
        area('terminal', 'Passenger and cargo terminal complex · 900 × 300 m', -560, -160, 900, 300, '#dbeafe', -23),
        area('cargo-apron', 'Cargo apron · 900 × 360 m', -240, -390, 900, 360, '#94a3b8', -23),
        area('cargo-stand-a', 'Cargo aircraft stand · 95 × 80 m', -60, -360, 95, 80, '#0e9f9a', -23),
        area('cargo-stand-b', 'Cargo aircraft stand · 95 × 80 m', 65, -430, 95, 80, '#087ea4', -23),
        line('taxiway', 'Taxiway centerline', [[-250, -490], [-10, -760], [190, -1120]], 5, '#e2e8f0'),
      ]
    }
    case 'seaport': {
      const features: Feature[] = [
        area('terminal-yard', 'Container terminal yard · 1,240 × 420 m', 0, 250, 1240, 420, '#94a3b8', -4),
        area('quay', 'Container quay face · 1,240 × 90 m', 0, -15, 1240, 90, '#64748b', -4),
        area('ship', 'Container vessel · 400 × 61 m', 0, -105, 400, 61, '#087ea4', -4),
        area('ship-deck', 'Vessel deck · 250 × 42 m', 0, -105, 250, 42, '#dbeafe', -4),
      ]
      const stackColors = ['#315be8', '#f59e0b', '#0e9f9a', '#e8794f', '#8b5cf6']
      for (let blockRow = 0; blockRow < 2; blockRow += 1) {
        for (let blockColumn = 0; blockColumn < 3; blockColumn += 1) {
          for (let row = 0; row < 4; row += 1) {
            for (let column = 0; column < 8; column += 1) {
              const x = -380 + blockColumn * 360 + column * 13.2
              const y = 120 + blockRow * 90 + row * 3.4
              features.push(area(`container-${blockRow}-${blockColumn}-${row}-${column}`, `40 ft container unit · 12.19 × 2.44 m`, x, y, 12.19, 2.44, stackColors[(row * 2 + column + blockRow + blockColumn) % stackColors.length], -4))
            }
          }
        }
      }
      for (let crane = 0; crane < 4; crane += 1) {
        const x = -430 + crane * 286
        features.push(line(`quay-crane-${crane + 1}`, 'Quayside crane rail span · 80 m', [[x, 18], [x, -72]], 4, '#475569'))
      }
      return features
    }
    case 'rail-terminal': {
      const angle = -62 * Math.PI / 180
      const along = (distance: number, cross: number): LocalPoint => [
        Math.cos(angle) * distance - Math.sin(angle) * cross,
        Math.sin(angle) * distance + Math.cos(angle) * cross,
      ]
      const features: Feature[] = [area('rail-platform', 'Rail station platform zone · 300 × 48 m', 0, 0, 300, 48, '#d6d3d1', -62)]
      for (let track = 0; track < 4; track += 1) {
        const cross = -12 + track * 8
        features.push(line(`track-${track + 1}`, `Regional rail track ${track + 1}`, [along(-900, cross), along(900, cross)], 2.8, '#475569'))
      }
      features.push(area('train-locomotive', 'Regional locomotive · 22 × 3 m', 120, 11, 22, 3, '#7c3aed', -62))
      features.push(area('rail-cargo', 'Intermodal freight car · 19 × 3 m', -80, -5, 19, 3, '#0e9f9a', -62))
      return features
    }
    case 'supplier':
      return [
        area('receiving', 'Supplier receiving', 0, 0, 500, 280, '#dbeafe'),
        area('stock-building', 'Components store', -300, 260, 420, 230, '#cbd5e1'),
        area('dispatch-yard', 'Supplier dispatch yard', 340, -220, 560, 260, '#e2e8f0'),
      ]
    case 'production':
      return [
        area('assembly', 'Assembly hall', 0, 0, 920, 520, '#ddd6fe'),
        area('inspection', 'Inspection block', 580, 310, 380, 260, '#c4b5fd'),
        area('shipping', 'Finished goods shipping', -570, -230, 560, 300, '#cbd5e1'),
        area('service-road', 'Factory loading apron', 250, -380, 1120, 170, '#e2e8f0'),
      ]
    case 'consolidation':
    case 'cross-dock':
      return [
        area('crossdock', 'Cross-dock building', 0, 0, 780, 380, '#fed7aa'),
        area('sort-yard', 'Transfer yard', -520, -320, 820, 180, '#cbd5e1'),
        area('outbound-yard', 'Outbound staging', 570, 280, 800, 180, '#e2e8f0'),
      ]
    case 'regional-hub':
      return [
        area('sort-center', 'Regional sort center', 0, 0, 1080, 500, '#bfdbfe'),
        area('dock-west', 'Inbound dock', -670, 260, 460, 220, '#cbd5e1'),
        area('dock-east', 'Outbound dock', 680, -260, 500, 220, '#cbd5e1'),
        area('yard', 'Truck yard', 220, 450, 950, 180, '#e2e8f0'),
      ]
    case 'fulfillment':
      return [
        area('warehouse-a', 'Fulfillment warehouse', -260, 0, 760, 430, '#cffafe'),
        area('warehouse-b', 'Packing hall', 430, 220, 580, 320, '#a5f3fc'),
        area('dispatch', 'Courier dispatch apron', 110, -370, 950, 150, '#e2e8f0'),
      ]
    case 'delivery-station':
      return [
        area('station', 'Delivery station', 0, 0, 580, 340, '#bbf7d0'),
        area('courier-yard', 'Courier dispatch yard', 390, -280, 700, 150, '#e2e8f0'),
      ]
    case 'destination':
      return [area('recipient', 'Recipient handoff area', 0, 0, 210, 170, '#dcfce7', 28)]
    case 'returns':
      return [
        area('inspection', 'Returns inspection', 0, 0, 480, 280, '#fef3c7'),
        area('recovery', 'Disposition staging', 360, 230, 440, 200, '#fde68a'),
      ]
  }
}

function collectCoordinatePairs(value: unknown, output: Coordinate[] = []): Coordinate[] {
  if (!Array.isArray(value)) return output
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    if (Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      output.push([value[0], value[1]])
    }
    return output
  }
  for (const child of value) collectCoordinatePairs(child, output)
  return output
}

/** WGS84 bounds of one facility and its authored, metre-scaled assets. */
export function getSupplyChainFacilityBounds(
  facilityId: string,
): readonly [west: number, south: number, east: number, north: number] | null {
  const facility = SCENARIO.facilities.find(candidate => candidate.id === facilityId)
  if (!facility) return null
  const points: Coordinate[] = [[...facility.geo]]
  for (const feature of facilityAssetFeatures(facility)) {
    collectCoordinatePairs(feature.geometry.coordinates, points)
  }
  if (points.length === 0) return null
  const longitudes = points.map(point => point[0])
  const latitudes = points.map(point => point[1])
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ]
}

function routeCoordinates(legId: string, fromId: string, toId: string, mode: SupplyChainMode): readonly Coordinate[] {
  const from = SCENARIO.facilities.find(facility => facility.id === fromId)
  const to = SCENARIO.facilities.find(facility => facility.id === toId)
  if (!from || !to) return []
  const [fromLng, fromLat] = from.geo
  const [toLng, toLat] = to.geo
  const middleLatitude = (fromLat + toLat) / 2
  const eastMeters = (toLng - fromLng) * 111_320 * Math.cos(middleLatitude * Math.PI / 180)
  const northMeters = (toLat - fromLat) * 111_320
  const distance = Math.hypot(eastMeters, northMeters)
  if (distance < 1) return [from.geo, to.geo]
  const bendLimit = mode === 'sea' ? 2_500 : mode === 'air' ? 1_800 : mode === 'rail' ? 350 : 700
  const bendMeters = Math.min(distance * (mode === 'sea' ? 0.16 : 0.07), bendLimit)
  const bendSign = Array.from(legId).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 ? 1 : -1
  const normalEast = -northMeters / distance
  const normalNorth = eastMeters / distance
  return Array.from({ length: 13 }, (_, index) => {
    if (index === 0) return from.geo
    if (index === 12) return to.geo
    const t = index / 12
    const bend = Math.sin(Math.PI * t) * bendMeters * bendSign
    return toLngLat([
      eastMeters * t + normalEast * bend,
      northMeters * t + normalNorth * bend,
    ], from.geo)
  })
}

function resourcePoint(legId: string, fromId: string, toId: string, mode: SupplyChainMode, progress: number): Coordinate | null {
  const coordinates = routeCoordinates(legId, fromId, toId, mode)
  if (coordinates.length < 2) return null
  const scaled = Math.max(0, Math.min(1, progress)) * (coordinates.length - 1)
  const index = Math.min(coordinates.length - 2, Math.floor(scaled))
  const mix = scaled - index
  const from = coordinates[index]!
  const to = coordinates[index + 1]!
  return [from[0] + (to[0] - from[0]) * mix, from[1] + (to[1] - from[1]) * mix]
}

function resourceProgress(consignmentId: string, legId: string, timeSeconds: number): number {
  const events = SCENARIO.events.filter(event => event.consignmentId === consignmentId).slice().sort((a, b) => a.atSeconds - b.atSeconds)
  const previous = events.filter(event => event.atSeconds <= timeSeconds).at(-1)
  const upcoming = events.find(event => event.atSeconds > timeSeconds)
  const start = previous?.atSeconds ?? 0
  const end = upcoming?.atSeconds ?? start
  if (previous?.legId !== legId && upcoming?.legId !== legId) return 0.5
  return end > start ? (timeSeconds - start) / (end - start) : upcoming?.legId === legId ? 0 : 1
}

function lineCollection(features: readonly Feature[]) {
  return {
    type: 'FeatureCollection',
    features: features.map(feature => ({
      ...feature,
      properties: { ...feature.properties, kgCategory: feature.properties.kgCategory || 'route' },
    })),
  }
}

function areaCollection(features: readonly Feature[]) {
  return { type: 'FeatureCollection', features }
}

export function isSupplyChainWorkspaceSource(value: unknown): boolean {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
  return normalized.endsWith('/agentic-graph-logistics-supply-chain-overview.md')
    || normalized === 'agentic-graph-logistics-supply-chain-overview.md'
}

export function buildSupplyChainGeospatialGraphData(args: {
  graphData: GraphData
  selection: SupplyChainSelection
  modeFilter: SupplyChainMode | 'all'
  entityFilter: SupplyChainEntityFilter
  showLabels: boolean
  timeSeconds: number
}): GraphData {
  const { graphData, selection, modeFilter, entityFilter, showLabels } = args
  const timeSeconds = Math.max(0, Math.min(SCENARIO.durationSeconds, args.timeSeconds))
  const selectedConsignmentId = selection.kind === 'consignment'
    ? selection.id
    : SCENARIO.consignments.find(consignment => consignment.legIds.some(id => {
      const leg = SCENARIO.legs.find(value => value.id === id)
      return leg?.from === selection.id || leg?.to === selection.id
    }))?.id || SCENARIO.consignments[0]!.id
  const selectedConsignment = scenarioConsignment(SCENARIO, selectedConsignmentId) || SCENARIO.consignments[0]!
  const projection = projectSupplyChainScenario(SCENARIO, timeSeconds, selectedConsignment.id)
  const selectedLegIds = new Set(selectedConsignment.legIds)
  const activeFacilityId = selection.kind === 'facility' ? selection.id : projection.latestEvent?.facilityId
  const nodes: GraphNode[] = [...(Array.isArray(graphData.nodes) ? graphData.nodes : [])]
  const edges: GraphEdge[] = [...(Array.isArray(graphData.edges) ? graphData.edges : [])]
  const routeFeatures: Feature[] = []
  const areaFeatures: Feature[] = []

  if (entityFilter !== 'resources') {
    for (const facility of SCENARIO.facilities) {
      const [lng, lat] = facility.geo
      const active = activeFacilityId === facility.id
      nodes.push({
        id: facilityNodeId(facility.id),
        type: facility.kind,
        label: `${facility.code} · ${facility.name}`,
        properties: {
          geo: { lng, lat },
          cat: facility.kind === 'airport' ? 'airport' : 'poi',
          kgColor: active ? '#e11d48' : FACILITY_COLORS[facility.kind],
          kgLabelVisible: showLabels,
          kgSelected: selection.kind === 'facility' && selection.id === facility.id,
          facilityId: facility.id,
          code: facility.code,
          name: facility.name,
          kind: facility.kind,
          region: facility.region,
          summary: facility.summary,
          capacity: facility.capacity,
        } as unknown as Record<string, JSONValue>,
      })
      for (const asset of facilityAssetFeatures(facility)) {
        if (asset.geometry.type === 'Polygon') areaFeatures.push(asset)
        else routeFeatures.push(asset)
      }
    }
  }

  for (const leg of SCENARIO.legs) {
    const coordinates = routeCoordinates(leg.id, leg.from, leg.to, leg.mode)
    if (coordinates.length < 2) continue
    const modeVisible = modeFilter === 'all' || leg.mode === modeFilter
    const selected = selectedLegIds.has(leg.id)
    routeFeatures.push({
      type: 'Feature',
      id: `supply-chain:${leg.id}`,
      geometry: { type: 'LineString', coordinates },
      properties: {
        label: leg.label,
        kgCategory: 'route',
        kgMode: leg.mode,
        kgColor: MODE_COLORS[leg.mode],
        kgWidth: selected ? 4.2 : 2.8,
        kgOpacity: modeVisible ? selected ? 0.96 : 0.62 : 0.06,
        kgDashed: leg.mode === 'reverse',
        selected,
      },
    })
    const from = SCENARIO.facilities.find(facility => facility.id === leg.from)
    const to = SCENARIO.facilities.find(facility => facility.id === leg.to)
    if (from && to) edges.push({
      id: `supply-chain:${leg.id}`,
      source: facilityNodeId(from.id),
      target: facilityNodeId(to.id),
      label: leg.label,
      type: leg.mode,
      properties: { mode: leg.mode, selected },
    })
  }

  if (entityFilter !== 'infrastructure') {
    for (const resource of SCENARIO.resources) {
      const resourceProjection = projectSupplyChainScenario(SCENARIO, timeSeconds, resource.consignmentId)
      const leg = SCENARIO.legs.find(value => value.id === resourceProjection.activeLegId)
      if (!leg || !resource.modes.includes(leg.mode) || (modeFilter !== 'all' && modeFilter !== leg.mode)) continue
      const point = resourcePoint(leg.id, leg.from, leg.to, leg.mode, resourceProgress(resource.consignmentId, leg.id, timeSeconds))
      if (!point) continue
      const consignment = scenarioConsignment(SCENARIO, resource.consignmentId)
      nodes.push({
        id: resourceNodeId(resource.id),
        type: resource.kind,
        label: `${resource.code} · ${resource.name}`,
        properties: {
          geo: { lng: point[0], lat: point[1] },
          cat: 'poi',
          kgColor: MODE_COLORS[leg.mode],
          kgLabelVisible: showLabels,
          kgResource: true,
          resourceId: resource.id,
          code: resource.code,
          mode: leg.mode,
          consignmentId: resource.consignmentId,
          consignmentReference: consignment?.reference || resource.consignmentId,
          routeLegId: leg.id,
        } as unknown as Record<string, JSONValue>,
      })
    }
  }

  return {
    ...graphData,
    nodes,
    edges,
    metadata: {
      ...(graphData.metadata || {}),
      kgGeospatialLineFeatures: lineCollection(routeFeatures) as unknown as JSONValue,
      kgGeospatialAreaFeatures: areaCollection(areaFeatures) as unknown as JSONValue,
      kgGeospatialScenario: {
        id: SCENARIO.id,
        seed: SCENARIO.seed,
        revision: SCENARIO.revision,
        timeSeconds,
        geography: 'facility anchors are WGS84 regional points; routes, footprints and operations are scenario models',
      } as unknown as JSONValue,
    },
  }
}
