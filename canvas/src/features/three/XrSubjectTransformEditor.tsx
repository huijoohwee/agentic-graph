import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XrSubjectTransformCard } from '@/features/command-menu/XrMediaLibraryCards'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { controlLocalXrScene, type XrSceneControlInput } from './xrSceneMcpRuntime'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'
import { resolveXrStageObjects } from './xrSceneLibrary'
import { resolveXrShotTargetPosition } from './xrShotTargets'
import { useShallow } from 'zustand/react/shallow'
import { hydrateCanonicalXrMotionReferenceRuntime } from './XrMotionReferenceRuntimeBridge'
import { captureXrSubjectDraftContext, isXrSubjectDraftCurrent } from './xrSubjectAuthoring'

/** The selected object's only transform editor, mounted by BottomPanel Timeline. */
export function XrSubjectTransformEditor() {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const document = useGraphStore(useShallow(state => ({ markdownDocumentName: state.markdownDocumentName, markdownDocumentText: state.markdownDocumentText })))
  const subject = runtime.plan.subjects.find(subject => subject.id === runtime.selectedShotTargetId)
  const stageObject = resolveXrStageObjects(runtime.plan.stageId).find(object => object.id === runtime.selectedShotTargetId)
  const context = captureXrSubjectDraftContext(document, runtime, runtime.selectedShotTargetId)
  const draft = React.useRef(context)
  const boundary = React.useRef({ context, key: 0 })
  const previous = boundary.current.context
  if (previous.documentName !== context.documentName || previous.documentText !== context.documentText
    || previous.sceneKey !== context.sceneKey || previous.sourceSignature !== context.sourceSignature
    || previous.plan !== context.plan || previous.subjectId !== context.subjectId) {
    boundary.current = { context, key: boundary.current.key + 1 }
  }
  const readContext = () => captureXrSubjectDraftContext(useGraphStore.getState(), readXrMotionReferenceRuntime(), context.subjectId)
  const runControl = (input: XrSceneControlInput) => {
    const current = isXrSubjectDraftCurrent(draft.current, readContext())
      && hydrateCanonicalXrMotionReferenceRuntime() && isXrSubjectDraftCurrent(draft.current, readContext())
    const result = current ? controlLocalXrScene(input) : { ok: false, message: 'This object draft belongs to an earlier scene or selection. Review the current object and edit again.' }
    useGraphStore.getState().pushUiToast({ id: 'xr:timeline:transform', kind: result.ok ? 'success' : 'error', message: result.message })
    return result
  }
  if (!subject && !stageObject) return null
  const label = subject?.label || stageObject!.label
  return <details key={boundary.current.key} open className="shrink-0 border-b p-2" data-kg-xr-timeline-object-inspector={runtime.selectedShotTargetId}
    onFocusCapture={() => { draft.current = context }}>
    <summary className="cursor-pointer text-xs font-semibold">{label} · Object transform</summary>
    {subject ? <section className="mt-2 grid gap-2">
      <section className="grid gap-2">
        <label className="grid gap-1 text-[10px]">Name<PanelTextInput key={`${subject.id}:${subject.label}`} defaultValue={subject.label}
          aria-label={`Rename ${subject.label}`} onBlur={event => {
            const value = event.currentTarget.value.trim()
            if (value !== subject.label && !runControl({ action: 'label', subjectId: subject.id, label: value }).ok) event.currentTarget.value = subject.label
          }} /></label>

      </section>
      <XrSubjectTransformCard subject={subject} sceneReady={readXrSceneDocumentReady()} runControl={runControl} />
    </section> : <section className="mt-2 grid gap-2 text-xs">
      <p>{stageObject!.nativeBodyId ? 'Position is controlled by the playground simulation.' : 'Placement belongs to the Tropical Playground environment.'} Select this object as a camera target or inspect its Timeline lane.</p>
      <output aria-label={`${label} position`}>Position · {resolveXrShotTargetPosition(runtime.plan, stageObject!.id, runtime.playheadSeconds).map(value => value.toFixed(2)).join(', ')} m</output>
    </section>}
  </details>
}
