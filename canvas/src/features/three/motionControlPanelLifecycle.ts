import type { MotionControlSnapshot } from './motionControlRuntime'

type MotionControlPanelCloseSnapshot = Pick<MotionControlSnapshot, 'cameraActive' | 'phase'>

export function motionControlPanelCloseRequiresRuntimeStop(snapshot: MotionControlPanelCloseSnapshot): boolean {
  return snapshot.cameraActive || snapshot.phase !== 'off'
}
