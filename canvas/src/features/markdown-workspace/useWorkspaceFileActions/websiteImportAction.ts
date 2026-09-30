import React from 'react'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildWebsiteImportManifestSummary } from '@/lib/websites/websiteImportManifestSummary'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'
import { bulkSetWorkspaceEntrySources } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceImportWebsiteOpts, WorkspaceWebsiteImportProgress, WorkspaceWebsiteImportSummary } from '@/features/markdown-explorer/workspaceActionBridge'
import { createWebsiteImportWorkspaceWriter } from './websiteImportNodeWriter'
import { ancestorPathsForWorkspacePath } from '@/features/workspace-fs/path'
import { beginWebsiteImportExplorerUpdates } from '@/features/workspace-fs/websiteImportRefreshGuard'
import { MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { addCompletedWebsiteFileToExplorer } from './websiteImportExplorerProgress'
import { D3_URL_IMPORT_CANVAS_PRESET } from '../workspaceImport/canvasPresets'
export { importWebsiteViaWorkspaceRuntime, useWorkspaceWebsiteImportAction } from './websiteImportRuntimeFacade'

type WebsiteImportSettings = {
  selectedUrls?: string[]
  destinationPath?: string
  outputDirRel: string
  discoverSitemap: boolean
  maxPages: number
  concurrency: number
  includeImages: boolean
  defaultView: unknown
  generateArtifactDocs: boolean
  browserEnhance: boolean
  headless: boolean
  proxyRotation: boolean
  downloadAssets: boolean
  applyToCanvas: boolean
  preserveActiveDocument: boolean
  maxDownloads: number
  maxDownloadBytes: number
  generationToken?: string
  onProgress?: (progress: WorkspaceWebsiteImportProgress) => void
}

type WebsiteImportManifest = WebsiteImportManifestV1

function isWebsiteImportJobCurrent(importJobRef: React.MutableRefObject<number>, jobId: number): boolean {
  return importJobRef.current === jobId
}

function clampWebsiteImportMaxPages(raw: number, minPages?: number): number {
  const min = Number.isFinite(minPages) ? Math.max(1, Math.min(500, Math.floor(Number(minPages)))) : 1
  const n = Number.isFinite(raw) ? Math.floor(Number(raw)) : 100
  return Math.max(min, Math.min(500, Math.max(1, n)))
}

function resolveWebsiteImportSettings(opts?: WorkspaceImportWebsiteOpts): WebsiteImportSettings {
  const store = useGraphStore.getState()
  const configuredMaxPages = Number.isFinite(store.websiteImportMaxPages) ? Number(store.websiteImportMaxPages) : 100
  const requestedMaxPages = Number.isFinite(opts?.maxPages) ? Number(opts?.maxPages) : configuredMaxPages
  return {
    selectedUrls: opts?.selectedUrls,
    destinationPath: opts?.destinationPath,
    outputDirRel: String(store.websiteImportOutputDirRel || '').trim(),
    discoverSitemap: store.websiteImportDiscoverSitemap !== false,
    maxPages: clampWebsiteImportMaxPages(requestedMaxPages, opts?.minPages),
    concurrency: Number.isFinite(store.websiteImportConcurrency) ? Number(store.websiteImportConcurrency) : 4,
    includeImages: store.webpageImportIncludeImages ?? true,
    defaultView: store.webpageImportView,
    generateArtifactDocs: typeof opts?.generateArtifactDocs === 'boolean'
      ? opts.generateArtifactDocs
      : store.websiteImportGenerateWebpageArtifactDocs !== false,
    browserEnhance: opts?.browserEnhance === true,
    headless: opts?.headless === true,
    proxyRotation: opts?.proxyRotation === true,
    downloadAssets: opts?.downloadAssets === true,
    applyToCanvas: opts?.applyToCanvas === true,
    preserveActiveDocument: opts?.preserveActiveDocument === true,
    maxDownloads: Number.isFinite(opts?.maxDownloads) ? Math.max(1, Math.min(500, Math.floor(Number(opts?.maxDownloads)))) : 120,
    maxDownloadBytes: Number.isFinite(opts?.maxDownloadBytes) ? Math.max(1024 * 1024, Math.min(1024 * 1024 * 1024, Math.floor(Number(opts?.maxDownloadBytes)))) : 250 * 1024 * 1024,
    generationToken: typeof opts?.generationToken === 'string' ? opts.generationToken : undefined,
    onProgress: typeof opts?.onProgress === 'function' ? opts.onProgress : undefined,
  }
}

async function fetchWebsiteImportJson<T>(args: {
  url: string
  init?: RequestInit
}): Promise<{ response: Response; json: T }> {
  const response = await fetch(args.url, args.init)
  const json = (await response.json()) as T
  return { response, json }
}

async function runWebsiteImportServerJob(args: {
  url: string
  settings: WebsiteImportSettings
  importJobRef: React.MutableRefObject<number>
  jobId: number
  status: ReturnType<typeof import('./core').useWorkspaceStatusHelpers>
  onManifest?: (importId: string, manifest: WebsiteImportManifestV1) => Promise<void>
}): Promise<{ importId: string; manifest: WebsiteImportManifest }> {
  const { url, settings, importJobRef, jobId, status, onManifest } = args
  const { response: startRes, json: startJson } = await fetchWebsiteImportJson<{ ok?: unknown; importId?: unknown; error?: unknown }>({
    url: `/__website_import/start?outputDirRel=${encodeURIComponent(settings.outputDirRel)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        url,
        options: {
          selectedUrls: settings.selectedUrls,
          discoverSitemap: settings.discoverSitemap,
          maxPages: settings.maxPages,
          concurrency: settings.concurrency,
          includeImages: settings.includeImages,
          generateMarkdownArtifacts: settings.generateArtifactDocs,
          browserMode: settings.headless ? 'headless' : 'http',
          proxyRotation: settings.proxyRotation,
          downloadAssets: settings.downloadAssets,
          maxDownloads: settings.maxDownloads,
          maxDownloadBytes: settings.maxDownloadBytes,
          generationToken: settings.generationToken,
        },
      }),
    },
  })
  if (!isWebsiteImportJobCurrent(importJobRef, jobId)) throw new Error('cancelled')
  if (!startRes.ok || startJson.ok !== true || typeof startJson.importId !== 'string') {
    const err = typeof startJson.error === 'string' && startJson.error.trim() ? startJson.error.trim() : `HTTP ${startRes.status}`
    throw new Error(err)
  }
  const importId = startJson.importId

  const startedAtMs = Date.now()
  let lastProcessed = -1
  let lastMaterializedCount = 0
  let waitMs = 650
  while (true) {
    if (!isWebsiteImportJobCurrent(importJobRef, jobId)) throw new Error('cancelled')
    const { json: statusJson } = await fetchWebsiteImportJson<{
      ok?: unknown
      status?: unknown
      progress?:
        | {
            stage?: unknown
            total?: unknown
            processed?: unknown
            ok?: unknown
            error?: unknown
          }
        | null
      running?: unknown
    }>({
      url: `/__website_import/status?outputDirRel=${encodeURIComponent(settings.outputDirRel)}&importId=${encodeURIComponent(importId)}`,
      init: { headers: { Accept: 'application/json' } },
    })
    const state = typeof statusJson.status === 'string' ? statusJson.status : ''
    const progress = statusJson.progress
    const total = progress && typeof progress.total === 'number' && Number.isFinite(progress.total) ? progress.total : null
    const processed = progress && typeof progress.processed === 'number' && Number.isFinite(progress.processed) ? progress.processed : null
    const stage = progress && typeof progress.stage === 'string' ? progress.stage : ''
    settings.onProgress?.({
      stage,
      total,
      processed,
      ok: progress && typeof progress.ok === 'number' && Number.isFinite(progress.ok) ? progress.ok : null,
      error: progress && typeof progress.error === 'number' && Number.isFinite(progress.error) ? progress.error : null,
      running: statusJson.running === true,
    })
    if (onManifest && typeof processed === 'number' && processed > lastMaterializedCount && state !== 'done') {
      const { response, json } = await fetchWebsiteImportJson<{ ok?: unknown; manifest?: WebsiteImportManifestV1 }>({
        url: `/__website_import/manifest?outputDirRel=${encodeURIComponent(settings.outputDirRel)}&importId=${encodeURIComponent(importId)}`,
        init: { headers: { Accept: 'application/json' } },
      })
      if (response.ok && json.ok === true && json.manifest) {
        await onManifest(importId, json.manifest)
        lastMaterializedCount = json.manifest.nodes.length
      }
    }
    if (state === 'done') break
    if (state === 'failed') throw new Error('Import failed')
    if (Date.now() - startedAtMs > 30 * 60_000) throw new Error('Import failed')

    const label = stage === 'discovering' ? 'Discovering' : stage === 'crawling' ? 'Crawling' : stage === 'converting' ? 'Importing' : 'Importing website'
    if (typeof processed === 'number' && typeof total === 'number' && total > 0) {
      status.setStatusProgress(label, Math.min(total, Math.max(0, processed)), total)
      if (processed === lastProcessed) waitMs = Math.min(1800, waitMs + 150)
      else {
        waitMs = 650
        lastProcessed = processed
      }
    } else {
      status.setStatusProgress(label)
      waitMs = Math.min(1800, waitMs + 150)
    }
    await new Promise<void>(resolve => setTimeout(resolve, waitMs))
  }

  const { response: manifestRes, json: manifestJson } = await fetchWebsiteImportJson<{
    ok?: unknown
    manifest?: unknown
    error?: unknown
  }>({
    url: `/__website_import/manifest?outputDirRel=${encodeURIComponent(settings.outputDirRel)}&importId=${encodeURIComponent(importId)}`,
    init: { headers: { Accept: 'application/json' } },
  })
  if (!isWebsiteImportJobCurrent(importJobRef, jobId)) throw new Error('cancelled')
  if (!manifestRes.ok || manifestJson.ok !== true || !manifestJson.manifest || typeof manifestJson.manifest !== 'object') {
    const err = typeof manifestJson.error === 'string' && manifestJson.error.trim() ? manifestJson.error.trim() : `HTTP ${manifestRes.status}`
    throw new Error(err)
  }
  const manifestRaw = manifestJson.manifest as WebsiteImportManifestV1
  await onManifest?.(importId, manifestRaw)
  return {
    importId,
    manifest: manifestRaw,
  }
}

type WebsiteImportRuntimeStatus = {
  setStatusProgress: (label: string, current?: number | null, total?: number | null) => void
}

export async function runWorkspaceWebsiteImport(args: {
  url: string
  opts?: WorkspaceImportWebsiteOpts
  importJobRef: { current: number }
  jobId: number
  status: WebsiteImportRuntimeStatus
  getFs: () => Promise<WorkspaceFs>
  refresh?: () => Promise<{ entries: import('@/features/workspace-fs/types').WorkspaceEntry[]; sourcesByPath: import('@/features/workspace-fs/sourceIndex').WorkspaceSourceIndex }>
  setEntries?: React.Dispatch<React.SetStateAction<import('@/features/workspace-fs/types').WorkspaceEntry[]>>
  setExpandedPaths?: React.Dispatch<React.SetStateAction<Set<string>>>
  focusAfterImport?: (createdPath: WorkspacePath, opts?: { sourceUrl?: string | null; applyToGraph?: boolean; jobId?: number }) => Promise<void>
}): Promise<{ createdPaths: WorkspacePath[]; host: string; websiteImportManifest: WebsiteImportManifestV1; websiteImportSummary: WorkspaceWebsiteImportSummary }> {
  const settings = resolveWebsiteImportSettings(args.opts)
  if (settings.destinationPath !== undefined && settings.selectedUrls?.length !== 1) throw new Error('An in-place import requires exactly one selected page.')
  if (settings.applyToCanvas) {
    const { applyCanvasFrontmatterPreset } = await import('@/features/parsers/canvasFrontmatterPreset')
    if (!isWebsiteImportJobCurrent(args.importJobRef, args.jobId)) throw new Error('cancelled')
    applyCanvasFrontmatterPreset({ preset: D3_URL_IMPORT_CANVAS_PRESET })
  }
  let fs: WorkspaceFs | null = null
  let writer: Awaited<ReturnType<typeof createWebsiteImportWorkspaceWriter>> | null = null
  let openedSourceFiles = false
  let finishExplorerUpdates: (() => void) | null = null
  let reconciliationAttempted = false
  const pagePathsByUrl = new Map<string, WorkspacePath>()
  const getWriter = async (importId: string) => {
    if (writer) return writer
    fs = await args.getFs()
    writer = await createWebsiteImportWorkspaceWriter({
      fs,
      url: args.url,
      importId,
      settings,
      importJobRef: args.importJobRef,
      jobId: args.jobId,
      status: args.status,
      onRootPath: root => {
        if (args.setEntries) finishExplorerUpdates = beginWebsiteImportExplorerUpdates(root)
      },
      onFileCreated: async source => {
        if (!isWebsiteImportJobCurrent(args.importJobRef, args.jobId)) throw new Error('cancelled')
        pagePathsByUrl.set(source.source.url, source.path)
        bulkSetWorkspaceEntrySources([source])
        args.setEntries?.(previous => addCompletedWebsiteFileToExplorer(previous, source.path))
        args.setExpandedPaths?.(previous => {
          const ancestors = ancestorPathsForWorkspacePath(source.path)
          if (ancestors.every(path => previous.has(path))) return previous
          const next = new Set(previous)
          for (const ancestor of ancestors) next.add(ancestor)
          return next
        })
        const shouldOpenSourceFiles = !openedSourceFiles
        openedSourceFiles = true
        if (shouldOpenSourceFiles && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT, { detail: { path: source.path } }))
        }
      },
    })
    return writer
  }
  try {
    const { importId, manifest } = await runWebsiteImportServerJob({
      url: args.url,
      settings,
      importJobRef: args.importJobRef,
      jobId: args.jobId,
      status: args.status as ReturnType<typeof import('./core').useWorkspaceStatusHelpers>,
      onManifest: async (id, snapshot) => {
        if (!isWebsiteImportJobCurrent(args.importJobRef, args.jobId)) throw new Error('cancelled')
        await (await getWriter(id)).writeNodes(snapshot.nodes)
      },
    })
    if (!isWebsiteImportJobCurrent(args.importJobRef, args.jobId)) throw new Error('cancelled')
    const { created, host, canvasPath } = await (await getWriter(importId)).finalize(manifest)
    if (!fs) throw new Error('Website workspace unavailable')

    if (!isWebsiteImportJobCurrent(args.importJobRef, args.jobId)) throw new Error('cancelled')
    bulkSetWorkspaceEntrySources(created.sources)
    finishExplorerUpdates?.()
    finishExplorerUpdates = null
    reconciliationAttempted = true
    const refreshed = args.refresh ? await args.refresh() : null
    const selectedUrl = settings.selectedUrls?.length === 1 ? settings.selectedUrls[0] : null
    const selectedPagePath = selectedUrl ? pagePathsByUrl.get(selectedUrl) : null
    if (selectedUrl && !selectedPagePath) throw new Error(`The requested page was not saved: ${selectedUrl}`)
    const activationPath = selectedPagePath || canvasPath || created.createdPaths[0]
    if (settings.applyToCanvas && activationPath) {
      const { applyWorkspaceImportToCanvasBestEffort } = await import('./importRuntimeActions')
      await applyWorkspaceImportToCanvasBestEffort({
        fs,
        createdPaths: [activationPath],
        opts: {
          applyToGraph: true,
          ...(refreshed ? { workspaceEntries: refreshed.entries, sourcesByPath: refreshed.sourcesByPath } : {}),
        },
      })
    }
    const first = settings.preserveActiveDocument ? null : activationPath
    if (first) {
      if (args.focusAfterImport) {
        await args.focusAfterImport(first, { sourceUrl: null, applyToGraph: false, jobId: args.jobId })
      } else {
        const { activateFirstImportedWorkspaceFile } = await import('./importRuntimeActions')
        await activateFirstImportedWorkspaceFile({ fs, createdPaths: [first], applyToGraph: false })
      }
    }
    return { createdPaths: created.createdPaths, host, websiteImportManifest: manifest, websiteImportSummary: buildWebsiteImportManifestSummary(manifest) }
  } finally {
    finishExplorerUpdates?.()
    if (!reconciliationAttempted && (writer || finishExplorerUpdates) && isWebsiteImportJobCurrent(args.importJobRef, args.jobId)) await args.refresh?.()
  }
}
