import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import RichMediaPanel from '@/components/RichMediaPanel'
import { getStoryboardWidgetPanelChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { useGraphStore } from '@/hooks/useGraphStore'
import { writeMediaDragPayload, type MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForNextFrame, waitForTasks } from '@/tests/lib/reactRootHarness'

const waitForBodyLink = async (container: HTMLElement, win: Window, url: string, maxFrames = 12) => {
  for (let i = 0; i < maxFrames; i += 1) {
    const link = Array.from(container.querySelectorAll('section a')).find(anchor =>
      String((anchor as HTMLAnchorElement).getAttribute('href') || '') === url,
    ) as HTMLAnchorElement | undefined
    if (link) return link
    await waitForNextFrame(win)
  }
  return null
}

const resetRichMediaPanelTestStoreState = () => {
  const state = useGraphStore.getState()
  try { state.setWorkspaceViewMode('canvas') } catch { void 0 }
  try { state.setWorkspaceCanvasPaneOpen(false) } catch { void 0 }
  try { state.setRichMediaPanelMode('snapshot') } catch { void 0 }
  try { state.setInfiniteCanvasInteractionMode('static') } catch { void 0 }
}

const createMediaDataTransfer = (payload: MediaDragPayload): DataTransfer => {
  const values = new Map<string, string>()
  const transfer = {
    dropEffect: '',
    effectAllowed: '',
    get types() {
      return Array.from(values.keys())
    },
    clearData: (type?: string) => {
      if (type) values.delete(type)
      else values.clear()
    },
    getData: (type: string) => values.get(type) || '',
    setData: (type: string, value: string) => {
      values.set(type, value)
    },
  } as unknown as DataTransfer
  writeMediaDragPayload(transfer, payload)
  return transfer
}

const dispatchMediaDrop = (win: Window, target: EventTarget, payload: MediaDragPayload) => {
  const EventCtor = (win as unknown as { Event: typeof Event }).Event
  const event = new EventCtor('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { configurable: true, value: createMediaDataTransfer(payload) })
  Object.defineProperty(event, 'clientX', { configurable: true, value: 12 })
  Object.defineProperty(event, 'clientY', { configurable: true, value: 12 })
  target.dispatchEvent(event)
}

const dispatchPanelPointerEvent = (
  target: EventTarget,
  win: Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  args: { pointerId?: number; clientX?: number; clientY?: number; button?: number; buttons?: number } = {},
) => {
  type MouseEventConstructorLike = new (eventType: string, eventInitDict?: Record<string, unknown>) => Event
  const MouseEventCtor = (win as unknown as { MouseEvent: MouseEventConstructorLike }).MouseEvent
  const event = new MouseEventCtor(type, {
    bubbles: true,
    cancelable: true,
    button: args.button ?? 0,
    buttons: args.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    clientX: args.clientX ?? 0,
    clientY: args.clientY ?? 0,
  })
  Object.defineProperty(event, 'pointerId', { configurable: true, value: args.pointerId ?? 1 })
  Object.defineProperty(event, 'pointerType', { configurable: true, value: 'mouse' })
  target.dispatchEvent(event)
}

export async function testRichMediaPanelRendersSnapshotForNonDirectIframe() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Example',
        url: 'https://example.com/embed',
        kind: 'iframe',
        hideUntilReady: true,
        interactive: false,
      }),
    { window: dom.window, frames: 20 })

    const iframes = Array.from(container.querySelectorAll('iframe'))
    if (iframes.length > 0) throw new Error('expected non-direct iframe to render snapshot, not iframe')
    const snapshots = Array.from(container.querySelectorAll('[data-kg-webpage-snapshot="1"]'))
    if (snapshots.length < 1) throw new Error('expected snapshot preview element')

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelClickToOpenUsesBodyNotHeader() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number; open?: (...args: unknown[]) => unknown }
    const opened: string[] = []
    anyWindow.open = (url?: unknown) => {
      opened.push(String(url || ''))
      return null
    }

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const url = 'https://example.com/embed'
    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Example',
        url,
        kind: 'iframe',
        hideUntilReady: true,
        interactive: false,
      }),
    { window: dom.window, frames: 20 })

    const bodyLink = await waitForBodyLink(container, dom.window, url)
    if (!bodyLink) throw new Error('expected body click-to-open overlay link')
    await act(async () => {
      bodyLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })
    if (opened[0] !== url) throw new Error(`expected body click to open ${url}; opened=${opened.join(',')}`)

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelImageRendersInlineWithoutBodyClickOverlay() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Generated image',
        url: '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.webp',
        openUrl: 'https://example.com/generated.webp',
        kind: 'image',
        hideUntilReady: true,
        interactive: false,
      }),
    { window: dom.window, frames: 20 })

    const image = container.querySelector('img') as HTMLImageElement | null
    if (!image) throw new Error('expected image media to render inline inside RichMediaPanel')
    if (image.getAttribute('src') !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.webp') {
      throw new Error(`expected inline image to keep proxied playback src, got ${String(image.getAttribute('src') || '')}`)
    }
    const bodyLink = container.querySelector('section a[href="https://example.com/generated.webp"]')
    if (bodyLink) throw new Error('expected inline image rendering to suppress the body click-to-open overlay')

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelVideoRendersInlineWithoutBodyClickOverlay() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Generated video',
        url: '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4',
        openUrl: 'https://example.com/generated.mp4',
        kind: 'video',
        hideUntilReady: true,
        interactive: false,
      }),
    { window: dom.window, frames: 20 })

    const video = container.querySelector('video') as HTMLVideoElement | null
    if (!video) throw new Error('expected video media to render inline inside RichMediaPanel')
    if (video.getAttribute('src') !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4') {
      throw new Error(`expected inline video to keep proxied playback src, got ${String(video.getAttribute('src') || '')}`)
    }
    const bodyLink = container.querySelector('section a[href="https://example.com/generated.mp4"]')
    if (bodyLink) throw new Error('expected inline video rendering to suppress the body click-to-open overlay')

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelBodyPanStartsWithoutSelectionGate() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const overlayEvents: string[] = []
    const headerEvents: string[] = []

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Pan body',
        url: '',
        kind: 'iframe',
        panelChrome: 'storyboardWidget',
        interactive: false,
        onOverlayPanStart: () => overlayEvents.push('start'),
        onOverlayPan: ({ dx, dy }) => overlayEvents.push(`move:${dx}:${dy}`),
        onOverlayPanEnd: () => overlayEvents.push('end'),
        onHeaderDragStart: () => headerEvents.push('start'),
        onHeaderDrag: () => headerEvents.push('move'),
        onHeaderDragEnd: () => headerEvents.push('end'),
      }),
    { window: dom.window, frames: 8 })

    const body = container.querySelector('[data-kg-rich-media-storyboard-widget-body="1"]') as HTMLElement | null
    if (!body) throw new Error('expected shared Storyboard Widget rich-media body surface')

    await act(async () => {
      dispatchPanelPointerEvent(body, dom.window, 'pointerdown', { pointerId: 21, clientX: 100, clientY: 100, buttons: 1 })
      dispatchPanelPointerEvent(dom.window, dom.window, 'pointermove', { pointerId: 21, clientX: 124, clientY: 138, buttons: 1 })
      dispatchPanelPointerEvent(dom.window, dom.window, 'pointerup', { pointerId: 21, clientX: 124, clientY: 138, buttons: 0 })
      await waitForNextFrame(dom.window)
    })

    if (overlayEvents.join('|') !== 'start|move:24:38|end') {
      throw new Error(`expected body pointer drag to start overlay pan without selected-first gating, got ${overlayEvents.join('|')}`)
    }
    if (headerEvents.length > 0) {
      throw new Error(`expected body pointer drag not to start header drag, got ${headerEvents.join('|')}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelHeaderDragIsScopedToChromeHeader() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const overlayEvents: string[] = []
    const headerEvents: string[] = []

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Drag header',
        url: '',
        kind: 'iframe',
        panelChrome: 'storyboardWidget',
        interactive: false,
        onOverlayPanStart: () => overlayEvents.push('start'),
        onOverlayPan: () => overlayEvents.push('move'),
        onOverlayPanEnd: () => overlayEvents.push('end'),
        onHeaderDragStart: () => headerEvents.push('start'),
        onHeaderDrag: ({ dx, dy }) => headerEvents.push(`move:${dx}:${dy}`),
        onHeaderDragEnd: () => headerEvents.push('end'),
      }),
    { window: dom.window, frames: 8 })

    const header = container.querySelector('[data-kg-rich-media-storyboard-widget-header="1"]') as HTMLElement | null
    if (!header) throw new Error('expected shared Storyboard Widget rich-media header surface')

    await act(async () => {
      dispatchPanelPointerEvent(header, dom.window, 'pointerdown', { pointerId: 22, clientX: 40, clientY: 40, buttons: 1 })
      dispatchPanelPointerEvent(dom.window, dom.window, 'pointermove', { pointerId: 22, clientX: 55, clientY: 64, buttons: 1 })
      dispatchPanelPointerEvent(dom.window, dom.window, 'pointerup', { pointerId: 22, clientX: 55, clientY: 64, buttons: 0 })
      await waitForNextFrame(dom.window)
    })

    if (headerEvents.join('|') !== 'start|move:15:24|end') {
      throw new Error(`expected header pointer drag to move the panel, got ${headerEvents.join('|')}`)
    }
    if (overlayEvents.length > 0) {
      throw new Error(`expected header pointer drag not to start body overlay pan, got ${overlayEvents.join('|')}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelPlayableMediaDoesNotStartOverlayPan() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const overlayEvents: string[] = []

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Playable media',
        url: 'https://example.com/generated.mp4',
        kind: 'video',
        panelChrome: 'storyboardWidget',
        interactive: true,
        onOverlayPanStart: () => overlayEvents.push('start'),
        onOverlayPan: () => overlayEvents.push('move'),
        onOverlayPanEnd: () => overlayEvents.push('end'),
      }),
    { window: dom.window, frames: 8 })

    const video = container.querySelector('video[data-kg-card-media-interactive="1"]') as HTMLVideoElement | null
    if (!video) throw new Error('expected playable shared card video surface')

    await act(async () => {
      dispatchPanelPointerEvent(video, dom.window, 'pointerdown', { pointerId: 23, clientX: 10, clientY: 10, buttons: 1 })
      dispatchPanelPointerEvent(dom.window, dom.window, 'pointermove', { pointerId: 23, clientX: 40, clientY: 40, buttons: 1 })
      dispatchPanelPointerEvent(dom.window, dom.window, 'pointerup', { pointerId: 23, clientX: 40, clientY: 40, buttons: 0 })
      await waitForNextFrame(dom.window)
    })

    if (overlayEvents.length > 0) {
      throw new Error(`expected playable media pointerdown to remain available for playback controls, got overlay events ${overlayEvents.join('|')}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelDirectIframeAndVideoKeepPlayableSurfaceWithForwarding() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const forwardWheelTo = () => doc.body

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Playable video',
        url: 'https://example.com/generated.mp4',
        kind: 'video',
        interactive: true,
        forwardWheelTo,
      }),
    { window: dom.window, frames: 10 })

    const video = container.querySelector('video') as HTMLVideoElement | null
    if (!video) throw new Error('expected shared card media video surface')
    if (!video.hasAttribute('controls')) throw new Error('expected video card media to expose playback controls')
    if (video.getAttribute('data-kg-card-media-interactive') !== '1') {
      throw new Error('expected playable video to mark the shared card media surface as interactive')
    }
    if (video.style.pointerEvents === 'none') {
      throw new Error('expected playable video pointer events to remain enabled even when canvas wheel forwarding exists')
    }

    await act(async () => {
      root.render(
        React.createElement(RichMediaPanel, {
          title: 'Playable YouTube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
          kind: 'iframe',
          interactive: true,
          forwardWheelTo,
        }),
      )
      await waitForFrames(dom.window, 10)
    })

    const iframe = container.querySelector('iframe[data-kg-card-media-iframe="1"]') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected direct YouTube/embed iframe to reuse the shared card media iframe surface')
    if (!String(iframe.getAttribute('src') || '').includes('youtube-nocookie.com/embed/')) {
      throw new Error(`expected YouTube link to resolve into a direct playable embed, got ${String(iframe.getAttribute('src') || '')}`)
    }
    if (iframe.getAttribute('data-kg-card-media-interactive') !== '1') {
      throw new Error('expected direct iframe embed to mark the shared card media surface as interactive')
    }
    if (iframe.style.pointerEvents === 'none') {
      throw new Error('expected direct iframe pointer events to remain enabled so click-to-play works')
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export function testRichMediaPanelAndStoryboardReuseSharedCardMediaSurface() {
  const root = process.cwd()
  const readSource = (...parts: string[]) => readFileSync(resolve(root, 'src', ...parts), 'utf8')
  const sharedCardMediaText = readSource('lib', 'cards', 'CardMediaPreview.tsx')
  const sharedCardMediaDropZoneText = readSource('lib', 'cards', 'CardMediaDropZone.tsx')
  const sharedCardMarkdownText = readSource('lib', 'cards', 'CardMarkdownPreview.tsx')
  const sharedCardMarkdownUtilsText = readSource('lib', 'cards', 'cardMarkdownPreviewUtils.ts')
  const sharedCardInlineMediaTokensText = readSource('lib', 'cards', 'cardInlineMediaTokens.ts')
  const sharedCardTextSurfaceFrameText = readSource('lib', 'cards', 'cardTextSurfaceFrame.ts')
  const sharedCardInlineText = readSource('lib', 'cards', 'CardInlineTextEditor.tsx')
  const sharedCardInlineTextSupport = readSource('lib', 'cards', 'CardInlineTextEditorSupport.ts')
  const sharedCardMediaUtilsText = readSource('lib', 'cards', 'cardMediaPreviewUtils.ts')
  const sharedResponsiveElementClassesText = readSource('lib', 'ui', 'responsiveElementClasses.ts')
  const sharedTextLayoutText = readSource('lib', 'ui', 'textLayout.ts')
  const sharedCardMarkdownChipStyleText = [sharedCardMarkdownUtilsText, sharedResponsiveElementClassesText, sharedTextLayoutText].join('\n')
  const richMediaPanelText = [
    readSource('components', 'RichMediaPanel.tsx'),
    readSource('components', 'RichMediaPanelDirectMediaSurface.tsx'),
    readSource('components', 'RichMediaPanelIframeSurface.tsx'),
    readSource('components', 'RichMediaPanelTextSurface.tsx'),
    readSource('components', 'RichMediaPanelContentSurface.tsx'),
    readSource('components', 'richMediaPanelSurfaceVariant.ts'),
    readSource('components', 'RichMediaPanelShell.tsx'),
    readSource('components', 'RichMediaPanel.types.ts'),
    readSource('components', 'useRichMediaPanelSurfaceState.ts'),
  ].join('\n')
  const renderConfigText = readSource('lib', 'config.render.ts')
  const canvasViewportText = readSource('components', 'CanvasViewport.tsx')
  const storyboardCanvasText = readSource('components', 'StoryboardCanvas.tsx')
  const storyboardCardMediaDropSlotText = readSource('components', 'StoryboardWidgetCanvas', 'StoryboardCardMediaDropSlot2d.tsx')
  const storyboardWidgetFormText = [
    readSource('components', 'StoryboardWidget', 'WidgetEditorForm.tsx'),
    readSource('components', 'StoryboardWidget', 'WidgetEditorFormContent.tsx'),
  ].join('\n')
  const storyboardWidgetPanelText = readSource('components', 'StoryboardWidget', 'WidgetEditorPanel.tsx')
  const storyboardWidgetPanelChromeText = readSource('components', 'StoryboardWidget', 'StoryboardWidgetPanelChrome.tsx')
  const storyboardWidgetPanelChromeClassNameText = readSource('components', 'StoryboardWidget', 'storyboardWidgetPanelChromeClassName.ts')
  const storyboardWidgetPanelChromeClassName = getStoryboardWidgetPanelChromeClassName()
  const flowCanvasOverlayText = readSource('components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const graphCanvasOverlayText = readSource('components', 'GraphCanvasRoot', 'components', 'RichMediaOverlayLayer2d.tsx')
  const graphHoverTooltipText = readSource('components', 'GraphHoverTooltip.tsx')
  const staticPreviewText = readSource('components', 'StaticRichMediaPanelPreview.tsx')
  const designFrameText = readSource('components', 'DesignCanvas', 'FrameShellLayer.tsx')
  const designMediaOverlayText = readSource('components', 'DesignCanvas', 'MediaOverlay.tsx')
  const designWireframeText = readSource('components', 'DesignCanvas', 'WireframePreviewLayer.tsx')
  const markdownDesignOverlayText = readSource('lib', 'markdown-edgeless', 'MarkdownDesignOverlay.impl.tsx')
  const animaticCanvasText = readSource('components', 'AnimaticCanvas.tsx')
  const markdownMediaUiText = readSource('lib', 'markdown-core', 'ui', 'MarkdownMediaUi.impl.tsx')
  const markdownInlineRendererText = readSource('lib', 'markdown-core', 'ui', 'MarkdownInlineRenderer.impl.tsx')
  const markdownInlineMediaDownloadText = readSource('lib', 'markdown-core', 'ui', 'MarkdownInlineMediaDownload.tsx')
  const safeHtmlRendererText = readSource('lib', 'markdown-core', 'ui', 'markdownPreviewLinks.safeHtml.render.tsx')
  const markdownPreviewViewerText = readSource('lib', 'markdown-core', 'ui', 'MarkdownPreviewViewer.impl.tsx')
  const markdownTokenRendererText = readSource('features', 'markdown', 'ui', 'MarkdownTokenRenderer.tsx')
  const markdownCodeBlockText = readSource('features', 'markdown', 'ui', 'MarkdownCodeBlock.tsx')
  const markdownTableBlockText = readSource('features', 'markdown', 'ui', 'MarkdownTableBlock.tsx')
  const plainMermaidDiagramText = readSource('features', 'markdown', 'ui', 'PlainMermaidDiagram.tsx')
  const kanbanMenuText = readSource('features', 'markdown', 'ui', 'kanban', 'kanbanMenu.ts')

  for (const snippet of ['export function CardMediaPreview', 'export function CardMediaEmptyPlaceholder', 'export function CardMediaLoadingSkeleton']) {
    if (!sharedCardMediaText.includes(snippet)) throw new Error(`expected shared card media owner to expose ${snippet}`)
  }
  for (const snippet of ['export function CardMarkdownPreview', 'MarkdownPreviewLazy']) {
    if (!sharedCardMarkdownText.includes(snippet)) throw new Error(`expected shared card markdown owner to expose ${snippet}`)
  }
  for (const snippet of ['CARD_MARKDOWN_CONTENT_CLASS_NAME', 'markdownCardPreviewMode', 'markdownForcePlainTables']) {
    if (!sharedCardMarkdownText.includes(snippet)) throw new Error(`expected shared card markdown owner to render compact Card markdown with ${snippet}`)
  }
  for (const snippet of [
    'export function hasCardMarkdownPreviewSyntax',
    'export function readCardMarkdownPreviewSourceLineRange',
    'export function buildCardMarkdownPreviewText',
    'CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME',
    'CARD_MARKDOWN_PREVIEW_CODE_CHROME_CLASS_NAME',
    'CARD_MARKDOWN_PREVIEW_CODE_SURFACE_PADDING_CLASS_NAME',
    'CARD_MARKDOWN_PREVIEW_EMBEDDED_SURFACE_CLASS_NAME',
    'CARD_MARKDOWN_PREVIEW_CODE_SURFACE_CLASS_NAME',
    'CARD_MARKDOWN_PREVIEW_MERMAID_SURFACE_CLASS_NAME',
    'CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME',
  ]) {
    if (!sharedCardMarkdownUtilsText.includes(snippet)) {
      throw new Error(`expected shared card markdown utility owner to expose ${snippet}`)
    }
  }
  if (!sharedCardInlineText.includes('hasCardMarkdownPreviewSyntax') || !sharedCardInlineText.includes('markdownPreview === true') || !sharedCardInlineTextSupport.includes("markdownPreview?: boolean | 'auto'")) {
    throw new Error('expected shared Storyboard card text editor to own optional card markdown preview rendering')
  }
  if (!sharedCardMediaUtilsText.includes('export function isDirectPlayableCardMedia')) {
    throw new Error('expected shared card media utility owner to expose direct playable media detection')
  }
  for (const snippet of [
    'export function useCardMediaDropZone',
    'export function CardMediaDropZoneFrame',
    'MEDIA_DROP_CONSUMES_CANVAS_DROP_ATTRIBUTE',
    'MEDIA_POINTER_DRAG_DROP_EVENT',
    'data-kg-card-media-drop-zone',
  ]) {
    if (!sharedCardMediaDropZoneText.includes(snippet)) {
      throw new Error(`expected shared card media drop-zone owner to expose ${snippet}`)
    }
  }
  if (!richMediaPanelText.includes("from '@/lib/cards/CardMediaPreview'")) {
    throw new Error('expected RichMediaPanel to reuse the shared card media surface')
  }
  if (
    !richMediaPanelText.includes("from '@/lib/cards/CardMediaDropZone'")
    || !richMediaPanelText.includes('data-kg-rich-media-media-drop-zone')
    || !richMediaPanelText.includes('onMediaDrop?: (payload: MediaDragPayload) => void')
  ) {
    throw new Error('expected RichMediaPanel Add text surface to reuse the shared card media drop-zone owner')
  }
  if (richMediaPanelText.includes("from '@/lib/cards/CardMarkdownPreview'") || richMediaPanelText.includes('MarkdownPreviewLazy')) {
    throw new Error('expected RichMediaPanel text mode to reach shared markdown rendering only through CardInlineTextEditor')
  }
  if (
    !richMediaPanelText.includes("from '@/lib/cards/CardInlineTextEditor'")
    || !richMediaPanelText.includes("from '@/lib/cards/cardTextSurfaceFrame'")
    || !richMediaPanelText.includes('data-kg-rich-media-card-text-frame="1"')
    || !richMediaPanelText.includes("data-kg-rich-media-inline-edit={model.panelTextEditable ? '1' : undefined}")
    || !richMediaPanelText.includes('editActivation="click"')
    || !richMediaPanelText.includes('onCommit={model.panelTextEditable ? nextValue => {')
    || !/props\.onPanelChange\?\.\(\{\s*activeTab: 'text',\s*freezeConnectedOutput: true,\s*text: nextText,/.test(richMediaPanelText)
  ) {
    throw new Error('expected RichMediaPanel text mode inline edits to reuse the shared Storyboard Card inline editor')
  }
  if (!sharedCardTextSurfaceFrameText.includes('CARD_TEXT_SURFACE_COLUMN_CLASS_NAME') || !sharedCardTextSurfaceFrameText.includes('rounded border bg-[color:var(--kg-panel-bg)]/70 p-1.5') || !sharedCardTextSurfaceFrameText.includes('CARD_TEXT_SURFACE_SCROLL_CLASS_NAME') || !sharedCardTextSurfaceFrameText.includes('overflow-y-auto overflow-x-hidden') || !sharedCardTextSurfaceFrameText.includes('CARD_TEXT_SURFACE_VIEW_CLASS_NAME') || !sharedCardTextSurfaceFrameText.includes('CARD_TEXT_SURFACE_EDIT_CLASS_NAME') || !sharedCardTextSurfaceFrameText.includes('CARD_TEXT_SURFACE_TEXT_CLASS_NAME') || !sharedCardTextSurfaceFrameText.includes('text-[10px] font-medium leading-4 text-[color:var(--kg-text-secondary)]')) {
    throw new Error('expected shared Card text surface frame owner to align Rich Media text panel and Storyboard Card text chrome')
  }
  if (
    richMediaPanelText.includes('CARD_MARKDOWN_PREVIEW_EMBEDDED_SURFACE_CLASS_NAME')
    || richMediaPanelText.includes('CARD_MARKDOWN_PREVIEW_EMBEDDED_MEDIA_SURFACE_CLASS_NAME')
    || richMediaPanelText.includes('CARD_MARKDOWN_PREVIEW_CODE_SURFACE_INSET_CSS_VALUE')
    || !richMediaPanelText.includes('CARD_MARKDOWN_PREVIEW_MEDIA_SHELL_CLASS_NAME')
    || !richMediaPanelText.includes('CARD_TEXT_SURFACE_SCROLL_CLASS_NAME')
    || !richMediaPanelText.includes("touchAction: 'pan-y'")
    || richMediaPanelText.includes("touchAction: 'pan-x pan-y'")
  ) {
    throw new Error('expected RichMediaPanel text mode to reuse the neutral Card scroll owner while iframe media uses the bounded Card media shell')
  }
  if (!richMediaPanelText.includes("from '@/lib/cards/cardMediaPreviewUtils'")) {
    throw new Error('expected RichMediaPanel to reuse the shared card media utility owner')
  }
  if (
    !storyboardWidgetPanelChromeText.includes('export function StoryboardWidgetPanelChromeHeader')
    || !storyboardWidgetPanelChromeClassNameText.includes('export const getStoryboardWidgetPanelChromeClassName')
    || !storyboardWidgetPanelChromeClassName.split(/\s+/).includes('border')
    || storyboardWidgetPanelChromeClassName.includes('shadow')
    || !storyboardWidgetPanelChromeText.includes('data-kg-rich-media-storyboard-widget-header')
    || !storyboardWidgetPanelText.includes("from '@/components/StoryboardWidget/StoryboardWidgetPanelChrome'")
    || !storyboardWidgetPanelText.includes("from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'")
    || !storyboardWidgetPanelText.includes('<StoryboardWidgetPanelChromeHeader')
  ) {
    throw new Error('expected Storyboard Widget panel chrome to be the reusable 2D panel UI owner')
  }
  if (storyboardWidgetPanelChromeClassNameText.includes('rounded-xl border shadow-lg') || richMediaPanelText.includes("borderRadius: '12px'") || richMediaPanelText.includes('0 10px 15px -3px')) throw new Error('expected Rich Media Panel and Storyboard Card to avoid conflicting frame variants downstream of shared chrome')
  if (
    !storyboardWidgetFormText.includes("import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'")
    || !storyboardWidgetFormText.includes('onCommit={setCompactPreviewText}')
    || !storyboardWidgetFormText.includes('markdownPreview="auto"')
    || storyboardWidgetFormText.includes('hasCardMarkdownPreviewSyntax(compactPreviewView.textValue)')
  ) {
    throw new Error('expected Widget compact text preview to reuse the shared Storyboard Card inline editor')
  }
  if (
    !storyboardWidgetPanelText.includes('const handleRichMediaPanelChange = richMediaWidgetPreview?.handleRichMediaPanelChange')
    || !storyboardWidgetPanelText.includes('onPanelChange={handleRichMediaPanelChange}')
  ) {
    throw new Error('expected RichMediaPanel widget body to pass the shared panel change owner into the reusable RichMediaPanel')
  }
  if (
    !richMediaPanelText.includes("from '@/components/StoryboardWidget/StoryboardWidgetPanelChrome'")
    || !richMediaPanelText.includes("panelChrome?: 'none' | 'storyboardWidget'")
    || !richMediaPanelText.includes('<StoryboardWidgetPanelChromeHeader')
    || !richMediaPanelText.includes('data-kg-rich-media-storyboard-widget-body="1"')
    || richMediaPanelText.includes('data-kg-rich-media-card-header')
    || richMediaPanelText.includes('PANEL_FRAME_HEADER_STYLE')
  ) {
    throw new Error('expected RichMediaPanel optional chrome to reuse the Storyboard Widget panel UI around the shared Card media body')
  }
  if (!renderConfigText.includes("flowchart: {\n    surfaceId: 'd3'") || !renderConfigText.includes("d3: {\n    surfaceId: 'd3'")) {
    throw new Error('expected D3 Graph and Flowchart renderers to share the D3 canvas surface')
  }
  if (
    !canvasViewportText.includes("const sharedGraphCanvasSurfaceActive = active2dSurface === 'd3'")
    || !canvasViewportText.includes('<SharedGraphCanvasLazy active />')
    || !canvasViewportText.includes('active2dSurface === \'storyboard\' ? <StoryboardWidgetCanvasLazy active storyboardWidgetSurfaceId="storyboard" storyboardCardsMode /> : null')
  ) {
    throw new Error('expected Storyboard to mount the Storyboard Widget canvas surface while D3 Graph stays graph-only')
  }
  if (!storyboardCanvasText.includes("from '@/lib/cards/CardMediaPreview'") || !storyboardCanvasText.includes('CardMediaPreview')) {
    throw new Error('expected Storyboard cards to reuse the shared card media surface')
  }
  if (
    !storyboardCardMediaDropSlotText.includes("from '@/lib/cards/CardMediaDropZone'")
    || !storyboardCardMediaDropSlotText.includes('<CardMediaDropZoneFrame')
    || !storyboardCardMediaDropSlotText.includes('data-kg-storyboard-card-media-drop')
  ) {
    throw new Error('expected Storyboard card media slots to reuse the shared card media drop-zone owner')
  }
  if (
    !storyboardCanvasText.includes('onMediaDrop={handlePanelMediaDrop}')
    || !storyboardCanvasText.includes('buildRichMediaPanelDroppedMediaProperties({ ...payload, url: cleanUrl, label })')
  ) {
    throw new Error('expected Storyboard Rich Media panels to persist dropped media through the shared RichMediaPanel media-property owner')
  }
  if (!storyboardCanvasText.includes('title="Reference"') || storyboardCanvasText.includes('<img src={reference.url}')) {
    throw new Error('expected Storyboard reference thumbnails to reuse the shared card media surface')
  }
  if (!storyboardCanvasText.includes('markdownPreview="auto"')) {
    throw new Error('expected Storyboard card text fields to enable shared card markdown rendering for structured syntax')
  }
  if (!storyboardWidgetFormText.includes("import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'")) {
    throw new Error('expected Storyboard Widget compact media previews to import the shared card media surface')
  }
  if (
    !storyboardWidgetFormText.includes("import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'")
    || !storyboardWidgetFormText.includes('markdownPreview="auto"')
    || !storyboardWidgetFormText.includes('onCommit={setCompactPreviewText}')
    || storyboardWidgetFormText.includes('hasCardMarkdownPreviewSyntax(compactPreviewView.textValue)')
  ) {
    throw new Error('expected Storyboard Widget compact text previews to reuse shared Card inline editing and markdown rendering for structured syntax')
  }
  if (!storyboardWidgetFormText.includes('kind={compactPreviewView.kind}') || storyboardWidgetFormText.includes('<img') || storyboardWidgetFormText.includes('<video')) {
    throw new Error('expected Storyboard Widget compact image/video previews to route through the shared card media surface')
  }
  if (!flowCanvasOverlayText.includes("import RichMediaPanel from '@/components/RichMediaPanel'") || !flowCanvasOverlayText.includes('panelChrome="storyboardWidget"')) {
    throw new Error('expected Flow Canvas rich media overlays to reuse Storyboard Widget RichMediaPanel chrome')
  }
  if (
    !flowCanvasOverlayText.includes('onMediaDrop={handleRichMediaPanelMediaDrop}')
    || !flowCanvasOverlayText.includes('buildRichMediaPanelDroppedMediaProperties({ ...payload, url: mediaUrl, label })')
  ) {
    throw new Error('expected Flow Canvas rich media overlays to persist dropped media through the shared RichMediaPanel media-property owner')
  }
  if (!graphCanvasOverlayText.includes("import RichMediaPanel from '@/components/RichMediaPanel'") || !graphCanvasOverlayText.includes('panelChrome="storyboardWidget"')) {
    throw new Error('expected D3 graph and Flowchart rich media overlays to reuse Storyboard Widget RichMediaPanel chrome')
  }
  if (!graphHoverTooltipText.includes("import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'") || graphHoverTooltipText.includes('<img')) {
    throw new Error('expected D3 graph hover thumbnails to reuse the shared card media surface')
  }
  if (
    !graphHoverTooltipText.includes("from '@/lib/ui/panelFrame'")
    || !graphHoverTooltipText.includes('PANEL_FRAME_FLOATING_ROOT_STYLE')
    || !graphHoverTooltipText.includes('data-kg-hover-panel-root')
    || graphHoverTooltipText.includes('contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text} shadow-md max-w-xs text-xs`}')
  ) {
    throw new Error('expected D3 graph hover panel chrome to reuse the shared Rich Media panel-frame surface')
  }
  if (
    !staticPreviewText.includes("import RichMediaPanel from '@/components/RichMediaPanel'")
    || !staticPreviewText.includes('panelChrome="storyboardWidget"')
    || staticPreviewText.includes('const titleWidth')
  ) {
    throw new Error('expected static renderer previews to delegate all rich-media Storyboard Widget chrome to RichMediaPanel')
  }
  if (
    !designFrameText.includes('<StaticRichMediaPanelPreview')
    || !designWireframeText.includes('<StaticRichMediaPanelPreview')
    || !designMediaOverlayText.includes('panelChrome="storyboardWidget"')
    || !markdownDesignOverlayText.includes('panelChrome="storyboardWidget"')
  ) {
    throw new Error('expected Design renderer previews and overlays to reuse Storyboard Widget RichMediaPanel chrome')
  }
  if (
    !markdownDesignOverlayText.includes("from '@/lib/cards/cardMarkdownPreviewUtils'")
    || !markdownDesignOverlayText.includes('buildCardMarkdownPreviewText({ block: b, markdownText: deferredMarkdownText })')
  ) {
    throw new Error('expected markdown design overlays to reuse the shared Card markdown preview text utility')
  }
  for (const forbiddenSnippet of ['b.preview.table.columns || []', "['```' + lang", "['```html'", 'b.preview.listItems.slice']) {
    if (markdownDesignOverlayText.includes(forbiddenSnippet)) {
      throw new Error(`expected markdown design overlay to avoid local Card markdown snippet reconstruction: ${forbiddenSnippet}`)
    }
  }
  if (/<(?:img|video|iframe)\b/.test(animaticCanvasText)) {
    throw new Error('expected Animatic renderer to avoid duplicate direct media preview tags')
  }
  if (!markdownMediaUiText.includes("from '@/lib/cards/CardMediaPreview'") || !markdownMediaUiText.includes('mediaThumbnailDataAttr')) {
    throw new Error('expected markdown image/video/iframe media to route through shared CardMediaPreview while preserving thumbnail affordances')
  }
  if (!markdownInlineRendererText.includes("from '@/lib/cards/CardMediaPreview'") || markdownInlineRendererText.includes('<img\\n          key={`${key}-image`}')) {
    throw new Error('expected inline markdown image syntax to route through shared CardMediaPreview')
  }
  if (!safeHtmlRendererText.includes("from '@/lib/cards/CardMediaPreview'") || safeHtmlRendererText.includes('<video src={src}') || safeHtmlRendererText.includes('<iframe src={src}')) {
    throw new Error('expected safe HTML image/video/iframe markdown surfaces to route through shared CardMediaPreview')
  }
  if (!markdownPreviewViewerText.includes('if (markdownCardPreviewMode) return previewContent') || !markdownPreviewViewerText.includes('data-kg-card-markdown-viewer')) {
    throw new Error('expected MarkdownPreviewViewer to expose a chrome-free Card markdown surface')
  }
  if (!markdownTokenRendererText.includes('const cardPreviewMode = markdownCardPreviewMode === true') || !markdownTokenRendererText.includes('markdownCardPreviewMode: cardPreviewMode')) {
    throw new Error('expected MarkdownTokenRenderer to propagate Card preview mode into block render opts')
  }
  if (!markdownCodeBlockText.includes('const cardPreviewMode = opts.markdownCardPreviewMode === true') || !markdownCodeBlockText.includes('cardPreviewMode ? null') || !markdownCodeBlockText.includes('aria-label={UI_COPY.markdownCodeBlockActionsLabel}')) {
    throw new Error('expected MarkdownCodeBlock to suppress document code actions only in Card preview mode')
  }
  if (
    !markdownTableBlockText.includes('CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME')
    || !markdownCodeBlockText.includes('CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME')
    || !markdownCodeBlockText.includes('CARD_MARKDOWN_PREVIEW_CODE_SURFACE_CLASS_NAME')
    || !markdownCodeBlockText.includes('codeFenceContentSurfaceClassName')
    || !markdownCodeBlockText.includes('codeBlockSpacingClassName')
  ) {
    throw new Error('expected Code and Table markdown blocks to reuse the shared Card preview chrome-free frame')
  }
  for (const [label, text] of [
    ['markdown media ui', markdownMediaUiText],
    ['markdown inline renderer', markdownInlineRendererText],
    ['safe HTML renderer', safeHtmlRendererText],
  ] as const) {
    if (!text.includes('CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME') || !(text.includes('markdownCardPreviewMode') || text.includes('cardPreviewMode'))) {
      throw new Error(`expected ${label} to reuse shared Card preview media chrome removal`)
    }
  }
  if (
    !sharedCardMarkdownUtilsText.includes('CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME')
    || !sharedCardMarkdownUtilsText.includes('CARD_MARKDOWN_PREVIEW_CHIP_CLASS_NAME')
    || !sharedCardMarkdownUtilsText.includes('CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME')
    || !sharedCardMarkdownUtilsText.includes('CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME')
    || !sharedCardMarkdownUtilsText.includes('readCardMarkdownPreviewMediaLabel')
    || !markdownInlineRendererText.includes('CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME')
    || !sharedCardMarkdownText.includes('CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME')
    || !sharedCardMarkdownText.includes('CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME')
    || !sharedCardMarkdownText.includes('data-kg-card-inline-media-pill="1"')
    || !sharedCardMarkdownText.includes('readCardInlineMediaTokens')
    || !sharedCardInlineMediaTokensText.includes('readCardMarkdownPreviewMediaLabel')
    || !safeHtmlRendererText.includes('CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME')
    || !markdownMediaUiText.includes('CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME')
  ) {
    throw new Error('expected card-preview inline image and video surfaces to use shared mention-style media pill classes')
  }
  if (
    !sharedCardMarkdownChipStyleText.includes('rounded-full')
    || !sharedCardMarkdownChipStyleText.includes('h-3')
    || !sharedCardMarkdownChipStyleText.includes('items-center')
    || !sharedCardMarkdownChipStyleText.includes('align-baseline')
    || !sharedCardMarkdownChipStyleText.includes('[font-size:inherit]')
    || !sharedCardMarkdownChipStyleText.includes('[line-height:inherit]')
    || !sharedCardMarkdownChipStyleText.includes('mr-1')
    || !sharedCardMarkdownChipStyleText.includes('kg-inline-chip-label-15ch')
    || !sharedCardMarkdownChipStyleText.includes('kg-inline-media-chip-shell-15ch')
    || !sharedCardMarkdownChipStyleText.includes('border-[color:var(--kg-border)]')
    || !sharedCardMarkdownChipStyleText.includes('text-[color:var(--kg-text-secondary)]')
  ) {
    throw new Error('expected card-preview inline image and video surfaces to reuse the shared Open brief chip styling with thumbnail and label')
  }
  if (
    !markdownInlineMediaDownloadText.includes('if (args.cardPreviewMode === true) return args.children')
    || !safeHtmlRendererText.includes('if (cardPreviewMode === true) return null')
  ) {
    throw new Error('expected Card markdown previews to keep media download affordances out of inline @ thumbnail pills')
  }
  if (
    !markdownCodeBlockText.includes('const baseMode: AnnotateDisplayMode = cardPreviewMode')
    || !markdownCodeBlockText.includes("? (isMermaidLang ? 'render' : defaultMode)")
    || !markdownCodeBlockText.includes('enablePanZoom={!cardPreviewMode}')
    || !plainMermaidDiagramText.includes('CARD_MARKDOWN_PREVIEW_MERMAID_SURFACE_CLASS_NAME')
    || !plainMermaidDiagramText.includes("style={cardPreviewMode ? { touchAction: 'pan-y' } : undefined}")
    || !plainMermaidDiagramText.includes("dangerouslySetInnerHTML={{ __html: selectedSvg }}")
  ) {
    throw new Error('expected MarkdownCodeBlock Card preview mode to render Mermaid as inline SVG while keeping non-Mermaid code fences as code')
  }
  if (richMediaPanelText.includes('function RichMediaEmptyCardPlaceholder') || richMediaPanelText.includes('function RichMediaLoadingSkeleton')) {
    throw new Error('expected RichMediaPanel to stop owning duplicate local card placeholder renderers')
  }
  if (storyboardCanvasText.includes("import { resolveIframeEmbed } from 'grph-shared/rich-media/iframe'")) {
    throw new Error('expected Storyboard iframe media rendering to route through shared card media')
  }
  if (!kanbanMenuText.includes('[data-kg-card-media-interactive="1"]')) {
    throw new Error('expected shared card media to be recognized as an interactive kanban card target')
  }
}

