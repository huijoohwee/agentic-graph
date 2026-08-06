import {
  createXrV2IndexedDbArtifactStore,
  preflightXrV2IndexedDbArtifactStore,
  type XrV2CaptureArtifactStore,
} from './xrV2CaptureArtifactStore'
import {
  createXrV2LocalDepthInferenceAdapter,
  type XrV2LocalDepthInferenceAdapter,
} from './xrV2DepthInferenceRuntime'
import type { XrV2RgbaFrame } from './stereoSynthesis'
import {
  isXrV2PublishedSpatialAsset,
  type XrV2SpatialAssetMetadata,
} from './xrV2SpatialAssetMetadata'
import { readXrV2WorkspaceReadiness } from './xrV2WorkspaceReadinessRuntime'

export const XR_V2_SPATIAL_CAPTURE_OPERATION_TIMEOUT_MS = 5_000
export const XR_V2_SPATIAL_CAPTURE_PREPARE_TIMEOUT_MS = 5_000
export const XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS = 12_000

export type XrV2SpatialCaptureRuntimeTestDependencies = Partial<Readonly<{
  createStore: () => XrV2CaptureArtifactStore
  createDepthAdapter: () => XrV2LocalDepthInferenceAdapter
  preflightStore: () => Promise<true>
  captureFrame: (video: HTMLVideoElement) => XrV2RgbaFrame
  delay: (milliseconds: number, signal: AbortSignal) => Promise<void>
  now: () => number
  wallNow: () => number
  createObjectUrl: (blob: Blob) => string
  revokeObjectUrl: (url: string) => void
  canOfferUserActions: () => boolean
  operationTimeoutMs: number
  prepareTimeoutMs: number
  maxDurationMs: number
}>>

export type XrV2SpatialCaptureRuntimeDependencies =
  Required<XrV2SpatialCaptureRuntimeTestDependencies>

let samplingCanvas: HTMLCanvasElement | null = null

export function withXrV2Deadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds)
  })
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== null) clearTimeout(timer)
  })
}

export async function prepareXrV2DepthEstimatorOrRawFallback(
  adapter: XrV2LocalDepthInferenceAdapter,
  timeoutMs: number,
): Promise<XrV2LocalDepthInferenceAdapter> {
  try {
    await withXrV2Deadline(adapter.prepare(), timeoutMs, 'XR depth model preparation')
    return adapter
  } catch (error) {
    return Object.freeze({ ...adapter, estimate: async () => { throw error } })
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Capture interrupted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(), milliseconds)
    const finish = (error?: Error) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      error ? reject(error) : resolve()
    }
    const aborted = () => finish(new DOMException('Capture interrupted', 'AbortError'))
    signal.addEventListener('abort', aborted, { once: true })
  })
}

function captureRgbaFrame(video: HTMLVideoElement): XrV2RgbaFrame {
  const width = Math.max(1, Math.min(320, video.videoWidth))
  const height = Math.max(1, Math.round(video.videoHeight * (width / video.videoWidth)))
  const canvas = samplingCanvas || document.createElement('canvas')
  samplingCanvas = canvas
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D sampling is unavailable')
  context.drawImage(video, 0, 0, width, height)
  const image = context.getImageData(0, 0, width, height)
  return Object.freeze({ width, height, data: image.data.slice() })
}

export const XR_V2_DEFAULT_SPATIAL_CAPTURE_DEPENDENCIES:
XrV2SpatialCaptureRuntimeDependencies = Object.freeze({
  createStore: createXrV2IndexedDbArtifactStore,
  createDepthAdapter: createXrV2LocalDepthInferenceAdapter,
  preflightStore: () => preflightXrV2IndexedDbArtifactStore(),
  captureFrame: captureRgbaFrame,
  delay: abortableDelay,
  now: () => performance.now(),
  wallNow: () => Date.now(),
  createObjectUrl: blob => URL.createObjectURL(blob),
  revokeObjectUrl: url => URL.revokeObjectURL(url),
  canOfferUserActions: () => readXrV2WorkspaceReadiness().canOfferUserActions,
  operationTimeoutMs: XR_V2_SPATIAL_CAPTURE_OPERATION_TIMEOUT_MS,
  prepareTimeoutMs: XR_V2_SPATIAL_CAPTURE_PREPARE_TIMEOUT_MS,
  maxDurationMs: XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS,
})

export function waitForXrV2VideoFrame(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Camera preview did not become ready')), 5_000)
    const finish = (error?: Error) => {
      clearTimeout(timer)
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
      error ? reject(error) : resolve()
    }
    const ready = () => finish()
    const failed = () => finish(new Error('Camera preview failed to load'))
    const aborted = () => finish(new DOMException('Capture interrupted', 'AbortError'))
    video.addEventListener('loadeddata', ready, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
  })
}

export function verifyXrV2PublishedAsset(
  stored: unknown,
  expectedMetadata: XrV2SpatialAssetMetadata,
): void {
  if (!isXrV2PublishedSpatialAsset(stored)
    || JSON.stringify(stored.metadata) !== JSON.stringify(expectedMetadata)) {
    throw new Error('Durable XR asset metadata read-back did not match the exact pinned contract')
  }
}

export function resetXrV2SamplingCanvas(): void {
  samplingCanvas = null
}
