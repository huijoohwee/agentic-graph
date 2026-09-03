import type { XrSessionMode } from '@/lib/three/ThreeGraphXrSessionPolicy'
import type { XrV2SpatialAssetMetadata } from './xrV2SpatialAssetMetadata'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'
import { reportXrV2SavedAssetImmersiveRenderObservation } from './xrV2WorkspaceReadinessRuntime'
import {
  createXrV2TemporalEvidenceGate,
  resolveXrV2TemporalDepthSequence,
} from './xrV2SavedAssetTemporalPlayback'

export const XR_V2_SAVED_ASSET_PRESENTATION_SCHEMA =
  'agentic-graph-xr-v2-saved-asset-presentation/v1' as const

export type XrV2SavedAssetPresentationSnapshot = Readonly<{
  schema: typeof XR_V2_SAVED_ASSET_PRESENTATION_SCHEMA
  selected: XrV2SavedSpatialAssetResource | null
  revision: number
}>

type ImmersiveRenderReporter = (input: Readonly<{
  assetRef: string
  mode: XrSessionMode
  metadata: XrV2SpatialAssetMetadata
  mounted: boolean
}>) => unknown

const listeners = new Set<() => void>()
let selectionToken: symbol | null = null
let snapshot: XrV2SavedAssetPresentationSnapshot = Object.freeze({
  schema: XR_V2_SAVED_ASSET_PRESENTATION_SCHEMA,
  selected: null,
  revision: 0,
})

function publish(selected: XrV2SavedSpatialAssetResource | null): void {
  snapshot = Object.freeze({
    schema: XR_V2_SAVED_ASSET_PRESENTATION_SCHEMA,
    selected,
    revision: snapshot.revision + 1,
  })
  for (const listener of listeners) listener()
}

export function selectXrV2SavedAssetForPresentation(
  resource: XrV2SavedSpatialAssetResource,
): () => void {
  const token = Symbol(resource.asset.asset_id)
  selectionToken = token
  publish(resource)
  return () => {
    if (selectionToken !== token) return
    selectionToken = null
    publish(null)
  }
}

export function readXrV2SavedAssetPresentation(): XrV2SavedAssetPresentationSnapshot {
  return snapshot
}

export function subscribeXrV2SavedAssetPresentation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type XrV2SavedAssetImmersiveRenderGate = Readonly<{
  observe(input: Readonly<{
    selectedAssetId: string | null
    mode: XrSessionMode | null
    canvasConnected: boolean
    textureBound: boolean
    renderFrame: number
    frameIndex: number
    capturedAtMs: number
  }>): boolean
  release(): void
}>

export function createXrV2SavedAssetImmersiveRenderGate(input: Readonly<{
  resource: XrV2SavedSpatialAssetResource
  mode: XrSessionMode
  baselineRenderFrame: number
  reportObservation?: ImmersiveRenderReporter
}>): XrV2SavedAssetImmersiveRenderGate {
  const report = input.reportObservation || reportXrV2SavedAssetImmersiveRenderObservation
  const assetRef = input.resource.asset.asset_id
  const temporalSequence = resolveXrV2TemporalDepthSequence(input.resource)
  const temporalEvidence = createXrV2TemporalEvidenceGate(temporalSequence?.frames)
  let observed = false
  let released = false
  let lastRenderFrame = input.baselineRenderFrame
  return Object.freeze({
    observe: evidence => {
      if (released || !temporalSequence
        || evidence.selectedAssetId !== assetRef || evidence.mode !== input.mode
        || !evidence.canvasConnected || !evidence.textureBound
        || !Number.isSafeInteger(evidence.renderFrame)
        || evidence.renderFrame <= lastRenderFrame) return false
      if (observed) {
        lastRenderFrame = evidence.renderFrame
        return true
      }
      lastRenderFrame = evidence.renderFrame
      if (!temporalEvidence.observe(evidence.frameIndex, evidence.capturedAtMs)) return false
      report({
        assetRef,
        mode: input.mode,
        metadata: input.resource.asset.metadata,
        mounted: true,
      })
      observed = true
      return true
    },
    release: () => {
      if (released) return
      released = true
      if (observed) report({
        assetRef,
        mode: input.mode,
        metadata: input.resource.asset.metadata,
        mounted: false,
      })
    },
  })
}
