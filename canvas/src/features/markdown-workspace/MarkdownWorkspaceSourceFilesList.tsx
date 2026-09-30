import React from 'react'
import { CloudOff, FileSearch, FileCheck2 } from 'lucide-react'
import { projectWebsiteImportTree } from '@/features/source-files/websiteImportTreeProjection'
import { SourceFileWebsiteActions, WebsiteSelectionCheckbox, reportSourceImportFailure } from '@/features/source-files/SourceFileWebsiteActions'
import { useWebsiteImportSelectionSession, toggleWebsiteSelection, restoreWebsiteImportSelectionDraft, finishWebsiteImportSelection, importWebsiteFromSourceFiles, discoverWebsiteSelection, visibleWebsiteSelectionPages } from '@/features/source-files/websiteImportSelectionSession'
import { sourceFileWebsiteUrl } from '@/features/source-files/websiteImportTreeProjection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { MarkdownFileTree } from './MarkdownFileTree'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
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

const WebsiteImportSelectionView = React.lazy(() => import('@/features/source-files/WebsiteImportSelectionView'))

type MarkdownWorkspaceSourceFilesListProps = {
  search?: string
  loading: boolean
  loadError: string
  textSizeClass: string
  entries: WorkspaceEntry[]
  expandedPaths: Set<string>
  activePath: WorkspacePath | null
  toggleExpanded: (path: WorkspacePath) => void
  onSelectFile: (path: WorkspacePath) => void
  onSelectFolder: (path: WorkspacePath) => void
  sourcesByPath: WorkspaceSourceIndex | null
  onCreateNewFile: (parentPath?: WorkspacePath) => void
  onRevealInFinder: (path: WorkspacePath) => void
  onClearFile: (path: WorkspacePath) => void
  onRenameEntry: (path: WorkspacePath, nextName: string) => void
  onDeleteEntry: (path: WorkspacePath) => void
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
    toggleExpanded,
    onSelectFile,
    onSelectFolder,
    sourcesByPath,
    onCreateNewFile,
    onRevealInFinder,
    onClearFile,
    onRenameEntry,
    onDeleteEntry,
    renderFileRight,
  } = props
  const importSession = useWebsiteImportSelectionSession(state => state.session)
  const [importOpen, setImportOpen] = React.useState(false)
  React.useEffect(() => { restoreWebsiteImportSelectionDraft() }, [])
  const selectedMissionFolder = useAgentRunFolderSelection()
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
  const selectedSource = cloudEntries.find(entry => entry.path === activePath)
  const selectedSourceUrl = selectedSource && sourceFileWebsiteUrl(selectedSource, sourcesByPath?.[selectedSource.path])
  const visiblePageUrls = importSession ? visibleWebsiteSelectionPages(importSession).map(page => page.url) : []
  const cloudSync = useSourceFileCloudSync(cloudEntries)
  const projection = React.useMemo(() => projectWebsiteImportTree(cloudEntries, sourcesByPath, importSession), [cloudEntries, sourcesByPath, importSession])
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

  const renderContextActions = (entry: WorkspaceEntry) => {
    const pending = projection.pendingPaths.has(entry.path)
    const unsupported = entry.kind !== 'file' ? 'Cloud sync requires a file' : entry.path === DASHBOARD_TEMPLATE_PATH ? 'Cloud sync is unavailable for this workspace view' : undefined
    const cloudUnavailable = pending ? 'Not saved — import this item before cloud sync' : unsupported
    return <>
      <SourceFileWebsiteActions entry={entry} source={sourcesByPath?.[entry.path]} urlOverride={projection.pageUrls.get(entry.path)} confirmationOwner={projection.ownerPath === entry.path} />
      {cloudUnavailable ? <button type="button" disabled aria-label={`Cloud sync unavailable for ${entry.name}`} title={cloudUnavailable} className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} items-center justify-center rounded ${UI_THEME_TOKENS.text.secondary} opacity-40 cursor-not-allowed`}><CloudOff className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" /></button> : <SourceFileCloudSyncIndicator
        entry={entry} status={cloudSync.readStatus(entry)} error={cloudSync.readError(entry)} onUpload={cloudSync.upload} />}
    </>
  }

  const buildShareUrl = React.useCallback((entry: WorkspaceEntry): string | null | Promise<string | null> => {
    if (entry.kind !== 'file') return null
    return publishWorkspaceEntryShareUrl({ entry, sourcesByPath })
  }, [sourcesByPath])

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
        onClick={() => { const url = projection.pageUrls.get(entry.path); if (pending && url) toggleWebsiteSelection([url], true); else onSelectFile(entry.path) }}>
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
        <button type="button" aria-expanded={importOpen || !!importSession} disabled={!!importSession?.importing} onClick={() => {
          if (importSession) { finishWebsiteImportSelection(null); setImportOpen(false) }
          else setImportOpen(value => !value)
        }} className={`rounded px-1 py-0.5 ${textSizeClass} ${UI_THEME_TOKENS.button.hoverBg}`}>{importSession ? 'Cancel import selection' : 'Import URL'}</button>
        <section aria-label="Choose folder(s)/page(s) to import" aria-busy={!!importSession?.busy} className={`border-b py-1 ${UI_THEME_TOKENS.panel.border}`}>
          <WebsiteSelectionCheckbox label="Select all visible pages" urls={importSession ? visiblePageUrls : selectedSourceUrl ? [selectedSourceUrl] : []}
            selected={importSession?.selected || new Set<string>()} disabled={!!importSession?.busy || !!importSession?.importing || (!importSession && !selectedSourceUrl)}
            toggle={(urls, checked) => {
              if (importSession && checked && !urls.length) void discoverWebsiteSelection(importSession.url, true)
              else if (importSession) toggleWebsiteSelection(urls, checked)
              else if (checked && selectedSourceUrl && selectedSource) void importWebsiteFromSourceFiles(selectedSourceUrl, selectedSource.path, undefined, { selectAllOnDiscover: true }).catch(reportSourceImportFailure)
            }} />
        </section>
        {(importOpen || importSession) && <React.Suspense fallback={<p role="status">Loading import controls…</p>}><WebsiteImportSelectionView /></React.Suspense>}
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
        resolveSourceUrl={entry => projection.pageUrls.get(entry.path) || sourceFileWebsiteUrl(entry, sourcesByPath?.[entry.path])}
        renderContextActions={renderContextActions}
        renderEntryLeading={renderSelectionControl}
        renderFileRight={args => projection.pendingPaths.has(args.entry.path) ? null : renderFileRight?.(args)}
      />}
    </>
  )
}
