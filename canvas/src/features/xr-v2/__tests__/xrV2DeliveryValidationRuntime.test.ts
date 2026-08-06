import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { XrV2DeliveryValidationPanel } from '../XrV2DeliveryValidationPanel'
import { XrV2CrossDeviceAssetPanel } from '../XrV2CrossDeviceAssetPanel'
import type {
  XrV2ConnectedPreviewAuthoringEdit,
  XrV2ConnectedPreviewBrowserObservation,
} from '../browserRuntimeEvidence'
import type { XrV2SavedSpatialAssetResource } from '../xrV2SavedAssetCatalog'
import type { XrV2SavedAssetEncodedTrackFixture } from '../xrV2SavedAssetPackagingRuntime'
import type { XrV2ConnectedPreviewViewerSession } from '../xrV2ConnectedPreviewViewerRuntime'
import { readXrV2CrossDeviceAssetConfig } from '../xrV2CrossDeviceAssetManifest'
import {
  runXrV2BrowserPackagingAction,
  runXrV2ConnectedPreviewAction,
  XR_V2_CROSS_DEVICE_BLOCKER,
  XR_V2_SAVED_ASSET_SCOPE,
} from '../xrV2DeliveryValidationRuntime'

function encodedFixture(): XrV2SavedAssetEncodedTrackFixture {
  return {
    blob: new Blob([Uint8Array.of(1, 2, 3)], { type: 'video/webm' }),
    inventory: {
      schema: 'knowgrph-xr-v2-container-inventory/v1',
      container: 'webm',
      timecodeScaleNs: 1_000_000,
      durationUs: 66_666,
      clusterCount: 1,
      seekHeadEntryCount: 3,
      cuePointCount: 2,
      cueTrackPositionCount: 2,
      tracks: [
        {
          trackNumber: 1, kind: 'video', codec: 'vp8', codecId: 'V_VP8', defaultTrack: true,
          codecPrivateByteLength: 0, vp9: null, width: 96, height: 64, defaultDurationNs: 33_333_333,
          sampleCount: 2, keyframeCount: 1, encodedByteLength: 2, samples: [],
        },
        {
          trackNumber: 2, kind: 'video', codec: 'vp9', codecId: 'V_VP9', defaultTrack: false,
          codecPrivateByteLength: 0, vp9: null, width: 96, height: 64, defaultDurationNs: 33_333_333,
          sampleCount: 2, keyframeCount: 1, encodedByteLength: 2, samples: [],
        },
      ],
    },
    exactPayloadsVerified: true,
    sourceCodecs: ['vp8', 'vp9'],
    sourceSampleCounts: [2, 2],
    decodedSourceFrameCounts: [2, 2],
    sourceSessionId: 'saved-capture',
    sourceRawClipRef: 'indexeddb://knowgrph-xr-v2/raw-clip/saved-capture',
    sourceRawClipMimeType: 'video/webm',
    sourceRawClipByteSize: 3,
    sourceRawClipSha256: `sha256:${'0'.repeat(64)}`,
    sourceDepthMetadataRef: 'indexeddb://knowgrph-xr-v2/frame-bundle/saved-capture',
    sourceTrackProducer: 'captured-frame-bundle-webcodecs',
    sourceTracksProducedBeforeMux: true,
  }
}

function fakeVideo() {
  let srcRemoved = false
  let loaded = 0
  return {
    video: {
      isConnected: true,
      pause: () => undefined,
      removeAttribute: (name: string) => { if (name === 'src') srcRemoved = true },
      load: () => { loaded += 1 },
    } as unknown as HTMLVideoElement,
    inspect: () => ({ srcRemoved, loaded }),
  }
}

const AUTHORING_EDIT: XrV2ConnectedPreviewAuthoringEdit = Object.freeze({
  entityRef: 'scene.hero',
  visible: false,
  sourceDigest: 'fnv1a32:12345678',
  graphDataRevision: 7,
  authoringEditRevision: 3,
  authorRenderedAtMs: 9,
})

function savedResource(): XrV2SavedSpatialAssetResource {
  return {
    asset: {
      asset_id: 'saved-capture:asset',
      session_id: 'saved-capture',
      raw_clip_ref: 'indexeddb://knowgrph-xr-v2/raw-clip/saved-capture',
      metadata: { depth_metadata_ref: 'indexeddb://knowgrph-xr-v2/frame-bundle/saved-capture' },
    },
    rawClip: new Blob([Uint8Array.of(1, 2, 3)], { type: 'video/webm' }),
    frameBundle: { sessionId: 'saved-capture', snapshot: { sessionId: 'saved-capture' }, frames: [{}] },
  } as unknown as XrV2SavedSpatialAssetResource
}

