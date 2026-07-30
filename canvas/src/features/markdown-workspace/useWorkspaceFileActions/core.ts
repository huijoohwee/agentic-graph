import React from 'react'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import {
  WORKSPACE_ROOT_PATH,
  ancestorPathsForWorkspacePath,
  normalizeWorkspacePath,
  workspaceDocumentKey,
} from '@/features/workspace-fs/path'
import { UI_COPY } from '@/lib/config'
import { readWidgetRegistryMetadataEntries } from '@/lib/config.storyboard-widget'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isMarkdownLikeFileName } from 'grph-shared/markdown/mermaidInput'
import { parsePdfWorkspaceFrontmatter } from '@/lib/pdf/pdfWorkspaceFrontmatter'
import { fetchPdfWorkspaceDoc } from '@/lib/pdf/pdfWorkspaceClient'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { syncWorkspaceTextState } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.io'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import {
  requestCanvasFrontmatterGeospatialSurface,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import type { StatusHelpers, UseWorkspaceFileActionsArgs } from './types'
import type { MarkdownWorkspaceStatus } from '../markdownWorkspaceTypes'
import { formatMarkdownWorkspaceStatusLabel } from '../markdownWorkspaceStatusUi'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { runWorkspaceFsChangedBatch, suppressNextWorkspaceFsChangedEvent } from '@/features/workspace-fs/workspaceFsEvents'
import { getDefaultNewWorkspaceFileName, resolveNewWorkspaceFileDraft } from './fileDraft'
import { shouldApplyImportedCanvasDocumentToGraph } from '../workspaceImport/applyPolicy'
import { activateStrybldrImportSurface } from '@/features/strybldr/strybldrImportSurface'

const DEFAULT_WORKSPACE_STATUS_TOAST_ID = 'markdown-workspace-status'

const lastToastSigById = new Map<string, string>()

const shouldSkipToast = (id: string, sig: string): boolean => {
  const prev = lastToastSigById.get(id)
  if (prev === sig) return true
  lastToastSigById.set(id, sig)
  return false
}

export function shouldForceDocumentSemanticModeForImport(nameForParse: string): boolean {
  const lower = String(nameForParse || '').trim().toLowerCase()
  if (!lower) return false
  if (isMarkdownLikeFileName(lower)) return false
  return (
    lower.endsWith('.json') ||
    lower.endsWith('.jsonld') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.geojson') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml')
  )
}

