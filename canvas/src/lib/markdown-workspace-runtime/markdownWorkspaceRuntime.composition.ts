import type React from 'react'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { UseWorkspaceFileActionsArgs, WorkspaceFileActions } from '@/features/markdown-workspace/useWorkspaceFileActions/types'
import type { MarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import type { MarkdownWorkspaceSelectionArgs } from './useMarkdownWorkspaceSelection'
import type { MarkdownWorkspaceDerivedViewsArgs } from './useMarkdownWorkspaceDerivedViews'
import type { MarkdownWorkspaceIndexingArgs } from './useMarkdownWorkspaceIndexing'
import type { MarkdownWorkspaceSaveArgs } from './useMarkdownWorkspaceSave'
import { materializeKnowledgeGraphWorkspaceArtifact } from '@/features/knowledge-graph/knowledgeGraphWorkspaceArtifact'

export function buildMarkdownWorkspaceFileActionsArgs(args: {
  getFs: UseWorkspaceFileActionsArgs['getFs']
  refresh: UseWorkspaceFileActionsArgs['refresh']
  activePath: WorkspacePath | null
  selectionPath: WorkspacePath | null
  selectionEntryKind: WorkspaceEntry['kind'] | null
  activeDocumentKey: string
  activeDocumentSourceUrl: string | null
  setActiveText: (next: string) => void
  setEntries: React.Dispatch<React.SetStateAction<WorkspaceEntry[]>>
  lastLoadedRef: React.MutableRefObject<{ path: WorkspacePath; text: string } | null>
  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  setActivePathSafe: (path: WorkspacePath) => void
  setSelectionPathSafe: (path: WorkspacePath) => void | Promise<void>
  setActiveMarkdownDocument: UseWorkspaceFileActionsArgs['setActiveMarkdownDocument']
  applyMarkdownDocumentToGraph: UseWorkspaceFileActionsArgs['applyMarkdownDocumentToGraph']
}): UseWorkspaceFileActionsArgs {
  return {
    getFs: args.getFs,
    refresh: args.refresh,
    openedPath: args.activePath,
    selectionPath: args.selectionPath,
    selectionEntryKind: args.selectionEntryKind,
    activeDocumentKey: args.activeDocumentKey,
    activeDocumentSourceUrl: args.activeDocumentSourceUrl,
    setActiveText: args.setActiveText,
    setEntries: args.setEntries,
    lastLoadedRef: args.lastLoadedRef,
    setExpandedPaths: args.setExpandedPaths,
    setActivePathSafe: args.setActivePathSafe,
    setSelectionPathSafe: args.setSelectionPathSafe,
    setActiveMarkdownDocument: args.setActiveMarkdownDocument,
    applyMarkdownDocumentToGraph: args.applyMarkdownDocumentToGraph,
  }
}

export function buildMarkdownWorkspaceActionBridge(args: {
  fileActions: WorkspaceFileActions
  createParentPath: WorkspacePath
  saveEnabled: boolean
  saveActiveFileNow: () => Promise<void> | void
}): MarkdownWorkspaceActionBridge {
  return {
    importLocalFiles: args.fileActions.handleImportLocalFiles,
    importLocalImages: args.fileActions.handleImportLocalImages,
    importLocalFolder: args.fileActions.handleImportLocalFolder,
    importUrl: args.fileActions.handleImportUrl,
    importWebsite: args.fileActions.handleImportWebsite,
    createNewFolder: () => void args.fileActions.createNewFolder({ parentPath: args.createParentPath }),
    save: args.saveEnabled ? () => void args.saveActiveFileNow() : undefined,
    materializeKnowledgeGraphImport: async request => {
      const artifact = await materializeKnowledgeGraphWorkspaceArtifact(request)
      await args.fileActions.focusAfterImport(artifact.path as WorkspacePath, { applyToGraph: false })
      return artifact
    },
  }
}

export function buildMarkdownWorkspaceSelectionArgs(args: MarkdownWorkspaceSelectionArgs): MarkdownWorkspaceSelectionArgs {
  return args
}

export function buildMarkdownWorkspaceDerivedViewsArgs(args: MarkdownWorkspaceDerivedViewsArgs): MarkdownWorkspaceDerivedViewsArgs {
  return args
}

export function buildMarkdownWorkspaceIndexingArgs(args: MarkdownWorkspaceIndexingArgs): MarkdownWorkspaceIndexingArgs {
  return args
}

export function buildMarkdownWorkspaceSaveArgs(args: MarkdownWorkspaceSaveArgs): MarkdownWorkspaceSaveArgs {
  return args
}