function connectedEvidence(overrides: Partial<XrV2ConnectedPreviewBrowserObservation> = {}): XrV2ConnectedPreviewBrowserObservation {
  return {
    schema: 'knowgrph-xr-v2-connected-preview-browser-observation/v1',
    transport: 'webrtc-data-channel',
    entityRef: AUTHORING_EDIT.entityRef,
    sourceDigest: AUTHORING_EDIT.sourceDigest,
    graphDataRevision: AUTHORING_EDIT.graphDataRevision,
    authoringEditRevision: AUTHORING_EDIT.authoringEditRevision,
    authorRenderedAtMs: AUTHORING_EDIT.authorRenderedAtMs,
    requestedVisible: AUTHORING_EDIT.visible,
    viewerVisible: AUTHORING_EDIT.visible,
    authorRevision: 1,
    viewerRevision: 1,
    editApplied: true,
    viewerRenderedFrame: true,
    viewerRenderRevision: 1,
    viewerRenderedAtMs: 11,
    latencyMs: 12,
    withinCeiling: true,
    navigationEntryCountBefore: 1,
    navigationEntryCountAfter: 1,
    documentIdentityPreserved: true,
    ...overrides,
  }
}

function viewerSession(): XrV2ConnectedPreviewViewerSession {
  let current: ReturnType<XrV2ConnectedPreviewViewerSession['snapshot']> = null
  return Object.freeze({
    applyEdit: async (edit, revision) => {
      current = Object.freeze({ ...edit, revision, renderedAtMs: 11, attached: true as const })
      return current
    },
    snapshot: () => current,
    dispose: () => { current = null },
  })
}

function connectedProbe(overrides: Partial<XrV2ConnectedPreviewBrowserObservation> = {}) {
  return async (
    signal: AbortSignal,
    edit: XrV2ConnectedPreviewAuthoringEdit,
    session: XrV2ConnectedPreviewViewerSession,
  ) => {
    await session.applyEdit(edit, 1, signal)
    return connectedEvidence(overrides)
  }
}

test('explicit packaging action publishes evidence only after preserved tracks really play', async () => {
  const { video, inspect } = fakeVideo()
  const revoked: string[] = []
  let playbackObserved = false
  const lease = await runXrV2BrowserPackagingAction(video, new AbortController().signal, savedResource(), {
    createFixture: async () => encodedFixture(),
    createObjectUrl: () => 'blob:xr-packaged-output',
    revokeObjectUrl: url => revoked.push(url),
    observePlayback: async (_video, url) => {
      assert.equal(url, 'blob:xr-packaged-output')
      playbackObserved = true
      return {
        decodedWidth: 96, decodedHeight: 64, durationSeconds: 0.2,
        currentTimeSeconds: 0.1, attached: true,
      }
    },
  })

  assert.equal(playbackObserved, true)
  assert.equal(lease.evidence.playbackObserved, true)
  assert.equal(lease.evidence.sourceAssetId, 'saved-capture:asset')
  assert.equal(lease.evidence.sourceFrameCount, 1)
  assert.deepEqual(lease.evidence.codecs, ['vp8', 'vp9'])
  assert.deepEqual(lease.evidence.sampleCounts, [2, 2])
  assert.deepEqual(revoked, [])
  lease.release()
  lease.release()
  assert.deepEqual(revoked, ['blob:xr-packaged-output'])
  assert.deepEqual(inspect(), { srcRemoved: true, loaded: 1 })
})

test('packaging action rejects drift before creating a playback URL', async () => {
  const { video } = fakeVideo()
  const fixture = encodedFixture()
  const drifted = { ...fixture, sourceSampleCounts: [2, 3] }
  let objectUrlCreated = false
  await assert.rejects(runXrV2BrowserPackagingAction(video, new AbortController().signal, savedResource(), {
    createFixture: async () => drifted,
    createObjectUrl: () => { objectUrlCreated = true; return 'blob:unexpected' },
  }), /did not preserve the encoded track inventory/)
  assert.equal(objectUrlCreated, false)
})

test('packaging action rejects a detached playback surface', async () => {
  const { video } = fakeVideo()
  Object.defineProperty(video, 'isConnected', { value: false })
  await assert.rejects(
    runXrV2BrowserPackagingAction(video, new AbortController().signal, savedResource()),
    /attached browser video element/,
  )
})

test('connected preview accepts only applied acknowledged bounded no-reload evidence', async () => {
  const valid = await runXrV2ConnectedPreviewAction(
    new AbortController().signal,
    AUTHORING_EDIT,
    { viewerSession: viewerSession(), probe: connectedProbe() },
  )
  assert.equal(valid.viewerRevision, 1)
  await assert.rejects(runXrV2ConnectedPreviewAction(
    new AbortController().signal,
    AUTHORING_EDIT,
    { viewerSession: viewerSession(), probe: connectedProbe({ navigationEntryCountAfter: 2 }) },
  ), /did not satisfy edit, acknowledgement, latency, and no-reload evidence/)
  for (const drift of [
    { entityRef: 'scene.other' },
    { sourceDigest: 'fnv1a32:87654321' },
    { graphDataRevision: 8 },
    { requestedVisible: true },
    { viewerVisible: true },
  ]) {
    await assert.rejects(runXrV2ConnectedPreviewAction(
      new AbortController().signal,
      AUTHORING_EDIT,
      { viewerSession: viewerSession(), probe: connectedProbe(drift) },
    ), /did not satisfy edit, acknowledgement, latency, and no-reload evidence/)
  }
  for (const malformed of [
    { schema: 'wrong' },
    { latencyMs: Number.POSITIVE_INFINITY },
    { latencyMs: 251 },
    { authorRevision: 1.5, viewerRevision: 1.5, viewerRenderRevision: 1.5 },
    { viewerRenderedAtMs: -1 },
    { authoringEditRevision: 0 },
    { navigationEntryCountBefore: -1, navigationEntryCountAfter: -1 },
  ]) {
    await assert.rejects(runXrV2ConnectedPreviewAction(
      new AbortController().signal,
      AUTHORING_EDIT,
      {
        viewerSession: viewerSession(),
        probe: async (_signal, edit, session) => {
          await session.applyEdit(edit, 1, new AbortController().signal)
          return connectedEvidence(malformed as Partial<XrV2ConnectedPreviewBrowserObservation>)
        },
      },
    ), /did not satisfy edit, acknowledgement, latency, and no-reload evidence/)
  }
})

