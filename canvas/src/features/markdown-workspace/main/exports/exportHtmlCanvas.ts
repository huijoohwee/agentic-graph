import { downloadBlob, saveBlobWithPicker } from '@/lib/graph/save'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import { exportGraphAsCentered3dSvgMarkup } from '@/lib/graph/graphCenteredSvg3d'
import { renderGraphCanvasSvgForHtmlExport } from '@/lib/graph/htmlCanvasSvgExport'
import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { defaultSchema } from '@/lib/graph/schema'
import { readZoomScaleExtent } from '@/lib/graph/layoutDefaults'
import { readPanSpeed, readWheelBehavior, readZoomSpeed } from '@/lib/canvas/camera-options-2d'
import { readSnapGridScalarSize } from '@/lib/canvas/snapGridSize'
import type { UiToastInput } from '@/hooks/store/types'
import { computeEffectiveFrontmatterMode } from '@/lib/graph/frontmatterMode'
import { readDocumentViewModeContext } from '@/lib/graph/documentViewMode'
import { fitAllTransform } from '@/components/GraphCanvas/fit'
import { readFitAllOptions, readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import { injectLiveMarkdownDesignBlocksIntoSvgMarkupAnchored, readCanvasViewportSizeFromDom } from '@/lib/graph/svgSnapshot'
import { deriveGraphDataForActiveView } from '@/hooks/useActiveGraphData'
import { lexMarkdown, buildMarkdownTokensKey } from '@/features/markdown/ui/markdownPreviewLex'
import { deriveMarkdownDesignLayout, deriveMarkdownDesignLayoutFromGraphBlocks } from '@/features/markdown-edgeless/markdownDesignLayout'
import { normalizeInteractiveSvgForHtmlViewer } from './normalizeInteractiveSvg'
import { rewriteSvgMarkupForStandaloneHtmlExport } from '@/lib/graph/htmlViewer/rewriteSvgMarkupForStandaloneHtmlExport'
import { computeMarkdownAnchorNodeIdByBlockId } from '@/lib/render/markdownPanelOverlayPool'
import { extractNodePosByIdFromSvgMarkup } from '@/lib/graph/svgNodePos'
import { pickLayoutSeedPositions2dForExport } from '@/lib/graph/exportLayoutSeed2d'
import { ensureSvgHasEdgeGeometry } from '@/lib/graph/svgEdgeGeometry'
import { injectMarkdownDesignBlocksIntoSvgEl } from '@/lib/graph/htmlViewer/markdownDesignSvgOverlay'
import { captureLiveOverlayHtmlForHtmlViewerExport } from '@/lib/graph/htmlViewer/liveOverlayExport'
import { readViewportControlsPresetFromLocalStorage } from '@/lib/graph/htmlViewer/exportViewportControls'
import { writeAgenticOsCompanionOutputText } from '@/features/chat/chatHistoryWorkspace.output'
import { readOverlaySizingInputFromStoreState } from '@/lib/render/overlaySizing2d'

const deriveThreeCameraStartup = (
  pose: { position?: { x?: number; y?: number; z?: number }; target?: { x?: number; y?: number; z?: number } } | null | undefined,
): { exportCameraZ?: number; exportTiltXRad?: number; exportYaw0Rad?: number } => {
  if (!pose) return {}
  const px = Number(pose.position?.x)
  const py = Number(pose.position?.y)
  const pz = Number(pose.position?.z)
  const tx = Number(pose.target?.x)
  const ty = Number(pose.target?.y)
  const tz = Number(pose.target?.z)
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz) || !Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
    return {}
  }
  const dx = px - tx
  const dy = py - ty
  const dz = pz - tz
  const horiz = Math.hypot(dx, dz)
  const dist = Math.hypot(dx, dy, dz)
  const pitch = Math.atan2(dy, Math.max(1e-6, horiz))
  const yaw = Math.atan2(dx, dz)
  return {
    exportCameraZ: Number.isFinite(dist) ? Math.max(80, Math.min(1200, dist)) : undefined,
    exportTiltXRad: Number.isFinite(pitch) ? Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, pitch)) : undefined,
    exportYaw0Rad: Number.isFinite(yaw) ? -yaw : undefined,
  }
}

