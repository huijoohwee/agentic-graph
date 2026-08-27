import { GraphData } from '@/lib/graph/types';
import type { GraphState, RecentFileEntry, SourceFile } from '@/hooks/store/types'
import type { GraphFieldSettingsById } from '@/features/graph-fields/graphFields'
import type { StoreApi } from 'zustand';
import { withGraphDataRevision } from './graphDataSliceUtils'
import { deepClone } from '@/lib/data/deepClone'
import { debounce } from '@/lib/async/debounce'
import { persistGraphDataToLocalStorage } from './graphDataPersistence'
import { hashArrayOfObjectsSignature, hashRecordSignature, hashSignatureParts } from '@/lib/hash/signature'
import {
  inferVersionHistorySource,
  VERSION_HISTORY_MAX_ENTRIES,
  type VersionHistoryEntry,
} from '@/features/history/versionHistoryTypes'
import { writeActiveMarkdownDocumentTextIfPresent } from './graph-data-slice/graphDataFrontmatterFlowSync'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

const HISTORY_COMMITTER_KEY = '__AG_HISTORY_COMMITTER__'

export const cancelScheduledHistoryCommit = (): void => {
  try {
    const global = globalThis as unknown as Record<string, unknown>
    const state = global[HISTORY_COMMITTER_KEY] as { fn?: { cancel?: () => void } } | undefined
    state?.fn?.cancel?.()
  } catch {
    void 0
  }
}

const readActiveSourceFileSnapshot = (
  sourceFiles: readonly SourceFile[],
  markdownDocumentName: string | null | undefined,
): SourceFile | null => {
  const documentName = String(markdownDocumentName || '').trim().replace(/^\/+/, '')
  if (!documentName) return null
  const match = sourceFiles.find(file => {
    const sourcePath = String(file.source?.path || '').trim().replace(/^\/+/, '')
    return sourcePath === documentName || String(file.name || '').trim() === documentName
  })
  return match ? deepClone(match) as SourceFile : null
}

const restoreActiveSourceFileSnapshot = (
  sourceFiles: readonly SourceFile[],
  snapshot: SourceFile | null,
): SourceFile[] => {
  if (!snapshot) return sourceFiles.slice()
  const index = sourceFiles.findIndex(file => file.id === snapshot.id)
  if (index < 0) return [...sourceFiles, deepClone(snapshot) as SourceFile]
  return sourceFiles.map((file, fileIndex) => fileIndex === index ? deepClone(snapshot) as SourceFile : file)
}

const getHistorySnapshotSignature = (
  graphData: GraphData | null,
  graphFieldSettingsById: GraphFieldSettingsById | null | undefined,
  markdownDocumentName: string | null | undefined,
  markdownDocumentText: string | null | undefined,
  activeSourceFileSnapshot: SourceFile | null | undefined,
): string => {
  const safeGraph = graphData || { nodes: [], edges: [], metadata: null }
  return [
    `nodes:${hashArrayOfObjectsSignature(safeGraph.nodes || [], { maxItems: 80, maxKeysPerItem: 8 })}`,
    `edges:${hashArrayOfObjectsSignature(safeGraph.edges || [], { maxItems: 80, maxKeysPerItem: 8 })}`,
    `meta:${hashRecordSignature(safeGraph.metadata || {}, { maxEntries: 40 })}`,
    `fields:${hashRecordSignature(graphFieldSettingsById || {}, { maxEntries: 80 })}`,
    `document:${hashSignatureParts([markdownDocumentName, markdownDocumentText])}`,
    `source:${hashSignatureParts(activeSourceFileSnapshot
      ? [activeSourceFileSnapshot.id, activeSourceFileSnapshot.name, activeSourceFileSnapshot.text]
      : [])}`,
  ].join('|')
}

const buildHistoryEntry = (args: {
  label: string
  timestamp: number
  graphData: GraphData
  graphFieldSettingsById: GraphFieldSettingsById
  markdownDocumentName: string | null
  markdownDocumentText: string | null
  activeSourceFileSnapshot: SourceFile | null
  parentId: string | null
}): VersionHistoryEntry => {
  const contentSignature = getHistorySnapshotSignature(args.graphData, args.graphFieldSettingsById, args.markdownDocumentName, args.markdownDocumentText, args.activeSourceFileSnapshot)
  return {
    id: `h-${args.timestamp.toString(36)}-${contentSignature.slice(0, 8)}`,
    parentId: args.parentId,
    label: args.label,
    timestamp: args.timestamp,
    source: inferVersionHistorySource(args.label),
    contentSignature,
    graphData: args.graphData,
    graphFieldSettingsById: args.graphFieldSettingsById,
    markdownDocumentName: args.markdownDocumentName,
    markdownDocumentText: args.markdownDocumentText,
    activeSourceFileSnapshot: args.activeSourceFileSnapshot,
  }
}

