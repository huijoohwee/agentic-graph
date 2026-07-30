import React from 'react'
import { useMarkdownEditorSsotSync } from '@/features/markdown-workspace/useMarkdownEditorSsotSync'
import { commitActiveMarkdownBlockEditors } from '@/lib/markdown-core/ui/markdownBlockContainerCore.activeEditor'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { applyActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import type { MarkdownWorkspaceRuntimeSetActiveDocument } from './markdownWorkspaceRuntime.types'
import { resolveWorkspaceDirtyState } from './markdownWorkspaceRuntime.shared'
import { resolveMarkdownWorkspaceSelectionCollapseTransition } from './markdownWorkspaceSelectionCollapseTransition'
import { resolveMarkdownWorkspaceBootstrapActivePath } from './markdownWorkspaceSelectionBootstrap'
import { resolveMarkdownWorkspaceCanonicalSelection } from './markdownWorkspaceSelectionCanonicalPath'
import { deriveMarkdownWorkspaceSelectionState } from './markdownWorkspaceSelectionDerived'
import { normalizeMarkdownWorkspaceSelectionPath } from './markdownWorkspaceSelectionPath'
import { resolveMarkdownWorkspaceSelectionRestoreApply } from './markdownWorkspaceSelectionRestoreApply'
import { readMarkdownWorkspaceRestoreTextForPath } from './markdownWorkspaceSelectionRestore'
import {
  resolveMarkdownWorkspaceSelectionWritebackSync,
} from './markdownWorkspaceSelectionWriteback'
import { commitMarkdownWorkspaceWriteback } from './markdownWorkspaceWritebackCommit'
import {
  resolveActivePathFromWorkspaceFileSelection,
  resolveInitialMarkdownWorkspaceSelectionPath,
  resolveInvalidatedMarkdownWorkspaceSelectionPath,
} from './markdownWorkspaceSelectionSync'
import { buildWorkspaceEntriesIndex } from './workspaceEntriesIndex'
import type { MarkdownWorkspaceRuntimeGetFs } from './markdownWorkspaceRuntime.types'
import {
  shouldAcceptWorkspaceDocumentSelectionText,
  resolveStableWorkspaceSelectionSyncDecision,
  useMarkdownWorkspaceDocumentSwitchApply,
} from './markdownWorkspaceDocumentSwitchApply'
import {
  readCachedWorkspaceSelectionResolvedTextForActivePath,
  readWorkspaceSelectionResolvedTextForActivePath,
  type MarkdownWorkspaceSelectionResolvedTextCache,
} from './markdownWorkspaceSelectionResolvedText'
import { settleWorkspaceSourceTextWrites } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
export {
  isWorkspaceDocumentSwitchApplySettled,
  isWorkspace2dRendererPresetStaleForDocument,
  isWorkspaceGraphSourceStaleForDocument,
  resolveWorkspaceDocumentSwitchCanvasPreset,
  shouldAcceptWorkspaceDocumentSelectionText,
  shouldApplyStableWorkspaceSelectionToCanvas,
  shouldForceWorkspaceDocumentSwitchGraphApply,
  shouldHydrateStableWorkspaceSelectionText,
} from './markdownWorkspaceDocumentSwitchApply'
export {
  readWorkspaceSelectionEntryTextForActivePath,
  readWorkspaceSelectionResolvedTextForActivePath,
} from './markdownWorkspaceSelectionResolvedText'
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
  activeRef: React.MutableRefObject<boolean>
  activeTextRef: React.MutableRefObject<string>
  lastLoadedRef: React.MutableRefObject<{ path: WorkspacePath; text: string } | null>
  userEditedActiveTextRef: React.MutableRefObject<boolean>
  collapsedSnapshotRef: React.MutableRefObject<{ path: WorkspacePath; text: string } | null>
  prevCollapsedRef: React.MutableRefObject<boolean>
  effectiveBottomSurfaceCollapsed: boolean
  canvas2dRenderer: string
  lastSetActivePath: { path: WorkspacePath; atMs: number } | null
  lastRequestedActivePathRef: React.MutableRefObject<{ path: WorkspacePath; atMs: number } | null>
  patchWorkspaceEntryInlineText: (path: WorkspacePath, text: string) => void
  clearStatus: () => void
  setHighlightedLineRange: (value: null) => void
}
export function useMarkdownWorkspaceSelection(args: MarkdownWorkspaceSelectionArgs) {
  const storageFallbackByPathRef = React.useRef<Map<string, string>>(new Map())
  const resolvedTextCacheRef = React.useRef<MarkdownWorkspaceSelectionResolvedTextCache | null>(null)
  const setActivePathSafe = React.useCallback(
    (path: WorkspacePath) => {
      const normalized = normalizeMarkdownWorkspaceSelectionPath(path)
      if (!normalized) return
      if (normalizeMarkdownWorkspaceSelectionPath(args.activePath) === normalized) return
      args.lastRequestedActivePathRef.current = { path: normalized, atMs: Date.now() }
      args.setActivePath(normalized)
    },
    [args.activePath, args.lastRequestedActivePathRef, args.setActivePath],
  )
  const [selectionPath, setSelectionPath] = React.useState<WorkspacePath | null>(null)
  const selectionPathRef = React.useRef<WorkspacePath | null>(null)
  const pendingSelectionPathRef = React.useRef<WorkspacePath | null>(null)
  const selectionCommitRequestRef = React.useRef(0)
  if (pendingSelectionPathRef.current === selectionPath) {
    pendingSelectionPathRef.current = null
  }
  selectionPathRef.current = pendingSelectionPathRef.current || selectionPath
  const setSelectionPathSafe = React.useCallback((path: WorkspacePath | null) => {
    const normalized = normalizeMarkdownWorkspaceSelectionPath(path)
    if (selectionPathRef.current === normalized) return
    const requestId = selectionCommitRequestRef.current + 1
    selectionCommitRequestRef.current = requestId
    const applySelection = () => {
      if (selectionCommitRequestRef.current !== requestId) return
      pendingSelectionPathRef.current = normalized
      selectionPathRef.current = normalized
      setSelectionPath(normalized)
    }
    const pendingEditorCommit = commitActiveMarkdownBlockEditors()
    // A Canvas Run publishes into the active document before its serialized
    // Workspace FS and mirror writes settle. Preserve that owner at the same
    // boundary that already fences active block-editor commits.
    const pendingSourceWrites = settleWorkspaceSourceTextWrites()
    return Promise.allSettled([
      ...(pendingEditorCommit ? [pendingEditorCommit] : []),
      pendingSourceWrites,
    ]).then(applySelection)
  }, [])

  const entriesIndex = React.useMemo(() => buildWorkspaceEntriesIndex(args.entries), [args.entries])

  React.useEffect(() => {
    const nextSelectionPath = resolveInitialMarkdownWorkspaceSelectionPath({
      selectionPath: selectionPathRef.current,
      activePath: args.activePath,
      entriesIndex,
    })
    if (!nextSelectionPath) return
    setSelectionPathSafe(nextSelectionPath)
  }, [args.activePath, entriesIndex, setSelectionPathSafe])

  React.useEffect(() => {
    const nextSelectionPath = resolveInvalidatedMarkdownWorkspaceSelectionPath({
      selectionPath: selectionPathRef.current,
      activePath: args.activePath,
      entriesIndex,
      loading: args.loading,
    })
    if (typeof nextSelectionPath === 'undefined') return
    setSelectionPathSafe(nextSelectionPath)
  }, [args.activePath, args.loading, entriesIndex, selectionPath, setSelectionPathSafe])

  const {
    activeEntry,
    selectionEntry,
    activeEntryKind,
    activeEntryText,
    activeDocumentKey,
    activeDocumentSourceUrl,
    createParentPath,
  } = React.useMemo(
    () =>
      deriveMarkdownWorkspaceSelectionState({
        activePath: args.activePath,
        selectionPath,
        entriesIndex,
        sourcesByPath: args.sourcesByPath,
      }),
    [args.activePath, args.sourcesByPath, entriesIndex, selectionPath],
  )

  React.useEffect(() => {
    const nextActivePath = resolveActivePathFromWorkspaceFileSelection({
      selectionPath,
      activePath: args.activePath,
      entriesIndex,
      selectionEntryKind: selectionEntry?.kind ?? null,
      lastSetActivePath: args.lastSetActivePath,
    })
    if (!nextActivePath) return
    setActivePathSafe(nextActivePath)
  }, [args.activePath, args.lastSetActivePath, selectionEntry?.kind, selectionPath, setActivePathSafe])

  const previousActivePathRef = React.useRef<WorkspacePath | null>(args.activePath)
  const switchedActivePathRef = React.useRef<{ prev: WorkspacePath; next: WorkspacePath } | null>(null)
  React.useEffect(() => {
    const nextPath = args.activePath
    const prevPath = previousActivePathRef.current
    previousActivePathRef.current = nextPath
    if (nextPath && prevPath && prevPath !== nextPath) {
      switchedActivePathRef.current = { prev: prevPath, next: nextPath }
    }
    if (!nextPath || !prevPath || prevPath === nextPath || activeEntryKind === 'folder' || !args.activeRef.current) return
    const currentText = String(args.activeTextRef.current || '')
    if (!currentText) return
    const lastLoaded = args.lastLoadedRef.current
    if (lastLoaded?.path === nextPath && String(lastLoaded.text || '') === currentText) return
    args.setActiveTextProgrammatic('')
    args.setHighlightedLineRange(null)
    args.clearStatus()
  }, [
    activeEntryKind,
    args.activePath,
    args.activeRef,
    args.activeTextRef,
    args.clearStatus,
    args.lastLoadedRef,
    args.setActiveTextProgrammatic,
    args.setHighlightedLineRange,
  ])

  React.useEffect(() => {
    const switched = switchedActivePathRef.current
    if (!switched) return
    const nextPath = switched.next
    if (nextPath !== args.activePath) return
    if (activeEntryKind === 'folder') return
    let cancelled = false
    const run = async () => {
      const fs = await args.getFs()
      if (cancelled || switchedActivePathRef.current?.next !== nextPath || args.activePath !== nextPath) return
      const nextText = await readCachedWorkspaceSelectionResolvedTextForActivePath({
        activePath: nextPath,
        activeEntry,
        fs,
        storageFallbackByPath: storageFallbackByPathRef.current,
        preferPathResolvedText: true,
        cacheRef: resolvedTextCacheRef,
      })
      if (!shouldAcceptWorkspaceDocumentSelectionText({
        activePath: nextPath,
        activeEntryKind,
        activeDocumentKey,
        text: nextText,
      })) {
        return
      }
      if (cancelled || switchedActivePathRef.current?.next !== nextPath || args.activePath !== nextPath) return
      const currentText = String(args.activeTextRef.current || '')
      if (currentText !== nextText) {
        args.setActiveTextProgrammatic(nextText)
      }
      args.lastLoadedRef.current = { path: nextPath, text: nextText }
      args.patchWorkspaceEntryInlineText(nextPath, nextText)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [
    activeEntry,
    activeEntryKind,
    activeDocumentKey,
    args.activePath,
    args.activeTextRef,
    args.getFs,
    args.lastLoadedRef,
    args.patchWorkspaceEntryInlineText,
    args.setActiveTextProgrammatic,
  ])

  const readPendingSwitchNextPath = React.useCallback(
    () => switchedActivePathRef.current?.next || null,
    [],
  )
  const {
    applySelectedWorkspaceDocumentToCanvas,
    clearDocumentSwitchApplyRetry,
    documentSwitchApplyRetryTick,
    scheduleDocumentSwitchApplyRetry,
  } = useMarkdownWorkspaceDocumentSwitchApply({
    activePath: args.activePath,
    canonicalMarkdownText: args.markdownDocumentText,
    readPendingSwitchNextPath,
    setActiveMarkdownDocument: args.setActiveMarkdownDocument,
    prime: {
      activeEntryKind, activeDocumentKey, activeDocumentSourceUrl, inlineText: activeEntryText,
      updatedAtMs: activeEntry?.updatedAtMs, graphDataSource: args.graphDataSource,
      markdownDocumentName: args.markdownDocumentName, markdownDocumentText: args.markdownDocumentText,
      canvas2dRenderer: args.canvas2dRenderer,
    },
  })

  React.useEffect(() => {
    const switched = switchedActivePathRef.current
    if (!switched) return
    if (switched.next !== args.activePath) return
    if (activeEntryKind === 'folder') return
    if (!activeDocumentKey) return
    let cancelled = false
    void (async () => {
      const fs = await args.getFs()
      if (cancelled || switchedActivePathRef.current?.next !== switched.next || args.activePath !== switched.next) return
      const nextText = await readCachedWorkspaceSelectionResolvedTextForActivePath({
        activePath: switched.next,
        activeEntry,
        fs,
        storageFallbackByPath: storageFallbackByPathRef.current,
        preferPathResolvedText: true,
        cacheRef: resolvedTextCacheRef,
      })
      if (!shouldAcceptWorkspaceDocumentSelectionText({
        activePath: switched.next,
        activeEntryKind,
        activeDocumentKey,
        text: nextText,
      })) {
        return
      }
      if (cancelled || switchedActivePathRef.current?.next !== switched.next || args.activePath !== switched.next) return

      args.lastLoadedRef.current = { path: switched.next, text: nextText }
      args.patchWorkspaceEntryInlineText(switched.next, nextText)
      if (String(args.activeTextRef.current || '') !== nextText) {
        args.setActiveTextProgrammatic(nextText)
      }
      const applied = await applySelectedWorkspaceDocumentToCanvas({
        activeDocumentKey,
        text: nextText,
        sourceUrl: activeDocumentSourceUrl,
        updatedAtMs: activeEntry?.updatedAtMs,
        graphDataSource: args.graphDataSource,
        markdownDocumentName: args.markdownDocumentName,
        markdownDocumentText: args.markdownDocumentText,
        canvas2dRenderer: args.canvas2dRenderer,
      })
      if ((applied === 'applied' || applied === 'settled') && switchedActivePathRef.current?.next === switched.next) {
        switchedActivePathRef.current = null
        clearDocumentSwitchApplyRetry()
      } else if (applied === 'deferred' && switchedActivePathRef.current?.next === switched.next) {
        scheduleDocumentSwitchApplyRetry(switched.next)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    args.activePath,
    activeDocumentKey,
    activeDocumentSourceUrl,
    activeEntry,
    activeEntryKind,
    args.canvas2dRenderer,
    args.graphDataSource,
    args.getFs,
    args.lastLoadedRef,
    args.markdownDocumentName,
    args.markdownDocumentText,
    args.patchWorkspaceEntryInlineText,
    args.setActiveTextProgrammatic,
    documentSwitchApplyRetryTick,
    applySelectedWorkspaceDocumentToCanvas,
    clearDocumentSwitchApplyRetry,
    scheduleDocumentSwitchApplyRetry,
  ])

  React.useEffect(() => {
    const path = args.activePath
    if (!path || activeEntryKind === 'folder') return
    if (switchedActivePathRef.current?.next === path) return
    let cancelled = false
    const run = async () => {
      const fs = await args.getFs()
      if (cancelled || args.activePath !== path) return
      const nextText = await readCachedWorkspaceSelectionResolvedTextForActivePath({
        activePath: path,
        activeEntry,
        fs,
        storageFallbackByPath: storageFallbackByPathRef.current,
        preferPathResolvedText: true,
        cacheRef: resolvedTextCacheRef,
      })
      const syncDecision = resolveStableWorkspaceSelectionSyncDecision({
        activePath: path,
        activeEntryKind,
        activeDocumentKey,
        currentText: String(args.activeTextRef.current || ''),
        nextText,
        lastLoadedPath: args.lastLoadedRef.current?.path || null,
        userEditedActiveText: args.userEditedActiveTextRef.current === true,
        markdownDocumentName: args.markdownDocumentName,
        markdownDocumentText: args.markdownDocumentText,
        graphDataSource: args.graphDataSource,
        canvas2dRenderer: args.canvas2dRenderer,
      })
      if (!syncDecision.hydrateText && !syncDecision.applyToCanvas) return
      if (cancelled || args.activePath !== path) return
      if (syncDecision.hydrateText) {
        if (String(args.activeTextRef.current || '') !== nextText) {
          args.setActiveTextProgrammatic(nextText)
        }
        args.lastLoadedRef.current = { path, text: nextText }
        args.patchWorkspaceEntryInlineText(path, nextText)
      }
      if (syncDecision.applyToCanvas && activeDocumentKey) {
        await applySelectedWorkspaceDocumentToCanvas({
          activeDocumentKey,
          text: nextText,
          sourceUrl: activeDocumentSourceUrl,
          updatedAtMs: activeEntry?.updatedAtMs,
          graphDataSource: args.graphDataSource,
          markdownDocumentName: args.markdownDocumentName,
          markdownDocumentText: args.markdownDocumentText,
          canvas2dRenderer: args.canvas2dRenderer,
        })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [
    activeEntryKind,
    activeDocumentKey,
    activeDocumentSourceUrl,
    activeEntry,
    args.activePath,
    args.activeTextRef,
    args.canvas2dRenderer,
    args.graphDataSource,
    args.getFs,
    args.lastLoadedRef,
    args.markdownDocumentName,
    args.markdownDocumentText,
    args.patchWorkspaceEntryInlineText,
    args.setActiveTextProgrammatic,
    args.userEditedActiveTextRef,
    applySelectedWorkspaceDocumentToCanvas,
  ])

  useMarkdownEditorSsotSync({
    activeDocumentKey,
    activeDocumentSourceUrl,
    activeText: args.activeText,
    activeTextOwnedByActivePath: !!(args.activePath && args.lastLoadedRef.current?.path === args.activePath),
    canonicalMarkdownText: args.markdownDocumentText,
    setActiveMarkdownDocument: args.setActiveMarkdownDocument,
    paused: args.viewerInlineEditActive,
  })

  React.useEffect(() => {
    const writebackSync = resolveMarkdownWorkspaceSelectionWritebackSync({
      activePath: args.activePath,
      activeDocumentKey,
      markdownDocumentName: args.markdownDocumentName,
      markdownDocumentText: args.markdownDocumentText,
    })
    if (!writebackSync) return
    const nextText = writebackSync.nextText
    const active = String(args.activeTextRef.current || '')
    if (active === nextText) return
    const hasUnsavedUserEdit = !!(
      args.activePath &&
      resolveWorkspaceDirtyState({
        path: args.activePath,
        lastLoadedRef: args.lastLoadedRef,
        activeTextRef: args.activeTextRef,
        userEditedActiveTextRef: args.userEditedActiveTextRef,
      })
    )
    if (hasUnsavedUserEdit) return
    if (args.activePath) {
      commitMarkdownWorkspaceWriteback({
        path: args.activePath,
        text: nextText,
        lastLoadedRef: args.lastLoadedRef,
        patchWorkspaceEntryInlineText: args.patchWorkspaceEntryInlineText,
        setActiveTextProgrammatic: args.setActiveTextProgrammatic,
      })
    } else {
      args.setActiveTextProgrammatic(nextText)
    }
  }, [
    activeDocumentKey,
    args.activePath,
    args.activeTextRef,
    args.lastLoadedRef,
    args.markdownDocumentName,
    args.markdownDocumentText,
    args.patchWorkspaceEntryInlineText,
    args.setActiveTextProgrammatic,
    args.userEditedActiveTextRef,
  ])

  React.useEffect(() => {
    const path = args.activePath
    if (!path) return

    const prev = args.prevCollapsedRef.current
    const transition = resolveMarkdownWorkspaceSelectionCollapseTransition({
      path,
      prevCollapsed: prev,
      collapsed: args.effectiveBottomSurfaceCollapsed,
      activeText: args.activeText,
      collapsedSnapshot: args.collapsedSnapshotRef.current,
      lastLoaded: args.lastLoadedRef.current,
    })
    if (prev !== args.effectiveBottomSurfaceCollapsed) {
      args.prevCollapsedRef.current = args.effectiveBottomSurfaceCollapsed
    }

    if (transition.kind === 'capture-transition' || transition.kind === 'capture-collapsed') {
      args.collapsedSnapshotRef.current = transition.snapshot
      return
    }

    if (transition.kind !== 'restore-transition' && transition.kind !== 'restore-collapsed') return
    const restoredSelection = resolveMarkdownWorkspaceSelectionRestoreApply({
      text: transition.text,
      activeDocumentKey,
      activeDocumentSourceUrl,
    })
    args.setActiveText(restoredSelection.text)
    if (restoredSelection.restoredActiveDocumentArgs) {
        void applyActiveMarkdownDocumentPayload({
          setActiveMarkdownDocument: args.setActiveMarkdownDocument,
          ...restoredSelection.restoredActiveDocumentArgs,
        })
    }
  }, [
    activeDocumentKey,
    activeDocumentSourceUrl,
    args.activePath,
    args.activeText,
    args.collapsedSnapshotRef,
    args.effectiveBottomSurfaceCollapsed,
    args.lastLoadedRef,
    args.prevCollapsedRef,
    args.setActiveMarkdownDocument,
    args.setActiveText,
  ])

  React.useEffect(() => {
    if (args.effectiveBottomSurfaceCollapsed) return
    const path = args.activePath
    if (!path || String(args.activeText || '').trim()) return

    const lastText = readMarkdownWorkspaceRestoreTextForPath(args.lastLoadedRef.current, path)
    if (lastText) {
      const restoredSelection = resolveMarkdownWorkspaceSelectionRestoreApply({
        text: lastText,
        activeDocumentKey,
        activeDocumentSourceUrl,
      })
      args.setActiveText(restoredSelection.text)
      if (restoredSelection.restoredActiveDocumentArgs) {
          void applyActiveMarkdownDocumentPayload({
            setActiveMarkdownDocument: args.setActiveMarkdownDocument,
            ...restoredSelection.restoredActiveDocumentArgs,
          })
      }
      return
    }
  }, [
    activeDocumentKey,
    activeDocumentSourceUrl,
    args.activePath,
    args.activeText,
    args.effectiveBottomSurfaceCollapsed,
    args.lastLoadedRef,
    args.setActiveMarkdownDocument,
    args.setActiveText,
  ])

  React.useEffect(() => {
    if (!entriesIndex.byPath.size || args.loading) return
    const nextActivePath = resolveMarkdownWorkspaceBootstrapActivePath({
      entriesIndex,
      activePath: args.activePath,
      lastSetActivePath: args.lastSetActivePath,
      lastRequestedActivePath: args.lastRequestedActivePathRef.current,
    })
    if (!nextActivePath || nextActivePath === args.activePath) return
    setActivePathSafe(nextActivePath)
  }, [
    args.activePath,
    args.lastRequestedActivePathRef,
    args.lastSetActivePath,
    args.loading,
    entriesIndex,
    setActivePathSafe,
  ])

  React.useEffect(() => {
    const canonicalSelection = resolveMarkdownWorkspaceCanonicalSelection({
      activePath: args.activePath,
      selectionPath,
      entriesIndex,
    })
    if (!canonicalSelection) return
    setActivePathSafe(canonicalSelection.activePath)
    if (canonicalSelection.selectionPath) setSelectionPathSafe(canonicalSelection.selectionPath)
  }, [args.activePath, entriesIndex, selectionPath, setActivePathSafe, setSelectionPathSafe])

  React.useEffect(() => {
    const path = args.activePath
    if (!path || activeEntryKind !== 'folder' || !args.activeRef.current) return
    args.setActiveTextProgrammatic('')
    args.setHighlightedLineRange(null)
    args.clearStatus()
  }, [activeEntryKind, args.activePath, args.activeRef, args.clearStatus, args.setActiveTextProgrammatic, args.setHighlightedLineRange])

  return {
    selectionPath,
    setSelectionPathSafe,
    setActivePathSafe,
    activeEntry,
    selectionEntry,
    activeEntryKind,
    activeEntryText,
    activeDocumentKey,
    activeDocumentSourceUrl,
    createParentPath,
    selectionPathRef,
  }
}
