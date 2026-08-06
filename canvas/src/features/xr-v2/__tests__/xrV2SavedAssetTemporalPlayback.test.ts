import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import type {
  XrV2StoredCaptureFrame,
  XrV2StoredCaptureFrameBundle,
} from '../xrV2CaptureArtifactStore'
import {
  createXrV2SavedAssetViewerLease,
  drawXrV2DepthParallaxFrame,
  type XrV2SavedSpatialAssetResource,
} from '../xrV2SavedAssetCatalog'
import {
  createXrV2SavedAssetImmersiveRenderGate,
} from '../xrV2SavedAssetPresentationRuntime'
import {
  createXrV2TemporalAnimationLease,
  createXrV2TemporalPlayhead,
  resolveXrV2TemporalDepthSequence,
} from '../xrV2SavedAssetTemporalPlayback'
import { createXrV2SavedAssetThreePresentation } from '../xrV2SavedAssetThreePresentation'
import {
  createXrV2PublishedSpatialAsset,
  createXrV2SpatialAssetMetadata,
  type XrV2SpatialAssetMetadata,
} from '../xrV2SpatialAssetMetadata'

function storedFrame(frameIndex: number, capturedAtMs: number): XrV2StoredCaptureFrame {
  const base = 10 + frameIndex * 10
  return Object.freeze({
    frameIndex,
    capturedAtMs,
    frame: Object.freeze({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        base, 0, 0, 255,
        base + 1, 0, 0, 255,
      ]),
    }),
    estimate: Object.freeze({
      confidence: 0.9,
      depth: Object.freeze({
        width: 2,
        height: 1,
        values: frameIndex % 2
          ? new Float32Array([1, 0])
          : new Float32Array([0, 1]),
      }),
    }),
  })
}

function frameBundle(
  frames: readonly XrV2StoredCaptureFrame[] = [
    storedFrame(0, 100),
    storedFrame(1, 200),
    storedFrame(2, 350),
  ],
): XrV2StoredCaptureFrameBundle {
  return Object.freeze({
    schema: 'knowgrph-xr-v2-capture-frame-bundle/v1',
    sessionId: 'temporal-session',
    snapshot: Object.freeze({
      schema: 'knowgrph-xr-capture-snapshot/v2',
      contractVersion: '2.0.0',
      sessionId: 'temporal-session',
      phase: 'completed',
      frameBudgetMs: 100,
      consecutiveBudgetBreachesRequired: 3,
      maxFrames: 180,
      rawFrameCount: frames.length,
      depthFrameCount: frames.filter(frame => frame.estimate).length,
      synthesizedFrameCount: frames.filter(frame => frame.estimate).length,
      consecutiveBudgetBreaches: 0,
      lastFrameIndex: frames.at(-1)?.frameIndex ?? -1,
      fallback: null,
    }),
    frames: Object.freeze([...frames]),
    createdAtMs: 1,
  })
}

function resource(
  frames?: readonly XrV2StoredCaptureFrame[],
): XrV2SavedSpatialAssetResource {
  const bundle = frameBundle(frames)
  return Object.freeze({
    asset: createXrV2PublishedSpatialAsset({
      assetId: 'temporal-session:asset',
      sessionId: 'temporal-session',
      rawClipRef: 'indexeddb://knowgrph-xr-v2/raw-clip/temporal-session',
      metadata: createXrV2SpatialAssetMetadata({
        tier: 'pseudo-ar-depth-parallax',
        synthesisMode: 'live',
        depthMetadataRef: 'indexeddb://knowgrph-xr-v2/frame-bundle/temporal-session',
        fallbackTriggered: false,
      }),
      createdAtMs: 1,
    }),
    rawClip: new Blob(['flat-video'], { type: 'video/webm' }),
    frameBundle: bundle,
    depthFrame: bundle.frames[0] || null,
  })
}

function withMetadata(
  source: XrV2SavedSpatialAssetResource,
  metadata: Partial<XrV2SpatialAssetMetadata>,
): XrV2SavedSpatialAssetResource {
  return Object.freeze({
    ...source,
    asset: Object.freeze({
      ...source.asset,
      metadata: Object.freeze({ ...source.asset.metadata, ...metadata }),
    }),
  })
}

test('timestamp playhead advances persisted RGBA/depth frames, wraps, stops, and releases', () => {
  const sequence = resolveXrV2TemporalDepthSequence(resource())
  assert.ok(sequence)
  assert.equal(sequence.durationMs, 400)
  const playhead = createXrV2TemporalPlayhead(sequence)
  assert.equal(playhead.start(1_000)?.frameIndex, 0)
  assert.equal(playhead.advance(1_099)?.frameIndex, 0)
  assert.equal(playhead.advance(1_100)?.frameIndex, 1)
  assert.equal(playhead.advance(1_249)?.frameIndex, 1)
  assert.equal(playhead.advance(1_250)?.frameIndex, 2)
  const wrapped = playhead.advance(1_400)
  assert.deepEqual({ frameIndex: wrapped?.frameIndex, loop: wrapped?.loop }, { frameIndex: 0, loop: 1 })
  playhead.stop()
  assert.equal(playhead.advance(1_500), null)
  assert.equal(playhead.read()?.frameIndex, 0)
  assert.equal(playhead.start(2_000)?.frameIndex, 0)
  playhead.release()
  assert.equal(playhead.read(), null)
  assert.equal(playhead.start(3_000), null)
})