const restoreHistoryEntry = (set: SetGraph, get: GetGraph, entry: VersionHistoryEntry, historyIndex: number): void => {
  const graphCopy = deepClone(entry.graphData) as GraphData
  const fieldSettingsCopy = deepClone(entry.graphFieldSettingsById || {}) as GraphFieldSettingsById
  const sourceFilesCopy = restoreActiveSourceFileSnapshot(get().sourceFiles || [], entry.activeSourceFileSnapshot)
  const nextRevision = (get().graphDataRevision || 0) + 1
  set(state => ({
    graphData: withGraphDataRevision(graphCopy, nextRevision),
    graphDataRevision: nextRevision,
    graphFieldSettingsById: fieldSettingsCopy,
    historyIndex,
    historyRestoreRevision: (state.historyRestoreRevision || 0) + 1,
    markdownDocumentName: entry.markdownDocumentName ?? null,
    markdownDocumentText: entry.markdownDocumentText ?? null,
    markdownDocumentApplyRevision: (state.markdownDocumentApplyRevision || 0) + 1,
    markdownTokens: null,
    markdownTokensPath: null,
    markdownTokensKey: null,
    markdownTokensMeta: null,
    markdownTokensStartLineOffset: null,
    sourceFiles: sourceFilesCopy,
    graphContentRevision: (state.graphContentRevision || 0) + 1,
    docLocationRevision: (state.docLocationRevision || 0) + 1,
  }))
  try {
    get().resyncGraphFieldsFromGraphData?.()
  } catch {
    void 0
  }
  try {
    const persisted = get().graphData
    if (persisted) persistGraphDataToLocalStorage(persisted)
  } catch {
    void 0
  }
  const restoredText = entry.markdownDocumentText ?? entry.activeSourceFileSnapshot?.text ?? null
  if (restoredText != null) {
    const restoredState = get()
    void writeActiveMarkdownDocumentTextIfPresent({
      state: restoredState,
      sourceFiles: restoredState.sourceFiles || [],
      text: restoredText,
      label: `History restore: ${entry.label}`,
    })
  }
}

const shouldSkipHistoryCommit = (history: VersionHistoryEntry[], nextSignature: string): boolean => {
  const last = history.length > 0 ? history[history.length - 1] : null
  return !!last && last.contentSignature === nextSignature
}

const appendBoundedHistoryEntry = (
  history: VersionHistoryEntry[],
  entry: VersionHistoryEntry,
): VersionHistoryEntry[] => {
  const appended = [...history, entry]
  if (appended.length <= VERSION_HISTORY_MAX_ENTRIES) return appended
  const bounded = appended.slice(-VERSION_HISTORY_MAX_ENTRIES)
  return bounded.map((item, index) => index === 0 ? { ...item, parentId: null } : item)
}

