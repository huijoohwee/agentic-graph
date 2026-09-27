import React from 'react'
import './learningSpatialView.css'
import { learningLesson } from './learningLessons'
import { learningAssets, useLearningSpatialView, type LearningAsset } from './learningSpatialView'

function AssetPreview({ asset }: { asset: LearningAsset }) {
  return <svg viewBox="0 0 160 100" className="w-full rounded bg-[var(--kg-surface-bg)]" aria-hidden>
    <ellipse cx="80" cy="78" rx="46" ry="10" fill="currentColor" opacity=".07" />
    {asset.kind === 'pad' ? <><ellipse cx="80" cy="58" rx="40" ry="21" fill="#293941" /><ellipse cx="80" cy="58" rx="34" ry="17" fill="none" stroke={asset.color} strokeWidth="3" /><ellipse cx="80" cy="58" rx="16" ry="8" fill="none" stroke={asset.color} strokeWidth="3" /></>
      : asset.kind === 'drone' ? <><path d="M 47 38 L 113 67 M 47 67 L 113 38" stroke="#617588" strokeWidth="7" />{[47, 113].flatMap(x => [38, 67].map(y => <ellipse key={`${x}:${y}`} cx={x} cy={y} rx="18" ry="9" fill="var(--kg-panel-bg)" stroke={asset.color} strokeWidth="3" />))}<path d="M 68 44 L 91 44 L 97 57 L 80 66 L 64 57 Z" fill={asset.color} /><rect x="72" y="56" width="13" height="7" rx="2" fill="#293941" /></>
        : asset.kind === 'space' ? <><path d="M 28 63 L 80 35 L 135 63 L 80 91 Z" fill="#c4d0d9" /><path d="M 28 63 V 24 L 80 6 V 35 Z" fill="#91a6b7" /><path d="M 80 6 L 135 24 V 63 L 80 35 Z" fill="#aebdc8" /><path d="M 43 71 L 95 44 M 58 79 L 110 52 M 43 55 L 96 83 M 58 47 L 112 75" stroke="#7d929f" opacity=".5" /></>
          : <><path d="M 44 39 L 83 20 L 119 38 L 80 58 Z" fill="#d9c3a0" /><path d="M 44 39 V 69 L 80 87 V 58 Z" fill={asset.color} /><path d="M 80 58 L 119 38 V 69 L 80 87 Z" fill="#8f754f" /><path d="M 53 44 V 73 M 71 54 V 82 M 89 53 V 81 M 111 42 V 72" stroke="#59656c" strokeWidth="4" /></>}
  </svg>
}
export default function LearningAssetsPanel({ view: panelView }: { view: 'assets' | 'outliner' | 'inspector' }) {
  const { runtime, view, update } = useLearningSpatialView()
  const [query, setQuery] = React.useState('')
  if (!runtime.document || runtime.document.lessonId !== 'drone') return null
  const lesson = learningLesson(runtime.document.lessonId)
  const assets = learningAssets(lesson, runtime.stale ? undefined : runtime.result?.scene)
  const selected = assets.find(asset => asset.id === view.selectedId) ?? assets[0]
  const filtered = assets.filter(asset => `${asset.name} ${asset.kind}`.toLowerCase().includes(query.trim().toLowerCase()))
  const scene = runtime.stale ? undefined : runtime.result?.scene
  return <section className="learning-spatial-ui space-y-3 p-3 text-sm" aria-label="Drone lesson assets">
    <header><strong className="block">Flight studio</strong><p className="text-xs opacity-70">{assets.length} lesson assets · local procedural geometry</p></header>
    {panelView !== 'inspector' && <>
      <label className="grid gap-1 text-xs">Find a lesson asset<input type="search" value={query} maxLength={80}
        onChange={event => setQuery(event.currentTarget.value)} className="min-h-11 w-full rounded border bg-transparent px-3" /></label>
      <div className={panelView === 'assets' ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
        {filtered.map(asset => <button key={asset.id} type="button" onClick={() => update({ selectedId: asset.id })}
          aria-pressed={selected.id === asset.id} aria-label={`Inspect ${asset.name}`}
          className="min-h-11 min-w-0 rounded-lg border p-2 text-left transition-colors hover:bg-[var(--kg-surface-bg)]"
          style={{ borderColor: selected.id === asset.id ? '#438dce' : 'var(--kg-border)', boxShadow: selected.id === asset.id ? 'inset 0 0 0 1px #438dce' : undefined }}>
          {panelView === 'assets' && <AssetPreview asset={asset} />}
          <strong className="mt-2 block text-xs">{asset.name}</strong><span className="block text-xs opacity-70">{asset.size[0].toFixed(2)} × {asset.size[2].toFixed(2)} m</span>
        </button>)}
      </div>{!filtered.length && <p role="status">No lesson assets match this search.</p>}
    </>}
    <section className="space-y-2 rounded-lg border p-3" aria-label="Selected lesson asset">
      <div className="flex items-center justify-between gap-2"><strong>{selected.name}</strong><span className="rounded border px-2 py-1 text-[10px] uppercase">{selected.kind}</span></div>
      <p className="text-xs opacity-75">{selected.detail}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <dt>X / Z</dt><dd className="text-right font-mono">{selected.position[0].toFixed(2)} / {selected.position[2].toFixed(2)} m</dd>
        <dt>{selected.kind === 'drone' ? 'Altitude' : 'Base height'}</dt><dd className="text-right font-mono">{selected.position[1].toFixed(2)} m</dd>
        <dt>Width × depth</dt><dd className="text-right font-mono">{selected.size[0].toFixed(2)} × {selected.size[2].toFixed(2)} m</dd>
        <dt>{selected.kind === 'space' ? 'Flight ceiling' : selected.kind === 'drone' ? 'Display envelope' : 'Height'}</dt><dd className="text-right font-mono">{selected.size[1].toFixed(2)} m</dd>
      </dl><p className="border-t pt-2 text-xs opacity-70">Geometry belongs to this lesson. Edit Python to change the flight.</p>
    </section>
    <fieldset className="rounded-lg border p-3"><legend className="px-1 text-xs">View options</legend><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={view.dimensions} onChange={event => update({ dimensions: event.currentTarget.checked })} />Dimensions</label></fieldset>
    <section className="rounded-lg border p-3 text-xs" aria-label="Flight checks"><strong>Flight checks</strong><p className="mt-2">{!scene ? 'Run the program to evaluate the flight.' : `${scene.collisions} collisions · ${scene.landed ? 'landed' : 'airborne'} · ${scene.atGoal ? 'at goal' : 'goal not reached'}`}</p>
      <p className="mt-1 opacity-70">{runtime.stale ? 'Previous result is stale. Run again for current evidence.' : 'Simulation evidence only · no motors'}</p></section>
  </section>
}
