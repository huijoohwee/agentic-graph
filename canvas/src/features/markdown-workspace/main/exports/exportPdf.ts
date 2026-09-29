import { printElementToPdf } from '@/lib/print/printElementToPdf'
import type { PrintOrientation } from '@/lib/print/printElementToPdf'
import type { UiToastInput } from '@/hooks/store/types'
import { getMarkdownIt } from '@/features/markdown/markdownIt'
import { splitSlides } from '@/features/markdown/ui/markdownPreviewSlides'
import {
  buildBackgroundStyle,
  buildSlideBody,
  buildTwoColumnTokens,
  getSlideVisualMeta,
} from '@/features/markdown/ui/markdownPresentationSlides'
import { resolvePresentationFrameModel } from '@/features/markdown/ui/markdownPresentationFrame'
import { parseMermaidConfigFromFrontmatter } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import { lexMarkdownContent } from '@/features/markdown/ui/markdownPreviewLex'
import { selectTokensInLineRange } from '@/features/markdown/ui/markdownPreviewLexUtils'
import { UI_COPY } from '@/lib/config-copy/uiCopy'
import { resolveEffectivePrintInsetsMm } from '@/lib/print/printLayoutTokens'
import { PRESENTATION_BASE_SLIDE_SIZE_PX } from '@/lib/print/printLayoutTokens'
import React from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { withForcedIntersectingObserver } from './exportPdfIntersectionObserver'

const PDF_EXPORT_DEBUG_TOAST_ID = 'export-pdf-debug'

type SplitViewerPrintPolicy = {
  horizontalInsetScale?: number
  verticalInsetScale?: number
  compactHorizontalContent: boolean
  centerContent: boolean
}

type PdfSurfaceKind = 'split-viewer' | 'presentation'

type SurfacePrintPolicy = {
  horizontalInsetScale?: number
  verticalInsetScale?: number
  compactHorizontalContent: boolean
  centerContent: boolean
}

const resolveSplitViewerPrintPolicy = (
  isSplitViewerExport: boolean,
  orientation: PrintOrientation,
): SplitViewerPrintPolicy => {
  if (!isSplitViewerExport) {
    return {
      compactHorizontalContent: false,
      centerContent: false,
    }
  }
  if (orientation === 'portrait') {
    return {
      horizontalInsetScale: 0.5,
      verticalInsetScale: 0.8,
      compactHorizontalContent: true,
      centerContent: false,
    }
  }
  if (orientation === 'landscape') {
    return {
      horizontalInsetScale: 0.2,
      verticalInsetScale: 0.4,
      compactHorizontalContent: false,
      centerContent: true,
    }
  }
  return {
    compactHorizontalContent: false,
    centerContent: false,
  }
}

const resolveSurfacePrintPolicy = (
  surface: PdfSurfaceKind,
  orientation: PrintOrientation,
): SurfacePrintPolicy => {
  if (surface === 'split-viewer') {
    return resolveSplitViewerPrintPolicy(true, orientation)
  }
  // Presentation deck is a paged multi-slide surface; keep print policy neutral and
  // let presentation print CSS control slide centering/fidelity.
  return {
    compactHorizontalContent: false,
    centerContent: false,
  }
}

const countDividerPageBreakCandidates = (root: HTMLElement | null): number => {
  if (!root) return 0
  const marked = root.querySelectorAll('[data-kg-hr="1"]')
  if (marked.length > 0) return marked.length
  const hrs = root.querySelectorAll('hr')
  if (hrs.length === 0) return 0
  const hasFollowingContent = (node: Element): boolean => {
    let cursor: Element | null = node
    while (cursor && cursor !== root) {
      if (cursor.nextElementSibling) return true
      cursor = cursor.parentElement
    }
    return false
  }
  let count = 0
  for (let i = 0; i < hrs.length; i += 1) {
    if (hasFollowingContent(hrs[i] as Element)) count += 1
  }
  return count
}

