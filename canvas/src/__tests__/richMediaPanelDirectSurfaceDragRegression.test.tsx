import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import RichMediaPanel from '@/components/RichMediaPanel'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { useRichMediaPanelMediaState } from '@/components/useRichMediaPanelMediaState'
import { MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR } from '@/lib/cards/mediaPreviewSurfaceSelection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForNextFrame } from '@/tests/lib/reactRootHarness'

const resetRichMediaPanelDragState = () => {
  const state = useGraphStore.getState()
  try { state.setWorkspaceViewMode('canvas') } catch { void 0 }
  try { state.setWorkspaceCanvasPaneOpen(false) } catch { void 0 }
  try { state.setRichMediaPanelMode('snapshot') } catch { void 0 }
  try { state.setInfiniteCanvasInteractionMode('static') } catch { void 0 }
}

const dispatchPointerEvent = (
  target: EventTarget,
  win: Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  args: { pointerId?: number; clientX?: number; clientY?: number; button?: number; buttons?: number } = {},
) => {
  type EventConstructorLike = new (eventType: string, eventInitDict?: Record<string, unknown>) => Event
  const MouseEventCtor = (win as unknown as { MouseEvent: EventConstructorLike }).MouseEvent
  const event = new MouseEventCtor(type, {
    bubbles: true,
    cancelable: true,
    button: args.button ?? 0,
    buttons: args.buttons ?? (type === 'pointerup' ? 0 : 1),
    clientX: args.clientX ?? 0,
    clientY: args.clientY ?? 0,
  })
  Object.defineProperty(event, 'pointerId', { configurable: true, value: args.pointerId ?? 1 })
  Object.defineProperty(event, 'pointerType', { configurable: true, value: 'mouse' })
  target.dispatchEvent(event)
}

