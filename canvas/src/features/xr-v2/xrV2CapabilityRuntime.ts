import {
  detectBrowserCameraCaptureAvailable,
  detectBrowserMotionCaptureAvailable,
  detectBrowserNativeHandoffAvailable,
  resolveXrCapabilitySnapshot,
  type XrSessionMode,
  type XrSessionSupport,
} from '@/lib/three/ThreeGraphXrSessionPolicy'
import {
  resolveXrV2CapabilityDecision,
  type XrV2CapabilityDecision,
  type XrV2NegativePlatformConstraint,
} from './capabilityContract'

export const XR_V2_BROWSER_CAPABILITY_OBSERVATION_SCHEMA =
  'agenticgraph-xr-v2-browser-capability-observation/v1' as const

type BrowserXrSystem = Readonly<{
  isSessionSupported?: (mode: XrSessionMode) => Promise<boolean>
}>

type NavigatorWithXr = Navigator & Readonly<{
  xr?: BrowserXrSystem
  userAgentData?: Readonly<{ platform?: string }>
}>

export type XrV2BrowserCapabilityObservation = Readonly<{
  schema: typeof XR_V2_BROWSER_CAPABILITY_OBSERVATION_SCHEMA
  status: 'ready'
  decision: XrV2CapabilityDecision
  sessionSupport: Readonly<XrSessionSupport>
  probesCompleted: true
  cameraPermissionRequested: false
  sensorPermissionRequested: false
}>

function detectIosClass(navigatorValue: NavigatorWithXr | null): boolean {
  if (!navigatorValue) return false
  const platform = String(
    navigatorValue.userAgentData?.platform || navigatorValue.platform || '',
  ).trim()
  if (/^(?:iphone|ipad|ipod)$/i.test(platform)) return true
  // iPadOS may advertise a desktop platform. This fact is negative-only: it
  // can suppress WebXR but never admits a feature or tier.
  return /^mac/i.test(platform) && Number(navigatorValue.maxTouchPoints || 0) > 1
}

async function observeSessionSupport(
  xr: BrowserXrSystem | undefined,
): Promise<Readonly<XrSessionSupport>> {
  if (typeof xr?.isSessionSupported !== 'function') return Object.freeze({})
  const support: XrSessionSupport = {}
  for (const mode of ['immersive-ar', 'immersive-vr'] as const) {
    try {
      support[mode] = await xr.isSessionSupported(mode) === true
    } catch {
      support[mode] = false
    }
  }
  return Object.freeze({ ...support })
}

/**
 * Runs feature probes only. It never requests an immersive session, camera,
 * motion/orientation permission, or native handoff.
 */
export async function probeXrV2BrowserCapability(options: Readonly<{
  navigator?: NavigatorWithXr | null
  depthParallaxAssetAdmitted: boolean
  iosClass?: boolean
}>): Promise<XrV2BrowserCapabilityObservation> {
  const navigatorValue = options.navigator === undefined
    ? (typeof navigator === 'undefined' ? null : navigator as NavigatorWithXr)
    : options.navigator
  const sessionSupport = await observeSessionSupport(navigatorValue?.xr)
  const immersiveMode: XrSessionMode | null = sessionSupport['immersive-ar']
    ? 'immersive-ar'
    : sessionSupport['immersive-vr'] ? 'immersive-vr' : null
  const negativePlatformConstraint: XrV2NegativePlatformConstraint =
    (options.iosClass ?? detectIosClass(navigatorValue))
      ? 'ios-webxr-unavailable'
      : 'none'
  const capability = resolveXrCapabilitySnapshot({
    surfaceKind: 'spatial-capture',
    sessionSupport,
    monocularCapture: navigatorValue === null
      ? false
      : detectBrowserCameraCaptureAvailable(),
    captureMotion: navigatorValue === null
      ? false
      : detectBrowserMotionCaptureAvailable(),
    nativeHandoff: navigatorValue === null
      ? false
      : detectBrowserNativeHandoffAvailable(),
  })
  const decision = resolveXrV2CapabilityDecision({
    capability,
    immersiveMode,
    negativePlatformConstraint,
    depthParallaxAssetAdmitted: options.depthParallaxAssetAdmitted,
  })
  return Object.freeze({
    schema: XR_V2_BROWSER_CAPABILITY_OBSERVATION_SCHEMA,
    status: 'ready',
    decision,
    sessionSupport,
    probesCompleted: true,
    cameraPermissionRequested: false,
    sensorPermissionRequested: false,
  })
}
