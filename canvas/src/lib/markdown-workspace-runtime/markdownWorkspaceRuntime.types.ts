import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceFs, WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'

export type MarkdownWorkspaceRuntimeGetFs = () => Promise<WorkspaceFs>

export type MarkdownWorkspaceRuntimeSetActiveDocument = (args: {
  name: string
  text: string
  normalizeMermaidMmd?: boolean
  autoEnableFrontmatter?: boolean
  applyViewPreset?: boolean
  applyToGraph?: boolean
  forceApplyToGraph?: boolean
  canvasWorkspacePreset?: CanvasWorkspaceFrontmatterPreset | null
  sourceUrl?: string | null
  jsonSourceText?: string | null
  canonicalMarkdownText?: string | null
  expectedCurrentDocumentName?: string | null
  expectedCurrentDocumentText?: string | null
}) => Promise<boolean>

export type MarkdownWorkspaceLoadedSnapshot = {
  path: WorkspacePath
  text: string
  observedWorkspaceText?: string | null
  observedWorkspaceFs?: WorkspaceFs
}

export type MarkdownWorkspaceSelectionArgs = {
  activePath: WorkspacePath | null
  setActivePath: (path: WorkspacePath) => void
  entries: WorkspaceEntry[]
  loading: boolean
  activeText: string
  setActiveText: (text: string) => void
  setActiveTextProgrammatic: (text: string) => void
  markdownDocumentName: string
  markdownDocumentText: string
  graphDataSource?: string
  setActiveMarkdownDocument: MarkdownWorkspaceRuntimeSetActiveDocument
  getFs: MarkdownWorkspaceRuntimeGetFs
  sourcesByPath: WorkspaceSourceIndex
  viewerInlineEditActive: boolean
  activeRef: MutableRefObject<boolean>
  activeTextRef: MutableRefObject<string>
  lastLoadedRef: MutableRefObject<MarkdownWorkspaceLoadedSnapshot | null>
  userEditedActiveTextRef: MutableRefObject<boolean>
  collapsedSnapshotRef: MutableRefObject<{ path: WorkspacePath; text: string } | null>
  prevCollapsedRef: MutableRefObject<boolean>
  effectiveBottomSurfaceCollapsed: boolean
  canvas2dRenderer: string
  lastSetActivePath: { path: WorkspacePath; atMs: number } | null
  lastRequestedActivePathRef: MutableRefObject<{ path: WorkspacePath; atMs: number } | null>
  commitActiveTextBeforeSelectionRef: MutableRefObject<(() => Promise<boolean>) | null>
  patchWorkspaceEntryInlineText: (path: WorkspacePath, text: string) => void
  clearStatus: () => void
  setHighlightedLineRange: (value: null) => void
}

export type MarkdownWorkspaceExplorerPresentationArgs = {
  sidebarWidthPx: number
  explorerOpen: boolean
  sourceFilesCollapsed: boolean
  tocCollapsed: boolean
  backlinksCollapsed: boolean
  markdownWordWrap: boolean
  markdownTextHighlight: boolean
  layoutMode: MarkdownWorkspaceLayoutMode
  expandedPaths: Set<string>
  resizeHandleEl: HTMLHRElement | null
  setSidebarWidthPx: Dispatch<SetStateAction<number>>
  search: string
}
