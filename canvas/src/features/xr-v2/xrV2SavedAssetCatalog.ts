import {
  XR_V2_CAPTURE_STORAGE_TIMEOUT_MS,
  XR_V2_MAX_CAPTURE_BLOB_BYTES,
  type XrV2CaptureArtifactStore,
  type XrV2StoredCaptureFrame,
  type XrV2StoredCaptureFrameBundle,
} from './xrV2CaptureArtifactStore'
import {
  isXrV2PublishedSpatialAsset,
  type XrV2PublishedSpatialAsset,
  type XrV2SpatialAssetMetadata,
} from './xrV2SpatialAssetMetadata'
import { reportXrV2SavedAssetViewerObservation } from './xrV2WorkspaceReadinessRuntime'

export const XR_V2_SAVED_ASSET_LOAD_TIMEOUT_MS = XR_V2_CAPTURE_STORAGE_TIMEOUT_MS
export const XR_V2_PARALLAX_MAX_DIMENSION = 640

export type XrV2SavedAssetCatalogStore = Pick<XrV2CaptureArtifactStore,
  | 'listPublishedSpatialAssets'
  | 'readPublishedSpatialAsset'
  | 'readBlob'
  | 'readFrameBundle'
  | 'close'>

export type XrV2SavedSpatialAssetResource = Readonly<{
  asset: XrV2PublishedSpatialAsset
  rawClip: Blob
  frameBundle: XrV2StoredCaptureFrameBundle | null
  depthFrame: XrV2StoredCaptureFrame | null
}>

export type XrV2ParallaxPoint = Readonly<{ x: number; y: number }>

type ObservationReporter = (input: Readonly<{
  assetRef: string
  tier: 'pseudo-ar-depth-parallax' | 'flat-fallback'
  metadata: XrV2SpatialAssetMetadata
  mounted: boolean
}>) => unknown

function bounded<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) {
    return Promise.reject(new Error('saved asset timeout is outside the supported bound'))
  }
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
    operation.then(
      value => { clearTimeout(timeout); resolve(value) },
      error => { clearTimeout(timeout); reject(error) },
    )
  })
}

function requireLocalReference(label: string, value: string, kind: 'raw-clip' | 'frame-bundle'): string {
  const prefix = `indexeddb://knowgrph-xr-v2/${kind}/`
  if (typeof value !== 'string' || !value.startsWith(prefix) || value.length > 2_048) {
    throw new Error(`${label} must be a bounded local IndexedDB ${kind} reference`)
  }
  return value
}

export async function listXrV2SavedSpatialAssets(
  store: XrV2SavedAssetCatalogStore,
  timeoutMs = XR_V2_SAVED_ASSET_LOAD_TIMEOUT_MS,
): Promise<readonly XrV2PublishedSpatialAsset[]> {
  const assets = await bounded(store.listPublishedSpatialAssets(), timeoutMs, 'saved asset catalog load')
  return Object.freeze(assets
    .filter(isXrV2PublishedSpatialAsset)
    .sort((left, right) => right.created_at_ms - left.created_at_ms
      || left.asset_id.localeCompare(right.asset_id)))
}

function resolveDepthFrame(
  asset: XrV2PublishedSpatialAsset,
  frameBundle: XrV2StoredCaptureFrameBundle | null,
): XrV2StoredCaptureFrame | null {
  if (asset.metadata.xr_capability_tier !== 'pseudo-ar-depth-parallax') return null
  if (asset.metadata.synthesis_mode !== 'live' || asset.metadata.fallback_triggered) {
    return null
  }
  return frameBundle?.frames.find(candidate => candidate.estimate !== null) || null
}

