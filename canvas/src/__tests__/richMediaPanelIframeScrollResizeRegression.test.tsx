import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import RichMediaPanel from '@/components/RichMediaPanel'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeRichMediaPanelInlineSrcDoc } from '@/lib/render/richMediaPanelSrcDoc'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES } from '@/lib/ui/surfaceClasses'

const resetRichMediaPanelTestStoreState = () => {
  const state = useGraphStore.getState()
  try { state.setWorkspaceViewMode('canvas') } catch { void 0 }
  try { state.setWorkspaceCanvasPaneOpen(false) } catch { void 0 }
  try { state.setRichMediaPanelMode('snapshot') } catch { void 0 }
  try { state.setInfiniteCanvasInteractionMode('static') } catch { void 0 }
}

async function renderInlineSrcDocPanel(srcDoc: string, options: { scrollOwner?: 'media' | 'panel' } = {}) {
  const bootstrap = initJsdomHarness()
  resetRichMediaPanelTestStoreState()
  const doc = bootstrap.dom.window.document
  const container = doc.createElement('section')
  container.id = 'root'
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  await mountReactRoot(root,
    React.createElement(RichMediaPanel, {
      title: 'Inline srcdoc panel',
      url: '',
      kind: 'iframe',
      srcDoc,
      frameMode: 'surface',
      scrollOwner: options.scrollOwner || 'panel',
    }),
  { window: bootstrap.dom.window, frames: 12 })
  return { ...bootstrap, container, root }
}

export async function testRichMediaPanelViewportSrcDocKeepsIframeScrollingEnabled() {
  const srcDoc = '<main data-kg-rich-media-panel-size="viewport"><section><table><tbody><tr><td>Scrollable table</td></tr></tbody></table></section></main>'
  const { container, dom, restore, root } = await renderInlineSrcDocPanel(srcDoc, { scrollOwner: 'panel' })
  try {
    const iframe = container.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected viewport srcdoc RichMediaPanel to render an iframe')
    const surfaceArea = container.querySelector('[data-kg-rich-media-panel="1"] > [data-kg-view-edit-surface-area]')
    if (!(surfaceArea instanceof dom.window.HTMLElement) || surfaceArea.getAttribute('data-kg-view-edit-surface-area') !== UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES['data-kg-view-edit-surface-area']) {
      throw new Error('expected Rich Media iframe to reuse the shared view/edit area contract')
    }
    if (iframe.getAttribute('scrolling') !== 'auto') {
      throw new Error(`expected viewport srcdoc iframe to keep native scrolling enabled, got ${iframe.getAttribute('scrolling')}`)
    }
    if (iframe.style.pointerEvents === 'none') {
      throw new Error('expected viewport srcdoc iframe to stay pointer-targetable for scroll gestures')
    }
    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restore()
  }
}

export async function testRichMediaPanelMeasuredSrcDocKeepsPanelOwnedScrolling() {
  const { container, dom, restore, root } = await renderInlineSrcDocPanel('<main><section><p>Measured chart body</p></section></main>')
  try {
    const iframe = container.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected measured srcdoc RichMediaPanel to render an iframe')
    if (iframe.getAttribute('scrolling') !== 'no') {
      throw new Error(`expected measured srcdoc iframe to keep panel-owned scrolling, got ${iframe.getAttribute('scrolling')}`)
    }
    if (iframe.style.pointerEvents !== 'none') {
      throw new Error(`expected measured srcdoc iframe to release pointer events to the panel scroll owner, got ${iframe.style.pointerEvents}`)
    }
    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restore()
  }
}

export async function testRichMediaPanelViewportSrcDocCanRequestPanelOwnedScrolling() {
  const srcDoc = '<main data-kg-rich-media-panel-size="viewport" data-kg-rich-media-panel-scroll-owner="panel"><section><table><tbody><tr><td>Panel-owned viewport table</td></tr></tbody></table></section></main>'
  const { container, dom, restore, root } = await renderInlineSrcDocPanel(srcDoc, { scrollOwner: 'media' })
  try {
    const iframe = container.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected panel-scroll viewport srcdoc RichMediaPanel to render an iframe')
    if (iframe.getAttribute('scrolling') !== 'no') {
      throw new Error(`expected panel-scroll viewport srcdoc iframe to disable native iframe scrolling, got ${iframe.getAttribute('scrolling')}`)
    }
    if (iframe.style.pointerEvents !== 'none') {
      throw new Error(`expected panel-scroll viewport srcdoc iframe to release pointer events to the panel scroll owner, got ${iframe.style.pointerEvents}`)
    }
    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restore()
  }
}