export type BuildHtmlCanvasWorkspaceDocumentArgs = {
  exportBaseName: string
  pushUiToast: (toast: UiToastInput) => void
}

export type BuildHtmlCanvasWorkspaceDocumentResult = {
  html: string
  mode: '2d' | '3d'
}

export async function buildHtmlCanvasWorkspaceDocument(args: BuildHtmlCanvasWorkspaceDocumentArgs): Promise<BuildHtmlCanvasWorkspaceDocumentResult | null> {
  try {
    const exportBaseName = String(args.exportBaseName || '').trim() || 'document'
    const store = useGraphStore.getState()

    const geospatialEnabled = readGeospatialOverlayEnabledPreference()

    const wants3dExport =
      store.canvasRenderMode === '3d' || (store.canvasRenderModeIsAuto === true && store.canvasRenderModeLastFree === '3d')

    const baseGraphData = store.graphData
    const schema = store.schema
    if (!baseGraphData || !schema) {
      args.pushUiToast({ id: 'export-html-missing-canvas', kind: 'warning', message: 'No canvas snapshot available.' })
      return null
    }

    const documentSemanticMode = store.documentSemanticMode === 'keyword' ? 'keyword' : 'document'
    const multiDimTableModeEnabled = store.multiDimTableModeEnabled === true
    const frontmatterModeEnabled = computeEffectiveFrontmatterMode({
      frontmatterModeEnabled: store.frontmatterModeEnabled,
      documentSemanticMode: store.documentSemanticMode,
      graphData: baseGraphData,
    })
    const documentViewMode = readDocumentViewModeContext({
      frontmatterModeEnabled: frontmatterModeEnabled === true,
      multiDimTableModeEnabled,
      documentSemanticMode,
      documentStructureBaselineLock: store.documentStructureBaselineLock === true,
    })
    const layoutSemanticModeKey = documentViewMode.documentSemanticModeKey
    const forceDocumentStructure = documentViewMode.forceDocumentStructureGroups

    const graphData = deriveGraphDataForActiveView({
      graphData: baseGraphData,
      frontmatterModeEnabled: store.frontmatterModeEnabled === true,
      multiDimTableModeEnabled,
      documentSemanticMode,
      documentStructureBaselineLock: store.documentStructureBaselineLock === true,
      collapsedGroupIds: Array.isArray(store.collapsedGroupIds) ? store.collapsedGroupIds : [],
    })

    const markdownDesignLayoutFromDoc = (() => {
      try {
        const markdownText = String(store.markdownDocumentText || '')
        if (!markdownText.trim()) return null
        const activeDocumentPath = String(store.markdownDocumentName || '').trim() || 'markdown'
        const markdownTokensKey = buildMarkdownTokensKey(markdownText)
        const lexed = lexMarkdown(markdownText)
        return deriveMarkdownDesignLayout({ activeDocumentPath, markdownTokensKey, tokens: lexed.tokens as never })
      } catch {
        return null
      }
    })()
    let markdownDesignLayout = markdownDesignLayoutFromDoc
    let markdownDesignBlocks = Array.isArray(markdownDesignLayoutFromDoc?.blocks) ? markdownDesignLayoutFromDoc!.blocks : []

    const panelOnlyNodeIdsFromMarkdownTables = (() => {
      try {
        const layout = markdownDesignLayoutFromDoc
        const blocks = Array.isArray(layout?.blocks) ? layout!.blocks : []
        if (!layout || blocks.length === 0) return [] as string[]
        const nodes = Array.isArray((graphData as any)?.nodes) ? ((graphData as any).nodes as any[]) : []
        if (nodes.length === 0) return [] as string[]
        const anchorByBlockId = computeMarkdownAnchorNodeIdByBlockId({ layout, nodes })
        const out: string[] = []
        for (let i = 0; i < blocks.length; i += 1) {
          const b = blocks[i] as any
          const kind = String(b?.preview?.kind || '').trim()
          if (kind !== 'table') continue
          const blockId = String(b?.id || '').trim()
          const anchorNodeId = blockId ? String((anchorByBlockId as any)?.[blockId] || '').trim() : ''
          if (anchorNodeId) out.push(anchorNodeId)
        }
        return Array.from(new Set(out))
      } catch {
        return [] as string[]
      }
    })()

    const vp = readCanvasViewportSizeFromDom()
    const fixedViewport = {
      widthPx: Math.max(1, Math.floor(Number(vp.w) || 1920)),
      heightPx: Math.max(1, Math.floor(Number(vp.h) || 1080)),
    }
    const fitInitialView2d = (() => {
      try {
        const mode = readLayoutMode(schema)
        const baseOpts = readFitAllOptions({ schema, mode, intent: 'fitToScreen' })
        const opts = {
          ...baseOpts,
          centerMode: 'centroid',
          schema,
          graphData,
          deriveGroupsOptions: { forceDocumentStructure },
        }
        const t = fitAllTransform((graphData.nodes ?? []) as any, fixedViewport.widthPx, fixedViewport.heightPx, opts as any)
        if (!t || !(typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0)) return null
        return { k: t.k, x: t.x, y: t.y }
      } catch {
        return null
      }
    })()

    const exportView = await (async (): Promise<{ svgMarkup: string; initialView: { k: number; x: number; y: number } | null }> => {
      if (!geospatialEnabled) {
        if (wants3dExport) {
          const positionsById = store.captureThreeLayoutPositions() || undefined
          const exportCameraPose = store.captureThreeCameraPose() || undefined
          const exportCameraStartup = deriveThreeCameraStartup(exportCameraPose as any)
          const schemaThree = store.schema?.three
          const exportAutoRotate = schemaThree?.cameraAutoRotate === true
          const exportAutoRotateSpeed =
            typeof schemaThree?.cameraAutoRotateSpeed === 'number' && Number.isFinite(schemaThree.cameraAutoRotateSpeed)
              ? schemaThree.cameraAutoRotateSpeed
              : undefined
          const exportMotionIntensityMultiplier =
            typeof schemaThree?.nodeMotionIntensity === 'number' && Number.isFinite(schemaThree.nodeMotionIntensity)
              ? Math.max(0, schemaThree.nodeMotionIntensity)
              : undefined
          const exportShaderLineWidthPx =
            typeof (store as unknown as { threeShaderLineWidthPx?: unknown }).threeShaderLineWidthPx === 'number' &&
            Number.isFinite((store as unknown as { threeShaderLineWidthPx?: number }).threeShaderLineWidthPx)
              ? Math.max(0.5, Math.min(20, Number((store as unknown as { threeShaderLineWidthPx?: number }).threeShaderLineWidthPx)))
              : undefined
          const centered3d = exportGraphAsCentered3dSvgMarkup({
            graphData,
            schema,
            widthPx: fixedViewport.widthPx,
            heightPx: fixedViewport.heightPx,
            paddingPx: 96,
            includeXmlDeclaration: false,
            animated: true,
            exportAutoRotate,
            exportAutoRotateSpeed,
            exportMotionIntensityMultiplier,
            exportTiltXRad: exportCameraStartup.exportTiltXRad ?? 0.45,
            exportCameraZ: exportCameraStartup.exportCameraZ ?? 200,
            exportYaw0Rad: exportCameraStartup.exportYaw0Rad,
            threeEdgeRenderer: store.threeEdgeRenderer,
            exportShaderLineWidthPx,
            positionsById,
            exportCameraPose,
          })
          const trimmed = String(centered3d || '').trim()
          if (trimmed) return { svgMarkup: trimmed, initialView: null }
        } else {
          const snap = await (async (): Promise<string | null> => {
            const maxAttempts = 3
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
              const v = await store.captureCanvasSvgSnapshot('2d')
              const snapped = String(v || '')
              if (snapped.trim()) return snapped
              if (typeof requestAnimationFrame === 'function') {
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
              } else {
                await new Promise<void>(resolve => setTimeout(resolve, 30))
              }
            }
            return null
          })()
          const snapped = String(snap || '').replace(/^[\s\S]*?<svg/i, '<svg').replace(/\s*<\?xml[^>]*>\s*/i, '').trim()
          if (snapped) return normalizeInteractiveSvgForHtmlViewer(snapped)

          const viewportControlsPreset =
            (store as unknown as { viewportControlsPreset?: 'map' | 'design' }).viewportControlsPreset === 'design' ? 'design' : 'map'
          const mediaPanelDensity = store.mediaPanelDensity === 'compact' ? 'compact' : 'default'
          const rendered = await renderGraphCanvasSvgForHtmlExport({
            graphData,
            graphDataRevision: store.graphDataRevision,
            schema,
            widthPx: fixedViewport.widthPx,
            heightPx: fixedViewport.heightPx,
            viewportControlsPreset,
            renderMediaAsNodes: store.renderMediaAsNodes === true,
            mediaPanelDensity,
            documentSemanticMode,
            frontmatterModeEnabled,
            markdownDesignBlocks,
            panelOnlyNodeIds: panelOnlyNodeIdsFromMarkdownTables,
            collapsedGroupIds: store.collapsedGroupIds,
            layoutPositionCacheByMode: store.layoutPositionCacheByMode,
            canvas2dRenderer: store.canvas2dRenderer,
            overlaySizing: readOverlaySizingInputFromStoreState(store),
            layoutSemanticModeKey,
          })
          if (rendered) return normalizeInteractiveSvgForHtmlViewer(rendered)
        }
      }
      const svgMarkup = await store.captureCanvasSvgSnapshot()
      const trimmed = String(svgMarkup || '').replace(/^\s*<\?xml[^>]*>\s*/i, '').trim()
      return { svgMarkup: trimmed, initialView: null }
    })()

    if (!exportView.svgMarkup) {
      args.pushUiToast({ id: 'export-html-missing-canvas', kind: 'warning', message: 'No inline SVG canvas snapshot available.' })
      return null
    }

    const svgDerivedNodePosById = extractNodePosByIdFromSvgMarkup(String(exportView.svgMarkup || ''))
    const layoutSeedPosById = pickLayoutSeedPositions2dForExport({
      graphData,
      graphDataRevision: store.graphDataRevision,
      schema,
      documentSemanticModeKey: layoutSemanticModeKey,
      frontmatterModeEnabled,
      renderMediaAsNodes: store.renderMediaAsNodes === true,
      mediaPanelDensity: store.mediaPanelDensity === 'compact' ? 'compact' : 'default',
      collapsedGroupIds: store.collapsedGroupIds,
      layoutPositionCacheByMode: store.layoutPositionCacheByMode,
      canvas2dRenderer: store.canvas2dRenderer,
    })
    const mergedNodePosById = {
      ...(layoutSeedPosById || {}),
      ...(svgDerivedNodePosById || {}),
    }

    if (!markdownDesignBlocks || markdownDesignBlocks.length === 0) {
      const graphBlocks = deriveMarkdownDesignLayoutFromGraphBlocks({
        graphData,
        graphDataRevision: store.graphDataRevision,
        nodePosById: mergedNodePosById,
      })
      if (graphBlocks && Array.isArray(graphBlocks.blocks) && graphBlocks.blocks.length > 0) {
        markdownDesignLayout = graphBlocks
        markdownDesignBlocks = graphBlocks.blocks
      }
    }
    const anchorNodeIdByBlockId = computeMarkdownAnchorNodeIdByBlockId({ layout: markdownDesignLayout, nodes: Array.isArray((graphData as any)?.nodes) ? ((graphData as any).nodes as any) : [] })
    const svgInjected = injectLiveMarkdownDesignBlocksIntoSvgMarkupAnchored({
      svgMarkup: String(exportView.svgMarkup || ''),
      anchorNodeIdByBlockId,
      nodePosById: mergedNodePosById,
    })
    const svgWithEdgeGeometry = ensureSvgHasEdgeGeometry({ svgMarkup: svgInjected, graphData, nodePosById: mergedNodePosById })
    const svgWithMarkdownFallback = (() => {
      if (svgWithEdgeGeometry.includes('data-kg-layer="markdown-design-blocks"')) return svgWithEdgeGeometry
      if (markdownDesignBlocks.length === 0) return svgWithEdgeGeometry
      if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return svgWithEdgeGeometry
      try {
        const doc = new DOMParser().parseFromString(svgWithEdgeGeometry.replace(/^<\?xml[^>]*>\s*/i, ''), 'image/svg+xml')
        const svg = doc.querySelector('svg') as unknown as SVGSVGElement | null
        if (!svg) return svgWithEdgeGeometry
        injectMarkdownDesignBlocksIntoSvgEl({ svgEl: svg, blocks: markdownDesignBlocks })
        const out = new XMLSerializer().serializeToString(svg)
        const trimmed = String(out || '').trim()
        return trimmed || svgWithEdgeGeometry
      } catch {
        return svgWithEdgeGeometry
      }
    })()
    const svgMarkup = await rewriteSvgMarkupForStandaloneHtmlExport({ svgMarkup: svgWithMarkdownFallback, inlineRemoteAssets: true })

    const graphDataForViewer = (() => {
      const nodes = Array.isArray((graphData as any)?.nodes) ? ((graphData as any).nodes as any[]) : []
      if (!nodes.length) return graphData
      if (!svgDerivedNodePosById || Object.keys(svgDerivedNodePosById).length === 0) return graphData
      let changed = false
      const nextNodes = nodes.map(n => {
        const id = String(n?.id || '').trim()
        if (!id) return n
        const p = mergedNodePosById[id]
        if (!p) return n
        const nx = Number(p.x)
        const ny = Number(p.y)
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return n
        const ox = Number((n as any).x)
        const oy = Number((n as any).y)
        if (ox === nx && oy === ny) return n
        changed = true
        return { ...(n as any), x: nx, y: ny }
      })
      return changed ? ({ ...(graphData as any), nodes: nextNodes } as any) : graphData
    })()

    const htmlViewer = await buildGraphHtmlViewerMarkup({
      title: `${exportBaseName} (Canvas)`,
      svgMarkup,
      overlayHtml: captureLiveOverlayHtmlForHtmlViewerExport(),
      graphData: graphDataForViewer,
      viewportWidthPx: fixedViewport.widthPx,
      viewportHeightPx: fixedViewport.heightPx,
      viewportScaleToFit: true,
      viewportControlsPreset: readViewportControlsPresetFromLocalStorage() || 'map',
      includeRichMediaOverlays: true,
      inlineRemoteMediaAssets: true,
      mediaOverlayPoolMax: Math.max(
        240,
        Array.isArray((graphDataForViewer as any)?.nodes) ? ((graphDataForViewer as any).nodes as any[]).length : 0,
        typeof (store as unknown as { threeIframeOverlayPoolMax?: unknown }).threeIframeOverlayPoolMax === 'number' &&
          Number.isFinite((store as unknown as { threeIframeOverlayPoolMax?: number }).threeIframeOverlayPoolMax)
          ? Math.floor((store as unknown as { threeIframeOverlayPoolMax?: number }).threeIframeOverlayPoolMax || 0)
          : 0,
      ),
      mediaPanelDensity: store.mediaPanelDensity === 'compact' ? 'compact' : 'default',
      enableDecorativeAnimation: true,
      initialFrontmatterEnabled: frontmatterModeEnabled,
      preferWebgl3d: wants3dExport,
      initialView: !geospatialEnabled && !wants3dExport ? (exportView.initialView || fitInitialView2d || undefined) : undefined,
      overlaySizing: readOverlaySizingInputFromStoreState(store),
      zoomMinK: readZoomScaleExtent(store.schema || defaultSchema)[0],
      zoomMaxK: readZoomScaleExtent(store.schema || defaultSchema)[1],
      wheelBehavior: readWheelBehavior(store.schema || defaultSchema),
      panSpeed: readPanSpeed(store.schema || defaultSchema),
      zoomSpeed: readZoomSpeed(store.schema || defaultSchema),
      flowWheelZoomSpeedMultiplier: (store as unknown as { flowWheelZoomSpeedMultiplier?: number }).flowWheelZoomSpeedMultiplier,
      flowWheelZoomIncrementMultiplier: (store as unknown as { flowWheelZoomIncrementMultiplier?: number }).flowWheelZoomIncrementMultiplier,
      flowWheelZoomSmoothMinDurationMs: (store as unknown as { flowWheelZoomSmoothMinDurationMs?: number }).flowWheelZoomSmoothMinDurationMs,
      flowWheelZoomSmoothMaxDurationMs: (store as unknown as { flowWheelZoomSmoothMaxDurationMs?: number }).flowWheelZoomSmoothMaxDurationMs,
      wheelZoomCtrlMetaBoostMultiplier: (store as unknown as { wheelZoomCtrlMetaBoostMultiplier?: number }).wheelZoomCtrlMetaBoostMultiplier,
      canvasInteractionSpeedMultiplier: (store as unknown as { canvasInteractionSpeedMultiplier?: number }).canvasInteractionSpeedMultiplier,
      canvasPanSpeedMultiplier: (store as unknown as { canvasPanSpeedMultiplier?: number }).canvasPanSpeedMultiplier,
      snapGridEnabled: !!store.schema?.behavior?.snapGrid?.enabled,
      snapGridSize: readSnapGridScalarSize(store.schema?.behavior?.snapGrid?.size),
      dragConstraint: (store.schema?.behavior?.dragConstraint as any) || 'free',
      allowNodeDrag: true,
      allowEdgeDrag: true,
      allowGroupDrag: true,
      zoomLabelScaleMode2d: (store as unknown as { zoomLabelScaleMode2d?: 'clampAt1' | 'smooth' | 'power' }).zoomLabelScaleMode2d,
      zoomLabelScaleExponent2d: (store as unknown as { zoomLabelScaleExponent2d?: number }).zoomLabelScaleExponent2d,
      zoomLabelScaleClampMin2d: (store as unknown as { zoomLabelScaleClampMin2d?: number }).zoomLabelScaleClampMin2d,
      zoomLabelScaleClampMax2d: (store as unknown as { zoomLabelScaleClampMax2d?: number }).zoomLabelScaleClampMax2d,
      zoomStrokeScaleMode2d: (store as unknown as { zoomStrokeScaleMode2d?: 'zoomScaled' | 'screenConstant' | 'power' }).zoomStrokeScaleMode2d,
      zoomStrokeScaleExponent2d: (store as unknown as { zoomStrokeScaleExponent2d?: number }).zoomStrokeScaleExponent2d,
      zoomStrokeScaleClampMin2d: (store as unknown as { zoomStrokeScaleClampMin2d?: number }).zoomStrokeScaleClampMin2d,
      zoomStrokeScaleClampMax2d: (store as unknown as { zoomStrokeScaleClampMax2d?: number }).zoomStrokeScaleClampMax2d,
      hideLabelsBelowScale: Number(store.schema?.performance?.lod?.hideLabelsBelowScale ?? 0),
    })

    if (!htmlViewer || !htmlViewer.trim()) {
      args.pushUiToast({ id: 'export-html-missing-canvas', kind: 'warning', message: 'Failed to build HTML canvas export.' })
      return null
    }

    return { html: htmlViewer, mode: wants3dExport ? '3d' : '2d' }
  } catch {
    return null
  }
}

export async function exportHtmlCanvasFromWorkspace(args: BuildHtmlCanvasWorkspaceDocumentArgs & {
  activeDocumentPath?: string | null
}): Promise<void> {
  const built = await buildHtmlCanvasWorkspaceDocument(args)
  if (!built) return
  const blob = new Blob([built.html], { type: 'text/html;charset=utf-8' })
  const name = `${String(args.exportBaseName || '').trim() || 'document'}-canvas-${built.mode}.html`
  const saved = await saveBlobWithPicker(blob, name, { description: 'HTML Files', accept: { 'text/html': ['.html'] } })
  if (saved === '') return
  if (!saved) downloadBlob(blob, name)
  await writeAgenticOsCompanionOutputText({
    workspacePath: args.activeDocumentPath,
    extension: 'html',
    variant: `canvas-${built.mode}`,
    text: built.html,
  })
}
