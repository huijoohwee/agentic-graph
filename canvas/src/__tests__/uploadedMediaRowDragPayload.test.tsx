import { readFileSync } from 'node:fs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { UploadedMediaCard, UploadedMediaRow } from '@/features/command-menu/mediaCatalogUploadedItems'
import { shouldPrimeMediaRowDragPayload } from '@/features/command-menu/mediaCatalogShared'
import type { UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { clearMediaPointerDragPayload, finishMediaPointerDragPayloadForEvent, MEDIA_POINTER_DRAG_DROP_EVENT, readMediaPointerDragPayload, type MediaPointerDragDropDetail } from '@/lib/ui/mediaDragPayload'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

function createUploadedImageItem(): UploadedMediaPanelItem {
  const publicUrl = 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio_.JPEG'
  return {
    id: 'cloudflare-media:sha256:airvio-demo',
    name: 'airvio_.JPEG',
    kind: 'image',
    localUrl: '',
    linkUrl: `${publicUrl}?agentic_os_media_token=stale-token`,
    contentType: 'image/jpeg',
    sizeBytes: 255 * 1024,
    status: 'synced',
    storage: {
      workspaceId: 'airvio',
      runId: 'upload-demo',
      stageId: 'image',
      shotId: 'airvio-demo',
      objectKey: 'airvio/runs/upload-demo/image/airvio_.JPEG',
      publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio_.JPEG',
      publicUrl,
      accessUrl: `${publicUrl}?agentic_os_media_token=stale-token`,
      contentHash: 'sha256:airvio-demo',
      contentType: 'image/jpeg',
      provenance: { fileName: 'airvio_.JPEG', sizeBytes: 255 * 1024 },
      response: {
        ok: true,
        apiVersion: '2026-05-04',
        workspaceId: 'airvio',
        artifactId: 'upload-demo:image:airvio-demo',
        objectKey: 'airvio/runs/upload-demo/image/airvio_.JPEG',
        publicPath: '/api/storage/media/airvio/runs/upload-demo/image/airvio_.JPEG',
        durableR2Url: '/api/storage/media/airvio/runs/upload-demo/image/airvio_.JPEG',
        contentHash: 'sha256:airvio-demo',
        storage: { r2: 'confirmed', d1: 'persisted', kv: 'skipped', durableObject: 'skipped' },
        access: { cacheKey: null, expiresAtMs: null, url: `${publicUrl}?agentic_os_media_token=stale-token` },
      },
    },
    error: null,
  }
}

async function assertUploadedMediaSurfaceStartsPointerDrag(surface: 'card' | 'row') {
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const item = createUploadedImageItem()
  const originalCustomEvent = globalThis.CustomEvent
  globalThis.CustomEvent = dom.window.CustomEvent as unknown as typeof CustomEvent
  const noop = () => undefined
  const props = {
    item,
    description: 'Image media: airvio_.JPEG',
    fieldText: 'image jpeg synced r2 d1',
    infoLabel: 'image jpeg synced r2 d1 255kb',
    onDelete: noop,
    onDescriptionChange: noop,
    onDragStart: noop,
    onFieldChange: noop,
    onNameChange: noop,
    onRename: noop,
    onSelect: noop,
    onPreview: noop,
  }
  try {
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await act(async () => {
      root?.render(surface === 'row'
        ? React.createElement(UploadedMediaRow, props)
        : React.createElement(UploadedMediaCard, props))
    })
    const uploadItem = container.querySelector('[data-kg-media-upload-item]')
    if (!(uploadItem instanceof dom.window.HTMLElement)) {
      throw new Error(`expected uploaded media ${surface} root`)
    }
    const dragFrame = container.querySelector('[data-kg-media-drag-affordance="frame"]')
    if (!(dragFrame instanceof dom.window.HTMLElement) || !dragFrame.className.includes('cursor-grab') || !dragFrame.className.includes('cursor-grabbing')) {
      throw new Error(`expected uploaded media ${surface} frame to expose a grab/grabbing drag affordance`)
    }
    const thumbnailImage = container.querySelector('img[data-kg-command-menu-media-thumbnail="1"]')
    if (!(thumbnailImage instanceof dom.window.HTMLImageElement)) {
      throw new Error(`expected uploaded media ${surface} thumbnail image`)
    }
    if (thumbnailImage.draggable !== true) {
      throw new Error(`expected uploaded media ${surface} thumbnail image to be a draggable payload source`)
    }
    await act(async () => {
      thumbnailImage.dispatchEvent(new dom.window.MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: 25,
        clientY: 25,
      }))
    })
    const payload = readMediaPointerDragPayload()
    if (!payload) throw new Error(`expected uploaded media ${surface} to start shared pointer drag payload`)
    if (payload.kind !== 'image' || payload.label !== item.name || !payload.url.startsWith(`${item.storage?.publicUrl}?agentic_os_media_token=`)) {
      throw new Error(`expected uploaded media ${surface} drag payload to carry runtime image URL, got ${JSON.stringify(payload)}`)
    }
    if (payload.url.includes('stale-token')) {
      throw new Error(`expected uploaded media ${surface} drag payload to refresh stale token, got ${payload.url}`)
    }
    let dropDetail: MediaPointerDragDropDetail | null = null
    dom.window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, event => {
      dropDetail = (event as CustomEvent<MediaPointerDragDropDetail>).detail
    }, { once: true })
    await act(async () => {
      thumbnailImage.dispatchEvent(new dom.window.MouseEvent('mousemove', {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: 125,
        clientY: 135,
      }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: 225,
        clientY: 235,
      }))
    })
    if (!dropDetail) throw new Error(`expected uploaded media ${surface} pointer release to emit shared media drop detail`)
    if (dropDetail.startClientX !== 25 || dropDetail.startClientY !== 25) {
      throw new Error(`expected uploaded media ${surface} drop detail to preserve drag origin, got ${JSON.stringify(dropDetail)}`)
    }
    if (dropDetail.clientX !== 125 || dropDetail.clientY !== 135) {
      throw new Error(`expected uploaded media ${surface} drop detail to preserve last drag coordinates, got ${JSON.stringify(dropDetail)}`)
    }
    dropDetail = null
    await act(async () => {
      thumbnailImage.dispatchEvent(new dom.window.MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: 35,
        clientY: 45,
      }))
    })
    dom.window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, event => {
      dropDetail = (event as CustomEvent<MediaPointerDragDropDetail>).detail
    }, { once: true })
    await act(async () => {
      thumbnailImage.dispatchEvent(new dom.window.MouseEvent('mousemove', {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: 315,
        clientY: 345,
      }))
      finishMediaPointerDragPayloadForEvent({
        type: 'dragend',
        clientX: 0,
        clientY: 0,
      })
    })
    if (!dropDetail) throw new Error(`expected uploaded media ${surface} native dragend to emit shared media drop detail`)
    if (dropDetail.clientX !== 315 || dropDetail.clientY !== 345) {
      throw new Error(`expected uploaded media ${surface} native dragend zero placeholder to resolve to tracked drop point, got ${JSON.stringify(dropDetail)}`)
    }
  } finally {
    clearMediaPointerDragPayload()
    try {
      if (root) {
        await act(async () => {
          root?.unmount()
        })
      }
    } catch {
      void 0
    }
    restoreDom()
    globalThis.CustomEvent = originalCustomEvent
  }
}

