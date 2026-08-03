import type React from 'react'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import type {
  WorkspaceBridgeImportResult,
  WorkspaceFileSelection,
  WorkspaceImportUrlOpts,
  WorkspaceImportWebsiteOpts,
} from '@/features/markdown-explorer/workspaceActionBridge'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'

export type { WorkspaceBridgeImportResult, WorkspaceFileSelection } from '@/features/markdown-explorer/workspaceActionBridge'

export type WorkspaceRefreshSnapshot = {
  entries: WorkspaceEntry[]
  sourcesByPath: WorkspaceSourceIndex
}

export type UseWorkspaceFileActionsArgs = {
  getFs: () => Promise<WorkspaceFs>
  refresh: () => Promise<WorkspaceRefreshSnapshot>

  openedPath: WorkspacePath | null
  selectionPath: WorkspacePath | null
  selectionEntryKind: WorkspaceEntry['kind'] | null
  activeDocumentKey: string
  activeDocumentSourceUrl: string | null
  setActiveText: (next: string) => void
  setEntries: React.Dispatch<React.SetStateAction<WorkspaceEntry[]>>
  lastLoadedRef: React.MutableRefObject<{ path: WorkspacePath; text: string } | null>

  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  setActivePathSafe: (path: WorkspacePath) => void
  setSelectionPathSafe: (path: WorkspacePath) => void | Promise<boolean>

  setActiveMarkdownDocument: (args: {
    name: string
    text: string
    sourceUrl?: string | null
    jsonSourceText?: string | null
    autoEnableFrontmatter?: boolean
    applyViewPreset?: boolean
    recent?: Omit<import('@/hooks/store/types').RecentFileEntry, 'id' | 'timestamp'> | null
    applyToGraph?: boolean
    forceApplyToGraph?: boolean
    normalizeMermaidMmd?: boolean
  }) => Promise<boolean>
  applyMarkdownDocumentToGraph: (
    name: string,
    text: string,
    opts?: { force?: boolean; preset?: CanvasWorkspaceFrontmatterPreset | null; applyViewPreset?: boolean; requireActiveMarkdownDocument?: boolean },
  ) => Promise<boolean>
}

export type WorkspaceImportActionsCtx = Pick<
  UseWorkspaceFileActionsArgs,
  'getFs' | 'refresh' | 'openedPath' | 'activeDocumentKey' | 'setActiveText' | 'setEntries' | 'lastLoadedRef' | 'setActiveMarkdownDocument'
>

export type WorkspaceWebsiteImportCtx = Pick<UseWorkspaceFileActionsArgs, 'getFs' | 'refresh'>

export type WorkspaceMutationActionsCtx = Pick<
  UseWorkspaceFileActionsArgs,
  | 'getFs'
  | 'refresh'
  | 'openedPath'
  | 'selectionPath'
  | 'selectionEntryKind'
  | 'activeDocumentKey'
  | 'setActiveText'
  | 'setEntries'
  | 'lastLoadedRef'
  | 'setActiveMarkdownDocument'
  | 'setActivePathSafe'
  | 'setSelectionPathSafe'
>

export type WorkspaceFileActions = {
  focusAfterImport: (createdPath: WorkspacePath, opts?: { sourceUrl?: string | null; jsonSourceText?: string | null; applyToGraph?: boolean; jobId?: number }) => Promise<void>
  createNewFile: (opts?: { parentPath?: WorkspacePath }) => Promise<void>
  createNewFolder: (opts?: { parentPath?: WorkspacePath }) => Promise<void>
  handleImportLocalFiles: (files: WorkspaceFileSelection) => Promise<void | WorkspaceBridgeImportResult>
  handleImportLocalImages: (files: WorkspaceFileSelection) => Promise<void | WorkspaceBridgeImportResult>
  handleImportLocalFolder: (files: WorkspaceFileSelection) => Promise<void | WorkspaceBridgeImportResult>
  handleImportUrl: (urlRaw: string, opts?: WorkspaceImportUrlOpts) => Promise<void | WorkspaceBridgeImportResult>
  handleImportWebsite: (urlRaw: string, opts?: WorkspaceImportWebsiteOpts) => Promise<void | WorkspaceBridgeImportResult>
  onDeleteEntry: (path: WorkspacePath) => void
  onRenameEntry: (path: WorkspacePath, nextName: string) => void
  onClearFile: (path: WorkspacePath) => void
  refreshFileFromSource: (path: WorkspacePath) => Promise<void>
}

export type StatusHelpers = {
  setStatusInfo: (label: string, opts?: { ttlMs?: number | null; dismissible?: boolean }) => void
  setStatusWarning: (label: string, opts?: { ttlMs?: number | null; dismissible?: boolean }) => void
  setStatusError: (label: string, opts?: { ttlMs?: number | null; dismissible?: boolean }) => void
  setStatusProgress: (
    label: string,
    current?: number | null,
    total?: number | null,
    bytesCurrent?: number | null,
    bytesTotal?: number | null,
    opts?: { ttlMs?: number | null; busy?: boolean },
  ) => void
  clearStatus: () => void
  buildWebpageImportStageLabel: (pctRaw: number) => string
}
