import type { WebGLRenderer } from 'three'

export type XrSessionMode = 'immersive-ar' | 'immersive-vr'
export type XrCapabilityEntryMode =
  | 'immersive-session'
  | 'inline-viewer'
  | 'monocular-capture'
  | 'native-handoff'
  | 'unsupported'
export type XrCapabilityReasonCode =
  | 'inline_viewer_unavailable'
  | 'immersive_viewer_unavailable'
  | 'monocular_capture_unavailable'
  | 'capture_motion_unavailable'
  | 'native_handoff_unavailable'

export type XrSessionReferenceSpaceKind = 'local-floor' | 'local'

export type XrSessionReferenceSpace<TSpace extends object = object> = Readonly<{
  kind: XrSessionReferenceSpaceKind
  space: TSpace
}>

export type XrSessionSupport = Partial<Record<XrSessionMode, boolean>>

export type XrCapabilitySnapshot = Readonly<{
  schema: 'agenticgraph-xr-capability-snapshot/v1'
  inline_viewer: boolean
  immersive_viewer: boolean
  monocular_capture: boolean
  capture_motion: boolean
  native_handoff: boolean
  recommended_entry_mode: XrCapabilityEntryMode
  reason_codes: readonly XrCapabilityReasonCode[]
}>

export type XrSessionInit = {
  optionalFeatures: string[]
  domOverlay?: { root: Element }
}

export const XR_SESSION_MODE_ORDER: readonly XrSessionMode[] = ['immersive-ar', 'immersive-vr']
export const XR_SESSION_REFERENCE_SPACE_ORDER: readonly XrSessionReferenceSpaceKind[] = ['local-floor', 'local']

const XR_BASE_OPTIONAL_FEATURES = ['local-floor', 'bounded-floor', 'hand-tracking'] as const
const XR_AR_OPTIONAL_FEATURES = ['hit-test', 'light-estimation'] as const

export function chooseXrSessionMode(support: XrSessionSupport, current?: XrSessionMode): XrSessionMode | null {
  if (current && support[current] === true) return current
  return XR_SESSION_MODE_ORDER.find(mode => support[mode] === true) || null
}

export function detectBrowserCameraCaptureAvailable(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.mediaDevices?.getUserMedia === 'function'
}

export function detectBrowserMotionCaptureAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window
}

export function detectBrowserNativeHandoffAvailable(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof (navigator as Navigator & { share?: unknown }).share === 'function'
}

export function resolveXrCapabilitySnapshot(input: Readonly<{
  surfaceKind: 'graph' | 'spatial-capture'
  sessionSupport: XrSessionSupport
  inlineViewer?: boolean
  monocularCapture?: boolean
  captureMotion?: boolean
  nativeHandoff?: boolean
}>): XrCapabilitySnapshot {
  const inline_viewer = input.inlineViewer !== false
  const immersive_viewer = chooseXrSessionMode(input.sessionSupport) !== null
  const monocular_capture = input.monocularCapture === true
  const capture_motion = input.captureMotion === true
  const native_handoff = input.nativeHandoff === true
  let recommended_entry_mode: XrCapabilityEntryMode = 'unsupported'
  if (immersive_viewer) {
    recommended_entry_mode = 'immersive-session'
  } else if (inline_viewer && input.surfaceKind === 'spatial-capture' && monocular_capture) {
    recommended_entry_mode = 'monocular-capture'
  } else if (inline_viewer) {
    recommended_entry_mode = 'inline-viewer'
  } else if (native_handoff) {
    recommended_entry_mode = 'native-handoff'
  }
  const reason_codes: XrCapabilityReasonCode[] = []
  if (!inline_viewer) reason_codes.push('inline_viewer_unavailable')
  if (!immersive_viewer) reason_codes.push('immersive_viewer_unavailable')
  if (!monocular_capture) reason_codes.push('monocular_capture_unavailable')
  if (!capture_motion) reason_codes.push('capture_motion_unavailable')
  if (!native_handoff) reason_codes.push('native_handoff_unavailable')
  return {
    schema: 'agenticgraph-xr-capability-snapshot/v1',
    inline_viewer,
    immersive_viewer,
    monocular_capture,
    capture_motion,
    native_handoff,
    recommended_entry_mode,
    reason_codes,
  }
}

export function buildXrSessionInit(mode: XrSessionMode, domOverlayRoot?: Element | null): XrSessionInit {
  const optionalFeatures = new Set<string>(XR_BASE_OPTIONAL_FEATURES)
  const init: XrSessionInit = { optionalFeatures: Array.from(optionalFeatures) }
  if (mode === 'immersive-ar') {
    for (const feature of XR_AR_OPTIONAL_FEATURES) optionalFeatures.add(feature)
    if (domOverlayRoot) {
      optionalFeatures.add('dom-overlay')
      init.domOverlay = { root: domOverlayRoot }
    }
  }
  init.optionalFeatures = Array.from(optionalFeatures)
  return init
}

export async function requestPreferredXrReferenceSpace<TSpace extends object>(session: {
  requestReferenceSpace?: (kind: XrSessionReferenceSpaceKind) => Promise<TSpace>
}): Promise<XrSessionReferenceSpace<TSpace>> {
  if (!session.requestReferenceSpace) throw new Error('XR reference spaces are unavailable')
  let lastError: unknown = null
  for (const kind of XR_SESSION_REFERENCE_SPACE_ORDER) {
    try {
      return { kind, space: await session.requestReferenceSpace(kind) }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('No supported XR reference space was found')
}

export function resolveXrDomOverlayRoot(renderer: WebGLRenderer | null): Element | null {
  if (typeof document === 'undefined') return null
  return renderer?.domElement?.parentElement || document.body || null
}