const waitForImagesToLoad = (root: HTMLElement, timeoutMs: number): Promise<void> => {
  const imgs = root.querySelectorAll('img')
  if (imgs.length === 0) return Promise.resolve()
  const pending = new Set<HTMLImageElement>()
  for (let i = 0; i < imgs.length; i += 1) {
    const img = imgs[i] as HTMLImageElement
    if (img.complete && img.naturalWidth > 0) continue
    pending.add(img)
  }
  if (pending.size === 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const onEach = (img: HTMLImageElement) => {
      pending.delete(img)
      if (pending.size === 0) finish()
    }
    for (const img of pending) {
      img.addEventListener('load', () => onEach(img), { once: true })
      img.addEventListener('error', () => onEach(img), { once: true })
    }
    setTimeout(finish, timeoutMs)
  })
}

const countPendingPresentationMediaSurfaces = (root: HTMLElement): number => {
  let pending = 0
  const videoSnapshots = root.querySelectorAll('[data-kg-video-snapshot="1"]')
  for (let i = 0; i < videoSnapshots.length; i += 1) {
    const node = videoSnapshots[i] as HTMLElement
    const readyThumb = node.querySelector('img[src]') as HTMLImageElement | null
    if (!readyThumb) pending += 1
  }
  const webpageSnapshots = root.querySelectorAll('[data-kg-webpage-snapshot="1"]')
  for (let i = 0; i < webpageSnapshots.length; i += 1) {
    const node = webpageSnapshots[i] as HTMLElement
    const hasSurface = Boolean(node.querySelector('img[src], svg'))
    if (!hasSurface) pending += 1
  }
  return pending
}

const copyExportScrollableState = (src: HTMLElement, dst: HTMLElement): void => {
  try {
    dst.scrollTop = src.scrollTop
    dst.scrollLeft = src.scrollLeft
  } catch {
    void 0
  }
  const srcNodes = src.querySelectorAll('*')
  const dstNodes = dst.querySelectorAll('*')
  const len = Math.min(srcNodes.length, dstNodes.length)
  for (let i = 0; i < len; i += 1) {
    const srcNode = srcNodes[i] as HTMLElement
    const dstNode = dstNodes[i] as HTMLElement
    try {
      dstNode.scrollTop = srcNode.scrollTop
      dstNode.scrollLeft = srcNode.scrollLeft
    } catch {
      void 0
    }
  }
}

const syncPresentationDeckScrollState = (
  presentationRoot: HTMLElement,
  presentationDeckTarget: HTMLElement,
): void => {
  const srcSlides = presentationRoot.querySelectorAll('[aria-label="Slide Document"]')
  const dstSlides = presentationDeckTarget.querySelectorAll('[aria-label="Slide Document"]')
  const len = Math.min(srcSlides.length, dstSlides.length)
  const SCROLLABLE_A11Y_LABELS = [
    'Slide Content',
    'Slide Left Column',
    'Slide Right Column',
  ] as const
  for (let i = 0; i < len; i += 1) {
    const srcSlide = srcSlides[i] as HTMLElement
    const dstSlide = dstSlides[i] as HTMLElement
    for (let j = 0; j < SCROLLABLE_A11Y_LABELS.length; j += 1) {
      const label = SCROLLABLE_A11Y_LABELS[j]
      const srcScroller = srcSlide.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
      const dstScroller = dstSlide.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
      if (srcScroller && dstScroller) {
        copyExportScrollableState(srcScroller, dstScroller)
      }
    }
    copyExportScrollableState(srcSlide, dstSlide)
  }
}

function buildPrintableMarkdownArticle(markdownText: string): HTMLElement | null {
  const text = String(markdownText || '')
  if (!text.trim()) return null
  try {
    const root = document.createElement('section')
    root.setAttribute('data-testid', 'markdown-preview-root')
    const article = document.createElement('article')
    article.innerHTML = getMarkdownIt().render(text)
    root.appendChild(article)
    return article
  } catch {
    return null
  }
}

