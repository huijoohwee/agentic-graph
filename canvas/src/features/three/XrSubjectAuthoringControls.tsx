import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ancestorPathsForWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ProceduralAssetControls } from '@/features/image-to-glb/ProceduralAssetControls'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { createProceduralAssetFromText, PROCEDURAL_ASSET_TEXT_SUBJECTS } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import { prepareProceduralAssetOutput } from '@/features/image-to-glb/proceduralAssetOutput'
import { exportProceduralAsset } from '@/features/image-to-glb/proceduralAssetRuntimeExport'
import { downloadBlob } from '@/lib/graph/save'
import type { AssetPart, ProceduralAssetRecipe } from '@/features/image-to-glb/proceduralAssetContract'
import { captureXrSubjectDraftContext, editXrSubjectPart, isXrSubjectDraftCurrent, readXrSubjectConstruction, readXrSubjectPart, readXrSubjectPlayback, type XrSubjectConstruction, type XrSubjectDraftContext } from './xrSubjectAuthoring'
import { readXrMotionReferenceRuntime, restoreXrMotionReferenceRuntimeSnapshot, selectXrSubjectPart, setXrSubjectConstruction, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { persistXrScene } from './xrScenePersistence'
import type { XrMotionReferenceSubject } from './xrMotionReferenceModel'

/** Adapts the existing construction controls to the selected subject's native persistence. */
export function XrSubjectAuthoringControls({ subject, context, resolveWorkspaceFs = getWorkspaceFs, downloadFile = downloadBlob }: { subject: XrMotionReferenceSubject; context: XrSubjectDraftContext; resolveWorkspaceFs?: () => Promise<WorkspaceFs>; downloadFile?: typeof downloadBlob }) {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const [intent, setIntent] = React.useState('blue robot')
  const [busy, setBusy] = React.useState(false)
  const [activity, setActivity] = React.useState('Saving construction…')
  const [error, setError] = React.useState('')
  const [epoch, setEpoch] = React.useState(0)
  const serial = React.useRef(0)
  const readContext = () => captureXrSubjectDraftContext(useGraphStore.getState(), readXrMotionReferenceRuntime(), subject.id)
  // Whole-model drafts belong to the subject; only part edits depend on its selected joint.
  const modelContext = (value: XrSubjectDraftContext): XrSubjectDraftContext => ({ ...value, selectedPartId: '', selectedPart: null })
  const binding = React.useMemo(() => ({ context, generation: ++serial.current,
    invalidated: !isXrSubjectDraftCurrent(modelContext(context), modelContext(readContext())), pending: null as AbortController | null,
  }), [context.documentName, context.documentText, context.sceneKey, context.sourceSignature, context.plan, context.subjectId, context.selectedSubjectId, epoch])
  const latest = React.useRef(binding)
  latest.current = binding
  const current = () => !binding.invalidated && isXrSubjectDraftCurrent(modelContext(binding.context), modelContext(readContext()))
  React.useEffect(() => {
    // A remounted effect gets a fresh generation; its retired lease is never revived.
    if (binding.invalidated && isXrSubjectDraftCurrent(modelContext(binding.context), modelContext(readContext()))) setEpoch(value => value + 1)
    setBusy(false); setError('')
    const observe = () => {
      if (!binding.invalidated && !isXrSubjectDraftCurrent(modelContext(binding.context), modelContext(readContext()))) {
        binding.invalidated = true; binding.pending?.abort(); setEpoch(value => value + 1)
      }
    }
    observe()
    const source = useGraphStore.subscribe(observe), runtime = subscribeXrMotionReferenceRuntime(observe)
    return () => { binding.invalidated = true; binding.pending?.abort(); source(); runtime() }
  }, [binding])
  const commit = (patch: Record<string, unknown>) => {
    if (!current()) throw new Error('This construction belongs to an earlier document or selection')
    const construction = readXrSubjectConstruction({ ...subject.construction, ...patch, proceduralAssetSourcePath: context.documentName })!
    const previous = readXrMotionReferenceRuntime()
    const next = setXrSubjectConstruction(subject.id, construction)
    if (next === previous || next.plan.subjects.find(item => item.id === subject.id)?.construction?.proceduralAssetDocument !== construction.proceduralAssetDocument) throw new Error('Construction exceeds the scene placement bounds; previous subject retained')
    try {
      if (!persistXrScene()) throw new Error('Unable to save construction to the current scene')
    } catch (caught) { restoreXrMotionReferenceRuntimeSnapshot(previous); throw caught }
  }
  const save = async (stage: () => ProceduralAssetSession, partContext?: XrSubjectDraftContext) => {
    if (busy || !current()) return
    const controller = new AbortController()
    binding.pending?.abort(); binding.pending = controller
    let invalidated = false
    const isCurrent = () => !invalidated && !controller.signal.aborted && current()
      && (!partContext || isXrSubjectDraftCurrent(partContext, readContext()))
    const observe = () => { if (!isCurrent()) { invalidated = true; controller.abort() } }
    const unsubscribeSource = useGraphStore.subscribe(observe), unsubscribeRuntime = subscribeXrMotionReferenceRuntime(observe)
    const unsubscribe = () => { unsubscribeSource(); unsubscribeRuntime() }
    let session: ProceduralAssetSession | null = null
    setBusy(true); setActivity('Saving construction…'); setError('')
    try {
      session = stage()
      if (subject.construction) readXrSubjectConstruction({ ...subject.construction, proceduralAssetDocument: session.serialize() })
      const fs = await resolveWorkspaceFs()
      const parentPath = ancestorPathsForWorkspacePath(context.documentName).at(-1) || '/'
      const result = await prepareProceduralAssetOutput({ session, fs, parentPath, signal: controller.signal, isCurrent })
      if (!isCurrent()) throw new Error('Document changed; previous subject retained')
      unsubscribe()
      commit(result.patch)
    } catch (caught) {
      if (latest.current === binding && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Unable to create an editable subject')
    } finally {
      unsubscribe(); session?.dispose()
      if (binding.pending === controller) binding.pending = null
      if (latest.current === binding) setBusy(false)
    }
  }
  const create = () => save(() => new ProceduralAssetSession(`${context.documentName}#${subject.id}`, createProceduralAssetFromText(intent)))
  const selectPart = (partId: string) => {
    if (busy || !current()) return
    setError('')
    try { selectXrSubjectPart(partId) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to select this part') }
  }
  const applyPlayback = (playback: NonNullable<XrSubjectConstruction['playback']>) => {
    if (busy || !current()) return
    setError('')
    try { commit({ playback }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save clip playback') }
  }
  const applyPart = (partId: string, patch: Omit<AssetPart, 'id'>) => save(() => {
    if (!subject.construction) throw new Error('Select an editable subject first')
    if (partId !== context.selectedPartId) throw new Error('Part selection changed; review the current part before applying')
    const session = ProceduralAssetSession.restore(subject.construction.proceduralAssetDocument)
    try {
      const recipe = editXrSubjectPart(session.snapshot.lastValid, partId, patch)
      if (!session.apply(JSON.stringify(recipe))) throw new Error(session.snapshot.error || 'Unable to edit this part')
      return session
    } catch (caught) { session.dispose(); throw caught }
  }, context)
  const exportGlb = async () => {
    const document = subject.construction?.proceduralAssetDocument
    if (!document || busy || !current()) return
    const controller = new AbortController()
    binding.pending?.abort(); binding.pending = controller
    const isCurrent = () => !controller.signal.aborted && current()
      && readXrMotionReferenceRuntime().plan.subjects.find(item => item.id === subject.id)?.construction?.proceduralAssetDocument === document
    let session: ProceduralAssetSession | null = null
    setBusy(true); setActivity('Preparing selected model GLB…'); setError('')
    try {
      session = ProceduralAssetSession.restore(document)
      const { glb } = await exportProceduralAsset({ recipe: session.snapshot.lastValid, artifactStem: subject.label,
        signal: controller.signal, isCurrent })
      if (!isCurrent()) throw new Error('Document or selection changed; export cancelled')
      downloadFile(glb.blob, glb.fileName)
    } catch (caught) {
      if (latest.current === binding && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Unable to export the selected model')
    } finally {
      session?.dispose()
      if (binding.pending === controller) binding.pending = null
      if (latest.current === binding) setBusy(false)
    }
  }
  return <section aria-label="Subject construction" className="grid gap-2 border-t pt-2">
    {subject.construction ? <>
      <p className="text-xs">Rigid parts, pivots and hierarchy remain editable. The selected clip follows the shared Timeline playhead.</p>
      <XrSubjectPartEditor document={subject.construction.proceduralAssetDocument} generation={binding.generation}
        selectedPart={runtime.selectedSubjectPart?.subjectId === subject.id ? runtime.selectedSubjectPart : null}
        busy={busy} onSelect={selectPart} onApply={applyPart} />
      <XrSubjectPlaybackEditor key={`playback:${binding.generation}`} construction={subject.construction} busy={busy} onApply={applyPlayback} />
      <fieldset disabled={busy} className="min-w-0">
        <ProceduralAssetControls key={binding.generation} resolveWorkspaceFs={resolveWorkspaceFs} nodeId={subject.id} properties={{ ...subject.construction, proceduralAssetSourcePath: context.documentName }} onPatchProperties={commit} />
      </fieldset>
      <button type="button" className="min-h-9 rounded border px-3 text-xs" disabled={busy} onClick={() => void exportGlb()}>Export selected model GLB</button>
      <p className="text-xs opacity-70">Includes this model’s rigid-part clips in local coordinates. Scene placement and camera motion are separate.</p>
    </> : <>
      <label className="grid gap-1 text-xs">Create an editable subject<input aria-label="Subject description" className="min-h-9 rounded border bg-transparent px-2" value={intent} maxLength={2000} disabled={busy} onChange={event => setIntent(event.target.value)} /></label>
      <p className="text-xs opacity-70">Local subjects: {PROCEDURAL_ASSET_TEXT_SUBJECTS.join(', ')}. One subject per description.</p>
      <button type="button" className="min-h-9 rounded border px-3 text-xs" disabled={busy} onClick={() => void create()}>Create editable model</button>
    </>}
    {busy ? <div role="status" className="text-xs">{activity} <button type="button" onClick={() => binding.pending?.abort()}>Cancel</button></div> : null}
    {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
  </section>
}

function XrSubjectPlaybackEditor({ construction, busy, onApply }: {
  construction: XrSubjectConstruction; busy: boolean; onApply: (playback: NonNullable<XrSubjectConstruction['playback']>) => void
}) {
  const current = React.useMemo(() => readXrSubjectPlayback(construction), [construction])
  const [clipId, setClipId] = React.useState(current.clipId)
  const [loop, setLoop] = React.useState(current.loop)
  return <fieldset disabled={busy} className="grid min-w-0 gap-2 border-t pt-2">
    <legend className="text-xs font-medium">Clip playback</legend>
    <label className="grid gap-1 text-xs">Authored clip<select aria-label="Authored clip" className="min-h-9 rounded border bg-transparent px-2" value={clipId || ''}
      onChange={event => setClipId(event.currentTarget.value || null)}>
      <option value="">Rest pose</option>
      {current.clips.map(clip => <option key={clip.id} value={clip.id}>{clip.id} · {clip.duration} s</option>)}
    </select></label>
    <label className="grid gap-1 text-xs">At clip end<select aria-label="At clip end" className="min-h-9 rounded border bg-transparent px-2" value={loop ? 'repeat' : 'hold'} disabled={!clipId}
      onChange={event => setLoop(event.currentTarget.value === 'repeat')}>
      <option value="repeat">Repeat</option><option value="hold">Hold final pose</option>
    </select></label>
    <p className="text-xs opacity-70">Clips start at scene time zero. Use the Timeline to play or seek. Playback choices stay with the scene; model GLB includes all authored clips.</p>
    <button type="button" className="min-h-9 rounded border px-3 text-xs" onClick={() => onApply({ clipId, loop })}>Apply playback</button>
  </fieldset>
}

/** A local form projection of the selected subject's native recipe; no second selection store. */
function XrSubjectPartEditor({ document, generation, selectedPart, busy, onSelect, onApply }: {
  document: string; generation: number; selectedPart: XrSubjectDraftContext['selectedPart']; busy: boolean; onSelect: (partId: string) => void
  onApply: (partId: string, patch: Omit<AssetPart, 'id'>) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [recipe, setRecipe] = React.useState<ProceduralAssetRecipe | null>(null)
  const [draft, setDraft] = React.useState<AssetPart | null>(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    if (!open) return
    let session: ProceduralAssetSession | null = null
    try {
      session = ProceduralAssetSession.restore(document)
      const next = session.snapshot.lastValid
      const selectedPartId = selectedPart?.partId || ''
      setRecipe(next)
      setDraft(readXrSubjectPart(next, next.parts.some(part => part.id === selectedPartId) ? selectedPartId : next.parts[0].id))
      setError('')
    } catch (caught) { setRecipe(null); setDraft(null); setError(caught instanceof Error ? caught.message : 'Unable to inspect parts') }
    finally { session?.dispose() }
  }, [document, open, selectedPart, generation])
  const inputClass = 'min-h-9 w-full min-w-0 rounded border bg-transparent px-2 text-xs'
  const vector = (field: 'position' | 'pivot' | 'rotation' | 'size', label: string) => draft && <fieldset className="min-w-0">
    <legend className="text-xs">{label}</legend>
    <div className="grid grid-cols-3 gap-1">{(['X', 'Y', 'Z'] as const).map((axis, index) => {
      const control = field === 'size' ? recipe?.controls.find(item => item.partId === draft.id && item.target === ['width', 'height', 'depth'][index]) : undefined
      const value = draft[field][index] * (field === 'rotation' ? 180 / Math.PI : 1)
      return <label key={axis} className="min-w-0 text-[10px]">{axis}<input type="number" aria-label={`${label} ${axis}`} className={inputClass}
        min={control?.type === 'number' ? control.min : field === 'size' ? 0.01 : field === 'rotation' ? -180 : -100}
        max={control?.type === 'number' ? control.max : field === 'size' ? 20 : field === 'rotation' ? 180 : 100}
        step="any" value={Number.isFinite(value) ? value : ''} onChange={event => {
          const next = event.currentTarget.valueAsNumber * (field === 'rotation' ? Math.PI / 180 : 1)
          setDraft(previous => previous && { ...previous, [field]: previous[field].map((number, i) => i === index ? next : number) as AssetPart[typeof field] })
        }} /></label>
    })}</div>
  </fieldset>
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-9 cursor-pointer text-xs font-medium">Parts &amp; rig</summary>
    {recipe && draft ? <fieldset disabled={busy} className="grid min-w-0 gap-2">
      <label className="grid gap-1 text-xs">Part<select aria-label="Part" className={inputClass} value={draft.id}
        onChange={event => onSelect(event.currentTarget.value)}>
        {recipe.parts.map(part => <option key={part.id} value={part.id}>{part.id}</option>)}
      </select></label>
      <label className="grid gap-1 text-xs">Parent part<select aria-label="Parent part" className={inputClass} value={draft.parentId || ''}
        onChange={event => { const parentId = event.currentTarget.value || null; setDraft(previous => previous && { ...previous, parentId }) }}>
        <option value="">Scene root</option>
        {recipe.parts.filter(part => part.id !== draft.id).map(part => <option key={part.id} value={part.id}>{part.id}</option>)}
      </select></label>
      <label className="grid gap-1 text-xs">Shape<select aria-label="Part shape" className={inputClass} value={draft.primitive}
        onChange={event => { const primitive = event.currentTarget.value as AssetPart['primitive']; setDraft(previous => previous && { ...previous, primitive }) }}>
        {(['box', 'sphere', 'cylinder', 'cone'] as const).map(shape => <option key={shape}>{shape}</option>)}
      </select></label>
      {vector('position', 'Position (m)')}{vector('pivot', 'Pivot (m)')}
      {vector('rotation', 'Rotation (degrees)')}{vector('size', 'Size (m)')}
      <label className="flex items-center gap-2 text-xs">Part color<input type="color" aria-label="Part color" value={draft.color}
        onChange={event => { const color = event.currentTarget.value; setDraft(previous => previous && { ...previous, color }) }} /></label>
      <label className="flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" aria-label="Part visible" checked={draft.visible}
        onChange={event => { const visible = event.currentTarget.checked; setDraft(previous => previous && { ...previous, visible }) }} />Part visible</label>
      <p className="text-xs opacity-70">Transforms are local to the parent. Rotation uses the part’s pivot. Animated tracks can override the rest rotation. Bound dimensions and materials update the same procedural controls.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="min-h-9 rounded border px-3 text-xs" onClick={() => { const { id, ...patch } = draft; void onApply(id, patch) }}>Apply part</button>
        <button type="button" className="min-h-9 rounded border px-3 text-xs" onClick={() => setDraft(readXrSubjectPart(recipe, draft.id))}>Reset part draft</button>
      </div>
    </fieldset> : null}
    {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
  </details>
}
