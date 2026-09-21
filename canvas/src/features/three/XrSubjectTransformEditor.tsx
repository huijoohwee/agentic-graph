import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XrSubjectTransformCard } from '@/features/command-menu/XrMediaLibraryCards'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { controlLocalXrScene, type XrSceneControlInput } from './xrSceneMcpRuntime'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'
import { resolveXrStageObjects } from './xrSceneLibrary'
import { resolveXrShotTargetPosition } from './xrShotTargets'

/** The selected object's only transform editor, mounted by BottomPanel Timeline. */
export function XrSubjectTransformEditor() {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const subject = runtime.plan.subjects.find(subject => subject.id === runtime.selectedShotTargetId)
  const stageObject = resolveXrStageObjects(runtime.plan.stageId).find(object => object.id === runtime.selectedShotTargetId)
  const runControl = (input: XrSceneControlInput) => {
    const result = controlLocalXrScene(input)
    useGraphStore.getState().pushUiToast({ id: 'xr:timeline:transform', kind: result.ok ? 'success' : 'error', message: result.message })
    return result
  }
  if (!subject && !stageObject) return null
  const label = subject?.label || stageObject!.label
  const track = runtime.plan.cast.find(track => track.actorId === subject?.id)
  return <details open className="shrink-0 border-b p-2" data-kg-xr-timeline-object-inspector={runtime.selectedShotTargetId}>
    <summary className="cursor-pointer text-xs font-semibold">{label} · Object transform</summary>
    {subject ? <section className="mt-2 grid gap-2">
      <section className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[10px]">Name<PanelTextInput key={`${subject.id}:${subject.label}`} defaultValue={subject.label}
          aria-label={`Rename ${subject.label}`} onBlur={event => {
            const value = event.currentTarget.value.trim()
            if (value !== subject.label && !runControl({ action: 'label', subjectId: subject.id, label: value }).ok) event.currentTarget.value = subject.label
          }} /></label>
        <label className="grid gap-1 text-[10px]">Path interpolation<PanelSelect aria-label={`Path interpolation for ${subject.label}`}
          value={track?.marks[0]?.transition || 'hold'} onChange={event => runControl({ action: 'transition', subjectId: subject.id, transition: event.target.value as 'linear' | 'hold' })}>
          <option value="linear">Travel</option><option value="hold">Hold</option>
        </PanelSelect></label>
      </section>
      <XrSubjectTransformCard subject={subject} sceneReady={readXrSceneDocumentReady()} runControl={runControl} />
    </section> : <section className="mt-2 grid gap-2 text-xs">
      <p>{stageObject!.nativeBodyId ? 'Position is controlled by the playground simulation.' : 'Placement belongs to the Tropical Playground environment.'} Select this object as a camera target or inspect its Timeline lane.</p>
      <output aria-label={`${label} position`}>Position · {resolveXrShotTargetPosition(runtime.plan, stageObject!.id, runtime.playheadSeconds).map(value => value.toFixed(2)).join(', ')} m</output>
    </section>}
  </details>
}
