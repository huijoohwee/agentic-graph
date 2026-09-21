import React from 'react'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { captureWorkspaceSourceTextRevision, isWorkspaceSourceTextRevisionCurrent } from '@/features/workspace-fs/workspaceSourceTextTransaction'
import { ProceduralAssetSession } from './proceduralAssetSession'
import { parseProceduralAssetRecipe, type AssetControlValue } from './proceduralAssetContract'
import { prepareProceduralAssetOutput } from './proceduralAssetOutput'

export function ProceduralAssetControls(props: {
  nodeId: string; properties: Record<string, unknown>; inputClassName?: string
  onPatchProperties: (patch: Record<string, unknown>) => void
  resolveWorkspaceFs?: () => Promise<WorkspaceFs>
}) {
  const document = String(unwrapGraphCellValue(props.properties.proceduralAssetDocument) || '')
  const parentPath = String(unwrapGraphCellValue(props.properties.proceduralAssetWorkspaceParent) || '')
  const sourcePath = String(unwrapGraphCellValue(props.properties.proceduralAssetSourcePath) || '')
  const [session, setSession] = React.useState<ProceduralAssetSession | null>(null)
  const [values, setValues] = React.useState<Record<string, AssetControlValue>>({})
  const [draft, setDraft] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const generation = React.useRef(0)
  const pending = React.useRef<AbortController | null>(null)
  const latest = React.useRef({ document, nodeId: props.nodeId, onPatch: props.onPatchProperties })
  latest.current = { document, nodeId: props.nodeId, onPatch: props.onPatchProperties }

  React.useEffect(() => {
    generation.current += 1
    pending.current?.abort()
    setBusy(false)
    let next: ProceduralAssetSession | null = null
    try {
      next = ProceduralAssetSession.restore(document)
      const snapshot = next.snapshot
      setSession(next); setValues(snapshot.lastValid.values)
      setDraft(snapshot.draft ?? JSON.stringify(snapshot.lastValid, null, 2)); setError(snapshot.error || '')
    } catch (caught) {
      setSession(null); setError(caught instanceof Error ? caught.message : 'Unable to open construction recipe')
    }
    return () => { generation.current += 1; pending.current?.abort(); next?.dispose() }
  }, [document, props.nodeId])

  const apply = async (useDraft: boolean) => {
    if (!session || busy) return
    const request = ++generation.current
    const controller = new AbortController()
    pending.current?.abort(); pending.current = controller
    const source = useGraphStore.getState()
    const path = String(source.markdownDocumentName || '')
    if (!sourcePath || path !== sourcePath) { pending.current = null; setError('Open the asset’s source document to edit it'); return }
    const sourceText = source.markdownDocumentText
    const revision = captureWorkspaceSourceTextRevision(path)
    let invalidated = false
    const unsubscribe = useGraphStore.subscribe(next => {
      if (next.markdownDocumentName !== source.markdownDocumentName || next.markdownDocumentText !== sourceText || next.graphData !== source.graphData || next.graphDataRevision !== source.graphDataRevision) invalidated = true
    })
    const current = () => !invalidated && !controller.signal.aborted && generation.current === request
      && latest.current.document === document && latest.current.nodeId === props.nodeId
      && isWorkspaceSourceTextRevisionCurrent(revision)
    let staged: ProceduralAssetSession | null = null
    setBusy(true); setError('')
    try {
      staged = ProceduralAssetSession.restore(document)
      const recipe = parseProceduralAssetRecipe(staged.snapshot.lastValid)
      recipe.values = { ...values }
      const accepted = staged.apply(useDraft ? draft : JSON.stringify(recipe))
      if (!current()) throw new Error('Document changed; previous asset retained')
      if (!parentPath) throw new Error('This asset has no writable workspace parent')
      const fs = await (props.resolveWorkspaceFs || getWorkspaceFs)()
      if (!current()) throw new Error('Document changed; previous asset retained')
      const result = await prepareProceduralAssetOutput({ session: staged, fs, parentPath, signal: controller.signal, isCurrent: current })
      if (!current()) throw new Error('Document changed; previous asset retained')
      unsubscribe()
      latest.current.onPatch(result.patch)
      if (!accepted) setError(staged.snapshot.error || 'Invalid construction; previous asset retained')
    } catch (caught) {
      if (generation.current === request) setError(caught instanceof Error ? caught.message : 'Unable to save procedural asset')
    } finally {
      unsubscribe(); staged?.dispose()
      if (generation.current === request) { setBusy(false); pending.current = null }
    }
  }
  const recipe = session?.snapshot.lastValid
  const modelUrl = String(unwrapGraphCellValue(props.properties.modelUrl) || '')
  return <section aria-label="Procedural asset controls" className="mt-3 min-w-0 space-y-2" data-kg-procedural-asset-controls="1">
    <p className="text-xs font-medium">Editable model</p>
    <p className="text-xs opacity-70">Dimensions use scene units. Changes rebuild locally.</p>
    {recipe?.controls.map(control => {
      const id = `${props.nodeId}-procedural-${control.id}`
      return <div key={control.id} className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="min-w-24 text-xs" htmlFor={id}>{control.label}</label>
        {control.type === 'enum' ? <select id={id} className={props.inputClassName} disabled={busy} value={String(values[control.id] ?? control.default)} onChange={e => setValues(v => ({ ...v, [control.id]: e.target.value }))}>
          {control.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select> : <input id={id} className={props.inputClassName} disabled={busy}
          type={control.type === 'boolean' ? 'checkbox' : control.type === 'color' ? 'color' : 'number'}
          min={control.type === 'number' ? control.min : undefined} max={control.type === 'number' ? control.max : undefined} step={control.type === 'number' ? control.step : undefined}
          checked={control.type === 'boolean' ? values[control.id] === true : undefined}
          value={control.type === 'boolean' ? undefined : String(values[control.id] ?? control.default)}
          onChange={e => setValues(v => ({ ...v, [control.id]: control.type === 'boolean' ? e.target.checked : control.type === 'number' ? e.target.valueAsNumber : e.target.value }))} />}
        <button type="button" className="min-h-8 px-2 text-xs underline" disabled={busy} aria-label={`Reset ${control.label}`} onClick={() => setValues(v => ({ ...v, [control.id]: control.default }))}>Reset</button>
      </div>
    })}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="min-h-9 rounded border px-3 text-xs" disabled={!session || busy} onClick={() => void apply(false)}>Apply controls</button>
      {busy ? <button type="button" className="min-h-9 px-3 text-xs" onClick={() => pending.current?.abort()}>Cancel</button> : null}
      {modelUrl ? <a className="inline-flex min-h-9 items-center px-3 text-xs underline" href={modelUrl} download="procedural-asset.glb">Export GLB</a> : null}
    </div>
    <details><summary className="cursor-pointer text-xs">Construction recipe</summary>
      <label className="sr-only" htmlFor={`${props.nodeId}-construction`}>Construction recipe JSON</label>
      <textarea id={`${props.nodeId}-construction`} className={`${props.inputClassName || ''} min-h-40 w-full font-mono text-xs`} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} spellCheck={false} />
      <p className="text-xs opacity-70">Edit parts, parents, pivots and clips as validated JSON. Executable code is not accepted.</p>
      <button type="button" className="min-h-9 rounded border px-3 text-xs" disabled={!session || busy} onClick={() => void apply(true)}>Apply recipe</button>
    </details>
    {busy ? <p role="status" className="text-xs">Saving edited model…</p> : null}
    {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
  </section>
}
