import React from 'react'
import type { SpaceDocument, SpaceObservation } from './semanticSpaceRuntime'
import { SEMANTIC_TWIN_TEMPLATES, type TwinTemplate } from './semanticTwinRuntime'
import { semanticTwinTemplateLabel } from './semanticTwinTemplates.mjs'
import { readSemanticSpace, runSemanticSpaceAction } from './semanticSpaceStore'
import { openSemanticObjects } from './semanticSpaceCanvas'
import { useGraphStore } from '@/hooks/useGraphStore'

const button = 'App-toolbar__btn min-h-11 w-full whitespace-normal'
export default function SemanticSpatialSceneComposer({ space, observation, disabled }: {
  space: SpaceDocument; observation: SpaceObservation; disabled: boolean
}) {
  const models = space.twin?.objects.filter(item => item.evidenceSha256 === observation.sha256 && item.template !== 'relief') || []
  const [choices, setChoices] = React.useState<Record<string, TwinTemplate>>({})
  const [busy, setBusy] = React.useState(false), [status, setStatus] = React.useState('')
  const alive = React.useRef(true)
  React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  React.useEffect(() => { setChoices({}); setStatus('') }, [space.id, observation.sha256])
  const apply = async () => {
    if (busy || disabled) return
    setBusy(true); setStatus('Building solid objects…')
    try {
      const doc = await readSemanticSpace()
      if (!doc || doc.id !== space.id || doc.revision !== space.revision) throw Error('Space changed during review. Review the current models and retry.')
      const next = await runSemanticSpaceAction({ operation: 'compose-twin-scene', requestId: `request:${crypto.randomUUID()}`,
        expectedRevision: doc.revision, evidenceSha256: observation.sha256,
        assignments: models.map(item => ({ entityId: item.entityId, template: choices[item.entityId] || item.template })) })
      // Opening can replace this panel when source frontmatter hydrates. Complete the
      // saved scene handoff even if that unmounts the initiating component.
      await openSemanticObjects(next, observation.id, undefined, { presentation: 'layout', context: false })
      if (alive.current) { setChoices({}); setStatus(`${models.length} solid objects saved. Drag to orbit, scroll to move closer, and click a model to edit it. The preceding space is retained in local backup.`) }
    } catch (error) {
      const message = String((error as Error).message || error)
      if (alive.current) setStatus(message)
      else useGraphStore.getState().pushUiToast({ id: 'semantic-spatial-scene', kind: 'error', message })
    }
    finally { if (alive.current) setBusy(false) }
  }
  return <details className="rounded border p-2" aria-label="Compose solid scene">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Compose solid scene</summary>
    <p>Choose a solid shape for each saved region. Rebuild with procedural colours and a ground layout from source positions. Depth is authored; this does not identify objects automatically.</p>
    <button type="button" className={button} disabled={disabled || busy} onClick={() => setChoices(current => ({ ...current,
      ...Object.fromEntries(models.filter(item => ['box', 'contour'].includes(item.template)).map(item => [item.entityId, 'building' as const])) }))}>
      Use buildings for box and contour regions</button>
    <div className="grid max-h-64 gap-2 overflow-y-auto">{models.map((model, index) => <label className="grid min-w-0 gap-1" key={model.entityId}>
      {index + 1}. {space.entities.find(entity => entity.id === model.entityId)?.label || model.template}
      <select aria-label={`Solid shape ${index + 1}`} className="min-h-11 w-full min-w-0 rounded border bg-transparent px-2"
        disabled={disabled || busy} value={choices[model.entityId] || model.template}
        onChange={event => { const value = event.currentTarget.value as TwinTemplate; setChoices(current => ({ ...current, [model.entityId]: value })) }}>
        {SEMANTIC_TWIN_TEMPLATES.filter(shape => shape !== 'relief' && (shape !== 'contour' || model.silhouette)).map(shape =>
          <option value={shape} key={shape}>{semanticTwinTemplateLabel(shape)}</option>)}
      </select>
    </label>)}</div>
    <button type="button" className={button} disabled={disabled || busy || !models.length} onClick={() => void apply()}>Build solid scene</button>
    {status && <output role="status">{status}</output>}
  </details>
}
