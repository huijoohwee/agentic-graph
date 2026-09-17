import React from 'react'
import type { AgenticRagContextComparison, AgenticRagIgnoreFiltersSummary } from '@/lib/graph/jsonld/index'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import Tooltip from '@/features/panels/ui/Tooltip'
import { RENDER_PANEL_SECTION_COPY } from '@/features/panels/config'
import { AgenticRagIgnoreFiltersSummaryView } from '@/features/panels/views/AgenticRagContextSection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getPillClass } from '@/lib/ui'
import {
  AGENTIC_RAG_CONTEXT_LABEL,
  AGENTIC_RAG_DATASET_CONTEXT_VOCAB_LABEL,
  DATASET_EMPTY_TEXT,
} from '@/lib/config'
import type { GraphData } from '@/lib/graph/types'
import { readSelectionSubgraphMembershipForAnchorIds } from '@/lib/graph/file'
import { useSelectionAnchorIds } from '@/components/GraphCanvas/highlight'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import {
  DatasetDistributionViz,
  DatasetHierarchyViz,
  DatasetPathViz,
  DatasetPolygonViz,
} from '@/features/panels/views/DatasetInspectorMiniViz'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME,
  UI_RESPONSIVE_MICRO_INLINE_CHIP_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { TwoColumnEditorGrid } from '@/features/panels/ui/TwoColumnEditorGrid'

const EMPTY_STRING_ARRAY: string[] = []
const datasetToggleShellClassName = `inline-flex rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden`
export const DATASET_INSPECTOR_STATS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3'

interface DatasetStats {
  nodeCount: number
  edgeCount: number
  distinctTriples: number
}

interface DatasetInspectorSectionProps {
  datasetStats: DatasetStats
  graphOverride?: GraphData | null
  contextComparison?: AgenticRagContextComparison | null
  ignoreFilters?: AgenticRagIgnoreFiltersSummary | null
  toolbarAligned?: boolean
  collapsed?: boolean
  onToggle?: (next: boolean) => void
}

