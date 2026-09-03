import { buildUploadedMediaDragPayload } from '@/features/command-menu/mediaCatalogShared'
import {
  readUploadedMediaPanelItemRuntimeUrl,
  readUploadedMediaStorageRuntimeUrl,
  type UploadedMediaPanelItem,
} from '@/lib/storage/uploadedMediaPanelItems'

function createSyncedUploadedMediaItem(): UploadedMediaPanelItem {
  const publicUrl = 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/video/runtime-demo.mp4'
  return {
    id: 'cloudflare-media:sha256:runtime-demo',
    name: 'runtime-demo.mp4',
    kind: 'video',
    localUrl: '',
    linkUrl: `${publicUrl}?agentic_os_media_token=stale-token`,
    contentType: 'video/mp4',
    sizeBytes: 4096,
    displayHeight: 720,
    displayWidth: 1280,
    durationSeconds: 15,
    frameRate: 24,
    status: 'synced',
    storage: {
      workspaceId: 'airvio',
      runId: 'upload-demo',
      stageId: 'video',
      shotId: 'runtime-demo',
      objectKey: 'airvio/runs/upload-demo/video/runtime-demo.mp4',
      publicPath: '/api/storage/media/airvio/runs/upload-demo/video/runtime-demo.mp4',
      publicUrl,
      accessUrl: `${publicUrl}?agentic_os_media_token=stale-token`,
      contentHash: 'sha256:runtime-demo',
      contentType: 'video/mp4',
      provenance: {
        displayHeight: 720,
        displayWidth: 1280,
        durationSeconds: 15,
        fileName: 'runtime-demo.mp4',
        frameRate: 24,
        sizeBytes: 4096,
      },
      response: {
        ok: true,
        apiVersion: '2026-05-04',
        workspaceId: 'airvio',
        artifactId: 'upload-demo:video:runtime-demo',
        objectKey: 'airvio/runs/upload-demo/video/runtime-demo.mp4',
        publicPath: '/api/storage/media/airvio/runs/upload-demo/video/runtime-demo.mp4',
        durableR2Url: '/api/storage/media/airvio/runs/upload-demo/video/runtime-demo.mp4',
        contentHash: 'sha256:runtime-demo',
        storage: { r2: 'confirmed', d1: 'persisted', kv: 'skipped', durableObject: 'skipped' },
        access: { cacheKey: null, expiresAtMs: null, url: `${publicUrl}?agentic_os_media_token=stale-token` },
      },
    },
    error: null,
  }
}

export function testUploadedMediaStorageRuntimeUrlRefreshesStaleToken() {
  const originalNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    const item = createSyncedUploadedMediaItem()
    const runtimeUrl = readUploadedMediaStorageRuntimeUrl(item.storage)
    if (!runtimeUrl.startsWith(`${item.storage?.publicUrl}?agentic_os_media_token=`)) {
      throw new Error(`expected storage runtime URL to mint a browser-openable token, got ${runtimeUrl}`)
    }
    if (runtimeUrl.includes('stale-token')) {
      throw new Error(`expected storage runtime URL to replace stale token reuse, got ${runtimeUrl}`)
    }
  } finally {
    Date.now = originalNow
  }
}

export function testUploadedMediaStorageRuntimeUrlPreservesSignedCapability() {
  const item = createSyncedUploadedMediaItem()
  const capabilityUrl = `${item.storage?.publicUrl}?agentic_os_media_capability=signed-workspace-capability`
  const runtimeUrl = readUploadedMediaStorageRuntimeUrl({
    ...item.storage,
    accessUrl: capabilityUrl,
  })
  if (runtimeUrl !== capabilityUrl) {
    throw new Error(`expected signed workspace capability URL to be preserved exactly, got ${runtimeUrl}`)
  }
}

