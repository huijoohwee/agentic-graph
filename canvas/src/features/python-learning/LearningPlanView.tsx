import React from 'react'
import { WAREHOUSE_DOORS, snapLearningPosition, placementIssue, spatialBlocks } from './learningSpatialEditing'
import { cancelLearningPlacement, placeLearningAsset, toggleWarehouseDoor } from './learningSpatialActions'
import { useWarehouseInspection } from './useWarehouseInspection'
import { WarehouseInspectionPlanRoutes } from './WarehouseInspectionPaths'
import { WarehousePlanDrawing } from './WarehousePlanDrawing'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveFloatingPanelRightClearanceCss } from '@/lib/ui/floatingPanelGeometry'
import './learningSpatialView.css'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { learningAssets, useLearningSpatialView, useLearningViewportLeft } from './learningSpatialView'

/** SVG keeps the measured plan available offline and on browsers without WebGL. */
export default function LearningPlanView({ lesson, scene, editorOpen = false }: { lesson: LearningLesson; scene?: LearningSceneSnapshot; editorOpen?: boolean }) {
  const inspection = useWarehouseInspection()
  const { ref, left } = useLearningViewportLeft(editorOpen)
  const panelOpen = useGraphStore(state => state.floatingPanelOpen)
  const panelRatio = useGraphStore(state => state.floatingPanelWidthRatio)
  const { view, update, runtime } = useLearningSpatialView()
  const [framing, setFraming] = React.useState<'room' | 'flight' | 'asset'>('room')
  const [headerTop, setHeaderTop] = React.useState(176)
  React.useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const controls = root.parentElement?.querySelector('.learning-scene-controls')
    const refresh = () => {
      const frame = root.getBoundingClientRect(), control = controls?.getBoundingClientRect()
      const top = control ? Math.max(0, control.bottom - frame.top) + 12 : 176
      setHeaderTop(top)
    }
    const observer = new ResizeObserver(refresh)
    ;[root, controls].forEach(element => { if (element) observer.observe(element) })
    refresh(); window.addEventListener('resize', refresh)
    return () => { observer.disconnect(); window.removeEventListener('resize', refresh) }
  }, [ref])
  const [hover, setHover] = React.useState<readonly [number, number, number] | null>(null)
  const template = lesson.obstacles.find(o => `obstacle:${o.id}` === view.placement)
  const preview = template && hover ? { position: hover, size: [template.size[0], template.height ?? 1, template.size[1]] as const } : null
  const issue = preview ? placementIssue(preview, spatialBlocks(lesson, view.placed)) : null
  const point = (event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget, matrix = svg.getScreenCTM()?.inverse()
    if (!matrix) return null
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
    return snapLearningPosition(p.x, p.y)
  }
  const pattern = React.useId().replace(/:/g, '')
  const assets = [...learningAssets(lesson, scene, inspection.active ? inspection.sample : undefined), ...view.placed.map(o => ({ ...o, kind: 'obstacle' as const, detail: 'Layout preview only' }))]
  const trace = !inspection.active && !runtime.stale ? runtime.result?.trace : undefined
  const selected = assets.find(asset => asset.id === view.selectedId) ?? assets[0]
  const select = (id: string) => { if (!view.placement) update({ selectedId: id }) }
  const selectionProps = (id: string, name: string) => ({ role: 'button', tabIndex: 0, 'aria-label': `Select ${name}`, 'aria-pressed': view.selectedId === id,
    onClick: () => select(id), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(id) } } })
  return <section ref={ref} className="learning-spatial-ui learning-plan-frame absolute inset-0 flex flex-col bg-[var(--kg-canvas-bg)]" style={{ left, ...(panelOpen ? { '--learning-panel-clearance': resolveFloatingPanelRightClearanceCss(panelRatio) } : {}) } as React.CSSProperties} aria-label="Drone lesson floor plan">
    <div style={{ marginTop: headerTop }} className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 text-xs">
      <div><strong className="block text-base">Warehouse flight studio</strong><span>{inspection.active ? 'Facility rehearsal · X / Z metres · routes with declared exclusions' : 'Concept layout · X / Z metres · Python flight limited to blue cell'}</span></div>
      <div className="flex gap-1">{(['room', 'flight', 'asset'] as const).map(value => <button key={value} type="button"
        className="min-h-11 rounded border px-3" aria-pressed={framing === value} onClick={() => setFraming(value)}>Fit {value === 'room' ? 'warehouse' : value === 'asset' ? 'selected asset' : value}</button>)}</div>
    </div>
    <svg tabIndex={0} style={{ cursor: view.placement ? 'crosshair' : undefined }}
      onKeyDown={event => { if (event.key === 'Escape' && view.placement) { event.preventDefault(); cancelLearningPlacement() } }}
      onPointerMove={event => { if (view.placement) setHover(point(event)) }} onPointerLeave={() => setHover(null)}
      onClick={event => { if (view.placement) { const p = point(event); if (p) placeLearningAsset(p[0], p[2]) } }}
      className="min-h-0 w-full flex-1" viewBox={framing === 'room' ? '-62 -25 124 58' : framing === 'flight' ? '-1.8 -3.6 7.6 7.2' : `${selected.position[0] - Math.max(.4, selected.size[0])} ${selected.position[2] - Math.max(.4, selected.size[2])} ${Math.max(.4, selected.size[0]) * 2} ${Math.max(.4, selected.size[2]) * 2}`} aria-label="Measured warehouse floor" role="group">
      <defs><pattern id={pattern} width="0.5" height="0.5" patternUnits="userSpaceOnUse"><path d="M .5 0 H 0 V .5" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth=".012" /></pattern></defs>
      {framing === 'room' && <WarehousePlanDrawing selectedId={view.selectedId} onSelect={select} dimensions={view.dimensions} />}
      <rect x="-8" y="-8" width="16" height="16" fill="#eef8ff" fillOpacity=".55" stroke="#367cb7" strokeWidth=".08" strokeDasharray=".25 .15" {...selectionProps('room', 'Inspection cell')} />
      <rect x="-8" y="-8" width="16" height="16" fill={`url(#${pattern})`} pointerEvents="none" />
      {framing === 'room' && <text x="-7.6" y="-7.3" fontSize=".42" fill="#244c70">Inspection cell · 16 × 16 m · altitude 0–4 m</text>}
      {view.dimensions && <g fill="currentColor" stroke="currentColor" strokeWidth=".018" pointerEvents="none">
        <path d={`M 0 1.1 H ${lesson.goal[0]} M 0 .95 V 1.25 M ${lesson.goal[0]} .95 V 1.25`} />
        <text x={lesson.goal[0] / 2} y="1.45" fontSize=".22" stroke="none" textAnchor="middle">{lesson.goal[0].toFixed(2)} m inspection leg</text>
        <path d="M -1.1 -1.8 V 1.8 M -1.25 -1.8 H -.95 M -1.25 1.8 H -.95" />
        <text transform="translate(-1.35 0) rotate(-90)" fontSize=".22" stroke="none" textAnchor="middle">3.60 m aisle</text>
      </g>}
      {inspection.active && <WarehouseInspectionPlanRoutes />}
      {trace && <polyline points={trace.map(row => `${row[1]},${row[2]}`).join(' ')} fill="none" stroke="#367cb7" strokeWidth=".045" pointerEvents="none"><title>Recorded flight projection</title></polyline>}
      {assets.filter(asset => ['pad', 'obstacle', 'drone', 'truck'].includes(asset.kind)).map(asset => <g key={asset.id} {...selectionProps(asset.id, asset.name)} style={{ cursor: 'pointer' }} transform={`translate(${asset.position[0]} ${asset.position[2]})`}>
        <title>{asset.name} · {asset.detail}</title>
        {asset.kind === 'truck' ? <g transform={`rotate(${inspection.sample.actors.truck.heading})`}><rect x={-.11} y={-.08} width={.22} height={.16} fill={asset.color} stroke="#859ba6" strokeWidth={.005} /><path d="M -.11 0 H .11" stroke="#9db0ba" strokeWidth={.004} /><path d="M -.105 -.092 H .105 M -.105 .092 H .105" stroke="#131f26" strokeWidth={.018} /></g> : asset.kind === 'pad' ? <><circle r=".54" fill={asset.color} fillOpacity=".14" stroke={asset.color} strokeWidth=".025" /><circle r=".24" fill="none" stroke={asset.color} strokeWidth=".025" /></>
          : asset.kind === 'drone' ? <g transform={`rotate(${inspection.active ? (asset.id === 'drone' ? inspection.sample.actors.drone001.heading : inspection.sample.actors.drone002.heading) : scene?.heading ?? 0}) scale(${asset.id === 'drone002' ? .28 : 1})`}><circle r=".25" fill="var(--kg-panel-bg)" stroke={asset.color} strokeWidth=".025" /><path d="M .3 0 L -.1 -.13 V .13 Z" fill={asset.color} />{[-1, 1].flatMap(x => [-1, 1].map(z => <circle key={`${x}:${z}`} cx={x * .13} cy={z * .13} r=".075" fill="none" stroke={asset.color} strokeWidth=".02" />))}</g>
            : <><rect x={-asset.size[0] / 2} y={-asset.size[2] / 2} width={asset.size[0]} height={asset.size[2]} rx=".03" fill={asset.color} stroke="#426a85" strokeWidth=".025" /><path d={`M ${-asset.size[0] * .3} ${-asset.size[2] / 2} v ${asset.size[2]} M ${asset.size[0] * .3} ${-asset.size[2] / 2} v ${asset.size[2]}`} stroke="#59656c" strokeWidth=".04" /></>}
        <rect x={-Math.max(asset.size[0], .6) / 2 - .06} y={-Math.max(asset.size[2], .6) / 2 - .06} width={Math.max(asset.size[0], .6) + .12} height={Math.max(asset.size[2], .6) + .12} fill="transparent" stroke={view.selectedId === asset.id ? '#438dce' : 'transparent'} strokeWidth=".025" rx=".07" />
        <text y={asset.id === 'drone' ? -.65 : asset.size[2] / 2 + .3} textAnchor="middle" fontSize=".18" fill="currentColor" stroke="var(--kg-canvas-bg)" strokeWidth=".035" paintOrder="stroke">{asset.name}</text>
      </g>)}
      {WAREHOUSE_DOORS.map(door => <g key={door.id} role="button" tabIndex={0} aria-label={`${view.doors.includes(door.id) ? 'Close' : 'Open'} ${door.name}`} aria-pressed={view.doors.includes(door.id)}
        onClick={event => { if (!view.placement) { event.stopPropagation(); toggleWarehouseDoor(door.id) } }}
        onKeyDown={event => { if (!view.placement && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleWarehouseDoor(door.id) } }}
        transform={`translate(${door.x - door.width / 2} ${door.z})`} style={{ cursor: 'pointer' }}>
        <rect x="-.15" y="-.4" width={door.width + .3} height={door.width + .6} fill="transparent" />
        <path d={`M ${door.width} 0 A ${door.width} ${door.width} 0 0 1 0 ${door.width}`} fill="none" stroke="#9b7854" strokeWidth=".06" strokeDasharray=".15 .1" />
        <path d={view.doors.includes(door.id) ? `M 0 0 V ${door.width}` : `M 0 0 H ${door.width}`} stroke={view.doors.includes(door.id) ? '#329784' : '#52728d'} strokeWidth=".15" />
        <title>{door.name} · click to {view.doors.includes(door.id) ? 'close' : 'open'}</title>
      </g>)}
      {preview && <g pointerEvents="none" aria-label={issue ?? 'Clear placement'}><rect x={preview.position[0] - preview.size[0] / 2} y={preview.position[2] - preview.size[2] / 2} width={preview.size[0]} height={preview.size[2]} fill={issue ? '#dc635a' : '#42bdab'} fillOpacity=".4" stroke={issue ? '#b93131' : '#168b7c'} strokeWidth=".07" strokeDasharray=".15 .08" /><text x={preview.position[0]} y={preview.position[2] - preview.size[2] / 2 - .3} fontSize=".35" fill="currentColor" textAnchor="middle">{issue ? 'Blocked' : 'Click to place'} · 0.25 m snap</text></g>}
      <g transform="translate(6.5 6.5)" fontSize=".22" pointerEvents="none"><path d="M 0 -.8 V 0 H .8" fill="none" stroke="#438dce" strokeWidth=".04" /><text x=".95" y=".05" fill="currentColor">X</text><text x="-.06" y="-.95" fill="currentColor">−Z</text></g>
    </svg>
    <footer className="flex shrink-0 flex-wrap justify-between gap-2 border-t px-4 py-3 text-xs"><span>{selected.name} · X {selected.position[0].toFixed(2)} · Z {selected.position[2].toFixed(2)} m</span><span>{inspection.active ? `${inspection.sample.coverage.rackVisited}/${inspection.sample.coverage.rackTotal} modeled rack stations · Timeline rehearsal` : trace ? 'Recorded flight projection' : 'Run Python to record a flight'} · Select to inspect</span></footer>
  </section>
}
