import type { UiToastInput } from '@/hooks/store/types'
import type { WorkspaceBridgeImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { VideoDownloadOptions } from '@/lib/video-download/types'
import { activateDesignEditorSurface } from '@/features/design/designEditorLaunchState'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { normalizeImportUrlInput, normalizeWorkspaceImportUrlInput } from '@/lib/url'
import {
  getWorkspaceUrlImportCanvasRendererLabel,
  isWorkspaceUrlImportCanvasRendererId,
  normalizeWorkspaceUrlImportDocumentMode,
  type WorkspaceUrlImportCanvasRendererId,
  type WorkspaceUrlImportDocumentModeId,
} from '@/features/markdown-workspace/workspaceImport/canvasPresets'
type PushUiToast = (toast: UiToastInput) => void

async function focusFirstImportedWorkspaceFile(args: {
  fs: WorkspaceFs
  createdPaths: string[]
  applyToGraph?: boolean
  jsonSourceDocuments?: Array<{ path: string; text: string }>
}): Promise<void> {
  try {
    const { activateFirstImportedWorkspaceFile } = (await import(
      '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
    )) as typeof import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions')
    await activateFirstImportedWorkspaceFile(args)
  } catch {
    void 0
  }
}

export async function importLocalFilesFallback(args: {
  files: FileList | ReadonlyArray<File> | null
  pushUiToast: PushUiToast
}): Promise<void | WorkspaceBridgeImportResult> {
  const snapshot = args.files ? Array.from(args.files as ArrayLike<File>) : []
  if (snapshot.length === 0) return
  args.pushUiToast({
    id: 'launch:import:localFiles',
    kind: 'neutral',
    message: `Importing ${snapshot.length} file(s)…`,
    ttlMs: null,
    dismissible: false,
  })
  try {
    const [
      { getWorkspaceFs },
      { WORKSPACE_ROOT_PATH },
      { runWorkspaceFsChangedBatch },
      { bulkSetWorkspaceEntrySources },
      { importWorkspaceLocalFiles },
      { applyWorkspaceImportToCanvasBestEffort, normalizeWorkspaceImportResult, resolveImportedCanvasDocumentApplyToGraph },
    ] =
      await Promise.all([
        import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
        import('@/features/workspace-fs/path') as Promise<typeof import('@/features/workspace-fs/path')>,
        import('@/features/workspace-fs/workspaceFsEvents') as Promise<typeof import('@/features/workspace-fs/workspaceFsEvents')>,
        import('@/features/workspace-fs/sourceIndex') as Promise<typeof import('@/features/workspace-fs/sourceIndex')>,
        import('@/features/markdown-workspace/workspaceImport') as Promise<
          typeof import('@/features/markdown-workspace/workspaceImport')
        >,
        import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions') as Promise<
          typeof import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions')
        >,
      ])
    const { registerVideoSequenceSourceFiles } = (await import(
      '@/components/timeline/videoSequenceSourceRegistry'
    )) as typeof import('@/components/timeline/videoSequenceSourceRegistry')
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const res = normalizeWorkspaceImportResult(await runWorkspaceFsChangedBatch(() =>
      importWorkspaceLocalFiles({
        fs,
        files: snapshot,
        parentPath: WORKSPACE_ROOT_PATH,
      }),
    ))
    registerVideoSequenceSourceFiles(snapshot)
    bulkSetWorkspaceEntrySources(res.sources as Array<{ path: string; source: WorkspaceEntrySource }>)
    const applyToGraph = typeof res.applyToGraph === 'boolean'
      ? res.applyToGraph
      : await resolveImportedCanvasDocumentApplyToGraph({ fs, createdPaths: res.createdPaths })
    await applyWorkspaceImportToCanvasBestEffort({
      fs,
      createdPaths: res.createdPaths,
      opts: { applyToGraph },
    })
    await focusFirstImportedWorkspaceFile({ fs, createdPaths: res.createdPaths, applyToGraph, jsonSourceDocuments: res.jsonSourceDocuments })
    args.pushUiToast({
      id: 'launch:import:localFiles',
      kind: 'success',
      message: `Imported ${res.createdPaths.length} file(s)`,
      ttlMs: UI_TOAST_TTL_MS.actionFeedback,
      dismissible: false,
    })
    return { createdPaths: res.createdPaths, removedPaths: res.removedPaths }
  } catch (e) {
    args.pushUiToast({
      id: 'launch:import:localFiles',
      kind: 'error',
      message: `Import failed: ${String((e as { message?: unknown })?.message ?? e)}`,
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
  }
}

export async function importLocalFolderFallback(args: {
  files: FileList | ReadonlyArray<File> | null
  pushUiToast: PushUiToast
}): Promise<void | WorkspaceBridgeImportResult> {
  const snapshot = args.files ? Array.from(args.files as ArrayLike<File>) : []
  if (snapshot.length === 0) return
  args.pushUiToast({ id: 'launch:import:folder', kind: 'neutral', message: 'Importing folder…', ttlMs: null, dismissible: false })
  try {
    const [
      { getWorkspaceFs },
      { runWorkspaceFsChangedBatch },
      { bulkSetWorkspaceEntrySources },
      { importWorkspaceLocalFolder },
      { applyWorkspaceImportToCanvasBestEffort, normalizeWorkspaceImportResult, resolveImportedCanvasDocumentApplyToGraph },
    ] =
      await Promise.all([
        import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
        import('@/features/workspace-fs/workspaceFsEvents') as Promise<typeof import('@/features/workspace-fs/workspaceFsEvents')>,
        import('@/features/workspace-fs/sourceIndex') as Promise<typeof import('@/features/workspace-fs/sourceIndex')>,
        import('@/features/markdown-workspace/workspaceImport') as Promise<
          typeof import('@/features/markdown-workspace/workspaceImport')
        >,
        import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions') as Promise<
          typeof import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions')
        >,
      ])
    const { registerVideoSequenceSourceFiles } = (await import(
      '@/components/timeline/videoSequenceSourceRegistry'
    )) as typeof import('@/components/timeline/videoSequenceSourceRegistry')
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const res = normalizeWorkspaceImportResult(await runWorkspaceFsChangedBatch(() => importWorkspaceLocalFolder({ fs, files: snapshot })))
    registerVideoSequenceSourceFiles(snapshot)
    bulkSetWorkspaceEntrySources(res.sources as Array<{ path: string; source: WorkspaceEntrySource }>)
    const applyToGraph = typeof res.applyToGraph === 'boolean'
      ? res.applyToGraph
      : await resolveImportedCanvasDocumentApplyToGraph({ fs, createdPaths: res.createdPaths })
    await applyWorkspaceImportToCanvasBestEffort({
      fs,
      createdPaths: res.createdPaths,
      opts: { applyToGraph },
    })
    await focusFirstImportedWorkspaceFile({ fs, createdPaths: res.createdPaths, applyToGraph, jsonSourceDocuments: res.jsonSourceDocuments })
    args.pushUiToast({
      id: 'launch:import:folder',
      kind: 'success',
      message: `Imported ${res.createdPaths.length} file(s)`,
      ttlMs: UI_TOAST_TTL_MS.actionFeedback,
      dismissible: false,
    })
    return { createdPaths: res.createdPaths, removedPaths: res.removedPaths }
  } catch (e) {
    args.pushUiToast({
      id: 'launch:import:folder',
      kind: 'error',
      message: `Import failed: ${String((e as { message?: unknown })?.message ?? e)}`,
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
  }
}

export async function importUrlFallback(args: {
  urlRaw: string
  canvas2dRenderer?: WorkspaceUrlImportCanvasRendererId | null
  documentSemanticMode?: WorkspaceUrlImportDocumentModeId | null
  pushUiToast: PushUiToast
}): Promise<void | WorkspaceBridgeImportResult> {
  const url = normalizeWorkspaceImportUrlInput(args.urlRaw)
  if (!url) {
    args.pushUiToast({
      id: 'launch:import:url',
      kind: 'warning',
      message: 'Enter a valid URL or local file path before importing',
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
    return
  }
  const canvas2dRenderer = isWorkspaceUrlImportCanvasRendererId(args.canvas2dRenderer) ? args.canvas2dRenderer : null
  const documentSemanticMode = canvas2dRenderer ? normalizeWorkspaceUrlImportDocumentMode(args.documentSemanticMode) : null
  const rendererLabel = canvas2dRenderer ? getWorkspaceUrlImportCanvasRendererLabel(canvas2dRenderer) : ''
  const toastId = 'launch:import:url'
  args.pushUiToast({ id: toastId, kind: 'neutral', message: rendererLabel ? `Importing URL (${rendererLabel})…` : 'Importing URL…', ttlMs: null, dismissible: false, busy: true })
  try {
    const [
      { getWorkspaceFs },
      { WORKSPACE_ROOT_PATH },
      { runWorkspaceFsChangedBatch },
      { bulkSetWorkspaceEntrySources },
      { importWorkspaceUrl },
      { applyWorkspaceImportToCanvasBestEffort, normalizeWorkspaceImportResult, resolveImportedCanvasDocumentApplyToGraph },
    ] =
      await Promise.all([
        import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
        import('@/features/workspace-fs/path') as Promise<typeof import('@/features/workspace-fs/path')>,
        import('@/features/workspace-fs/workspaceFsEvents') as Promise<typeof import('@/features/workspace-fs/workspaceFsEvents')>,
        import('@/features/workspace-fs/sourceIndex') as Promise<typeof import('@/features/workspace-fs/sourceIndex')>,
        import('@/features/markdown-workspace/workspaceImport') as Promise<
          typeof import('@/features/markdown-workspace/workspaceImport')
        >,
        import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions') as Promise<
          typeof import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions')
        >,
      ])
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const res = normalizeWorkspaceImportResult(await runWorkspaceFsChangedBatch(() =>
      importWorkspaceUrl({
        fs,
        urlRaw: url,
        parentPath: WORKSPACE_ROOT_PATH,
        canvas2dRenderer,
        documentSemanticMode,
        viewHint: canvas2dRenderer ? 'html' : undefined,
        onProgress: p => {
          const label = String((p as { label?: unknown }).label || '').trim() || 'Importing URL…'
          args.pushUiToast({ id: toastId, kind: 'neutral', message: label, ttlMs: null, dismissible: false, busy: true })
        },
      }),
    ))
    bulkSetWorkspaceEntrySources(res.sources as Array<{ path: string; source: WorkspaceEntrySource }>)
    const applyToGraph = typeof res.applyToGraph === 'boolean'
      ? res.applyToGraph
      : await resolveImportedCanvasDocumentApplyToGraph({ fs, createdPaths: res.createdPaths })
    await applyWorkspaceImportToCanvasBestEffort({
      fs,
      createdPaths: res.createdPaths,
      opts: { applyToGraph },
    })
    await focusFirstImportedWorkspaceFile({ fs, createdPaths: res.createdPaths, applyToGraph })
    args.pushUiToast({
      id: toastId,
      kind: 'success',
      message: `Imported ${res.createdPaths.length} file(s)`,
      ttlMs: UI_TOAST_TTL_MS.actionFeedback,
      dismissible: false,
    })
    return { createdPaths: res.createdPaths, removedPaths: res.removedPaths }
  } catch (e) {
    const error = String((e as { message?: unknown })?.message ?? e)
    args.pushUiToast({
      id: toastId,
      kind: 'error',
      message: `Import failed: ${error}`,
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
    return { handled: true, error }
  }
}

export async function importUrlDeerFlowFallback(args: {
  urlRaw: string
  canvas2dRenderer?: WorkspaceUrlImportCanvasRendererId | null
  documentSemanticMode?: WorkspaceUrlImportDocumentModeId | null
  pushUiToast: PushUiToast
}): Promise<void> {
  const url = normalizeImportUrlInput(args.urlRaw)
  if (!url) {
    args.pushUiToast({
      id: 'launch:import:url:deerflow',
      kind: 'warning',
      message: 'Enter a valid http(s) URL before importing',
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
    return
  }
  const toastId = 'launch:import:url:deerflow'
  args.pushUiToast({ id: toastId, kind: 'neutral', message: 'Importing URL (DeerFlow)…', ttlMs: null, dismissible: false })
  try {
    const { importUrlViaDeerFlowAndApply } = (await import(
      '@/features/markdown-workspace/useWorkspaceFileActions/deerflowUrlImportAction'
    )) as typeof import('@/features/markdown-workspace/useWorkspaceFileActions/deerflowUrlImportAction')
    const canvas2dRenderer = isWorkspaceUrlImportCanvasRendererId(args.canvas2dRenderer) ? args.canvas2dRenderer : null
    await importUrlViaDeerFlowAndApply({
      urlRaw: url,
      canvas2dRenderer,
      documentSemanticMode: canvas2dRenderer ? normalizeWorkspaceUrlImportDocumentMode(args.documentSemanticMode) : null,
      pushUiToast: args.pushUiToast,
    })
    if (canvas2dRenderer === 'design') {
      activateDesignEditorSurface({ openFloatingPanel: true })
    }
  } catch (e) {
    args.pushUiToast({
      id: toastId,
      kind: 'error',
      message: `Import failed: ${String((e as { message?: unknown })?.message ?? e)}`,
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
  }
}

export async function createNewFolderFallback(args: {
  pushUiToast: PushUiToast
}): Promise<void> {
  const toastId = 'launch:workspace:newFolder'
  args.pushUiToast({ id: toastId, kind: 'neutral', message: 'Creating folder…', ttlMs: null, dismissible: false })
  try {
    const [{ getWorkspaceFs }, { WORKSPACE_ROOT_PATH }] = await Promise.all([
      import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
      import('@/features/workspace-fs/path') as Promise<typeof import('@/features/workspace-fs/path')>,
    ])
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    await fs.createFolder({ parentPath: WORKSPACE_ROOT_PATH, name: 'folder' })
    args.pushUiToast({ id: toastId, kind: 'success', message: 'Created folder', ttlMs: UI_TOAST_TTL_MS.statusAutoCloseSlow, dismissible: false })
  } catch (e) {
    args.pushUiToast({
      id: toastId,
      kind: 'error',
      message: `Failed: ${String((e as { message?: unknown })?.message ?? e)}`,
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
  }
}

export async function videoDownloadFallback(args: {
  url: string
  options: VideoDownloadOptions
  pushUiToast: PushUiToast
}): Promise<void> {
  const url = String(args.url || '').trim()
  if (!url) return
  const toastId = 'launch:video-download'
  args.pushUiToast({
    id: toastId,
    kind: 'neutral',
    message: 'Downloading video…',
    ttlMs: null,
    dismissible: false,
    busy: true,
  })
  try {
    const [
      { resolveVideoDownload },
      { registerVideoDownloadInWorkspace },
      { getWorkspaceFs },
    ] = await Promise.all([
      import('@/lib/video-download/videoDownloadResolver') as Promise<typeof import('@/lib/video-download/videoDownloadResolver')>,
      import('@/lib/video-download/registerVideoDownloadInWorkspace') as Promise<typeof import('@/lib/video-download/registerVideoDownloadInWorkspace')>,
      import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
    ])
    const download = await resolveVideoDownload(url, args.options)
    if (download.ok === false) {
      args.pushUiToast({
        id: toastId,
        kind: download.errorCode === 'not_configured' ? 'warning' : 'error',
        message: download.errorCode === 'not_configured'
          ? 'Configure VITE_VIDEO_DOWNLOAD_ENDPOINT before downloading'
          : `Download failed: ${download.error}`,
        ttlMs: UI_TOAST_TTL_MS.warningExtended,
        dismissible: true,
      })
      return
    }
    const fs = await getWorkspaceFs()
    const registration = await registerVideoDownloadInWorkspace({ result: download.result, fs })
    if (registration.ok === false) {
      args.pushUiToast({
        id: toastId,
        kind: 'warning',
        message: `Downloaded, but workspace registration failed: ${registration.error}`,
        ttlMs: UI_TOAST_TTL_MS.warningExtended,
        dismissible: true,
      })
      return
    }
    await focusFirstImportedWorkspaceFile({ fs, createdPaths: [registration.workspacePath], applyToGraph: false })
    args.pushUiToast({
      id: toastId,
      kind: 'success',
      message: `Downloaded ${download.result.fileName}`,
      ttlMs: UI_TOAST_TTL_MS.actionFeedback,
      dismissible: false,
    })
  } catch (error) {
    args.pushUiToast({
      id: toastId,
      kind: 'error',
      message: `Download failed: ${String((error as { message?: unknown })?.message ?? error)}`,
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
  }
}

export async function exportHtmlViewerFallbackAction(args: {
  pushUiToast: PushUiToast
}): Promise<void> {
  const { exportHtmlViewerFallback } = (await import('@/features/toolbar/exportHtmlFallback')) as typeof import(
    '@/features/toolbar/exportHtmlFallback'
  )
  await exportHtmlViewerFallback({ pushUiToast: args.pushUiToast })
}

export async function exportHtmlCanvasFallbackAction(args: {
  pushUiToast: PushUiToast
}): Promise<void> {
  const { exportHtmlCanvasFallback } = (await import('@/features/toolbar/exportHtmlFallback')) as typeof import(
    '@/features/toolbar/exportHtmlFallback'
  )
  await exportHtmlCanvasFallback({ pushUiToast: args.pushUiToast })
}
