import React from 'react'
import { startPointerDrag } from 'grph-shared/dom/pointerDrag'
import { LS_KEYS } from '@/lib/config'
import { lsSetBool, lsSetInt } from '@/lib/persistence'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { resolveWorkspaceSourceIndexSnapshot } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { subscribeWorkspaceFsChanged } from '@/features/workspace-fs/workspaceFsEvents'
import { mergeWorkspaceEntriesIntoSourceFiles } from '@/features/workspace-fs/syncToSourceFiles'
import { buildWorkspaceEntriesSemanticKey } from '@/features/workspace-fs/workspaceEntriesSemanticKey'
import {
  projectWorkspaceEntriesToSourceFilesExplorer,
  resolveWorkspaceSourceRootPaths,
} from '@/features/workspace-fs/workspaceSourceRoots'
import { buildMaterializedWorkspaceForceIncludePaths, hydrateWorkspaceEntriesInlineText } from '@/features/source-files/sourceFilesRuntimeShared'
import {
  readWorkspaceAutoRefreshEnabledSetting,
  readWorkspaceSeedSyncEnabledSetting,
  readWorkspaceSeedSyncIdleMaxMsSetting,
  readWorkspaceSeedSyncPollMsSetting,
  readWorkspaceSourceFilesDocsOnlySetting,
  subscribeWorkspaceStoreSyncSettingsChanged,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { computeWorkspaceSeedSyncNextDelayMs } from '@/lib/workspace/workspaceSeedSyncBackoff'
import {
  beginWorkspaceSeedSyncTask,
  subscribeWorkspaceSeedSyncResumed,
} from '@/lib/workspace/workspaceSeedSyncRuntime'
import { persistMarkdownExplorerChromeState } from '@/features/markdown/ui/markdownExplorerChromePersistence'
import { persistMarkdownExplorerModePreferences } from '@/features/markdown/ui/markdownExplorerModePreferencesPersistence'
import { persistMarkdownSourceFolderPaths } from '@/features/markdown/ui/markdownSourceFilesPersistence'
import { persistMarkdownExplorerViewPreferences } from '@/features/markdown/ui/markdownExplorerViewPreferencesPersistence'
import { persistMarkdownExplorerSectionCollapseState } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { useGraphStore } from '@/hooks/useGraphStore'
import { SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from '@/features/markdown-workspace/markdownWorkspaceUtils'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import type { WorkspaceRefreshSnapshot } from '@/features/markdown-workspace/useWorkspaceFileActions/types'
import {
  cancelMarkdownWorkspacePrefsSync,
  cancelMarkdownWorkspaceRefreshSync,
  scheduleMarkdownWorkspacePrefsSync,
  scheduleMarkdownWorkspaceRefreshSync,
} from './markdownWorkspaceRuntime.stateSync'
import {
  areWorkspaceEntriesEqual,
  areWorkspaceSourcesEqual,
  buildFailedWorkspaceRefreshSnapshot,
  buildWorkspaceRefreshSnapshot,
  pruneWorkspaceEntriesForInlineSnapshot,
  type FolderModeContract,
} from './markdownWorkspaceRuntime.shared'
import type { MarkdownWorkspaceRuntimeInteractionStatusBindings } from './markdownWorkspaceRuntimeStatus'
import { applyMarkdownWorkspaceErrorStatus, applyMarkdownWorkspaceInfoStatus } from './markdownWorkspaceStatusTransitions'
import {
  buildWorkspaceEntriesIndex,
} from './workspaceEntriesIndex'
import {
  resolveWorkspaceFolderContractDocumentPath,
  resolveWorkspaceFolderContractTargetPath,
} from './workspaceFolderContractTarget'
import { readWorkspaceExplorerReadOnlySnapshot } from './workspaceExplorerReadOnlySnapshot'

const hasNonWorkspaceSourceFile = (sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']): boolean => {
  const list = Array.isArray(sourceFiles) ? sourceFiles : []
  return list.some(file => {
    if (!file) return false
    const sourcePath = String(file.source?.path || '')
    return !sourcePath.startsWith('workspace:')
  })
}

export function useMarkdownWorkspaceExplorerState(args: MarkdownWorkspaceRuntimeInteractionStatusBindings & {
  active: boolean
  activePathRef: React.MutableRefObject<WorkspacePath | null>
  activeTextRef: React.MutableRefObject<string>
  viewerInlineEditActiveRef: React.MutableRefObject<boolean>
  lastLoadedRef: React.MutableRefObject<{ path: WorkspacePath; text: string } | null>
  entries: WorkspaceEntry[]
  setEntries: React.Dispatch<React.SetStateAction<WorkspaceEntry[]>>
  setSourcesByPath: React.Dispatch<React.SetStateAction<WorkspaceSourceIndex>>
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setLoadError: React.Dispatch<React.SetStateAction<string>>
  sidebarWidthPx: number
  explorerOpen: boolean
  sourceFilesCollapsed: boolean
  tocCollapsed: boolean
  backlinksCollapsed: boolean
  markdownWordWrap: boolean
  markdownTextHighlight: boolean
  folderModeContract: FolderModeContract
  layoutMode: MarkdownWorkspaceLayoutMode
  expandedPaths: Set<string>
  resizeHandleEl: HTMLHRElement | null
  setSidebarWidthPx: React.Dispatch<React.SetStateAction<number>>
  search: string
}) {
  const workspaceFsRef = React.useRef<Awaited<ReturnType<typeof getWorkspaceFs>> | null>(null)
  const refreshInFlightRef = React.useRef(false)
  const refreshQueuedRef = React.useRef(false)
  const workspaceRefreshDeferredRef = React.useRef(false)
  const seedSyncInFlightRef = React.useRef(false)
  const workspaceSeedSyncSignatureRef = React.useRef('')
  const workspaceRefreshSemanticKeyRef = React.useRef('')
  const [workspaceSyncSettingsRev, setWorkspaceSyncSettingsRev] = React.useState(0)
  const chatLocalStorageRootPath = useGraphStore(state => state.chatLocalStorageRootPath)
  const entriesIndex = React.useMemo(() => buildWorkspaceEntriesIndex(args.entries), [args.entries])

  React.useEffect(() => {
    return subscribeWorkspaceStoreSyncSettingsChanged(() => {
      setWorkspaceSyncSettingsRev(prev => prev + 1)
    })
  }, [])

  const [workspaceAutoRefreshEnabled, setWorkspaceAutoRefreshEnabled] = React.useState(() => readWorkspaceAutoRefreshEnabledSetting())
  const [workspaceSeedSyncEnabled, setWorkspaceSeedSyncEnabled] = React.useState(() => readWorkspaceSeedSyncEnabledSetting())
  const [workspaceSeedSyncPollMs, setWorkspaceSeedSyncPollMs] = React.useState(() => readWorkspaceSeedSyncPollMsSetting())
  const [workspaceSeedSyncIdleMaxMs, setWorkspaceSeedSyncIdleMaxMs] = React.useState(() => readWorkspaceSeedSyncIdleMaxMsSetting())

  React.useEffect(() => {
    setWorkspaceAutoRefreshEnabled(readWorkspaceAutoRefreshEnabledSetting())
    setWorkspaceSeedSyncEnabled(readWorkspaceSeedSyncEnabledSetting())
    setWorkspaceSeedSyncPollMs(readWorkspaceSeedSyncPollMsSetting())
    setWorkspaceSeedSyncIdleMaxMs(readWorkspaceSeedSyncIdleMaxMsSetting())
  }, [workspaceSyncSettingsRev])

  const getFs = React.useCallback(async () => {
    const existing = workspaceFsRef.current
    if (existing) return existing
    const fs = await getWorkspaceFs()
    workspaceFsRef.current = fs
    return fs
  }, [])

  const runtimeRef = React.useRef(args)
  runtimeRef.current = args

  const scheduleApplyComposedFromSourceFiles = React.useCallback(async () => {
    try {
      const mod = (await import('@/features/source-files/applyComposedGraphFromSourceFiles')) as typeof import('@/features/source-files/applyComposedGraphFromSourceFiles')
      mod.scheduleApplyComposedGraphFromSourceFiles()
    } catch {
      void 0
    }
  }, [])

  const refreshOnce = React.useCallback(async (opts?: { silent?: boolean }): Promise<WorkspaceRefreshSnapshot> => {
    const runtime = runtimeRef.current
    const silent = !!opts?.silent
    const finishSeedSyncTask = beginWorkspaceSeedSyncTask()
    if (!finishSeedSyncTask) {
      workspaceRefreshDeferredRef.current = true
      try {
        const fs = await getFs()
        const snapshot = await readWorkspaceExplorerReadOnlySnapshot({
          fs,
          activePath: runtime.activePathRef.current,
        })
        const currentRuntime = runtimeRef.current
        currentRuntime.setEntries(prev => (
          areWorkspaceEntriesEqual(prev, snapshot.entries) ? prev : snapshot.entries
        ))
        currentRuntime.setSourcesByPath(prev => (
          areWorkspaceSourcesEqual(prev, snapshot.sourcesByPath) ? prev : snapshot.sourcesByPath
        ))
        currentRuntime.setLoading(false)
        currentRuntime.setLoadError('')
        return buildWorkspaceRefreshSnapshot(snapshot)
      } catch (error) {
        const currentRuntime = runtimeRef.current
        currentRuntime.setLoading(false)
        currentRuntime.setLoadError(String((error as { message?: unknown })?.message ?? error))
        return buildWorkspaceRefreshSnapshot({ entries: currentRuntime.entries })
      }
    }
    workspaceRefreshDeferredRef.current = false
    if (!silent) runtime.setStatusProgress('Refreshing')
    if (!silent) {
      runtime.setLoading(true)
      runtime.setLoadError('')
    }
    try {
      const currentActivePath = runtime.activePathRef.current
      const fs = await getFs()
      await fs.ensureSeed()
      const list = await fs.listEntries()
      const hydratedList = await hydrateWorkspaceEntriesInlineText({
        fs,
        workspaceEntries: list,
        forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
          activePathOverride: currentActivePath,
        }),
      })
      const pruned = pruneWorkspaceEntriesForInlineSnapshot(hydratedList)
      const semanticKey = buildWorkspaceEntriesSemanticKey({
        entries: pruned,
        docsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
        workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
          chatLocalStorageRootPath: useGraphStore.getState().chatLocalStorageRootPath,
        }),
      })
      if (silent && semanticKey === workspaceRefreshSemanticKeyRef.current) {
        return buildWorkspaceRefreshSnapshot({
          entries: runtime.entries,
          sourcesByPath: resolveWorkspaceSourceIndexSnapshot(undefined),
        })
      }
      workspaceRefreshSemanticKeyRef.current = semanticKey
      workspaceSeedSyncSignatureRef.current = semanticKey
      runtime.setEntries(prev => (areWorkspaceEntriesEqual(prev, pruned) ? prev : pruned))
      const sources = resolveWorkspaceSourceIndexSnapshot(undefined)
      runtime.setSourcesByPath(prev => (areWorkspaceSourcesEqual(prev, sources) ? prev : sources))
      try {
        const store = useGraphStore.getState()
        const hasNonWorkspace = hasNonWorkspaceSourceFile(store.sourceFiles)
        const merged = mergeWorkspaceEntriesIntoSourceFiles({
          existing: store.sourceFiles,
          workspaceEntries: pruned,
          sourcesByPath: sources,
          forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
            activePathOverride: currentActivePath,
          }),
          workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
          workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
            chatLocalStorageRootPath: store.chatLocalStorageRootPath,
          }),
        })
        if (merged !== store.sourceFiles) {
          store.setSourceFiles(merged)
          if (hasNonWorkspace) {
            await scheduleApplyComposedFromSourceFiles()
          }
        }
      } catch {
        void 0
      }
      if (!silent) runtime.setLoading(false)
      if (!silent) {
        applyMarkdownWorkspaceInfoStatus({
          setStatusInfo: runtime.setStatusInfo,
          label: 'Ready',
        })
      }
      return buildWorkspaceRefreshSnapshot({
        entries: pruned,
        sourcesByPath: sources,
      })
    } catch (e) {
      const currentRuntime = runtimeRef.current
      if (!silent) {
        currentRuntime.setLoading(false)
        currentRuntime.setLoadError(String((e as { message?: unknown })?.message ?? e))
        applyMarkdownWorkspaceErrorStatus({
          setStatusError: currentRuntime.setStatusError,
          prefix: 'Refresh failed',
          error: e,
          fallbackMessage: 'Request failed',
          includeDetail: false,
        })
      }
      return buildFailedWorkspaceRefreshSnapshot()
    } finally {
      finishSeedSyncTask()
    }
  }, [getFs, scheduleApplyComposedFromSourceFiles])

  const refresh = React.useCallback(async (opts?: { silent?: boolean }): Promise<WorkspaceRefreshSnapshot> => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return buildWorkspaceRefreshSnapshot({
        entries: runtimeRef.current.entries,
      })
    }
    refreshInFlightRef.current = true
    let snapshot: WorkspaceRefreshSnapshot = buildWorkspaceRefreshSnapshot({
      entries: runtimeRef.current.entries,
    })
    try {
      do {
        refreshQueuedRef.current = false
        snapshot = await refreshOnce({ silent: !!opts?.silent })
      } while (refreshQueuedRef.current)
      return snapshot
    } finally {
      refreshInFlightRef.current = false
    }
  }, [refreshOnce])

  React.useEffect(() => {
    return subscribeWorkspaceSeedSyncResumed(() => {
      if (!workspaceRefreshDeferredRef.current) return
      if (!runtimeRef.current.active) return
      workspaceRefreshDeferredRef.current = false
      void refresh({ silent: true })
    })
  }, [refresh])

  React.useEffect(() => {
    if (!args.active || !workspaceRefreshDeferredRef.current) return
    workspaceRefreshDeferredRef.current = false
    void refresh({ silent: true })
  }, [args.active, refresh])

  React.useEffect(() => {
    if (!args.active || !workspaceAutoRefreshEnabled) return
    const unsubscribe = subscribeWorkspaceFsChanged(detail => {
      const runtime = runtimeRef.current
      if (runtime.viewerInlineEditActiveRef.current) return
      const activePath = runtime.activePathRef.current
      const last = runtime.lastLoadedRef.current
      const isDirty = !!(activePath && last?.path === activePath && last.text !== runtime.activeTextRef.current)
      const changedPath = typeof detail?.path === 'string' && detail.path ? detail.path : null
      const operation = typeof detail?.op === 'string' ? detail.op : ''
      if (operation === 'ensureSeed') return
      if (isDirty && (!changedPath || changedPath === activePath)) return
      if (operation === 'writeFileText' && activePath && changedPath && changedPath !== activePath) return
      scheduleMarkdownWorkspaceRefreshSync(() => {
        void refresh({ silent: true })
      }, {
        activePath,
        changedPath,
        operation,
        isDirty,
      })
    })
    return () => {
      cancelMarkdownWorkspaceRefreshSync()
      unsubscribe()
    }
  }, [args.active, refresh, workspaceAutoRefreshEnabled])

  React.useEffect(() => {
    if (!args.active || !workspaceSeedSyncEnabled) return
    if (typeof window === 'undefined') return
    let stopped = false
    let timer: number | null = null
    let idleStreak = 0
    const scheduleNextSeedSync = (
      changed: boolean,
      ensureSeedTick: () => Promise<void>,
    ) => {
      const docsOnly = readWorkspaceSourceFilesDocsOnlySetting()
      const next = computeWorkspaceSeedSyncNextDelayMs({
        basePollMs: workspaceSeedSyncPollMs,
        idleMaxMs: workspaceSeedSyncIdleMaxMs,
        docsOnly,
        changed,
        idleStreak,
      })
      idleStreak = next.nextIdleStreak
      if (stopped) return
      timer = window.setTimeout(() => {
        timer = null
        void ensureSeedTick()
      }, next.nextDelayMs)
    }
    const ensureSeedTick = async () => {
      if (stopped || seedSyncInFlightRef.current) return
      const runtime = runtimeRef.current
      if (runtime.viewerInlineEditActiveRef.current) return
      const finishSeedSyncTask = beginWorkspaceSeedSyncTask()
      if (!finishSeedSyncTask) {
        scheduleNextSeedSync(false, ensureSeedTick)
        return
      }
      seedSyncInFlightRef.current = true
      let effectiveChanged = false
      try {
        const fs = await getFs()
        const changed = await fs.ensureSeed()
        if (changed) {
          const activePath = runtime.activePathRef.current
          const list = await fs.listEntries()
          const hydratedList = await hydrateWorkspaceEntriesInlineText({
            fs,
            workspaceEntries: list,
            forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
              activePathOverride: activePath,
            }),
          })
          const pruned = pruneWorkspaceEntriesForInlineSnapshot(hydratedList)
          const docsOnly = readWorkspaceSourceFilesDocsOnlySetting()
          const signature = buildWorkspaceEntriesSemanticKey({
            entries: pruned,
            docsOnly,
            workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
              chatLocalStorageRootPath: useGraphStore.getState().chatLocalStorageRootPath,
            }),
          })
          if (signature !== workspaceSeedSyncSignatureRef.current) {
            workspaceSeedSyncSignatureRef.current = signature
            effectiveChanged = true
          }
          const last = runtime.lastLoadedRef.current
          const isDirty = !!(activePath && last?.path === activePath && last.text !== runtime.activeTextRef.current)
          if (!isDirty && workspaceAutoRefreshEnabled && effectiveChanged) {
            scheduleMarkdownWorkspaceRefreshSync(() => {
              void refresh({ silent: true })
            }, {
              activePath,
              changedPath: null,
              operation: 'seedSyncChanged',
              isDirty: false,
            })
          }
        }
      } catch {
        void 0
      } finally {
        seedSyncInFlightRef.current = false
        finishSeedSyncTask()
        scheduleNextSeedSync(effectiveChanged, ensureSeedTick)
      }
    }
    const onWake = () => {
      if (document.visibilityState === 'hidden') return
      idleStreak = 0
      if (timer != null) {
        window.clearTimeout(timer)
        timer = null
      }
      void ensureSeedTick()
    }
    void ensureSeedTick()
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      stopped = true
      if (timer != null) window.clearTimeout(timer)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [args.active, getFs, refresh, workspaceAutoRefreshEnabled, workspaceSeedSyncEnabled, workspaceSeedSyncPollMs, workspaceSeedSyncIdleMaxMs])

  const persistWorkspacePrefsPendingRef = React.useRef<{
    sidebarWidthPx: number
    explorerOpen: boolean
    sourceFilesCollapsed: boolean
    tocCollapsed: boolean
    backlinksCollapsed: boolean
    markdownWordWrap: boolean
    markdownTextHighlight: boolean
    folderModeContract: FolderModeContract
    layoutMode: MarkdownWorkspaceLayoutMode
    expandedPaths: string[]
  } | null>(null)

  React.useEffect(() => {
    persistWorkspacePrefsPendingRef.current = {
      sidebarWidthPx: args.sidebarWidthPx,
      explorerOpen: args.explorerOpen,
      sourceFilesCollapsed: args.sourceFilesCollapsed,
      tocCollapsed: args.tocCollapsed,
      backlinksCollapsed: args.backlinksCollapsed,
      markdownWordWrap: args.markdownWordWrap,
      markdownTextHighlight: args.markdownTextHighlight,
      folderModeContract: args.folderModeContract,
      layoutMode: args.layoutMode,
      expandedPaths: [...args.expandedPaths],
    }
    scheduleMarkdownWorkspacePrefsSync(() => {
      const pending = persistWorkspacePrefsPendingRef.current
      if (!pending) return
      persistMarkdownExplorerChromeState(
        {
          sidebarWidthPx: pending.sidebarWidthPx,
          explorerOpen: pending.explorerOpen,
        },
        {
          minWidthPx: SIDEBAR_MIN_PX,
          maxWidthPx: SIDEBAR_MAX_PX,
          defaultWidthPx: pending.sidebarWidthPx,
        },
      )
      persistMarkdownExplorerSectionCollapseState({
        sourceFilesCollapsed: pending.sourceFilesCollapsed,
        outlineCollapsed: pending.tocCollapsed,
        backlinksCollapsed: pending.backlinksCollapsed,
      })
      persistMarkdownExplorerViewPreferences({
        markdownWordWrap: pending.markdownWordWrap,
        markdownTextHighlight: pending.markdownTextHighlight,
      })
      persistMarkdownExplorerModePreferences({
        folderModeContract: pending.folderModeContract,
        layoutMode: pending.layoutMode,
      })
      persistMarkdownSourceFolderPaths(pending.expandedPaths)
    }, {
      sidebarWidthPx: args.sidebarWidthPx,
      explorerOpen: args.explorerOpen,
      sourceFilesCollapsed: args.sourceFilesCollapsed,
      tocCollapsed: args.tocCollapsed,
      backlinksCollapsed: args.backlinksCollapsed,
      markdownWordWrap: args.markdownWordWrap,
      markdownTextHighlight: args.markdownTextHighlight,
      folderModeContract: args.folderModeContract as unknown as Record<string, unknown>,
      layoutMode: String(args.layoutMode || ''),
      expandedPaths: args.expandedPaths,
    })
    return () => {
      cancelMarkdownWorkspacePrefsSync()
    }
  }, [
    args.backlinksCollapsed,
    args.expandedPaths,
    args.explorerOpen,
    args.folderModeContract,
    args.layoutMode,
    args.markdownTextHighlight,
    args.markdownWordWrap,
    args.sidebarWidthPx,
    args.sourceFilesCollapsed,
    args.tocCollapsed,
  ])

  const sidebarWidthPxRef = React.useRef(args.sidebarWidthPx)
  React.useEffect(() => {
    sidebarWidthPxRef.current = args.sidebarWidthPx
  }, [args.sidebarWidthPx])

  const resizeHandleEl = args.resizeHandleEl
  const setSidebarWidthPx = args.setSidebarWidthPx
  React.useEffect(() => {
    const el = resizeHandleEl
    if (!el) return
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== undefined && ev.button !== 0) return
      const startX = ev.clientX
      const startWidth = sidebarWidthPxRef.current
      let pending = startWidth
      startPointerDrag({
        ev,
        cursor: 'col-resize',
        shouldStart: down => (down.button === undefined || down.button === 0),
        onMove: mv => {
          const dx = mv.clientX - startX
          const next = Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, Math.round(startWidth + dx)))
          pending = next
          setSidebarWidthPx(next)
        },
        onEnd: () => setSidebarWidthPx(pending),
        onCancel: () => setSidebarWidthPx(pending),
      })
    }
    el.addEventListener('pointerdown', onDown)
    return () => el.removeEventListener('pointerdown', onDown)
  }, [resizeHandleEl, setSidebarWidthPx])

  const sourceFilesExplorerEntries = React.useMemo(() => {
    return projectWorkspaceEntriesToSourceFilesExplorer(
      args.entries,
      resolveWorkspaceSourceRootPaths({ chatLocalStorageRootPath }),
    )
  }, [args.entries, chatLocalStorageRootPath, workspaceSyncSettingsRev])

  const filteredEntries = React.useMemo(() => {
    const q = String(args.search || '').trim().toLowerCase()
    if (!q) return sourceFilesExplorerEntries
    const searchText = q.length >= 3
    const keepPaths = new Set<string>()
    for (const entry of sourceFilesExplorerEntries) {
      if (entry.kind !== 'file') continue
      const nameHit = String(entry.name || '').toLowerCase().includes(q)
      if (nameHit) {
        keepPaths.add(entry.path)
        continue
      }
      if (!searchText) continue
      const rawText = typeof entry.text === 'string' ? entry.text : ''
      if (!rawText || rawText.length > 250_000) continue
      if (rawText.toLowerCase().includes(q)) keepPaths.add(entry.path)
    }
    const result: WorkspaceEntry[] = []
    for (const entry of sourceFilesExplorerEntries) {
      if (entry.kind === 'folder' || keepPaths.has(entry.path)) result.push(entry)
    }
    return result
  }, [args.search, sourceFilesExplorerEntries])

  const resolveFolderContractDocPath = React.useCallback(
    (folderPath: WorkspacePath, mode: FolderModeContract): WorkspacePath => {
      return resolveWorkspaceFolderContractDocumentPath(folderPath, mode)
    },
    [],
  )

  const pickFolderContractTargetPath = React.useCallback(
    (folderPath: WorkspacePath, preferredMode: FolderModeContract): WorkspacePath | null => {
      return resolveWorkspaceFolderContractTargetPath({
        entriesIndex,
        folderPath,
        preferredMode,
      })
    },
    [entriesIndex],
  )

  return {
    getFs,
    refresh,
    sourceFilesExplorerEntries,
    filteredEntries,
    resolveFolderContractDocPath,
    pickFolderContractTargetPath,
  }
}
