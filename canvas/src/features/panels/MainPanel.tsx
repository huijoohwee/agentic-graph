import React from 'react'
import MainPanelFrame from '@/features/panels/ui/MainPanelFrame'
import HeaderActions from '@/features/panels/ui/HeaderActions'
import MainPanelBody from '@/features/panels/ui/MainPanelBody'
import { UI_ANCHORS, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { useShallow } from 'zustand/react/shallow'
import { useActiveGraphData } from '@/hooks/useActiveGraphData'
import { hashScopedStringArraySignature, hashSignatureParts } from '@/lib/hash/signature'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { uiToolbarRowScrollInlineClassName, uiToolbarRowScrollJustifyBetweenClassName } from '@/features/toolbar/ui/toolbarStyles'
import { UI_RESPONSIVE_INLINE_STATUS_CHIP_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import {
  MAIN_PANEL_TABS,
  getMainPanelTabMeta,
  isMainPanelTabKey,
  type MainPanelTabKey,
} from '@/features/panels/mainPanelTabs'
import { MAIN_PANEL_TAB_TYPE_ICON_BY_KEY } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import {
  clearLocalMainPanelSurfaceSnapshot,
  publishLocalMainPanelSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'

const mainPanelTabSupportsSearch = (tab: MainPanelTabKey): boolean => getMainPanelTabMeta(tab).searchable

const IntegrationsHubViewLazy = React.lazy(() => import('./views/IntegrationsHubView'))
const McpHubViewLazy = React.lazy(() => import('./views/McpHubView'))
const MapsHubViewLazy = React.lazy(() => import('./views/MapsHubView'))
const CommerceHubViewLazy = React.lazy(() => import('./views/CommerceHubView'))
const ResearchCompilerViewLazy = React.lazy(() => import('./views/ResearchCompilerView'))
const CollaborationViewLazy = React.lazy(() => import('./views/CollaborationView'))
const StoryboardWidgetManagerViewLazy = React.lazy(() => import('@/features/panels/views/StoryboardWidgetManagerView'))
const PreviewPanelViewLazy = React.lazy(() => import('@/lib/panels/views/PreviewPanelView.impl'))
const SettingsViewLazy = React.lazy(() => import('@/features/panels/views/SettingsView'))
const HistoryViewLazy = React.lazy(() => import('@/features/panels/views/HistoryView'))
const HelpViewLazy = React.lazy(() => import('@/features/panels/views/HelpView'))
const DashboardViewLazy = React.lazy(() => import('@/features/panels/views/DashboardView'))

type MainPanelSharedActions = {
  apply?: () => void
  reset?: () => void
  globalReset?: () => void
  collapseAll?: () => void
  expandAll?: () => void
  allCollapsed?: boolean
}

type SharedMainPanelTabKey = 'collaboration' | 'integrations' | 'mcp' | 'maps' | 'commerce' | 'settings'

type SharedMainPanelViewProps = {
  searchQuery: string
  requestedAnchorId?: string
  requestedAnchorSeq?: number
  onRegisterActions: (next: MainPanelSharedActions) => void
}

const SHARED_MAIN_PANEL_TABS: SharedMainPanelTabKey[] = ['collaboration', 'integrations', 'mcp', 'maps', 'commerce', 'settings']
const noopMainPanelSharedAction = () => void 0
const DEFAULT_MAIN_PANEL_SHARED_ACTIONS: MainPanelSharedActions = {
  apply: noopMainPanelSharedAction,
  reset: noopMainPanelSharedAction,
  collapseAll: noopMainPanelSharedAction,
  expandAll: noopMainPanelSharedAction,
  allCollapsed: true,
}
const MAIN_PANEL_SHARED_VIEW_BY_TAB: Record<
  SharedMainPanelTabKey,
  React.ComponentType<SharedMainPanelViewProps>
> = {
  collaboration: CollaborationViewLazy,
  integrations: IntegrationsHubViewLazy,
  mcp: McpHubViewLazy,
  maps: MapsHubViewLazy,
  commerce: CommerceHubViewLazy,
  settings: SettingsViewLazy,
}

function createMainPanelSharedActionsState(): Record<SharedMainPanelTabKey, MainPanelSharedActions> {
  return {
    collaboration: { ...DEFAULT_MAIN_PANEL_SHARED_ACTIONS },
    integrations: { ...DEFAULT_MAIN_PANEL_SHARED_ACTIONS },
    mcp: { ...DEFAULT_MAIN_PANEL_SHARED_ACTIONS },
    maps: { ...DEFAULT_MAIN_PANEL_SHARED_ACTIONS },
    commerce: { ...DEFAULT_MAIN_PANEL_SHARED_ACTIONS },
    settings: { ...DEFAULT_MAIN_PANEL_SHARED_ACTIONS },
  }
}

function areMainPanelSharedActionsEqual(
  left: MainPanelSharedActions,
  right: MainPanelSharedActions,
): boolean {
  return (
    left.apply === right.apply &&
    left.reset === right.reset &&
    left.globalReset === right.globalReset &&
    left.collapseAll === right.collapseAll &&
    left.expandAll === right.expandAll &&
    left.allCollapsed === right.allCollapsed
  )
}

function isSharedMainPanelTabKey(tab: MainPanelTabKey): tab is SharedMainPanelTabKey {
  return SHARED_MAIN_PANEL_TABS.includes(tab as SharedMainPanelTabKey)
}

export default function MainPanel({
  onClose,
  onHeaderDragStart,
  requestedTab,
  requestedAnchorId,
  requestedAnchorSeq,
  requestedSearchQuery,
  requestedWorkflowManagerTab,
  requestedWorkflowManagerEntryLabel,
  collapsed,
  pinned,
  onMinimize,
  onRestore,
  onPinToggle,
}: {
  onClose?: () => void
  onHeaderDragStart?: (ev: React.PointerEvent<HTMLElement>) => void
  requestedTab?: MainPanelTabKey
  requestedAnchorId?: string
  requestedAnchorSeq?: number
  requestedSearchQuery?: string
  requestedWorkflowManagerTab?: 'graph' | 'mapping'
  requestedWorkflowManagerEntryLabel?: string
  collapsed?: boolean
  pinned?: boolean
  onMinimize?: () => void
  onRestore?: () => void
  onPinToggle?: () => void
}) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [tab, setTab] = React.useState<MainPanelTabKey>('help')
  const [sharedActionsByTab, setSharedActionsByTab] = React.useState<Record<SharedMainPanelTabKey, MainPanelSharedActions>>(
    () => createMainPanelSharedActionsState(),
  )

  const [workflowManagerActions, setWorkflowManagerActions] = React.useState<{
    apply?: () => void
    reset?: () => void
    applyDisabled?: boolean
    resetDisabled?: boolean
  }>({ applyDisabled: true, resetDisabled: true })

  const panelTypography = usePanelTypography()
  const setWorkflowManagerActionsStable = React.useCallback((next: {
    apply?: () => void
    reset?: () => void
    applyDisabled?: boolean
    resetDisabled?: boolean
  }) => {
    setWorkflowManagerActions(prev => {
      const same =
        prev.apply === next.apply &&
        prev.reset === next.reset &&
        prev.applyDisabled === next.applyDisabled &&
        prev.resetDisabled === next.resetDisabled
      return same ? prev : next
    })
  }, [])
  const setSharedActionsStable = React.useCallback(
    (tabKey: SharedMainPanelTabKey, next: MainPanelSharedActions) => {
      setSharedActionsByTab(prev => {
        const current = prev[tabKey]
        if (areMainPanelSharedActionsEqual(current, next)) return prev
        return { ...prev, [tabKey]: next }
      })
    },
    [],
  )
  const { graphDataRevision, lastTraversalSummary } = useGraphStore(
    useShallow(s => ({ graphDataRevision: s.graphDataRevision || 0, lastTraversalSummary: s.lastTraversalSummary })),
  )
  const graphData = useActiveGraphData()
  const traversalGraphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('main-panel-traversal-graph', { graphData: graphData ?? null, graphRevision: graphDataRevision }),
    [graphData, graphDataRevision],
  )
  const traversalGraphLookup = React.useMemo(
    () => getCachedGraphLookup({
      cacheScope: 'main-panel-traversal-graph',
      graphData,
      graphRevision: graphDataRevision,
      graphSemanticKey: traversalGraphSemanticKey,
      preferCurrentGraphDataRefs: true,
    }),
    [graphData, graphDataRevision, traversalGraphSemanticKey],
  )
  const traversalEdgeById = traversalGraphLookup?.edgeById || null
  const traversalSummarySignature = React.useMemo(
    () => hashSignatureParts([
      'main-panel-traversal-summary',
      lastTraversalSummary?.mode || '',
      hashScopedStringArraySignature('main-panel-traversal-edge-ids', lastTraversalSummary?.edgeIds || []),
    ]),
    [lastTraversalSummary?.edgeIds, lastTraversalSummary?.mode],
  )
  const traversalSummary = React.useMemo(() => lastTraversalSummary, [traversalSummarySignature])
  const activeTabMeta = getMainPanelTabMeta(tab)
  const activeSharedActions = isSharedMainPanelTabKey(tab) ? sharedActionsByTab[tab] : null
  const searchVisible = searchOpen && mainPanelTabSupportsSearch(tab)
  const searchPlaceholder = activeTabMeta.searchPlaceholder || UI_LABELS.search
  const footerLabel = activeTabMeta.footerLabel

  const traversalChip = React.useMemo(() => {
    const summary = traversalSummary
    if (!summary || !summary.edgeIds || summary.edgeIds.length === 0) return null
    const edgesCount = summary.edgeIds.length
    let nodesCount: number | null = null
    if (traversalEdgeById && traversalEdgeById.size > 0) {
      const nodeIdSet = new Set<string>()
      for (let i = 0; i < summary.edgeIds.length; i += 1) {
        const edge = traversalEdgeById.get(String(summary.edgeIds[i] || ''))
        if (!edge) continue
        nodeIdSet.add(String(edge.source || ''))
        nodeIdSet.add(String(edge.target || ''))
      }
      nodesCount = nodeIdSet.size
    }
    const modeLabel = summary.mode === 'graphRag' ? 'AgenticRAG' : 'Generic'
    const edgesLabel = edgesCount === 1 ? '1 edge' : `${edgesCount} edges`
    const nodesLabel =
      nodesCount == null ? null : nodesCount === 1 ? '1 node' : `${nodesCount} nodes`
    return {
      modeLabel,
      edgesLabel,
      nodesLabel,
    }
  }, [traversalEdgeById, traversalSummary])

  React.useEffect(() => {
    publishLocalMainPanelSurfaceSnapshot({
      activeTab: tab,
      activeTabLabel: activeTabMeta.label,
      searchable: activeTabMeta.searchable,
      searchOpen,
      searchVisible,
      searchQuery: search,
      searchPlaceholder: searchPlaceholder || null,
      footerLabel: footerLabel || null,
      traversalChip,
      sharedActions: activeSharedActions
        ? {
            hasApply: typeof activeSharedActions.apply === 'function',
            hasReset: typeof activeSharedActions.reset === 'function',
            hasGlobalReset: typeof activeSharedActions.globalReset === 'function',
            hasCollapseAll: typeof activeSharedActions.collapseAll === 'function',
            hasExpandAll: typeof activeSharedActions.expandAll === 'function',
            allCollapsed: activeSharedActions.allCollapsed === true,
          }
        : null,
    })
    return () => {
      clearLocalMainPanelSurfaceSnapshot()
    }
  }, [
    activeSharedActions,
    activeTabMeta.label,
    activeTabMeta.searchable,
    footerLabel,
    search,
    searchOpen,
    searchPlaceholder,
    searchVisible,
    tab,
    traversalChip,
  ])

  React.useEffect(() => {
    if (!requestedTab) return
    const nextSearch = typeof requestedSearchQuery === 'string' ? requestedSearchQuery : ''
    if (requestedTab === 'help') {
      setSearch(nextSearch)
      setSearchOpen(nextSearch.length > 0)
    } else {
      setSearch(nextSearch)
      setSearchOpen(nextSearch.length > 0)
    }
    setTab(isMainPanelTabKey(requestedTab) ? requestedTab : 'help')
  }, [requestedAnchorId, requestedAnchorSeq, requestedSearchQuery, requestedTab])

  return (
    <MainPanelFrame
      ariaLabel="Main panel"
      onDragStart={onHeaderDragStart}
      collapsed={collapsed}
      searchVisible={searchVisible}
      searchPlaceholder={searchPlaceholder}
      searchQuery={search}
      onSearchChange={setSearch}
      tabs={MAIN_PANEL_TABS}
      tabVariant="icon"
      tabIconByKey={MAIN_PANEL_TAB_TYPE_ICON_BY_KEY}
      activeTab={tab}
      onTabChange={(key) => {
        if (!isMainPanelTabKey(key)) return
        setSearchOpen(false)
        setTab(key)
      }}
      tabIdBase="main-panel"
      rightSlot={
        <HeaderActions
          onRestore={collapsed ? onRestore : undefined}
          onMinimize={!collapsed ? onMinimize : undefined}
          onPinToggle={onPinToggle}
          pinned={pinned}
          onSearchToggle={
            mainPanelTabSupportsSearch(tab)
              ? () => setSearchOpen(v => !v)
              : undefined
          }
          onApply={
            tab === 'workflowManager'
                ? workflowManagerActions.apply
                : activeSharedActions?.apply
          }
          onReset={
            tab === 'workflowManager'
                ? workflowManagerActions.reset
                : activeSharedActions?.reset
          }
          onClose={onClose}
          applyDisabled={
            tab === 'workflowManager'
                ? workflowManagerActions.applyDisabled
                : !activeSharedActions?.apply
          }
          resetDisabled={
            tab === 'workflowManager'
                ? workflowManagerActions.resetDisabled
                : !activeSharedActions?.reset
          }
        />
      }
      footer={(
        <footer className={`${uiToolbarRowScrollJustifyBetweenClassName} w-full gap-1 ${UI_THEME_TOKENS.text.secondary} ${panelTypography.panelTextClass}`}>
          <p className="min-w-0 flex-1 truncate">{footerLabel}</p>
          {traversalChip && (
            <section className={`${uiToolbarRowScrollInlineClassName} gap-x-1 gap-y-0.5 ${UI_RESPONSIVE_INLINE_STATUS_CHIP_CLASSNAME} rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`} aria-label={UI_LABELS.graphTraversal}>
              <span className="font-semibold mr-1">{UI_LABELS.graphTraversal}</span>
              <span className="mr-1">{traversalChip.modeLabel}</span>
              <span className="mx-0.5">•</span>
              <span className={panelTypography.monospaceTextClass}>{traversalChip.edgesLabel}</span>
              {traversalChip.nodesLabel && (
                <>
                  <span className="mx-0.5">•</span>
                  <span className={panelTypography.monospaceTextClass}>{traversalChip.nodesLabel}</span>
                </>
              )}
            </section>
          )}
        </footer>
      )}
    >
      <section className="h-full min-h-0 px-2 py-2 sm:px-3 overflow-hidden" aria-label="Main panel content">
        <section className="h-full min-h-0" role="tabpanel" id="main-panel-help-panel" aria-labelledby="main-panel-help-tab" hidden={tab !== 'help'}>
          {tab === 'help' && (
            <React.Suspense fallback={null}>
              <HelpViewLazy searchQuery={search} />
            </React.Suspense>
          )}
        </section>
        {SHARED_MAIN_PANEL_TABS.map(tabKey => {
          const SharedView = MAIN_PANEL_SHARED_VIEW_BY_TAB[tabKey]
          return (
            <section
              key={tabKey}
              className="h-full min-h-0"
              role="tabpanel"
              id={`main-panel-${tabKey}-panel`}
              aria-labelledby={`main-panel-${tabKey}-tab`}
              hidden={tab !== tabKey}
            >
              {tab === tabKey && (
                <MainPanelBody header={null}>
                  <section
                    className={`h-full min-h-0 py-2 ${UI_THEME_TOKENS.text.secondary} ${panelTypography.panelTextClass}`}
                    data-kg-anchor={UI_ANCHORS.settingsPanel}
                  >
                    <React.Suspense fallback={null}>
                      <SharedView
                        searchQuery={search}
                        requestedAnchorId={requestedAnchorId}
                        requestedAnchorSeq={requestedAnchorSeq}
                        onRegisterActions={next => setSharedActionsStable(tabKey, next)}
                      />
                    </React.Suspense>
                  </section>
                </MainPanelBody>
              )}
            </section>
          )
        })}
        <section
          className="h-full min-h-0"
          role="tabpanel"
          id="main-panel-research-panel"
          aria-labelledby="main-panel-research-tab"
          hidden={tab !== 'research'}
        >
          {tab === 'research' && (
            <MainPanelBody header={null}>
              <section className={`h-full min-h-0 py-2 ${UI_THEME_TOKENS.text.secondary} ${panelTypography.panelTextClass}`}>
                <React.Suspense fallback={null}>
                  <ResearchCompilerViewLazy searchQuery={search} />
                </React.Suspense>
              </section>
            </MainPanelBody>
          )}
        </section>
        <section
          className="h-full min-h-0"
          role="tabpanel"
          id="main-panel-workflowManager-panel"
          aria-labelledby="main-panel-workflowManager-tab"
          hidden={tab !== 'workflowManager'}
        >
          {tab === 'workflowManager' && (
            <React.Suspense fallback={null}>
              <StoryboardWidgetManagerViewLazy
                searchQuery={search}
                requestedTab={requestedWorkflowManagerTab}
                requestedEntryLabel={requestedWorkflowManagerEntryLabel}
                requestedEntryToken={requestedAnchorSeq}
                onRegisterActions={setWorkflowManagerActionsStable}
              />
            </React.Suspense>
          )}
        </section>
        <section className="h-full min-h-0" role="tabpanel" id="main-panel-dashboard-panel" aria-labelledby="main-panel-dashboard-tab" hidden={tab !== 'dashboard'}>
          {tab === 'dashboard' && (
            <React.Suspense fallback={null}>
              <DashboardViewLazy onOpenWorkspace={onClose} />
            </React.Suspense>
          )}
        </section>
        <section className="h-full min-h-0" role="tabpanel" id="main-panel-preview-panel" aria-labelledby="main-panel-preview-tab" hidden={tab !== 'preview'}>
          {tab === 'preview' && (
            <React.Suspense fallback={null}>
              <PreviewPanelViewLazy />
            </React.Suspense>
          )}
        </section>
        <section className="h-full min-h-0" role="tabpanel" id="main-panel-history-panel" aria-labelledby="main-panel-history-tab" hidden={tab !== 'history'}>
          {tab === 'history' && (
            <React.Suspense fallback={null}>
              <HistoryViewLazy searchQuery={search} />
            </React.Suspense>
          )}
        </section>
      </section>
    </MainPanelFrame>
  )
}
