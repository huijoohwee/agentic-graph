import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { controlLocalAnimation } from './xrAnimationMcpRuntime'
import { readXrAnimationTransport } from './xrAnimationTransportRuntime'
import {
  readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime,
  selectXrMotionReferenceCastMark, selectXrMotionReferenceCameraMark,
} from './xrMotionReferenceRuntime'
import { controlXrSharedAssetControls, inspectXrSharedAssetControls, readXrSharedAssetControlRevision, subscribeXrSharedAssetControlRuntime } from './xrSharedAssetControlRuntime'
import { activeXrTimelineBeatTime, buildXrTimelineBeats, sampleXrTimelineSceneObjects, type XrTimelineBeat } from './xrTimelineSceneProjection'

const rowClass = 'flex min-h-11 w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-left hover:bg-black/5 focus-visible:outline disabled:opacity-40'
const selectedClass = ' bg-blue-500/10 ring-1 ring-inset ring-blue-500/40'

/** Mounted only when requested inside the existing Timeline; no independent transport. */
export function XrTimelineSceneOverview({ disabled = false }: { disabled?: boolean }) {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  React.useSyncExternalStore(subscribeXrSharedAssetControlRuntime, readXrSharedAssetControlRevision, readXrSharedAssetControlRevision)
  useGraphStore(state => state.timelineTransportDocumentKey)
  useGraphStore(state => state.timelineTransportPosition)
  const transport = readXrAnimationTransport()
  const beats = React.useMemo(() => buildXrTimelineBeats(runtime.plan), [runtime.plan])
  const objects = React.useMemo(() => sampleXrTimelineSceneObjects(runtime.plan, transport.timeSeconds), [runtime.plan, transport.timeSeconds])
  const activeTime = activeXrTimelineBeatTime(beats, transport.timeSeconds)
  const selectedTargetId = inspectXrSharedAssetControls().selectedTargetId
  const selectTarget = (targetId: string) => {
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId })
    if (!result.ok) useGraphStore.getState().pushUiToast({ id: 'xr:cue-target:error', kind: 'error', message: result.message })
    return result.ok
  }
  const jump = (beat: XrTimelineBeat) => {
    const paused = controlLocalAnimation({ operation: 'pause' })
    const result = paused.ok ? controlLocalAnimation({ operation: 'scrub', timeSeconds: beat.timeSeconds }) : paused
    if (!result.ok) {
      useGraphStore.getState().pushUiToast({ id: 'xr:beat-seek:error', kind: 'error', message: result.message })
      return
    }
    if (!selectTarget(beat.targetId)) return
    if (beat.kind === 'cast' && beat.markId) selectXrMotionReferenceCastMark(beat.targetId, beat.markId)
    if (beat.kind === 'camera' && beat.markId) selectXrMotionReferenceCameraMark(beat.markId)
  }
  return (
    <section aria-label="XR scene overview" className="min-w-0 rounded border border-current/10 p-2 text-xs">
      <p className="mb-2 text-[10px] opacity-70">Authored scene · {transport.timeSeconds.toFixed(2)}s · path positions in metres</p>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <section aria-label="Authored beats" className="min-w-0">
          <h3 className="mb-1 font-medium">Beats <span className="opacity-60">{beats.length}</span></h3>
          <ol className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
            {beats.map(beat => (
              <li key={beat.id}>
                <button type="button" disabled={disabled} onClick={() => jump(beat)}
                  className={rowClass + (beat.timeSeconds === activeTime ? selectedClass : '')}
                  aria-current={beat.timeSeconds === activeTime ? 'step' : undefined}
                  title={`${beat.label} · ${beat.detail}`}
                  aria-label={`Jump to ${beat.label}, ${beat.detail}, at ${beat.timeSeconds.toFixed(2)} seconds`}>
                  <span className="shrink-0 tabular-nums opacity-60">{beat.timeSeconds.toFixed(2)}</span>
                  <span className="min-w-0"><b className="block truncate font-medium">{beat.label}</b><span className="block truncate text-[10px] opacity-70">{beat.detail}</span></span>
                </button>
              </li>
            ))}
          </ol>
          {!beats.length && <p className="py-2 opacity-60">No authored beats. Add a cast or camera mark to a Timeline track.</p>}
        </section>
        <section aria-label="Scene objects at playhead" className="min-w-0">
          <h3 className="mb-1 font-medium">Scene objects <span className="opacity-60">{objects.length}</span></h3>
          <ul className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
            {objects.map(object => (
              <li key={object.id}>
                <button type="button" disabled={disabled} onClick={() => selectTarget(object.id)}
                  className={rowClass + (selectedTargetId === object.id ? selectedClass : '')}
                  title={`${object.label} · ${object.category} · path ${object.motion}`}
                  aria-pressed={selectedTargetId === object.id} aria-label={`Select scene object ${object.label}`}>
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: object.color }} aria-hidden />
                  <span className="min-w-0"><b className="block truncate font-medium">{object.label}</b>
                    <span className="block truncate text-[10px] opacity-70">{object.category} · path {object.motion} · ({object.position.map(value => value.toFixed(1)).join(', ')})</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!objects.length && <p className="py-2 opacity-60">No scene objects. Add an object to the scene to rehearse it here.</p>}
        </section>
      </div>
    </section>
  )
}
