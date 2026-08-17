import { useGraphStore } from '@/hooks/useGraphStore'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  serializeXrMotionReferencePlan,
  type XrMotionReferenceMark,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import {
  markXrMotionReferenceSaved,
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
  selectXrMotionReferenceCastMark,
  setXrMotionReferenceCastMarkArmed,
  setXrMotionReferencePlayhead,
  type XrMotionReferenceRuntimeSnapshot,
} from './xrMotionReferenceRuntime'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
  hydrateCanonicalXrPhysicsRuntime,
} from './XrMotionReferenceRuntimeBridge'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'
import {
  XR_ANIMATION_PRESETS,
  isXrAnimationPresetId,
  resolveXrAnimationPreset,
  xrAnimationPresetCompatible,
  type XrAnimationPreset,
  type XrAnimationPresetId,
} from './xrAnimationCatalog'
import { updateXrAnimationAssignment } from './xrAnimationAssignmentRuntime'
import { applyXrConstrainedCastMarkChoreography } from './xrConstrainedCastMarkRuntime'
import { motionControlPoseToAnimationPose } from './motionControlPose'
import { readMotionControlSnapshot } from './motionControlRuntime'
import { readBoundXrSelectedActorId, selectBoundXrActor, selectBoundXrShotTarget } from './xrSelectedActorBinding'
import { buildXrShotTargets, resolveXrShotTarget } from './xrShotTargets'
import { resolveXrSceneLibraryAsset } from './xrSceneLibrary'
import { xrMotionReferenceTimelineDocumentKey } from './xrMotionReferenceTimeline'
import { requestXrMotionReferenceCameraPlaybackReapply } from './xrCameraPlaybackControlsRuntime'

export const XR_SHARED_ASSET_CONTROL_SCHEMA = 'knowgrph-xr-shared-asset-controls/v1' as const
export type XrSharedAssetControlSurface = 'media' | 'motion-control' | 'timeline' | 'game-mode'
export type XrSharedAssetControlOperation =
  | 'select-target'
  | 'apply-animation'
  | 'clear-animation'
  | 'arm-gesture-mark'
  | 'disarm-gesture-mark'
  | 'capture-hand-pose'
  | 'play-timeline'
  | 'pause-timeline'
  | 'scrub-timeline'

export type XrSharedAssetControlTarget = Readonly<{
  id: string
  label: string
  kind: 'scene' | 'object'
  castActorId: string
}>

export type XrSharedAssetControlSnapshot = Readonly<{
  schema: typeof XR_SHARED_ASSET_CONTROL_SCHEMA
  sceneReady: boolean
  selectedTargetId: string
  selectedActorId: string
  selectedLabel: string
  selectedKind: 'scene' | 'object'
  targetCount: number
  subjectCount: number
  castCount: number
  targets: readonly XrSharedAssetControlTarget[]
  compatiblePresetIds: readonly XrAnimationPresetId[]
  assignedPresetId: XrAnimationPresetId | ''
  assignedPresetKind: XrAnimationPreset['kind'] | ''
  recommendedPresetId: XrAnimationPresetId | ''
  livePoseEligible: boolean
  livePoseActive: boolean
  selectedMarkId: string
  castMarkArmed: boolean
  playheadSeconds: number
  durationSeconds: number
  timelinePlaying: boolean
  revision: number
}>

export type XrSharedAssetControlInput = Readonly<{
  operation: XrSharedAssetControlOperation
  presetId?: string
  targetId?: string
  timeSeconds?: number
}>

export type XrSharedAssetControlResult = Readonly<{
  ok: boolean
  message: string
  operation: XrSharedAssetControlOperation
  targetId?: string
  presetId?: string
  snapshot: XrSharedAssetControlSnapshot
}>

function hydrateSharedXrControls(): boolean {
  if (!readXrSceneDocumentReady() || !hydrateCanonicalXrMotionReferenceRuntime()) return false
  hydrateCanonicalXrPhysicsRuntime()
  return true
}

