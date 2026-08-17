import { selectXrNativeControllerCameraMode } from '@/features/three/xrNativeControllerCameraRuntime'

export function applyXrRunReadyDefaultCameraSource() {
  return selectXrNativeControllerCameraMode('fixed-follow')
}