export function testUploadedMediaStorageRuntimeUrlUsesCurrentLocalOrigin() {
  const originalWindow = (globalThis as { window?: unknown }).window
  const originalNow = Date.now
  ;(globalThis as { window?: unknown }).window = { location: { origin: 'http://localhost:5172' } }
  Date.now = () => 1_700_000_000_000
  try {
    const item = createSyncedUploadedMediaItem()
    const staleDevPublicUrl = 'http://localhost:5173/api/storage/media/airvio/runs/upload-demo/video/runtime-demo.mp4'
    const runtimeUrl = readUploadedMediaStorageRuntimeUrl({
      accessUrl: `${staleDevPublicUrl}?agentic_os_media_token=stale-token`,
      publicUrl: staleDevPublicUrl,
      runId: item.storage?.runId || 'upload-demo',
    })
    if (!runtimeUrl.startsWith('http://localhost:5172/api/storage/media/airvio/runs/upload-demo/video/runtime-demo.mp4?agentic_os_media_token=')) {
      throw new Error(`expected stale local storage media URL to use current runtime origin, got ${runtimeUrl}`)
    }
    if (runtimeUrl.includes('localhost:5173') || runtimeUrl.includes('stale-token')) {
      throw new Error(`expected local runtime URL to replace stale origin and token, got ${runtimeUrl}`)
    }
  } finally {
    Date.now = originalNow
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
}

export function testUploadedMediaPanelItemRuntimeUrlRefreshesSyncedItemToken() {
  const originalNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    const item = createSyncedUploadedMediaItem()
    const runtimeUrl = readUploadedMediaPanelItemRuntimeUrl(item)
    if (!runtimeUrl.startsWith(`${item.storage?.publicUrl}?agentic_os_media_token=`)) {
      throw new Error(`expected synced panel item URL to mint a runtime token, got ${runtimeUrl}`)
    }
    if (runtimeUrl.includes('stale-token')) {
      throw new Error(`expected synced panel item URL to stop reusing stale tokens, got ${runtimeUrl}`)
    }
  } finally {
    Date.now = originalNow
  }
}

export function testUploadedMediaPanelItemRuntimeUrlIsStableWithinTokenTtl() {
  const originalNow = Date.now
  let nowMs = 1_700_000_000_000
  Date.now = () => nowMs
  try {
    const item = createSyncedUploadedMediaItem()
    const firstRuntimeUrl = readUploadedMediaPanelItemRuntimeUrl(item)
    nowMs += 1_000
    const secondRuntimeUrl = readUploadedMediaPanelItemRuntimeUrl(item)
    if (secondRuntimeUrl !== firstRuntimeUrl) {
      throw new Error(`expected media panel runtime URL to stay stable during render/probe loops, got ${firstRuntimeUrl} then ${secondRuntimeUrl}`)
    }
  } finally {
    Date.now = originalNow
  }
}

export function testUploadedMediaDragPayloadUsesFreshRuntimeUrl() {
  const originalNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    const item = createSyncedUploadedMediaItem()
    const payload = buildUploadedMediaDragPayload(item)
    if (!payload) throw new Error('expected synced uploaded media drag payload')
    if (!payload.url.startsWith(`${item.storage?.publicUrl}?agentic_os_media_token=`)) {
      throw new Error(`expected drag payload to use a fresh runtime URL, got ${payload.url}`)
    }
    if (payload.url.includes('stale-token')) {
      throw new Error(`expected drag payload to avoid stale token reuse, got ${payload.url}`)
    }
    if (
      payload.byteSize !== 4096 ||
      payload.displayHeight !== 720 ||
      payload.displayWidth !== 1280 ||
      payload.durationSeconds !== 15 ||
      payload.frameRate !== 24 ||
      payload.mimeHint !== 'video/mp4'
    ) {
      throw new Error(`expected drag payload to preserve source-backed video metadata, got ${JSON.stringify(payload)}`)
    }
    const readerOnlyPayload = buildUploadedMediaDragPayload({
      ...item,
      displayHeight: undefined,
      displayWidth: undefined,
      durationSeconds: undefined,
      frameRate: undefined,
      sizeBytes: 0,
    }, {
      averageVideoFrameRate: 23.976,
      byteSize: 6632,
      displayHeight: 720,
      displayWidth: 1280,
      durationSeconds: 15.09,
      mimeType: 'video/mp4',
    })
    if (
      readerOnlyPayload?.byteSize !== 6632 ||
      readerOnlyPayload.displayHeight !== 720 ||
      readerOnlyPayload.displayWidth !== 1280 ||
      readerOnlyPayload.durationSeconds !== 15.09 ||
      readerOnlyPayload.frameRate !== 23.976 ||
      readerOnlyPayload.mimeHint !== 'video/mp4'
    ) {
      throw new Error(`expected drag payload to reuse thumbnail-reader metadata, got ${JSON.stringify(readerOnlyPayload)}`)
    }
  } finally {
    Date.now = originalNow
  }
}
