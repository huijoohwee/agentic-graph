import React from 'react'
import { useFrame, type RootState } from '@react-three/fiber'
import { type Object3D, Quaternion, Vector3 } from 'three'
import { sampleXrMotionReferenceMarks } from './xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import { xrMotionReferenceWorldPosition } from './xrMotionReferenceCoordinates'
import {
  readXrPhysicsBodyState,
  readXrPhysicsRuntime,
  setXrPhysicsKinematicPose,
  stepXrPhysicsRuntime,
  subscribeXrPhysicsRuntime,
} from './xrPhysicsRuntime'

type AuthoredTransform = Readonly<{
  object: Object3D
  position: Vector3
  quaternion: Quaternion
}>

function findSubjectObject(state: RootState, subjectId: string): Object3D | null {
  return state.scene.getObjectByName(`agentic_os_xr_scene_subject_${subjectId}`) || null
}

function readAuthoredPosition(subjectId: string): readonly [number, number, number] | null {
  const motion = readXrMotionReferenceRuntime()
  const subject = motion.plan.subjects.find(candidate => candidate.id === subjectId)
  if (!subject) return null
  const track = motion.plan.cast.find(candidate => candidate.actorId === subjectId)
  return track
    ? sampleXrMotionReferenceMarks(track.marks, motion.playheadSeconds)
    : subject.position
}

export function XrPhysicsStageRuntime({
  stageScale,
  groundY,
  paused = false,
}: {
  stageScale: number
  groundY: number
  paused?: boolean
}) {
  const runtime = React.useSyncExternalStore(
    subscribeXrPhysicsRuntime,
    readXrPhysicsRuntime,
    readXrPhysicsRuntime,
  )
  const capturedRef = React.useRef(new Map<string, AuthoredTransform>())

  const restoreAuthoredTransforms = React.useCallback(() => {
    for (const capture of capturedRef.current.values()) {
      capture.object.position.copy(capture.position)
      capture.object.quaternion.copy(capture.quaternion)
      capture.object.userData.kgXrPhysicsActive = false
      capture.object.updateMatrixWorld()
    }
    capturedRef.current.clear()
  }, [])

  React.useEffect(() => {
    if (!paused && runtime.phase === 'stopped') restoreAuthoredTransforms()
  }, [paused, restoreAuthoredTransforms, runtime.phase])
  React.useEffect(() => restoreAuthoredTransforms, [restoreAuthoredTransforms])

  useFrame((state, deltaSeconds) => {
    if (paused) return
    const current = readXrPhysicsRuntime()
    if (current.phase === 'stopped') return

    for (const body of current.world.bodies) {
      if (body.mode !== 'kinematic') continue
      const authoredPosition = readAuthoredPosition(body.subjectId)
      const previous = readXrPhysicsBodyState(body.subjectId)
      if (authoredPosition && previous) {
        const elapsed = Number.isFinite(deltaSeconds) && deltaSeconds > 0
          ? deltaSeconds
          : current.world.fixedStepSeconds
        setXrPhysicsKinematicPose(body.subjectId, authoredPosition, [
          (authoredPosition[0] - previous.position[0]) / elapsed,
          (authoredPosition[1] - previous.position[1]) / elapsed,
          (authoredPosition[2] - previous.position[2]) / elapsed,
        ])
      }
    }
    if (current.phase === 'playing') stepXrPhysicsRuntime(deltaSeconds)

    for (const body of current.world.bodies) {
      const object = findSubjectObject(state, body.subjectId)
      const bodyState = readXrPhysicsBodyState(body.subjectId)
      if (!object || !bodyState) continue
      if (!capturedRef.current.has(body.subjectId)) {
        capturedRef.current.set(body.subjectId, {
          object,
          position: object.position.clone(),
          quaternion: object.quaternion.clone(),
        })
      }
      const captured = capturedRef.current.get(body.subjectId)!
      const position = xrMotionReferenceWorldPosition(bodyState.position, stageScale, groundY)
      object.position.set(position[0], position[1], position[2])
      object.quaternion.copy(captured.quaternion)
      object.userData.kgXrPhysicsActive = true
      object.updateMatrixWorld()
    }
  })

  return (
    <group
      name="agentic_os_xr_simulation_runtime"
      userData={{
        schema: runtime.world.schema,
        phase: runtime.phase,
        bodyCount: runtime.world.bodies.length,
      }}
    />
  )
}