export function useWorkspaceStatusHelpers(opts?: { toastId?: string }): StatusHelpers {
  const toastId = String(opts?.toastId || DEFAULT_WORKSPACE_STATUS_TOAST_ID).trim() || DEFAULT_WORKSPACE_STATUS_TOAST_ID

  const buildWebpageImportStageLabel = React.useCallback((pctRaw: number): string => {
    const pct = Math.max(0, Math.min(100, Math.floor(Number.isFinite(pctRaw) ? pctRaw : 0)))
    if (pct < 20) return 'Fetching webpage HTML'
    if (pct < 60) return 'Processing webpage DOM'
    if (pct < 90) return 'Converting webpage to Markdown'
    return 'Finalizing webpage document'
  }, [])

  const emitToast = React.useCallback(
    (args: { kind: 'neutral' | 'success' | 'warning' | 'error'; message: string; ttlMs?: number | null; dismissible?: boolean; busy?: boolean; log?: boolean }) => {
      const message = String(args.message || '').trim()
      if (!message) return
      const kind = args.kind
      const ttlMs = typeof args.ttlMs === 'undefined' ? UI_TOAST_TTL_MS.statusAutoClose : args.ttlMs
      const dismissible = typeof args.dismissible === 'boolean' ? args.dismissible : kind === 'error'
      const busy = args.busy === true
      const sig = `${kind}|${ttlMs ?? 'null'}|${dismissible ? '1' : '0'}|${busy ? '1' : '0'}|${message}`
      if (shouldSkipToast(toastId, sig)) return
      try {
        useGraphStore.getState().upsertUiToast({
          id: toastId,
          kind,
        message,
        ttlMs,
        dismissible,
        busy,
        log: args.log === true,
      })
      } catch {
        void 0
      }
    },
    [toastId],
  )

  const setStatusInfo = React.useCallback(
    (label: string, statusOpts?: { ttlMs?: number | null; dismissible?: boolean }) => {
      const msg = String(label || '').trim()
      if (!msg) return
      emitToast({
        kind: 'neutral',
        message: msg,
        ttlMs: statusOpts?.ttlMs,
        dismissible: typeof statusOpts?.dismissible === 'boolean' ? statusOpts.dismissible : true,
      })
    },
    [emitToast],
  )

  const setStatusError = React.useCallback(
    (label: string, statusOpts?: { ttlMs?: number | null; dismissible?: boolean }) => {
      const msg = String(label || '').trim()
      if (!msg) return
      emitToast({
        kind: 'error',
        message: msg,
        ttlMs: typeof statusOpts?.ttlMs === 'undefined' ? null : statusOpts.ttlMs,
        dismissible: typeof statusOpts?.dismissible === 'boolean' ? statusOpts.dismissible : true,
        log: true,
      })
    },
    [emitToast],
  )

  const setStatusWarning = React.useCallback(
    (label: string, statusOpts?: { ttlMs?: number | null; dismissible?: boolean }) => {
      const msg = String(label || '').trim()
      if (!msg) return
      emitToast({
        kind: 'warning',
        message: msg,
        ttlMs: statusOpts?.ttlMs,
        dismissible: typeof statusOpts?.dismissible === 'boolean' ? statusOpts.dismissible : true,
      })
    },
    [emitToast],
  )

  const setStatusProgress = React.useCallback(
    (
      label: string,
      current?: number | null,
      total?: number | null,
      bytesCurrent?: number | null,
      bytesTotal?: number | null,
      statusOpts?: { ttlMs?: number | null; busy?: boolean },
    ) => {
      const msg = String(label || '').trim()
      if (!msg) return
      const status: MarkdownWorkspaceStatus = {
        kind: 'progress',
        label: msg,
        current: typeof current === 'number' ? current : null,
        total: typeof total === 'number' ? total : null,
        bytesCurrent: typeof bytesCurrent === 'number' ? bytesCurrent : null,
        bytesTotal: typeof bytesTotal === 'number' ? bytesTotal : null,
      }
      emitToast({
        kind: 'neutral',
        message: formatMarkdownWorkspaceStatusLabel(status),
        ttlMs: typeof statusOpts?.ttlMs === 'undefined' ? null : statusOpts.ttlMs,
        dismissible: true,
        busy: statusOpts?.busy === true,
      })
    },
    [emitToast],
  )

  const clearStatus = React.useCallback(() => {
    try {
      useGraphStore.getState().dismissUiToast(toastId)
    } catch {
      void 0
    }
    lastToastSigById.delete(toastId)
  }, [toastId])

  return { setStatusInfo, setStatusWarning, setStatusError, setStatusProgress, clearStatus, buildWebpageImportStageLabel }
}

