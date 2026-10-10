import React from 'react'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import {
  controlXrSharedAssetControls,
  inspectXrSharedAssetControls,
  readXrSharedAssetControlRevision,
  subscribeXrSharedAssetControlRuntime,
} from './xrSharedAssetControlRuntime'
import { selectBoundXrShotTarget } from './xrSelectedActorBinding'
import { XrSceneLibrarySubject } from './XrSceneLibrarySubject'
import { xrMotionReferenceWorldPosition } from './xrMotionReferenceCoordinates'
import { resolveMotionControlSubjectPose, useMotionControlAnimationPose } from './useMotionControlAnimationPose'
import { sampleXrMotionReferenceSubjectPlayback } from './xrMotionReferenceSubjectPlayback'

export function XrNativeControllerAuthoredSubjects() {
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const sharedAssetControlRevision = React.useSyncExternalStore(
    subscribeXrSharedAssetControlRuntime,
    readXrSharedAssetControlRevision,
    readXrSharedAssetControlRevision,
  )
  const { boundingBoxEnabled, motionActorId, livePose } = useMotionControlAnimationPose()
  const sharedAssetControls = React.useMemo(
    () => inspectXrSharedAssetControls(),
    [runtime.revision, sharedAssetControlRevision],
  )
  const selectSubject = React.useCallback((subjectId: string) => {
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId: subjectId })
    if (!result.ok) selectBoundXrShotTarget(subjectId)
  }, [])
  return (
    <group
      name="agentic_os_xr_native_controller_authored_subjects"
      userData={{ source: runtime.plan.schema, subjectCount: runtime.plan.subjects.length }}
    >
      {runtime.plan.subjects.map(subject => {
        const track = runtime.plan.cast.find(candidate => candidate.actorId === subject.id)
        const motionPose = resolveMotionControlSubjectPose(subject, motionActorId, livePose)
        const playback = sampleXrMotionReferenceSubjectPlayback(
          subject,
          track,
          runtime.playheadSeconds,
          motionPose,
        )
        return (
          <XrSceneLibrarySubject
            key={subject.id}
            animationPose={playback.animationPose}
            facingYRadians={playback.facingYRadians}
            subject={subject}
            position={xrMotionReferenceWorldPosition(playback.position, 1, 0)}
            stageScale={1}
            presentation={playback.presentation}
            selected={sharedAssetControls.selectedKind !== 'npc' && runtime.selectedShotTargetId === subject.id}
            showIdentificationBounds={boundingBoxEnabled}
            onSelect={() => selectSubject(subject.id)}
          />
        )
      })}
    </group>
  )
}
