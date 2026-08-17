import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
} from '@/features/strybldr/cameraFramingRuntime'
import { STRYBLDR_DEFAULT_CAMERA_SETTINGS } from '@/features/strybldr/strybldrCamera'
import { selectXrNativeControllerCameraMode } from '@/features/three/xrNativeControllerCameraRuntime'

const SHARED_CANVAS_CAMERA_ANCHOR_ID = 'canvas-camera'

export function applyXrRunReadyDefaultCameraFraming() {
  selectXrNativeControllerCameraMode('fixed-follow')
  const current = readCameraFramingRuntime()
  return publishCameraFramingRuntime({
    anchorId: current.anchorId || SHARED_CANVAS_CAMERA_ANCHOR_ID,
    settings: STRYBLDR_DEFAULT_CAMERA_SETTINGS,
    source: 'document',
  })
}
