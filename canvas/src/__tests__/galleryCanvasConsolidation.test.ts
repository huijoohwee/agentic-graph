import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CANVAS_2D_RENDERERS, CANVAS_2D_RENDERER_ORDER, CANVAS_2D_SURFACES, getCanvas2dSurfaceId, getCanvas2dRendererLabel } from '@/lib/config.render'
import { getCanvasViewRendererOptions } from '@/components/toolbar/canvasViewMenu'
import {
  buildScrollSurfaceZoomTransform,
  buildZoomScaledCssLength,
  computeScrollSurfaceZoomScaleFromRequest,
} from '@/lib/canvas/scrollSurfaceZoom'
import { defaultSchema } from '@/lib/graph/schema'

const REPO_ROOT = process.cwd().endsWith('/canvas') ? resolve(process.cwd(), '..') : process.cwd()
const readRepoFile = (path: string): string => readFileSync(resolve(REPO_ROOT, path), 'utf8')

export function testGalleryCanvasIsShared2dRenderer() {
  if (!CANVAS_2D_RENDERERS.includes('gallery')) throw new Error('Expected gallery in CANVAS_2D_RENDERERS')
  if (!CANVAS_2D_RENDERER_ORDER.includes('gallery')) throw new Error('Expected gallery in CANVAS_2D_RENDERER_ORDER')
  if (!CANVAS_2D_SURFACES.includes('gallery')) throw new Error('Expected gallery in CANVAS_2D_SURFACES')
  if (getCanvas2dSurfaceId('gallery') !== 'gallery') throw new Error('Expected gallery renderer to map to gallery surface')
  if (getCanvas2dRendererLabel('gallery') !== 'Gallery') throw new Error('Expected gallery renderer label')

  const option = getCanvasViewRendererOptions().find(item => item.id === 'gallery')
  if (!option) throw new Error('Expected Canvas View Mode renderer option for gallery')
  if (option.title !== '2D Renderer: Gallery') throw new Error(`Expected Gallery renderer title, got ${option.title}`)
}

export function testGalleryCanvasReusesMarkdownPreviewAndGridOverlay() {
  const galleryCanvas = readRepoFile('canvas/src/components/GalleryCanvas.tsx')
  if (!galleryCanvas.includes('MarkdownPreview')) throw new Error('Expected GalleryCanvas to reuse MarkdownPreview')
  if (!galleryCanvas.includes('viewMode="gallery"')) throw new Error('Expected GalleryCanvas to render MarkdownPreview gallery mode')
  if (!galleryCanvas.includes('CanvasGridOverlaySurface')) throw new Error('Expected GalleryCanvas to reuse shared grid overlay')
  if (!galleryCanvas.includes('resolvePreferredComposedSourceRawText')) throw new Error('Expected GalleryCanvas to source active Source Files markdown')
  if (!galleryCanvas.includes('usePanelTypography')) throw new Error('Expected GalleryCanvas to use shared panel typography')
  if (!galleryCanvas.includes('buildActive2dZoomViewKey')) throw new Error('Expected GalleryCanvas to use the shared active 2D zoom key')
  if (!galleryCanvas.includes('computeScrollSurfaceZoomScaleFromRequest')) throw new Error('Expected GalleryCanvas to consume shared scroll-surface zoom requests')
  if (!galleryCanvas.includes('commitZoomTransformToStore')) throw new Error('Expected GalleryCanvas to commit zoom through the shared store helper')
  if (!galleryCanvas.includes('galleryZoomScale')) throw new Error('Expected GalleryCanvas to pass Gallery zoom scale into MarkdownPreview')
}

