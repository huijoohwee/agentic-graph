import React from 'react'
import type { SemanticImageDraft } from './semanticImagePerceptionClient'
import { perceiveImportedImage } from './semanticImagePerceptionClient'
import { readSemanticSpace, readSemanticSpaceSourceMirrorStatus, runSemanticSpaceAction } from './semanticSpaceStore'
import { addSemanticEntityToCanvas } from './semanticSpaceCanvas'
import type { SpaceDocument } from './semanticSpaceRuntime'

const SpaceEditor = React.lazy(() => import('./SemanticSpacePanel').then(module => ({ default: module.SemanticSpacePanel })))
const button = 'App-toolbar__btn min-h-11 w-full whitespace-normal'
export default function SemanticImagePerceptionChoice({ sourceUrl }: { sourceUrl: string }) {
  const [draft, setDraft] = React.useState<SemanticImageDraft | null>(null)
  const [selected, setSelected] = React.useState<readonly number[]>([])
  const [labels, setLabels] = React.useState<readonly string[]>([])
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const controller = React.useRef<AbortController | null>(null)
  const mounted = React.useRef(true)
  const base = React.useRef<{ id: string | null; revision: number }>({ id: null, revision: 0 })
  const saved = React.useRef<SpaceDocument | null>(null)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  const analyze = async () => {
    if (controller.current) return
    const job = new AbortController(); controller.current = job
    setBusy(true); setStatus('Finding visible regions locally…'); setDraft(null); setEditing(false); saved.current = null
    try {
      const doc = await readSemanticSpace()
      base.current = { id: doc?.id || null, revision: doc?.revision || 0 }
      const next = await perceiveImportedImage(sourceUrl, job.signal)
      if (!mounted.current) return
      setDraft(next); setSelected(next.result.proposals.map((_, index) => index))
      setLabels(next.result.proposals.map(item => item.label))
      setStatus('Review the regions below. These are pixel groups, not recognized objects.')
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
          proposals: selected.map(index => ({ ...draft.result.proposals[index], label: labels[index] })) })
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
      const mirror = readSemanticSpaceSourceMirrorStatus()
      setStatus(mirror?.error ? `3D saved locally; Source Files projection failed: ${mirror.error}`
        : 'Editable 3D saved locally and linked to Canvas and Source Files. Open Semantic space to edit or export.')
    } catch (error) { if (mounted.current) setStatus(`${saved.current ? 'Saved locally. Canvas linking: ' : ''}${String((error as Error).message || error)}`) }
    finally { if (mounted.current) setBusy(false) }
  }
  return <section className="grid gap-2" aria-label="Local image to 3D">
    <button type="button" className={button} disabled={busy} onClick={() => void analyze()}>Analyze image locally</button>
    {busy && controller.current && <button type="button" className={button}
      onClick={() => controller.current?.abort()}>Cancel analysis</button>}
    {draft && <>
      <div className="relative">
        <img src={draft.observation.imageDataUrl} alt="Review proposed visible regions" className="block w-full" />
        {draft.result.proposals.map((item, index) => selected.includes(index) && <span key={index}
          className="pointer-events-none absolute border-2 border-cyan-400 text-white"
          style={{ left: `${item.region.x * 100}%`, top: `${item.region.y * 100}%`,
            width: `${item.region.width * 100}%`, height: `${item.region.height * 100}%` }}>
          <span className="bg-black/80 px-1">{index + 1}</span></span>)}
      </div>
      <div className="grid max-h-48 gap-1 overflow-auto">{draft.result.proposals.map((_, index) =>
        <label key={index} className="flex min-h-11 items-center gap-2">
          <input type="checkbox" aria-label={`Include region ${index + 1}`} checked={selected.includes(index)} disabled={busy || !!saved.current}
            onChange={event => setSelected(current => event.target.checked ? [...current, index].sort((a, b) => a - b) : current.filter(i => i !== index))} />
          <input className="min-h-11 min-w-0 flex-1 rounded border bg-transparent px-2" aria-label={`Region ${index + 1} label`}
            value={labels[index]} maxLength={80} disabled={busy || !!saved.current}
            onChange={event => setLabels(current => current.map((label, i) => i === index ? event.target.value : label))} />
        </label>)}</div>
      <p className="m-0">Builds coloured boxes from these regions. Image axes set an editable floor layout;
        depth is fixed at 0.4 arbitrary units. Labels, shape, scale and placement need your review.</p>
      <button type="button" className={button} disabled={busy || !selected.length || selected.some(i => !labels[i]?.trim())}
        onClick={() => void build()}>{saved.current ? 'Show built regions on Canvas' : 'Build selected regions in 3D'}</button>
    </>}
    {saved.current && <button type="button" className={button} onClick={() => setEditing(value => !value)}>
      {editing ? 'Close space editor' : 'Edit or export built space'}</button>}
    {editing && <React.Suspense fallback={<span>Opening space editor…</span>}><SpaceEditor /></React.Suspense>}
    {status && <output role="status">{status}</output>}
    <span>Local CPU · no model download or generation service</span>
  </section>
}