export async function testRichMediaPanelVideoBecomesVisibleOnLoadedMetadataWhenHideUntilReady() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Generated video',
        url: '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4',
        openUrl: 'https://example.com/generated.mp4',
        kind: 'video',
        hideUntilReady: true,
        interactive: false,
      }),
    { window: dom.window, frames: 4 })

    const article = container.querySelector('[data-kg-rich-media-panel="1"]') as HTMLElement | null
    const video = container.querySelector('video') as HTMLVideoElement | null
    if (!article || !video) throw new Error('expected inline video panel shell to render')
    if (article.style.opacity !== '0') throw new Error(`expected video panel to stay hidden before readiness, got opacity=${article.style.opacity}`)

    await act(async () => {
      video.dispatchEvent(new dom.window.Event('loadedmetadata'))
      await waitForFrames(dom.window, 4)
    })

    const loadedOpacity = String(article.style.getPropertyValue('opacity'))
    if (loadedOpacity !== '1') {
      throw new Error(`expected loadedmetadata to reveal hideUntilReady video panel, got opacity=${loadedOpacity}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelEmptyImageRendersPlaceholderInsteadOfBlankMedia() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Pending image',
        url: '',
        kind: 'image',
        interactive: false,
      }),
    { window: dom.window, frames: 20 })

    const placeholder = container.querySelector('[data-kg-rich-media-empty-card-placeholder="1"]') as HTMLElement | null
    if (!placeholder) throw new Error('expected empty image panel to render the shared empty-state placeholder')
    if (placeholder.getAttribute('data-kg-rich-media-empty-card-static') !== '1') {
      throw new Error('expected empty image placeholder to render as a static indicator instead of a loading shimmer')
    }
    if (!/Waiting for image content/i.test(placeholder.textContent || '')) {
      throw new Error(`expected image placeholder copy, got ${String(placeholder.textContent || '')}`)
    }
    if (container.querySelector('img')) throw new Error('expected empty image panel to avoid mounting a blank img tag')

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelEmptyVideoRendersPlaceholderInsteadOfBlankMedia() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Pending video',
        url: '',
        kind: 'video',
        interactive: false,
      }),
    { window: dom.window, frames: 20 })

    const placeholder = container.querySelector('[data-kg-rich-media-empty-card-placeholder="1"]') as HTMLElement | null
    if (!placeholder) throw new Error('expected empty video panel to render the shared empty-state placeholder')
    if (placeholder.getAttribute('data-kg-rich-media-empty-card-static') !== '1') {
      throw new Error('expected empty video placeholder to render as a static indicator instead of a loading shimmer')
    }
    if (!/Waiting for video content/i.test(placeholder.textContent || '')) {
      throw new Error(`expected video placeholder copy, got ${String(placeholder.textContent || '')}`)
    }
    if (container.querySelector('video')) throw new Error('expected empty video panel to avoid mounting a blank video tag')

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelStoryboardWidgetChromeWrapsSharedCardBody() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Rich Media Panel - Storyboard Widget Chrome',
        url: '',
        kind: 'iframe',
        interactive: false,
        panelChrome: 'storyboardWidget',
        onHeaderTogglePinned: () => undefined,
        onHeaderToggleMinimized: () => undefined,
        style: {
          display: 'block',
          width: 226,
          height: 163,
        },
        panel: {
          activeTab: 'text',
          freezeConnectedOutput: false,
          hasText: true,
          hasImage: false,
          hasVideo: false,
          hasAudio: false,
          hasPoi: false,
          text: '',
          connectedText: [
            '> Shared card quote',
            '',
            '```ts',
            'const storyboardWidgetChrome = true',
            '```',
            '',
            '![preview](https://example.com/preview.png)',
          ].join('\n'),
        },
      }),
    { window: dom.window, frames: 28 })

    const panel = container.querySelector('[data-kg-rich-media-panel="1"]')
    if (!panel) throw new Error('expected RichMediaPanel root')
    if (panel.getAttribute('data-kg-rich-media-storyboard-widget-chrome') !== '1') {
      throw new Error('expected RichMediaPanel root to expose Storyboard Widget chrome marker')
    }
    const panelEl = panel as HTMLElement
    if (panelEl.style.display !== 'flex' || panelEl.style.flexDirection !== 'column') {
      throw new Error(`expected Storyboard Widget chrome root to preserve shared flex frame after overlay styles, got display=${panelEl.style.display} flexDirection=${panelEl.style.flexDirection}`)
    }
    const header = panel.querySelector('[data-kg-rich-media-storyboard-widget-header="1"]')
    if (!header) throw new Error('expected shared RichMediaPanel Storyboard Widget chrome header')
    if (!/Rich Media Panel - Storyboard Widget Chrome/.test(header.textContent || '')) {
      throw new Error(`expected Storyboard Widget chrome header to render the panel title, html=${container.innerHTML}`)
    }
    if (header.querySelectorAll('button').length !== 2) {
      throw new Error(`expected Storyboard Widget chrome header to render only the shared pin and minimize actions, html=${container.innerHTML}`)
    }
    const body = panel.querySelector('[data-kg-rich-media-storyboard-widget-body="1"]')
    if (!body) throw new Error('expected shared RichMediaPanel Storyboard Widget chrome body')
    if (!body.querySelector('[data-kg-rich-media-card-text-frame="1"]')) throw new Error('expected Storyboard Widget chrome body to align Rich Media text panel with the shared Card text frame')
    if (!body.querySelector('[data-kg-rich-media-card-text-scroll="1"]')) throw new Error('expected Storyboard Widget chrome body to reuse the shared Card text scroll surface')
    if (!body.querySelector('[data-kg-card-markdown-preview="1"]')) {
      throw new Error('expected Storyboard Widget chrome body to reuse shared CardMarkdownPreview')
    }
    if (container.querySelector('[aria-label="Markdown sidebar"]')) {
      throw new Error('expected Storyboard Widget chrome body to avoid document markdown sidebar chrome')
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}