test('connected preview enforces one hard overall deadline and aborts the underlying probe', async () => {
  let probeAborted = false
  await assert.rejects(runXrV2ConnectedPreviewAction(
    new AbortController().signal,
    AUTHORING_EDIT,
    {
      viewerSession: viewerSession(),
      probe: signal => new Promise<XrV2ConnectedPreviewBrowserObservation>(() => {
        signal.addEventListener('abort', () => { probeAborted = true }, { once: true })
      }),
      deadlineMs: 20,
    },
  ), /hard overall deadline/)
  assert.equal(probeAborted, true)
})

test('workspace delivery panel is local-first and performs no action on render', () => {
  const html = renderToStaticMarkup(React.createElement(XrV2DeliveryValidationPanel, { actionsEnabled: true }))
  assert.match(html, /data-kg-xr-v2-delivery-validation="1"/)
  assert.match(html, /data-kg-xr-v2-saved-asset-scope="local-first-explicit-existing-storage"/)
  assert.match(html, /data-kg-xr-v2-ac-11-evidence="not-observed"/)
  assert.match(html, /data-kg-xr-v2-ac-12-evidence="not-observed"/)
  assert.match(html, /data-kg-xr-v2-ac-11-run="1"/)
  assert.match(html, /data-kg-xr-v2-ac-12-run="1"/)
  assert.equal(XR_V2_SAVED_ASSET_SCOPE, 'local-first-explicit-existing-storage')
  assert.equal(XR_V2_CROSS_DEVICE_BLOCKER.code, 'shared-storage-auth-and-server-digest-not-enforced')
})

test('existing-storage panel performs no publish, list, or read on mount', () => {
  let operations = 0
  const adapterFactory = () => Object.freeze({
    config: readXrV2CrossDeviceAssetConfig({ workspaceId: 'kgws:xr-test', baseUrl: 'https://example.com' }),
    publish: async () => { operations += 1; throw new Error('unexpected publish') },
    list: async () => { operations += 1; throw new Error('unexpected list') },
    read: async () => { operations += 1; throw new Error('unexpected read') },
  })
  const html = renderToStaticMarkup(React.createElement(XrV2CrossDeviceAssetPanel, {
    resource: null,
    localStore: null,
    onImported: () => undefined,
    adapterFactory,
  }))
  assert.equal(operations, 0)
  assert.match(html, /data-kg-xr-v2-cross-device-panel="1"/)
  assert.match(html, /data-kg-xr-v2-cross-device-network-on-mount="false"/)
  assert.match(html, /data-kg-xr-v2-cross-device-production-ready="false"/)
  assert.match(html, /data-kg-xr-v2-cross-device-blocker="shared-storage-auth-and-server-digest-not-enforced"/)
})

test('actual workspace readiness surface owns delivery actions without generic media-upload ownership', () => {
  const workspacePanel = readFileSync(new URL('../XrV2WorkspaceReadinessPanel.tsx', import.meta.url), 'utf8')
  const deliveryPanel = readFileSync(new URL('../XrV2DeliveryValidationPanel.tsx', import.meta.url), 'utf8')
  const actionRuntime = readFileSync(new URL('../xrV2DeliveryValidationRuntime.ts', import.meta.url), 'utf8')
  assert.match(workspacePanel, /<XrV2DeliveryValidationPanel actionsEnabled=\{snapshot\.canOfferUserActions\} \/>/)
  assert.match(deliveryPanel, /onClick=\{\(\) => void runPackaging\(\)\}/)
  assert.match(deliveryPanel, /onClick=\{\(\) => void runPreview\(\)\}/)
  assert.match(actionRuntime, /createXrV2SavedAssetEncodedTrackFixture/)
  assert.match(actionRuntime, /probeXrV2ConnectedPreviewOverWebRtc/)
  assert.doesNotMatch(deliveryPanel, /uploadMediaFileToKnowgrphStorage|listUploadedMediaFromKnowgrphStorage/)
  assert.doesNotMatch(deliveryPanel, /getUserMedia|requestSession|DeviceOrientationEvent/)
})
