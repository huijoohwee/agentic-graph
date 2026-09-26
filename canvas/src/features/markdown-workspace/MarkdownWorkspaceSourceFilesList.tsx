import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
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
import { SourceFilesOwnershipSummary } from './SourceFilesOwnershipSummary'
import { AgentMissionSourceFile } from '@/features/agent-ready/agentMissionSourceFiles'
import { DASHBOARD_TEMPLATE_PATH, DASHBOARD_TEMPLATE_ROOT, readDashboardTemplate } from '@/components/DashboardCanvas/dashboardTemplateSource'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { PythonLearningDemoSourceFile } from '@/features/python-learning/PythonLearningDemoSourceFile'

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
  const cloudSync = useSourceFileCloudSync(cloudEntries)
  const [templateBusy, setTemplateBusy] = React.useState(false)
  const [templateError, setTemplateError] = React.useState('')
  const openTemplate = async () => {
    setTemplateBusy(true); setTemplateError('')
    try {
      const fs = await getWorkspaceFs()
      await readDashboardTemplate(fs, DASHBOARD_TEMPLATE_PATH)
      await applyWorkspaceImportToCanvas({ fs, createdPaths: [DASHBOARD_TEMPLATE_PATH], opts: { applyToGraph: false, skipComposedGraphApply: true } })
      for (const path of ['/huijoohwee.github.io', DASHBOARD_TEMPLATE_ROOT]) if (!expandedPaths.has(path)) toggleExpanded(path)
      onSelectFile(DASHBOARD_TEMPLATE_PATH)
    } catch (error) { setTemplateError((error as Error).message) }
    finally { setTemplateBusy(false) }
  }

  const renderFileStatusRight = React.useCallback((args: { entry: WorkspaceEntry; isActive: boolean }) => {
    const existing = renderFileRight?.(args)
    if (args.entry.kind !== 'file' || args.entry.path === DASHBOARD_TEMPLATE_PATH) return existing
    return (
      <span className="inline-flex items-center gap-0.5">
        {existing}
        <SourceFileCloudSyncIndicator
          entry={args.entry}
          status={cloudSync.readStatus(args.entry)}
          error={cloudSync.readError(args.entry)}
          onUpload={cloudSync.upload}
        />
      </span>
    )
  }, [cloudSync, renderFileRight])

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

  return (
    <>
      <SourceFilesOwnershipSummary onOpenTemplate={() => void openTemplate()} templateBusy={templateBusy} />
      {templateError && <p role="status" className={`px-2 py-1 ${textSizeClass} ${UI_THEME_TOKENS.status.error}`}>{templateError}</p>}
      <AgentMissionSourceFile search={props.search} />
      <PythonLearningDemoSourceFile />
      {loading ? <p className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME} px-2 py-1 ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>Loading…</p>
        : loadError ? <p className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME} px-2 py-1 ${textSizeClass} ${UI_THEME_TOKENS.status.error}`}>Failed: {loadError}</p>
        : <MarkdownFileTree
        entries={cloudEntries.filter(entry => entry !== demoEntry || !props.search || entry.name.toLowerCase().includes(props.search.toLowerCase()))}
        expandedPaths={expandedPaths}
        toggleExpanded={toggleExpanded}
        activePath={activePath}
        onSelectFile={onSelectFile}
        onSelectFolder={onSelectFolder}
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
        renderFileRight={renderFileStatusRight}
      />}
    </>
  )
}
