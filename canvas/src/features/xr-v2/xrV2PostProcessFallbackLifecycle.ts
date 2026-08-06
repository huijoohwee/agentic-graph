import {
  createXrV2IndexedDbArtifactStore,
  type XrV2CaptureArtifactStore,
} from './xrV2CaptureArtifactStore'
import {
  createXrV2LocalDepthInferenceAdapter,
  type XrV2LocalDepthInferenceAdapter,
} from './xrV2DepthInferenceRuntime'
import {
  XR_V2_POST_PROCESS_FALLBACK_SCHEMA,
  createXrV2PostProcessStoppedEvent,
  runXrV2PostProcessFallbackPass,
  type XrV2PostProcessFallbackDependencies,
  type XrV2PostProcessFallbackEvent,
  type XrV2PostProcessFallbackSnapshot,
  type XrV2PostProcessStereoPackage,
} from './xrV2PostProcessFallbackRuntime'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'
import { createXrV2SavedAssetEncodedTrackFixture } from './xrV2SavedAssetPackagingRuntime'

type RuntimeDefaults = Readonly<{
  createStore: () => XrV2CaptureArtifactStore
  createDepthAdapter: () => XrV2LocalDepthInferenceAdapter
  packageStereo: XrV2PostProcessFallbackDependencies['packageStereo']
  now: () => number
}>

export const XR_V2_POST_PROCESS_MAX_JOBS_PER_SCAN_REQUEST = 32

async function defaultPackageStereo(
  resource: XrV2SavedSpatialAssetResource,
  signal: AbortSignal,
): Promise<XrV2PostProcessStereoPackage> {
  const fixture = await createXrV2SavedAssetEncodedTrackFixture(resource, signal)
  if (!fixture.exactPayloadsVerified) throw new Error('post-process WebM payload verification failed')
  return Object.freeze({ blob: fixture.blob, trackCount: fixture.inventory.tracks.length })
}

const productionDefaults: RuntimeDefaults = Object.freeze({
  createStore: createXrV2IndexedDbArtifactStore,
  createDepthAdapter: createXrV2LocalDepthInferenceAdapter,
  packageStereo: defaultPackageStereo,
  now: Date.now,
})
let runtimeDefaults = productionDefaults
let runtimeActive = false
let runtimeStore: XrV2CaptureArtifactStore | null = null
let inFlight: Promise<void> | null = null
let scanTimer: ReturnType<typeof setTimeout> | null = null
let scanRequested = false
let remainingScanBudget = 0
let generation = 0
let runtimeAbort: AbortController | null = null
const listeners = new Set<() => void>()
let snapshot: XrV2PostProcessFallbackSnapshot = Object.freeze({
  schema: XR_V2_POST_PROCESS_FALLBACK_SCHEMA,
  ...createXrV2PostProcessStoppedEvent(),
  runtimeActive: false,
  catalogRevision: 0,
  revision: 0,
})

function publish(value: XrV2PostProcessFallbackEvent): void {
  snapshot = Object.freeze({
    schema: XR_V2_POST_PROCESS_FALLBACK_SCHEMA,
    ...value,
    runtimeActive,
    catalogRevision: snapshot.catalogRevision + (value.phase === 'completed' ? 1 : 0),
    revision: snapshot.revision + 1,
  })
  for (const listener of listeners) {
    try { listener() } catch { /* isolate projections */ }
  }
}

function failedEvent(error: unknown): XrV2PostProcessFallbackEvent {
  const detail = error instanceof Error ? error.message : String(error || 'unknown failure')
  return Object.freeze({
    phase: 'failed', reason: 'processing-failed', jobId: null, assetId: null,
    processedFrames: 0, totalFrames: 0, progressPercent: 0, achievedTier: null,
    message: 'Post-process runtime could not scan its local queue.', error: detail.slice(0, 1_024),
  })
}

function closeStore(): void {
  runtimeStore?.close()
  runtimeStore = null
}

function scheduleRequestedScan(): void {
  if (!runtimeActive || !scanRequested || scanTimer || inFlight) return
  scanTimer = setTimeout(() => {
    scanTimer = null
    if (!runtimeActive || !scanRequested || inFlight) return
    scanRequested = false
    remainingScanBudget = Math.max(0, remainingScanBudget - 1)
    const ownGeneration = generation
    let store: XrV2CaptureArtifactStore
    try {
      store = runtimeStore || (runtimeStore = runtimeDefaults.createStore())
    } catch (error) {
      if (runtimeActive && generation === ownGeneration) publish(failedEvent(error))
      return
    }
    const controller = new AbortController()
    runtimeAbort = controller
    inFlight = runXrV2PostProcessFallbackPass({
      store,
      createDepthAdapter: runtimeDefaults.createDepthAdapter,
      packageStereo: runtimeDefaults.packageStereo,
      now: runtimeDefaults.now,
      signal: controller.signal,
    }, value => {
      if (runtimeActive && generation === ownGeneration && !controller.signal.aborted) publish(value)
    }).then(result => {
      if (runtimeActive && generation === ownGeneration
        && result.jobId !== null && remainingScanBudget > 0) scanRequested = true
    }).catch(error => {
      if (runtimeActive && generation === ownGeneration && !controller.signal.aborted) publish(failedEvent(error))
    }).finally(() => {
      if (runtimeAbort === controller) runtimeAbort = null
      inFlight = null
      if (runtimeActive && scanRequested) scheduleRequestedScan()
      else if (!runtimeActive) closeStore()
    })
  }, 0)
}

/** Starts one bounded persisted-queue scan for the mounted XR workspace. */
export function startXrV2PostProcessFallbackRuntime(): void {
  if (runtimeActive) return
  runtimeActive = true
  generation += 1
  remainingScanBudget = XR_V2_POST_PROCESS_MAX_JOBS_PER_SCAN_REQUEST
  scanRequested = true
  scheduleRequestedScan()
}

/** Requests one additional scan after a newly saved fallback capture. */
export function requestXrV2PostProcessFallbackScan(): void {
  if (!runtimeActive) return
  remainingScanBudget = XR_V2_POST_PROCESS_MAX_JOBS_PER_SCAN_REQUEST
  scanRequested = true
  scheduleRequestedScan()
}

export function stopXrV2PostProcessFallbackRuntime(): void {
  runtimeActive = false
  generation += 1
  scanRequested = false
  remainingScanBudget = 0
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = null
  runtimeAbort?.abort(new DOMException('XR workspace unmounted', 'AbortError'))
  if (!inFlight) closeStore()
  publish(createXrV2PostProcessStoppedEvent())
}

export function readXrV2PostProcessFallback(): XrV2PostProcessFallbackSnapshot {
  return snapshot
}

export function subscribeXrV2PostProcessFallback(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function installXrV2PostProcessFallbackRuntimeTestDefaults(
  overrides: Partial<RuntimeDefaults>,
): () => void {
  if (runtimeActive || inFlight) throw new Error('stop the post-process runtime before replacing dependencies')
  const previous = runtimeDefaults
  runtimeDefaults = Object.freeze({ ...runtimeDefaults, ...overrides })
  return () => { runtimeDefaults = previous }
}
