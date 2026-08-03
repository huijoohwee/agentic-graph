import React from 'react'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { normalizeWorkspacePath, workspaceBasename, workspaceExtLower, workspaceStem, WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { shouldAutosaveWorkspaceFile } from '@/features/markdown-workspace/workspaceAutosave'
import {
  cancelMarkdownWorkspaceAutosaveSync,
  scheduleMarkdownWorkspaceAutosaveSync,
} from './markdownWorkspaceRuntime.stateSync'
import { applyMarkdownWorkspaceErrorStatus, applyMarkdownWorkspaceSuccessStatus } from './markdownWorkspaceStatusTransitions'
import { resolveAuthoritativeWorkspaceText, syncWorkspaceTextState, writeWorkspaceFileAndSync } from './markdownWorkspaceRuntime.io'
import { clearRuntimeTimeout, scheduleRuntimeTimeout, type RuntimeTimeoutHandle } from './markdownWorkspaceRuntime.shared'
import type { MarkdownWorkspaceRuntimeProgressStatusBindings } from './markdownWorkspaceRuntimeStatus'
import type { MarkdownWorkspaceRuntimeGetFs, MarkdownWorkspaceRuntimeSetActiveDocument } from './markdownWorkspaceRuntime.types'
import {
  captureWorkspaceSourceTextRevision,
  type WorkspaceSourceTextRevision,
} from '@/features/workspace-fs/workspaceSourceTextTransaction'
import { useGraphStore } from '@/hooks/useGraphStore'

type PendingWorkspaceAutosave = {
  path: WorkspacePath
  text: string
  expectedSourceRevision: WorkspaceSourceTextRevision
  expectedWorkspaceText: string
}

export type MarkdownWorkspaceSaveArgs = MarkdownWorkspaceRuntimeProgressStatusBindings & {
  active: boolean
  viewerInlineEditActive: boolean
  activePath: WorkspacePath | null
  activeEntryKind: string | null
  activeText: string
  activeTextRef: React.MutableRefObject<string>
  debouncedText: string
  activeDocumentKey: string
  activeDocumentSourceUrl: string | null
  getFs: MarkdownWorkspaceRuntimeGetFs
  lastLoadedRef: React.MutableRefObject<{ path: WorkspacePath; text: string } | null>
  patchWorkspaceEntryInlineText: (path: WorkspacePath, text: string) => void
  setActiveMarkdownDocument: MarkdownWorkspaceRuntimeSetActiveDocument
  setGraphRagWorkflowJsonText: (text: string) => void
  setActiveTextProgrammatic: (next: string) => void
  refresh: () => Promise<unknown>
  setActivePathSafe: (path: WorkspacePath) => void
  setSelectionPathSafe: (path: WorkspacePath) => void
  userEditedActiveTextRef: React.MutableRefObject<boolean>
  saveCollaborationSnapshot?: (args: {
    path: WorkspacePath
    text: string
    saveBoundary: 'explicit' | 'autosave'
  }) => Promise<void>
}

export function useMarkdownWorkspaceSave(args: MarkdownWorkspaceSaveArgs) {
  const workspaceAutosaveEnabled = useGraphStore(state => state.workspaceAutosaveEnabled)
  const autosaveInFlightRef = React.useRef(false)
  const autosavePendingRef = React.useRef<PendingWorkspaceAutosave | null>(null)
  const autosaveStatusTimerRef = React.useRef<RuntimeTimeoutHandle | null>(null)

  const applySaveSuccessStatus = React.useCallback(
    (label: string, ttlMs?: number) => {
      applyMarkdownWorkspaceSuccessStatus({
        setStatusWithAutoClear: args.setStatusWithAutoClear,
        label,
        ttlMs,
      })
    },
    [args.setStatusWithAutoClear],
  )

  const applySaveErrorStatus = React.useCallback(
    (error: unknown) => {
      applyMarkdownWorkspaceErrorStatus({
        setStatusError: args.setStatusError,
        prefix: 'Save failed',
        error,
        fallbackMessage: 'Request failed',
      })
    },
    [args.setStatusError],
  )

  const applyAutosaveErrorStatus = React.useCallback(
    (error: unknown) => {
      applyMarkdownWorkspaceErrorStatus({
        setStatusError: args.setStatusError,
        prefix: 'Autosave failed',
        error,
        fallbackMessage: 'Request failed',
      })
    },
    [args.setStatusError],
  )

  const saveActiveFileNow = React.useCallback(async () => {
    const path = args.activePath
    if (!path || args.activeEntryKind === 'folder') return
    try {
      const textToSave = await resolveAuthoritativeWorkspaceText({
        path,
        getFs: args.getFs,
        lastLoadedRef: args.lastLoadedRef,
        activeTextRef: { current: args.activeText },
        userEditedActiveTextRef: args.userEditedActiveTextRef,
      })
      args.setStatusProgress('Saving', undefined, undefined, undefined, undefined, {
        ttlMs: UI_TOAST_TTL_MS.progressExtended,
      })
      try {
        const store = (await import('@/hooks/useGraphStore')).useGraphStore.getState()
        store.flushComposedPositionWritesNow()
      } catch {
        void 0
      }
      const saved = await writeWorkspaceFileAndSync({
        path,
        text: textToSave,
        getFs: args.getFs,
        lastLoadedRef: args.lastLoadedRef,
        patchWorkspaceEntryInlineText: args.patchWorkspaceEntryInlineText,
        activeDocumentKey: args.activeDocumentKey,
        activeDocumentSourceUrl: args.activeDocumentSourceUrl,
        setActiveMarkdownDocument: args.setActiveMarkdownDocument,
        setGraphRagWorkflowJsonText: args.setGraphRagWorkflowJsonText,
        resetParsedState: true,
      })
      if (!saved) {
        throw new Error('The source changed before Save could commit the current editor text.')
      }
      await args.saveCollaborationSnapshot?.({
        path,
        text: textToSave,
        saveBoundary: 'explicit',
      })
      applySaveSuccessStatus('Saved')
    } catch (e) {
      applySaveErrorStatus(e)
    }
  }, [applySaveErrorStatus, applySaveSuccessStatus, args])

  const saveAsActiveFileNow = React.useCallback(async () => {
    const currentPath = args.activePath
    if (!currentPath || args.activeEntryKind === 'folder') return
    const normalized = normalizeWorkspacePath(currentPath)
    const parentPath = (() => {
      const idx = normalized.lastIndexOf('/')
      if (idx <= 0) return WORKSPACE_ROOT_PATH
      return normalizeWorkspacePath(normalized.slice(0, idx) || WORKSPACE_ROOT_PATH)
    })()
    const ext = workspaceExtLower(normalized) || 'md'
    const base = workspaceStem(normalized) || workspaceBasename(normalized) || 'note'
    const suggested = `${base}-copy.${ext}`
    const draft = typeof window !== 'undefined' ? window.prompt('Save As', suggested) : suggested
    const raw = String(draft || '').trim()
    if (!raw) {
      applySaveSuccessStatus('Save cancelled', UI_TOAST_TTL_MS.statusAutoCloseFast)
      return
    }
    const safeName = raw
      .replace(/\\/g, '/')
      .replace(/\s+/g, ' ')
      .replace(/\.+\//g, '')
      .replace(/\//g, '-')
      .replace(/\.{2,}/g, '.')
      .trim()
    const finalName = safeName.includes('.') ? safeName : `${safeName}.${ext}`

    try {
      const textToSave = await resolveAuthoritativeWorkspaceText({
        path: currentPath,
        getFs: args.getFs,
        lastLoadedRef: args.lastLoadedRef,
        activeTextRef: { current: args.activeText },
        userEditedActiveTextRef: args.userEditedActiveTextRef,
      })
      args.setStatusProgress('Saving', undefined, undefined, undefined, undefined, {
        ttlMs: UI_TOAST_TTL_MS.progressExtended,
      })
      try {
        const store = (await import('@/hooks/useGraphStore')).useGraphStore.getState()
        store.flushComposedPositionWritesNow()
      } catch {
        void 0
      }
      const fs = await args.getFs()
      const createdPath = await fs.createFile({ parentPath, name: finalName, text: textToSave })
      setWorkspaceEntrySource(createdPath, { kind: 'local', originalName: null })
      await args.refresh()
      syncWorkspaceTextState({
        path: createdPath,
        text: textToSave,
        lastLoadedRef: args.lastLoadedRef,
        setActiveText: args.setActiveTextProgrammatic,
      })
      args.setActivePathSafe(createdPath)
      args.setSelectionPathSafe(createdPath)
      applySaveSuccessStatus('Saved as')
    } catch (e) {
      applySaveErrorStatus(e)
    }
  }, [applySaveErrorStatus, applySaveSuccessStatus, args])

  const commitActiveTextBeforeSelection = React.useCallback(async (): Promise<boolean> => {
    const path = args.activePath
    if (!path || args.activeEntryKind === 'folder' || args.viewerInlineEditActive) return true
    const lastLoaded = args.lastLoadedRef.current
    const activeText = String(args.activeTextRef.current || '')
    const hasUnsavedActiveText = !!(
      lastLoaded?.path === path
      && String(lastLoaded.text || '') !== activeText
    )
    if (!hasUnsavedActiveText) return true
    cancelMarkdownWorkspaceAutosaveSync(path)
    try {
      const saved = await writeWorkspaceFileAndSync({
        path,
        text: activeText,
        getFs: args.getFs,
        lastLoadedRef: args.lastLoadedRef,
        patchWorkspaceEntryInlineText: args.patchWorkspaceEntryInlineText,
        activeDocumentKey: args.activeDocumentKey,
        activeDocumentSourceUrl: args.activeDocumentSourceUrl,
        setActiveMarkdownDocument: args.setActiveMarkdownDocument,
        setGraphRagWorkflowJsonText: args.setGraphRagWorkflowJsonText,
        setActiveText: args.setActiveTextProgrammatic,
        expectedSourceRevision: captureWorkspaceSourceTextRevision(path),
        expectedWorkspaceText: lastLoaded.text,
        resetParsedState: false,
      })
      if (!saved) {
        applySaveErrorStatus(new Error('The source changed before the pending editor text could be saved.'))
        return false
      }
      await args.saveCollaborationSnapshot?.({
        path,
        text: activeText,
        saveBoundary: 'autosave',
      })
      return true
    } catch (error) {
      applySaveErrorStatus(error)
      return false
    }
  }, [applySaveErrorStatus, args])

  React.useEffect(() => {
    if (!workspaceAutosaveEnabled || !args.active || args.viewerInlineEditActive) return
    const path = args.activePath
    if (!path || args.activeEntryKind === 'folder') return
    const last = args.lastLoadedRef.current
    if (!args.userEditedActiveTextRef.current) return
    if (!shouldAutosaveWorkspaceFile({ enabled: workspaceAutosaveEnabled, path, lastLoaded: last, activeText: args.activeText, debouncedText: args.debouncedText })) {
      return
    }
    const autosaveRequest: PendingWorkspaceAutosave = {
      path,
      text: args.debouncedText,
      expectedSourceRevision: captureWorkspaceSourceTextRevision(path),
      expectedWorkspaceText: String(last?.text || ''),
    }
    scheduleMarkdownWorkspaceAutosaveSync(() => {
      if (autosaveInFlightRef.current) {
        autosavePendingRef.current = autosaveRequest
        return
      }
      autosaveInFlightRef.current = true
      void (async () => {
        let nextRequest = autosaveRequest
        try {
          while (true) {
            autosaveStatusTimerRef.current = scheduleRuntimeTimeout(() => {
              args.setStatusProgress('Saving', undefined, undefined, undefined, undefined, {
                ttlMs: UI_TOAST_TTL_MS.progressExtended,
              })
            }, 220)
            try {
              const saved = await writeWorkspaceFileAndSync({
                path: nextRequest.path,
                text: nextRequest.text,
                getFs: args.getFs,
                lastLoadedRef: args.lastLoadedRef,
                patchWorkspaceEntryInlineText: args.patchWorkspaceEntryInlineText,
                activeDocumentKey: args.activeDocumentKey,
                activeDocumentSourceUrl: args.activeDocumentSourceUrl,
                setActiveMarkdownDocument: args.setActiveMarkdownDocument,
                setGraphRagWorkflowJsonText: args.setGraphRagWorkflowJsonText,
                expectedSourceRevision: nextRequest.expectedSourceRevision,
                expectedWorkspaceText: nextRequest.expectedWorkspaceText,
                resetParsedState: false,
              })
              if (!saved) {
                throw new Error('The source changed before autosave could commit the current editor text.')
              }
              await args.saveCollaborationSnapshot?.({
                path: nextRequest.path,
                text: nextRequest.text,
                saveBoundary: 'autosave',
              })
              applySaveSuccessStatus('Autosaved', UI_TOAST_TTL_MS.statusAutoCloseFast)
            } finally {
              const timer = autosaveStatusTimerRef.current
              clearRuntimeTimeout(timer)
              autosaveStatusTimerRef.current = null
            }

            const pending = autosavePendingRef.current
            const pendingMatchesCurrent = !!(
              pending
              && pending.path === nextRequest.path
              && pending.text === nextRequest.text
              && pending.expectedSourceRevision.revision === nextRequest.expectedSourceRevision.revision
            )
            if (!pending || pending.path !== path || pendingMatchesCurrent) {
              if (pending && pending.path !== path) autosavePendingRef.current = pending
              break
            }
            autosavePendingRef.current = null
            nextRequest = pending
          }
        } catch (e) {
          applyAutosaveErrorStatus(e)
        } finally {
          autosaveInFlightRef.current = false
        }
      })()
    }, { path, text: args.debouncedText })
    return () => {
      cancelMarkdownWorkspaceAutosaveSync(path)
    }
  }, [applyAutosaveErrorStatus, applySaveSuccessStatus, args, workspaceAutosaveEnabled])

  React.useEffect(() => {
    return () => {
      const timer = autosaveStatusTimerRef.current
      clearRuntimeTimeout(timer)
      autosaveStatusTimerRef.current = null
      autosaveInFlightRef.current = false
      autosavePendingRef.current = null
    }
  }, [])

  return {
    commitActiveTextBeforeSelection,
    saveActiveFileNow,
    saveAsActiveFileNow,
  }
}
