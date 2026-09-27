/** Concept dimensions, not a surveyed or approved building. Flight bounds remain lesson-owned. */
export type WarehouseZone = Readonly<{ id: string; name: string; rect: readonly [number, number, number, number]; use: 'core' | 'ancillary'; color: string }>
export const WAREHOUSE_ZONES: readonly WarehouseZone[] = [
  { id: 'vault', name: 'High-value vault', rect: [-30, -20, 10, 10], use: 'core', color: '#8c9cae' },
  { id: 'climate', name: 'Climate storage', rect: [-20, -20, 14, 10], use: 'core', color: '#8ebbc8' },
  { id: 'kitting', name: 'Kitting / assembly', rect: [-6, -20, 18, 10], use: 'core', color: '#a0baa6' },
  { id: 'packing', name: 'Packing / staging', rect: [12, -20, 18, 10], use: 'core', color: '#c6b194' },
  { id: 'inbound', name: 'Receiving / security', rect: [-30, -10, 10, 10], use: 'core', color: '#a4bacf' },
  { id: 'bulk', name: 'Loose / bulk goods', rect: [-30, 0, 10, 12], use: 'core', color: '#c2b79e' },
  { id: 'pallet', name: 'Pallet racks / logistics aisles', rect: [-20, -10, 32, 22], use: 'core', color: '#bbc8c6' },
  { id: 'shelving', name: 'Small-item shelving', rect: [12, -10, 8, 22], use: 'core', color: '#b5bd9c' },
  { id: 'outbound', name: 'Outbound shipping', rect: [20, -10, 10, 22], use: 'core', color: '#cab1a1' },
  { id: 'support', name: 'Support / WC / M&E', rect: [-30, 12, 24, 8], use: 'ancillary', color: '#c4bccf' },
  { id: 'break', name: 'Staff break / pantry', rect: [-6, 12, 12, 8], use: 'ancillary', color: '#cfc3ad' },
  { id: 'office', name: 'Office / front entry', rect: [6, 12, 24, 8], use: 'ancillary', color: '#bec5d5' },
]
export const WAREHOUSE_DOCKS = [
  { id: 'in-1', name: 'Inbound bay 1', side: 'inbound', x: -48, z: -7, width: 18, depth: 4 },
  { id: 'in-2', name: 'Inbound bay 2', side: 'inbound', x: -48, z: -1, width: 18, depth: 4 },
  { id: 'out-1', name: 'Outbound bay 1', side: 'outbound', x: 30, z: -7, width: 18, depth: 4 },
  { id: 'out-2', name: 'Outbound bay 2', side: 'outbound', x: 30, z: 3, width: 18, depth: 4 },
] as const
/** Architectural racks outside the simulated cell; shared footprints for plan and 3D/XR. */
export const WAREHOUSE_CONTEXT_RACKS = [
  { id: 'pallet-west-north', zoneId: 'pallet', position: [-15, -5], size: [8, 4.5, 1.5] },
  { id: 'pallet-west-south', zoneId: 'pallet', position: [-15, 4], size: [8, 4.5, 1.5] },
  { id: 'shelving-east-north', zoneId: 'shelving', position: [16, -5], size: [6, 2.4, 0.8] },
  { id: 'shelving-east-south', zoneId: 'shelving', position: [16, 4], size: [6, 2.4, 0.8] },
] as const
export function warehouseAllocation() {
  const core = WAREHOUSE_ZONES.filter(zone => zone.use === 'core').reduce((sum, zone) => sum + zone.rect[2] * zone.rect[3], 0)
  const ancillary = WAREHOUSE_ZONES.filter(zone => zone.use === 'ancillary').reduce((sum, zone) => sum + zone.rect[2] * zone.rect[3], 0)
  return { core, ancillary, total: core + ancillary, corePercent: core / (core + ancillary) * 100, ancillaryPercent: ancillary / (core + ancillary) * 100 }
}