export async function loadXrV2SavedSpatialAsset(
  store: XrV2SavedAssetCatalogStore,
  assetId: string,
  timeoutMs = XR_V2_SAVED_ASSET_LOAD_TIMEOUT_MS,
): Promise<XrV2SavedSpatialAssetResource> {
  const operation = (async () => {
    const asset = await store.readPublishedSpatialAsset(String(assetId || '').trim())
    if (!asset || !isXrV2PublishedSpatialAsset(asset)) {
      throw new Error('saved spatial asset was not found or failed validation')
    }
    const rawClipRef = requireLocalReference('raw_clip_ref', asset.raw_clip_ref, 'raw-clip')
    const rawClip = await store.readBlob(rawClipRef)
    if (!(rawClip instanceof Blob) || rawClip.size < 1 || rawClip.size > XR_V2_MAX_CAPTURE_BLOB_BYTES) {
      throw new Error('saved raw clip is missing or outside the admitted bound')
    }
    let frameBundle: XrV2StoredCaptureFrameBundle | null = null
    try {
      const depthMetadataRef = requireLocalReference(
        'depth_metadata_ref',
        asset.metadata.depth_metadata_ref || '',
        'frame-bundle',
      )
      const candidate = await store.readFrameBundle(depthMetadataRef)
      if (candidate?.sessionId === asset.session_id) frameBundle = candidate
    } catch {
      frameBundle = null
    }
    return Object.freeze({
      asset,
      rawClip,
      frameBundle,
      depthFrame: resolveDepthFrame(asset, frameBundle),
    })
  })()
  return bounded(operation, timeoutMs, 'saved asset load')
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function resolveXrV2ParallaxPoint(
  canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect'>,
  clientX: number,
  clientY: number,
): XrV2ParallaxPoint {
  const rect = canvas.getBoundingClientRect()
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || rect.width <= 0 || rect.height <= 0) {
    return Object.freeze({ x: 0, y: 0 })
  }
  return Object.freeze({
    x: clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
    y: clamp(((clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
  })
}

function outputDimensions(width: number, height: number): Readonly<{ width: number; height: number }> {
  const scale = Math.min(1, XR_V2_PARALLAX_MAX_DIMENSION / Math.max(width, height))
  return Object.freeze({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  })
}

export function drawXrV2DepthParallaxFrame(
  canvas: HTMLCanvasElement,
  stored: XrV2StoredCaptureFrame,
  point: XrV2ParallaxPoint,
): boolean {
  if (!canvas.isConnected || !stored.estimate) return false
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) return false
  const source = stored.frame
  const depth = stored.estimate.depth
  const target = outputDimensions(source.width, source.height)
  try {
    canvas.width = target.width
    canvas.height = target.height
    const output = context.createImageData(target.width, target.height)
    const maxShift = Math.max(2, Math.min(24, Math.round(Math.max(target.width, target.height) / 24)))
    for (let y = 0; y < target.height; y += 1) {
      const baseY = Math.min(source.height - 1, Math.floor(y * source.height / target.height))
      for (let x = 0; x < target.width; x += 1) {
        const baseX = Math.min(source.width - 1, Math.floor(x * source.width / target.width))
        const depthX = Math.min(depth.width - 1, Math.floor(baseX * depth.width / source.width))
        const depthY = Math.min(depth.height - 1, Math.floor(baseY * depth.height / source.height))
        const rawDepth = depth.values[depthY * depth.width + depthX]
        const layer = Number.isFinite(rawDepth) ? clamp(rawDepth, 0, 1) - 0.5 : 0
        const sourceX = clamp(Math.round(baseX - point.x * layer * maxShift), 0, source.width - 1)
        const sourceY = clamp(Math.round(baseY - point.y * layer * maxShift), 0, source.height - 1)
        const sourceOffset = (sourceY * source.width + sourceX) * 4
        const targetOffset = (y * target.width + x) * 4
        output.data[targetOffset] = source.data[sourceOffset]
        output.data[targetOffset + 1] = source.data[sourceOffset + 1]
        output.data[targetOffset + 2] = source.data[sourceOffset + 2]
        output.data[targetOffset + 3] = source.data[sourceOffset + 3]
      }
    }
    context.putImageData(output, 0, 0)
    return true
  } catch {
    return false
  }
}

export type XrV2SavedAssetViewerLease = Readonly<{
  presentationTier: 'pseudo-ar-depth-parallax' | 'flat-fallback'
  playbackUrl: string | null
  markFlatPlaybackCanPlay(): boolean
  markDepthParallaxDraw(canvasConnected: boolean, drawSucceeded: boolean): boolean
  release(): void
}>

export function createXrV2SavedAssetViewerLease(
  resource: XrV2SavedSpatialAssetResource,
  dependencies: Readonly<{
    createObjectUrl?: (blob: Blob) => string
    revokeObjectUrl?: (url: string) => void
    reportObservation?: ObservationReporter
    presentationTier?: 'pseudo-ar-depth-parallax' | 'flat-fallback'
  }> = {},
): XrV2SavedAssetViewerLease {
  const tier = dependencies.presentationTier
    || (resource.asset.metadata.xr_capability_tier === 'pseudo-ar-depth-parallax' && resource.depthFrame
      ? 'pseudo-ar-depth-parallax'
      : 'flat-fallback')
  const createObjectUrl = dependencies.createObjectUrl || (blob => URL.createObjectURL(blob))
  const revokeObjectUrl = dependencies.revokeObjectUrl || (url => URL.revokeObjectURL(url))
  const reportObservation = dependencies.reportObservation || reportXrV2SavedAssetViewerObservation
  const playbackUrl = tier === 'flat-fallback' ? createObjectUrl(resource.rawClip) : null
  let observed = false
  let released = false
  const observe = (expectedTier: 'pseudo-ar-depth-parallax' | 'flat-fallback') => {
    if (released || observed || tier !== expectedTier) return observed
    reportObservation({
      assetRef: resource.asset.asset_id,
      tier: expectedTier,
      metadata: resource.asset.metadata,
      mounted: true,
    })
    observed = true
    return true
  }
  return Object.freeze({
    presentationTier: tier,
    playbackUrl,
    markFlatPlaybackCanPlay: () => observe('flat-fallback'),
    markDepthParallaxDraw: (canvasConnected, drawSucceeded) => (
      canvasConnected && drawSucceeded && resource.depthFrame
        ? observe('pseudo-ar-depth-parallax')
        : false
    ),
    release: () => {
      if (released) return
      released = true
      try {
        if (observed && (tier === 'pseudo-ar-depth-parallax' || tier === 'flat-fallback')) {
          reportObservation({
            assetRef: resource.asset.asset_id,
            tier,
            metadata: resource.asset.metadata,
            mounted: false,
          })
        }
      } finally {
        if (playbackUrl) revokeObjectUrl(playbackUrl)
      }
    },
  })
}
