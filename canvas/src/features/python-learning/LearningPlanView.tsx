import React from 'react'
import { WarehousePlanDrawing } from './WarehousePlanDrawing'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveFloatingPanelRightClearanceCss } from '@/lib/ui/floatingPanelGeometry'
import './learningSpatialView.css'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { learningAssets, useLearningSpatialView, useLearningViewportLeft } from './learningSpatialView'

/** SVG keeps the measured plan available offline and on browsers without WebGL. */
export default function LearningPlanView({ lesson, scene, editorOpen = false }: { lesson: LearningLesson; scene?: LearningSceneSnapshot; editorOpen?: boolean }) {
  const { ref, left } = useLearningViewportLeft(editorOpen)
  const panelOpen = useGraphStore(state => state.floatingPanelOpen)
  const panelRatio = useGraphStore(state => state.floatingPanelWidthRatio)
  const { view, update, runtime } = useLearningSpatialView()
  const [framing, setFraming] = React.useState<'room' | 'flight'>('room')
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
  const pattern = React.useId().replace(/:/g, '')
  const assets = learningAssets(lesson, scene)
  const trace = !runtime.stale ? runtime.result?.trace : undefined
  const selected = assets.find(asset => asset.id === view.selectedId) ?? assets[0]
  const select = (id: string) => update({ selectedId: id })
  const selectionProps = (id: string, name: string) => ({ role: 'button', tabIndex: 0, 'aria-label': `Select ${name}`, 'aria-pressed': view.selectedId === id,
    onClick: () => select(id), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(id) } } })
  return <section ref={ref} className="learning-spatial-ui learning-plan-frame absolute inset-0 flex flex-col bg-[var(--kg-canvas-bg)]" style={{ left, ...(panelOpen ? { '--learning-panel-clearance': resolveFloatingPanelRightClearanceCss(panelRatio) } : {}) } as React.CSSProperties} aria-label="Drone lesson floor plan">
    <div style={{ marginTop: headerTop }} className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 text-xs">
      <div><strong className="block text-base">Warehouse flight studio</strong><span>Concept layout · X / Z metres · flight limited to blue cell</span></div>
      <div className="flex gap-1">{(['room', 'flight'] as const).map(value => <button key={value} type="button"
        className="min-h-11 rounded border px-3" aria-pressed={framing === value} onClick={() => setFraming(value)}>Fit {value === 'room' ? 'warehouse' : value}</button>)}</div>
    </div>
    <svg className="min-h-0 w-full flex-1" viewBox={framing === 'room' ? '-62 -25 124 58' : '-1.8 -3.6 7.6 7.2'} aria-label="Measured warehouse floor" role="group">
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
      {trace && <polyline points={trace.map(row => `${row[1]},${row[2]}`).join(' ')} fill="none" stroke="#367cb7" strokeWidth=".045" pointerEvents="none"><title>Recorded flight projection</title></polyline>}
      {assets.filter(asset => ['pad', 'obstacle', 'drone'].includes(asset.kind)).map(asset => <g key={asset.id} {...selectionProps(asset.id, asset.name)} style={{ cursor: 'pointer' }} transform={`translate(${asset.position[0]} ${asset.position[2]})`}>
        <title>{asset.name} · {asset.detail}</title>
        {asset.kind === 'pad' ? <><circle r=".54" fill={asset.color} fillOpacity=".14" stroke={asset.color} strokeWidth=".025" /><circle r=".24" fill="none" stroke={asset.color} strokeWidth=".025" /></>
          : asset.kind === 'drone' ? <g transform={`rotate(${scene?.heading ?? 0})`}><circle r=".25" fill="var(--kg-panel-bg)" stroke={asset.color} strokeWidth=".025" /><path d="M .3 0 L -.1 -.13 V .13 Z" fill={asset.color} />{[-1, 1].flatMap(x => [-1, 1].map(z => <circle key={`${x}:${z}`} cx={x * .13} cy={z * .13} r=".075" fill="none" stroke={asset.color} strokeWidth=".02" />))}</g>
            : <><rect x={-asset.size[0] / 2} y={-asset.size[2] / 2} width={asset.size[0]} height={asset.size[2]} rx=".03" fill={asset.color} stroke="#426a85" strokeWidth=".025" /><path d={`M ${-asset.size[0] * .3} ${-asset.size[2] / 2} v ${asset.size[2]} M ${asset.size[0] * .3} ${-asset.size[2] / 2} v ${asset.size[2]}`} stroke="#59656c" strokeWidth=".04" /></>}
        <rect x={-Math.max(asset.size[0], .6) / 2 - .06} y={-Math.max(asset.size[2], .6) / 2 - .06} width={Math.max(asset.size[0], .6) + .12} height={Math.max(asset.size[2], .6) + .12} fill="transparent" stroke={view.selectedId === asset.id ? '#438dce' : 'transparent'} strokeWidth=".025" rx=".07" />
        <text y={asset.id === 'drone' ? -.65 : asset.size[2] / 2 + .3} textAnchor="middle" fontSize=".18" fill="currentColor" stroke="var(--kg-canvas-bg)" strokeWidth=".035" paintOrder="stroke">{asset.name}</text>
      </g>)}
      <g transform="translate(6.5 6.5)" fontSize=".22" pointerEvents="none"><path d="M 0 -.8 V 0 H .8" fill="none" stroke="#438dce" strokeWidth=".04" /><text x=".95" y=".05" fill="currentColor">X</text><text x="-.06" y="-.95" fill="currentColor">−Z</text></g>
    </svg>
    <footer className="flex shrink-0 flex-wrap justify-between gap-2 border-t px-4 py-3 text-xs"><span>{selected.name} · X {selected.position[0].toFixed(2)} · Z {selected.position[2].toFixed(2)} m</span><span>{trace ? 'Recorded flight projection' : 'Run Python to record a flight'} · Select to inspect</span></footer>
  </section>
}
