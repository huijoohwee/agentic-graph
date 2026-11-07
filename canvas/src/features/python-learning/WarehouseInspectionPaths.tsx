import { memo, useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial } from 'three'
import { WAREHOUSE_INSPECTION } from './warehouseCoverageRoutes'

const routes = [
  { id: 'truck', label: 'Charging truck · aisle route', color: '#b77a20' },
  { id: 'drone001', label: 'Drone-001 · rack inspection', color: '#398bcc' },
  { id: 'drone002', label: 'Drone-002 · rack inspection', color: '#23977d' },
] as const

/** The same authored keyframes project into both native surfaces; no playback owner. */
export const WarehouseInspectionPlanRoutes = memo(function WarehouseInspectionPlanRoutes() {
  return <g pointerEvents="none" aria-label="Programmed warehouse coverage routes">
    {routes.map(route => <polyline key={route.id} points={WAREHOUSE_INSPECTION.paths[route.id].map(frame => `${frame.position[0]},${frame.position[2]}`).join(' ')}
      fill="none" stroke={route.color} strokeWidth=".07" opacity=".7" strokeDasharray={route.id === 'truck' ? '.25 .12' : undefined}>
      <title>{route.label}</title>
    </polyline>)}
    {WAREHOUSE_INSPECTION.targets.filter(target => target.kind === 'rack-face' && target.level === 1).map(target =>
      <circle key={target.id} cx={target.position[0]} cy={target.position[2]} r=".12" fill="#23977d"><title>{target.name}</title></circle>)}
  </g>
})

export const WarehouseInspectionSpatialRoutes = memo(function WarehouseInspectionSpatialRoutes() {
  const lines = useMemo(() => routes.map(route => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(WAREHOUSE_INSPECTION.paths[route.id].flatMap(frame =>
      [frame.position[0], Math.max(.035, frame.position[1]), frame.position[2]]), 3))
    const line = new Line(geometry, new LineBasicMaterial({ color: route.color, transparent: true, opacity: .6, depthWrite: false }))
    line.name = `warehouse-route-${route.id}`
    line.raycast = () => undefined
    return line
  }), [])
  useEffect(() => () => lines.forEach(line => { line.geometry.dispose(); line.material.dispose() }), [lines])
  return <group name="warehouse-coverage-routes">{lines.map(line => <primitive key={line.name} object={line} />)}</group>
})
