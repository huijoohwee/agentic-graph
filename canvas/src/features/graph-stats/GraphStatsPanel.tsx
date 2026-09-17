import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import DatasetInspectorSection from '@/features/panels/views/DatasetInspectorSection'
import { useGraphStore } from '@/hooks/useGraphStore'
import usePersistedBoolean from '@/features/hooks/usePersistedBoolean'
import { LS_KEYS } from '@/lib/config'
import CommunitiesStatsSection from '@/features/graph-stats/sections/CommunitiesStatsSection'
import EdgesStatsSection from '@/features/graph-stats/sections/EdgesStatsSection'
import NodeWordFrequenciesSection from '@/features/graph-stats/sections/NodeWordFrequenciesSection'
import KeywordEntitiesSection from '@/features/graph-stats/sections/KeywordEntitiesSection'
import GraphKeywordTermsSection from '@/features/graph-stats/sections/GraphKeywordTermsSection'
import GraphRagCentralityStatsSection from '@/features/graph-stats/sections/GraphRagCentralityStatsSection'
import type { StatsUiClasses } from '@/features/graph-stats/types'
import { useStatsSelection } from '@/features/graph-stats/hooks/useStatsSelection'
import { useStatsTokens } from '@/features/graph-stats/hooks/useStatsTokens'
import { useStatsDerivedData } from '@/features/graph-stats/hooks/useStatsDerivedData'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { GraphData } from '@/lib/graph/types'
import { UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { normalizeSemanticHighlightColor } from '@/lib/ui/semanticHighlight'
import { GRAPH_STATS_KEYWORD_CONTROL_GRID_CLASS_NAME } from '@/features/graph-stats/graphStatsResponsiveClasses'

export default function GraphStatsPanel() {
  const semanticMode = useGraphStore(s => (s.documentSemanticMode || 'document') as 'document' | 'keyword')
  const keywordSourceMaxLines = useGraphStore(s => s.keywordSourceMaxLines)
  const keywordSourceMaxChars = useGraphStore(s => s.keywordSourceMaxChars)
  const keywordGraphEdgesPerNode = useGraphStore(s => s.keywordGraphEdgesPerNode)
  const keywordGraphMaxEdgesCap = useGraphStore(s => s.keywordGraphMaxEdgesCap)
  const keywordGraphMentionEdgesPerSourceNode = useGraphStore(s => s.keywordGraphMentionEdgesPerSourceNode)
  const setKeywordSourceMaxLines = useGraphStore(s => s.setKeywordSourceMaxLines)
  const setKeywordSourceMaxChars = useGraphStore(s => s.setKeywordSourceMaxChars)
  const setKeywordGraphEdgesPerNode = useGraphStore(s => s.setKeywordGraphEdgesPerNode)
  const setKeywordGraphMaxEdgesCap = useGraphStore(s => s.setKeywordGraphMaxEdgesCap)
  const setKeywordGraphMentionEdgesPerSourceNode = useGraphStore(s => s.setKeywordGraphMentionEdgesPerSourceNode)
  const {
    data,
    renderedGraph,
    datasetGraph,
    datasetScopeLabel,
    schema,
    effectiveGraph,
    statsScope,
    setStatsScope,
    statsLod,
    setStatsLod,
    effectiveLod,
    pinnedEdgeId,
    setPinnedEdgeId,
    pinnedCommunityId,
    setPinnedCommunityId,
    edgeSelectionSnapshotRef,
    communitySelectionSnapshotRef,
    captureSelectionSnapshot,
    restoreSelectionSnapshot,
    selectNodeIds,
    selectEdgeIds,
    selectedNodeIdSet,
    selectedEdgeIdSet,
  } = useStatsSelection()

  React.useEffect(() => {
    if (semanticMode !== 'keyword') return
    if (statsScope === 'dataset') return
    setStatsScope('dataset')
  }, [semanticMode, setStatsScope, statsScope])

  const {
    baseTokenCfg,
    tokenCfg,
    statsExcludeTokens,
    setStatsExcludeTokens,
    statsIncludeTokens,
    setStatsIncludeTokens,
    statsFilterMode,
    setStatsFilterMode,
    toggleStatsStopword,
  } = useStatsTokens({ schema })

  const {
    datasetStats,
    agenticContext,
    datasetIgnoreFilters,
    communityTokensForDropdown,
    communityTokenFilter,
    setCommunityTokenFilter,
    communityTokenSort,
    setCommunityTokenSort,
    dashboardKeywordTerms,
    tokensForSelectedNode,
    tokensForSelectedNodes,
    selectedEdge,
    selectedEdgeTokenCounts,
    topSemanticEdges,
    semanticEdgeColor,
    neutralBarColor,
    communities,
    similarityMetricLabel,
  } = useStatsDerivedData({
    effectiveGraph,
    data,
    schema,
    tokenCfg,
    effectiveLod,
    baseTokenCfg,
    semanticMode,
  })

  const uiPanelMonospaceTextClass = useGraphStore(s => s.uiPanelMonospaceTextClass || 'font-mono text-xs')
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-xs')
  const uiPanelKeyValueInputClass = useGraphStore(
    s => s.uiPanelKeyValueInputClass || `w-full rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} px-2 py-1 text-xs ${UI_THEME_TOKENS.input.text} ${UI_THEME_TOKENS.focus.primaryBorderRing}`,
  )
  const uiPanelMicroLabelTextSizeClass = useGraphStore(s => s.uiPanelMicroLabelTextSizeClass || 'text-xs')
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')

  const getStatsChartWidthPx = React.useCallback((barCount: number) => {
    const count = Number.isFinite(barCount) ? Math.max(0, Math.floor(barCount)) : 0
    if (count <= 0) return 140
    return Math.max(140, count * 4)
  }, [])

  const [datasetInspectorCollapsed, setDatasetInspectorCollapsed] = usePersistedBoolean(
    LS_KEYS.renderDatasetInspectorCollapsed,
    true,
  )

  const ui: StatsUiClasses = React.useMemo(() => {
    return {
      uiPanelMonospaceTextClass,
      uiPanelKeyValueTextSizeClass,
      uiPanelMicroLabelTextSizeClass,
      uiPanelTextFontClass,
    }
  }, [uiPanelKeyValueTextSizeClass, uiPanelMicroLabelTextSizeClass, uiPanelMonospaceTextClass, uiPanelTextFontClass])

  const clearPinnedEdgeState = React.useCallback(() => {
    setPinnedEdgeId(null)
  }, [setPinnedEdgeId])

  const clearPinnedCommunityState = React.useCallback(() => {
    setPinnedCommunityId(null)
  }, [setPinnedCommunityId])

  const keywordNodes = React.useMemo(() => {
    if (semanticMode !== 'keyword') return []
    const graph = effectiveGraph
    if (!graph || !Array.isArray(graph.nodes)) return []
    const maxListItems = effectiveLod === 'low' ? 10 : effectiveLod === 'medium' ? 20 : 50
    const out = graph.nodes
      .map(n => {
        const props = (n.properties || {}) as Record<string, unknown>
        const kind = String(props['keyword:kind'] || '')
        if (kind && kind !== 'entity') return null
        const rawCount = props.count
        const count = typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : 0
        const vf = normalizeSemanticHighlightColor(props['visual:fill'])
        const f = normalizeSemanticHighlightColor(props['fill'])
        const color = vf || f || ''
        return { id: String(n.id), label: String(n.label || n.id), count, color }
      })
      .filter((x): x is { id: string; label: string; count: number; color: string } => !!x && !!x.id)
    out.sort((a, b) => {
      const diff = b.count - a.count
      if (diff !== 0) return diff
      return a.label.localeCompare(b.label)
    })
    return out.slice(0, Math.max(0, maxListItems))
  }, [effectiveGraph, effectiveLod, semanticMode])

  const keywordPending = React.useMemo(() => {
    if (semanticMode !== 'keyword') return false
    const g = effectiveGraph as GraphData | null
    const pendingFlag = Boolean((g?.metadata as Record<string, unknown> | null)?.pending)
    if (pendingFlag) return true
    const hasBase = !!(data && Array.isArray(data.nodes) && data.nodes.length > 0)
    const hasKeywordNodes = keywordNodes.length > 0
    return hasBase && !hasKeywordNodes
  }, [data, effectiveGraph, keywordNodes.length, semanticMode])

  return (
    <section className="h-full min-h-0 flex flex-col overflow-auto px-3 py-2" aria-label="Dashboard">
      <p className="mb-2 text-xs" role="status">
        {datasetScopeLabel}: {datasetGraph?.nodes.length ?? 0} nodes / {datasetGraph?.edges.length ?? 0} edges.
        {' '}Rendered: {renderedGraph?.nodes.length ?? 0} nodes / {renderedGraph?.edges.length ?? 0} edges.
        {' '}Selection statistics follow the selected scope; loaded projections can be partial.
      </p>
      <nav className="mb-2 flex flex-wrap items-center justify-between gap-2" aria-label="Dashboard controls">
        <section
          className={`inline-flex rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden`}
          role="group"
          aria-label="Stats scope"
        >
          {(['auto', 'dataset', 'selection'] as const).map(key => (
            <button
              key={key}
              type="button"
              className={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME,
                statsScope === key ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}` : UI_THEME_TOKENS.button.text,
              ].join(' ')}
              onClick={() => setStatsScope(key)}
            >
              {key === 'auto' ? 'Auto' : key === 'dataset' ? datasetScopeLabel : 'Selection'}
            </button>
          ))}
        </section>
        <section
          className={`inline-flex rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden`}
          role="group"
          aria-label="Stats level of detail"
        >
          {(['auto', 'low', 'medium', 'high'] as const).map(key => (
            <button
              key={key}
              type="button"
              className={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME,
                statsLod === key ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}` : UI_THEME_TOKENS.button.text,
              ].join(' ')}
              onClick={() => setStatsLod(key)}
            >
              {key === 'auto' ? 'Auto' : key === 'low' ? 'Low' : key === 'medium' ? 'Med' : 'High'}
            </button>
          ))}
        </section>
      </nav>

      {semanticMode === 'keyword' && keywordPending ? (
        <section className="mt-2" aria-label="Keyword status">
          <p className={[uiPanelKeyValueTextSizeClass, uiPanelTextFontClass, 'text-[color:var(--kg-text-secondary)]'].join(' ')}>
            Computing keyword graph…
          </p>
        </section>
      ) : null}

      {semanticMode === 'keyword' ? (
        <CollapsibleSection title="Keyword Mode" className="mt-2">
          <section className="space-y-3">
            <section className={[uiPanelKeyValueTextSizeClass, uiPanelTextFontClass, 'text-[color:var(--kg-text-secondary)]'].join(' ')}>
              Tune keyword extraction and graph caps. Changes apply immediately.
            </section>
            <section className={GRAPH_STATS_KEYWORD_CONTROL_GRID_CLASS_NAME}>
              <section className="space-y-1">
                <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'text-[color:var(--kg-text-secondary)]'].join(' ')}>Source max lines</section>
                <input
                  type="number"
                  min={200}
                  max={100000}
                  step={100}
                  value={keywordSourceMaxLines}
                  onChange={e => setKeywordSourceMaxLines(parseInt(e.target.value || '0', 10))}
                  className={uiPanelKeyValueInputClass}
                />
              </section>
              <section className="space-y-1">
                <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'text-[color:var(--kg-text-secondary)]'].join(' ')}>Source max chars</section>
                <input
                  type="number"
                  min={10000}
                  max={2000000}
                  step={5000}
                  value={keywordSourceMaxChars}
                  onChange={e => setKeywordSourceMaxChars(parseInt(e.target.value || '0', 10))}
                  className={uiPanelKeyValueInputClass}
                />
              </section>
              <section className="space-y-1">
                <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'text-[color:var(--kg-text-secondary)]'].join(' ')}>Edges per keyword node</section>
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={keywordGraphEdgesPerNode}
                  onChange={e => setKeywordGraphEdgesPerNode(parseInt(e.target.value || '0', 10))}
                  className={uiPanelKeyValueInputClass}
                />
              </section>
              <section className="space-y-1">
                <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'text-[color:var(--kg-text-secondary)]'].join(' ')}>Max keyword edges cap</section>
                <input
                  type="number"
                  min={0}
                  max={25000}
                  step={50}
                  value={keywordGraphMaxEdgesCap}
                  onChange={e => setKeywordGraphMaxEdgesCap(parseInt(e.target.value || '0', 10))}
                  className={uiPanelKeyValueInputClass}
                />
              </section>
              <section className="space-y-1">
                <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'text-[color:var(--kg-text-secondary)]'].join(' ')}>Mentions per document node</section>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={keywordGraphMentionEdgesPerSourceNode}
                  onChange={e => setKeywordGraphMentionEdgesPerSourceNode(parseInt(e.target.value || '0', 10))}
                  className={uiPanelKeyValueInputClass}
                />
              </section>
            </section>
          </section>
        </CollapsibleSection>
      ) : null}

      <DatasetInspectorSection
        graphOverride={effectiveGraph}
        collapsed={datasetInspectorCollapsed}
        onToggle={() => setDatasetInspectorCollapsed(!datasetInspectorCollapsed)}
        datasetStats={datasetStats}
        contextComparison={agenticContext}
        ignoreFilters={datasetIgnoreFilters}
      />

      <GraphRagCentralityStatsSection ui={ui} neutralBarColor={neutralBarColor} />

      <GraphKeywordTermsSection
        ui={ui}
        terms={dashboardKeywordTerms}
        selectedNodeIdSet={selectedNodeIdSet}
        selectNodeIds={selectNodeIds}
      />

      {semanticMode === 'keyword' ? (
        <KeywordEntitiesSection
          keywordNodes={keywordNodes}
          selectedNodeIdSet={selectedNodeIdSet}
          selectNodeIds={selectNodeIds}
          ui={ui}
        />
      ) : (
        <NodeWordFrequenciesSection
          tokensForSelectedNode={tokensForSelectedNode}
          tokensForSelectedNodes={tokensForSelectedNodes}
          statsFilterMode={statsFilterMode}
          statsExcludeTokens={statsExcludeTokens}
          statsIncludeTokens={statsIncludeTokens}
          toggleStatsToken={toggleStatsStopword}
          ui={ui}
        />
      )}

      <CommunitiesStatsSection
        communities={communities}
        communityTokensForDropdown={communityTokensForDropdown}
        communityTokenFilter={communityTokenFilter}
        setCommunityTokenFilter={setCommunityTokenFilter}
        communityTokenSort={communityTokenSort}
        setCommunityTokenSort={setCommunityTokenSort}
        statsFilterMode={statsFilterMode}
        setStatsFilterMode={setStatsFilterMode}
        statsExcludeTokens={statsExcludeTokens}
        setStatsExcludeTokens={setStatsExcludeTokens}
        statsIncludeTokens={statsIncludeTokens}
        setStatsIncludeTokens={setStatsIncludeTokens}
        toggleStatsToken={toggleStatsStopword}
        pinnedCommunityId={pinnedCommunityId}
        setPinnedCommunityId={setPinnedCommunityId}
        clearPinnedEdgeState={clearPinnedEdgeState}
        communitySelectionSnapshotRef={communitySelectionSnapshotRef}
        edgeSelectionSnapshotRef={edgeSelectionSnapshotRef}
        captureSelectionSnapshot={captureSelectionSnapshot}
        restoreSelectionSnapshot={restoreSelectionSnapshot}
        selectNodeIds={selectNodeIds}
        getStatsChartWidthPx={getStatsChartWidthPx}
        selectedNodeIdSet={selectedNodeIdSet}
        neutralBarColor={neutralBarColor}
        ui={ui}
      />

      <EdgesStatsSection
        selectedEdge={selectedEdge}
        selectedEdgeTokenCounts={selectedEdgeTokenCounts}
        topSemanticEdges={topSemanticEdges}
        similarityMetricLabel={similarityMetricLabel}
        semanticEdgeColor={semanticEdgeColor}
        neutralBarColor={neutralBarColor}
        semanticMode={semanticMode}
        pinnedEdgeId={pinnedEdgeId}
        setPinnedEdgeId={setPinnedEdgeId}
        clearPinnedCommunityState={clearPinnedCommunityState}
        edgeSelectionSnapshotRef={edgeSelectionSnapshotRef}
        communitySelectionSnapshotRef={communitySelectionSnapshotRef}
        captureSelectionSnapshot={captureSelectionSnapshot}
        restoreSelectionSnapshot={restoreSelectionSnapshot}
        selectEdgeIds={selectEdgeIds}
        selectedEdgeIdSet={selectedEdgeIdSet}
        getStatsChartWidthPx={getStatsChartWidthPx}
        ui={ui}
      />
    </section>
  )
}
