import React from 'react'
import { WORKSPACE_ROOT_PATH, normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { runWorkspaceFsChangedBatch, suppressNextWorkspaceFsChangedEvent } from '@/features/workspace-fs/workspaceFsEvents'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { activateDesignEditorSurface } from '@/features/design/designEditorLaunchState'
import { bulkSetWorkspaceEntrySources, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { writeWorkspaceFileAndSync } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.io'
import { normalizeWorkspaceImportUrlInput } from '@/lib/url'
import type { Canvas2dRendererId } from '@/lib/config.render'
import {
  getWorkspaceUrlImportCanvasRendererLabel,
  isWorkspaceUrlImportCanvasRendererId,
  normalizeWorkspaceUrlImportDocumentMode,
} from '../workspaceImport/canvasPresets'
import {
  hydrateWorkspaceFileFromPendingLocalImport,
  importWorkspaceLocalFiles,
  importWorkspaceLocalFolder,
  importWorkspaceUrl,
} from '../workspaceImport'
import type { WorkspaceImportResult } from '../workspaceImport/types'
import type { WorkspaceBridgeImportResult, WorkspaceFileSelection, WorkspaceImportActionsCtx } from './types'
import { summarizeCorpusImportManifest } from '@/features/queryable-corpus/sourceFilesCorpusManifest'
import { inferCorpusMediaKind } from '@/features/queryable-corpus/corpusGraph'
import { registerStrybldrImageFiles } from '@/features/strybldr/strybldrImageFileRegistry'
import { registerVideoSequenceSourceFiles } from '@/components/timeline/videoSequenceSourceRegistry'
import {
  buildStrybldrStoryboardDocument,
  buildStrybldrWorkspaceDocumentName,
  serializeStrybldrStoryboardMarkdown,
} from '@/features/strybldr/strybldrStoryboard'
import { activateStrybldrImportSurface } from '@/features/strybldr/strybldrImportSurface'

const loadWorkspaceImportRuntimeActions = (): Promise<typeof import('./importRuntimeActions')> => import('./importRuntimeActions')

export function useWorkspaceImportActions(args: {
  core: {
    importJobRef: React.MutableRefObject<number>
    status: ReturnType<typeof import('./core').useWorkspaceStatusHelpers>
    focusAfterImport: (createdPath: string, opts?: { sourceUrl?: string | null; jsonSourceText?: string | null; applyToGraph?: boolean; jobId?: number }) => Promise<void>
  }
  ctx: WorkspaceImportActionsCtx
}) {
  const { importJobRef, status, focusAfterImport } = args.core
  const {
    getFs,
    refresh,
    openedPath,
    activeDocumentKey,
    setActiveText,
    setEntries,
    lastLoadedRef,
    setActiveMarkdownDocument,
  } = args.ctx

  const hydratePendingImportedPaths = React.useCallback(async (fs: WorkspaceFs, createdPaths: string[]) => {
    for (const path of createdPaths || []) {
      const nextPath = String(path || '').trim()
      if (!nextPath) continue
      await hydrateWorkspaceFileFromPendingLocalImport({ fs, path: nextPath }).catch(() => null)
    }
  }, [])

  const syncImportedExternalWrite = React.useCallback(
    async (
      fs: WorkspaceFs,
      path: WorkspacePath | null | undefined,
      opts?: { sourceUrl?: string | null; jsonSourceText?: string | null },
    ) => {
      const normalized = normalizeWorkspacePath(path || '')
      if (!normalized || normalized === WORKSPACE_ROOT_PATH) return
      const text = String((await fs.readFileText(normalized).catch(() => '')) || '')
      await writeWorkspaceFileAndSync({
        path: normalized,
        text,
        getFs: async () => fs,
        skipWrite: true,
        lastLoadedRef,
        setEntries,
        synchronizeActiveDocument: openedPath === normalized,
        setActiveText,
        activeDocumentKey: workspaceDocumentKey(normalized) || activeDocumentKey,
        activeDocumentSourceUrl: opts?.sourceUrl ?? null,
        jsonSourceText: opts?.jsonSourceText ?? null,
        setActiveMarkdownDocument,
        resetParsedState: false,
      })
    },
    [
      activeDocumentKey,
      lastLoadedRef,
      openedPath,
      setActiveMarkdownDocument,
      setActiveText,
      setEntries,
    ],
  )

  const finalizeWorkspaceImportCommit = React.useCallback(
    async (args: {
      fs: WorkspaceFs
      result: WorkspaceImportResult
      hydratePending: boolean
      applyToGraph: boolean
      resolveSourceUrl?: boolean
    }) => {
      const { fs, result } = args
      const {
        applyWorkspaceImportToCanvasBestEffort,
        pickFirstCreatedFilePathForImportFocus,
      } = await loadWorkspaceImportRuntimeActions()
      for (const path of result.removedPaths || []) setWorkspaceEntrySource(path, null)
      bulkSetWorkspaceEntrySources(result.sources)
      if (args.hydratePending) {
        await hydratePendingImportedPaths(fs, result.createdPaths)
      }
      const createdPath = await pickFirstCreatedFilePathForImportFocus(fs, result.createdPaths)
      if (args.applyToGraph && createdPath) {
        try {
          useMarkdownExplorerStore.getState().setActivePath(createdPath as WorkspacePath)
        } catch {
          void 0
        }
      }
      const refreshed = await refresh()
      await applyWorkspaceImportToCanvasBestEffort({
        fs,
        createdPaths: result.createdPaths,
        opts: {
          applyToGraph: args.applyToGraph === true,
          workspaceEntries: refreshed.entries,
          sourcesByPath: refreshed.sourcesByPath,
          ...(result.removedPaths ? { removedPaths: result.removedPaths } : {}),
        },
      })
      const source = args.resolveSourceUrl && createdPath ? result.sources.find(s => s.path === createdPath)?.source : result.sources[0]?.source
      const sourceUrl = source && source.kind === 'url' ? source.url : null
      const jsonSourceText = createdPath
        ? (result.jsonSourceDocuments || []).find(item => String(item?.path || '').trim() === createdPath)?.text ?? null
        : null
      if (createdPath) await syncImportedExternalWrite(fs, createdPath, { sourceUrl, jsonSourceText })
      return { createdPath, sourceUrl, jsonSourceText }
    },
    [hydratePendingImportedPaths, refresh, syncImportedExternalWrite],
  )

  const resolveWorkspaceImportApplyToGraph = React.useCallback(
    async (fs: WorkspaceFs, res: WorkspaceImportResult, importRuntime: typeof import('./importRuntimeActions')) => {
      if (typeof res.applyToGraph === 'boolean') return res.applyToGraph
      if ((res.corpusManifest?.sourceUnits || []).length > 0) return true
      return await importRuntime.resolveImportedCanvasDocumentApplyToGraph({
        fs,
        createdPaths: res.createdPaths,
      })
    },
    [],
  )

  const formatWorkspaceImportSummary = React.useCallback(
    (prefix: string, result: WorkspaceImportResult) => {
      const imported = result.createdPaths.length
      const skipped = result.skipped.length
      const failed = result.failed.length
      const suffix = skipped || failed ? ` (skipped ${skipped}, failed ${failed})` : ''
      const corpusSummary = summarizeCorpusImportManifest(result.corpusManifest)
      const corpusSuffix = corpusSummary ? `; corpus ${corpusSummary}` : ''
      const firstFailure = prefix === 'Imported URL'
        ? result.failed.find(f => String((f as { name?: unknown }).name || '').trim() === 'GitHub repo import') || result.failed[0]
        : result.failed[0]
      const failureSuffix =
        failed > 0 && firstFailure
          ? `: ${String(firstFailure.name || 'file').trim() || 'file'} — ${String(firstFailure.error || '').trim() || 'failed'}`
          : ''
      return {
        imported,
        skipped,
        failed,
        suffix,
        failureSuffix,
        message: `${prefix}${prefix.endsWith(': ') ? imported : imported > 1 && prefix === 'Imported URL' ? ` ${imported}` : ` ${imported}`}${suffix}${failureSuffix}${corpusSuffix}`,
      }
    },
    [],
  )

  const handleImportLocalFiles = React.useCallback(
    async (files: WorkspaceFileSelection) => {
      const snapshot = files ? Array.from(files) : []
      if (snapshot.length === 0) return
      const jobId = (importJobRef.current += 1)
      status.setStatusProgress('Importing', 0, snapshot.length)
      try {
        const fs = await getFs()
        await fs.ensureSeed()
        const importRuntime = await loadWorkspaceImportRuntimeActions()
        const res = importRuntime.normalizeWorkspaceImportResult(await runWorkspaceFsChangedBatch(() => {
          suppressNextWorkspaceFsChangedEvent()
          return importWorkspaceLocalFiles({
            fs,
            files: snapshot,
            parentPath: WORKSPACE_ROOT_PATH,
            onProgress: p => {
              if (importJobRef.current !== jobId) return
              status.setStatusProgress(p.label || 'Importing', p.current, p.total, p.bytesCurrent, p.bytesTotal)
            },
          })
        }))
        if (importJobRef.current !== jobId) return
        registerVideoSequenceSourceFiles(snapshot)
        const applyToGraph = await resolveWorkspaceImportApplyToGraph(fs, res, importRuntime)
        if (importJobRef.current !== jobId) return
        const { createdPath, jsonSourceText } = await finalizeWorkspaceImportCommit({
          fs,
          result: res,
          hydratePending: false,
          applyToGraph,
        })
        if (createdPath) {
          await focusAfterImport(createdPath, { applyToGraph, jsonSourceText, jobId })
        }
        status.setStatusInfo(formatWorkspaceImportSummary('Imported', res).message)
        return { createdPaths: res.createdPaths, removedPaths: res.removedPaths }
      } catch (e) {
        if (importJobRef.current !== jobId) return
        status.setStatusError(`Import failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [finalizeWorkspaceImportCommit, focusAfterImport, formatWorkspaceImportSummary, getFs, importJobRef, resolveWorkspaceImportApplyToGraph, status],
  )

  const handleImportLocalImages = React.useCallback(
    async (files: WorkspaceFileSelection) => {
      const snapshot = files ? Array.from(files) : []
      const images = snapshot.filter(file => inferCorpusMediaKind(file.name, file.type) === 'image')
      if (snapshot.length === 0) return
      if (images.length === 0) {
        status.setStatusWarning('Import Image: no supported image files selected')
        return
      }
      const jobId = (importJobRef.current += 1)
      status.setStatusProgress('Importing image', 0, images.length)
      try {
        const fs = await getFs()
        await fs.ensureSeed()
        const importRuntime = await loadWorkspaceImportRuntimeActions()
        let storyPath: string | null = null
        const res = importRuntime.normalizeWorkspaceImportResult(await runWorkspaceFsChangedBatch(() => {
          suppressNextWorkspaceFsChangedEvent()
          return importWorkspaceLocalFiles({
            fs,
            files: images,
            parentPath: WORKSPACE_ROOT_PATH,
            onProgress: p => {
              if (importJobRef.current !== jobId) return
              status.setStatusProgress(p.label || 'Importing image', p.current, p.total, p.bytesCurrent, p.bytesTotal)
            },
          })
        }))
        if (importJobRef.current !== jobId) return
        const imageSourceUnits = (res.corpusManifest?.sourceUnits || []).filter(unit => unit.mediaKind === 'image')
        const mediaUrlBySourceUnitId = registerStrybldrImageFiles({ sourceUnits: imageSourceUnits, files: images })
        if (imageSourceUnits.length > 0) {
          const storyDoc = buildStrybldrStoryboardDocument({
            sourceUnits: imageSourceUnits,
            mediaUrlBySourceUnitId,
          })
          const storyName = storyDoc.sources.length === 1
            ? buildStrybldrWorkspaceDocumentName(storyDoc.sources[0]!)
            : `${storyDoc.runId}.strybldr.md`
          const createdStoryPath = await fs.createFile({
            parentPath: WORKSPACE_ROOT_PATH,
            name: storyName,
            text: serializeStrybldrStoryboardMarkdown(storyDoc),
          })
          storyPath = createdStoryPath
          res.createdPaths = [createdStoryPath, ...res.createdPaths.filter(path => path !== createdStoryPath)]
          res.sources = [
            { path: createdStoryPath, source: { kind: 'local', originalName: storyName } },
            ...res.sources.filter(item => item.path !== createdStoryPath),
          ]
          res.applyToGraph = true
        }
        if (importJobRef.current !== jobId) return
        const { createdPath, jsonSourceText } = await finalizeWorkspaceImportCommit({
          fs,
          result: res,
          hydratePending: false,
          applyToGraph: true,
        })
        activateStrybldrImportSurface({ canvas2dRenderer: 'storyboard' })
        const focusPath = storyPath || createdPath
        if (focusPath) {
          await focusAfterImport(focusPath, { applyToGraph: true, jsonSourceText: focusPath === createdPath ? jsonSourceText : null, jobId })
        }
        status.setStatusInfo(formatWorkspaceImportSummary('Imported image', res).message)
        return { createdPaths: res.createdPaths, removedPaths: res.removedPaths }
      } catch (e) {
        if (importJobRef.current !== jobId) return
        status.setStatusError(`Import Image failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [finalizeWorkspaceImportCommit, focusAfterImport, formatWorkspaceImportSummary, getFs, importJobRef, status],
  )

  const handleImportLocalFolder = React.useCallback(
    async (files: WorkspaceFileSelection) => {
      const snapshot = files ? Array.from(files) : []
      if (snapshot.length === 0) return
      const jobId = (importJobRef.current += 1)
      try {
        const fs = await getFs()
        await fs.ensureSeed()
        const importRuntime = await loadWorkspaceImportRuntimeActions()
        const res = importRuntime.normalizeWorkspaceImportResult(await runWorkspaceFsChangedBatch(() => {
          suppressNextWorkspaceFsChangedEvent()
          return importWorkspaceLocalFolder({
            fs,
            files: snapshot,
          })
        }))
        if (importJobRef.current !== jobId) return
        registerVideoSequenceSourceFiles(snapshot)
        const applyToGraph = await resolveWorkspaceImportApplyToGraph(fs, res, importRuntime)
        if (importJobRef.current !== jobId) return
        const { createdPath, jsonSourceText } = await finalizeWorkspaceImportCommit({
          fs,
          result: res,
          hydratePending: false,
          applyToGraph,
        })
        if (createdPath) {
          await focusAfterImport(createdPath, { applyToGraph, jsonSourceText, jobId })
        }
        status.setStatusInfo(formatWorkspaceImportSummary('Imported folder:', res).message)
        return { createdPaths: res.createdPaths, removedPaths: res.removedPaths }
      } catch (e) {
        if (importJobRef.current !== jobId) return
        status.setStatusError(`Import failed: ${String((e as { message?: unknown })?.message ?? e)}`)
      }
    },
    [finalizeWorkspaceImportCommit, focusAfterImport, formatWorkspaceImportSummary, getFs, importJobRef, resolveWorkspaceImportApplyToGraph, status],
  )

  const handleImportUrl = React.useCallback(
    async (urlRaw: string, opts?: { canvas2dRenderer?: Canvas2dRendererId | null; documentSemanticMode?: 'document' | 'keyword' | null }) => {
      const url = normalizeWorkspaceImportUrlInput(urlRaw)
      if (!url) {
        status.setStatusError('Import failed: enter a valid URL or local file path')
        useGraphStore.getState().pushUiLog({ kind: 'warning', message: 'Import URL rejected: invalid URL input', source: 'workspace:importUrl' })
        return
      }
      const selectedCanvas2dRenderer = isWorkspaceUrlImportCanvasRendererId(opts?.canvas2dRenderer) ? opts?.canvas2dRenderer : null
      const selectedDocumentSemanticMode = selectedCanvas2dRenderer ? normalizeWorkspaceUrlImportDocumentMode(opts?.documentSemanticMode) : null
      const importKindLabel = selectedCanvas2dRenderer
        ? `Importing URL (${getWorkspaceUrlImportCanvasRendererLabel(selectedCanvas2dRenderer)})`
        : 'Importing URL'
      const jobId = (importJobRef.current += 1)
      let bridgeResult: WorkspaceBridgeImportResult = { handled: true }
      status.setStatusProgress(importKindLabel, null, null, null, null, { busy: true })
      useGraphStore.getState().pushUiLog({ kind: 'neutral', message: `Import URL started: ${url}`, source: 'workspace:importUrl' })
      try {
        const fs = await getFs()
        await fs.ensureSeed()
        const importRuntime = await loadWorkspaceImportRuntimeActions()
        const maxImportLogRows = 59
        let logCount = 1
        let lastLabel = ''
        const res = importRuntime.normalizeWorkspaceImportResult(await runWorkspaceFsChangedBatch(() => {
          suppressNextWorkspaceFsChangedEvent()
          return importWorkspaceUrl({
            fs,
            urlRaw: url,
            parentPath: WORKSPACE_ROOT_PATH,
            canvas2dRenderer: selectedCanvas2dRenderer,
            documentSemanticMode: selectedDocumentSemanticMode,
            viewHint: selectedCanvas2dRenderer ? 'html' : undefined,
            onProgress: p => {
              if (importJobRef.current !== jobId) return
              const label = p.label ? String(p.label) : p.phase
              if (label && label !== lastLabel && logCount < maxImportLogRows - 1) {
                lastLabel = label
                logCount += 1
                useGraphStore.getState().pushUiLog({ kind: 'neutral', message: label, source: 'workspace:importUrl' })
              }
              if (p.phase === 'listing') {
                status.setStatusProgress(p.label ? String(p.label) : 'Listing', null, null, null, null, { busy: true })
                return
              }
              if (p.phase === 'fetching' && p.total && p.total > 0) {
                const pct = p.current && p.current > 0 ? (p.current / p.total) * 100 : 0
                const stageLabel = status.buildWebpageImportStageLabel(pct)
                const pctInt = Math.max(0, Math.min(100, Math.floor(pct)))
                if (pctInt >= 90) {
                  status.setStatusProgress(stageLabel, null, null, null, null, { busy: true })
                  return
                }
                status.setStatusProgress(stageLabel, pctInt, 100)
                return
              }
              if (p.phase === 'fetching') {
                const stageLabel = status.buildWebpageImportStageLabel(0)
                status.setStatusProgress(stageLabel, null, null, null, null, { busy: true })
                return
              }
              if (p.total && p.total > 0) {
                const label = 'Writing'
                if (p.current && p.current > 0) status.setStatusProgress(label, p.current, p.total)
                else status.setStatusProgress(label, null, null, null, null, { busy: true })
                return
              }
              status.setStatusProgress('Writing', null, null, null, null, { busy: true })
            },
          })
        }))
        bridgeResult = {
          handled: true,
          createdPaths: res.createdPaths,
          removedPaths: res.removedPaths,
        }
        if (importJobRef.current !== jobId) return bridgeResult
        const summary = formatWorkspaceImportSummary('Imported URL', res)
        const applyToGraph = typeof res.applyToGraph === 'boolean'
          ? res.applyToGraph
          : await importRuntime.resolveImportedCanvasDocumentApplyToGraph({
              fs,
              createdPaths: res.createdPaths,
            })
        if (importJobRef.current !== jobId) return bridgeResult
        const { createdPath, sourceUrl, jsonSourceText } = await finalizeWorkspaceImportCommit({
          fs,
          result: res,
          hydratePending: false,
          applyToGraph,
          resolveSourceUrl: true,
        })

        if (createdPath) {
          await focusAfterImport(createdPath, { sourceUrl, jsonSourceText, applyToGraph, jobId })
        }
        if (selectedCanvas2dRenderer === 'design') {
          activateDesignEditorSurface({ openFloatingPanel: true })
        }
        if (selectedCanvas2dRenderer === 'storyboard') {
          activateStrybldrImportSurface({ canvas2dRenderer: 'storyboard' })
        }

        status.setStatusInfo(summary.imported > 1 ? `Imported ${summary.imported}${summary.suffix}${summary.failureSuffix}` : `Imported URL${summary.suffix}${summary.failureSuffix}`)
        useGraphStore.getState().pushUiLog({
          kind: summary.failed > 0 ? 'warning' : 'success',
          message: `Import URL finished: ${summary.imported} imported${summary.suffix}${summary.failureSuffix}`,
          source: 'workspace:importUrl',
        })
        return bridgeResult
      } catch (e) {
        const msg = String((e as { message?: unknown })?.message ?? e)
        if (importJobRef.current !== jobId) {
          return { ...bridgeResult, error: msg }
        }
        status.setStatusError(`Import failed: ${msg}`)
        useGraphStore.getState().pushUiLog({ kind: 'error', message: `Import URL failed: ${msg}`, source: 'workspace:importUrl' })
        return { ...bridgeResult, error: msg }
      }
    },
    [finalizeWorkspaceImportCommit, focusAfterImport, formatWorkspaceImportSummary, getFs, importJobRef, status],
  )

  return { handleImportLocalFiles, handleImportLocalImages, handleImportLocalFolder, handleImportUrl }
}