export const createHistorySlice = (set: SetGraph, get: GetGraph) => ({
  
  history: [] as VersionHistoryEntry[],
  historyIndex: -1,
  historyRestoreRevision: 0,
  recentFiles: [] as RecentFileEntry[],
  historyDebounceMs: 500,

  

  addRecentFile: (entry: Omit<RecentFileEntry, 'id' | 'timestamp'>) => {
    const { recentFiles } = get()
    const newEntry: RecentFileEntry = {
      ...entry,
      id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    }
    const filtered = recentFiles.filter(f => {
      if (entry.path && f.path === entry.path) return false
      if (entry.url && f.url === entry.url) return false
      if (!entry.path && !entry.url && f.name === entry.name) return false
      return true
    })
    set({ recentFiles: [newEntry, ...filtered].slice(0, 50) })
  },

  addHistory: (label: string = 'Snapshot') => {
    const { graphData, graphFieldSettingsById, history, historyIndex, markdownDocumentName, markdownDocumentText, sourceFiles } = get();
    if (!graphData) return;
    const activeSourceFileSnapshot = readActiveSourceFileSnapshot(sourceFiles || [], markdownDocumentName)
    const nextSignature = getHistorySnapshotSignature(graphData, graphFieldSettingsById, markdownDocumentName, markdownDocumentText, activeSourceFileSnapshot)
    const trimmed = history.slice(0, historyIndex + 1);
    if (shouldSkipHistoryCommit(trimmed, nextSignature)) return
    const graphCopy: GraphData = deepClone(graphData)
    const fieldSettingsCopy: GraphFieldSettingsById = deepClone(graphFieldSettingsById || {})
    const entry = buildHistoryEntry({
      label,
      timestamp: Date.now(),
      graphData: graphCopy,
      graphFieldSettingsById: fieldSettingsCopy,
      markdownDocumentName,
      markdownDocumentText,
      activeSourceFileSnapshot,
      parentId: trimmed[trimmed.length - 1]?.id || null,
    })
    const nextHistory = appendBoundedHistoryEntry(trimmed, entry)
    set({ history: nextHistory, historyIndex: nextHistory.length - 1 });
  },

  restoreHistory: (index: number) => {
    const { history } = get();
    const entry = history[index];
    if (!entry) return;
    restoreHistoryEntry(set, get, entry, index)
  },

  undoHistory: () => {
    const { historyIndex, history } = get();
    const nextIndex = historyIndex - 1;
    if (nextIndex < 0) return;
    const entry = history[nextIndex];
    if (!entry) return;
    restoreHistoryEntry(set, get, entry, nextIndex)
  },

  redoHistory: () => {
    const { historyIndex, history } = get();
    const nextIndex = historyIndex + 1;
    if (nextIndex >= history.length) return;
    const entry = history[nextIndex];
    if (!entry) return;
    restoreHistoryEntry(set, get, entry, nextIndex)
  },

  scheduleHistory: (label: string) => {
    const global = globalThis as unknown as Record<string, unknown>
    type Committer = ((label: string) => void) & { cancel: () => void }
    const state = (global[HISTORY_COMMITTER_KEY] && typeof global[HISTORY_COMMITTER_KEY] === 'object')
      ? (global[HISTORY_COMMITTER_KEY] as { waitMs: number; fn: Committer })
      : null
    const waitMs = Math.max(0, Math.floor(get().historyDebounceMs || 0))
    const fn: Committer = (() => {
      if (state && state.waitMs === waitMs) return state.fn
      try {
        state?.fn?.cancel?.()
      } catch {
        void 0
      }
      const next = debounce((l: string) => {
        const { graphData, graphFieldSettingsById, history, historyIndex, markdownDocumentName, markdownDocumentText, sourceFiles } = get();
        if (!graphData) return;
        const activeSourceFileSnapshot = readActiveSourceFileSnapshot(sourceFiles || [], markdownDocumentName)
        const nextSignature = getHistorySnapshotSignature(graphData, graphFieldSettingsById, markdownDocumentName, markdownDocumentText, activeSourceFileSnapshot)
        const trimmed = history.slice(0, historyIndex + 1);
        if (shouldSkipHistoryCommit(trimmed, nextSignature)) return
        const graphCopy: GraphData = deepClone(graphData)
        const fieldSettingsCopy: GraphFieldSettingsById = deepClone(graphFieldSettingsById || {})
        const entry = buildHistoryEntry({
          label: l,
          timestamp: Date.now(),
          graphData: graphCopy,
          graphFieldSettingsById: fieldSettingsCopy,
          markdownDocumentName,
          markdownDocumentText,
          activeSourceFileSnapshot,
          parentId: trimmed[trimmed.length - 1]?.id || null,
        })
        const nextHistory = appendBoundedHistoryEntry(trimmed, entry)
        set({ history: nextHistory, historyIndex: nextHistory.length - 1 });
        try {
          persistGraphDataToLocalStorage(graphData)
        } catch {
          void 0
        }
      }, waitMs) as Committer
      global[HISTORY_COMMITTER_KEY] = { waitMs, fn: next }
      return next
    })()
    fn(label)
  },

  setHistoryDebounceMs: (ms: number) => {
    const val = Math.max(0, Math.floor(ms));
    set({ historyDebounceMs: val });
  },

  replaceHistoryState: (
    history: VersionHistoryEntry[],
    historyIndex: number,
  ) => {
    const { graphData } = get();
    cancelScheduledHistoryCommit()

    const safeHistory = Array.isArray(history)
      ? history
          .filter(h => h && typeof h.id === 'string' && typeof h.label === 'string' && typeof h.timestamp === 'number' && !!h.graphData)
          .map(h => ({
            id: String(h.id),
            label: String(h.label),
            timestamp: Math.floor(h.timestamp),
            graphData: deepClone(h.graphData) as GraphData,
            parentId: h.parentId || null,
            source: h.source,
            contentSignature: h.contentSignature,
            graphFieldSettingsById: deepClone(h.graphFieldSettingsById) as GraphFieldSettingsById,
            markdownDocumentName: h.markdownDocumentName,
            markdownDocumentText: h.markdownDocumentText,
            activeSourceFileSnapshot: h.activeSourceFileSnapshot
              ? deepClone(h.activeSourceFileSnapshot) as SourceFile
              : null,
          }))
          .slice(-VERSION_HISTORY_MAX_ENTRIES)
      : [];

    const boundedIndex = (() => {
      if (!Number.isFinite(historyIndex)) return safeHistory.length ? safeHistory.length - 1 : -1;
      const idx = Math.floor(historyIndex);
      if (idx < 0) return safeHistory.length ? safeHistory.length - 1 : -1;
      if (idx >= safeHistory.length) return safeHistory.length ? safeHistory.length - 1 : -1;
      return idx;
    })();

    set({ history: safeHistory, historyIndex: boundedIndex })
    const selectedEntry = boundedIndex >= 0 ? safeHistory[boundedIndex] : null
    if (selectedEntry) {
      restoreHistoryEntry(set, get, selectedEntry, boundedIndex)
      return
    }
    if (!graphData) set({ graphData: null })
  },
});
