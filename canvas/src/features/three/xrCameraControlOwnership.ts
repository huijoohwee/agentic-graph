import type { Canvas3dModeId } from '@/lib/config'

type XrCameraControlOwnershipArgs = Readonly<{
  mode: Canvas3dModeId
  xrEmptyWorld: boolean
  cameraMarkCount: number
}>

export function xrChoreographyCanDriveCamera(args: XrCameraControlOwnershipArgs): boolean {
  return args.mode === 'xr' && !args.xrEmptyWorld && args.cameraMarkCount > 0
}

export function xrChoreographyOwnsCamera(args: XrCameraControlOwnershipArgs & Readonly<{
  timelinePlaying: boolean
}>): boolean {
  return args.timelinePlaying && xrChoreographyCanDriveCamera(args)
}

export function xrCameraMarkPlaybackOwnsFraming(args: XrCameraControlOwnershipArgs & Readonly<{
  cameraMarkSelected: boolean
  timelinePlaying: boolean
}>): boolean {
  return xrChoreographyCanDriveCamera(args) && (args.timelinePlaying || args.cameraMarkSelected)
}