function persistMotionPlan(previousRuntime: XrMotionReferenceRuntimeSnapshot): boolean {
  const state = useGraphStore.getState()
  const serialized = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
  state.updateGraphMetadata({ [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serialized })
  const saved = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
  if (saved === serialized) {
    markXrMotionReferenceSaved(serialized)
    return true
  }
  restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
  return false
}

function selectedActorId(runtime: XrMotionReferenceRuntimeSnapshot, targetIdValue = ''): string {
  const targetId = String(targetIdValue || '').trim()
  const target = targetId ? resolveXrShotTarget(runtime.plan, targetId) : null
  if (target?.castActorId) return target.castActorId
  if (targetId && runtime.plan.cast.some(track => track.actorId === targetId)) return targetId
  return readBoundXrSelectedActorId()
}

function castTrack(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string) {
  return runtime.plan.cast.find(track => track.actorId === actorId) || null
}

function compatibleAnimationPresets(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string): readonly XrAnimationPreset[] {
  const track = castTrack(runtime, actorId)
  if (!track) return []
  const subject = runtime.plan.subjects.find(candidate => candidate.id === actorId)
  return XR_ANIMATION_PRESETS.filter(preset => xrAnimationPresetCompatible({
    preset,
    assetId: subject?.assetId,
    category: subject?.category,
    graphActor: !subject,
  }))
}

function selectedOrNearestCastMark(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string): XrMotionReferenceMark | null {
  const track = castTrack(runtime, actorId)
  if (!track) return null
  if (runtime.selectedMark?.kind === 'cast' && runtime.selectedMark.actorId === actorId) {
    return track.marks.find(mark => mark.id === runtime.selectedMark?.markId) || null
  }
  return track.marks.reduce<XrMotionReferenceMark | null>((closest, mark) => {
    if (!closest) return mark
    return Math.abs(mark.timeSeconds - runtime.playheadSeconds) < Math.abs(closest.timeSeconds - runtime.playheadSeconds)
      ? mark
      : closest
  }, null)
}

function resolvePresetForApply(runtime: XrMotionReferenceRuntimeSnapshot, actorId: string, presetIdValue = ''): XrAnimationPreset | null {
  const compatible = compatibleAnimationPresets(runtime, actorId)
  if (presetIdValue && isXrAnimationPresetId(presetIdValue)) {
    const preset = resolveXrAnimationPreset(presetIdValue)
    return compatible.some(candidate => candidate.id === preset.id) ? preset : null
  }
  return compatible[0] || null
}

function timelineDocumentKey(): string {
  return xrMotionReferenceTimelineDocumentKey(useGraphStore.getState().markdownDocumentName)
}

export function inspectXrSharedAssetControls(): XrSharedAssetControlSnapshot {
  const runtime = readXrMotionReferenceRuntime()
  const sceneReady = readXrSceneDocumentReady()
  const targets = buildXrShotTargets(runtime.plan)
  const actorId = selectedActorId(runtime)
  const selectedTarget = targets.find(target => target.id === runtime.selectedShotTargetId)
    || targets.find(target => target.id === actorId)
    || targets[0]
  const selectedTargetId = selectedTarget?.id || ''
  const subject = runtime.plan.subjects.find(candidate => candidate.id === actorId)
  const track = castTrack(runtime, actorId)
  const assignedPreset = track?.animation ? resolveXrAnimationPreset(track.animation.presetId) : null
  const compatible = compatibleAnimationPresets(runtime, actorId)
  const recommendedPreset = compatible.find(preset => preset.id !== assignedPreset?.id) || compatible[0] || null
  const selectedAsset = subject ? resolveXrSceneLibraryAsset(subject.assetId) : null
  const motionPose = motionControlPoseToAnimationPose(readMotionControlSnapshot().pose)
  const mark = actorId ? selectedOrNearestCastMark(runtime, actorId) : null
  const state = useGraphStore.getState()
  return Object.freeze({
    schema: XR_SHARED_ASSET_CONTROL_SCHEMA,
    sceneReady,
    selectedTargetId,
    selectedActorId: actorId,
    selectedLabel: subject?.label || track?.label || selectedTarget?.label || 'Scene',
    selectedKind: selectedTarget?.kind || 'scene',
    targetCount: targets.length,
    subjectCount: runtime.plan.subjects.length,
    castCount: runtime.plan.cast.length,
    targets: Object.freeze(targets.map(target => Object.freeze({
      id: target.id,
      label: target.label,
      kind: target.kind,
      castActorId: target.castActorId || '',
    }))),
    compatiblePresetIds: Object.freeze(compatible.map(preset => preset.id)),
    assignedPresetId: assignedPreset?.id || '',
    assignedPresetKind: assignedPreset?.kind || '',
    recommendedPresetId: recommendedPreset?.id || '',
    livePoseEligible: Boolean(track && (!selectedAsset || selectedAsset.shape === 'humanoid')),
    livePoseActive: Boolean(motionPose && track && (!selectedAsset || selectedAsset.shape === 'humanoid')),
    selectedMarkId: mark?.id || '',
    castMarkArmed: runtime.castMarkArmed,
    playheadSeconds: runtime.playheadSeconds,
    durationSeconds: runtime.plan.durationSeconds,
    timelinePlaying: state.timelineTransportDocumentKey === timelineDocumentKey() && state.timelineTransportPlaying === true,
    revision: runtime.revision,
  })
}

export function controlXrSharedAssetControls(input: XrSharedAssetControlInput): XrSharedAssetControlResult {
  if (!hydrateSharedXrControls()) {
    return {
      ok: false,
      message: 'Open or create an XR document before controlling 3D for XR assets.',
      operation: input.operation,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'play-timeline' || input.operation === 'pause-timeline') {
    useGraphStore.getState().setTimelineTransportState({
      documentKey: timelineDocumentKey(),
      playing: input.operation === 'play-timeline',
    })
    if (input.operation === 'play-timeline') requestXrMotionReferenceCameraPlaybackReapply()
    return {
      ok: true,
      message: `XR timeline ${input.operation === 'play-timeline' ? 'started' : 'paused'}.`,
      operation: input.operation,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'scrub-timeline') {
    const runtime = readXrMotionReferenceRuntime()
    const bounded = Math.min(runtime.plan.durationSeconds, Math.max(0, Number(input.timeSeconds) || 0))
    setXrMotionReferencePlayhead(bounded)
    useGraphStore.getState().setTimelineTransportState({ documentKey: timelineDocumentKey(), position: bounded / 60 })
    requestXrMotionReferenceCameraPlaybackReapply()
    return {
      ok: true,
      message: `XR playhead moved to ${bounded.toFixed(2)}s.`,
      operation: input.operation,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  const runtime = readXrMotionReferenceRuntime()
  if (input.operation === 'select-target') {
    const targetId = String(input.targetId || '').trim()
    const target = resolveXrShotTarget(runtime.plan, targetId)
    if (!target) {
      return {
        ok: false,
        message: 'Select a valid 3D for XR target.',
        operation: input.operation,
        targetId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    selectBoundXrShotTarget(target.id)
    return {
      ok: true,
      message: `${target.label} selected for shared XR controls.`,
      operation: input.operation,
      targetId: target.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  const actorId = selectedActorId(runtime, input.targetId)
  const track = castTrack(runtime, actorId)
  if (!actorId || !track) {
    return {
      ok: false,
      message: 'Select an animatable 3D for XR object, subject, or prop first.',
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.targetId) selectBoundXrActor(actorId)

  if (input.operation === 'arm-gesture-mark' || input.operation === 'disarm-gesture-mark') {
    setXrMotionReferenceCastMarkArmed(input.operation === 'arm-gesture-mark')
    return {
      ok: true,
      message: `${track.label} gesture mark capture ${input.operation === 'arm-gesture-mark' ? 'armed' : 'disarmed'}.`,
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  const before = readXrMotionReferenceRuntime()
  if (input.operation === 'apply-animation') {
    const preset = resolvePresetForApply(before, actorId, input.presetId)
    if (!preset) {
      return {
        ok: false,
        message: `${track.label} has no compatible animation preset for this target.`,
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    const assignment = updateXrAnimationAssignment({
      operation: 'apply',
      presetId: preset.id,
      targetId: actorId,
      trackKind: preset.kind,
    })
    if (!assignment.ok) {
      return {
        ok: false,
        message: assignment.message,
        operation: input.operation,
        targetId: actorId,
        presetId: preset.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (!persistMotionPlan(before)) {
      return {
        ok: false,
        message: 'The shared XR animation could not be written to graph metadata.',
        operation: input.operation,
        targetId: actorId,
        presetId: preset.id,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (assignment.positionMarksChanged) hydrateCanonicalXrPhysicsRuntime()
    selectBoundXrActor(actorId)
    return {
      ok: true,
      message: assignment.message,
      operation: input.operation,
      targetId: actorId,
      presetId: preset.id,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'clear-animation') {
    if (!track.animation) {
      return {
        ok: false,
        message: `${track.label} has no animation to clear.`,
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    const assignment = updateXrAnimationAssignment({
      operation: 'clear',
      presetId: '',
      targetId: actorId,
      trackKind: track.animation.kind,
    })
    if (!assignment.ok) {
      return {
        ok: false,
        message: assignment.message,
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (!persistMotionPlan(before)) {
      return {
        ok: false,
        message: 'The shared XR animation clear could not be written to graph metadata.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (assignment.positionMarksChanged) hydrateCanonicalXrPhysicsRuntime()
    return {
      ok: true,
      message: assignment.message,
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  if (input.operation === 'capture-hand-pose') {
    const pose = motionControlPoseToAnimationPose(readMotionControlSnapshot().pose)
    const mark = selectedOrNearestCastMark(before, actorId)
    if (!pose || !mark) {
      return {
        ok: false,
        message: 'Start Motion Control and select a cast mark before capturing a hand pose.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    const nextPosition: XrMotionReferenceVector = Object.freeze([
      mark.position[0] + pose.rootOffsetMeters[0],
      Math.max(0, mark.position[1] + pose.rootOffsetMeters[1]),
      mark.position[2] + pose.rootOffsetMeters[2],
    ] as const)
    const applied = applyXrConstrainedCastMarkChoreography({
      actorId,
      markId: mark.id,
      position: nextPosition,
    })
    if (!applied.applied && applied.reason !== 'unchanged') {
      return {
        ok: false,
        message: applied.reason === 'physics-owned'
          ? 'Stop XR physics before writing a hand-pose keyframe.'
          : 'The hand-pose keyframe is obstructed by the authored XR scene.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    if (applied.applied && !persistMotionPlan(before)) {
      return {
        ok: false,
        message: 'The hand-pose keyframe could not be written to graph metadata.',
        operation: input.operation,
        targetId: actorId,
        snapshot: inspectXrSharedAssetControls(),
      }
    }
    selectXrMotionReferenceCastMark(actorId, mark.id)
    return {
      ok: true,
      message: applied.applied
        ? `Captured hand pose on ${track.label}.`
        : `${track.label} hand pose is already on this mark.`,
      operation: input.operation,
      targetId: actorId,
      snapshot: inspectXrSharedAssetControls(),
    }
  }

  return {
    ok: false,
    message: 'Unsupported shared XR asset control.',
    operation: input.operation,
    targetId: actorId,
    snapshot: inspectXrSharedAssetControls(),
  }
}