test('animation lease emits only temporal changes and cancels every pending frame on stop/release', () => {
  const sequence = resolveXrV2TemporalDepthSequence(resource())
  assert.ok(sequence)
  let nextHandle = 1
  let nowMs = 1_000
  const pending = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []
  const emitted: string[] = []
  const lease = createXrV2TemporalAnimationLease({
    sequence,
    nowMs: () => nowMs,
    requestFrame: callback => {
      const handle = nextHandle++
      pending.set(handle, callback)
      return handle
    },
    cancelFrame: handle => {
      cancelled.push(handle)
      pending.delete(handle)
    },
    onFrame: observation => emitted.push(`${observation.loop}:${observation.frameIndex}`),
  })
  const runNext = (timestamp: number) => {
    const entry = pending.entries().next().value as [number, FrameRequestCallback] | undefined
    assert.ok(entry)
    pending.delete(entry[0])
    entry[1](timestamp)
  }
  assert.equal(lease.start(), true)
  assert.deepEqual(emitted, ['0:0'])
  runNext(1_050)
  assert.deepEqual(emitted, ['0:0'], 'same timestamp segment is not re-emitted')
  runNext(1_100)
  runNext(1_250)
  runNext(1_400)
  assert.deepEqual(emitted, ['0:0', '0:1', '0:2', '1:0'])
  lease.stop()
  assert.equal(pending.size, 0)
  assert.equal(cancelled.length, 1)
  nowMs = 2_000
  assert.equal(lease.start(), true)
  assert.equal(pending.size, 1)
  lease.release()
  assert.equal(pending.size, 0)
  assert.equal(cancelled.length, 2)
  assert.equal(lease.start(), false)
})

test('visible parallax canvas draws distinct timestamp-selected RGBA frames with their paired depth', () => {
  const sequence = resolveXrV2TemporalDepthSequence(resource())
  assert.ok(sequence)
  let rendered = new Uint8ClampedArray()
  const canvas = {
    width: 0,
    height: 0,
    isConnected: true,
    getContext: () => ({
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image: ImageData) => { rendered = image.data.slice() },
    }),
  } as unknown as HTMLCanvasElement
  const playhead = createXrV2TemporalPlayhead(sequence)
  const first = playhead.start(1_000)
  assert.ok(first?.frame.estimate)
  assert.equal(drawXrV2DepthParallaxFrame(canvas, first.frame, { x: 1, y: 0 }), true)
  const firstPixels = rendered.slice()
  const second = playhead.advance(1_100)
  assert.ok(second?.frame.estimate)
  assert.equal(drawXrV2DepthParallaxFrame(canvas, second.frame, { x: 1, y: 0 }), true)
  assert.notDeepEqual(rendered, firstPixels)
  assert.notDeepEqual(second.frame.estimate.depth.values, first.frame.estimate.depth.values)
  playhead.release()
})

test('static, incomplete, and malformed depth sequences fail closed to revocable flat video', () => {
  const staticResource = resource([storedFrame(0, 100)])
  assert.equal(resolveXrV2TemporalDepthSequence(staticResource), null)
  const missingDepth = Object.freeze({ ...storedFrame(1, 200), estimate: null })
  assert.equal(resolveXrV2TemporalDepthSequence(resource([storedFrame(0, 100), missingDepth])), null)
  assert.equal(resolveXrV2TemporalDepthSequence(resource([storedFrame(0, 100), storedFrame(1, 100)])), null)
  const malformedRgba = Object.freeze({
    ...storedFrame(1, 200),
    frame: Object.freeze({ width: 2, height: 1, data: new Uint8ClampedArray(4) }),
  })
  assert.equal(resolveXrV2TemporalDepthSequence(resource([storedFrame(0, 100), malformedRgba])), null)

  const observations: Array<Record<string, unknown>> = []
  const revoked: string[] = []
  const lease = createXrV2SavedAssetViewerLease(staticResource, {
    createObjectUrl: () => 'blob:static-flat',
    revokeObjectUrl: url => revoked.push(url),
    reportObservation: value => observations.push(value as unknown as Record<string, unknown>),
  })
  assert.equal(lease.presentationTier, 'flat-fallback')
  assert.equal(lease.playbackUrl, 'blob:static-flat')
  assert.equal(lease.markFlatPlaybackCanPlay(true), false)
  assert.equal(lease.markFlatPlaybackProgress(true, 0), false)
  assert.equal(lease.markFlatPlaybackProgress(false, 20), false)
  assert.equal(lease.markFlatPlaybackProgress(true, 20), true)
  lease.release()
  assert.deepEqual(observations.map(value => ({ tier: value.tier, mounted: value.mounted })), [
    { tier: 'flat-fallback', mounted: true },
    { tier: 'flat-fallback', mounted: false },
  ])
  assert.deepEqual(revoked, ['blob:static-flat'])
})

