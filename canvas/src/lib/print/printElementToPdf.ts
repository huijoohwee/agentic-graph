import {
  PRESENTATION_BASE_SLIDE_SIZE_PX,
  resolvePrintGeometryMm,
  type PrintOrientation,
} from './printLayoutTokens'
import {
  annotateSourceImages,
  bakeLoadedImages,
  bakeWebpageSnapshotThumbnails,
  freezeIframesToStaticThumbnails,
  replaceVideoIframes,
  replaceVideoSnapshots,
  replaceVideosWithFrames,
  replaceYouTubeBrokenImgs,
  replaceYouTubeWebpageSnapshots,
  stripLazyAttrs,
  wrapImagesWithSourceLinks,
} from './printElementToPdf.media'
import {
  collectEmbeddableCssText,
  convertPresentationSectionsToSingleSlideSvg,
  copyPresentationScrollableState,
  copyScrollableState,
  ensurePresentationPrintDeck,
  flattenPresentationPagesToSlideSurfaces,
  forceRenderPendingMermaidGates,
  freezePresentationScrollViewports,
  markMarkdownDividerPageBreaks,
  materializePresentationPages,
  normalizePresentationDeckForPrint,
  waitForImagesToLoad,
} from './printElementToPdf.presentation'

export type { PrintOrientation } from './printLayoutTokens'

type PresentationPrintRuntimeCapture = {
  ts: number
  orientation: PrintOrientation
  preservePresentationLayout: boolean
  pageSizeCss: string
  pageMarginCss: string
  rootPaddingCss: string
  viewportWidthMmCss: string
  presentationSectionHeightMmCss: string
  fittedSlideWidthMmCss: string
  fittedSlideHeightMmCss: string
  pageCount: number
  pageMetrics: Array<{
    index: number
    pageRect: { width: number; height: number }
    frameRect: { width: number; height: number } | null
    surfaceRect: { width: number; height: number } | null
    frameScroll: { width: number; height: number } | null
    surfaceScroll: { width: number; height: number } | null
  }>
}

const capturePresentationPrintRuntime = (
  root: HTMLElement,
  payload: Omit<PresentationPrintRuntimeCapture, 'ts' | 'pageCount' | 'pageMetrics'>,
): void => {
  try {
    const pages = Array.from(root.querySelectorAll('[data-kg-presentation-page="1"]')) as HTMLElement[]
    const pageMetrics = pages.map((page, index) => {
      const frame = page.querySelector(':scope > [data-kg-presentation-page-frame="1"]') as HTMLElement | null
      const surface = frame?.querySelector(':scope > [data-kg-presentation-slide-surface="1"]') as HTMLElement | null
      const pr = page.getBoundingClientRect()
      const fr = frame?.getBoundingClientRect() || null
      const sr = surface?.getBoundingClientRect() || null
      return {
        index,
        pageRect: { width: pr.width, height: pr.height },
        frameRect: fr ? { width: fr.width, height: fr.height } : null,
        surfaceRect: sr ? { width: sr.width, height: sr.height } : null,
        frameScroll: frame ? { width: frame.scrollWidth, height: frame.scrollHeight } : null,
        surfaceScroll: surface ? { width: surface.scrollWidth, height: surface.scrollHeight } : null,
      }
    })
    const runtimeCapture: PresentationPrintRuntimeCapture = {
      ts: Date.now(),
      ...payload,
      pageCount: pages.length,
      pageMetrics,
    }
    ;(window as Window & { __AG_PRESENTATION_PRINT_RUNTIME_CAPTURE__?: PresentationPrintRuntimeCapture })
      .__AG_PRESENTATION_PRINT_RUNTIME_CAPTURE__ = runtimeCapture
    try {
      console.info('[kg-pdf-runtime-capture]', runtimeCapture)
      console.table(runtimeCapture.pageMetrics)
    } catch {
      void 0
    }
  } catch {
    void 0
  }
}

