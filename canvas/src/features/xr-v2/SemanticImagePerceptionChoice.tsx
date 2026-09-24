import React from 'react'
import type { SemanticImageDraft } from './semanticImagePerceptionClient'
import { perceiveImportedImage } from './semanticImagePerceptionClient'
import { readSemanticSpace, readSemanticSpaceSourceMirrorStatus, runSemanticSpaceAction } from './semanticSpaceStore'
import { addSemanticEntityToCanvas, overlaySemanticObservation, openSemanticObjects } from './semanticSpaceCanvas'
import { SEMANTIC_TWIN_TEMPLATES, type TwinTemplate } from './semanticTwinRuntime'
import SemanticImageRegionFocus from './SemanticImageRegionFocus'
import type { SpaceRegion, SpaceDocument } from './semanticSpaceRuntime'

const SpaceEditor = React.lazy(() => import('./SemanticSpacePanel').then(module => ({ default: module.SemanticSpacePanel })))
const button = 'App-toolbar__btn min-h-11 w-full whitespace-normal'
export default function SemanticImagePerceptionChoice({ sourceUrl }: { sourceUrl: string }) {
  const [objectMode, setObjectMode] = React.useState(true)
  const [draft, setDraft] = React.useState<SemanticImageDraft | null>(null)
  const [selected, setSelected] = React.useState<readonly number[]>([])
  const [labels, setLabels] = React.useState<readonly string[]>([])
  const [shapes, setShapes] = React.useState<readonly TwinTemplate[]>([])
  const [focus, setFocus] = React.useState<SpaceRegion>({ x: 0, y: 0, width: 1, height: 1 })
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const controller = React.useRef<AbortController | null>(null)
  const mounted = React.useRef(true)
  const base = React.useRef<{ id: string | null; revision: number }>({ id: null, revision: 0 })
  const saved = React.useRef<SpaceDocument | null>(null)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  const analyze = async (region?: SpaceRegion, useWholeRegion = false, relief = false) => {
    if (controller.current) return
    const job = new AbortController(); controller.current = job
    setBusy(true); setStatus('Finding visible regions locally…'); setDraft(null); setEditing(false); saved.current = null
    try {
      const doc = await readSemanticSpace()
      base.current = { id: doc?.id || null, revision: doc?.revision || 0 }
      const next = await perceiveImportedImage(sourceUrl, job.signal, { region, useWholeRegion, relief })
      if (!mounted.current) return
      setDraft(next); setSelected(next.result.proposals.map((_, index) => index))
      setLabels(next.result.proposals.map(item => item.label))
      setObjectMode(!relief)
      setShapes(next.result.proposals.map(item => relief ? 'relief' : 'box'))
      setStatus(relief ? 'Full image prepared as one continuous relief. Review and build below; this does not identify individual objects.' : useWholeRegion ? 'Chosen area ready. Choose its 3D shape and label below.' : 'Review the regions below. These are pixel groups, not recognized objects.')
    } catch (error) { if (mounted.current) setStatus(String((error as Error).message || error)) }
    finally { if (controller.current === job) controller.current = null; if (mounted.current) setBusy(false) }
  }
  const build = async () => {
    if (!draft || busy) return
    setBusy(true)
    try {
      if (!saved.current) {
        const current = await readSemanticSpace()
        if ((current?.id || null) !== base.current.id || (current?.revision || 0) !== base.current.revision) {
          throw Error('Space changed during review. Analyze again before building.')
        }
        if (!mounted.current) return
        saved.current = await runSemanticSpaceAction({ operation: 'confirm-image-regions',
          requestId: `request:${crypto.randomUUID()}`, expectedRevision: base.current.revision,
          observation: draft.observation,
          proposals: selected.map(index => ({ ...draft.result.proposals[index], label: labels[index], template: shapes[index] })) })
      }
      const doc = await readSemanticSpace()
      if (!doc || doc.id !== saved.current.id || !doc.observations.some(item => item.id === draft.observation.id)) {
        throw Error('Saved space was replaced. Analyze the current image again.')
      }
      saved.current = doc
      const [{ closeImmersiveMedia }, game, flight] = await Promise.all([
        import('@/features/immersive-media/immersiveMediaRuntime'),
        import('@/features/game-fps/gameModeRuntime'), import('@/features/game-flight-sim/flightSimRuntime'),
      ])
      if (!mounted.current) return
      closeImmersiveMedia()
      if (game.readGameModeSnapshot().active) game.exitGameModeSurface({ restorePreviousSurface: false })
      if (flight.readFlightSimSnapshot().active) flight.exitFlightSimSurface({ restorePreviousSurface: false })
      for (const entity of doc.entities.filter(item => item.observationId === draft.observation.id)) {
        await addSemanticEntityToCanvas(doc, entity)
      }
      if (objectMode) await openSemanticObjects(doc, draft.observation.id)
      else await overlaySemanticObservation(doc, draft.observation.id)
      const mirror = readSemanticSpaceSourceMirrorStatus()
      setStatus(mirror?.error ? `3D saved locally; Source Files projection failed: ${mirror.error}`
        : objectMode ? 'Separate object models saved. Click each model to select it and edit its transform in Timeline.' : 'Image relief saved as a surface. It does not identify individual objects.')
    } catch (error) { if (mounted.current) setStatus(`${saved.current ? 'Saved locally. Canvas linking: ' : ''}${String((error as Error).message || error)}`) }
    finally { if (mounted.current) setBusy(false) }
  }
  return <section className="grid gap-2" aria-label="Local image to 3D">
    <button type="button" className={button} disabled={busy} onClick={() => void analyze()}>Create 3D objects</button>
    <details><summary className="min-h-11 cursor-pointer py-2">Image surface tools</summary><button type="button" className={button} disabled={busy} onClick={() => void analyze(undefined, false, true)}>Generate whole-image relief</button></details>
    <p className="m-0">Create separate objects, choose a procedural shape for each region, then click the models to edit them. Shape and depth are authored; pixel grouping does not recognize every object.</p>
    <details><summary className="min-h-11 cursor-pointer py-2">Refine image regions</summary>
      <SemanticImageRegionFocus imageUrl={sourceUrl} value={focus} disabled={busy} onChange={next => {
        setFocus(next); setDraft(null); saved.current = null; setStatus('Focus changed. Analyze it or use it as one region.')
      }} />
      <button type="button" className={button} disabled={busy} onClick={() => void analyze(focus)}>Analyze focus</button>
      <button type="button" className={button} disabled={busy} onClick={() => void analyze(focus, true)}>Use focus as one region</button>
    </details>
    {busy && controller.current && <button type="button" className={button}
      onClick={() => controller.current?.abort()}>Cancel analysis</button>}
    {draft && <>
      <p className="m-0">{draft.result.proposals.length} proposed region(s). {draft.result.proposals.some(item => item.relief) ? 'Relief includes every source pixel; brighter pixels raise its surface. Adjust depth in the editor.' : 'Pixel grouping does not guarantee every object is separated. Use focus to add missing objects.'}</p>
      <div className="relative">
        <img src={draft.observation.imageDataUrl} alt="Review proposed visible regions" className="block w-full" />
        {draft.result.proposals.map((item, index) => selected.includes(index) && <span key={index}
          className="pointer-events-none absolute border-2 border-cyan-400 text-white"
          style={{ left: `${item.region.x * 100}%`, top: `${item.region.y * 100}%`,
            width: `${item.region.width * 100}%`, height: `${item.region.height * 100}%` }}>
          <span className="bg-black/80 px-1">{index + 1}</span></span>)}
      </div>
      <div className="grid max-h-48 gap-1 overflow-auto">{draft.result.proposals.map((_, index) =>
        <div key={index} className="grid gap-1 rounded border p-2"><label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" aria-label={`Include region ${index + 1}`} checked={selected.includes(index)} disabled={busy || !!saved.current}
            onChange={event => { const checked = event.currentTarget.checked; setSelected(current => checked ? [...current, index].sort((a, b) => a - b) : current.filter(i => i !== index)) }} />
          <input className="min-h-11 min-w-0 flex-1 rounded border bg-transparent px-2" aria-label={`Region ${index + 1} label`}
            value={labels[index]} maxLength={80} disabled={busy || !!saved.current}
            onChange={event => { const value = event.currentTarget.value; setLabels(current => current.map((label, i) => i === index ? value : label)) }} />
        </label><label className="grid gap-1">3D shape
          <select className="min-h-11 w-full min-w-0 rounded border bg-transparent px-2" aria-label={`Region ${index + 1} shape`}
            value={shapes[index]} disabled={busy || !!saved.current}
            onChange={event => { const value = event.currentTarget.value as TwinTemplate; setShapes(current => current.map((shape, i) => i === index ? value : shape)) }}>
            {SEMANTIC_TWIN_TEMPLATES.filter(shape => (!objectMode || !['contour', 'relief'].includes(shape)) && (shape !== 'contour' || draft.result.proposals[index].silhouette) && (shape !== 'relief' || draft.result.proposals[index].relief))
              .map(shape => <option key={shape} value={shape}>{shape === 'relief' ? 'Whole-image surface relief' : shape === 'contour' ? 'Visible outline → 3D volume' : shape === 'box' ? 'Box object' : shape}</option>)}
          </select></label></div>)}</div>
      <p className="m-0">Choose a procedural object shape such as building, tree, water, cloud or furniture. Each selected region becomes its own selectable model.
        These are reviewed approximations: object identity, hidden surfaces and real depth are not recovered. Models use authored template proportions. Edit dimensions and placement in Timeline.</p>
      <button type="button" className={button} disabled={busy || !selected.length || selected.some(i => !labels[i]?.trim())}
        onClick={() => void build()}>{saved.current ? 'Show built regions on Canvas' : 'Build selected regions in 3D'}</button>
    </>}
    <button type="button" className={button} onClick={() => setEditing(value => !value)}>
      {editing ? 'Close space editor' : 'Edit or export space'}</button>
    {editing && <React.Suspense fallback={<span>Opening space editor…</span>}><SpaceEditor /></React.Suspense>}
    {status && <output role="status">{status}</output>}
    <span>Local CPU · no model download or generation service</span>
  </section>
}
