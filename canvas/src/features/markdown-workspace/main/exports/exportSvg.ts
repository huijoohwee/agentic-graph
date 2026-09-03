import { exportSvgSnapshot } from '@/lib/graph/file'
import { captureVisibleCanvasPngBlobFromDom, readCanvasViewportSizeFromDom, wrapPngBlobAsSvgMarkup } from '@/lib/graph/svgSnapshot'
import { exportGraphAsCenteredSvgMarkup } from '@/lib/graph/graphCenteredSvg'
import { exportGraphAsCentered3dSvgMarkup } from '@/lib/graph/graphCenteredSvg3d'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import type { UiToastInput } from '@/hooks/store/types'
import { writeAgenticOsCompanionOutputText } from '@/features/chat/chatHistoryWorkspace.output'

export async function exportCanvasSvg(args: {
  exportBaseName: string
  activeDocumentPath?: string | null
  pushUiToast: (toast: UiToastInput) => void
  getStore: () => {
    graphData: unknown
    schema: unknown
    workspaceViewMode?: unknown
    canvasRenderMode?: unknown
    canvasRenderModeIsAuto?: unknown
    canvasRenderModeLastFree?: unknown
    renderMediaAsNodes?: unknown
    threeEdgeRenderer?: unknown
    captureCanvasSvgSnapshot: () => Promise<string | null>
    captureCanvasPngSnapshot: () => Promise<Blob | null>
  }
}): Promise<void> {
  try {
    const normalizeSvgMarkup = (raw: string, fallback: { w: number; h: number }): string => {
      const s = String(raw || '').trim()
      if (!s) return ''
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(s, 'image/svg+xml')
        const root = doc.documentElement
        if (!root || String(root.nodeName || '').toLowerCase() !== 'svg') {
          return `<?xml version="1.0" encoding="UTF-8"?>\n${s}\n`
        }
        if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        if (!root.getAttribute('xmlns:xlink')) root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
        if (!root.getAttribute('width') || !root.getAttribute('height')) {
          const vb = String(root.getAttribute('viewBox') || '').trim()
          const parts = vb.split(/[ ,]+/).filter(Boolean)
          const w = parts.length === 4 ? Number(parts[2]) : NaN
          const h = parts.length === 4 ? Number(parts[3]) : NaN
          const width = Number.isFinite(w) && w > 0 ? Math.floor(w) : fallback.w
          const height = Number.isFinite(h) && h > 0 ? Math.floor(h) : fallback.h
          root.setAttribute('width', String(width))
          root.setAttribute('height', String(height))
          if (!vb || parts.length !== 4) root.setAttribute('viewBox', `0 0 ${width} ${height}`)
        }
        const out = new XMLSerializer().serializeToString(root)
        return `<?xml version="1.0" encoding="UTF-8"?>\n${out}\n`
      } catch {
        return `<?xml version="1.0" encoding="UTF-8"?>\n${s}\n`
      }
    }

    const suggested = `${args.exportBaseName}.svg`
    const exportSvgAndCompanion = async (svgMarkup: string): Promise<void> => {
      const normalized = String(svgMarkup || '').trim()
      if (!normalized) return
      await exportSvgSnapshot(normalized, suggested)
      await writeAgenticOsCompanionOutputText({
        workspacePath: args.activeDocumentPath,
        extension: 'svg',
        text: normalized,
      })
    }
    const fallbackSize = readCanvasViewportSizeFromDom()
    const store = args.getStore()
    const geospatialEnabled = readGeospatialOverlayEnabledPreference()
    const workspaceEditorEnabled = store.workspaceViewMode === 'editor'
    const wants3dExport =
      store.canvasRenderMode === '3d' || (store.canvasRenderModeIsAuto === true && store.canvasRenderModeLastFree === '3d')
    const preferDomCapture = store.renderMediaAsNodes !== true && !wants3dExport

    if (wants3dExport) {
      const graphData = store.graphData as any
      const schema = store.schema as any
      if (graphData && schema) {
        const centered3d = exportGraphAsCentered3dSvgMarkup({
          graphData,
          schema,
          widthPx: fallbackSize.w,
          heightPx: fallbackSize.h,
          paddingPx: 96,
          includeXmlDeclaration: true,
          animated: true,
          exportAutoRotate: true,
          exportAutoRotateSpeed: 1.2,
          exportMotionIntensityMultiplier: 2.2,
          exportTiltXRad: 0.45,
          exportCameraZ: 200,
          threeEdgeRenderer: store.threeEdgeRenderer as any,
        })
        if (centered3d && centered3d.trim()) {
          await exportSvgAndCompanion(centered3d)
          return
        }
      }
    }

    if (geospatialEnabled || workspaceEditorEnabled) {
      const graphData = store.graphData as any
      const schema = store.schema as any
      if (graphData && schema) {
        const centered = exportGraphAsCenteredSvgMarkup({
          graphData,
          schema,
          widthPx: fallbackSize.w,
          heightPx: fallbackSize.h,
          paddingPx: 96,
          includeXmlDeclaration: true,
          animated: workspaceEditorEnabled,
        })
        if (centered && centered.trim()) {
          await exportSvgAndCompanion(centered)
          return
        }
      }
    }

    if (!geospatialEnabled && !preferDomCapture) {
      const svg = await store.captureCanvasSvgSnapshot()
      const trimmedSvg = normalizeSvgMarkup(svg || '', fallbackSize).trim()
      if (trimmedSvg) {
        await exportSvgAndCompanion(trimmedSvg)
        return
      }
    }

    const png =
      (preferDomCapture ? await captureVisibleCanvasPngBlobFromDom() : null)
      || (geospatialEnabled ? null : await store.captureCanvasPngSnapshot())
      || (await captureVisibleCanvasPngBlobFromDom())

    if (png) {
      const wrapped = await wrapPngBlobAsSvgMarkup(png, { includeXmlDeclaration: true, width: fallbackSize.w, height: fallbackSize.h })
      if (!wrapped || !wrapped.trim()) {
        args.pushUiToast({ id: 'export-svg-missing-canvas-wrap', kind: 'warning', message: 'Failed to wrap canvas PNG into SVG.' })
        return
      }
      await exportSvgAndCompanion(wrapped)
      return
    }

    args.pushUiToast({ id: 'export-svg-missing-canvas', kind: 'warning', message: 'No canvas snapshot available.' })
  } catch {
    void 0
  }
}
