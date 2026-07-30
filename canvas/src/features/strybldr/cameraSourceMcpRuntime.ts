import { useGraphStore } from '@/hooks/useGraphStore'
import {
  XR_NATIVE_CONTROLLER_CAMERA_OPTIONS,
  isXrNativeControllerCameraMode,
  type XrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraCatalog'
import {
  readXrNativeControllerCamera,
  selectXrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraRuntime'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { readThreeObjectInputOwnership } from '@/features/three/threeObjectInputOwnership'
import type { CanonicalCameraInvocationTokens } from './cameraMcpInvocationCatalog'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'

export type CameraSourceSelection = Readonly<{
  action: 'select'
  cameraId: XrNativeControllerCameraMode
  targetId: 'camera'
  invocation: string
}>

export const CAMERA_SOURCE_SELECTION_DEADLINE_MS = 1_000

export type CameraSourceSelectionClock = Readonly<{
  now: () => number
}>

export type InvalidCameraSourceValue = Readonly<{
  value: string
  token: string
}>

export type InvalidCameraSourceResult<T> = Readonly<{
  ok: false
  action: 'select'
  errorCode: 'CAMERA_SOURCE_INVALID_VALUE'
  message: string
  field: 'camera'
  token: string
  invalidValue: string
  camera: T
}>

export function isCameraSourceInvocation(
  invocation: string,
  canonical: CanonicalCameraInvocationTokens,
): boolean {
  return invocation.split(/\s+/, 1)[0] === canonical.select
}

export function normalizeCameraSourceSelection(
  input: Readonly<Record<string, unknown>>,
  canonical: CanonicalCameraInvocationTokens,
): CameraSourceSelection | null {
  const invocation = String(input.invocation || '').trim()
  if (invocation) {
    if (Object.keys(input).some(key => key !== 'invocation')) return null
    const tokens = invocation.split(/\s+/).filter(Boolean)
    if (tokens.length !== 4 || tokens[0] !== canonical.select) return null
    if (tokens[1] !== canonical.camera || tokens[2] !== canonical.cameraSemantic) return null
    const [key, value, extra] = tokens[3]!.split('=')
    if (key !== 'camera' || extra !== undefined || !isXrNativeControllerCameraMode(value)) return null
    return Object.freeze({ action: 'select', cameraId: value, targetId: 'camera', invocation })
  }
  if (Object.keys(input).some(key => !['action', 'cameraId', 'targetId'].includes(key))) return null
  if (input.action !== 'select' || !isXrNativeControllerCameraMode(input.cameraId)) return null
  const targetId = String(input.targetId || 'camera').replace(/^@+/, '')
  if (targetId !== 'camera') return null
  return Object.freeze({ action: 'select', cameraId: input.cameraId, targetId: 'camera', invocation: '' })
}

export function readInvalidCameraSourceValue(
  input: Readonly<Record<string, unknown>>,
  canonical: CanonicalCameraInvocationTokens,
): InvalidCameraSourceValue | null {
  const invocation = String(input.invocation || '').trim()
  if (invocation) {
    const tokens = invocation.split(/\s+/).filter(Boolean)
    if (tokens[0] !== canonical.select) return null
    const cameraTokens = tokens.filter(token => token.startsWith('camera='))
    if (cameraTokens.length !== 1) return null
    const value = cameraTokens[0]!.slice('camera='.length)
    return isXrNativeControllerCameraMode(value)
      ? null
      : Object.freeze({ value: value || '(missing)', token: cameraTokens[0]! })
  }
  if (input.action !== 'select' && !Object.hasOwn(input, 'cameraId')) return null
  return isXrNativeControllerCameraMode(input.cameraId)
    ? null
    : Object.freeze({
      value: input.cameraId === undefined ? '(missing)' : String(input.cameraId),
      token: `cameraId=${input.cameraId === undefined ? '' : String(input.cameraId)}`,
    })
}

export function rejectInvalidCameraSourceSelection<T>(
  input: Readonly<Record<string, unknown>>,
  canonical: CanonicalCameraInvocationTokens,
  inspect: () => T,
): InvalidCameraSourceResult<T> | null {
  const invalid = readInvalidCameraSourceValue(input, canonical)
  if (!invalid) return null
  return Object.freeze({
    ok: false,
    action: 'select',
    errorCode: 'CAMERA_SOURCE_INVALID_VALUE',
    message: `Invalid camera source value ${invalid.value}; choose fixed-follow or free-orbit.`,
    field: 'camera',
    token: invalid.token,
    invalidValue: invalid.value,
    camera: inspect(),
  })
}

export function inspectLocalCameraSource() {
  const state = useGraphStore.getState()
  const motion = readXrMotionReferenceRuntime()
  const selected = readXrNativeControllerCamera().mode
  const timelineCameraActive = state.canvasRenderMode === '3d'
    && state.canvas3dMode === 'xr'
    && state.timelineTransportPlaying === true
    && motion.plan.camera.length > 0
  return {
    selected,
    effectiveOwner: timelineCameraActive ? 'timeline-playback' : selected,
    inputSuspended: readThreeObjectInputOwnership().active,
    available: XR_NATIVE_CONTROLLER_CAMERA_OPTIONS.map(option => ({ ...option })),
  }
}

export function controlLocalCameraSource<T>(
  selection: CameraSourceSelection,
  inspect: () => T,
  clock: CameraSourceSelectionClock = {
    now: () => typeof performance === 'undefined' ? Date.now() : performance.now(),
  },
) {
  const startedAtMs = clock.now()
  const previousMode = readXrNativeControllerCamera().mode
  if (!activateXrSceneSurface({ panelView: 'camera', openPanel: true })) {
    const elapsedMs = Math.max(0, clock.now() - startedAtMs)
    return {
      ok: false,
      action: selection.action,
      message: 'Camera source selection requires an available shared XR Mode surface.',
      elapsedMs,
      deadlineMs: CAMERA_SOURCE_SELECTION_DEADLINE_MS,
      camera: inspect(),
    } as const
  }
  selectXrNativeControllerCameraMode(selection.cameraId)
  const elapsedMs = Math.max(0, clock.now() - startedAtMs)
  if (elapsedMs > CAMERA_SOURCE_SELECTION_DEADLINE_MS) {
    selectXrNativeControllerCameraMode(previousMode)
    return {
      ok: false,
      action: selection.action,
      errorCode: 'CAMERA_SOURCE_SELECTION_TIMEOUT',
      message: `XR camera source selection exceeded ${CAMERA_SOURCE_SELECTION_DEADLINE_MS} milliseconds.`,
      elapsedMs,
      deadlineMs: CAMERA_SOURCE_SELECTION_DEADLINE_MS,
      camera: inspect(),
    } as const
  }
  return {
    ok: true,
    action: selection.action,
    message: `XR camera source selected: ${selection.cameraId}.`,
    elapsedMs,
    deadlineMs: CAMERA_SOURCE_SELECTION_DEADLINE_MS,
    camera: inspect(),
  } as const
}
