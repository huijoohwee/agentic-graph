export const XR_NATIVE_CONTROLLER_CAMERA_MODES = ['fixed-follow', 'free-orbit'] as const

export type XrNativeControllerCameraMode = (typeof XR_NATIVE_CONTROLLER_CAMERA_MODES)[number]
export const XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE = XR_NATIVE_CONTROLLER_CAMERA_MODES[0]

export type XrNativeControllerCameraOption = Readonly<{
  id: XrNativeControllerCameraMode
  label: string
  description: string
}>

export const XR_NATIVE_CONTROLLER_CAMERA_OPTIONS: readonly XrNativeControllerCameraOption[] = Object.freeze([
  Object.freeze({
    id: 'fixed-follow',
    label: 'Fixed Follow',
    description: 'Stage-aware framing follows the active Physics controller or Flight aircraft.',
  }),
  Object.freeze({
    id: 'free-orbit',
    label: 'Free Orbit',
    description: 'Orbit, pan, and zoom the shared canvas camera manually.',
  }),
])

export function isXrNativeControllerCameraMode(value: unknown): value is XrNativeControllerCameraMode {
  return XR_NATIVE_CONTROLLER_CAMERA_MODES.includes(value as XrNativeControllerCameraMode)
}

export function resolveXrNativeControllerCameraOption(
  value: unknown,
): XrNativeControllerCameraOption {
  return XR_NATIVE_CONTROLLER_CAMERA_OPTIONS.find(option => option.id === value)
    || XR_NATIVE_CONTROLLER_CAMERA_OPTIONS.find(
      option => option.id === XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
    )!
}
