import React from 'react'
import { WAREHOUSE_ZONES, WAREHOUSE_DOCKS, WAREHOUSE_CONTEXT_RACKS, warehouseAllocation } from './warehouseLayout'

/** One measured drawing for the interactive plan and standalone blueprint export. */
export function WarehousePlanDrawing({ selectedId, onSelect, dimensions = true, context = true }: {
  selectedId?: string; onSelect?: (id: string) => void; dimensions?: boolean; context?: boolean
}) {
  const select = (id: string, label: string) => onSelect ? { role: 'button', tabIndex: 0, 'aria-label': `Select ${label}`, 'aria-pressed': selectedId === id,
    onClick: () => onSelect(id), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(id) } } } : {}
  const allocation = warehouseAllocation()
  return <g fontFamily="system-ui, sans-serif">
    {context && <>
      <path d="M -54 -20 V 24 H 54 V -20" fill="none" stroke="#d9dfe1" strokeWidth="12" />
      <path d="M -54 -20 V 24 H 54 V -20" fill="none" stroke="#89969c" strokeWidth=".12" strokeDasharray="1 1" />
      <path d="M -60 20 H 60 V 28 H -60 Z" fill="#d9dfe1" stroke="#b0b9be" strokeWidth=".1" />
      <text x="0" y="26" textAnchor="middle" fill="#334755" fontSize="1">8 m access / ramp connection →</text>
      <text transform="translate(-57 -2) rotate(-90)" textAnchor="middle" fill="#334755" fontSize="1">12 m container maneuvering aisle</text>
      <text transform="translate(57 -2) rotate(90)" textAnchor="middle" fill="#334755" fontSize="1">12 m container maneuvering aisle</text>
      {WAREHOUSE_DOCKS.map(dock => <g key={dock.id} {...select(`dock:${dock.id}`, dock.name)}>
        <rect x={dock.x} y={dock.z} width={dock.width} height={dock.depth} fill="#f4efe3" stroke={selectedId === `dock:${dock.id}` ? '#277aca' : '#b19a6d'} strokeWidth=".18" strokeDasharray=".5 .2" />
        <text x={dock.x + 9} y={dock.z + 1.6} textAnchor="middle" fill="#334755" fontSize=".95">{dock.name} · 20/40 ft</text>
        <text x={dock.x + 9} y={dock.z + 2.9} textAnchor="middle" fill="#57626a" fontSize=".8">4 × 18 m container bay</text>
        <rect x={dock.side === 'inbound' ? -30.8 : 29.2} y={dock.z + .8} width="1.6" height="2.4" fill="#596c7a" stroke="#edf4f8" strokeWidth=".14"><title>{`Dock leveler · ${dock.name}`}</title></rect>
      </g>)}
      <text x="-40" y="7.8" textAnchor="middle" fill="#334755" fontSize=".9">INBOUND → · DL = dock leveler</text>
      <text x="40" y="10" textAnchor="middle" fill="#334755" fontSize=".9">OUTBOUND → · DL at each dock</text>
    </>}
    <rect x="-30" y="-20" width="60" height="40" fill="#eef1ed" stroke="#556570" strokeWidth=".35" />
    {WAREHOUSE_ZONES.map(zone => <g key={zone.id} {...select(`zone:${zone.id}`, zone.name)}>
      <rect x={zone.rect[0] + .12} y={zone.rect[1] + .12} width={zone.rect[2] - .24} height={zone.rect[3] - .24} fill={zone.color} fillOpacity=".6" stroke={selectedId === `zone:${zone.id}` ? '#277aca' : '#74858b'} strokeWidth={selectedId === `zone:${zone.id}` ? '.25' : '.08'} />
      <text x={zone.rect[0] + .65} y={zone.rect[1] + 1.65} fontSize={zone.rect[2] < 11 ? '.76' : '.95'} fill="#253e4d">{zone.name}</text>
      <text x={zone.rect[0] + .65} y={zone.rect[1] + 2.8} fontSize=".75" fill="#425762">{zone.rect[2] * zone.rect[3]} m² · {zone.use}</text>
    </g>)}
    {/* Context rack footprints are outside the inspection cell. */}
    {WAREHOUSE_CONTEXT_RACKS.map(rack => <g key={rack.id}>
      <rect x={rack.position[0] - rack.size[0] / 2} y={rack.position[1] - rack.size[2] / 2} width={rack.size[0]} height={rack.size[2]} fill={rack.zoneId === 'pallet' ? '#e0ab77' : '#ceb48c'} stroke="#527c91" strokeWidth=".14" />
      <path d={`M ${rack.position[0] - rack.size[0] / 2} ${rack.position[1]} h ${rack.size[0]}`} stroke="#527c91" strokeWidth=".12" />
    </g>)}
    <path d="M -28 -5 H -22 M -22 -5 l -1 -.5 m 1 .5 l -1 .5 M 22 6 H 28 m -1 -.5 l 1 .5 l -1 .5" fill="none" stroke="#4a7383" strokeWidth=".25" />
    <path d="M 12 20 h 4" stroke="#eff9ff" strokeWidth=".5" /><text x="18" y="19" fill="#334755" fontSize=".75">Staff entry ↑</text>
    {dimensions && <g fill="#334755" stroke="#5c7484" strokeWidth=".1">
      <path d="M -30 -22 H 30 M -30 -22.6 V -21.4 M 30 -22.6 V -21.4" /><text x="0" y="-22.8" textAnchor="middle" fontSize="1" stroke="none">60.00 m</text>
      <path d="M 31.5 -20 V 20 M 31 -20 H 32 M 31 20 H 32" /><text transform="translate(32.8 12) rotate(-90)" fontSize="1" stroke="none">40.00 m</text>
    </g>}
    {context && <text x="0" y="31" textAnchor="middle" fill="#334755" fontSize="1">2,400 m² indoor concept · {allocation.corePercent}% logistics / {allocation.ancillaryPercent}% ancillary · assumed dimensions</text>}
  </g>
}
