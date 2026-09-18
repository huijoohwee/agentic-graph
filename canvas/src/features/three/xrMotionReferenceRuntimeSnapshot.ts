import type { XrMotionReferencePlan, XrMotionReferenceCameraRig } from './xrMotionReferenceModel'
import type { XrMotionReferenceMarkSelection } from './xrMotionReferenceSelection'

export type XrMotionReferenceRuntimeSnapshot = Readonly<{
  sceneKey: string
  sourceSignature: string
  plan: XrMotionReferencePlan
  selectedActorId: string
  selectedShotTargetId: string
  selectedCameraRig: XrMotionReferenceCameraRig
  selectedMark: XrMotionReferenceMarkSelection
  castMarkArmed: boolean
  playheadSeconds: number
  dirty: boolean
  revision: number
}>