export async function printElementToPdf(
  el: HTMLElement,
  args?: {
    title?: string
    orientation?: PrintOrientation
    horizontalInsetScale?: number
    verticalInsetScale?: number
    compactHorizontalContent?: boolean
    centerContent?: boolean
    fidelityMode?: 'balanced' | 'presentation-wysiwyg' | 'presentation-viewer-fidelity'
  },
): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    if (!el) return
    const title = String(args?.title || 'Document')
    const prevTitle = document.title
    const printRootId = 'kg-print-root'
    const styleId = 'kg-print-style'

    const existingRoot = document.getElementById(printRootId)
    if (existingRoot) {
      try {
        existingRoot.remove()
      } catch {
        void 0
      }
    }
    const existingStyle = document.getElementById(styleId)
    if (existingStyle) {
      try {
        existingStyle.remove()
      } catch {
        void 0
      }
    }

    await waitForImagesToLoad(el, 8_000)

    try {
      await forceRenderPendingMermaidGates(el)
    } catch {
      void 0
    }

    const root = document.createElement('main')
    root.id = printRootId
    root.style.position = 'fixed'
    root.style.inset = '0'
    root.style.zIndex = '2147483647'
    root.style.background = 'white'
    root.style.overflow = 'auto'
    const objectUrlsToRevoke: string[] = []
    const orientation: PrintOrientation = args?.orientation === 'landscape' ? 'landscape' : 'portrait'
    const fidelityMode = args?.fidelityMode || 'balanced'
    const preservePresentationLayout =
      fidelityMode === 'presentation-wysiwyg' || fidelityMode === 'presentation-viewer-fidelity'
    const horizontalInsetScale = Number.isFinite(Number(args?.horizontalInsetScale)) && Number(args?.horizontalInsetScale) > 0
      ? Number(args?.horizontalInsetScale)
      : 1
    const verticalInsetScale = Number.isFinite(Number(args?.verticalInsetScale)) && Number(args?.verticalInsetScale) > 0
      ? Number(args?.verticalInsetScale)
      : 1
    const geometry = resolvePrintGeometryMm({
      orientation,
      horizontalInsetScale,
      verticalInsetScale,
      presentationVerticalInsetSymmetry: preservePresentationLayout,
    })
    const { effectiveInsetsMm: effectiveInsets, pageSizeMm, viewportMm, presentationSlideMm } = geometry
    const toCssMm = (value: number): string => {
      const rounded = Math.round(Math.max(0, value) * 1000) / 1000
      const normalized = Number.isFinite(rounded) ? rounded : 0
      const compact = normalized.toFixed(3).replace(/\.?0+$/, '')
      const safe = compact.length > 0 ? compact : '0'
      return `${safe}mm`
    }
    const formatInsetCss = (insets: { top: number; right: number; bottom: number; left: number }): string =>
      `${toCssMm(insets.top)} ${toCssMm(insets.right)} ${toCssMm(insets.bottom)} ${toCssMm(insets.left)}`
    const pageMarginForCss = preservePresentationLayout
      ? {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }
      : effectiveInsets.pageMarginMm
    const rootPaddingForCss = preservePresentationLayout
      ? {
          top: effectiveInsets.pageMarginMm.top + effectiveInsets.rootPaddingMm.top,
          right: effectiveInsets.pageMarginMm.right + effectiveInsets.rootPaddingMm.right,
          bottom: effectiveInsets.pageMarginMm.bottom + effectiveInsets.rootPaddingMm.bottom,
          left: effectiveInsets.pageMarginMm.left + effectiveInsets.rootPaddingMm.left,
        }
      : effectiveInsets.rootPaddingMm
    const pageMarginCss = formatInsetCss(pageMarginForCss)
    const rootPaddingCss = formatInsetCss(rootPaddingForCss)
    const pageSizeCss = preservePresentationLayout
      ? (orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm')
      : `${toCssMm(pageSizeMm.widthMm)} ${toCssMm(pageSizeMm.heightMm)}`
    const viewportWidthMmCss = toCssMm(viewportMm.widthMm)
    const presentationSlideWidthMmCss = toCssMm(presentationSlideMm.widthMm)
    const presentationSlideHeightMmCss = toCssMm(presentationSlideMm.heightMm)
    // Stable section-height epsilon avoids page split/blank artifacts from print-engine
    // rounding drift. Keep this enabled for presentation fidelity too (especially A4 landscape).
    const presentationSectionHeightEpsilonMm = preservePresentationLayout
      ? (orientation === 'landscape' ? 0.6 : 0.4)
      : 0.5
    const presentationSectionHeightRawMm = Math.max(0, viewportMm.heightMm - presentationSectionHeightEpsilonMm)
    const presentationSectionHeightMmCss = toCssMm(presentationSectionHeightRawMm)
    const fittedSlideWidthMmCss = presentationSlideWidthMmCss
    const fittedSlideHeightMmCss = presentationSlideHeightMmCss
    const slideVerticalOffsetMmCss = toCssMm(Math.max(0, (presentationSectionHeightRawMm - presentationSlideMm.heightMm) / 2))
    const compactHorizontalContent = Boolean(args?.compactHorizontalContent)
    const centerContent = Boolean(args?.centerContent) && !preservePresentationLayout
    const allowMediaMutation = !preservePresentationLayout
    const freezePresentationMedia = preservePresentationLayout
    root.style.padding = rootPaddingCss

    const clone = el.cloneNode(true) as HTMLElement
    const cloneIsDeckRoot = clone.matches('[data-testid="markdown-presentation-print-deck"]')
    const preferNativeLandscapeSlides = preservePresentationLayout && orientation === 'landscape' && cloneIsDeckRoot
    try {
      if (preservePresentationLayout) copyPresentationScrollableState(el, clone)
      else copyScrollableState(el, clone)
    } catch {
      void 0
    }

    try {
      annotateSourceImages(clone)
    } catch {
      void 0
    }
    try {
      stripLazyAttrs(clone)
    } catch {
      void 0
    }
    try {
      // Keep native image src in presentation fidelity to avoid data-URL bake
      // regressions on large media surfaces during print preview.
      if (allowMediaMutation) bakeLoadedImages(el, clone)
    } catch {
      void 0
    }
    try {
      if (allowMediaMutation || freezePresentationMedia) bakeWebpageSnapshotThumbnails(el, clone)
    } catch {
      void 0
    }
    try {
      if (allowMediaMutation || freezePresentationMedia) replaceVideosWithFrames(el, clone)
    } catch {
      void 0
    }
    try {
      if (allowMediaMutation) await replaceVideoIframes(clone)
    } catch {
      void 0
    }
    try {
      if (freezePresentationMedia) await freezeIframesToStaticThumbnails(el, clone)
    } catch {
      void 0
    }
    try {
      // Presentation fidelity can still leave unmatched video iframes behind when
      // source/clone structures diverge; rewrite any remaining known video iframes.
      if (freezePresentationMedia) await replaceVideoIframes(clone)
    } catch {
      void 0
    }
    try {
      if (allowMediaMutation || freezePresentationMedia) await replaceYouTubeBrokenImgs(clone)
    } catch {
      void 0
    }
    try {
      if (allowMediaMutation || preferNativeLandscapeSlides) await replaceYouTubeWebpageSnapshots(el, clone)
    } catch {
      void 0
    }
    try {
      if (allowMediaMutation || preferNativeLandscapeSlides) replaceVideoSnapshots(el, clone)
    } catch {
      void 0
    }
    try {
      stripLazyAttrs(clone)
    } catch {
      void 0
    }
    try {
      markMarkdownDividerPageBreaks(clone)
    } catch {
      void 0
    }
    try {
      if (preservePresentationLayout) ensurePresentationPrintDeck(clone)
    } catch {
      void 0
    }
    try {
      if (preservePresentationLayout) normalizePresentationDeckForPrint(clone)
    } catch {
      void 0
    }
    try {
      if (!preservePresentationLayout) wrapImagesWithSourceLinks(clone)
    } catch {
      void 0
    }
    root.appendChild(clone)
    document.body.appendChild(root)
    await waitForImagesToLoad(root, 5_000)
    try {
      if (preservePresentationLayout) {
        // Deck-based export targets already encode slide geometry; forcing viewport-freeze
        // can clip rich slide content to the top region in some print engines.
        if (!cloneIsDeckRoot) freezePresentationScrollViewports(clone)
      }
    } catch {
      void 0
    }
    try {
      if (preservePresentationLayout) {
        if (!preferNativeLandscapeSlides) {
          convertPresentationSectionsToSingleSlideSvg(
            clone,
            PRESENTATION_BASE_SLIDE_SIZE_PX.width,
            PRESENTATION_BASE_SLIDE_SIZE_PX.height,
            collectEmbeddableCssText(),
          )
        }
      }
    } catch {
      void 0
    }
    try {
      if (preservePresentationLayout) materializePresentationPages(clone)
    } catch {
      void 0
    }
    try {
      if (preservePresentationLayout) flattenPresentationPagesToSlideSurfaces(clone)
    } catch {
      void 0
    }
    const presentationPaginationCss = preservePresentationLayout
      ? `
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] {
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          position: relative !important;
          overflow: clip !important;
          contain: strict !important;
          isolation: isolate !important;
          break-inside: avoid !important;
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
          break-after: auto !important;
          page-break-after: auto !important;
          height: ${presentationSectionHeightMmCss} !important;
          min-height: ${presentationSectionHeightMmCss} !important;
          max-height: ${presentationSectionHeightMmCss} !important;
          width: ${fittedSlideWidthMmCss} !important;
          min-width: ${fittedSlideWidthMmCss} !important;
          max-width: ${fittedSlideWidthMmCss} !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"]:not(:first-child) {
          break-before: page !important;
          page-break-before: always !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] {
          position: relative !important;
          width: ${fittedSlideWidthMmCss} !important;
          height: ${fittedSlideHeightMmCss} !important;
          max-width: ${fittedSlideWidthMmCss} !important;
          max-height: ${fittedSlideHeightMmCss} !important;
          margin: ${slideVerticalOffsetMmCss} auto !important;
          overflow: hidden !important;
          contain: layout paint size !important;
          break-inside: avoid !important;
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
          display: block !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > section,
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > article {
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
          min-height: 100% !important;
          max-height: 100% !important;
          margin: 0 !important;
          overflow: visible !important;
          display: block !important;
          break-inside: avoid !important;
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > section > article {
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
          min-height: 100% !important;
          max-height: 100% !important;
          margin: 0 !important;
          overflow: visible !important;
          display: block !important;
          break-inside: avoid !important;
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > [data-kg-presentation-slide-surface="1"] {
          position: relative !important;
          top: auto !important;
          left: auto !important;
          margin: 0 !important;
          transform: none !important;
          transform-origin: center center !important;
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          display: block !important;
          overflow: hidden !important;
          contain: layout paint size !important;
          break-inside: avoid !important;
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > [data-kg-presentation-slide-surface="1"] foreignObject {
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > [data-kg-presentation-slide-surface="1"] foreignObject > div {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          display: block !important;
          box-sizing: border-box !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > [data-kg-presentation-slide-surface="1"] * {
          break-inside: avoid !important;
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > section *,
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > [data-kg-presentation-page="1"] > [data-kg-presentation-page-frame="1"] > article * {
          break-inside: avoid !important;
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
        }
        #${printRootId}[data-kg-native-presentation-landscape="1"] [aria-label="Slide Content"],
        #${printRootId}[data-kg-native-presentation-landscape="1"] [aria-label="Slide Left Column"],
        #${printRootId}[data-kg-native-presentation-landscape="1"] [aria-label="Slide Right Column"],
        #${printRootId}[data-kg-native-presentation-landscape="1"] [aria-label="Slide Document"] main {
          overflow: visible !important;
          max-height: none !important;
        }
        #${printRootId}[data-kg-native-presentation-landscape="1"] [data-kg-video-snapshot="1"],
        #${printRootId}[data-kg-native-presentation-landscape="1"] [data-kg-webpage-snapshot="1"] {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          width: 100% !important;
          overflow: visible !important;
        }
        #${printRootId}[data-kg-native-presentation-landscape="1"] [data-kg-video-snapshot="1"] img,
        #${printRootId}[data-kg-native-presentation-landscape="1"] [data-kg-webpage-snapshot="1"] img,
        #${printRootId}[data-kg-native-presentation-landscape="1"] img[data-kg-media-thumbnail="1"] {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          object-fit: contain !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] [data-kg-hr="1"],
        #${printRootId} [data-testid="markdown-presentation-print-deck"] [data-kg-page-break="1"] {
          display: none !important;
          break-before: auto !important;
          page-break-before: auto !important;
          break-after: auto !important;
          page-break-after: auto !important;
        }
      `
      : ''
    const style = document.createElement('style')
    style.id = styleId
    if (preferNativeLandscapeSlides) {
      root.setAttribute('data-kg-native-presentation-landscape', '1')
    }
    style.textContent = `
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: auto !important;
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body > *:not(#${printRootId}) { display: none !important; }
        #${printRootId} {
          position: static !important;
          inset: auto !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: ${rootPaddingCss} !important;
          box-sizing: border-box !important;
        }
        ${preservePresentationLayout ? '' : `#${printRootId} section { overflow: visible !important; }`}
        ${preservePresentationLayout ? '' : `#${printRootId} svg { max-width: 100% !important; height: auto !important; }`}
        ${
          compactHorizontalContent
            ? `
        #${printRootId} [data-testid="markdown-preview-root"] { width: 100% !important; max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; }
        #${printRootId} article { width: 100% !important; max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; }
        #${printRootId} .mx-auto { margin-left: 0 !important; margin-right: 0 !important; }
      `
            : ''
        }
        ${
          centerContent
            ? `
        #${printRootId} { display: flex !important; justify-content: center !important; align-items: center !important; min-height: 100vh !important; }
        #${printRootId} > * { margin: auto !important; max-width: 100% !important; }
      `
            : ''
        }
        ${
          preservePresentationLayout
            ? `#${printRootId} [data-kg-mermaid-visibility-gate="pending"] { display: block !important; }`
            : `#${printRootId} [data-kg-mermaid-visibility-gate="pending"] { display: none !important; }`
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] {
          display: block !important;
          width: ${viewportWidthMmCss} !important;
          min-width: ${viewportWidthMmCss} !important;
          max-width: ${viewportWidthMmCss} !important;
          margin: 0 auto !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
        ${presentationPaginationCss}
        ${
          preservePresentationLayout
            ? `
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Document"] {
          height: 100% !important;
          min-height: 100% !important;
          max-height: 100% !important;
          position: relative !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Content"],
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Left Column"],
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Right Column"] {
          overflow: clip !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Document"] main {
          overflow: clip !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Content"] > *,
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Left Column"] > *,
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [aria-label="Slide Right Column"] > * {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article img,
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article [data-kg-media-thumbnail="1"] {
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          max-width: 100% !important;
          height: auto !important;
          object-fit: contain !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article a:has(img),
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article a:has([data-kg-media-thumbnail="1"]),
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article p:has(img),
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article p:has(video),
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article p:has(iframe),
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article figure:has(img),
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article figure:has(video),
        #${printRootId} [data-testid="markdown-presentation-print-deck"] > section > article figure:has(iframe) {
          display: block !important;
          width: 100% !important;
          line-height: 0 !important;
          text-decoration: none !important;
          color: inherit !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #${printRootId} [data-testid="markdown-presentation-print-deck"] [aria-label="Slide Document"] > footer {
          background-color: rgb(255 255 255) !important;
          opacity: 1 !important;
        }
      `
            : ''
        }
        ${
          preservePresentationLayout
            ? ''
            : `
        #${printRootId} [data-kg-hr="1"] { break-after: page; page-break-after: always; }
        #${printRootId} [data-kg-page-break="1"] { display: block !important; height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; break-before: page; page-break-before: always; }
      `
        }
        @page { margin: ${pageMarginCss}; size: ${pageSizeCss}; }
      }
    `
    document.head.appendChild(style)
    if (preservePresentationLayout) {
      capturePresentationPrintRuntime(root, {
        orientation,
        preservePresentationLayout,
        pageSizeCss,
        pageMarginCss,
        rootPaddingCss,
        viewportWidthMmCss,
        presentationSectionHeightMmCss,
        fittedSlideWidthMmCss,
        fittedSlideHeightMmCss,
      })
    }

    const cleanup = () => {
      try {
        document.title = prevTitle
      } catch {
        void 0
      }
      try {
        style.remove()
      } catch {
        void 0
      }
      try {
        root.remove()
      } catch {
        void 0
      }
      for (let i = 0; i < objectUrlsToRevoke.length; i += 1) {
        try {
          URL.revokeObjectURL(objectUrlsToRevoke[i])
        } catch {
          void 0
        }
      }
      try {
        window.removeEventListener('afterprint', cleanup)
      } catch {
        void 0
      }
    }

    try {
      document.title = title
    } catch {
      void 0
    }

    try {
      window.addEventListener('afterprint', cleanup)
    } catch {
      void 0
    }

    try {
      window.focus()
    } catch {
      void 0
    }
    try {
      window.print()
    } catch {
      cleanup()
    }

    setTimeout(() => {
      cleanup()
    }, 30_000)
  } catch {
    void 0
  }
}
