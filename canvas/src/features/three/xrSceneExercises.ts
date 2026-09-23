import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'
import { isXrConstrainedMotionPlanSafe } from './xrConstrainedMotionEdits'
import type { XrMotionReferenceVector } from './xrMotionReferenceModel'

export const XR_STUDIO_EXERCISES_SCHEMA = 'agentic-graph-xr-studio-exercises/v1'

export type XrStudioExercise = Readonly<{
  id: 'reach-mark' | 'avoid-subject' | 'sync-camera'
  title: string
  state: 'needs-work' | 'passed' | 'blocked'
  feedback: string
}>

export type XrStudioExerciseReport = Readonly<{
  schema: typeof XR_STUDIO_EXERCISES_SCHEMA
  sceneRevision: number
  subjectId: string | null
  exercises: readonly XrStudioExercise[]
}>

const exercise = (id: XrStudioExercise['id'], title: string,
  state: XrStudioExercise['state'], feedback: string): XrStudioExercise =>
  Object.freeze({ id, title, state, feedback })

function distanceToCastPath(position: XrMotionReferenceVector, marks: readonly Readonly<{ position: XrMotionReferenceVector }>[]): number {
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 1; index < marks.length; index += 1) {
    const start = marks[index - 1]!.position
    const end = marks[index]!.position
    const dx = end[0] - start[0]
    const dz = end[2] - start[2]
    const lengthSquared = dx * dx + dz * dz
    const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((position[0] - start[0]) * dx + (position[2] - start[2]) * dz) / lengthSquared))
    nearest = Math.min(nearest, Math.hypot(position[0] - start[0] - fraction * dx, position[2] - start[2] - fraction * dz))
  }
  return nearest
}

/** Re-evaluate the authored plan at every revision; no parallel lesson or movement state is stored. */
export function evaluateXrStudioExercises(runtime: XrMotionReferenceRuntimeSnapshot): XrStudioExerciseReport {
  const plan = runtime.plan
  const track = plan.cast.find(candidate => candidate.actorId === runtime.selectedActorId && candidate.marks.length >= 2)
    || plan.cast.find(candidate => candidate.marks.length >= 2)
  const first = track?.marks[0]
  const last = track?.marks.at(-1)
  const displacement = first && last
    ? Math.hypot(last.position[0] - first.position[0], last.position[2] - first.position[2])
    : 0
  const moving = Boolean(track && displacement >= 0.5)
  const safe = moving && isXrConstrainedMotionPlanSafe({
    plan,
    sceneKey: runtime.sceneKey,
    subjectIds: [track!.actorId],
  })
  const obstacle = Boolean(track && plan.subjects.some(subject => subject.id !== track.actorId
    && !plan.cast.some(candidate => candidate.actorId === subject.id && candidate.marks.length > 1)
    && distanceToCastPath(subject.position, track.marks) <= 3))
  const matchingCamera = last && plan.camera.some(mark => mark.anchorId === track?.actorId
    && Math.abs(mark.timeSeconds - last.timeSeconds) <= 0.25)

  return Object.freeze({
    schema: XR_STUDIO_EXERCISES_SCHEMA,
    sceneRevision: runtime.revision,
    subjectId: track?.actorId || null,
    exercises: Object.freeze([
      exercise('reach-mark', 'Reach a mark', !moving ? 'needs-work' : safe ? 'passed' : 'blocked',
        !moving ? 'Add two cast marks at least 0.5 m apart.'
          : safe ? 'The selected subject reaches its final authored mark.'
            : 'The authored path is blocked by XR motion constraints.'),
      exercise('avoid-subject', 'Avoid an obstacle', !moving || !obstacle ? 'needs-work' : safe ? 'passed' : 'blocked',
        !moving ? 'Create a moving cast path first.'
          : !obstacle ? 'Place a stationary subject within 3 m of the cast path.'
            : safe ? 'The path passes the native subject collision check.'
              : 'Move the cast marks until the native collision check passes.'),
      exercise('sync-camera', 'Coordinate the camera', !moving || !matchingCamera ? 'needs-work' : safe ? 'passed' : 'blocked',
        !moving ? 'Create a moving cast path first.'
          : !matchingCamera ? 'Anchor a camera mark to this subject within 0.25 s of its final cast mark.'
            : safe ? 'The camera and final cast mark are timed together.'
              : 'Resolve the cast path constraint before rehearsing the camera mark.'),
    ]),
  })
}
