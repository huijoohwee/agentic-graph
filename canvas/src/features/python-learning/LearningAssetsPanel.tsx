import React from 'react'
import { armLearningPlacement, cancelLearningPlacement, removeLearningAsset } from './learningSpatialActions'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useWarehouseInspection } from './useWarehouseInspection'
import { learningAssetCameraPose, resolveLearningAssetViewport } from './learningCameraPose'
import { CHARGE_TRUCK_DIMENSIONS } from './learningDockAssets'
import { warehouseAllocation } from './warehouseLayout'
import './learningSpatialView.css'
import { learningLesson } from './learningLessons'
import { learningAssets, useLearningSpatialView, type LearningAsset } from './learningSpatialView'

function AssetPreview({ asset }: { asset: LearningAsset }) {
  return <svg viewBox="0 0 160 100" className="w-full rounded bg-[var(--kg-surface-bg)]" aria-hidden>
    <ellipse cx="80" cy="78" rx="46" ry="10" fill="currentColor" opacity=".07" />
    {asset.kind === 'truck' ? <><path d="M 26 50 L 57 32 L 133 44 L 104 73 Z" fill="#39454f" /><path d="M 26 50 V 68 L 104 87 V 73 Z" fill="#17212a" /><path d="M 104 73 L 133 44 V 62 L 104 87 Z" fill="#25313b" /><path d="M 35 67 L 101 82 M 111 73 L 128 59" stroke="#080e14" strokeWidth="12" strokeLinecap="round" /><path d="M 43 44 L 67 30 L 119 41 L 94 56 Z" fill="#101c25" stroke="#738390" strokeWidth="2" /><path d="M 40 42 L 37 23 L 82 31 L 94 54 M 72 32 L 77 14 L 128 25 L 120 42" fill="#45515a" stroke="#94a0a7" strokeWidth="1.5" /><path d="M 119 38 V 13" stroke="#162831" strokeWidth="2" /><circle cx="77" cy="44" r="8" fill="none" stroke="#74c4c4" strokeWidth="2" /></>
      : asset.kind === 'zone'  || asset.kind === 'dock' ? <><path d="M 25 52 L 85 23 L 139 50 L 80 82 Z" fill={asset.color} stroke="#738a98" strokeWidth="2" /><path d="M 45 42 L 100 70 M 65 32 L 120 60 M 43 61 L 103 33" stroke="#fff" opacity=".6" /><text x="80" y="57" textAnchor="middle" fontSize="15" fill="#263c4c">{asset.kind === 'zone' ? `${asset.size[0] * asset.size[2]} m²` : 'DOCK'}</text></>
      : asset.id.startsWith('obstacle:rack-') ? <><path d="M 31 80 V 24 M 78 91 V 35 M 127 66 V 10" stroke="#266185" strokeWidth="6" />{[29, 49, 69].map(y => <g key={y}><path d={`M 33 ${y} L 78 ${y+11} L 126 ${y-14}`} stroke="#e48539" strokeWidth="5" fill="none" /><path d={`M 36 ${y-3} v -12 l 36 9 v 12 Z M 85 ${y+3} v -12 l 34 -17 v 12 Z`} fill="#c3a377" /></g>)}</>
      : asset.kind === 'pad' ? <><ellipse cx="80" cy="58" rx="40" ry="21" fill="#293941" /><ellipse cx="80" cy="58" rx="34" ry="17" fill="none" stroke={asset.color} strokeWidth="3" /><ellipse cx="80" cy="58" rx="16" ry="8" fill="none" stroke={asset.color} strokeWidth="3" /></>
      : asset.id === 'drone002' ? <><path d="M 43 31 L 117 72 M 43 72 L 117 31" stroke="#18252c" strokeWidth="8" />{[43, 117].flatMap(x => [31, 72].map(y => <g key={`${x}:${y}`}><circle cx={x} cy={y} r="6" fill="#a9904d" /><ellipse cx={x} cy={y-3} rx="20" ry="4" fill="#131e25" transform={`rotate(-25 ${x} ${y-3})`} /></g>))}<path d="M 61 37 L 95 33 L 104 65 L 66 70 Z" fill="#1d2b33" stroke="#93a3ae" /><path d="M 68 39 L 88 37 L 92 52 L 73 55 Z" fill="#b0b2a6" /><path d="M 70 61 H 94" stroke="#9baab0" strokeWidth="3" /><path d="M 52 38 L 64 47 M 101 58 L 112 65" stroke="#ba5b52" strokeWidth="2" /></>
      : asset.kind === 'drone' ? <><path d="M 47 38 L 113 67 M 47 67 L 113 38" stroke="#617588" strokeWidth="7" />{[47, 113].flatMap(x => [38, 67].map(y => <ellipse key={`${x}:${y}`} cx={x} cy={y} rx="18" ry="9" fill="var(--kg-panel-bg)" stroke={asset.color} strokeWidth="3" />))}<path d="M 68 44 L 91 44 L 97 57 L 80 66 L 64 57 Z" fill={asset.color} /><rect x="72" y="56" width="13" height="7" rx="2" fill="#293941" /></>
        : asset.kind === 'space' ? <><path d="M 28 63 L 80 35 L 135 63 L 80 91 Z" fill="#c4d0d9" /><path d="M 28 63 V 24 L 80 6 V 35 Z" fill="#91a6b7" /><path d="M 80 6 L 135 24 V 63 L 80 35 Z" fill="#aebdc8" /><path d="M 43 71 L 95 44 M 58 79 L 110 52 M 43 55 L 96 83 M 58 47 L 112 75" stroke="#7d929f" opacity=".5" /></>
          : <><path d="M 44 39 L 83 20 L 119 38 L 80 58 Z" fill="#d9c3a0" /><path d="M 44 39 V 69 L 80 87 V 58 Z" fill={asset.color} /><path d="M 80 58 L 119 38 V 69 L 80 87 Z" fill="#8f754f" /><path d="M 53 44 V 73 M 71 54 V 82 M 89 53 V 81 M 111 42 V 72" stroke="#59656c" strokeWidth="4" /></>}
  </svg>
}
export default function LearningAssetsPanel({ view: panelView }: { view: 'assets' | 'outliner' | 'inspector' }) {
  const inspection = useWarehouseInspection()
  const camera = useGraphStore(state => state.threeCameraSnapshotFns)
  const { runtime, view, update } = useLearningSpatialView()
  const [query, setQuery] = React.useState('')
  if (!runtime.document || runtime.document.lessonId !== 'drone') return null
  const lesson = learningLesson(runtime.document.lessonId)
  const assets = [...learningAssets(lesson, runtime.stale ? undefined : runtime.result?.scene, inspection.active ? inspection.sample : undefined), ...view.placed.map(o => ({ ...o, kind: 'obstacle' as const, detail: 'Layout preview only · session-scoped · does not alter programmed routes' }))]
  const selected = assets.find(asset => asset.id === view.selectedId) ?? assets[0]
  const filtered = assets.filter(asset => `${asset.name} ${asset.kind}`.toLowerCase().includes(query.trim().toLowerCase()))
  const scene = runtime.stale ? undefined : runtime.result?.scene
  return <section className="learning-spatial-ui space-y-3 p-3 text-sm" aria-label="Drone lesson assets">
    <header><strong className="block">Warehouse flight studio</strong><p className="text-xs opacity-70">{assets.length} assets · local procedural geometry</p></header>
    <p className="text-xs opacity-70">Select a pallet or rack to place a layout copy. Click clear floor space to confirm; Esc cancels. Layout edits last for this source session.</p>
    {view.placement && <button type="button" className="min-h-11 rounded border px-3" onClick={cancelLearningPlacement}>Cancel placement</button>}
    {panelView !== 'inspector' && <>
      <label className="grid gap-1 text-xs">Find a lesson asset<input type="search" value={query} maxLength={80}
        onChange={event => setQuery(event.currentTarget.value)} className="min-h-11 w-full rounded border bg-transparent px-3" /></label>
      <div className={panelView === 'assets' ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
        {filtered.map(asset => <button key={asset.id} type="button" onClick={() => { update({ selectedId: asset.id }); if (panelView === 'assets' && asset.id.startsWith('obstacle:')) armLearningPlacement(asset.id) }}
          aria-pressed={selected.id === asset.id} aria-label={`Inspect ${asset.name}`}
          className="min-h-11 min-w-0 rounded-lg border p-2 text-left transition-colors hover:bg-[var(--kg-surface-bg)]"
          style={{ borderColor: selected.id === asset.id ? '#438dce' : 'var(--kg-border)', boxShadow: selected.id === asset.id ? 'inset 0 0 0 1px #438dce' : undefined }}>
          {panelView === 'assets' && <AssetPreview asset={asset} />}
          <strong className="mt-2 block text-xs">{asset.name}</strong><span className="block text-xs opacity-70">{asset.size[0].toFixed(2)} × {asset.size[2].toFixed(2)} m</span>
        </button>)}
      </div>{!filtered.length && <p role="status">No lesson assets match this search.</p>}
    </>}
    <section className="space-y-2 rounded-lg border p-3" aria-label="Selected lesson asset">
      <div className="flex items-center justify-between gap-2"><strong>{selected.name}</strong><span className="rounded border px-2 py-1 text-xs uppercase">{selected.kind}</span></div>
      <p className="text-xs opacity-75">{selected.detail}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <dt>X / Z</dt><dd className="text-right font-mono">{selected.position[0].toFixed(2)} / {selected.position[2].toFixed(2)} m</dd>
        <dt>{selected.kind === 'drone' ? 'Altitude' : 'Base height'}</dt><dd className="text-right font-mono">{selected.position[1].toFixed(2)} m</dd>
        <dt>Width × depth</dt><dd className="text-right font-mono">{selected.size[0].toFixed(2)} × {selected.size[2].toFixed(2)} m</dd>
        <dt>{selected.kind === 'space' ? 'Flight ceiling' : selected.kind === 'drone' ? 'Display envelope' : 'Height'}</dt><dd className="text-right font-mono">{selected.size[1].toFixed(2)} m</dd>
      </dl>
      {selected.kind === 'truck' && <p className="text-xs">Shell L × W × H: 220 × 160 × 90 mm. Closed assembly: {CHARGE_TRUCK_DIMENSIONS.closedAssembly[0] * 1000} × {CHARGE_TRUCK_DIMENSIONS.closedAssembly[2] * 1000} × {CHARGE_TRUCK_DIMENSIONS.closedAssembly[1] * 1000} mm including tracks, hinges and antenna. Print tolerances and charging circuitry remain unverified.</p>}
      <div className="flex flex-wrap gap-2">
        {selected.id.startsWith('obstacle:') && <button type="button" className="min-h-11 rounded border px-3 text-xs" onClick={() => armLearningPlacement(selected.id)}>Place a layout copy</button>}
        {selected.id.startsWith('placed:') && <button type="button" className="min-h-11 rounded border px-3 text-xs" onClick={removeLearningAsset}>Remove layout object</button>}
        <button type="button" disabled={!camera} className="min-h-11 rounded border px-3 text-xs disabled:opacity-40" onClick={event => {
          const current = camera?.capturePose(); if (current) camera?.restorePose(learningAssetCameraPose(selected.position, selected.size, current, resolveLearningAssetViewport(event.currentTarget.ownerDocument)))
        }}>Frame selected asset</button>
        <button type="button" className="min-h-11 rounded border px-3 text-xs" onClick={inspection.enable}>Open inspection Timeline</button>
      </div>
      <p className="border-t pt-2 text-xs opacity-70">{inspection.active ? 'Facility rehearsal follows the native Timeline. Seek to inspect a route, launch or docking stage.' : 'Python controls drone-001 in its bounded cell. Open the Timeline for the full-facility rehearsal.'}</p>
    </section>
    <p className="rounded border p-3 text-xs">Concept allocation: {warehouseAllocation().corePercent}% logistics / {warehouseAllocation().ancillaryPercent}% ancillary. Assumed 2,400 m² indoor footprint; design review required.</p>
    <fieldset className="rounded-lg border p-3"><legend className="px-1 text-xs">View options</legend><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={view.dimensions} onChange={event => update({ dimensions: event.currentTarget.checked })} />Dimensions</label></fieldset>
    <section className="rounded-lg border p-3 text-xs" aria-label="Flight checks"><strong>Flight checks</strong><p className="mt-2">{inspection.active ? `${inspection.sample.coverage.rackVisited}/${inspection.sample.coverage.rackTotal} modeled rack stations · ${inspection.sample.coverage.aisleVisited}/${inspection.sample.coverage.aisleTotal} aisle samples` : !scene ? 'Run the program to evaluate the flight.' : `${scene.collisions} collisions · ${scene.landed ? 'landed' : 'airborne'} · ${scene.atGoal ? 'at goal' : 'goal not reached'}`}</p>
      <p className="mt-1 opacity-70">{runtime.stale ? 'Previous result is stale. Run again for current evidence.' : 'Simulation evidence only · no motors'}</p></section>
  </section>
}
