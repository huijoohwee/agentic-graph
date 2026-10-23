import React from 'react'
import { CheckCircle2, CircleX, CloudOff, FileSearch, FileCheck2, LoaderCircle } from 'lucide-react'
import { ImportUrlPrompt } from '@/features/toolbar/ImportUrlPrompt'
import { projectWebsiteImportTree, websiteFolderSources } from '@/features/source-files/websiteImportTreeProjection'
import { SourceFileWebsiteActions, SourceImportAction, WebsiteSelectionCheckbox, reportSourceImportFailure } from '@/features/source-files/SourceFileWebsiteActions'
import { useWebsiteImportSelectionSession, toggleWebsiteSelection, restoreWebsiteImportSelectionDraft, importWebsiteFromSourceFiles, discoverWebsiteSelection, visibleWebsiteSelectionPages } from '@/features/source-files/websiteImportSelectionSession'
import { sourceFileWebsiteUrl } from '@/features/source-files/websiteImportTreeProjection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { MarkdownFileTree } from './MarkdownFileTree'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceRefreshOptions } from './useWorkspaceFileActions/types'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import {
  appendCanvasPreviewParam,
  buildLocalDocCanvasEmbedUrl,
  isSameOriginCanvasEmbedUrl,
} from '@/features/canvas/canvasDocDeepLink'
import { publishWorkspaceEntryShareUrl } from '@/features/source-files/sourceFileShareUrl'
import { UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { selectLiveCanvasHeroSource } from '@/features/canvas/liveCanvasHeroSourceSelection'
import { resolveLiveCanvasHeroEmbedUrl } from '@/features/canvas/liveCanvasHeroEmbed'
import { openCanvasEmbedCodePanel } from '@/features/canvas/canvasEmbedCodePanelEvent'
import { buildCanvasEmbedIframeMarkup } from '@/features/canvas/canvasEmbedIframeMarkup'
import {
  SourceFileCloudSyncIndicator,
  useSourceFileCloudSync,
} from './SourceFileCloudSyncIndicator'
import { AgentMissionSourceFile } from '@/features/agent-ready/agentMissionSourceFiles'
import { selectAgentRunSource, useAgentRunFolderSelection } from '@/features/agent-ready/agentRunInspectionStore'
import { DASHBOARD_TEMPLATE_PATH } from '@/components/DashboardCanvas/dashboardTemplateSource'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'

const WebsiteImportSelectionView = React.lazy(() => import('@/features/source-files/WebsiteImportSelectionView'))
const SOURCE_FOLDER_REFRESH_MAX_CONCURRENCY = 4
const SOURCE_PAGE_REFRESH_TIMEOUT_MS = 45_000

type FolderRefreshProgress = { completed: number; total: number; refreshed: number; failed: number; active: number }
type RefreshOutcome = { ok: boolean; label: string }
type RefreshFailure = { code?: string; message: string }

const isAuthenticatedSourceFailure = (failure: RefreshFailure): boolean =>
  failure.code === 'WEBPAGE_CONTENT_INCOMPLETE' || failure.code === 'AUTHENTICATED_BROWSER_SESSION_REQUIRED'

const conciseRefreshFailure = (failure: RefreshFailure): string => {
  const message = String(failure.message || 'Unknown source error').replace(/\s+/g, ' ').trim()
  return message.length > 240 ? `${message.slice(0, 237)}…` : message
}

function RefreshOutcomeIndicator({ outcome }: { outcome: RefreshOutcome }) {
  const Icon = outcome.ok ? CheckCircle2 : CircleX
  return <span role="img" aria-label={outcome.label} title={outcome.label}
    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center ${outcome.ok ? UI_THEME_TOKENS.status.success : UI_THEME_TOKENS.status.error}`}>
    <Icon className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
  </span>
}

type MarkdownWorkspaceSourceFilesListProps = {
  search?: string
  loading: boolean
  loadError: string
  textSizeClass: string
  entries: WorkspaceEntry[]
  expandedPaths: Set<string>
  activePath: WorkspacePath | null
  activeDocumentKey?: string
  activeDocumentText?: string
  toggleExpanded: (path: WorkspacePath) => void
  onSelectFile: (path: WorkspacePath) => void
  onSelectFolder: (path: WorkspacePath) => void
  sourcesByPath: WorkspaceSourceIndex | null
  onCreateNewFile: (parentPath?: WorkspacePath) => void
  onRevealInFinder: (path: WorkspacePath) => void
  onClearFile: (path: WorkspacePath) => void
  onRenameEntry: (path: WorkspacePath, nextName: string) => void
  onDeleteEntry: (path: WorkspacePath) => void
  onRefreshFileFromSource?: (path: WorkspacePath, renderedPageRequestUrl?: string, options?: WorkspaceRefreshOptions) => Promise<boolean> | void
  renderFileRight?: (args: { entry: WorkspaceEntry; isActive: boolean }) => React.ReactNode
}

export function MarkdownWorkspaceSourceFilesList(props: MarkdownWorkspaceSourceFilesListProps) {
  const {
    loading,
    loadError,
    textSizeClass,
    entries,
    expandedPaths,
    activePath,
    activeDocumentKey,
    activeDocumentText,
    toggleExpanded,
    onSelectFile,
    onSelectFolder,
    sourcesByPath,
    onCreateNewFile,
    onRevealInFinder,
    onClearFile,
    onRenameEntry,
    onDeleteEntry,
    onRefreshFileFromSource,
    renderFileRight,
  } = props
  const importSession = useWebsiteImportSelectionSession(state => state.session)
  const recoveryError = useWebsiteImportSelectionSession(state => state.recoveryError)
  React.useEffect(() => { restoreWebsiteImportSelectionDraft() }, [])
  const selectedMissionFolder = useAgentRunFolderSelection()
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const selectedPath = selectedMissionFolder ?? activePath
  const [demoEntry, setDemoEntry] = React.useState<WorkspaceEntry | null>(null)
  React.useEffect(() => {
    let active = true
    void getWorkspaceFs().then(fs => fs.listEntries()).then(rows => {
      if (active) setDemoEntry(rows.find(row => row.kind === 'file' && row.path === '/python-learning-demo.py') || null)
    }).catch(() => void 0)
    return () => { active = false }
  }, [])
  const demoRepresented = entries.some(entry => entry.path === demoEntry?.path)
  const cloudEntries = React.useMemo(() => demoEntry && !demoRepresented ? [...entries, demoEntry] : entries,
    [demoEntry, demoRepresented, entries])
  const sourceEntry = (entry: WorkspaceEntry) => activeDocumentKey && workspaceDocumentKey(entry.path) === activeDocumentKey
    ? { ...entry, text: activeDocumentText ?? entry.text }
    : entry
  const selectedSource = cloudEntries.find(entry => entry.path === activePath)
  const selectedSourceUrl = selectedSource && sourceFileWebsiteUrl(sourceEntry(selectedSource), sourcesByPath?.[selectedSource.path])
  const visiblePageUrls = importSession ? visibleWebsiteSelectionPages(importSession).map(page => page.url) : []
  const cloudSync = useSourceFileCloudSync(cloudEntries)
  const websiteImportConcurrency = useGraphStore(state => state.websiteImportConcurrency)
  const projection = React.useMemo(() => projectWebsiteImportTree(cloudEntries, sourcesByPath, importSession), [cloudEntries, sourcesByPath, importSession])
  const [sourcePicker, setSourcePicker] = React.useState<{ folder: string; path: string } | null>(null)
  const [captureRefresh, setCaptureRefresh] = React.useState<{ path: WorkspacePath; url: string } | null>(null)
  const [refreshingFolderPaths, setRefreshingFolderPaths] = React.useState<Set<string>>(() => new Set())
  const [refreshingSourcePaths, setRefreshingSourcePaths] = React.useState<Set<string>>(() => new Set())
  const [folderRefreshProgress, setFolderRefreshProgress] = React.useState<Record<string, FolderRefreshProgress>>({})
  const [refreshOutcomes, setRefreshOutcomes] = React.useState<Record<string, RefreshOutcome>>({})
  const activeFolderRefreshesRef = React.useRef(new Set<string>())
  const folderRefreshControllersRef = React.useRef(new Map<string, AbortController>())
  const activeSourceRefreshesRef = React.useRef(new Set<string>())
  const startFolderSource = (source: { url: string; path: string }) => {
    setSourcePicker(null)
    void importWebsiteFromSourceFiles(source.url, source.path, undefined, { selectAllOnDiscover: true }).catch(reportSourceImportFailure)
  }
  const refreshSourceFile = async (
    path: WorkspacePath,
    renderedPageRequestUrl?: string,
    captureFallbackUrl?: string,
    refreshOptions?: WorkspaceRefreshOptions,
  ): Promise<boolean> => {
    if (!onRefreshFileFromSource || activeSourceRefreshesRef.current.has(path)) return false
    activeSourceRefreshesRef.current.add(path)
    setRefreshOutcomes(previous => {
      const next = { ...previous }
      delete next[path]
      return next
    })
    setRefreshingSourcePaths(previous => new Set(previous).add(path))
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(new Error(`Page refresh exceeded ${SOURCE_PAGE_REFRESH_TIMEOUT_MS / 1000} seconds`)), SOURCE_PAGE_REFRESH_TIMEOUT_MS)
    const forwardAbort = () => controller.abort(refreshOptions?.signal?.reason)
    if (refreshOptions?.signal?.aborted) forwardAbort()
    else refreshOptions?.signal?.addEventListener('abort', forwardAbort, { once: true })
    let rejectAborted!: (reason: unknown) => void
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject })
    const rejectForAbort = () => rejectAborted(controller.signal.reason || new Error('Page refresh cancelled'))
    if (controller.signal.aborted) rejectForAbort()
    else controller.signal.addEventListener('abort', rejectForAbort, { once: true })
    let refreshed = false
    let failure: RefreshFailure | null = null
    try {
      refreshed = (await Promise.race([
        Promise.resolve(onRefreshFileFromSource(path, renderedPageRequestUrl, {
          ...refreshOptions,
          browserSessionId: refreshOptions?.browserSessionId || importSession?.browserSessionId,
          signal: controller.signal,
          onFailure: value => {
            failure = value
            refreshOptions?.onFailure?.(value)
          },
        })),
        aborted,
      ])) !== false
      return refreshed
    } catch {
      return false
    }
    finally {
      clearTimeout(timeoutId)
      refreshOptions?.signal?.removeEventListener('abort', forwardAbort)
      controller.signal.removeEventListener('abort', rejectForAbort)
      activeSourceRefreshesRef.current.delete(path)
      setRefreshingSourcePaths(previous => {
        const next = new Set(previous)
        next.delete(path)
        return next
      })
      if (!refreshOptions?.signal?.aborted || failure) {
        setRefreshOutcomes(previous => ({
          ...previous,
          [path]: refreshed
            ? { ok: true, label: `Refresh succeeded for ${path}` }
            : { ok: false, label: `Refresh failed for ${path}${failure ? `: ${conciseRefreshFailure(failure)}` : ''}` },
        }))
      }
      if (!refreshed && captureFallbackUrl) setCaptureRefresh({ path, url: captureFallbackUrl })
    }
  }
  const [collapsedImports, setCollapsedImports] = React.useState({ id: 0, paths: new Set<string>() })
  const treeExpandedPaths = new Set([...expandedPaths, ...projection.expandedPaths].filter(path => collapsedImports.id !== importSession?.id || !collapsedImports.paths.has(path)))
  const toggleTreeFolder = (path: string) => {
    if (!projection.expandedPaths.has(path)) return toggleExpanded(path)
    setCollapsedImports(previous => {
      const paths = new Set(previous.id === importSession?.id ? previous.paths : [])
      if (paths.has(path)) paths.delete(path); else paths.add(path)
      return { id: importSession?.id || 0, paths }
    })
  }

  const renderContextActions = (entry: WorkspaceEntry, details: { open: boolean; show: () => void; toggle: () => void }) => {
    const pending = projection.pendingPaths.has(entry.path)
    const folderSources = entry.kind === 'folder' ? websiteFolderSources(cloudEntries, sourcesByPath, entry.path) : []
    const folderRefreshPaths = entry.kind === 'folder' ? cloudEntries
      .filter(child => child.kind === 'file' && child.path.startsWith(`${entry.path.replace(/\/$/u, '')}/`)
        && !!sourceFileWebsiteUrl(sourceEntry(child), sourcesByPath?.[child.path]))
      .map(child => child.path).sort() : []
    const folderRefreshing = refreshingFolderPaths.has(entry.path)
    const folderProgress = folderRefreshProgress[entry.path]
    const currentEntry = sourceEntry(entry)
    const pageUrl = sourceFileWebsiteUrl(currentEntry, sourcesByPath?.[entry.path])
    const unsupported = entry.kind === 'file' && entry.path === DASHBOARD_TEMPLATE_PATH
      ? 'Cloud sync is unavailable for this workspace view'
      : undefined
    const cloudUnavailable = pending ? 'Not saved — import this item before cloud sync' : unsupported
    const cloudSyncStatus = entry.kind === 'folder'
      ? cloudSync.readFolderStatus(entry.path)
      : cloudSync.readStatus(currentEntry)
    const cloudSyncFileCount = entry.kind === 'folder' ? cloudSync.readFolderFileCount(entry.path) : 0
    const refreshFolder = async () => {
      if (!onRefreshFileFromSource || !folderRefreshPaths.length || activeFolderRefreshesRef.current.size > 0
        || folderRefreshPaths.some(path => activeSourceRefreshesRef.current.has(path))) return
      activeFolderRefreshesRef.current.add(entry.path)
      setRefreshOutcomes(previous => {
        const next = { ...previous }
        delete next[entry.path]
        folderRefreshPaths.forEach(path => { delete next[path] })
        return next
      })
      setRefreshingFolderPaths(previous => new Set(previous).add(entry.path))
      let completed = 0
      let refreshed = 0
      let failed = 0
      let active = 0
      let nextIndex = 0
      let authenticatedSourceFailure: RefreshFailure | null = null
      const controller = new AbortController()
      folderRefreshControllersRef.current.set(entry.path, controller)
      const concurrency = Math.max(1, Math.min(
        SOURCE_FOLDER_REFRESH_MAX_CONCURRENCY,
        Math.floor(Number.isFinite(websiteImportConcurrency) ? websiteImportConcurrency : SOURCE_FOLDER_REFRESH_MAX_CONCURRENCY),
      ))
      const publishProgress = () => {
        const progress = { completed, total: folderRefreshPaths.length, refreshed, failed, active }
        setFolderRefreshProgress(previous => ({ ...previous, [entry.path]: progress }))
        pushUiToast({
          id: `source-files:folder-refresh:${entry.path}`,
          kind: 'neutral',
          message: `Refreshing ${completed}/${folderRefreshPaths.length} pages in ${entry.name}${active ? ` · ${active} active` : ''}`,
          ttlMs: null,
          dismissible: true,
          busy: true,
        })
      }
      const refreshPage = async (path: string) => {
        active += 1
        publishProgress()
        let pageFailure: RefreshFailure | null = null
        const refreshedPage = await refreshSourceFile(path, undefined, undefined, {
          silent: true,
          signal: controller.signal,
          browserSessionId: importSession?.browserSessionId,
          onFailure: failure => {
            pageFailure = failure
            if (isAuthenticatedSourceFailure(failure)) {
              authenticatedSourceFailure = failure
              controller.abort(new Error('Source requires a signed-in browser session'))
            }
          },
        })
        active -= 1
        completed += 1
        if (refreshedPage) refreshed += 1
        else if (pageFailure || !controller.signal.aborted) failed += 1
        publishProgress()
      }
      try {
        publishProgress()
        // Probe one page first: a shared sign-in shell should stop a folder crawl
        // before the remaining URLs are needlessly requested.
        await refreshPage(folderRefreshPaths[0]!)
        nextIndex = 1
        const worker = async () => {
          while (!controller.signal.aborted) {
            const index = nextIndex++
            if (index >= folderRefreshPaths.length) return
            await refreshPage(folderRefreshPaths[index]!)
          }
        }
        if (!controller.signal.aborted) {
          await Promise.all(Array.from({ length: Math.min(concurrency, folderRefreshPaths.length - 1) }, () => worker()))
        }
        const authBlocked = authenticatedSourceFailure !== null
        const cancelled = controller.signal.aborted && !authBlocked
        if (!cancelled || authBlocked) {
          setRefreshOutcomes(previous => ({
            ...previous,
            [entry.path]: failed
              ? { ok: false, label: authBlocked
                ? `Refresh stopped: ${conciseRefreshFailure(authenticatedSourceFailure!)} ${folderRefreshPaths.length - completed} pages not attempted. Connect a matching authenticated browser session, then retry.`
                : `Refresh completed with ${failed} failed pages out of ${folderRefreshPaths.length} in ${entry.name}` }
              : { ok: true, label: `Refresh succeeded for all ${refreshed} pages in ${entry.name}` },
          }))
        }
        pushUiToast({
          id: `source-files:folder-refresh:${entry.path}`,
          kind: authBlocked ? 'error' : cancelled ? 'warning' : failed ? (refreshed ? 'warning' : 'error') : 'success',
          message: authBlocked
            ? `Refresh stopped after ${completed}/${folderRefreshPaths.length} pages: ${conciseRefreshFailure(authenticatedSourceFailure!)} ${folderRefreshPaths.length - completed} not started. Connect a matching authenticated browser session, then retry.`
            : cancelled
            ? `Cancelled ${entry.name} refresh after ${completed}/${folderRefreshPaths.length} attempts settled; ${refreshed} refreshed, ${folderRefreshPaths.length - completed} not started.`
            : failed
              ? `Refreshed ${refreshed}/${folderRefreshPaths.length} pages in ${entry.name}; ${failed} failed.`
              : `Refreshed ${refreshed} pages in ${entry.name} from source.`,
          ttlMs: 7000,
          dismissible: true,
          busy: false,
        })
      } finally {
        activeFolderRefreshesRef.current.delete(entry.path)
        folderRefreshControllersRef.current.delete(entry.path)
        setRefreshingFolderPaths(previous => {
          const next = new Set(previous)
          next.delete(entry.path)
          return next
        })
        setFolderRefreshProgress(previous => {
          const next = { ...previous }
          delete next[entry.path]
          return next
        })
      }
    }
    return <>
      {pageUrl && onRefreshFileFromSource && <SourceImportAction action="refresh" label={`Refresh ${entry.name} from source`}
        disabled={pending || refreshingSourcePaths.has(entry.path) || activeFolderRefreshesRef.current.size > 0 || !!importSession?.busy || !!importSession?.importing}
        onClick={() => { void refreshSourceFile(entry.path, undefined, pageUrl) }} />}
      {pageUrl && onRefreshFileFromSource && <SourceImportAction action="capture" label={`Refresh ${entry.name} from rendered page`}
        title={`Refresh ${entry.name} from rendered page — use a copied page when the source requires sign-in`}
        aria-pressed={captureRefresh?.path === entry.path}
        disabled={pending || refreshingSourcePaths.has(entry.path) || activeFolderRefreshesRef.current.size > 0 || !!importSession?.busy || !!importSession?.importing}
        onClick={() => setCaptureRefresh({ path: entry.path, url: pageUrl })} />}
      {entry.kind === 'folder' && folderRefreshPaths.length > 0 && onRefreshFileFromSource && (folderRefreshing
        ? <SourceImportAction action="cancel" label={`Cancel refreshing ${entry.name}`}
          title={`Cancel refresh of ${folderRefreshPaths.length} pages in ${entry.name}`}
          onClick={() => folderRefreshControllersRef.current.get(entry.path)?.abort(new Error('Folder refresh cancelled'))} />
        : <SourceImportAction action="refresh" label={`Refresh ${folderRefreshPaths.length} pages in ${entry.name} from source`}
          disabled={pending || activeFolderRefreshesRef.current.size > 0 || folderRefreshPaths.some(path => refreshingSourcePaths.has(path)) || !!importSession?.busy || !!importSession?.importing}
          onClick={() => { void refreshFolder() }} />)}
      <SourceFileWebsiteActions entry={currentEntry} source={sourcesByPath?.[entry.path]} urlOverride={projection.pageUrls.get(entry.path)} confirmationOwner={projection.ownerPath === entry.path}
        folderPageUrls={projection.folderImportUrls.get(entry.path)}
        onChooseFolderSource={folderSources.length ? () => {
          if (folderSources.length === 1) startFolderSource(folderSources[0])
          else setSourcePicker({ folder: entry.path, path: folderSources[0].path })
        } : undefined}
        destinationPath={pending && entry.kind === 'file' ? entry.path : undefined}
        detailsOpen={details.open} onShowDetails={details.show} onToggleDetails={details.toggle} statusAvailable={!!recoveryError}
        discoveryContext={projection.ownerPath === entry.path || projection.pageUrls.has(entry.path) || projection.expandedPaths.has(entry.path)} />
      {cloudUnavailable ? <button type="button" disabled aria-label={`Cloud sync unavailable for ${entry.name}`} title={cloudUnavailable} className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} items-center justify-center rounded ${UI_THEME_TOKENS.text.secondary} opacity-40 cursor-not-allowed`}><CloudOff className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" /></button> : <SourceFileCloudSyncIndicator
        entry={entry} status={cloudSyncStatus} fileCount={cloudSyncFileCount}
        error={cloudSync.readError(entry)} onUpload={cloudSync.upload} />}
    </>
  }

  const buildShareUrl = React.useCallback(async (entry: WorkspaceEntry): Promise<string | null> => {
    if (entry.kind !== 'file') return null
    const url = await publishWorkspaceEntryShareUrl({ entry, sourcesByPath })
    if (url && new URL(url).hash.startsWith('#kgShare=')) {
      pushUiToast({
        id: 'share:url:self-contained',
        kind: 'warning',
        message: 'This link includes a copy of the document. Anyone with it can read that copy; the file was not uploaded.',
        ttlMs: 7000,
        dismissible: true,
      })
    }
    return url
  }, [pushUiToast, sourcesByPath])

  const buildCanvasEmbedUrl = React.useCallback(async (entry: WorkspaceEntry): Promise<string | null> => {
    if (entry.kind !== 'file') return null
    if (/\.py$/iu.test(entry.path)) {
      const { captureLearningCanvasShare } = await import('@/features/python-learning/learningCanvasShare')
      return captureLearningCanvasShare(entry.path, new URL(import.meta.env.BASE_URL, window.location.origin).href, new AbortController().signal)
    }
    const shareUrl = await publishWorkspaceEntryShareUrl({ entry, sourcesByPath })
    return appendCanvasPreviewParam(shareUrl || '')
  }, [sourcesByPath])

  const handleCanvasEmbedReady = React.useCallback((entry: WorkspaceEntry, embedUrl: string) => {
    const code = buildCanvasEmbedIframeMarkup(embedUrl)
    if (code) openCanvasEmbedCodePanel({ sourceName: entry.name || entry.path, title: 'Canvas iframe embed', language: 'html', code })
    if (new URL(embedUrl).searchParams.has('kgLearningCanvas')) return
    if (!isSameOriginCanvasEmbedUrl(embedUrl)) return
    const isolatedEmbedUrl = resolveLiveCanvasHeroEmbedUrl({
      sourcePath: entry.path,
      selectedEmbedUrl: embedUrl,
    })
    if (!isolatedEmbedUrl) return
    selectLiveCanvasHeroSource({ sourcePath: entry.path, embedUrl: isolatedEmbedUrl })
  }, [])

  const handleCanvasEmbedStart = React.useCallback((entry: WorkspaceEntry) => {
    if (/\.py$/iu.test(entry.path)) return
    const embedUrl = buildLocalDocCanvasEmbedUrl({ relativePath: entry.path })
    if (!embedUrl) return
    selectLiveCanvasHeroSource({ sourcePath: entry.path, embedUrl })
  }, [])

  const handleShareCodeReady = React.useCallback((detail: {
    sourceName: string
    title: string
    language: string
    code: string
  }) => {
    openCanvasEmbedCodePanel(detail)
  }, [])

  const renderSelectionControl = (entry: WorkspaceEntry) => {
    if (!importSession?.selected.size) {
      const pending = projection.pendingPaths.has(entry.path), saved = projection.savedPaths.has(entry.path)
      if (entry.kind !== 'file' || (!pending && !saved)) return null
      const Icon = pending ? FileSearch : FileCheck2
      const status = pending ? 'Discovered page — not saved' : 'Saved website file'
      return <button type="button" aria-label={`Select file ${entry.name}`} title={status}
        className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} items-center justify-center rounded ${UI_THEME_TOKENS.focus.primaryRing}`}
        onClick={() => { const url = projection.pageUrls.get(entry.path); if (url && importSession) toggleWebsiteSelection([url], !importSession.selected.has(url)); else onSelectFile(entry.path) }}>
        <Icon className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} role="img" aria-label={status} />
      </button>
    }
    const urls = projection.selectionUrls.get(entry.path)
    const label = urls?.length ? entry.kind === 'folder' ? `Select discovered pages in ${entry.path}` : `Select page ${projection.pageUrls.get(entry.path)}` : `${entry.kind === 'folder' ? 'Folder' : 'File'} ${entry.name} is outside this website import`
    return <WebsiteSelectionCheckbox label={label} urls={urls || []} selected={importSession.selected} toggle={toggleWebsiteSelection} disabled={!urls?.length || !!importSession.importing} />
  }

  return (
    <>
      <section aria-label="Source Files import" className="px-1 py-1">
        <section aria-label="Choose folder(s)/page(s) to import" aria-busy={!!importSession?.busy} className={`border-b py-1 ${UI_THEME_TOKENS.panel.border}`}>
          <WebsiteSelectionCheckbox label="Select all visible pages" urls={importSession ? visiblePageUrls : selectedSourceUrl ? [selectedSourceUrl] : []}
            selected={importSession?.selected || new Set<string>()} disabled={!!importSession?.busy || !!importSession?.importing || (!importSession && !selectedSourceUrl)}
            toggle={(urls, checked) => {
              if (importSession && checked && !urls.length) void discoverWebsiteSelection(importSession.url, true)
              else if (importSession) toggleWebsiteSelection(urls, checked)
              else if (checked && selectedSourceUrl && selectedSource) void importWebsiteFromSourceFiles(selectedSourceUrl, selectedSource.path, undefined, { selectAllOnDiscover: true }).catch(reportSourceImportFailure)
            }} />
        </section>
      </section>
      <AgentMissionSourceFile search={props.search} activePath={selectedPath} renderEntryLeading={renderSelectionControl} />
      {loading ? <p className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME} px-2 py-1 ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>Loading…</p>
        : loadError ? <p className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME} px-2 py-1 ${textSizeClass} ${UI_THEME_TOKENS.status.error}`}>Failed: {loadError}</p>
        : <MarkdownFileTree
        entries={projection.entries.filter(entry => entry !== demoEntry || !props.search || entry.name.toLowerCase().includes(props.search.toLowerCase()))}
        expandedPaths={treeExpandedPaths}
        toggleExpanded={toggleTreeFolder}
        activePath={selectedPath}
        onSelectFile={path => { const url = projection.pageUrls.get(path); if (projection.pendingPaths.has(path) && url) toggleWebsiteSelection([url], !importSession?.selected.has(url)); else onSelectFile(path) }}
        onSelectFolder={path => { if (projection.pendingPaths.has(path)) toggleTreeFolder(path); else { selectAgentRunSource(null); onSelectFolder(path) } }}
        sourcesByPath={sourcesByPath}
        onCreateNewFile={onCreateNewFile}
        onRevealInFinder={onRevealInFinder}
        onClearFile={onClearFile}
        onRenameEntry={onRenameEntry}
        onDeleteEntry={onDeleteEntry}
        buildShareUrl={buildShareUrl}
        buildCanvasEmbedUrl={buildCanvasEmbedUrl}
        onCanvasEmbedStart={handleCanvasEmbedStart}
        onCanvasEmbedReady={handleCanvasEmbedReady}
        onShareCodeReady={handleShareCodeReady}
        isEntrySaved={entry => !projection.pendingPaths.has(entry.path)}
        resolveSourceUrl={entry => projection.pageUrls.get(entry.path) || sourceFileWebsiteUrl(sourceEntry(entry), sourcesByPath?.[entry.path])}
        renderContextActions={renderContextActions}
        renderContextDetails={entry => {
          if (sourcePicker?.folder === entry.path) {
            const sources = websiteFolderSources(cloudEntries, sourcesByPath, entry.path)
            const chosen = sources.find(source => source.path === sourcePicker.path)
            return <section aria-label={`Website sources in ${entry.name}`} className="grid max-w-sm gap-2 p-2 text-xs">
              <label>Choose a website source<select aria-label={`Website source in ${entry.name}`} className="w-full min-w-0" value={sourcePicker.path}
                onChange={event => setSourcePicker({ folder: entry.path, path: event.target.value })}>
                {sources.map(source => <option key={source.path} value={source.path}>{source.url}</option>)}
              </select></label>
              <button type="button" disabled={!chosen || !!importSession?.busy || !!importSession?.importing} onClick={() => chosen && startFolderSource(chosen)}>Find pages to import</button>
            </section>
          }
          return (importSession || recoveryError) && <React.Suspense fallback={<p role="status">Loading discovery status…</p>}><WebsiteImportSelectionView /></React.Suspense>
        }}
        renderEntryLeading={renderSelectionControl}
        renderFileRight={args => {
          const rightContent = projection.pendingPaths.has(args.entry.path) ? null : renderFileRight?.(args)
          const isFolderRefreshing = args.entry.kind === 'folder' && !!folderRefreshProgress[args.entry.path]
          const isFileRefreshing = args.entry.kind === 'file' && refreshingSourcePaths.has(args.entry.path)
          const progress = isFolderRefreshing ? folderRefreshProgress[args.entry.path] : undefined
          const outcome = refreshOutcomes[args.entry.path]
          if (!rightContent && !isFolderRefreshing && !isFileRefreshing && !outcome) return null
          return <span className="inline-flex min-w-0 items-center gap-1">
            {rightContent}
            {isFolderRefreshing && progress ? <span role="status" aria-live="polite" aria-busy="true"
              aria-label={`Refreshing ${progress.completed} of ${progress.total} pages in ${args.entry.name}${progress.active ? `; ${progress.active} active` : ''}`}
              className={`inline-flex w-32 shrink-0 items-center justify-end gap-1 whitespace-nowrap text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              <LoaderCircle className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} animate-spin`} aria-hidden="true" />
              <span>{progress.completed}/{progress.total}{progress.active ? ` · ${progress.active}` : ''}</span>
            </span> : isFileRefreshing ? <span role="status" aria-live="polite" aria-busy="true"
              aria-label={`Refreshing ${args.entry.name}`} className="inline-flex h-5 w-5 shrink-0 items-center justify-end">
              <LoaderCircle className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} animate-spin`} aria-hidden="true" />
            </span> : outcome ? <span className={`inline-flex ${args.entry.kind === 'folder' ? 'w-32' : 'w-5'} shrink-0 items-center justify-end`}>
              <RefreshOutcomeIndicator outcome={outcome} />
            </span> : null}
          </span>
        }}
      />}
      {captureRefresh ? <section role="dialog" aria-label="Refresh from rendered page" className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-xl rounded-lg border bg-background p-3 shadow-xl">
        <h2 className="mb-2 text-sm font-semibold">Refresh from a rendered page</h2>
        <ImportUrlPrompt
          urlDraft={captureRefresh.url}
          onChange={url => setCaptureRefresh(current => current?.path === captureRefresh.path ? { ...current, url } : current)}
          onConfirm={requestUrl => {
            const targetPath = captureRefresh.path
            setCaptureRefresh(null)
            void refreshSourceFile(targetPath, requestUrl)
          }}
          onCancel={() => setCaptureRefresh(null)}
          confirmLabel="Refresh file"
          enablePageCapture
        />
        <p className={`mt-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>Copy the signed-in page in its browser tab, then choose “Use copied page” or paste its rendered content. The existing file updates only if the captured URL matches its source.</p>
        <button type="button" className="mt-2 rounded border px-2 py-1 text-xs" onClick={() => setCaptureRefresh(null)}>Cancel</button>
      </section> : null}
    </>
  )
}
