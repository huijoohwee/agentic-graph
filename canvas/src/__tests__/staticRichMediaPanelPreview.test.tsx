import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { StaticRichMediaPanelPreview } from '@/components/StaticRichMediaPanelPreview'

const tick = async (win: Window) => {
  const anyWindow = win as unknown as { requestAnimationFrame?: (cb: () => void) => number }
  await new Promise<void>(resolve => {
    const raf = anyWindow.requestAnimationFrame
    if (raf) {
      raf(() => resolve())
      return
    }
    setTimeout(() => resolve(), 0)
  })
}

export async function testStaticRichMediaPanelPreviewRendersImageVideoAndIframe() {
  const { dom, restore } = initJsdomHarness()
  const prevFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  try {
    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async (input: unknown) => {
      const url = String(input || '')
      if (url.startsWith('/__webpage_proxy?')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => '<!doctype html><html><head><title>OK</title></head><body><h1>Embed</h1></body></html>',
        } as unknown as Response
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => '',
      } as unknown as Response
    }) as unknown

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await act(async () => {
      root.render(
        React.createElement(
          'svg',
          { width: 600, height: 240 },
          React.createElement(StaticRichMediaPanelPreview, {
            tag: 'IMG',
            url: 'https://example.com/image.png',
            titleChip: 'Image',
            innerX: 10,
            innerY: 10,
            innerW: 180,
            innerH: 120,
            interactive: false,
          }),
          React.createElement(StaticRichMediaPanelPreview, {
            tag: 'VIDEO',
            url: 'https://example.com/video.mp4',
            titleChip: 'Video',
            innerX: 210,
            innerY: 10,
            innerW: 180,
            innerH: 120,
            interactive: false,
          }),
          React.createElement(StaticRichMediaPanelPreview, {
            tag: 'IFRAME',
            url: 'https://www.citriniresearch.com/p/2028gic',
            titleChip: 'IFrame',
            innerX: 410,
            innerY: 10,
            innerW: 85,
            innerH: 120,
            interactive: false,
          }),
          React.createElement(StaticRichMediaPanelPreview, {
            tag: 'IFRAME',
            url: 'https://docs.fixture.invalid/articles/sample-article',
            titleChip: 'IFrame',
            innerX: 505,
            innerY: 10,
            innerW: 85,
            innerH: 120,
            interactive: false,
          }),
        ),
      )
      for (let i = 0; i < 6; i += 1) await tick(dom.window as unknown as Window)
    })

    const image = doc.querySelector('img') as HTMLImageElement | null
    if (!image) throw new Error('expected shared RichMediaPanel image element')
    if (!String(image.getAttribute('src') || '').includes('/__fetch_remote?url=')) {
      throw new Error('expected image src to use media proxy on localhost')
    }

    const video = doc.querySelector('video') as HTMLVideoElement | null
    if (!video) throw new Error('expected video element')
    if (!String(video.getAttribute('src') || '').includes('/__fetch_remote?url=')) {
      throw new Error('expected video src to use media proxy on localhost')
    }

    const iframes = Array.from(doc.querySelectorAll('iframe')) as HTMLIFrameElement[]
    const snapshots = Array.from(doc.querySelectorAll('[data-kg-webpage-snapshot="1"]')) as HTMLElement[]
    if (iframes.length + snapshots.length < 2) {
      throw new Error(`expected webpage iframe or snapshot previews to render, iframes=${iframes.length} snapshots=${snapshots.length}`)
    }
    for (const iframe of iframes) {
      const srcdoc = iframe.getAttribute('srcdoc') || ''
      if (!srcdoc.trim()) throw new Error('expected iframe srcdoc to be populated')
    }
    const storyboardWidgetHeaders = Array.from(doc.querySelectorAll('[data-kg-rich-media-storyboard-widget-header="1"]'))
    if (storyboardWidgetHeaders.length !== 4) {
      throw new Error(`expected static rich media previews to reuse RichMediaPanel Storyboard Widget chrome, got ${storyboardWidgetHeaders.length}`)
    }
    const svgTitleText = Array.from(doc.querySelectorAll('svg > g > text'))
    if (svgTitleText.length !== 0) {
      throw new Error(`expected static rich media previews to avoid stale SVG title-chip text, got ${svgTitleText.length}`)
    }

    const openSourceButtons = Array.from(doc.querySelectorAll('[data-kg-rich-media-open-source="1"]'))
    if (openSourceButtons.length !== 0) {
      throw new Error(`expected static rich media previews to avoid widget floating-toolbar actions outside widget mode, got ${openSourceButtons.length}`)
    }
    const floatingToolbars = Array.from(doc.querySelectorAll('[data-kg-rich-media-floating-toolbar="1"]'))
    if (floatingToolbars.length !== 0) {
      throw new Error(`expected static rich media previews to avoid the widget-like floating toolbar shell outside widget mode, got ${floatingToolbars.length}`)
    }

    await act(async () => {
      root.unmount()
    })
  } finally {
    ;(globalThis as unknown as { fetch?: unknown }).fetch = prevFetch
    restore()
  }
}
