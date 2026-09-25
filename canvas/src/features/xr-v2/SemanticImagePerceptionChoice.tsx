import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readSemanticObjectViewMarkdown } from './semanticObjectView'
import type { SemanticImageDraft } from './semanticImagePerceptionClient'
import { perceiveImportedImage, prepareImageEvidenceRefresh } from './semanticImagePerceptionClient'
import { exportSemanticSpacePackage, importSemanticSpace, subscribeSemanticSpace, readSemanticSpace, readSemanticSpaceSourceMirrorStatus, runSemanticSpaceAction } from './semanticSpaceStore'
import { selectSemanticObject, addSemanticEntityToCanvas, overlaySemanticObservation, openSemanticObjects } from './semanticSpaceCanvas'
import { SEMANTIC_TWIN_TEMPLATES, type TwinTemplate } from './semanticTwinRuntime'
import SemanticImageRegionFocus from './SemanticImageRegionFocus'
import type { SpaceRegion, SpaceDocument, SpaceObservation } from './semanticSpaceRuntime'
import { copyImageModelsToSpace, replaceableImageRegionIds } from './semanticImageTwinCompiler'

const SpaceEditor = React.lazy(() => import('./SemanticSpacePanel').then(module => ({ default: module.SemanticSpacePanel })))
const button = 'App-toolbar__btn min-h-11 w-full whitespace-normal'
export default function SemanticImagePerceptionChoice({ sourceUrl }: { sourceUrl: string }) {
  const [space, setSpace] = React.useState<SpaceDocument | null>(null)
  React.useEffect(() => {
    let alive = true, generation = 0
    const update = () => { const request = ++generation; void readSemanticSpace().then(doc => {
      if (alive && request === generation) setSpace(doc)
    }, error => { if (alive) setStatus(String(error.message || error)) }) }
    update(); const unsubscribe = subscribeSemanticSpace(update)
    return () => { alive = false; unsubscribe() }
  }, [])
  const evidence = space?.observations.find(item => item.imageDataUrl === sourceUrl)
  const models = space?.twin?.objects.filter(item => item.evidenceSha256 === evidence?.sha256) || []
  const chooseModel = async (entityId: string) => {
    if (!space || !evidence || busy) return
    try {
      const doc = await readSemanticSpace()
      if (doc?.id !== space.id) throw Error('Space changed. Reopen this image.')
      const view = readSemanticObjectViewMarkdown(useGraphStore.getState().markdownDocumentText)
      if (view?.spaceId !== doc.id || view.evidenceSha256 !== evidence.sha256) await openSemanticObjects(doc, evidence.id)
      await selectSemanticObject(doc.id, entityId)
    } catch (error) { if (mounted.current) setStatus(String((error as Error).message || error)) }
  }
  const copyImage = async () => {
    if (!space || !evidence || busy) return
    setBusy(true)
    try {
      const doc = await readSemanticSpace()
      if (doc?.id !== space.id || doc.revision !== space.revision) throw Error('Space changed. Reopen this image before copying.')
      const next = copyImageModelsToSpace(doc, evidence.sha256, `space:${crypto.randomUUID()}`)
      const pack = await exportSemanticSpacePackage(next)
      const rechecked = await readSemanticSpace()
      if (rechecked?.id !== doc.id || rechecked.revision !== doc.revision) throw Error('Space changed while copying. Retry.')
      // Existing package import atomically retains the previous active document as a backup.
      const copied = await importSemanticSpace(pack)
      setDraft(null); saved.current = null
      await openSemanticObjects(copied, evidence.id)
      setStatus('Image copied into its own space. The previous complete space remains in Source Files and local backup.')
    } catch (error) { if (mounted.current) setStatus(String((error as Error).message || error)) }
    finally { if (mounted.current) setBusy(false) }
  }
  const refreshFile = React.useRef<HTMLInputElement>(null)
  const [refresh, setRefresh] = React.useState<{ previous: SpaceObservation; observation: SpaceObservation; spaceId: string; revision: number } | null>(null)
  const [objectMode, setObjectMode] = React.useState(true)
  const [draft, setDraft] = React.useState<SemanticImageDraft | null>(null)
  const [selected, setSelected] = React.useState<readonly number[]>([])
  const [labels, setLabels] = React.useState<readonly string[]>([])
  const [shapes, setShapes] = React.useState<readonly TwinTemplate[]>([])
  const [focus, setFocus] = React.useState<SpaceRegion>({ x: 0, y: 0, width: 1, height: 1 })
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [marking, setMarking] = React.useState(false)
  const [replacementIds, setReplacementIds] = React.useState<readonly string[]>([])
  const [replaceGroups, setReplaceGroups] = React.useState(true)
  const [layout, setLayout] = React.useState<'image' | 'contiguous-row'>('image')
  const controller = React.useRef<AbortController | null>(null)
  const mounted = React.useRef(true)
  const base = React.useRef<{ id: string | null; revision: number }>({ id: null, revision: 0 })
  const saved = React.useRef<SpaceDocument | null>(null)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  const prepareRefresh = async (file?: File) => {
    if (!file || controller.current) return
    const job = new AbortController(); controller.current = job
    const url = URL.createObjectURL(file)
    setBusy(true); setRefresh(null); setStatus('Checking original image detail…')
    try {
      if (file.size > 24 * 1024 * 1024) throw Error('Choose an original below 24 MiB.')
      const doc = await readSemanticSpace()
      const previous = doc?.observations.find(item => item.imageDataUrl === sourceUrl)
      if (!doc || !previous) throw Error('Open the saved image models before refreshing their source detail.')
      const observation = await prepareImageEvidenceRefresh(url, previous, job.signal)
      if (!mounted.current) return
      setRefresh({ previous, observation, spaceId: doc.id, revision: doc.revision })
      setStatus('Review the replacement below. Your object boundaries, identities and geometry will stay the same.')
    } catch (error) { if (mounted.current) setStatus(String((error as Error).message || error)) }
    finally { URL.revokeObjectURL(url); if (controller.current === job) controller.current = null; if (mounted.current) setBusy(false) }
  }
  const applyRefresh = async () => {
    if (!refresh || busy) return
    setBusy(true)
    try {
      const doc = await readSemanticSpace()
      if (!doc || doc.id !== refresh.spaceId || doc.revision !== refresh.revision) throw Error('Space changed during review. Choose the original again.')
      const next = await runSemanticSpaceAction({ operation: 'refresh-image-evidence', requestId: `request:${crypto.randomUUID()}`,
        expectedRevision: refresh.revision, observationId: refresh.previous.id, observation: refresh.observation })
      for (const entity of next.entities.filter(item => item.observationId === refresh.observation.id)) {
        await addSemanticEntityToCanvas(next, entity, { frame: false })
      }
      await openSemanticObjects(next, refresh.observation.id)
      if (mounted.current) { setRefresh(null); setStatus('Original detail saved on the same 3D objects. Previous image evidence is retained.') }
    } catch (error) { if (mounted.current) setStatus(String((error as Error).message || error)) }
    finally { if (mounted.current) setBusy(false) }
  }
  const analyze = async (region?: SpaceRegion, useWholeRegion = false, relief = false, detail = false) => {
    if (controller.current) return
    const job = new AbortController(); controller.current = job
    setBusy(true); setMarking(false); setReplacementIds([])
    setStatus('Finding visible regions locally…'); setDraft(null); setEditing(false); saved.current = null
    try {
      const doc = await readSemanticSpace()
      base.current = { id: doc?.id || null, revision: doc?.revision || 0 }
      const next = await perceiveImportedImage(sourceUrl, job.signal, { region, useWholeRegion, relief, detail })
      if (!mounted.current) return
      setDraft(next); setSelected(next.result.proposals.map((_, index) => index))
      setLabels(next.result.proposals.map(item => item.label))
      setObjectMode(!relief)
      setShapes(next.result.proposals.map(item => relief ? 'relief' : 'box'))
      setStatus(relief ? 'Full image prepared as one continuous relief. Review and build below; this does not identify individual objects.' : useWholeRegion ? 'Chosen area ready. Choose its 3D shape and label below.' : 'Review the regions below. These are pixel groups, not recognized objects.')
    } catch (error) { if (mounted.current) setStatus(String((error as Error).message || error)) }
    finally { if (controller.current === job) controller.current = null; if (mounted.current) setBusy(false) }
  }
  const markObject = async (start = false) => {
    if (controller.current || (marking && saved.current && !start)) return
    const job = new AbortController(); controller.current = job
    setBusy(true); setStatus(start ? 'Opening individual object marking…' : 'Adding the marked object…')
    try {
      const doc = await readSemanticSpace()
      const perceived = await perceiveImportedImage(sourceUrl, job.signal, { region: start ? undefined : focus, useWholeRegion: true })
      // A reopened evidence image must retain its exact hash, not the hash of a second JPEG encoding.
      const evidence = doc?.observations.find(item => item.imageDataUrl === sourceUrl)
      const next = evidence ? { ...perceived, observation: { ...evidence,
        id: perceived.observation.id, capturedAtMs: perceived.observation.capturedAtMs } } : perceived
      if (!mounted.current) return
      if (start) {
        base.current = { id: doc?.id || null, revision: doc?.revision || 0 }; saved.current = null
        setDraft({ ...next, result: { ...next.result, proposals: [] } })
        setSelected([]); setLabels([]); setShapes([]); setMarking(true); setObjectMode(true); setEditing(false)
        setReplacementIds(doc ? replaceableImageRegionIds(doc, next.observation.sha256) : [])
        setReplaceGroups(true)
        setStatus('Outline each building separately, then add it. Mark up to 12 objects per batch; every mark becomes an independent block.')
      } else {
        if (!draft || draft.observation.sha256 !== next.observation.sha256) throw Error('Source image changed. Start marking again.')
        if (draft.result.proposals.length >= 12) throw Error('Build this batch before marking more objects. The scene keeps its existing object budget.')
        const region = next.result.proposals[0].region
        if (draft.result.proposals.some(item => JSON.stringify(item.region) === JSON.stringify(region))) throw Error('This region is already marked. Outline the next object.')
        const index = draft.result.proposals.length, label = `Object ${index + 1}`
        setDraft({ ...draft, result: { ...draft.result, proposals: [...draft.result.proposals, { ...next.result.proposals[0], label }] } })
        setSelected(current => [...current, index]); setLabels(current => [...current, label]); setShapes(current => [...current, 'box'])
        setStatus(`${index + 1} individual object(s) marked. Outline the next building or build the selected blocks.`)
      }
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
          layout: objectMode ? layout : 'image',
          ...(marking && replaceGroups ? { replaceEntityIds: replacementIds } : {}),
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
    {!!models.length && space && <section className="grid gap-1 rounded border p-2" aria-label="Saved image objects">
      <strong>{models.length} separate 3D objects</strong>
      <span>In photo view: cyan outlines show all models; yellow marks your selection.</span>
      <div className="grid max-h-36 gap-1 overflow-auto">{models.map((model, index) => {
        const entity = space.entities.find(item => item.id === model.entityId)
        return <button type="button" key={model.entityId} className={button} disabled={busy}
          aria-pressed={space.selectedEntityId === model.entityId} onClick={() => void chooseModel(model.entityId)}>
          {index + 1}. {entity?.label || model.template}</button>
      })}</div>
      {(space.twin?.objects.length || 0) > models.length && <details>
        <summary className="min-h-11 cursor-pointer py-2">More room for this image</summary>
        <p>This space also contains models from other images. Copy this image into its own space to use a separate object budget. Keep the previous space in Source Files and local backup.</p>
        <button type="button" className={button} disabled={busy} onClick={() => void copyImage()}>Copy image models to own space</button>
      </details>}
    </section>}
    <details><summary className="min-h-11 cursor-pointer py-2">Improve source detail</summary>
      <p className="m-0">Use the same uncropped original to sharpen saved object faces. Shape, depth and layout remain editable approximations.</p>
      <button type="button" className={button} disabled={busy} onClick={() => refreshFile.current?.click()}>Choose higher-resolution original</button>
      <input ref={refreshFile} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => {
        void prepareRefresh(event.currentTarget.files?.[0]); event.currentTarget.value = ''
      }} />
      {refresh && <section className="grid gap-2" aria-label="Review source detail refresh">
        <span>{refresh.previous.width} × {refresh.previous.height} → {refresh.observation.width} × {refresh.observation.height} saved pixels</span>
        <img src={refresh.observation.imageDataUrl} alt="Higher-detail original for review" className="max-h-40 w-full object-contain" />
        <button type="button" className={button} disabled={busy} onClick={() => void applyRefresh()}>Use higher-detail source</button>
        <button type="button" className={button} disabled={busy} onClick={() => setRefresh(null)}>Keep current source</button>
      </section>}
    </details>
    <button type="button" className={button} disabled={busy} onClick={() => void analyze(undefined, false, false, true)}>Create 3D objects</button>
    <button type="button" className={button} disabled={busy} onClick={() => void markObject(true)}>Mark individual buildings or objects</button>
    {marking && <section className="grid gap-2 rounded border p-2" aria-label="Individual object marking">
      <p className="m-0">One outline becomes one selectable 3D block. Include only that building, not the whole skyline. Repeat for each object.</p>
      <SemanticImageRegionFocus imageUrl={sourceUrl} value={focus} disabled={busy || !!saved.current} onChange={setFocus}
        regions={draft?.result.proposals.filter((_, index) => selected.includes(index)).map(item => item.region)} />
      <button type="button" className={button} disabled={busy || !!saved.current || (draft?.result.proposals.length || 0) >= 12
        || focus.width * focus.height > 0.5} onClick={() => void markObject()}>Add marked object</button>
      {focus.width * focus.height > 0.5 && <span>Outline a smaller individual object before adding it.</span>}
      {!!replacementIds.length && <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={replaceGroups} disabled={busy || !!saved.current} onChange={event => setReplaceGroups(event.currentTarget.checked)} />
        Replace {replacementIds.length} previous automatic group model(s) for this image. Keep their source evidence.
      </label>}
    </section>}
    <details><summary className="min-h-11 cursor-pointer py-2">Image surface tools</summary><button type="button" className={button} disabled={busy} onClick={() => void analyze(undefined, false, true)}>Generate whole-image relief</button></details>
    <p className="m-0">Create separate objects, choose a procedural shape for each region, then click the models to edit them. Shape and depth are authored; pixel grouping does not recognize every object.</p>
    {!marking && <details><summary className="min-h-11 cursor-pointer py-2">Refine image regions</summary>
      <SemanticImageRegionFocus imageUrl={sourceUrl} value={focus} disabled={busy} onChange={next => {
        setFocus(next); setDraft(null); saved.current = null; setStatus('Focus changed. Analyze it or use it as one region.')
      }} />
      <button type="button" className={button} disabled={busy} onClick={() => void analyze(focus, false, false, true)}>Find finer regions in focus</button>
      <button type="button" className={button} disabled={busy} onClick={() => void analyze(focus, true)}>Use focus as one region</button>
    </details>}
    {busy && controller.current && <button type="button" className={button}
      onClick={() => controller.current?.abort()}>Cancel analysis</button>}
    {draft && <>
      <p className="m-0">{draft.result.proposals.length} {marking ? 'individually marked object(s). Each selected mark will be a separate block.' : 'proposed region(s). Contrast refinement proposes separate regions. Review boundaries; they are not recognized objects.'}</p>
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
        </label>{marking && <button type="button" className={button} disabled={busy || !!saved.current} onClick={() => {
          setDraft({ ...draft, result: { ...draft.result, proposals: draft.result.proposals.filter((_, i) => i !== index) } })
          setLabels(current => current.filter((_, i) => i !== index)); setShapes(current => current.filter((_, i) => i !== index))
          setSelected(current => current.filter(i => i !== index).map(i => i > index ? i - 1 : i))
        }}>Remove mark {index + 1}</button>}<label className="grid gap-1">3D shape
          <select className="min-h-11 w-full min-w-0 rounded border bg-transparent px-2" aria-label={`Region ${index + 1} shape`}
            value={shapes[index]} disabled={busy || !!saved.current}
            onChange={event => { const value = event.currentTarget.value as TwinTemplate; setShapes(current => current.map((shape, i) => i === index ? value : shape)) }}>
            {SEMANTIC_TWIN_TEMPLATES.filter(shape => (!objectMode || !['contour', 'relief'].includes(shape)) && (shape !== 'contour' || draft.result.proposals[index].silhouette) && (shape !== 'relief' || draft.result.proposals[index].relief))
              .map(shape => <option key={shape} value={shape}>{shape === 'relief' ? 'Whole-image surface relief' : shape === 'contour' ? 'Visible outline → 3D volume' : shape === 'box' ? 'Box object' : shape}</option>)}
          </select></label></div>)}</div>
      <p className="m-0">Choose a procedural object shape such as building, tree, water, cloud or furniture. Each selected region becomes its own selectable model.
        These are reviewed approximations: object identity, hidden surfaces and real depth are not recovered. Models use authored template proportions. Edit dimensions and placement in Timeline.</p>
      {objectMode && <label className="grid gap-1">Object layout
        <select className="min-h-11 w-full rounded border bg-transparent px-2" value={layout} disabled={busy || !!saved.current}
          onChange={event => setLayout(event.currentTarget.value as typeof layout)}>
          <option value="image">Image positions</option>
          <option value="contiguous-row">Contiguous row · separate blocks</option>
        </select>
        {layout === 'contiguous-row' && <span>Place selected objects edge-to-edge in review order, with aligned front faces. This is an authored arrangement.</span>}
      </label>}
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