export function testGalleryCardsReuseSharedDashboardPrimitives() {
  const gallerySurface = readRepoFile('canvas/src/features/markdown/ui/MarkdownPreviewGallery.tsx')
  const markdownPreview = readRepoFile('canvas/src/features/markdown/ui/MarkdownPreview.tsx')
  const slidePreviewBuilder = readRepoFile('canvas/src/features/markdown/ui/markdownPresentationSlides.tsx')
  const appCss = readRepoFile('canvas/src/index.css')
  const galleryCss = readRepoFile('canvas/src/styles/markdown-gallery-responsive.css')
  const dashboardCanvas = readRepoFile('canvas/src/components/DashboardCanvas/DashboardWidgets.tsx')
  const dashboardCharts = readRepoFile('canvas/src/components/DashboardCanvas/DashboardCharts.tsx')

  for (const token of [
    'useKanbanDragAndDrop',
    'getKanbanCardDragVisualState',
    'KanbanCardDropPreview',
    'CardInlineTextEditor',
    'UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME',
    'UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME',
    'UI_RESPONSIVE_VIEWPORT_FIT_GRID_CLASSNAME',
  ]) {
    if (!gallerySurface.includes(token)) throw new Error(`Expected Gallery cards to reuse ${token}`)
  }

  if (!dashboardCanvas.includes("from '@agentic-base/views-react/dashboard'") || !dashboardCanvas.includes('DashboardWidgetCard')) {
    throw new Error('Expected Dashboard card surfaces to reuse Base-owned visuals')
  }
  if (!dashboardCharts.includes("from '@agentic-base/views-react/dashboard'") || dashboardCharts.includes('<svg')) {
    throw new Error('Expected Dashboard chart visuals to have one owner in Base')
  }
  if (dashboardCanvas.includes('getKanbanCardDragVisualState')) {
    throw new Error('Expected Dashboard card drag visuals to have one owner in Base')
  }
  if (!gallerySurface.includes('reconcileKanbanRowIds')) throw new Error('Expected Gallery cards to reuse shared kanban order reconciliation')
  if (!gallerySurface.includes('data-kg-markdown-gallery-card-inline-edit')) {
    throw new Error('Expected Gallery cards to expose inline edit surfaces')
  }
  if (!gallerySurface.includes('data-kg-markdown-gallery-card-draggable')) {
    throw new Error('Expected Gallery cards to expose draggable surfaces')
  }
  if (!gallerySurface.includes('MARKDOWN_GALLERY_CARD_ASPECT_RATIO')) {
    throw new Error('Expected Gallery cards to use a fixed card aspect ratio')
  }
  if (!gallerySurface.includes("const MARKDOWN_GALLERY_CARD_ASPECT_RATIO = '16 / 9'")) {
    throw new Error('Expected Gallery cards to maintain a 16:9 aspect ratio')
  }
  if (!gallerySurface.includes('MARKDOWN_GALLERY_CARD_CONTENT_ASPECT_RATIO = MARKDOWN_GALLERY_CARD_ASPECT_RATIO')) {
    throw new Error('Expected Gallery card content to reuse the card aspect ratio')
  }
  if (!gallerySurface.includes('data-kg-markdown-gallery-card-content-aspect-ratio')) {
    throw new Error('Expected Gallery card content to expose its fixed aspect ratio marker')
  }
  if (!gallerySurface.includes('MARKDOWN_GALLERY_CARD_HEADER_CHROME_PX') || !gallerySurface.includes('MARKDOWN_GALLERY_CARD_FOOTER_CHROME_PX')) {
    throw new Error('Expected Gallery preview content to reserve card chrome space')
  }
  if (!gallerySurface.includes('data-kg-markdown-gallery-card-content-reserves-chrome="1"')) {
    throw new Error('Expected Gallery preview content to expose chrome-reservation marker')
  }
  if (!gallerySurface.includes('isGallerySummaryCandidateLine')) {
    throw new Error('Expected Gallery summaries to use neutral candidate-line filtering')
  }
  if (!gallerySurface.includes("trimmed.startsWith('|') && trimmed.endsWith('|')")) {
    throw new Error('Expected Gallery summaries to avoid duplicating table rows')
  }
  if (!gallerySurface.includes('data-kg-markdown-gallery-card-chrome="solid"')) {
    throw new Error('Expected Gallery card chrome to expose solid chrome markers')
  }
  if (!gallerySurface.includes('data-kg-markdown-gallery-card-source-meta="1"')) {
    throw new Error('Expected Gallery cards to expose slide/line metadata below the summary editor')
  }
  const summaryEditorOffset = gallerySurface.indexOf('placeholder="Add card summary"')
  const sourceMetaOffset = gallerySurface.indexOf('data-kg-markdown-gallery-card-source-meta="1"')
  const titleEditorOffset = gallerySurface.indexOf('placeholder="Add card title"')
  if (summaryEditorOffset < 0 || sourceMetaOffset < 0 || sourceMetaOffset < summaryEditorOffset) {
    throw new Error('Expected Gallery source metadata to render after the summary editor')
  }
  if (titleEditorOffset >= 0 && gallerySurface.slice(titleEditorOffset, Math.max(titleEditorOffset, summaryEditorOffset)).includes('card.position + 1')) {
    throw new Error('Expected Gallery source metadata to stay out of the title header')
  }
  if (gallerySurface.includes('backdrop-blur') || gallerySurface.includes('panel.overlayBg')) {
    throw new Error('Expected Gallery card chrome to avoid glossy blur/transparent overlays')
  }
  if (!gallerySurface.includes('kg-markdown-gallery-card-preview-frame')) {
    throw new Error('Expected Gallery card content to use the compact preview frame scope')
  }
  if (!markdownPreview.includes("previewDensity: viewMode === 'gallery' ? 'gallery-card' : 'presentation'")) {
    throw new Error('Expected Gallery to request compact slide preview density')
  }
  if (!slidePreviewBuilder.includes("type MarkdownSlidePreviewDensity = 'presentation' | 'gallery-card'")) {
    throw new Error('Expected shared slide preview density contract')
  }
  if (!slidePreviewBuilder.includes('markdownCardPreviewMode: compactCardPreview')) {
    throw new Error('Expected compact Gallery slide previews to reuse markdown card-preview rendering')
  }
  if (!slidePreviewBuilder.includes('markdownPresentationMode: !compactCardPreview')) {
    throw new Error('Expected compact Gallery slide previews to avoid presentation-scale typography')
  }
  if (!slidePreviewBuilder.includes('removeLeadingGalleryPreviewHeading')) {
    throw new Error('Expected compact Gallery slide previews to suppress the duplicated primary heading')
  }
  if (!slidePreviewBuilder.includes('isGalleryPreviewLeadInToken')) {
    throw new Error('Expected Gallery heading suppression to preserve real lead-in content')
  }
  const headingBlock = readRepoFile('canvas/src/features/markdown/ui/MarkdownHeadingBlock.tsx')
  if (!headingBlock.includes('!opts.markdownLargeDocumentMode && !opts.markdownCardPreviewMode')) {
    throw new Error('Expected compact card previews to disable sticky heading chrome')
  }
  if (!slidePreviewBuilder.includes('data-kg-markdown-slide-preview-density={previewDensity}')) {
    throw new Error('Expected slide previews to expose their density marker')
  }
  if (!appCss.includes("@import './styles/markdown-gallery-responsive.css';")) {
    throw new Error('Expected Gallery preview responsive CSS to be imported')
  }
  if (!galleryCss.includes('.kg-markdown-gallery-card-preview-frame h1')) {
    throw new Error('Expected Gallery preview CSS to tune heading scale')
  }
  if (!galleryCss.includes('.kg-markdown-gallery-card-preview-frame table')) {
    throw new Error('Expected Gallery preview CSS to tune table layout')
  }
  if (!galleryCss.includes('box-sizing: border-box')) {
    throw new Error('Expected Gallery preview CSS to keep chrome padding inside the card content frame')
  }
  if (!galleryCss.includes("[data-kg-markdown-slide-preview-density='gallery-card'] [data-kg-sticky-heading]:first-child > h2:first-child")) {
    throw new Error('Expected Gallery preview CSS to hide duplicated primary headings below card titles')
  }
  if (!gallerySurface.includes("trackMode: 'fixed'")) {
    throw new Error('Expected Gallery grid to use the shared fixed-track responsive grid mode')
  }
  if (!gallerySurface.includes('data-kg-markdown-gallery-grid-fixed-track="1"')) {
    throw new Error('Expected Gallery grid to expose fixed-track grid markers')
  }
}

