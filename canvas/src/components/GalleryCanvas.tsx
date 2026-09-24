import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CanvasGridOverlaySurface } from '@/components/CanvasGridOverlaySurface'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import {
  readComposedSourceFilePath,
  resolvePreferredComposedSourceRawText,
  resolvePreferredEnabledComposedSourceFile,
} from '@/features/source-files/composedSourceSelection'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useContainerDims } from '@/hooks/useContainerDims'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { commitZoomTransformToStore } from '@/lib/canvas/zoom-commit'
import {
  buildScrollSurfaceZoomTransform,
  computeScrollSurfaceZoomScaleFromRequest,
  readScrollSurfaceZoomScale,
} from '@/lib/canvas/scrollSurfaceZoom'
import { readCanvasGridRenderConfigFromSchema } from '@/lib/canvas/canvasGridConfig'
import { defaultSchema } from '@/lib/graph/schema'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_VIEWPORT_FIT_CONTENT_CLASSNAME, buildResponsiveViewportFitContentStyle } from '@/lib/ui/responsiveViewportFitGrid'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

type GalleryCanvasProps = {
  active?: boolean
}

const GALLERY_CONTENT_STYLE = buildResponsiveViewportFitContentStyle()

export default function GalleryCanvas(props: GalleryCanvasProps) {
  const active = props.active !== false
  const containerRef = React.useRef<HTMLElement | null>(null)
  const dims = useContainerDims(containerRef)
  const graphData = useActiveGraphRenderData(active)
  const explorerActivePath = useMarkdownExplorerStore(state => state.activePath)
  const typography = usePanelTypography()
  const {
    canvas2dRenderer,
    canvasRenderMode,
    clearZoomRequest,
    collapsedGroupIds,
    documentSemanticMode,
    documentStructureBaselineLock,
    frontmatterModeEnabled,
    graphDataRevision,
    mediaPanelDensity,
    multiDimTableModeEnabled,
    renderMediaAsNodes,
    sourceFiles,
    markdownDocumentName,
    markdownDocumentText,
    schema,
    resolvedThemeMode,
    darkThemeVariant,
    setZoomState,
    setZoomStateForKey,
    viewPinned,
    zoomRequest,
    zoomState,
    zoomStateByKey,
  } = useGraphStore(
    useShallow(state => ({
      canvas2dRenderer: state.canvas2dRenderer,
      canvasRenderMode: state.canvasRenderMode,
      clearZoomRequest: state.clearZoomRequest,
      collapsedGroupIds: state.collapsedGroupIds,
      documentSemanticMode: state.documentSemanticMode,
      documentStructureBaselineLock: state.documentStructureBaselineLock,
      frontmatterModeEnabled: state.frontmatterModeEnabled,
      graphDataRevision: state.graphDataRevision || 0,
      mediaPanelDensity: state.mediaPanelDensity,
      multiDimTableModeEnabled: state.multiDimTableModeEnabled,
      renderMediaAsNodes: state.renderMediaAsNodes,
      sourceFiles: state.sourceFiles,
      markdownDocumentName: state.markdownDocumentName,
      markdownDocumentText: state.markdownDocumentText,
      schema: state.schema,
      resolvedThemeMode: state.resolvedThemeMode || 'light',
      darkThemeVariant: state.darkThemeVariant,
      setZoomState: state.setZoomState,
      setZoomStateForKey: state.setZoomStateForKey,
      viewPinned: state.viewPinned === true,
      zoomRequest: state.zoomRequest,
      zoomState: state.zoomState,
      zoomStateByKey: state.zoomStateByKey,
    })),
  )
  const effectiveSchema = schema || defaultSchema
  const activeSourceFile = React.useMemo(
    () =>
      resolvePreferredEnabledComposedSourceFile({
        sourceFiles,
        markdownDocumentName,
        explorerActivePath,
        fallbackName: markdownDocumentName,
      }),
    [explorerActivePath, markdownDocumentName, sourceFiles],
  )
  const activeDocumentPath = readComposedSourceFilePath(activeSourceFile) || String(markdownDocumentName || '').trim() || 'gallery.md'
  const sourceMarkdownText = React.useMemo(() => {
    const preferred = resolvePreferredComposedSourceRawText({
      sourceFiles,
      markdownDocumentName,
      explorerActivePath,
      fallbackName: markdownDocumentName,
    })
    return preferred || String(markdownDocumentText || '')
  }, [explorerActivePath, markdownDocumentName, markdownDocumentText, sourceFiles])
  const canvasGrid = React.useMemo(() => readCanvasGridRenderConfigFromSchema(effectiveSchema), [effectiveSchema])
  const zoomViewKey = React.useMemo(
    () => buildActive2dZoomViewKey({
      canvasRenderMode,
      canvas2dRenderer,
      schema: effectiveSchema,
      graphData,
      documentSemanticMode,
      frontmatterModeEnabled,
      multiDimTableModeEnabled,
      documentStructureBaselineLock,
      renderMediaAsNodes,
      mediaPanelDensity,
      collapsedGroupIds,
    }),
    [
      canvas2dRenderer,
      canvasRenderMode,
      collapsedGroupIds,
      documentSemanticMode,
      documentStructureBaselineLock,
      effectiveSchema,
      frontmatterModeEnabled,
      graphData,
      mediaPanelDensity,
      multiDimTableModeEnabled,
      renderMediaAsNodes,
    ],
  )
  const effectiveZoomState = React.useMemo(
    () => getEffectiveZoomStateForKey({ zoomViewKey, zoomStateByKey, zoomState }),
    [zoomStateByKey, zoomState, zoomViewKey],
  )
  const galleryZoomScale = readScrollSurfaceZoomScale(effectiveZoomState?.k)
  const galleryGridTransform = React.useMemo(
    () => buildScrollSurfaceZoomTransform(galleryZoomScale),
    [galleryZoomScale],
  )
  const getGalleryGridTransform = React.useCallback(() => galleryGridTransform, [galleryGridTransform])
  const getGalleryGridEventTarget = React.useCallback(() => containerRef.current, [])

  React.useEffect(() => {
    if (!active || !zoomRequest || !zoomViewKey) return
    const nextScale = computeScrollSurfaceZoomScaleFromRequest({
      zoomRequest,
      currentScale: galleryZoomScale,
      schema: effectiveSchema,
    })
    commitZoomTransformToStore({
      state: {
        viewPinned,
        zoomState,
        zoomStateByKey,
        setZoomState,
        setZoomStateForKey,
      },
      zoomViewKey,
      transform: buildScrollSurfaceZoomTransform(nextScale),
      viewportW: Math.max(1, Math.round(dims.width || 1)),
      viewportH: Math.max(1, Math.round(dims.height || 1)),
      graphDataRevision,
    })
    clearZoomRequest()
  }, [
    active,
    clearZoomRequest,
    dims.height,
    dims.width,
    effectiveSchema,
    galleryZoomScale,
    graphDataRevision,
    setZoomState,
    setZoomStateForKey,
    viewPinned,
    zoomRequest,
    zoomState,
    zoomStateByKey,
    zoomViewKey,
  ])

  if (!active) return null

  return (
    <section
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden bg-[var(--kg-canvas-bg)] ${UI_THEME_TOKENS.text.primary}`}
      aria-label="Gallery canvas"
      data-kg-gallery-canvas="1"
      data-kg-gallery-active-document={activeDocumentPath}
      data-kg-gallery-zoom-scale={galleryZoomScale}
    >
      <CanvasGridOverlaySurface
        canvasGrid={canvasGrid}
        width={dims.width}
        height={dims.height}
        dpr={dims.dpr}
        getTransform={getGalleryGridTransform}
        getEventTarget={getGalleryGridEventTarget}
        themeSignal={`${resolvedThemeMode}:${darkThemeVariant}`}
        surfaceId="gallery"
      />
      <section className="absolute inset-0 z-[1] overflow-auto" data-kg-gallery-scroll-surface="1">
        <section className={UI_RESPONSIVE_VIEWPORT_FIT_CONTENT_CLASSNAME} style={GALLERY_CONTENT_STYLE}>
          <section className="flex min-h-[min(720px,calc(100vh-8rem))] min-w-0 overflow-hidden rounded border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] shadow-sm">
            <MarkdownPreview
              markdownText={sourceMarkdownText}
              activeDocumentPath={activeDocumentPath}
              highlightedLineRange={null}
              markdownWordWrap={true}
              markdownPresentationMode={false}
              markdownTextHighlight={false}
              selectionKind={null}
              uiPanelTextFontClass={typography.fontClass}
              uiPanelMonospaceTextClass={typography.monospaceTextClass}
              previewOverlayScope="container"
              previewOverlayPortalTarget={null}
              previewScrollable={false}
              galleryZoomScale={galleryZoomScale}
              viewMode="gallery"
              showSidebar={false}
              onShowInViewer={() => {}}
              onShowInEditor={() => {}}
              onShowInPresentation={() => {}}
              onShowInGallery={() => {}}
            />
          </section>
        </section>
      </section>
    </section>
  )
}
