import type { LocalMainPanelSurfaceSnapshot } from './browserLocalSurfaceSnapshots'

const normalizeString = (value: unknown): string => String(value || '').trim()

export const inspectLocalMainPanelState = (
  snapshot: (LocalMainPanelSurfaceSnapshot & { updatedAtMs?: number }) | null,
) => {
  if (!snapshot) {
    return {
      available: false,
      sourceKind: 'browser-local-main-panel',
      message: 'MainPanel is not currently mounted in the local agentic-graph browser runtime.',
    }
  }
  return {
    available: true,
    sourceKind: 'browser-local-main-panel',
    activeTab: snapshot.activeTab,
    activeTabLabel: snapshot.activeTabLabel,
    searchable: snapshot.searchable,
    search: {
      open: snapshot.searchOpen,
      visible: snapshot.searchVisible,
      query: snapshot.searchQuery,
      placeholder: snapshot.searchPlaceholder,
      queryLength: normalizeString(snapshot.searchQuery).length,
    },
    footerLabel: snapshot.footerLabel,
    traversalChip: snapshot.traversalChip,
    sharedActions: snapshot.sharedActions,
    updatedAtMs: snapshot.updatedAtMs || null,
  }
}
