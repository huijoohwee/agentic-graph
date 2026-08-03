import type {
  XrCapabilityEntryMode,
  XrCapabilitySnapshot,
} from '../../lib/three/ThreeGraphXrSessionPolicy'
import { XR_V2_CONTRACT_VERSION } from './captureContracts'

export const XR_V2_CAPABILITY_PROJECTION_SCHEMA = 'knowgrph-xr-capability-projection/v2' as const

export const XR_V2_ENTRY_MODES = [
  'immersive-session',
  'inline-viewer',
  'monocular-capture',
  'native-handoff',
  'unsupported',
] as const satisfies readonly XrCapabilityEntryMode[]

export type XrV2CapturePipelineAvailability =
  | 'live-depth-preview'
  | 'raw-capture'
  | 'unavailable'

export type XrV2CapabilityProjection = Readonly<{
  schema: typeof XR_V2_CAPABILITY_PROJECTION_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  entryMode: XrCapabilityEntryMode
  capturePipeline: XrV2CapturePipelineAvailability
  cameraPermission: 'explicit-user-action-required' | 'unavailable'
  canStartMonocularCapture: boolean
}>

/**
 * Projects the v2 capture contract without replacing the canonical five-mode
 * entry decision. Model readiness is deliberately injected and never inferred
 * from a device, browser name, or user-agent string.
 */
export function resolveXrV2CapabilityProjection(input: Readonly<{
  capability: XrCapabilitySnapshot
  depthEstimatorAvailable: boolean
}>): XrV2CapabilityProjection {
  const canStartMonocularCapture = input.capability.monocular_capture
  const capturePipeline: XrV2CapturePipelineAvailability = !canStartMonocularCapture
    ? 'unavailable'
    : input.depthEstimatorAvailable ? 'live-depth-preview' : 'raw-capture'

  return Object.freeze({
    schema: XR_V2_CAPABILITY_PROJECTION_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    entryMode: input.capability.recommended_entry_mode,
    capturePipeline,
    cameraPermission: canStartMonocularCapture
      ? 'explicit-user-action-required'
      : 'unavailable',
    canStartMonocularCapture,
  })
}