export function testRichMediaPanelIframeScrollResizeSourceContract() {
  const root = process.cwd()
  const mediaStateText = readFileSync(resolve(root, 'src', 'components', 'useRichMediaPanelMediaState.ts'), 'utf8')
  const surfaceStateText = readFileSync(resolve(root, 'src', 'components', 'useRichMediaPanelSurfaceState.ts'), 'utf8')
  const iframeSurfaceText = readFileSync(resolve(root, 'src', 'components', 'RichMediaPanelIframeSurface.tsx'), 'utf8')
  const cssText = readFileSync(resolve(root, 'src', 'index.css'), 'utf8')
  if (!mediaStateText.includes('shouldUseViewportRichMediaPanelSrcDocSize(effectiveInlineSrcDoc)')) {
    throw new Error('expected viewport srcdoc sizing to be detected from authored srcdoc before timeline bridge injection')
  }
  if (!mediaStateText.includes('shouldUsePanelOwnedRichMediaPanelSrcDocScroll(effectiveInlineSrcDoc)')) {
    throw new Error('expected srcdoc-authored panel scroll ownership to be detected from authored srcdoc')
  }
  if (!mediaStateText.includes("inlineSrcDocRequestsPanelScroll ? 'panel' : inlineSrcDocRequestsMediaScroll ? 'media' : declaredScrollOwner")) {
    throw new Error('expected srcdoc-authored panel scroll ownership to override caller default scroll ownership')
  }
  if (!mediaStateText.includes('scrollOwner,') || !mediaStateText.includes('normalizeRichMediaPanelInlineSrcDoc({')) {
    throw new Error('expected the resolved Rich Media scroll owner to drive srcdoc normalization')
  }
  if (!surfaceStateText.includes('(!mediaState.inlineSrcDocUsesViewportSize || mediaState.inlineSrcDocRequestsPanelScroll)')) {
    throw new Error('expected viewport-sized srcdoc iframes to opt into panel-owned scroll only when requested')
  }
  if (!iframeSurfaceText.includes("iframeScrolling={model.panelOwnsInlineSrcDocScroll ? 'no' : 'auto'}")) {
    throw new Error('expected iframe-owned srcdoc panels to keep native iframe scrolling enabled')
  }
  if (!cssText.includes('body.kg-pointer-drag-active iframe') || !cssText.includes('pointer-events: none !important')) {
    throw new Error('expected active shared pointer drags to shield iframes so Rich Media resize remains smooth')
  }
}

export function testRichMediaPanelViewportSrcDocPreservesDocumentOverflow() {
  const viewportDoc = normalizeRichMediaPanelInlineSrcDoc({
    srcDoc: '<main data-kg-rich-media-panel-size="viewport"><section><table><tbody><tr><td>Native iframe scroll</td></tr></tbody></table></section></main>',
    title: 'Viewport scroll',
  })
  if (viewportDoc.includes('document.documentElement.style.overflow="hidden"') || viewportDoc.includes('document.body.style.overflow="hidden"')) {
    throw new Error('expected viewport srcdoc normalization to preserve document overflow for native iframe scrolling')
  }

  const measuredDoc = normalizeRichMediaPanelInlineSrcDoc({
    srcDoc: '<main><section><p>Measured panel scroll</p></section></main>',
    title: 'Measured scroll',
  })
  if (!measuredDoc.includes('document.documentElement.style.overflow="hidden"') || !measuredDoc.includes('document.body.style.overflow="hidden"')) {
    throw new Error('expected measured srcdoc normalization to keep overflow clamped for panel-owned scrolling')
  }

  const panelScrollViewportDoc = normalizeRichMediaPanelInlineSrcDoc({
    srcDoc: '<main data-kg-rich-media-panel-size="viewport" data-kg-rich-media-panel-scroll-owner="panel"><section><table><tbody><tr><td>Panel scroll</td></tr></tbody></table></section></main>',
    title: 'Panel scroll viewport',
  })
  if (!panelScrollViewportDoc.includes('document.documentElement.style.overflow="hidden"') || !panelScrollViewportDoc.includes('document.body.style.overflow="hidden"')) {
    throw new Error('expected panel-scroll viewport srcdoc normalization to clamp iframe document overflow for panel-owned scrolling')
  }
}

export function testRichMediaPanelMediaOwnedSrcDocUsesBoundedScrollableViewport() {
  const mediaOwnedDoc = normalizeRichMediaPanelInlineSrcDoc({
    srcDoc: '<main><section><p>Scrollable media content</p></section></main>',
    title: 'Media-owned scroll',
    scrollOwner: 'media',
  })
  for (const snippet of [
    'html,body{height:100%;min-height:0!important;overflow:hidden!important}',
    'height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important',
    'overscroll-behavior:contain;scrollbar-gutter:stable',
  ]) {
    if (!mediaOwnedDoc.includes(snippet)) {
      throw new Error(`expected media-owned srcdoc to keep its scroll viewport inside the responsive panel frame: ${snippet}`)
    }
  }
  if (mediaOwnedDoc.includes('document.documentElement.style.overflow="hidden"') || mediaOwnedDoc.includes('document.body.style.overflow="hidden"')) {
    throw new Error('expected media-owned srcdoc normalization to avoid the legacy resize-script overflow clamp')
  }

  const panelOwnedDoc = normalizeRichMediaPanelInlineSrcDoc({
    srcDoc: '<main><section><p>Measured panel content</p></section></main>',
    title: 'Panel-owned scroll',
    scrollOwner: 'panel',
  })
  if (!panelOwnedDoc.includes('document.documentElement.style.overflow="hidden"') || !panelOwnedDoc.includes('document.body.style.overflow="hidden"')) {
    throw new Error('expected panel-owned srcdoc normalization to retain measured-content overflow clamping')
  }
  if (panelOwnedDoc.includes('html,body{height:100%;min-height:0!important;overflow:hidden!important}')) {
    throw new Error('expected panel-owned srcdoc to avoid the media viewport scroll variant')
  }
}
