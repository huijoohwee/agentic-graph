import type React from 'react'
import type { MarkdownGeoDatasetIntegration } from '@/features/markdown/ui/MarkdownRendererTypes'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import type { HighlightedLineRange, MarkdownPresentationApi } from '../markdownWorkspaceTypes'
import type { WebpageFrontmatterMeta, WebpageViewMode } from '@/lib/markdown/frontmatter'

export type MarkdownWorkspacePaneVisibility = { json: boolean; markdown: boolean; viewer: boolean; html: boolean }

export type MarkdownWorkspacePaneAvailability = {
  bin: boolean
  json: boolean
  markdown: boolean
  viewer: boolean
  html: boolean
}

export const DEFAULT_MARKDOWN_WORKSPACE_PANE_VISIBILITY: MarkdownWorkspacePaneVisibility = {
  json: false,
  markdown: false,
  viewer: true,
  html: false,
}

export const DEFAULT_MARKDOWN_WORKSPACE_PANE_AVAILABILITY: MarkdownWorkspacePaneAvailability = {
  bin: false,
  json: true,
  markdown: true,
  viewer: true,
  html: true,
}

function extensionLower(nameRaw: string): string {
  const base = String(nameRaw || '').split(/[/?#]/)[0]?.split('/').filter(Boolean).pop() || ''
  const index = base.lastIndexOf('.')
  return index > 0 ? base.slice(index + 1).toLowerCase() : ''
}

export type MarkdownWorkspaceDocumentPanePreset = 'viewer' | 'json' | 'markdown' | null

export function isMarkdownWorkspaceDelimitedTextPath(activeDocumentKey?: string | null): boolean {
  const ext = extensionLower(String(activeDocumentKey || ''))
  return ext === 'csv' || ext === 'tsv' || ext === 'tab'
}

export function resolveMarkdownWorkspaceDocumentPanePreset(activeDocumentKey?: string | null): MarkdownWorkspaceDocumentPanePreset {
  if (isMarkdownWorkspaceDelimitedTextPath(activeDocumentKey)) return 'viewer'
  const ext = extensionLower(String(activeDocumentKey || ''))
  if (ext === 'json' || ext === 'jsonld' || ext === 'geojson') return 'json'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  return null
}

export function resolveMarkdownWorkspacePaneAvailability(args: {
  modelAssetFormat?: 'glb' | 'gltf' | null
}): MarkdownWorkspacePaneAvailability {
  if (args.modelAssetFormat === 'glb') {
    return { bin: true, json: false, markdown: false, viewer: false, html: false }
  }
  if (args.modelAssetFormat === 'gltf') {
    return { bin: false, json: true, markdown: false, viewer: false, html: false }
  }
  return DEFAULT_MARKDOWN_WORKSPACE_PANE_AVAILABILITY
}

export function resolveMarkdownWorkspaceInitialPaneVisibility(args: {
  activeDocumentKey?: string | null
  modelAssetFormat?: 'glb' | 'gltf' | null
  webpageView?: WebpageViewMode | null
}): MarkdownWorkspacePaneVisibility {
  if (args.modelAssetFormat === 'glb') return { json: false, markdown: false, viewer: false, html: false }
  if (args.modelAssetFormat === 'gltf') return { json: true, markdown: false, viewer: false, html: false }
  if (args.webpageView === 'json') return { json: true, markdown: false, viewer: false, html: false }
  if (args.webpageView === 'html') return { json: false, markdown: false, viewer: true, html: true }
  const documentPreset = resolveMarkdownWorkspaceDocumentPanePreset(args.activeDocumentKey)
  if (documentPreset === 'viewer') return { json: false, markdown: false, viewer: true, html: false }
  if (documentPreset === 'json') return { json: true, markdown: false, viewer: false, html: false }
  if (documentPreset === 'markdown') return { json: false, markdown: true, viewer: false, html: false }
  return { json: false, markdown: true, viewer: false, html: false }
}

export function resolveMarkdownWorkspacePaneVisibility(args: {
  layoutMode: MarkdownWorkspaceLayoutMode
  splitPaneVisibility: MarkdownWorkspacePaneVisibility
  paneAvailability?: MarkdownWorkspacePaneAvailability
  forceMarkdownEditorInEditorMode?: boolean
}): MarkdownWorkspacePaneVisibility {
  const isEditor = args.layoutMode === 'editor'
  const isSplit = args.layoutMode === 'split'
  const isViewer = args.layoutMode === 'viewer'
  const availability = args.paneAvailability || DEFAULT_MARKDOWN_WORKSPACE_PANE_AVAILABILITY
  const forceMarkdownEditorInEditorMode = args.forceMarkdownEditorInEditorMode !== false

  return {
    json: availability.json && (isEditor || isSplit) && args.splitPaneVisibility.json,
    markdown: availability.markdown && (
      (isEditor && (forceMarkdownEditorInEditorMode || args.splitPaneVisibility.markdown)) ||
      (isSplit && args.splitPaneVisibility.markdown)
    ),
    viewer: availability.viewer && (isViewer || (isSplit && args.splitPaneVisibility.viewer) || (isEditor && args.splitPaneVisibility.viewer)),
    html: availability.html && (isEditor || isSplit) && args.splitPaneVisibility.html,
  }
}

export type MarkdownWorkspaceMainProps = {
  themeMode: 'light' | 'dark'
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration

  explorerOpen: boolean
  setExplorerOpen: (next: boolean) => void

  layoutMode: MarkdownWorkspaceLayoutMode
  setLayoutMode: (mode: MarkdownWorkspaceLayoutMode) => void
  markdownWordWrap: boolean
  setMarkdownWordWrap: (next: boolean) => void
  markdownTextHighlight: boolean
  setMarkdownTextHighlight: (next: boolean) => void

  onStatusProgress?: (label: string, current?: number | null, total?: number | null, bytesCurrent?: number | null, bytesTotal?: number | null) => void
  onStatusWithAutoClear?: (label: string, ttlMs?: number) => void
  /** Passive observations render panes without authored token, export or document actions. */
  passive?: boolean
  onSaveAs?: () => void
  onToggleFullscreen: () => void
  presentationApiRef: React.MutableRefObject<MarkdownPresentationApi | null>

  isMarkdown: boolean

  webpageWorkspaceMeta?: WebpageFrontmatterMeta | null
  onWebpageChangeView?: (view: WebpageViewMode) => void
  onWebpageUpdateMeta?: (patch: { fidelityLevel?: 1 | 2 | 3 | 4 }) => void
  contentFormat?: 'markdown' | 'json' | null
  onContentFormatChange?: (format: 'markdown' | 'json') => void | Promise<void>

  activeText: string
  setActiveText: (next: string) => void
  jsonSourceText?: string | null
  editorTextOverride?: string | null
  webpageHtmlOverride?: string | null
  disableEditorMutations?: boolean
  liveTextTailFollowKey?: string | null
  viewerTextOverride?: string | null
  disableViewerMutations?: boolean
  suppressFrontmatterWarnings?: boolean
  activeDocumentKey: string
  highlightedLineRange: HighlightedLineRange
  revealLineInEditor: (line: number, endLine?: number) => void
  showInViewer: (line: number) => void
  showInPresentation: (line: number) => void
  showInGallery: (line: number) => void

  editorUri: string
  editorLanguage: string
  editorRef: React.MutableRefObject<MonacoTextEditorHandle | null>
  onEditorCaretLine?: (line: number) => void
  onViewerInlineEditStateChange?: (active: boolean) => void
  widgetModeActive?: boolean
}
