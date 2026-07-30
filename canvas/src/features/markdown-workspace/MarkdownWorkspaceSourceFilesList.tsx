import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MarkdownFileTree } from './MarkdownFileTree'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import {
  appendCanvasPreviewParam,
  buildLocalDocCanvasEmbedUrl,
  buildPublishedDocCanvasEmbedUrlFromSource,
  buildPublishedDocShareUrlFromSource,
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

type MarkdownWorkspaceSourceFilesListProps = {
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
  const cloudSync = useSourceFileCloudSync(entries)

  const renderFileStatusRight = React.useCallback((args: { entry: WorkspaceEntry; isActive: boolean }) => {
    const existing = renderFileRight?.(args)
    if (args.entry.kind !== 'file') return existing
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
    const source = sourcesByPath?.[entry.path]
    if (source?.kind === 'url') {
      const sourceShareUrl = buildPublishedDocShareUrlFromSource({ sourceUrl: source.url })
      if (sourceShareUrl) return sourceShareUrl
    }
    return publishWorkspaceEntryShareUrl({ entry, sourcesByPath })
  }, [sourcesByPath])

  const buildCanvasEmbedUrl = React.useCallback(async (entry: WorkspaceEntry): Promise<string | null> => {
    if (entry.kind !== 'file') return null
    const source = sourcesByPath?.[entry.path]
    if (source?.kind === 'url') {
      const sourceEmbedUrl = buildPublishedDocCanvasEmbedUrlFromSource({ sourceUrl: source.url })
      if (sourceEmbedUrl) return sourceEmbedUrl
    }
    const shareUrl = await publishWorkspaceEntryShareUrl({ entry, sourcesByPath })
    return appendCanvasPreviewParam(shareUrl || '')
  }, [sourcesByPath])

  const handleCanvasEmbedReady = React.useCallback((entry: WorkspaceEntry, embedUrl: string) => {
    const code = buildCanvasEmbedIframeMarkup(embedUrl)
    if (code) openCanvasEmbedCodePanel({ sourceName: entry.name || entry.path, title: 'Canvas iframe embed', language: 'html', code })
    if (!isSameOriginCanvasEmbedUrl(embedUrl)) return
    const isolatedEmbedUrl = resolveLiveCanvasHeroEmbedUrl({
      sourcePath: entry.path,
      selectedEmbedUrl: embedUrl,
    })
    if (!isolatedEmbedUrl) return
    selectLiveCanvasHeroSource({ sourcePath: entry.path, embedUrl: isolatedEmbedUrl })
  }, [])

  const handleCanvasEmbedStart = React.useCallback((entry: WorkspaceEntry) => {
    const embedUrl = buildLocalDocCanvasEmbedUrl({ relativePath: entry.path })
    if (!embedUrl) return
    const code = buildCanvasEmbedIframeMarkup(embedUrl)
    if (code) openCanvasEmbedCodePanel({ sourceName: entry.name || entry.path, title: 'Canvas iframe embed', language: 'html', code })
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

  if (loading) {
    return <p className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME} px-2 py-1 ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>Loading…</p>
  }

  if (loadError) {
    return <p className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME} px-2 py-1 ${textSizeClass} ${UI_THEME_TOKENS.status.error}`}>Failed: {loadError}</p>
  }

  return (
    <>
      <SourceFilesOwnershipSummary />
      <MarkdownFileTree
        entries={entries}
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
      />
    </>
  )
}
