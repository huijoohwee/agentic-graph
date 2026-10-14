import {
  XR_MOTION_REFERENCE_CAMERA_RIGS,
  type XrMotionReferenceCameraRig,
} from '@/features/three/xrMotionReferenceModel'
import { isXrCameraMovePresetId, type XrCameraMovePresetId } from '@/features/three/xrCameraMoveCatalog'
import { readThreeKeyboardMovementKeys, resolveThreeKeyboardCommandAmount, type ThreeKeyboardMovementKey } from '@/features/three/threeKeyboardChoreography'
import { CAMERA_ASPECT_RATIO_IDS, CAMERA_MAX_FOCUS_DISTANCE_METERS, CAMERA_MIN_FOCUS_DISTANCE_METERS, CAMERA_SENSOR_FORMAT_IDS, type CameraAspectRatioId, type CameraSensorFormatId } from './cameraOptics'
import { STRYBLDR_CAMERA_ANGLES, STRYBLDR_CAMERA_LEVELS, STRYBLDR_CAMERA_MAX_FOCAL_LENGTH_MM, STRYBLDR_CAMERA_MIN_FOCAL_LENGTH_MM, STRYBLDR_CAMERA_SHOTS, type StrybldrCameraAngle, type StrybldrCameraLevel, type StrybldrCameraShot } from './strybldrCamera'
import type { XrNativeControllerCameraMode } from '@/features/three/xrNativeControllerCameraCatalog'
import { isCameraSourceInvocation, normalizeCameraSourceSelection } from './cameraSourceMcpRuntime'
import { resolveCanonicalCameraInvocationTokens } from './cameraMcpInvocationCatalog'
import { buildCameraKeyboardInvocationFromTokens } from './cameraKeyboardInvocation'