export default function DatasetInspectorSection({
  datasetStats,
  graphOverride,
  contextComparison,
  ignoreFilters,
  toolbarAligned = false,
  collapsed,
  onToggle,
}: DatasetInspectorSectionProps) {
  const uiIconPillBadgeTextSizeClass = useGraphStore(s => s.uiIconPillBadgeTextSizeClass)
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )
  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || 'text-xs',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId)
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds ?? EMPTY_STRING_ARRAY)
  const selectedEdgeIds = useGraphStore(s => s.selectedEdgeIds ?? EMPTY_STRING_ARRAY)
  const copy = RENDER_PANEL_SECTION_COPY.datasetInspector
  const graph = useActiveGraphRenderData()

  const selectionAnchorIds = useSelectionAnchorIds({
    selectedNodeId,
    selectedEdgeId,
    selectedNodeIds,
    selectedEdgeIds,
  })

  const selectionMembership = React.useMemo(() => {
    if (!graph) return null
    const { selectionNodeIds, selectionEdgeIds } = selectionAnchorIds
    if (selectionNodeIds.length === 0 && selectionEdgeIds.length === 0) return null
    return readSelectionSubgraphMembershipForAnchorIds(graph, selectionAnchorIds)
  }, [graph, selectionAnchorIds])

  const selectionSubgraph = selectionMembership?.subgraph ?? null

  const hasSelectionSubgraph = !!(
    selectionSubgraph &&
    Array.isArray(selectionSubgraph.nodes) &&
    selectionSubgraph.nodes.length > 0 &&
    Array.isArray(selectionSubgraph.edges)
  )

  const [vizSource, setVizSource] = React.useState<'auto' | 'dataset' | 'selection'>('auto')

  const effectiveGraph = React.useMemo<GraphData | null>(() => {
    if (graphOverride !== undefined) return graphOverride
    if (!graph) return null
    if (vizSource === 'dataset') return graph
    if (vizSource === 'selection') return selectionSubgraph && hasSelectionSubgraph ? selectionSubgraph : graph
    if (vizSource === 'auto' && hasSelectionSubgraph && selectionSubgraph) return selectionSubgraph
    return graph
  }, [graph, graphOverride, hasSelectionSubgraph, selectionSubgraph, vizSource])

  const selectionSummary = React.useMemo(() => {
    if (!hasSelectionSubgraph || !selectionSubgraph) return ''
    const nodeCount = Array.isArray(selectionSubgraph.nodes) ? selectionSubgraph.nodes.length : 0
    const edgeCount = Array.isArray(selectionSubgraph.edges) ? selectionSubgraph.edges.length : 0
    if (!nodeCount && !edgeCount) return ''
    const nodeLabel = nodeCount === 1 ? 'node' : 'nodes'
    const edgeLabel = edgeCount === 1 ? 'edge' : 'edges'
    return `Selection: ${nodeCount} ${nodeLabel}, ${edgeCount} ${edgeLabel}`
  }, [hasSelectionSubgraph, selectionSubgraph])

  const titleContent = (
    <section className="flex flex-col">
      <span className="inline-flex items-center gap-2">
        {copy.badge && (
          <span
            className={[
              uiPanelKeyValueTextSizeClass,
              uiPanelTextFontClass,
              `font-semibold ${UI_THEME_TOKENS.text.tertiary}`,
            ].join(' ')}
          >
            {copy.badge}
          </span>
        )}
        <span className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>
          {copy.title}
        </span>
      </span>
      {copy.descriptionShort && (
        <span
          className={[
            uiPanelMicroLabelTextSizeClass,
            uiPanelTextFontClass,
            UI_THEME_TOKENS.text.secondary,
          ].join(' ')}
        >
          {copy.descriptionShort}
        </span>
      )}
    </section>
  )

  return (
    <CollapsibleSection
      title={copy.tooltip ? (
        <Tooltip
          content={copy.tooltip}
          maxWidthPx={260}

        >
          {titleContent}
        </Tooltip>
      ) : (
        titleContent
      )}
      toolbarAligned={toolbarAligned}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {datasetStats.nodeCount === 0 && datasetStats.edgeCount === 0 ? (
        <section
          className={[
            uiPanelMicroLabelTextSizeClass,
            UI_THEME_TOKENS.text.secondary,
          ].join(' ')}
        >
          {DATASET_EMPTY_TEXT}
        </section>
      ) : (
        <section
          className={[
            DATASET_INSPECTOR_STATS_GRID_CLASS_NAME,
            UI_THEME_TOKENS.text.primary,
            uiPanelKeyValueTextSizeClass,
            uiPanelTextFontClass,
          ].join(' ')}
        >
          <section className="flex flex-col">
            <span className={`uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary}`}>Nodes</span>
            <span className="font-semibold">{String(datasetStats.nodeCount)}</span>
          </section>
          <section className="flex flex-col">
            <span className={`uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary}`}>Edges</span>
            <span className="font-semibold">{String(datasetStats.edgeCount)}</span>
          </section>
          <section className="flex flex-col">
            <span className={`uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary}`}>Distinct relationships</span>
            <span className="font-semibold">{String(datasetStats.distinctTriples)}</span>
          </section>
        </section>
      )}
      {effectiveGraph &&
        Array.isArray(effectiveGraph.nodes) &&
        Array.isArray(effectiveGraph.edges) &&
        effectiveGraph.nodes.length > 0 && (
          <>
            {graphOverride === undefined && hasSelectionSubgraph && selectionSummary && (
              <section className="mt-2 flex items-center justify-between gap-2">
                <section
                  className={[
                    uiPanelMicroLabelTextSizeClass,
                    uiPanelTextFontClass,
                    `${UI_THEME_TOKENS.text.secondary} truncate`,
                  ].join(' ')}
                >
                  {selectionSummary}
                </section>
                <section className={datasetToggleShellClassName}>
                  <button
                    type="button"
                    className={[
                      uiPanelMicroLabelTextSizeClass,
                      uiPanelTextFontClass,
                      UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME,
                      vizSource === 'auto' ? `${UI_THEME_TOKENS.button.neutralMuted} ${UI_THEME_TOKENS.text.primary}` : UI_THEME_TOKENS.text.tertiary,
                    ].join(' ')}
                    onClick={() => setVizSource('auto')}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    className={[
                      uiPanelMicroLabelTextSizeClass,
                      uiPanelTextFontClass,
                      UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME,
                      vizSource === 'dataset' ? `${UI_THEME_TOKENS.button.neutralMuted} ${UI_THEME_TOKENS.text.primary}` : UI_THEME_TOKENS.text.tertiary,
                    ].join(' ')}
                    onClick={() => setVizSource('dataset')}
                  >
                    Dataset
                  </button>
                  <button
                    type="button"
                    className={[
                      uiPanelMicroLabelTextSizeClass,
                      uiPanelTextFontClass,
                      UI_RESPONSIVE_COMPACT_INLINE_CONTROL_CLASSNAME,
                      vizSource === 'selection' ? `${UI_THEME_TOKENS.button.neutralMuted} ${UI_THEME_TOKENS.text.primary}` : UI_THEME_TOKENS.text.tertiary,
                    ].join(' ')}
                    onClick={() => setVizSource('selection')}
                  >
                    Selection
                  </button>
                </section>
              </section>
            )}
            <TwoColumnEditorGrid className="mt-2">
              <section className="flex flex-col gap-1">
                <span
                  className={[
                    uiPanelMicroLabelTextSizeClass,
                    uiPanelTextFontClass,
                    UI_THEME_TOKENS.text.secondary,
                  ].join(' ')}
                >
                  Node type distribution
                </span>
                <DatasetDistributionViz graph={effectiveGraph} />
              </section>
              <section className="flex flex-col gap-1">
                <span
                  className={[
                    uiPanelMicroLabelTextSizeClass,
                    uiPanelTextFontClass,
                    UI_THEME_TOKENS.text.secondary,
                  ].join(' ')}
                >
                  Type/label hierarchy
                </span>
                <DatasetHierarchyViz graph={effectiveGraph} />
              </section>
              <section className="flex flex-col gap-1">
                <span
                  className={[
                    uiPanelMicroLabelTextSizeClass,
                    uiPanelTextFontClass,
                    UI_THEME_TOKENS.text.secondary,
                  ].join(' ')}
                >
                  Degree outline (nodes)
                </span>
                <DatasetPolygonViz graph={effectiveGraph} />
              </section>
              <section className="flex flex-col gap-1">
                <span
                  className={[
                    uiPanelMicroLabelTextSizeClass,
                    uiPanelTextFontClass,
                    UI_THEME_TOKENS.text.secondary,
                  ].join(' ')}
                >
                  Edge length path
                </span>
                <DatasetPathViz graph={effectiveGraph} />
              </section>
            </TwoColumnEditorGrid>
          </>
        )}
      {contextComparison && (
        <section className={`mt-1 ${UI_THEME_TOKENS.text.tertiary} ${uiPanelKeyValueTextSizeClass}`}>
          <span
            className={getPillClass('badge', {
              baseClass:
                `${UI_RESPONSIVE_MICRO_INLINE_CHIP_CLASSNAME} mr-1 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle}`,
              badgeTextSizeClass: uiIconPillBadgeTextSizeClass,
              textColorClass: UI_THEME_TOKENS.text.secondary,
            })}
          >
            {RENDER_PANEL_SECTION_COPY.presetsAndTuning.badge}
          </span>
          {AGENTIC_RAG_CONTEXT_LABEL}
          {' '}
          <span className={`${uiPanelMonospaceTextClass} break-all`}>
            {contextComparison.canonicalContextUrl}
          </span>
          {contextComparison.graphContextUrl && (
            <>
              {' '}
              {AGENTIC_RAG_DATASET_CONTEXT_VOCAB_LABEL}
              {' '}
              <span className={`${uiPanelMonospaceTextClass} break-all`}>
                {contextComparison.graphContextUrl}
              </span>
              {contextComparison.isCanonicalMatch === true && ' (matches)'}
              {contextComparison.isCanonicalMatch === false && ' (differs)'}
            </>
          )}
        </section>
      )}
      <AgenticRagIgnoreFiltersSummaryView
        ignoreFilters={ignoreFilters ?? null}
        className="mt-1"
      />
    </CollapsibleSection>
  )
}