export async function testUploadedMediaRowStartsSharedPointerDragPayload() {
  await assertUploadedMediaSurfaceStartsPointerDrag('row')
  const { dom, restore } = initJsdomHarness()
  const article = dom.window.document.createElement('article')
  article.setAttribute('data-kg-media-draggable', '1')
  const title = dom.window.document.createElement('span')
  const rename = dom.window.document.createElement('button')
  const openLink = dom.window.document.createElement('a')
  title.textContent = 'media title'
  rename.setAttribute('data-kg-media-upload-rename', 'demo')
  openLink.setAttribute('data-kg-media-open-link-overlay', '1')
  article.append(title, rename, openLink)
  dom.window.document.body.appendChild(article)
  try {
    const primeEvent = (target: Element) => ({
      altKey: false,
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target,
    }) as unknown as React.MouseEvent<HTMLElement>
    if (!shouldPrimeMediaRowDragPayload(primeEvent(title))) {
      throw new Error('expected uploaded media row body to prime shared drag payload before nested handlers')
    }
    if (shouldPrimeMediaRowDragPayload(primeEvent(rename)) || shouldPrimeMediaRowDragPayload(primeEvent(openLink))) {
      throw new Error('expected uploaded media row action controls to avoid priming drag payload')
    }
  } finally {
    restore()
  }
  const mediaDragPayloadSource = readFileSync(new URL('../lib/ui/mediaDragPayload.ts', import.meta.url), 'utf8')
  const mediaCatalogSharedSource = readFileSync(new URL('../features/command-menu/mediaCatalogShared.tsx', import.meta.url), 'utf8')
  const mediaCatalogUploadedItemsSource = readFileSync(new URL('../features/command-menu/mediaCatalogUploadedItems.tsx', import.meta.url), 'utf8')
  for (const snippet of [
    "window.addEventListener('dragend', handleRelease, { capture: true, once: true })",
    "window.addEventListener('dragover', rememberNativeDrag, true)",
    "window.removeEventListener('dragend', handleRelease, true)",
    "window.removeEventListener('dragover', rememberNativeDrag, true)",
    'export function finishMediaPointerDragPayloadAt(clientX: number, clientY: number): void',
    'export function finishMediaPointerDragPayloadForEvent(event:',
  ]) {
    if (!mediaDragPayloadSource.includes(snippet)) {
      throw new Error(`expected shared media drag payload to bridge native dragend releases: ${snippet}`)
    }
  }
  if (!mediaCatalogSharedSource.includes('finishMediaPointerDragPayloadForEvent(event.nativeEvent)')) {
    throw new Error('expected shared media catalog drag helper to finalize native dragend through the tracked release-point resolver')
  }
  if (!mediaCatalogUploadedItemsSource.includes('onDragEnd={finishMediaDrag}')) {
    throw new Error('expected uploaded media thumbnail image/control to finalize native dragend')
  }
  for (const snippet of [
    'readUploadedMediaPanelItemRuntimeUrl',
    'const runtimeUrl = readUploadedMediaPanelItemRuntimeUrl(item)',
    "explicitThumbnailUrl: item.kind === 'image' ? runtimeUrl : ''",
    'url: runtimeUrl',
    '<MediaOpenLinkOverlay href={runtimeUrl}',
    '<MediaDownloadOverlay href={runtimeUrl}',
  ]) {
    if (!`${mediaCatalogSharedSource}\n${mediaCatalogUploadedItemsSource}`.includes(snippet)) {
      throw new Error(`expected uploaded media preview surfaces to use fresh runtime URLs: ${snippet}`)
    }
  }
}

export async function testUploadedMediaCardStartsSharedPointerDragPayload() {
  await assertUploadedMediaSurfaceStartsPointerDrag('card')
  const mediaCatalogUploadedItemsSource = readFileSync(new URL('../features/command-menu/mediaCatalogUploadedItems.tsx', import.meta.url), 'utf8')
  for (const snippet of [
    'const generatedThumbnail = useNativeVideoMediaThumbnail({',
    'const buildDragPayload = () => buildUploadedMediaDragPayload(item, generatedThumbnail)',
    'onPointerDownCapture={event => {',
    'shouldPrimeMediaRowDragPayload(event)',
    'primeMediaPointerDrag(event, buildDragPayload())',
    'onMouseDownCapture={event => {',
    'primeMediaMouseDrag(event, buildDragPayload())',
    'onDragStart={event => onDragStart(event, item, generatedThumbnail)}',
    'startMediaPointerDrag(event, buildDragPayload())',
    'continueMediaPointerDrag(event, buildDragPayload())',
  ]) {
    if (!mediaCatalogUploadedItemsSource.includes(snippet)) {
      throw new Error(`expected uploaded media card drag path to reuse native video thumbnail metadata: ${snippet}`)
    }
  }
}