test('temporal admission rejects persisted source and synthesis identity drift', () => {
  const source = resource()
  assert.ok(resolveXrV2TemporalDepthSequence(source))
  const snapshotDrift = Object.freeze({
    ...source,
    frameBundle: Object.freeze({
      ...source.frameBundle!,
      snapshot: Object.freeze({ ...source.frameBundle!.snapshot, sessionId: 'another-session' }),
    }),
  })
  assert.equal(resolveXrV2TemporalDepthSequence(snapshotDrift), null)
  assert.equal(resolveXrV2TemporalDepthSequence(withMetadata(source, {
    depth_metadata_ref: 'indexeddb://knowgrph-xr-v2/frame-bundle/another-session',
  })), null)
  assert.equal(resolveXrV2TemporalDepthSequence(withMetadata(source, {
    synthesis_mode: 'none',
  })), null)
  assert.equal(resolveXrV2TemporalDepthSequence(withMetadata(source, {
    synthesis_mode: 'live',
    fallback_triggered: true,
  })), null)
  assert.ok(resolveXrV2TemporalDepthSequence(withMetadata(source, {
    synthesis_mode: 'post-process',
    fallback_triggered: true,
  })))
})

test('Three presentation advances texture and per-frame depth before teardown freezes it', () => {
  const surface = createXrV2SavedAssetThreePresentation(resource())
  assert.ok(surface)
  const initialDepth = Array.from(surface.geometry.getAttribute('position').array)
  assert.equal((surface.texture.image.data as Uint8Array)[0], 10)
  assert.equal(surface.advance(1_000), null, 'an inactive immersive surface does not animate')
  assert.equal(surface.start(1_000)?.frameIndex, 0)
  assert.equal(surface.advance(1_100)?.frameIndex, 1)
  assert.equal((surface.texture.image.data as Uint8Array)[0], 20)
  assert.notDeepEqual(Array.from(surface.geometry.getAttribute('position').array), initialDepth)
  assert.equal(surface.advance(1_250)?.frameIndex, 2)
  assert.equal((surface.texture.image.data as Uint8Array)[0], 30)
  assert.equal(surface.advance(1_400)?.frameIndex, 0)
  assert.equal((surface.texture.image.data as Uint8Array)[0], 10)
  surface.stop()
  assert.equal(surface.advance(1_500), null)
  assert.equal((surface.texture.image.data as Uint8Array)[0], 10)
  assert.equal(surface.start(2_000)?.frameIndex, 0, 'a new explicit session restarts from the first frame')
  surface.release()
  assert.equal(surface.readFrame(), null)
  assert.equal(surface.advance(2_000), null)
  surface.geometry.dispose()
  surface.material.dispose()
  surface.texture.dispose()
})

test('immersive evidence requires two admitted timestamp-distinct frames on later attached renders', () => {
  const selected = resource()
  const observations: Array<Record<string, unknown>> = []
  const gate = createXrV2SavedAssetImmersiveRenderGate({
    resource: selected,
    mode: 'immersive-vr',
    baselineRenderFrame: 4,
    reportObservation: value => observations.push(value as unknown as Record<string, unknown>),
  })
  const evidence = (renderFrame: number, frameIndex: number, capturedAtMs: number, canvasConnected = true) => ({
    selectedAssetId: selected.asset.asset_id,
    mode: 'immersive-vr' as const,
    canvasConnected,
    textureBound: true,
    renderFrame,
    frameIndex,
    capturedAtMs,
  })
  assert.equal(gate.observe(evidence(4, 0, 100)), false)
  assert.equal(gate.observe(evidence(5, 0, 100)), false)
  assert.equal(gate.observe(evidence(6, 99, 999)), false, 'invented frames are not evidence')
  assert.equal(gate.observe(evidence(7, 1, 200, false)), false)
  assert.equal(observations.length, 0)
  assert.equal(gate.observe(evidence(8, 1, 200)), true)
  assert.deepEqual(observations.map(value => ({ mounted: value.mounted, mode: value.mode })), [
    { mounted: true, mode: 'immersive-vr' },
  ])
  gate.release()
  assert.deepEqual(observations.map(value => value.mounted), [true, false])
})

test('temporal playback runtime contains no permission or network acquisition surface', () => {
  const source = readFileSync(new URL('../xrV2SavedAssetTemporalPlayback.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /mediaDevices|getUserMedia|requestSession|\bfetch\s*\(|XMLHttpRequest|WebSocket/u)
})