export async function testRichMediaPanelDirectImageSurfaceStartsOverlayDrag() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelDragState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const overlayEvents: string[] = []

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Generated image',
        url: 'https://example.com/generated.png',
        kind: 'image',
        panelChrome: 'storyboardWidget',
        interactive: false,
        onOverlayPanStart: () => overlayEvents.push('start'),
        onOverlayPan: ({ dx, dy }) => overlayEvents.push(`move:${dx}:${dy}`),
        onOverlayPanEnd: () => overlayEvents.push('end'),
      }),
    { window: dom.window, frames: 12 })

    const selector = `[${MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR}="1"]`
    const image = container.querySelector(`img${selector}`) as HTMLImageElement | null
    const frame = container.querySelector(selector) as HTMLElement | null
    const target = image || frame
    if (!target) throw new Error('expected direct Rich Media image to expose the shared selectable surface marker')

    await act(async () => {
      dispatchPointerEvent(target, dom.window, 'pointerdown', { pointerId: 41, clientX: 10, clientY: 20, buttons: 1 })
      dispatchPointerEvent(dom.window, dom.window, 'pointermove', { pointerId: 41, clientX: 42, clientY: 45, buttons: 1 })
      dispatchPointerEvent(dom.window, dom.window, 'pointerup', { pointerId: 41, clientX: 42, clientY: 45, buttons: 0 })
      await waitForNextFrame(dom.window)
    })

    if (overlayEvents.join('|') !== 'start|move:32:25|end') {
      throw new Error(`expected direct image surface pointer drag to move the Rich Media panel, got ${overlayEvents.join('|')}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelBodyUsesPanelDragAndPreservesControls() {
  const { dom, restore } = initJsdomHarness()
  try {
    resetRichMediaPanelDragState()
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    const events: string[] = []
    await mountReactRoot(root, React.createElement(RichMediaPanel, {
      title: 'Draggable figure', url: 'https://assets.example.test/figure.png', kind: 'image',
      panelChrome: 'storyboardWidget', interactive: false,
      onHeaderDragStart: () => events.push('start'),
      onHeaderDrag: ({ dx, dy }) => events.push(`move:${dx}:${dy}`),
      onHeaderDragEnd: () => events.push('end'),
      onOverlayPanStart: () => events.push('pan'),
      onOverlayPan: () => {}, onOverlayPanEnd: () => {},
    }), { window: dom.window, frames: 12 })
    const body = container.querySelector(`section[${MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR}="1"]`)
    if (!body) throw new Error('expected semantic image body')
    await act(async () => {
      dispatchPointerEvent(body, dom.window, 'pointerdown', { pointerId: 72, clientX: 10, clientY: 20 })
      dispatchPointerEvent(dom.window, dom.window, 'pointermove', { pointerId: 72, clientX: 50, clientY: 55 })
      dispatchPointerEvent(dom.window, dom.window, 'pointerup', { pointerId: 72, clientX: 50, clientY: 55 })
      await waitForNextFrame(dom.window)
    })
    if (events.join('|') !== 'start|move:40:35|end') throw new Error(`body must drag panel once: ${events}`)
    events.length = 0
    const link = dom.window.document.createElement('a')
    link.href = '#download'
    body.appendChild(link)
    dispatchPointerEvent(link, dom.window, 'pointerdown', { pointerId: 73 })
    if (events.length) throw new Error('native links must retain their own gestures')
    await act(async () => {
      dispatchPointerEvent(body, dom.window, 'pointerdown', { pointerId: 74, button: 1, buttons: 4 })
      dispatchPointerEvent(dom.window, dom.window, 'pointerup', { pointerId: 74, button: 1 })
    })
    if (events.join('|') !== 'pan') throw new Error('middle-button body gesture must retain canvas pan')
    await unmountReactRoot(root, { window: dom.window })
  } finally { restore() }
  await testVideoRefLifecycleWithParentMediaState()
}

async function testVideoRefLifecycleWithParentMediaState() {
  const { restore } = initJsdomHarness(), host = document.createElement('section')
  document.body.append(host); const root = createRoot(host)
  const calls: { owner: string; element: HTMLMediaElement | null }[] = []
  const videoCalls: (HTMLVideoElement | null)[] = []
  let checking = true, unmounted = false
  const observer = (owner: string) => (element: HTMLMediaElement | null) => {
    if (checking && calls.length >= 8) throw new Error('video ref feedback exceeded bounded attachment budget')
    calls.push({ owner, element })
  }
  const first = observer('first'), replacement = observer('replacement')
  const onVideoElement = (element: HTMLVideoElement | null) => { videoCalls.push(element) }
  function Harness({ title, onMediaElement, url = '/ref-lifecycle.mp4' }: { title: string; onMediaElement: typeof first; url?: string }) {
    const model = useRichMediaPanelMediaState({ overlayId: 'ref-lifecycle-test', kind: 'video',
      url, title, onMediaElement, onVideoElement })
    return <CardMediaPreview kind="video" url={url} title={title}
      onMediaElement={model.handleDirectMediaElement} onVideoElement={model.handleDirectVideoElement} />
  }
  try {
    await act(async () => root.render(<Harness title="First title" onMediaElement={first} />))
    const video = host.querySelector('video')
    if (!video || calls.length !== 1 || calls[0].element !== video || videoCalls.length !== 1 || videoCalls[0] !== video) {
      throw new Error('initial video attachment must notify each observer exactly once despite parent state update')
    }
    await act(async () => root.render(<Harness title="Unrelated title change" onMediaElement={first} />))
    if (Number(calls.length) !== 1 || Number(videoCalls.length) !== 1 || host.querySelector('video') !== video) {
      throw new Error('unrelated rerender must preserve video attachment and both stable observers')
    }
    await act(async () => root.render(<Harness title="Another source" url="/another-source.mp4" onMediaElement={first} />))
    if (Number(calls.length) !== 1 || Number(videoCalls.length) !== 1 || host.querySelector('video') !== video
      || video.getAttribute('src') !== '/another-source.mp4') {
      throw new Error('source replacement must update the retained video without ref notifications')
    }
    await act(async () => root.render(<Harness title="Unrelated title change" onMediaElement={replacement} />))
    if (Number(calls.length) !== 3 || calls[1].owner !== 'first' || calls[1].element !== null
      || calls[2].owner !== 'replacement' || calls[2].element !== video || host.querySelector('video') !== video) {
      throw new Error('callback replacement must detach old observer and attach new observer to the same video')
    }
    if (Number(videoCalls.length) !== 3 || videoCalls[1] !== null || videoCalls[2] !== video) {
      throw new Error('combined video ref replacement must preserve video observer notifications')
    }
    await act(async () => root.unmount()); unmounted = true
    if (Number(calls.length) !== 4 || calls[3].owner !== 'replacement' || calls[3].element !== null
      || Number(videoCalls.length) !== 4 || videoCalls[3] !== null) {
      throw new Error('unmount must notify current observers exactly once with null')
    }
  } finally {
    checking = false
    try { if (!unmounted) await act(async () => root.unmount()) }
    finally { host.remove(); restore() }
  }
}
