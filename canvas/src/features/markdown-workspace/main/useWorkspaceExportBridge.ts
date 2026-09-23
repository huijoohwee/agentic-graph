import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { UiToastInput } from '@/hooks/store/types'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { isStandaloneSpatialCaptureManifestText } from '@/features/markdown-workspace/workspaceImport/spatialCaptureFileset'

type UseWorkspaceExportBridgeArgs = {
  enabled?: boolean
  activeDocumentKey: string
  activeText: string
  jsonSourceText?: string | null
  markdownEditText: string | null
  viewerTextOverride?: string | null
  showWebpageHtml: boolean
  iframeSrcDoc: string
  viewerEl: HTMLElement | null
  pushUiToast: (toast: UiToastInput) => void
  onSaveAs?: () => void
  getViewerRefCurrent: () => HTMLElement | null
}

export function useWorkspaceExportBridge(args: UseWorkspaceExportBridgeArgs) {
  const {
    activeDocumentKey,
    activeText,
    jsonSourceText,
    markdownEditText,
    viewerTextOverride,
    showWebpageHtml,
    iframeSrcDoc,
    viewerEl,
    pushUiToast,
    onSaveAs,
    getViewerRefCurrent,
  } = args

  const exportBaseName = React.useMemo(() => {
    const raw = String(activeDocumentKey || '').trim() || 'document'
    const base = raw.split('/').filter(Boolean).pop() || raw
    return base.replace(/\.[a-z0-9]+$/i, '') || 'document'
  }, [activeDocumentKey])
  const exportFallbackMarkdownText = React.useMemo(
    () => String(markdownEditText ?? (typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText)),
    [activeText, markdownEditText, viewerTextOverride],
  )
  const activeExportText = React.useMemo(
    () => String(typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText),
    [activeText, viewerTextOverride],
  )
  const exportModelSceneActions = !isStandaloneSpatialCaptureManifestText(activeExportText)
  const xrActive = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const mp4Controller = React.useRef<AbortController | null>(null)
  const [mp4Running, setMp4Running] = React.useState(false)
  const currentSource = React.useRef({ key: activeDocumentKey, text: activeExportText })
  currentSource.current = { key: activeDocumentKey, text: activeExportText }
  React.useEffect(() => () => { mp4Controller.current?.abort() }, [activeDocumentKey, activeExportText, xrActive])
  const cancelMediaExport = React.useCallback(() => { mp4Controller.current?.abort() }, [])
  const handleExportMp4 = React.useCallback(async () => {
    if (mp4Controller.current) return
    const controller = new AbortController()
    mp4Controller.current = controller
    setMp4Running(true)
    const source = currentSource.current
    try {
      const { exportCanvasXrMp4 } = await import('./exports/exportXrMp4')
      await exportCanvasXrMp4({ exportBaseName, activeDocumentPath: source.key, signal: controller.signal,
        isCurrent: () => currentSource.current.key === source.key && currentSource.current.text === source.text,
        pushUiToast, getStore: () => useGraphStore.getState() })
    } finally {
      if (mp4Controller.current === controller) { mp4Controller.current = null; setMp4Running(false) }
    }
  }, [exportBaseName, pushUiToast])


  const flushGraphWritebackForExport = React.useCallback(() => {
    try {
      useGraphStore.getState().flushComposedPositionWritesNow()
    } catch {
      void 0
    }
  }, [])

  const handleExportWorkspaceFile = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const text = String(typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText)
    const mod = await import('./exports/exportWorkspaceFile')
    const { exportWorkspaceFileJsonLd } = mod
    await exportWorkspaceFileJsonLd({ activeDocumentKey, exportBaseName, text })
  }, [activeDocumentKey, activeText, exportBaseName, flushGraphWritebackForExport, viewerTextOverride])

  const handleExportMarkdown = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportMarkdown')
    const { exportMarkdownFile } = mod
    await exportMarkdownFile({ exportBaseName, text: exportFallbackMarkdownText, activeDocumentPath: activeDocumentKey })
  }, [activeDocumentKey, exportBaseName, exportFallbackMarkdownText, flushGraphWritebackForExport])

  const handleExportPng = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportPng')
    const { exportCanvasPng } = mod
    await exportCanvasPng({
      exportBaseName,
      activeDocumentPath: activeDocumentKey,
      pushUiToast,
      getStore: () => useGraphStore.getState(),
    })
  }, [activeDocumentKey, exportBaseName, flushGraphWritebackForExport, pushUiToast])

  const handleExportGlb = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportGlb')
    const { exportCanvasGlb } = mod
    await exportCanvasGlb({
      exportBaseName,
      activeDocumentPath: activeDocumentKey,
      activeText: String(typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText),
      pushUiToast,
      getStore: () => useGraphStore.getState(),
    })
  }, [activeDocumentKey, activeText, exportBaseName, flushGraphWritebackForExport, pushUiToast, viewerTextOverride])

  const handleExportGltf = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportGlb')
    const { exportCanvasGltf } = mod
    await exportCanvasGltf({
      exportBaseName,
      activeDocumentPath: activeDocumentKey,
      activeText: String(typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText),
      pushUiToast,
      getStore: () => useGraphStore.getState(),
    })
  }, [activeDocumentKey, activeText, exportBaseName, flushGraphWritebackForExport, pushUiToast, viewerTextOverride])

  const handleExportHtmlViewer = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportHtmlViewer')
    const { exportHtmlViewerSnapshot } = mod
    await exportHtmlViewerSnapshot({
      exportBaseName,
      activeDocumentPath: activeDocumentKey,
      showWebpageHtml,
      iframeSrcDoc,
      viewerEl,
      viewerRefCurrent: getViewerRefCurrent(),
      fallbackMarkdownText: exportFallbackMarkdownText,
      pushUiToast,
    })
  }, [activeDocumentKey, exportBaseName, exportFallbackMarkdownText, flushGraphWritebackForExport, getViewerRefCurrent, iframeSrcDoc, pushUiToast, showWebpageHtml, viewerEl])

  const handleExportHtmlWorkspace = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportHtmlWorkspace')
    const { exportHtmlWorkspaceFromWorkspace } = mod
    await exportHtmlWorkspaceFromWorkspace({
      exportBaseName,
      activeDocumentPath: activeDocumentKey,
      showWebpageHtml,
      iframeSrcDoc,
      viewerEl,
      viewerRefCurrent: getViewerRefCurrent(),
      fallbackMarkdownText: exportFallbackMarkdownText,
      pushUiToast,
    })
  }, [activeDocumentKey, exportBaseName, exportFallbackMarkdownText, flushGraphWritebackForExport, getViewerRefCurrent, iframeSrcDoc, pushUiToast, showWebpageHtml, viewerEl])

  const handleExportHtmlCanvas = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportHtmlCanvas')
    const { exportHtmlCanvasFromWorkspace } = mod
    await exportHtmlCanvasFromWorkspace({ exportBaseName, activeDocumentPath: activeDocumentKey, pushUiToast })
  }, [activeDocumentKey, exportBaseName, flushGraphWritebackForExport, pushUiToast])

  const handleExportSvg = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportSvg')
    const { exportCanvasSvg } = mod
    await exportCanvasSvg({
      exportBaseName,
      activeDocumentPath: activeDocumentKey,
      pushUiToast,
      getStore: () => useGraphStore.getState(),
    })
  }, [activeDocumentKey, exportBaseName, flushGraphWritebackForExport, pushUiToast])

  const handleExportJson = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const activeExportText = String(typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText)
    const dataFileMod = await import('./exports/exportCsvJsonDataFile')
    const { exportCsvJsonWorkspaceDataFile } = dataFileMod
    const dataFileExported = await exportCsvJsonWorkspaceDataFile({
      activeDocumentKey,
      activeText: activeExportText,
      targetFormat: 'json',
      jsonSourceText,
    })
    if (dataFileExported) return
    const gd = useGraphStore.getState().graphData
    const mod = await import('./exports/exportJson')
    const { exportGraphJson } = mod
    await exportGraphJson({ graphData: gd, exportBaseName, pushUiToast })
  }, [activeDocumentKey, activeText, exportBaseName, flushGraphWritebackForExport, jsonSourceText, pushUiToast, viewerTextOverride])

  const handleExportCsv = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const activeExportText = String(typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText)
    const dataFileMod = await import('./exports/exportCsvJsonDataFile')
    const { exportCsvJsonWorkspaceDataFile } = dataFileMod
    const dataFileExported = await exportCsvJsonWorkspaceDataFile({
      activeDocumentKey,
      activeText: activeExportText,
      targetFormat: 'csv',
      jsonSourceText,
    })
    if (dataFileExported) return
    const gd = useGraphStore.getState().graphData
    const mod = await import('./exports/exportCsv')
    const { exportGraphCsv } = mod
    await exportGraphCsv({ graphData: gd, exportBaseName, pushUiToast })
  }, [activeDocumentKey, activeText, exportBaseName, flushGraphWritebackForExport, jsonSourceText, pushUiToast, viewerTextOverride])

  const handleExportPdfPortrait = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportPdf')
    const { exportViewerPdf } = mod
    await exportViewerPdf({ exportBaseName, viewerEl, viewerRefCurrent: getViewerRefCurrent(), pushUiToast, orientation: 'portrait', markdownText: exportFallbackMarkdownText })
  }, [exportBaseName, exportFallbackMarkdownText, flushGraphWritebackForExport, getViewerRefCurrent, pushUiToast, viewerEl])

  const handleExportPdfLandscape = React.useCallback(async () => {
    flushGraphWritebackForExport()
    const mod = await import('./exports/exportPdf')
    const { exportViewerPdf } = mod
    await exportViewerPdf({ exportBaseName, viewerEl, viewerRefCurrent: getViewerRefCurrent(), pushUiToast, orientation: 'landscape', markdownText: exportFallbackMarkdownText })
  }, [exportBaseName, exportFallbackMarkdownText, flushGraphWritebackForExport, getViewerRefCurrent, pushUiToast, viewerEl])

  const exportBridge = React.useMemo(
    () => ({
      export: {
        duplicateInWorkspace: onSaveAs,
        workspaceFileJsonLd: () => void handleExportWorkspaceFile(),
        markdown: () => void handleExportMarkdown(),
        png: () => void handleExportPng(),
        ...(xrActive ? { mp4: () => void handleExportMp4() } : {}),
        ...(mp4Running ? { cancelMediaExport } : {}),
        ...(exportModelSceneActions ? {
          gltf: () => void handleExportGltf(),
          glb: () => void handleExportGlb(),
        } : {}),
        htmlWorkspace: () => void handleExportHtmlWorkspace(),
        htmlViewer: () => void handleExportHtmlViewer(),
        htmlCanvas: () => void handleExportHtmlCanvas(),
        json: () => void handleExportJson(),
        csv: () => void handleExportCsv(),
        svg: () => void handleExportSvg(),
        pdfPortrait: () => void handleExportPdfPortrait(),
        pdfLandscape: () => void handleExportPdfLandscape(),
      },
    }),
    [
      handleExportGlb,
      handleExportGltf,
      handleExportMp4, xrActive, mp4Running, cancelMediaExport,
      exportModelSceneActions,
      handleExportHtmlCanvas,
      handleExportHtmlWorkspace,
      handleExportHtmlViewer,
      handleExportCsv,
      handleExportJson,
      handleExportMarkdown,
      handleExportPng,
      handleExportPdfLandscape,
      handleExportPdfPortrait,
      handleExportSvg,
      handleExportWorkspaceFile,
      onSaveAs,
    ],
  )

  React.useEffect(() => {
    if (args.enabled === false) return
    return registerMarkdownWorkspaceActionBridge('markdown-workspace-export', exportBridge)
  }, [args.enabled, exportBridge])

  return {
    handleExportMp4, cancelMediaExport, mp4Running,
    handleExportWorkspaceFile,
    handleExportMarkdown,
    handleExportPng,
    handleExportGlb,
    handleExportGltf,
    handleExportHtmlWorkspace,
    handleExportHtmlViewer,
    handleExportHtmlCanvas,
    handleExportSvg,
    handleExportJson,
    handleExportCsv,
    handleExportPdfPortrait,
    handleExportPdfLandscape,
  }
}