export function useWorkspaceFileActionsCore(args: UseWorkspaceFileActionsArgs): {
  importJobRef: React.MutableRefObject<number>
  status: StatusHelpers
  focusAfterImport: (createdPath: WorkspacePath, opts?: { sourceUrl?: string | null; jsonSourceText?: string | null; applyToGraph?: boolean; jobId?: number }) => Promise<void>
  createNewFile: (opts?: { parentPath?: WorkspacePath }) => Promise<void>
  createNewFolder: (opts?: { parentPath?: WorkspacePath }) => Promise<void>
} {
  const {
    getFs,
    refresh,
    setExpandedPaths,
    setActivePathSafe,
    setSelectionPathSafe,
    activeDocumentSourceUrl,
    setActiveText,
    lastLoadedRef,
    setActiveMarkdownDocument,
    applyMarkdownDocumentToGraph,
  } = args

  const importJobRef = React.useRef(0)
  const status = useWorkspaceStatusHelpers()

  const applyImportedTextToGraph = React.useCallback(
    async (inner: { nameForParse: string; text: string }) => {
      const storeBefore = useGraphStore.getState()
      const resolvedText = await (async (): Promise<string> => {
        const meta = parsePdfWorkspaceFrontmatter(inner.text)
        if (!meta) return inner.text
        try {
          const controller = new AbortController()
          const timeoutMs = 1500
          const t = setTimeout(() => controller.abort(), timeoutMs)
          const fetched = await fetchPdfWorkspaceDoc({ docId: meta.docId, outputDirRel: meta.outputDirRel, signal: controller.signal }).finally(() => clearTimeout(t))
          if (fetched.ok !== true) return inner.text
          const markdown = String(fetched.markdown || '')
          return markdown.trim() ? markdown : inner.text
        } catch {
          return inner.text
        }
      })()

      const okMarkdown = await applyMarkdownDocumentToGraph(inner.nameForParse, resolvedText, { force: true })
      if (!okMarkdown) {
        const { loadGraphDataFromTextViaParser } = (await import('@/features/parsers/loader')) as typeof import('@/features/parsers/loader')
        await loadGraphDataFromTextViaParser(inner.nameForParse, resolvedText, { applyToStore: true })
      }

      try {
        applyCanvasFrontmatterPreset({
          graphData: useGraphStore.getState().graphData,
          rawText: resolvedText,
        })
        activateStrybldrImportSurface({
          graphData: useGraphStore.getState().graphData,
          rawText: resolvedText,
        })
      } catch {
        void 0
      }

      const store = useGraphStore.getState()
      const baselineLocked = store.documentStructureBaselineLock === true
      const graphData = store.graphData
      const hasAnyGraph = !!(graphData && (((graphData.nodes || []).length > 0) || ((graphData.edges || []).length > 0)))
      if (!hasAnyGraph) return

      if (!baselineLocked && shouldForceDocumentSemanticModeForImport(inner.nameForParse)) {
        store.setDocumentSemanticMode('document')
      }

      const hasWidgetRegistry = readWidgetRegistryMetadataEntries(graphData?.metadata).length > 0

      if (hasWidgetRegistry) {
        if (baselineLocked) {
          status.setStatusWarning(UI_COPY.baselineLockedToast, { ttlMs: UI_TOAST_TTL_MS.warningExtended, dismissible: true })
          return
        }
        const schema = store.schema
        if (schema) {
          const { enableHandlesForAllInputsInSchema } = (await import('@/lib/storyboardWidget/storyboardWidgetActions')) as typeof import('@/lib/storyboardWidget/storyboardWidgetActions')
          const res = enableHandlesForAllInputsInSchema(schema)
          if (res.changed) store.setSchema(res.schema)
        }
        store.setCanvasRenderMode('2d')
        store.setCanvas2dRenderer('storyboard')
        await requestCanvasFrontmatterGeospatialSurface(false)
        store.setWorkspaceViewMode('canvas')
        return
      }
    },
    [applyMarkdownDocumentToGraph, status],
  )

  const syncFocusedWorkspacePath = React.useCallback(
    async (path: WorkspacePath, opts?: { sourceUrl?: string | null; jsonSourceText?: string | null; applyToGraph?: boolean; jobId?: number }) => {
      if (opts?.jobId != null && importJobRef.current !== opts.jobId) return
      const fs = await getFs()
      const text = await fs.readFileText(path)
      if (opts?.jobId != null && importJobRef.current !== opts.jobId) return
      const docKey = workspaceDocumentKey(path)
      const content = String(text || '')
      syncWorkspaceTextState({
        path,
        text: content,
        lastLoadedRef,
        setActiveText,
        activeDocumentKey: content.trim() ? docKey : undefined,
        activeDocumentSourceUrl: typeof opts?.sourceUrl === 'string' ? opts.sourceUrl : activeDocumentSourceUrl,
        jsonSourceText: opts?.jsonSourceText ?? null,
        setActiveMarkdownDocument: content.trim() ? setActiveMarkdownDocument : undefined,
      })
      const shouldApplyToGraph =
        opts?.applyToGraph === true ||
        (opts?.applyToGraph !== false && shouldApplyImportedCanvasDocumentToGraph({ path: docKey || String(path || ''), text: content }))
      if (docKey && content.trim() && shouldApplyToGraph) {
        await applyImportedTextToGraph({ nameForParse: docKey, text: content })
      }
    },
    [
      activeDocumentSourceUrl,
      applyImportedTextToGraph,
      getFs,
      lastLoadedRef,
      setActiveMarkdownDocument,
      setActiveText,
    ],
  )

  const createWorkspaceEntryAndRefresh = React.useCallback(
    async (args: {
      parentPath?: WorkspacePath
      create: (inner: { fs: Awaited<ReturnType<typeof getFs>>; parentPath: WorkspacePath }) => Promise<WorkspacePath>
      afterCreate?: (path: WorkspacePath) => void
    }) => {
      const fs = await getFs()
      const parentPath = args.parentPath ? normalizeWorkspacePath(args.parentPath) : WORKSPACE_ROOT_PATH
      const path = await runWorkspaceFsChangedBatch(async () => {
        suppressNextWorkspaceFsChangedEvent()
        return await args.create({ fs, parentPath })
      })
      args.afterCreate?.(path)
      await refresh()
      return path
    },
    [getFs, refresh],
  )

  const revealWorkspacePath = React.useCallback(
    (path: WorkspacePath, opts?: { activate?: boolean }) => {
      setSelectionPathSafe(path)
      if (opts?.activate !== false) setActivePathSafe(path)
      setExpandedPaths(prev => {
        const next = new Set(prev)
        for (const ancestor of ancestorPathsForWorkspacePath(path)) next.add(ancestor)
        return next
      })
    },
    [setActivePathSafe, setExpandedPaths, setSelectionPathSafe],
  )

  const focusAfterImport = React.useCallback(
    async (createdPath: WorkspacePath, opts?: { sourceUrl?: string | null; jsonSourceText?: string | null; applyToGraph?: boolean; jobId?: number }) => {
      if (opts?.jobId != null && importJobRef.current !== opts.jobId) return
      revealWorkspacePath(createdPath, { activate: true })
      try {
        await syncFocusedWorkspacePath(createdPath, opts)
      } catch (e) {
        if (opts?.applyToGraph) {
          status.setStatusError(`Apply failed: ${String((e as { message?: unknown })?.message ?? e)}`)
        } else {
          status.setStatusError(`Open failed: ${String((e as { message?: unknown })?.message ?? e)}`)
        }
      }
    },
    [
      revealWorkspacePath,
      status,
      syncFocusedWorkspacePath,
    ],
  )

  const createNewFile = React.useCallback(
    async (opts?: { parentPath?: WorkspacePath }) => {
      const draftName = typeof window !== 'undefined'
        ? window.prompt('New file', getDefaultNewWorkspaceFileName())
        : getDefaultNewWorkspaceFileName()
      if (draftName == null) {
        status.setStatusInfo('Create cancelled', { ttlMs: UI_TOAST_TTL_MS.statusAutoCloseFast })
        return
      }
      const fileDraft = resolveNewWorkspaceFileDraft(draftName)
      if (!fileDraft) {
        status.setStatusError('Invalid name')
        return
      }
      status.setStatusProgress('Creating')
      try {
        const path = await createWorkspaceEntryAndRefresh({
          parentPath: opts?.parentPath,
          create: async ({ fs, parentPath }) => {
            return await fs.createFile({ parentPath, name: fileDraft.name, text: fileDraft.text })
          },
          afterCreate: path => {
            setWorkspaceEntrySource(path, { kind: 'local', originalName: null })
          },
        })
        await focusAfterImport(path, { applyToGraph: false })
        status.setStatusInfo('Created')
      } catch (e) {
        status.setStatusError(`Failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [createWorkspaceEntryAndRefresh, focusAfterImport, status],
  )

  const createNewFolder = React.useCallback(
    async (opts?: { parentPath?: WorkspacePath }) => {
      status.setStatusProgress('Creating')
      try {
        const path = await createWorkspaceEntryAndRefresh({
          parentPath: opts?.parentPath,
          create: async ({ fs, parentPath }) => {
            return await fs.createFolder({ parentPath, name: 'folder' })
          },
        })
        revealWorkspacePath(path, { activate: false })
        status.setStatusInfo('Created')
      } catch (e) {
        status.setStatusError(`Failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [createWorkspaceEntryAndRefresh, revealWorkspacePath, status],
  )

  return { importJobRef, status, focusAfterImport, createNewFile, createNewFolder }
}