export function testGalleryCardsScaleFromSharedScrollSurfaceZoom() {
  const inScale = computeScrollSurfaceZoomScaleFromRequest({
    zoomRequest: { type: 'in' },
    currentScale: 1,
    schema: defaultSchema,
  })
  if (!(inScale > 1)) throw new Error(`Expected zoom-in scale to increase, got ${inScale}`)

  const outScale = computeScrollSurfaceZoomScaleFromRequest({
    zoomRequest: { type: 'out' },
    currentScale: inScale,
    schema: defaultSchema,
  })
  if (!(outScale < inScale)) throw new Error(`Expected zoom-out scale to decrease, got ${outScale}`)

  const resetScale = computeScrollSurfaceZoomScaleFromRequest({
    zoomRequest: { type: 'reset' },
    currentScale: inScale,
    schema: defaultSchema,
  })
  if (resetScale !== 1) throw new Error(`Expected reset scale to return to 1, got ${resetScale}`)

  const transformed = buildScrollSurfaceZoomTransform(inScale)
  if (transformed.k !== inScale || transformed.x !== 0 || transformed.y !== 0) {
    throw new Error('Expected scroll-surface zoom transform to preserve scale and keep pan neutral')
  }

  const inlineSize = buildZoomScaledCssLength({ basePx: 390, scale: 2, minPx: 220, maxPx: 680 })
  if (inlineSize !== '680px') {
    throw new Error(`Expected zoom-scaled card width to clamp to max, got ${inlineSize}`)
  }
}

export function testLegacyGalleryWorkspaceSurfaceRemoved() {
  const workspaceUi = readRepoFile('canvas/src/features/markdown-explorer/workspaceUi.ts')
  const toolbar = readRepoFile('canvas/src/features/markdown-workspace/MarkdownWorkspaceToolbar.tsx')
  const layout = readRepoFile('canvas/src/features/markdown-workspace/main/layout/MarkdownWorkspaceLayout.tsx')
  const viewport = readRepoFile('canvas/src/components/CanvasViewport.tsx')
  const staleSurface = resolve(
    REPO_ROOT,
    `canvas/src/features/markdown-workspace/main/presentation/MarkdownWorkspace${'Slides'}${'Gallery'}Surface.tsx`,
  )

  if (existsSync(staleSurface)) throw new Error('Expected legacy gallery surface file to be removed')
  for (const [name, text] of Object.entries({ workspaceUi, toolbar, layout })) {
    if (text.includes(`slides-${'gallery'}`) || text.includes(`Slides ${'Gallery'}`)) {
      throw new Error(`Expected ${name} to be free of legacy gallery layout references`)
    }
  }
  if (!viewport.includes("active2dSurface === 'gallery'")) throw new Error('Expected CanvasViewport to dispatch gallery surface')
}