export type CameraControlAction = 'select' | 'frame' | 'animate' | 'playback' | 'scrub'
export type CameraControlInput = Readonly<{
  invocation?: string
  action?: CameraControlAction
  cameraId?: XrNativeControllerCameraMode
  targetId?: string
  angle?: StrybldrCameraAngle
  level?: StrybldrCameraLevel
  shot?: StrybldrCameraShot
  sensorId?: CameraSensorFormatId
  focalLengthMm?: number
  focusDistanceMeters?: number
  aspectRatio?: CameraAspectRatioId
  rig?: XrMotionReferenceCameraRig
  moveId?: XrCameraMovePresetId
  moveDurationSeconds?: number
  timeSeconds?: number
  playing?: boolean
  keys?: readonly string[]
  amount?: number
  fine?: boolean
  markId?: string
}>
export type NormalizedCameraControl = Readonly<{
  action: CameraControlAction
  cameraId?: XrNativeControllerCameraMode
  targetId: string
  angle?: StrybldrCameraAngle
  level?: StrybldrCameraLevel
  shot?: StrybldrCameraShot
  sensorId?: CameraSensorFormatId
  focalLengthMm?: number
  focusDistanceMeters?: number
  aspectRatio?: CameraAspectRatioId
  rig?: XrMotionReferenceCameraRig
  moveId?: XrCameraMovePresetId
  moveDurationSeconds?: number
  timeSeconds?: number
  playing?: boolean
  keys: readonly ThreeKeyboardMovementKey[]
  amount?: number
  fine: boolean
  markId: string
  invocation: string
}>
const cleanTarget = (value: unknown): string => String(value || '').trim().replace(/^@+/, '')
function parseInvocationPairs(tokens: readonly string[], allowedKeys: readonly string[]): Readonly<Record<string, string>> | null {
  const entries: Array<readonly [string, string]> = []
  const seen = new Set<string>()
  for (const token of tokens) {
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) return null
    const key = token.slice(0, separator)
    const value = token.slice(separator + 1)
    if (!allowedKeys.includes(key) || seen.has(key)) return null
    seen.add(key)
    entries.push([key, value])
  }
  return Object.freeze(Object.fromEntries(entries))
}
export function buildCameraKeyboardInvocation(input: Readonly<{
  action: 'animate' | 'frame'
  keys: Iterable<string>
  amount?: number
  fine?: boolean
  markId?: string
  target?: 'camera' | 'selected-actor'
}>): string {
  const canonical = resolveCanonicalCameraInvocationTokens()
  return canonical ? buildCameraKeyboardInvocationFromTokens(canonical, input) : ''
}
function parseCameraInvocation(invocationValue: unknown): Partial<NormalizedCameraControl> | null {
  const invocation = String(invocationValue || '').trim()
  if (!invocation) return null
  const canonical = resolveCanonicalCameraInvocationTokens()
  if (!canonical) return null
  const tokens = invocation.split(/\s+/).filter(Boolean)
  const command = tokens[0]
  const action = command === canonical.frame
    ? 'frame'
    : command === canonical.animate
      ? 'animate'
      : command === canonical.playback
        ? 'playback'
        : command === canonical.scrub
          ? 'scrub'
          : null
  if (!action || tokens.slice(1).some(token => token.startsWith('/'))) return null
  const bindings = tokens.filter(token => token.startsWith('@'))
  const semantics = tokens.filter(token => token.startsWith('#'))
  const expectedSemantic = action === 'frame' ? canonical.cameraShot : canonical.cameraMotion
  const allowedBindings = action === 'frame' || action === 'animate'
    ? [canonical.camera, canonical.selectedActor]
    : [canonical.camera]
  if (bindings.length !== 1 || !allowedBindings.includes(bindings[0]!)
    || semantics.length !== 1 || semantics[0] !== expectedSemantic) return null
  const allowedPairKeys = action === 'frame'
    ? ['angle', 'level', 'shot', 'sensor', 'lens', 'focus', 'aspect', 'keys', 'amount', 'fine']
    : action === 'animate'
      ? ['angle', 'level', 'shot', 'sensor', 'lens', 'focus', 'aspect', 'rig', 'move', 'duration', 'time', 'keys', 'amount', 'fine', 'markId']
      : action === 'playback'
        ? ['state']
        : ['time']
  const pairs = parseInvocationPairs(
    tokens.slice(1).filter(token => !token.startsWith('@') && !token.startsWith('#')),
    allowedPairKeys,
  )
  if (!pairs) return null
  if (pairs.angle !== undefined && !STRYBLDR_CAMERA_ANGLES.includes(pairs.angle as StrybldrCameraAngle)) return null
  if (pairs.level !== undefined && !STRYBLDR_CAMERA_LEVELS.includes(pairs.level as StrybldrCameraLevel)) return null
  if (pairs.shot !== undefined && !STRYBLDR_CAMERA_SHOTS.includes(pairs.shot as StrybldrCameraShot)) return null
  if (pairs.sensor !== undefined && !CAMERA_SENSOR_FORMAT_IDS.includes(pairs.sensor as CameraSensorFormatId)) return null
  if (pairs.lens !== undefined && (!Number.isFinite(Number(pairs.lens)) || Number(pairs.lens) < STRYBLDR_CAMERA_MIN_FOCAL_LENGTH_MM || Number(pairs.lens) > STRYBLDR_CAMERA_MAX_FOCAL_LENGTH_MM)) return null
  if (pairs.focus !== undefined && (!Number.isFinite(Number(pairs.focus)) || Number(pairs.focus) < CAMERA_MIN_FOCUS_DISTANCE_METERS || Number(pairs.focus) > CAMERA_MAX_FOCUS_DISTANCE_METERS)) return null
  if (pairs.aspect !== undefined && !CAMERA_ASPECT_RATIO_IDS.includes(pairs.aspect as CameraAspectRatioId)) return null
  if (pairs.rig !== undefined && !XR_MOTION_REFERENCE_CAMERA_RIGS.includes(pairs.rig as XrMotionReferenceCameraRig)) return null
  if (pairs.move !== undefined && !isXrCameraMovePresetId(pairs.move)) return null
  if (pairs.duration !== undefined && (!Number.isFinite(Number(pairs.duration)) || Number(pairs.duration) < 0.25 || Number(pairs.duration) > 30)) return null
  if (pairs.duration !== undefined && pairs.move === undefined) return null
  if (pairs.move !== undefined && pairs.rig !== undefined) return null
  if (pairs.time !== undefined && (!Number.isFinite(Number(pairs.time)) || Number(pairs.time) < 0)) return null
  if (action === 'playback' && pairs.state !== 'play' && pairs.state !== 'pause') return null
  if (action === 'scrub' && pairs.time === undefined) return null
  const keys = pairs.keys === undefined ? null : readThreeKeyboardMovementKeys(pairs.keys.split('+'))
  const fine = pairs.fine === undefined ? false : pairs.fine === 'true'
  const hasKeyboardFields = pairs.keys !== undefined || pairs.amount !== undefined || pairs.fine !== undefined || pairs.markId !== undefined
  if (pairs.fine !== undefined && pairs.fine !== 'true' && pairs.fine !== 'false') return null
  if (pairs.markId !== undefined && !/^[a-zA-Z0-9:._-]+$/.test(pairs.markId)) return null
  if (hasKeyboardFields && !keys) return null
  if (keys && (pairs.angle || pairs.level || pairs.shot || pairs.sensor || pairs.lens || pairs.focus || pairs.aspect || pairs.rig || pairs.move || pairs.duration)) return null
  const amount = keys ? resolveThreeKeyboardCommandAmount({ amount: pairs.amount === undefined ? undefined : Number(pairs.amount), fine, target: 'camera' }) : null
  if (keys && amount === null) return null
  const targetId = bindings[0] === canonical.selectedActor ? 'selected-actor' : 'camera'
  const base = {
    targetId,
    angle: STRYBLDR_CAMERA_ANGLES.includes(pairs.angle as StrybldrCameraAngle) ? pairs.angle as StrybldrCameraAngle : undefined,
    level: STRYBLDR_CAMERA_LEVELS.includes(pairs.level as StrybldrCameraLevel) ? pairs.level as StrybldrCameraLevel : undefined,
    shot: STRYBLDR_CAMERA_SHOTS.includes(pairs.shot as StrybldrCameraShot) ? pairs.shot as StrybldrCameraShot : undefined,
    sensorId: CAMERA_SENSOR_FORMAT_IDS.includes(pairs.sensor as CameraSensorFormatId) ? pairs.sensor as CameraSensorFormatId : undefined,
    focalLengthMm: Number.isFinite(Number(pairs.lens)) ? Number(pairs.lens) : undefined,
    focusDistanceMeters: Number.isFinite(Number(pairs.focus)) ? Number(pairs.focus) : undefined,
    aspectRatio: CAMERA_ASPECT_RATIO_IDS.includes(pairs.aspect as CameraAspectRatioId) ? pairs.aspect as CameraAspectRatioId : undefined,
    rig: XR_MOTION_REFERENCE_CAMERA_RIGS.includes(pairs.rig as XrMotionReferenceCameraRig) ? pairs.rig as XrMotionReferenceCameraRig : undefined,
    moveId: isXrCameraMovePresetId(pairs.move) ? pairs.move : undefined,
    moveDurationSeconds: Number.isFinite(Number(pairs.duration)) ? Number(pairs.duration) : undefined,
    timeSeconds: Number.isFinite(Number(pairs.time)) ? Number(pairs.time) : undefined,
    keys: keys || Object.freeze([]),
    amount: amount ?? undefined,
    fine,
    markId: String(pairs.markId || '').trim(),
    invocation,
  }
  return { ...base, action, ...(action === 'playback' ? { playing: String(pairs.state || 'play') !== 'pause' } : {}) }
}
export function normalizeCameraControl(input: CameraControlInput): NormalizedCameraControl | null {
  const invocation = String(input.invocation || '').trim()
  const canonical = resolveCanonicalCameraInvocationTokens()
  if (canonical && (input.action === 'select' || input.cameraId !== undefined || isCameraSourceInvocation(invocation, canonical))) {
    const selection = normalizeCameraSourceSelection(input as Readonly<Record<string, unknown>>, canonical)
    return selection ? { ...selection, keys: Object.freeze([]), fine: false, markId: '' } as NormalizedCameraControl : null
  }
  if (input.angle !== undefined && !STRYBLDR_CAMERA_ANGLES.includes(input.angle as StrybldrCameraAngle)) return null
  if (input.level !== undefined && !STRYBLDR_CAMERA_LEVELS.includes(input.level as StrybldrCameraLevel)) return null
  if (input.shot !== undefined && !STRYBLDR_CAMERA_SHOTS.includes(input.shot as StrybldrCameraShot)) return null
  if (input.sensorId !== undefined && !CAMERA_SENSOR_FORMAT_IDS.includes(input.sensorId as CameraSensorFormatId)) return null
  if (input.rig !== undefined && !XR_MOTION_REFERENCE_CAMERA_RIGS.includes(input.rig as XrMotionReferenceCameraRig)) return null
  if (input.moveId !== undefined && !isXrCameraMovePresetId(input.moveId)) return null
  if (input.moveDurationSeconds !== undefined && (!Number.isFinite(input.moveDurationSeconds)
    || input.moveDurationSeconds < 0.25
    || input.moveDurationSeconds > 30)) return null
  if (input.focalLengthMm !== undefined && (!Number.isFinite(input.focalLengthMm)
    || Number(input.focalLengthMm) < STRYBLDR_CAMERA_MIN_FOCAL_LENGTH_MM
    || Number(input.focalLengthMm) > STRYBLDR_CAMERA_MAX_FOCAL_LENGTH_MM)) return null
  if (input.focusDistanceMeters !== undefined && (!Number.isFinite(input.focusDistanceMeters)
    || Number(input.focusDistanceMeters) < CAMERA_MIN_FOCUS_DISTANCE_METERS
    || Number(input.focusDistanceMeters) > CAMERA_MAX_FOCUS_DISTANCE_METERS)) return null
  if (input.aspectRatio !== undefined && !CAMERA_ASPECT_RATIO_IDS.includes(input.aspectRatio as CameraAspectRatioId)) return null
  if (input.timeSeconds !== undefined && (!Number.isFinite(input.timeSeconds) || Number(input.timeSeconds) < 0)) return null
  if (input.playing !== undefined && typeof input.playing !== 'boolean') return null
  if (input.fine !== undefined && typeof input.fine !== 'boolean') return null
  if (input.keys !== undefined && (!Array.isArray(input.keys) || input.keys.some(key => typeof key !== 'string'))) return null
  if (input.markId !== undefined && !/^[a-zA-Z0-9:._-]+$/.test(input.markId)) return null
  const parsed = parseCameraInvocation(invocation)
  if (invocation && !parsed) return null
  const action = parsed?.action || input.action
  if (!action || !['frame', 'animate', 'playback', 'scrub'].includes(action)) return null
  const moveId = parsed?.moveId || (isXrCameraMovePresetId(input.moveId) ? input.moveId : undefined)
  const moveDurationSeconds = Number.isFinite(parsed?.moveDurationSeconds)
    ? parsed?.moveDurationSeconds
    : Number.isFinite(input.moveDurationSeconds) ? Number(input.moveDurationSeconds) : undefined
  if (action !== 'animate' && (moveId || moveDurationSeconds !== undefined)) return null
  if (moveDurationSeconds !== undefined && !moveId) return null
  if (moveId && (parsed?.rig || input.rig)) return null
  if (!parsed && action === 'scrub' && input.timeSeconds === undefined) return null
  const parsedKeys = parsed?.keys?.length ? parsed.keys : null
  const keys = parsedKeys || (input.keys ? readThreeKeyboardMovementKeys(input.keys) : null)
  const fine = parsed?.fine ?? input.fine ?? false
  const hasKeyboardFields = input.keys !== undefined || input.amount !== undefined || input.fine !== undefined || input.markId !== undefined
  if (hasKeyboardFields && !keys) return null
  if (keys && action !== 'frame' && action !== 'animate') return null
  if (keys && (input.angle !== undefined || input.level !== undefined || input.shot !== undefined || input.sensorId !== undefined || input.focalLengthMm !== undefined || input.focusDistanceMeters !== undefined || input.aspectRatio !== undefined || input.rig !== undefined || input.moveId !== undefined || input.moveDurationSeconds !== undefined)) return null
  const amount = keys ? parsed?.amount ?? resolveThreeKeyboardCommandAmount({ amount: input.amount, fine, target: 'camera' }) : undefined
  if (keys && amount === null) return null
  const angle = parsed?.angle || (STRYBLDR_CAMERA_ANGLES.includes(input.angle as StrybldrCameraAngle) ? input.angle : undefined)
  const level = parsed?.level || (STRYBLDR_CAMERA_LEVELS.includes(input.level as StrybldrCameraLevel) ? input.level : undefined)
  const shot = parsed?.shot || (STRYBLDR_CAMERA_SHOTS.includes(input.shot as StrybldrCameraShot) ? input.shot : undefined)
  const sensorId = parsed?.sensorId || (CAMERA_SENSOR_FORMAT_IDS.includes(input.sensorId as CameraSensorFormatId) ? input.sensorId : undefined)
  const rig = parsed?.rig || (XR_MOTION_REFERENCE_CAMERA_RIGS.includes(input.rig as XrMotionReferenceCameraRig) ? input.rig : undefined)
  const focalLengthMm = Number.isFinite(parsed?.focalLengthMm) ? parsed?.focalLengthMm : Number.isFinite(input.focalLengthMm) ? Number(input.focalLengthMm) : undefined
  const focusDistanceMeters = Number.isFinite(parsed?.focusDistanceMeters) ? parsed?.focusDistanceMeters : Number.isFinite(input.focusDistanceMeters) ? Number(input.focusDistanceMeters) : undefined
  const aspectRatio = parsed?.aspectRatio || (CAMERA_ASPECT_RATIO_IDS.includes(input.aspectRatio as CameraAspectRatioId) ? input.aspectRatio : undefined)
  const timeSeconds = Number.isFinite(parsed?.timeSeconds) ? parsed?.timeSeconds : Number.isFinite(input.timeSeconds) ? Number(input.timeSeconds) : undefined
  return {
    action,
    targetId: cleanTarget(parsed?.targetId || input.targetId),
    angle,
    level,
    shot,
    sensorId,
    focalLengthMm,
    focusDistanceMeters,
    aspectRatio,
    rig,
    moveId,
    moveDurationSeconds,
    timeSeconds,
    playing: parsed?.playing ?? input.playing,
    keys: keys || Object.freeze([]),
    amount: amount ?? undefined,
    fine,
    markId: String(parsed?.markId || input.markId || '').trim(),
    invocation: String(parsed?.invocation || input.invocation || '').trim(),
  }
}