function buildPrintablePresentationDeck(markdownText: string): HTMLElement | null {
  const text = String(markdownText || '')
  if (!text.trim()) return null
  try {
    const { slides } = splitSlides(text)
    if (!slides.length) return null
    const root = document.createElement('section')
    root.setAttribute('data-testid', 'markdown-preview-root')
    const deck = document.createElement('section')
    deck.setAttribute('data-testid', 'markdown-presentation-print-deck')
    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i]
      const slideEl = document.createElement('article')
      slideEl.innerHTML = getMarkdownIt().render(String(slide.text || ''))
      deck.appendChild(slideEl)
      if (i < slides.length - 1) {
        const divider = document.createElement('hr')
        divider.setAttribute('data-kg-hr', '1')
        deck.appendChild(divider)
      }
    }
    root.appendChild(deck)
    return deck
  } catch {
    return null
  }
}

async function buildViewerFidelityTarget(markdownText: string): Promise<HTMLElement | null> {
  const text = String(markdownText || '')
  if (!text.trim()) return null
  const host = document.createElement('section')
  host.setAttribute('data-testid', 'markdown-pdf-render-host')
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.width = '1120px'
  host.style.height = 'auto'
  host.style.opacity = '0'
  host.style.pointerEvents = 'none'
  host.style.overflow = 'visible'
  host.style.zIndex = '-1'
  document.body.appendChild(host)
  const root = createRoot(host)
  const restoreIntersectionObserver = withForcedIntersectingObserver()
  try {
    root.render(
      React.createElement(MarkdownPreview, {
        markdownText: text,
        activeDocumentPath: '__pdf_export__',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: '',
        uiPanelMonospaceTextClass: '',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
        viewMode: 'viewer',
        showSidebar: false,
      }),
    )
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const waitForMermaidReady = async (maxMs: number): Promise<void> => {
      const start = Date.now()
      while (Date.now() - start < maxMs) {
        const pending = host.querySelectorAll('[data-kg-mermaid-visibility-gate="pending"]')
        for (let i = 0; i < pending.length; i += 1) {
          try {
            ;(pending[i] as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' })
          } catch {
            void 0
          }
        }
        if (pending.length === 0) return
        await new Promise<void>(resolve => setTimeout(() => resolve(), 80))
      }
    }
    await waitForMermaidReady(2600)
    await new Promise<void>(resolve => setTimeout(() => resolve(), 120))
    const previewRoot = host.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
    const article = (previewRoot?.querySelector('article') as HTMLElement | null) || previewRoot
    return article ? (article.cloneNode(true) as HTMLElement) : null
  } catch {
    return null
  } finally {
    try {
      restoreIntersectionObserver()
    } catch {
      void 0
    }
    try {
      root.unmount()
    } catch {
      void 0
    }
    try {
      host.remove()
    } catch {
      void 0
    }
  }
}

async function buildPresentationFidelityDeckTarget(markdownText: string): Promise<HTMLElement | null> {
  const text = String(markdownText || '')
  if (!text.trim()) return null
  const host = document.createElement('section')
  host.setAttribute('data-testid', 'markdown-presentation-pdf-render-host')
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.width = `${PRESENTATION_BASE_SLIDE_SIZE_PX.width}px`
  host.style.height = 'auto'
  host.style.opacity = '0'
  host.style.pointerEvents = 'none'
  host.style.overflow = 'visible'
  host.style.zIndex = '-1'
  document.body.appendChild(host)
  const root = createRoot(host)
  const restoreIntersectionObserver = withForcedIntersectingObserver()
  try {
    const { headMeta, slides } = splitSlides(text)
    if (!slides.length) return null
    const fullDocTokens = lexMarkdownContent(text, 0).tokens
    const mermaidFrontmatterConfig = parseMermaidConfigFromFrontmatter(headMeta as Record<string, unknown>)
    const rootThemeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    root.render(
      React.createElement(
        'section',
        { 'data-testid': 'markdown-presentation-print-deck', className: 'w-full' },
        slides.map((slide, idx) => {
          const twoColumnTokens = buildTwoColumnTokens({
            slide,
            headMeta: headMeta as Record<string, unknown>,
            fullDocTokens,
          })
          const slideTokens = selectTokensInLineRange(fullDocTokens, slide.startLine, slide.endLine)
          const slideBody = buildSlideBody({
            hasSlides: true,
            slides,
            safeActiveSlideId: idx,
            twoColumnTokens,
            slideTokens,
            headMeta: headMeta as Record<string, unknown>,
            activeDocumentPath: '__pdf_export__',
            highlightedLineRange: null,
            markdownWordWrap: false,
            markdownTextHighlight: false,
            selectionKind: null,
            uiPanelTextFontClass: '',
            uiPanelMonospaceTextClass: '',
            uiPanelMicroLabelTextSizeClass: 'text-xs',
            previewOverlayScope: 'container',
            previewOverlayPortalTarget: null,
            activeFragmentConfig: { enabled: false, classNames: [], tags: [], steps: 0 },
            activeFragmentStep: 0,
            mermaidFrontmatterConfig: mermaidFrontmatterConfig as Record<string, unknown> | null,
            rootThemeMode,
            effectiveHighlightBackgroundColor: null,
            effectiveHighlightUnderlineColor: null,
            headerFooterPositionMode: 'slide-absolute',
          })
          const visualMeta = getSlideVisualMeta(
            (slide.meta || {}) as Record<string, unknown>,
            headMeta as Record<string, unknown>,
            '',
          )
          const frameModel = resolvePresentationFrameModel({
            slideMeta: (slide.meta || {}) as Record<string, unknown>,
            headMeta: headMeta as Record<string, unknown>,
            isAcademicTheme: visualMeta.themeStyle === 'academic',
          })
          const slideStyle = buildBackgroundStyle(
            '__pdf_export__',
            visualMeta.backgroundRaw,
            visualMeta.backgroundSize,
            visualMeta.backgroundPosition,
          )
          return React.createElement(React.Fragment, { key: `slide-${idx}` }, [
            React.createElement(
              'section',
              {
                key: `slide-canvas-${idx}`,
                className: 'w-full',
                style: {
                  margin: 0,
                  padding: 0,
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                  width: `${PRESENTATION_BASE_SLIDE_SIZE_PX.width}px`,
                  minWidth: `${PRESENTATION_BASE_SLIDE_SIZE_PX.width}px`,
                  maxWidth: `${PRESENTATION_BASE_SLIDE_SIZE_PX.width}px`,
                  height: `${PRESENTATION_BASE_SLIDE_SIZE_PX.height}px`,
                  minHeight: `${PRESENTATION_BASE_SLIDE_SIZE_PX.height}px`,
                  maxHeight: `${PRESENTATION_BASE_SLIDE_SIZE_PX.height}px`,
                },
              },
              React.createElement(
                'article',
                {
                  key: `slide-article-${idx}`,
                  className: [frameModel.baseFrameClass, visualMeta.slideClass, 'w-full'].filter(Boolean).join(' '),
                  style: {
                    ...slideStyle,
                    width: '100%',
                    height: '100%',
                    minHeight: '100%',
                    maxHeight: '100%',
                    maxWidth: '100%',
                    margin: 0,
                    overflow: 'hidden',
                  },
                },
                slideBody,
              ),
            ),
            idx < slides.length - 1
              ? React.createElement('hr', {
                key: `slide-break-${idx}`,
                'data-kg-hr': '1',
              })
              : null,
          ])
        }),
      ),
    )
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const waitForSurfaceReady = async (maxMs: number): Promise<void> => {
      const start = Date.now()
      while (Date.now() - start < maxMs) {
        const pending = host.querySelectorAll('[data-kg-mermaid-visibility-gate="pending"]')
        for (let i = 0; i < pending.length; i += 1) {
          try {
            ;(pending[i] as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' })
          } catch {
            void 0
          }
        }
        const pendingMedia = countPendingPresentationMediaSurfaces(host)
        if (pending.length === 0 && pendingMedia === 0) return
        await new Promise<void>(resolve => setTimeout(() => resolve(), 80))
      }
    }
    await waitForSurfaceReady(3200)
    await waitForImagesToLoad(host, 2400)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const deck = host.querySelector('[data-testid="markdown-presentation-print-deck"]') as HTMLElement | null
    return deck ? (deck.cloneNode(true) as HTMLElement) : null
  } catch {
    return null
  } finally {
    try {
      restoreIntersectionObserver()
    } catch {
      void 0
    }
    try {
      root.unmount()
    } catch {
      void 0
    }
    try {
      host.remove()
    } catch {
      void 0
    }
  }
}

export async function exportViewerPdf(args: {
  exportBaseName: string
  viewerEl: HTMLElement | null
  viewerRefCurrent: HTMLElement | null
  pushUiToast: (toast: UiToastInput) => void
  orientation?: PrintOrientation
  markdownText?: string
}): Promise<void> {
  const root = args.viewerEl || args.viewerRefCurrent
  if (!root) {
    args.pushUiToast({
      id: 'export-pdf-missing-view',
      kind: 'warning',
      message: UI_COPY.markdownWorkspaceExportPdfMissingSurfaceWarning,
    })
    return
  }
  const previewRoot = (root.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null) || root
  const articleTarget = previewRoot.querySelector('article') as HTMLElement | null
  const markdownFallbackTarget = buildPrintableMarkdownArticle(String(args.markdownText || ''))
  const presentationDeckTarget = await buildPresentationFidelityDeckTarget(String(args.markdownText || ''))
    || buildPrintablePresentationDeck(String(args.markdownText || ''))
  const viewerFidelityTarget = await buildViewerFidelityTarget(String(args.markdownText || ''))
  const presentationSurfaceEl = (
    root.matches?.('[data-testid="markdown-presentation-root"]')
      ? root
      : root.querySelector?.('[data-testid="markdown-presentation-root"]')
  ) as HTMLElement | null
  const orientation = args.orientation || 'portrait'
  const presentationSurface = !!presentationSurfaceEl
  try {
    if (presentationSurfaceEl && presentationDeckTarget) {
      syncPresentationDeckScrollState(presentationSurfaceEl, presentationDeckTarget)
    }
  } catch {
    void 0
  }
  const target = presentationSurface
    ? (presentationDeckTarget || viewerFidelityTarget || articleTarget || markdownFallbackTarget || previewRoot)
    : (articleTarget || markdownFallbackTarget || previewRoot)
  let targetPath = 'preview-root'
  if (target === presentationDeckTarget) targetPath = 'presentation-deck'
  else if (target === viewerFidelityTarget) targetPath = 'viewer-fidelity'
  else if (target === articleTarget) targetPath = 'viewer-article'
  else if (target === markdownFallbackTarget) targetPath = 'markdown-fallback'
  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  const surfaceKind: PdfSurfaceKind = presentationSurface ? 'presentation' : 'split-viewer'
  const surfacePrintPolicy = resolveSurfacePrintPolicy(surfaceKind, orientation)
  if (isDev) {
    const dividerBreakCount = countDividerPageBreakCandidates(target)
    const effectiveInsets = resolveEffectivePrintInsetsMm(orientation, {
      horizontalInsetScale: surfacePrintPolicy.horizontalInsetScale,
      verticalInsetScale: surfacePrintPolicy.verticalInsetScale,
    })
    const formatInsets = (label: string, insets: { top: number; right: number; bottom: number; left: number }): string =>
      `${label} T/R/B/L=${insets.top}/${insets.right}/${insets.bottom}/${insets.left}mm`
    const debugSuffix = `surface=${surfaceKind} · ${formatInsets('page', effectiveInsets.pageMarginMm)} · ${formatInsets('root', effectiveInsets.rootPaddingMm)} · compact=${surfacePrintPolicy.compactHorizontalContent ? 'on' : 'off'} · center=${surfacePrintPolicy.centerContent ? 'on' : 'off'}`
    args.pushUiToast({
      id: PDF_EXPORT_DEBUG_TOAST_ID,
      kind: 'neutral',
      message: UI_COPY.markdownWorkspaceExportPdfDebugTargetMessage(targetPath, dividerBreakCount, debugSuffix),
      ttlMs: 1800,
      log: false,
    })
  }
  await printElementToPdf(target, {
    title: args.exportBaseName,
    orientation,
    horizontalInsetScale: surfacePrintPolicy.horizontalInsetScale,
    verticalInsetScale: surfacePrintPolicy.verticalInsetScale,
    compactHorizontalContent: surfacePrintPolicy.compactHorizontalContent,
    centerContent: surfacePrintPolicy.centerContent,
    fidelityMode: surfaceKind === 'presentation' ? 'presentation-viewer-fidelity' : 'balanced',
  })
}
