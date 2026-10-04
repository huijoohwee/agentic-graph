import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { VideoSequenceClipThumbnailStrip } from '../components/timeline/VideoSequenceClipThumbnailStrip'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { clearMediaPointerDragPayload, MEDIA_DRAG_PAYLOAD_MIME, MEDIA_POINTER_DRAG_DROP_EVENT, readMediaPointerDragPayload } from '../lib/ui/mediaDragPayload'
import type { MermaidGanttTimelineTaskSpan } from '../lib/mermaid/mermaidGanttBarInteraction'
import type { TimelineMediaReaderThumbnail } from '../components/timeline/timelineMediaReader'

const rasterDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const thumbnail: TimelineMediaReaderThumbnail = {
  dataUrl: 'data:image/svg+xml,%3Csvg/%3E', format: 'svg', mimeType: 'image/svg+xml',
  rasterDataUrl, rasterFormat: 'png', rasterMimeType: 'image/png',
  timestampSeconds: 5, width: 160, height: 90,
}
const span: MermaidGanttTimelineTaskSpan = {
  rowKey: 'clip', label: 'Mission', startMinutes: 2, endMinutes: 6,
  durationMinutes: 4, lineIndex: 0, raw: '',
}

async function mountThumbnail() {
  const { restore } = initJsdomHarness()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  const seeks: Array<[string, number]> = [], moves: string[] = []
  let outsidePointers = 0, outsideKeys = 0
  await act(async () => root.render(
    <section onPointerDown={() => outsidePointers++} onKeyDown={() => outsideKeys++}>
      <VideoSequenceClipThumbnailStrip span={span} thumbnails={[thumbnail]}
        thumbnailWindow={{ sourceStartSeconds: 0, sourceEndSeconds: 10 }}
        onSelectRowPosition={(row, position) => seeks.push([row, position])}
        onMovePointerStart={(_event, target) => moves.push(target.rowKey)} />
    </section>,
  ))
  const figure = host.querySelector<HTMLElement>('[data-kg-video-sequence-clip-thumbnail="1"]')!
  const seek = figure.querySelector<HTMLButtonElement>('.timeline-video-sequence-clip-thumbnail-seek')!
  const drag = figure.querySelector<HTMLButtonElement>('[data-kg-video-sequence-clip-thumbnail-drag-affordance="1"]')!
  const pointer = async (target: Element, type: string, x: number, buttons = 1, button = 0) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10, buttons, button })
    Object.defineProperty(event, 'pointerId', { value: 7 })
    await act(async () => { target.dispatchEvent(event) })
  }
  return { host, figure, seek, drag, seeks, moves, pointer,
    outsidePointers: () => outsidePointers, outsideKeys: () => outsideKeys,
    async dispose() { clearMediaPointerDragPayload(); await act(async () => root.unmount()); host.remove(); restore() },
  }
}

test('thumbnail uses native raster images and sibling accessible seek and drag controls', async () => {
  const view = await mountThumbnail()
  try {
    assert.equal(view.figure.tagName, 'FIGURE')
    assert.equal(view.figure.querySelectorAll('button').length, 2)
    assert.equal(view.figure.querySelector('button button'), null)
    assert.ok(view.seek.parentElement === view.figure && view.drag.parentElement === view.figure)
    const image = view.seek.querySelector('img')!
    assert.equal(image.src, rasterDataUrl, 'render the native raster frame rather than its SVG wrapper')
    assert.equal(image.draggable, false)
    assert.equal(view.figure.querySelector('figcaption time')?.getAttribute('datetime'), 'PT5S')
    assert.equal(view.figure.querySelector('[aria-hidden]'), null)
    assert.equal(view.seek.type, 'button')
    assert.equal(view.drag.type, 'button')
    assert.equal(view.drag.tabIndex, 0)
    assert.equal(view.drag.draggable, true)
    assert.equal(view.drag.getAttribute('data-kg-media-draggable'), '1')
    assert.equal(view.drag.getAttribute('data-kg-video-sequence-clip-thumbnail-drag-kind'), 'image')
    assert.match(view.drag.getAttribute('aria-label')!, /^Drag Mission frame .* or activate to seek$/)
    assert.ok(view.drag.textContent?.trim(), 'the drag target has a visible grip')
    await act(async () => view.seek.click())
    assert.deepEqual(view.seeks, [['clip', 4]])
    const drops: Event[] = []
    const receiveDrop = (event: Event) => drops.push(event)
    window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, receiveDrop)
    try {
      await view.pointer(view.drag, 'pointerdown', 10)
      await view.pointer(view.drag, 'pointerup', 10, 0)
      await act(async () => view.drag.click())
      assert.equal(readMediaPointerDragPayload(), null)
      assert.deepEqual(drops, [], 'ordinary grip clicks must not insert an image through the global drop owner')
      assert.deepEqual(view.seeks, [['clip', 4], ['clip', 4]])
    } finally { window.removeEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, receiveDrop) }
    await act(async () => {
      view.drag.focus()
      view.drag.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      view.drag.click()
    })
    assert.equal(view.outsideKeys(), 0, 'native activation must not trigger timeline shortcuts')
    assert.deepEqual(view.seeks, [['clip', 4], ['clip', 4], ['clip', 4]], 'drag-control activation seeks once')
    assert.equal(readMediaPointerDragPayload(), null, 'keyboard activation cannot leave a pointer drag armed')
    const preview = view.host.querySelector('[data-kg-video-sequence-clip-thumbnail-preview="1"]')
    assert.ok(preview?.tagName === 'FIGURE' && !!preview.querySelector('figcaption')?.textContent)
    assert.ok(!view.host.querySelector('[aria-hidden]'), 'preview metadata remains semantic and accessible')
  } finally { await view.dispose() }
})

