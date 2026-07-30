import {
  XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
  isXrNativeControllerCameraMode,
  type XrNativeControllerCameraMode,
} from './xrNativeControllerCameraCatalog'

export type XrNativeControllerCameraSnapshot = Readonly<{
  mode: XrNativeControllerCameraMode
  revision: number
}>

type Listener = () => void
const listeners = new Set<Listener>()
let snapshot: XrNativeControllerCameraSnapshot = Object.freeze({
  mode: XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
  revision: 0,
})

export function readXrNativeControllerCamera(): XrNativeControllerCameraSnapshot {
  return snapshot
}

export function subscribeXrNativeControllerCamera(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function selectXrNativeControllerCameraMode(
  mode: XrNativeControllerCameraMode,
): XrNativeControllerCameraSnapshot {
  if (!isXrNativeControllerCameraMode(mode) || snapshot.mode === mode) return snapshot
  snapshot = Object.freeze({ mode, revision: snapshot.revision + 1 })
  for (const listener of [...listeners]) listener()
  return snapshot
}
