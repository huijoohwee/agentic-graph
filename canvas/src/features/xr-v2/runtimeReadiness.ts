import type { XrCapabilityEntryMode } from '@/lib/three/ThreeGraphXrSessionPolicy'
import { XR_V2_CONTRACT_VERSION } from './captureContracts'

export { XR_V2_CONTRACT_VERSION } from './captureContracts'

export type XrV2EvidenceState = 'source-backed' | 'runtime-backed' | 'blocked'

export type XrV2ReadinessSnapshot = Readonly<{
  schema: 'knowgrph-xr-v2-readiness/v1'
  version: typeof XR_V2_CONTRACT_VERSION
  entryMode: XrCapabilityEntryMode
  overall: 'source-ready' | 'runtime-ready'
  evidence: Readonly<{
    capabilityDetection: XrV2EvidenceState
    captureFallback: XrV2EvidenceState
    liveDepthSynthesis: XrV2EvidenceState
    authoringAdapters: XrV2EvidenceState
    browserPlayback: XrV2EvidenceState
    physicalDevice: XrV2EvidenceState
  }>
  blockedReasons: readonly string[]
}>

export function createXrV2ReadinessSnapshot(input: Readonly<{
  entryMode: XrCapabilityEntryMode
  depthModelLoaded?: boolean
  referenceDeviceProven?: boolean
  browserPlaybackProven?: boolean
  physicalDeviceProven?: boolean
}>): XrV2ReadinessSnapshot {
  const liveDepthSynthesis = input.depthModelLoaded && input.referenceDeviceProven
    ? 'runtime-backed'
    : 'blocked'
  const browserPlayback = input.browserPlaybackProven ? 'runtime-backed' : 'blocked'
  const physicalDevice = input.physicalDeviceProven ? 'runtime-backed' : 'blocked'
  const blockedReasons: string[] = []
  if (!input.depthModelLoaded) blockedReasons.push('same-origin depth model assets are not admitted')
  if (!input.referenceDeviceProven) blockedReasons.push('reference-device frame-budget proof is absent')
  if (!input.browserPlaybackProven) blockedReasons.push('browser playback smoke is absent')
  if (!input.physicalDeviceProven) blockedReasons.push('physical XR device proof is absent')
  return Object.freeze({
    schema: 'knowgrph-xr-v2-readiness/v1',
    version: XR_V2_CONTRACT_VERSION,
    entryMode: input.entryMode,
    overall: blockedReasons.length === 0 ? 'runtime-ready' : 'source-ready',
    evidence: Object.freeze({
      capabilityDetection: 'source-backed',
      captureFallback: 'source-backed',
      liveDepthSynthesis,
      authoringAdapters: 'source-backed',
      browserPlayback,
      physicalDevice,
    }),
    blockedReasons: Object.freeze(blockedReasons),
  })
}
