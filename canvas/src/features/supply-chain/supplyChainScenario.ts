export type SupplyChainMode = 'road' | 'rail' | 'air' | 'sea' | 'reverse'

export type SupplyChainFacilityKind =
  | 'supplier'
  | 'production'
  | 'consolidation'
  | 'airport'
  | 'seaport'
  | 'rail-terminal'
  | 'cross-dock'
  | 'regional-hub'
  | 'fulfillment'
  | 'delivery-station'
  | 'destination'
  | 'returns'

export type SupplyChainFacility = {
  id: string
  code: string
  name: string
  kind: SupplyChainFacilityKind
  region: string
  /** WGS84 point used to place the modeled site within its real regional context. */
  geo: readonly [longitude: number, latitude: number]
  summary: string
  capacity: string
}

export type SupplyChainLeg = {
  id: string
  from: string
  to: string
  mode: SupplyChainMode
  label: string
}

export type SupplyChainEvent = {
  id: string
  consignmentId: string
  facilityId: string
  legId?: string
  atSeconds: number
  title: string
  detail: string
  state: 'planned' | 'recorded' | 'exception'
}

export type SupplyChainResource = {
  id: string
  code: string
  name: string
  kind: 'road-vehicle' | 'rail-unit' | 'air-cargo' | 'sea-container'
  consignmentId: string
  modes: readonly SupplyChainMode[]
}

export type SupplyChainConsignment = {
  id: string
  reference: string
  contents: string
  quantity: number
  unit: string
  originFacilityId: string
  destinationFacilityId: string
  returnConsignmentId?: string
  legIds: readonly string[]
  etaSeconds: number
  service: string
}

export type SupplyChainScenario = {
  id: string
  revision: string
  seed: string
  durationSeconds: number
  facilities: readonly SupplyChainFacility[]
  legs: readonly SupplyChainLeg[]
  resources: readonly SupplyChainResource[]
  consignments: readonly SupplyChainConsignment[]
  events: readonly SupplyChainEvent[]
}

const minutes = (value: number) => value * 60

