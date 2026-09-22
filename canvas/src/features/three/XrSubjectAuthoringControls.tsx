import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ancestorPathsForWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ProceduralAssetControls } from '@/features/image-to-glb/ProceduralAssetControls'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { createProceduralAssetFromText, PROCEDURAL_ASSET_TEXT_SUBJECTS } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import { prepareProceduralAssetOutput } from '@/features/image-to-glb/proceduralAssetOutput'
import { captureXrSubjectDraftContext, isXrSubjectDraftCurrent, readXrSubjectConstruction, type XrSubjectDraftContext } from './xrSubjectAuthoring'
import { readXrMotionReferenceRuntime, restoreXrMotionReferenceRuntimeSnapshot, setXrSubjectConstruction, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { persistXrScene } from './xrScenePersistence'
import type { XrMotionReferenceSubject } from './xrMotionReferenceModel'

/** Adapts the existing construction controls to the selected subject's native persistence. */
export function XrSubjectAuthoringControls({ subject, context, resolveWorkspaceFs = getWorkspaceFs }: { subject: XrMotionReferenceSubject; context: XrSubjectDraftContext; resolveWorkspaceFs?: () => Promise<WorkspaceFs> }) {
  const [intent, setIntent] = React.useState('blue robot')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [epoch, setEpoch] = React.useState(0)
  const serial = React.useRef(0)
  const readContext = () => captureXrSubjectDraftContext(useGraphStore.getState(), readXrMotionReferenceRuntime(), subject.id)
  const binding = React.useMemo(() => ({ context, generation: ++serial.current,
    invalidated: !isXrSubjectDraftCurrent(context, readContext()), pending: null as AbortController | null,
  }), [context.documentName, context.documentText, context.sceneKey, context.sourceSignature, context.plan, context.subjectId, context.selectedSubjectId, epoch])
  const latest = React.useRef(binding)
  latest.current = binding
  const current = () => !binding.invalidated && isXrSubjectDraftCurrent(binding.context, readContext())
  React.useEffect(() => {
    // A remounted effect gets a fresh generation; its retired lease is never revived.
    if (binding.invalidated && isXrSubjectDraftCurrent(binding.context, readContext())) setEpoch(value => value + 1)
    setBusy(false); setError('')
    const observe = () => {
      if (!binding.invalidated && !isXrSubjectDraftCurrent(binding.context, readContext())) {
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
  const create = async () => {
    if (busy || !current()) return
    const controller = new AbortController()
    binding.pending?.abort(); binding.pending = controller
    let invalidated = false
    const unsubscribe = useGraphStore.subscribe(() => { if (!current()) invalidated = true })
    const isCurrent = () => !invalidated && !controller.signal.aborted && current()
    let session: ProceduralAssetSession | null = null
    setBusy(true); setError('')
    try {
      session = new ProceduralAssetSession(`${context.documentName}#${subject.id}`, createProceduralAssetFromText(intent))
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
  return <section aria-label="Subject construction" className="grid gap-2 border-t pt-2">
    {subject.construction ? <>
      <p className="text-xs">Rigid parts, pivots and hierarchy remain editable. The first authored clip follows the shared Timeline playhead.</p>
      <ProceduralAssetControls key={binding.generation} resolveWorkspaceFs={resolveWorkspaceFs} nodeId={subject.id} properties={{ ...subject.construction, proceduralAssetSourcePath: context.documentName }} onPatchProperties={commit} />
    </> : <>
      <label className="grid gap-1 text-xs">Create an editable subject<input aria-label="Subject description" className="min-h-9 rounded border bg-transparent px-2" value={intent} maxLength={2000} disabled={busy} onChange={event => setIntent(event.target.value)} /></label>
      <p className="text-xs opacity-70">Local subjects: {PROCEDURAL_ASSET_TEXT_SUBJECTS.join(', ')}. One subject per description.</p>
      <button type="button" className="min-h-9 rounded border px-3 text-xs" disabled={busy} onClick={() => void create()}>Create editable model</button>
    </>}
    {busy ? <div role="status" className="text-xs">Saving construction… <button type="button" onClick={() => binding.pending?.abort()}>Cancel</button></div> : null}
    {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
  </section>
}
