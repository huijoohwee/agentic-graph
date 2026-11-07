import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { AutoHeightMiniBarChart } from '@/features/panels/views/DatasetInspectorMiniViz'
import IconButton from '@/components/IconButton'
import { SlidersHorizontal } from 'lucide-react'
import { emitRendererPanelOpen } from '@/features/canvas/utils'
import { UI_COPY } from '@/lib/config'
import { formatNumber, getEdgeCooccurrenceForStats, getEdgeWeightForStats } from '@/lib/graph/statsUtils'
import type { SelectionSnapshot, StatsEdge, StatsUiClasses, TokenCount } from '@/features/graph-stats/types'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { getEdgeLabelForDisplay } from '@/components/GraphCanvas/edgeDisplay'
import { STATS_MINI_CHART_MIN_HEIGHT_PX } from '@/features/graph-stats/statsMiniChart'
import { GRAPH_STATS_METRIC_GRID_CLASS_NAME } from '@/features/graph-stats/graphStatsResponsiveClasses'
import { UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME, UI_RESPONSIVE_STATS_MINI_CHART_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export default function EdgesStatsSection({
  ui,
  neutralBarColor,
  selectedEdgeIdSet,
  similarityMetricLabel,
  selectedEdge,
  topSemanticEdges,
  selectedEdgeTokenCounts,
  semanticMode,
  pinnedEdgeId,
  setPinnedEdgeId,
  clearPinnedCommunityState,
  edgeSelectionSnapshotRef,
  communitySelectionSnapshotRef,
  captureSelectionSnapshot,
  restoreSelectionSnapshot,
  selectEdgeIds,
  getStatsChartWidthPx,
  semanticEdgeColor,
}: {
  ui: StatsUiClasses
  neutralBarColor: string
  selectedEdgeIdSet: ReadonlySet<string>
  similarityMetricLabel: string
  selectedEdge: StatsEdge | null
  topSemanticEdges: StatsEdge[]
  selectedEdgeTokenCounts: TokenCount[] | null
  semanticMode: 'document' | 'keyword'
  pinnedEdgeId: string | null
  setPinnedEdgeId: (next: string | null) => void
  clearPinnedCommunityState: () => void
  edgeSelectionSnapshotRef: React.MutableRefObject<SelectionSnapshot | null>
  communitySelectionSnapshotRef: React.MutableRefObject<SelectionSnapshot | null>
  captureSelectionSnapshot: () => SelectionSnapshot
  restoreSelectionSnapshot: (snap: SelectionSnapshot | null) => void
  selectEdgeIds: (edgeIds: string[]) => void
  getStatsChartWidthPx: (barCount: number) => number
  semanticEdgeColor: string
}) {
  const {
    uiPanelMonospaceTextClass,
    uiPanelKeyValueTextSizeClass,
    uiPanelMicroLabelTextSizeClass,
    uiPanelTextFontClass,
  } = ui
  const [chartCollapsed, setChartCollapsed] = React.useState(false)
  const scrollToEdgeId = React.useMemo(() => {
    if (pinnedEdgeId) return pinnedEdgeId
    const direct = selectedEdge && selectedEdge.id != null ? String(selectedEdge.id) : ''
    if (direct && selectedEdgeIdSet && selectedEdgeIdSet.has(direct)) return direct
    if (selectedEdgeIdSet) {
      for (const id of selectedEdgeIdSet) return id
    }
    return null
  }, [pinnedEdgeId, selectedEdge, selectedEdgeIdSet])

  return (
    <CollapsibleSection
      title={semanticMode === 'keyword' ? UI_COPY.statsEdgesKeywordSectionTitle : UI_COPY.statsEdgesSectionTitle}
    >
      {selectedEdge ? (
        <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`}>
          <section className={[uiPanelKeyValueTextSizeClass, uiPanelTextFontClass, 'font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}>
            Selected edge
          </section>
          <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'mt-1', UI_THEME_TOKENS.text.secondary].join(' ')}>
            id: <span className={uiPanelMonospaceTextClass}>{String(selectedEdge.id)}</span> · label:{' '}
            <span className={uiPanelMonospaceTextClass}>{getEdgeLabelForDisplay(selectedEdge) || ''}</span>
          </section>
          <section className={[uiPanelKeyValueTextSizeClass, uiPanelTextFontClass, 'mt-2', GRAPH_STATS_METRIC_GRID_CLASS_NAME, UI_THEME_TOKENS.text.primary].join(' ')}>
            <section className="flex flex-col">
              <span className={['uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                {similarityMetricLabel} weight
              </span>
              <span className="font-semibold">{formatNumber(getEdgeWeightForStats(selectedEdge))}</span>
            </section>
            <section className="flex flex-col">
              <span className={['uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                Co-occurrence
              </span>
              <span className="font-semibold">{String(getEdgeCooccurrenceForStats(selectedEdge))}</span>
            </section>
            <section className="flex flex-col">
              <span className={['uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                Source
              </span>
              <span className={uiPanelMonospaceTextClass}>{String(selectedEdge.source ?? '')}</span>
            </section>
            <section className="flex flex-col">
              <span className={['uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                Target
              </span>
              <span className={uiPanelMonospaceTextClass}>{String(selectedEdge.target ?? '')}</span>
            </section>
          </section>
        </section>
      ) : (
        <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, UI_THEME_TOKENS.text.secondary].join(' ')}>
          {UI_COPY.statsSelectEdgeToSeeValuesLabel}
        </section>
      )}

      {topSemanticEdges.length > 0 && (
        <section className={`mt-2 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`}>
          <section className="flex items-center justify-between gap-3">
            <section className="flex items-center gap-1">
              <section className={[uiPanelKeyValueTextSizeClass, uiPanelTextFontClass, 'font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}>
                {semanticMode === 'keyword' ? `Relationship edges (${similarityMetricLabel})` : `Top semantic edges (${similarityMetricLabel})`}
              </section>
              <IconButton
                className="App-toolbar__btn"
                title={UI_COPY.statsOpenRendererSettingsForSemanticEdgesTitle}
                onClick={emitRendererPanelOpen}
                showTooltip
              >
                <SlidersHorizontal className="w-3 h-3" />
              </IconButton>
            </section>
            <button
              type="button"
              className={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                `${UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME} rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`,
                UI_THEME_TOKENS.button.text,
                UI_THEME_TOKENS.button.hoverBg,
              ].join(' ')}
              onClick={() => setChartCollapsed(prev => !prev)}
            >
              {chartCollapsed ? UI_COPY.statsShowChartLabel : UI_COPY.statsHideChartLabel}
            </button>
          </section>
          {!chartCollapsed && (
            <section
              onClickCapture={(e) => {
                const target = e.target as HTMLElement | null
                const tag = target && typeof target.tagName === 'string' ? target.tagName.toLowerCase() : ''
                if (tag === 'rect') return
                if (!pinnedEdgeId) return
                setPinnedEdgeId(null)
                restoreSelectionSnapshot(edgeSelectionSnapshotRef.current)
                edgeSelectionSnapshotRef.current = null
              }}
            >
              <AutoHeightMiniBarChart
                containerClassName={UI_RESPONSIVE_STATS_MINI_CHART_SCROLL_CLASSNAME}
                minHeight={STATS_MINI_CHART_MIN_HEIGHT_PX}
                width={getStatsChartWidthPx(topSemanticEdges.length)}
                logicalWidth={getStatsChartWidthPx(topSemanticEdges.length)}
                scrollToKey={scrollToEdgeId}
                data={topSemanticEdges.map((e) => {
                  const id = String(e.id)
                  const src = String(e.source ?? '')
                  const tgt = String(e.target ?? '')
                  const w = getEdgeWeightForStats(e)
                  const c = getEdgeCooccurrenceForStats(e)
                  return {
                    key: id,
                    value: w,
                    color: semanticEdgeColor || undefined,
                    label: `${src} → ${tgt} • ${similarityMetricLabel} ${formatNumber(w)} • count ${String(c)}`,
                    active: pinnedEdgeId === id || (selectedEdgeIdSet ? selectedEdgeIdSet.has(id) : false),
                    onClick: () => {
                      if (pinnedEdgeId === id) {
                        setPinnedEdgeId(null)
                        restoreSelectionSnapshot(edgeSelectionSnapshotRef.current)
                        edgeSelectionSnapshotRef.current = null
                        return
                      }
                      clearPinnedCommunityState()
                      communitySelectionSnapshotRef.current = null
                      if (!edgeSelectionSnapshotRef.current) {
                        edgeSelectionSnapshotRef.current = captureSelectionSnapshot()
                      }
                      selectEdgeIds([id])
                      setPinnedEdgeId(id)
                    },
                  }
                })}
              />
            </section>
          )}
          {selectedEdgeTokenCounts && selectedEdgeTokenCounts.length > 0 && (
            <section className="mt-2">
              <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}>
                Top tokens (edge endpoints)
              </section>
              <AutoHeightMiniBarChart
                containerClassName={`mt-1 ${UI_RESPONSIVE_STATS_MINI_CHART_SCROLL_CLASSNAME}`}
                minHeight={STATS_MINI_CHART_MIN_HEIGHT_PX}
                width={Math.max(140, selectedEdgeTokenCounts.length * 12)}
                logicalWidth={Math.max(140, selectedEdgeTokenCounts.length * 12)}
                defaultBarColor={neutralBarColor}
                data={selectedEdgeTokenCounts.map(t => ({
                  key: t.token,
                  value: t.count,
                  label: `${t.token} • ${t.count}`,
                }))}
              />
            </section>
          )}
          <section className={[uiPanelMicroLabelTextSizeClass, uiPanelTextFontClass, 'mt-1', UI_THEME_TOKENS.text.tertiary].join(' ')}>
            {UI_COPY.statsBarHeightSimilarityWeightHint(similarityMetricLabel)}
          </section>
        </section>
      )}
    </CollapsibleSection>
  )
}