export const SUPPLY_CHAIN_SCENARIO: SupplyChainScenario = {
  id: 'scenario.network-sample-01',
  revision: '1.0.0',
  seed: 'network-sample-01',
  durationSeconds: minutes(18),
  facilities: [
    { id: 'facility.supplier', code: 'SUP-04', name: 'Materials supplier', kind: 'supplier', region: 'Tuas · west Singapore', geo: [103.637, 1.321], summary: 'Illustrative supplier site in the western industrial area.', capacity: '4 collection bays' },
    { id: 'facility.production', code: 'MFG-12', name: 'Assembly site', kind: 'production', region: 'Jurong · west Singapore', geo: [103.704, 1.326], summary: 'Illustrative production site in the Jurong industrial area.', capacity: '2 production lines' },
    { id: 'facility.origin', code: 'ORG-02', name: 'Origin consolidation', kind: 'consolidation', region: 'Jurong · west Singapore', geo: [103.741, 1.333], summary: 'Scenario transfer site serving road, air and sea gateways.', capacity: '18 transfer lanes' },
    { id: 'facility.airport', code: 'AIR-06', name: 'Changi Airport cargo terminal', kind: 'airport', region: 'Changi · east Singapore', geo: [103.989325, 1.359211], summary: 'Airport reference point at Changi; runway and terminal footprints are modeled in metres.', capacity: '3 cargo stands' },
    { id: 'facility.seaport', code: 'SEA-03', name: 'Pasir Panjang container terminal', kind: 'seaport', region: 'Pasir Panjang · south Singapore', geo: [103.768333, 1.286667], summary: 'Representative location within the mapped Pasir Panjang terminal area; facility operations remain synthetic.', capacity: '3 modeled quay positions' },
    { id: 'facility.rail', code: 'RAIL-08', name: 'Kempas Baru rail gateway', kind: 'rail-terminal', region: 'Johor Bahru · Malaysia', geo: [103.723270, 1.535345], summary: 'Regional rail site anchored to the current Kempas Baru station location; freight activity is synthetic.', capacity: '4 modeled tracks' },
    { id: 'facility.transfer', code: 'XDK-05', name: 'Intermodal transfer', kind: 'cross-dock', region: 'Central Singapore', geo: [103.826, 1.326], summary: 'Illustrative transfer site where inbound legs are reconciled and assigned to regional routes.', capacity: '12 cross-dock doors' },
    { id: 'facility.hub', code: 'HUB-01', name: 'Regional distribution hub', kind: 'regional-hub', region: 'East Singapore', geo: [103.905, 1.353], summary: 'Illustrative regional sort site with onward transport staging.', capacity: '24 sort lanes' },
    { id: 'facility.fulfillment', code: 'FUL-07', name: 'Fulfillment center', kind: 'fulfillment', region: 'Changi South · east Singapore', geo: [103.963, 1.343], summary: 'Illustrative order assembly site near the eastern logistics district.', capacity: '9 outbound doors' },
    { id: 'facility.delivery', code: 'DLV-11', name: 'Delivery station', kind: 'delivery-station', region: 'Bedok · east Singapore', geo: [103.934, 1.336], summary: 'Illustrative last-mile dispatch site serving eastern districts.', capacity: '7 delivery routes' },
    { id: 'facility.destination', code: 'DST-18', name: 'Recipient destination', kind: 'destination', region: 'Bedok · east Singapore', geo: [103.906, 1.329], summary: 'Illustrative recipient handoff location.', capacity: 'Recipient handoff' },
    { id: 'facility.returns', code: 'RTN-02', name: 'Returns inspection', kind: 'returns', region: 'Jurong · west Singapore', geo: [103.727, 1.339], summary: 'Illustrative returns site for inspection and disposition.', capacity: '3 inspection benches' },
  ],
  legs: [
    { id: 'leg.supplier-production', from: 'facility.supplier', to: 'facility.production', mode: 'road', label: 'Supplier pickup' },
    { id: 'leg.production-origin', from: 'facility.production', to: 'facility.origin', mode: 'road', label: 'Origin transfer' },
    { id: 'leg.origin-air', from: 'facility.origin', to: 'facility.airport', mode: 'road', label: 'Airport drayage' },
    { id: 'leg.origin-sea', from: 'facility.origin', to: 'facility.seaport', mode: 'road', label: 'Port drayage' },
    { id: 'leg.origin-rail', from: 'facility.origin', to: 'facility.rail', mode: 'rail', label: 'Rail service' },
    { id: 'leg.air-transfer', from: 'facility.airport', to: 'facility.transfer', mode: 'air', label: 'Air linehaul' },
    { id: 'leg.sea-transfer', from: 'facility.seaport', to: 'facility.transfer', mode: 'sea', label: 'Sea linehaul' },
    { id: 'leg.rail-transfer', from: 'facility.rail', to: 'facility.transfer', mode: 'rail', label: 'Rail linehaul' },
    { id: 'leg.transfer-hub', from: 'facility.transfer', to: 'facility.hub', mode: 'road', label: 'Regional trunk' },
    { id: 'leg.hub-fulfillment', from: 'facility.hub', to: 'facility.fulfillment', mode: 'road', label: 'Distribution' },
    { id: 'leg.fulfillment-delivery', from: 'facility.fulfillment', to: 'facility.delivery', mode: 'road', label: 'Outbound parcel' },
    { id: 'leg.delivery-destination', from: 'facility.delivery', to: 'facility.destination', mode: 'road', label: 'Last mile' },
    { id: 'leg.destination-returns', from: 'facility.destination', to: 'facility.returns', mode: 'reverse', label: 'Return pickup' },
    { id: 'leg.returns-hub', from: 'facility.returns', to: 'facility.hub', mode: 'reverse', label: 'Reverse linehaul' },
  ],
  resources: [
    { id: 'resource.carrier-2048', code: 'VEH-2048', name: 'Priority carrier', kind: 'road-vehicle', consignmentId: 'consignment.air-2048', modes: ['road', 'reverse'] },
    { id: 'resource.flight-2048', code: 'AIR-2048', name: 'Priority air cargo', kind: 'air-cargo', consignmentId: 'consignment.air-2048', modes: ['air'] },
    { id: 'resource.container-2051', code: 'BOX-2051', name: 'Ocean container', kind: 'sea-container', consignmentId: 'consignment.sea-2051', modes: ['road', 'sea'] },
    { id: 'resource.unit-2057', code: 'UNIT-2057', name: 'Regional rail unit', kind: 'rail-unit', consignmentId: 'consignment.rail-2057', modes: ['road', 'rail'] },
  ],
  consignments: [
    { id: 'consignment.air-2048', reference: 'SC-2048', contents: 'Precision components', quantity: 18, unit: 'cases', originFacilityId: 'facility.supplier', destinationFacilityId: 'facility.destination', returnConsignmentId: 'return.SC-2048', legIds: ['leg.supplier-production', 'leg.production-origin', 'leg.origin-air', 'leg.air-transfer', 'leg.transfer-hub', 'leg.hub-fulfillment', 'leg.fulfillment-delivery', 'leg.delivery-destination'], etaSeconds: minutes(13), service: 'Priority air' },
    { id: 'consignment.sea-2051', reference: 'SC-2051', contents: 'Homeware cartons', quantity: 42, unit: 'cartons', originFacilityId: 'facility.production', destinationFacilityId: 'facility.delivery', legIds: ['leg.production-origin', 'leg.origin-sea', 'leg.sea-transfer', 'leg.transfer-hub', 'leg.hub-fulfillment', 'leg.fulfillment-delivery'], etaSeconds: minutes(16), service: 'Ocean freight' },
    { id: 'consignment.rail-2057', reference: 'SC-2057', contents: 'Retail replenishment', quantity: 26, unit: 'pallets', originFacilityId: 'facility.supplier', destinationFacilityId: 'facility.delivery', legIds: ['leg.supplier-production', 'leg.production-origin', 'leg.origin-rail', 'leg.rail-transfer', 'leg.transfer-hub', 'leg.hub-fulfillment', 'leg.fulfillment-delivery'], etaSeconds: minutes(15), service: 'Regional rail' },
  ],
  events: [
    { id: 'event.air.created', consignmentId: 'consignment.air-2048', facilityId: 'facility.supplier', atSeconds: 0, title: 'Consignment created', detail: 'Synthetic scenario begins at the materials supplier.', state: 'recorded' },
    { id: 'event.air.pickup', consignmentId: 'consignment.air-2048', facilityId: 'facility.supplier', legId: 'leg.supplier-production', atSeconds: 48, title: 'Collection dispatched', detail: 'Road vehicle assigned for supplier collection.', state: 'recorded' },
    { id: 'event.air.production', consignmentId: 'consignment.air-2048', facilityId: 'facility.production', legId: 'leg.production-origin', atSeconds: 132, title: 'Goods released', detail: 'Packed cases transferred to origin consolidation.', state: 'recorded' },
    { id: 'event.air.origin', consignmentId: 'consignment.air-2048', facilityId: 'facility.origin', legId: 'leg.origin-air', atSeconds: 218, title: 'Air transfer prepared', detail: 'Consignment assigned to the air gateway.', state: 'recorded' },
    { id: 'event.air.arrive', consignmentId: 'consignment.air-2048', facilityId: 'facility.airport', legId: 'leg.air-transfer', atSeconds: 296, title: 'Cargo accepted', detail: 'Freight accepted at the air cargo terminal.', state: 'recorded' },
    { id: 'event.air.depart', consignmentId: 'consignment.air-2048', facilityId: 'facility.transfer', legId: 'leg.transfer-hub', atSeconds: 390, title: 'Air linehaul arrived', detail: 'Arrival was recorded at the intermodal transfer.', state: 'recorded' },
    { id: 'event.air.hub', consignmentId: 'consignment.air-2048', facilityId: 'facility.hub', legId: 'leg.hub-fulfillment', atSeconds: 480, title: 'Regional sort complete', detail: 'Consignment routed to fulfillment.', state: 'recorded' },
    { id: 'event.air.fulfillment', consignmentId: 'consignment.air-2048', facilityId: 'facility.fulfillment', legId: 'leg.fulfillment-delivery', atSeconds: 585, title: 'Outbound order packed', detail: 'Delivery station dispatch is prepared.', state: 'recorded' },
    { id: 'event.air.station', consignmentId: 'consignment.air-2048', facilityId: 'facility.delivery', legId: 'leg.delivery-destination', atSeconds: 682, title: 'Courier route dispatched', detail: 'Last-mile route is active in the synthetic scenario.', state: 'recorded' },
    { id: 'event.air.delivered', consignmentId: 'consignment.air-2048', facilityId: 'facility.destination', legId: 'leg.destination-returns', atSeconds: 758, title: 'Delivery recorded', detail: 'Recipient handoff recorded; forward journey is complete.', state: 'recorded' },
    { id: 'event.air.return-created', consignmentId: 'consignment.air-2048', facilityId: 'facility.destination', legId: 'leg.destination-returns', atSeconds: 824, title: 'Return requested', detail: 'Return is linked to the original consignment.', state: 'recorded' },
    { id: 'event.air.return-pickup', consignmentId: 'consignment.air-2048', facilityId: 'facility.returns', legId: 'leg.returns-hub', atSeconds: 908, title: 'Return inspected', detail: 'Synthetic inspection routed the item to regional disposition.', state: 'recorded' },
    { id: 'event.air.return-close', consignmentId: 'consignment.air-2048', facilityId: 'facility.hub', atSeconds: 1010, title: 'Return disposition complete', detail: 'Reverse movement is complete in this sample.', state: 'recorded' },
    { id: 'event.sea.created', consignmentId: 'consignment.sea-2051', facilityId: 'facility.production', atSeconds: 0, title: 'Consignment created', detail: 'Synthetic ocean freight sample.', state: 'recorded' },
    { id: 'event.sea.origin', consignmentId: 'consignment.sea-2051', facilityId: 'facility.origin', legId: 'leg.origin-sea', atSeconds: 185, title: 'Port drayage assigned', detail: 'Road transfer to the seaport terminal.', state: 'recorded' },
    { id: 'event.sea.exception', consignmentId: 'consignment.sea-2051', facilityId: 'facility.seaport', legId: 'leg.sea-transfer', atSeconds: 262, title: 'Port review hold', detail: 'Synthetic exception: a document review pauses the ocean handoff before release.', state: 'exception' },
    { id: 'event.sea.port', consignmentId: 'consignment.sea-2051', facilityId: 'facility.seaport', legId: 'leg.sea-transfer', atSeconds: 330, title: 'Container loaded', detail: 'Sea terminal handoff is recorded.', state: 'recorded' },
    { id: 'event.sea.transfer', consignmentId: 'consignment.sea-2051', facilityId: 'facility.transfer', legId: 'leg.transfer-hub', atSeconds: 640, title: 'Sea linehaul arrived', detail: 'Intermodal transfer received the ocean freight.', state: 'recorded' },
    { id: 'event.rail.created', consignmentId: 'consignment.rail-2057', facilityId: 'facility.supplier', atSeconds: 0, title: 'Consignment created', detail: 'Synthetic regional rail sample.', state: 'recorded' },
    { id: 'event.rail.origin', consignmentId: 'consignment.rail-2057', facilityId: 'facility.origin', legId: 'leg.origin-rail', atSeconds: 205, title: 'Rail transfer prepared', detail: 'Freight routed to the east corridor.', state: 'recorded' },
    { id: 'event.rail.terminal', consignmentId: 'consignment.rail-2057', facilityId: 'facility.rail', legId: 'leg.rail-transfer', atSeconds: 365, title: 'Rail departure recorded', detail: 'Scheduled rail terminal handoff.', state: 'recorded' },
    { id: 'event.rail.transfer', consignmentId: 'consignment.rail-2057', facilityId: 'facility.transfer', legId: 'leg.transfer-hub', atSeconds: 615, title: 'Rail linehaul arrived', detail: 'Intermodal transfer received the rail freight.', state: 'recorded' },
  ],
}