test('thumbnail frame keeps click seek, pointer capture, move threshold and post-move click suppression', async () => {
  const view = await mountThumbnail()
  const captures: number[] = []
  view.figure.setPointerCapture = pointerId => captures.push(pointerId)
  try {
    await view.pointer(view.seek, 'pointerdown', 10)
    await view.pointer(view.seek, 'pointermove', 13)
    assert.deepEqual(view.moves, [])
    await view.pointer(view.seek, 'pointermove', 15)
    await view.pointer(view.seek, 'pointerup', 15, 0)
    assert.deepEqual(captures, [7])
    assert.deepEqual(view.moves, ['clip'])
    assert.equal(view.outsidePointers(), 0)
    await act(async () => view.seek.click())
    assert.deepEqual(view.seeks, [], 'the move release must not seek accidentally')
    await act(async () => view.seek.click())
    assert.deepEqual(view.seeks, [['clip', 4]])
    await view.pointer(view.seek, 'pointerdown', 10)
    await view.pointer(view.seek, 'pointercancel', 10, 0)
    await view.pointer(view.seek, 'pointermove', 20)
    assert.deepEqual(view.moves, ['clip'], 'cancel clears the move intent')
  } finally { await view.dispose() }
})

test('native thumbnail drag preserves raster payload, pointer delivery and HTML drag data without moving the clip', async () => {
  const view = await mountThumbnail()
  const data = new Map<string, string>()
  const transfer = { effectAllowed: 'none', setData: (type: string, value: string) => data.set(type, value) }
  const drops: CustomEvent[] = []
  const receiveDrop = (event: Event) => drops.push(event as CustomEvent)
  window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, receiveDrop)
  const dragEvent = async (type: string, x: number) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, { dataTransfer: { value: transfer }, clientX: { value: x }, clientY: { value: 10 } })
    await act(async () => { view.drag.dispatchEvent(event) })
  }
  try {
    await view.pointer(view.drag, 'pointerdown', 10, 2, 2)
    assert.equal(readMediaPointerDragPayload(), null, 'secondary presses do not arm frame drag')
    await view.pointer(view.drag, 'pointerdown', 10)
    await view.pointer(view.drag, 'pointermove', 20)
    assert.equal(readMediaPointerDragPayload()?.url, rasterDataUrl)
    assert.equal(view.outsidePointers(), 0)
    await dragEvent('dragstart', 10)
    const payload = JSON.parse(data.get(MEDIA_DRAG_PAYLOAD_MIME)!)
    assert.equal(transfer.effectAllowed, 'copy')
    assert.equal(payload.kind, 'image')
    assert.equal(payload.url, rasterDataUrl)
    assert.equal(payload.thumbnailUrl, rasterDataUrl)
    assert.equal(payload.mimeHint, 'image/png')
    assert.equal(payload.sourceKey, 'clip:5000000')
    assert.equal(data.get('text/uri-list'), rasterDataUrl)
    await dragEvent('dragend', 30)
    assert.equal(drops.length, 1)
    assert.equal(drops[0].detail.payload.url, rasterDataUrl)
    assert.equal(drops[0].detail.clientX, 30)
    assert.deepEqual(view.moves, [])
    assert.deepEqual(view.seeks, [], 'frame drag does not select or move the timeline clip')
    clearMediaPointerDragPayload()
    await view.pointer(view.drag, 'pointerdown', 10)
    await view.pointer(view.drag, 'pointermove', 20)
    await view.pointer(view.drag, 'pointercancel', 20, 0)
    await view.pointer(view.drag, 'pointerup', 20, 0)
    assert.equal(readMediaPointerDragPayload(), null)
    assert.equal(drops.length, 1, 'cancelled frame intent never reaches the drop owner')
  } finally { window.removeEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, receiveDrop); await view.dispose() }
})
