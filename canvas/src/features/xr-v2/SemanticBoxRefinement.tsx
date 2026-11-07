import React from 'react'
import { applySpaceAction, type SpaceDocument, type SpaceObservation } from './semanticSpaceRuntime'
import { perceiveImportedImage } from './semanticImagePerceptionClient'
import { combineRegionSilhouettes } from './semanticTwinSilhouette'
import { readSemanticSpace, runSemanticSpaceAction } from './semanticSpaceStore'
import { buildTwinScene, disposeTwinScene } from './semanticTwinScene'
import { addSemanticEntityToCanvas, openSemanticObjects } from './semanticSpaceCanvas'

/** Upgrade saved geometry through the existing revision-checked build action, preserving identity. */
export default function SemanticBoxRefinement({ space, observation, disabled }: {
  space: SpaceDocument; observation: SpaceObservation; disabled: boolean
}) {
  const [busy, setBusy] = React.useState(false), [status, setStatus] = React.useState('')
  const job = React.useRef<AbortController | null>(null), mounted = React.useRef(true)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; job.current?.abort() } }, [])
  const boxes = space.twin?.objects.filter(item => item.template === 'box' && item.evidenceSha256 === observation.sha256) || []
  const refine = async () => {
    if (job.current) return
    const controller = new AbortController(); job.current = controller
    const timer = setTimeout(() => controller.abort(), 30_000)
    setBusy(true); setStatus('Refining saved boxes from visible pixel contours…')
    let count = 0, skipped = 0, reason = ''
    try {
      let doc = await readSemanticSpace()
      if (!doc || doc.id !== space.id || doc.revision !== space.revision) throw Error('Space changed. Retry from the current scene.')
      for (const binding of boxes.slice(0, 12)) {
        controller.signal.throwIfAborted()
        const entity = doc.entities.find(item => item.id === binding.entityId)!
        let candidate, action
        try {
          const draft = await perceiveImportedImage(observation.imageDataUrl, controller.signal, { region: entity.region })
          const silhouette = combineRegionSilhouettes(draft.result.proposals, entity.region, draft.result.width, draft.result.height)
          action = { operation: 'build' as const, requestId: `request:${crypto.randomUUID()}`, expectedRevision: doc.revision,
            entityId: entity.id, template: 'contour' as const, size: binding.size, position: binding.position, silhouette }
          candidate = applySpaceAction(doc, action)
          const built = buildTwinScene(candidate.twin!.objects)
          const error = built.error; disposeTwinScene(built)
          if (error) throw Error(error)
        } catch (error) {
          controller.signal.throwIfAborted(); skipped++; reason = String((error as Error).message); continue
        }
        controller.signal.throwIfAborted()
        // The store rejects any concurrent edit. Completed refinements remain saved on cancellation.
        doc = await runSemanticSpaceAction(action)
        count++
        await addSemanticEntityToCanvas(doc, entity, { frame: false })
      }
      if (count) await openSemanticObjects(doc, observation.id, controller.signal, { presentation: 'layout', context: false })
      if (mounted.current) setStatus(`${count} box(es) refined into contour volumes. ${skipped} kept unchanged.${reason ? ` ${reason}` : ''} Depth remains authored; pixel contours do not identify objects.`)
    } catch (error) { if (mounted.current) setStatus(`${count} refinement(s) saved. ${String((error as Error).message)}`) }
    finally { clearTimeout(timer); job.current = null; if (mounted.current) setBusy(false) }
  }
  return <section className="grid gap-1" aria-label="Saved box geometry refinement">
    {!!boxes.length && <button type="button" className="App-toolbar__btn min-h-11 w-full whitespace-normal"
      disabled={disabled || busy} onClick={() => void refine()}>Refine saved boxes into shapes ({Math.min(12, boxes.length)})</button>}
    {busy && <button type="button" onClick={() => job.current?.abort()}>Cancel refinement</button>}
    {!!status && <p role="status" className="m-0 text-xs">{status}</p>}
  </section>
}