export type SupplyChainProjection = {
  timeSeconds: number
  events: readonly SupplyChainEvent[]
  latestEvent?: SupplyChainEvent
  nextEvent?: SupplyChainEvent
  activeLegId?: string
  completedConsignmentIds: ReadonlySet<string>
  activeConsignmentCount: number
}

export function projectSupplyChainScenario(
  scenario: SupplyChainScenario,
  timeSeconds: number,
  selectedConsignmentId: string,
): SupplyChainProjection {
  const time = Math.max(0, Math.min(scenario.durationSeconds, timeSeconds))
  const events = scenario.events
    .filter(event => event.consignmentId === selectedConsignmentId)
    .slice()
    .sort((a, b) => a.atSeconds - b.atSeconds)
  const elapsed = events.filter(event => event.atSeconds <= time)
  const upcoming = events.find(event => event.atSeconds > time)
  const latest = elapsed.at(-1)
  const activeLegId = upcoming?.legId || latest?.legId
  const completedConsignmentIds = new Set(
    scenario.events
      .filter(event => event.title === 'Delivery recorded' && event.atSeconds <= time)
      .map(event => event.consignmentId),
  )
  const activeConsignmentCount = scenario.consignments.filter(consignment => {
    const relevant = scenario.events.filter(event => event.consignmentId === consignment.id)
    const first = relevant[0]?.atSeconds ?? Number.POSITIVE_INFINITY
    const last = relevant.at(-1)?.atSeconds ?? Number.POSITIVE_INFINITY
    return time >= first && time < last
  }).length
  return {
    timeSeconds: time,
    events,
    latestEvent: latest,
    nextEvent: upcoming,
    activeLegId,
    completedConsignmentIds,
    activeConsignmentCount,
  }
}

export function scenarioFacility(scenario: SupplyChainScenario, id: string) {
  return scenario.facilities.find(facility => facility.id === id)
}

export function scenarioLeg(scenario: SupplyChainScenario, id: string) {
  return scenario.legs.find(leg => leg.id === id)
}

export function scenarioConsignment(scenario: SupplyChainScenario, id: string) {
  return scenario.consignments.find(consignment => consignment.id === id)
}

export function scenarioResource(scenario: SupplyChainScenario, id: string) {
  return scenario.resources.find(resource => resource.id === id)
}
