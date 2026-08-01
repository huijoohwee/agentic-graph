import type {
  WorkspaceFileActions,
  WorkspaceImportActionsCtx,
  WorkspaceMutationActionsCtx,
  WorkspaceWebsiteImportCtx,
  UseWorkspaceFileActionsArgs,
} from './useWorkspaceFileActions/types'
import { shouldForceDocumentSemanticModeForImport, useWorkspaceFileActionsCore, useWorkspaceStatusHelpers } from './useWorkspaceFileActions/core'
import { useWorkspaceImportActions } from './useWorkspaceFileActions/importActions'
import { useWorkspaceWebsiteImportAction } from './useWorkspaceFileActions/websiteImportAction'
import { useWorkspaceMutationActions } from './useWorkspaceFileActions/mutationActions'

export { shouldForceDocumentSemanticModeForImport, useWorkspaceStatusHelpers }

function buildWorkspaceImportActionsCtx(args: UseWorkspaceFileActionsArgs): WorkspaceImportActionsCtx {
  return {
    getFs: args.getFs,
    refresh: args.refresh,
    openedPath: args.openedPath,
    activeDocumentKey: args.activeDocumentKey,
    setActiveText: args.setActiveText,
    setEntries: args.setEntries,
    lastLoadedRef: args.lastLoadedRef,
    setActiveMarkdownDocument: args.setActiveMarkdownDocument,
  }
}

function buildWorkspaceWebsiteImportCtx(args: UseWorkspaceFileActionsArgs): WorkspaceWebsiteImportCtx {
  return {
    getFs: args.getFs,
    refresh: args.refresh,
  }
}

function buildWorkspaceMutationActionsCtx(args: UseWorkspaceFileActionsArgs): WorkspaceMutationActionsCtx {
  return {
    getFs: args.getFs,
    refresh: args.refresh,
    openedPath: args.openedPath,
    selectionPath: args.selectionPath,
    selectionEntryKind: args.selectionEntryKind,
    activeDocumentKey: args.activeDocumentKey,
    setActiveText: args.setActiveText,
    setEntries: args.setEntries,
    lastLoadedRef: args.lastLoadedRef,
    setActiveMarkdownDocument: args.setActiveMarkdownDocument,
    setActivePathSafe: args.setActivePathSafe,
    setSelectionPathSafe: args.setSelectionPathSafe,
  }
}

export function useWorkspaceFileActions(args: UseWorkspaceFileActionsArgs): WorkspaceFileActions {
  const core = useWorkspaceFileActionsCore(args)

  const importActions = useWorkspaceImportActions({
    core,
    ctx: buildWorkspaceImportActionsCtx(args),
  })

  const websiteImport = useWorkspaceWebsiteImportAction({
    core,
    ctx: buildWorkspaceWebsiteImportCtx(args),
  })

  const mutationActions = useWorkspaceMutationActions({
    core: { status: core.status },
    ctx: buildWorkspaceMutationActionsCtx(args),
  })

  return {
    focusAfterImport: core.focusAfterImport,
    createNewFile: core.createNewFile,
    createNewFolder: core.createNewFolder,
    handleImportLocalFiles: importActions.handleImportLocalFiles,
    handleImportLocalImages: importActions.handleImportLocalImages,
    handleImportLocalFolder: importActions.handleImportLocalFolder,
    handleImportUrl: importActions.handleImportUrl,
    handleImportWebsite: websiteImport.handleImportWebsite,
    refreshFileFromSource: mutationActions.refreshFileFromSource,
    onDeleteEntry: mutationActions.onDeleteEntry,
    onRenameEntry: mutationActions.onRenameEntry,
    onClearFile: mutationActions.onClearFile,
  }
}
