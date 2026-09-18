import React from 'react'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import { readDocumentMetadataEntries, type DocumentMetadataEntry } from '@/lib/graph/documentMetadata'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { readGraphTopologySummary, withGraphTopologyMetadata, type GraphTopologySummary } from '@/lib/graph/graphTopology'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import {
  buildSemanticHighlightChipStyle,
  getSemanticHighlightSurfaceAttributes,
  getSemanticHighlightSurfaceClassName,
  SEMANTIC_HIGHLIGHT_SURFACES,
} from '@/lib/ui/semanticHighlight'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const formatCount = (value: unknown): string => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
  if (!Number.isFinite(n)) return '0'
  return Math.floor(n).toLocaleString()
}
export const RENDERER_GRAPH_TOPOLOGY_STATS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-2'

const readNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
  }
  return 0
}

const compactCounts = (items: GraphTopologySummary['topEdgeLabels']): string => {
  const text = items
    .slice(0, 4)
    .map(item => `${item.value} ${formatCount(item.count)}`)
    .join(' | ')
  return text || 'none'
}

type RendererHighlightToken = {
  id: string
  label: string
  color: string
  background: string
  defaultHighlight: boolean
  count: number
  frequency: number
  source: string
  selected: boolean
}

type RendererDocumentMetadataToken = DocumentMetadataEntry & {
  id: string
}

const readString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

const formatMetadataTypeLabel = (value: string): string => {
  const normalized = String(value || '').trim()
  if (!normalized) return 'metadata'
  if (normalized === 'ui-path') return 'UI path'
  return normalized.replace(/[-_]+/g, ' ')
}

export const readRendererDocumentMetadataTokens = (
  graphData: GraphData | null | undefined,
): RendererDocumentMetadataToken[] => {
  const entries = readDocumentMetadataEntries(graphData?.metadata)
  return entries
    .map((entry, index) => ({
      ...entry,
      id: `${entry.type}:${entry.value}:${entry.lineStart || index}:${index}`,
    }))
    .sort((a, b) =>
      (a.lineStart || Number.MAX_SAFE_INTEGER) - (b.lineStart || Number.MAX_SAFE_INTEGER)
      || a.type.localeCompare(b.type)
      || a.value.localeCompare(b.value),
    )
    .slice(0, 6)
}

export function RendererDocumentMetadataSummary({
  entries,
}: {
  entries: RendererDocumentMetadataToken[]
}) {
  if (entries.length === 0) return null

  return (
    <section className="mt-2">
      <section className={`mb-1 text-[11px] font-medium ${UI_THEME_TOKENS.text.secondary}`}>
        Document metadata {formatCount(entries.length)}
      </section>
      <section className="flex flex-col gap-1" data-kg-renderer-document-metadata-list="1">
        {entries.map(entry => (
          <section
            key={entry.id}
            className={`rounded border px-2 py-1 text-[11px] ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg}`}
            data-kg-renderer-document-metadata-item="1"
          >
            <section className="flex items-center gap-2">
              <span className={`shrink-0 rounded-sm border px-1 py-0.5 uppercase tracking-wide ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.tertiary}`}>
                {formatMetadataTypeLabel(entry.type)}
              </span>
              <span
                className={`min-w-0 truncate ${UI_THEME_TOKENS.text.primary}`}
                title={readMarkdownSigilDisplayText(entry.value)}
              >
                {renderMarkdownSigilInlineText(entry.value)}
              </span>
            </section>
            <section className={`mt-1 break-words ${UI_THEME_TOKENS.text.secondary}`}>
              {renderMarkdownSigilInlineText(entry.note)}
            </section>
          </section>
        ))}
      </section>
    </section>
  )
}

export const readRendererHighlightTokens = (
  graphData: GraphData | null | undefined,
  selection?: { selectedNodeId?: string | null; selectedEdgeId?: string | null },
): RendererHighlightToken[] => {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const edges = Array.isArray(graphData?.edges) ? graphData.edges : []
  const byKey = new Map<string, RendererHighlightToken>()
  const selectedNodeId = String(selection?.selectedNodeId || '').trim()
  const selectedEdgeId = String(selection?.selectedEdgeId || '').trim()
  if (selectedNodeId) {
    const node = nodes.find(item => String(item?.id || '').trim() === selectedNodeId)
    const props = (node?.properties || {}) as Record<string, unknown>
    const label = String(readString(props, 'markdown:highlight:text') || readString(props, 'keyword:key') || node?.label || '').trim()
    if (label) {
      const color = readString(props, 'visual:labelColor') || readString(props, 'visual:stroke')
      const background = readString(props, 'visual:fill') || readString(props, 'fill')
      byKey.set(`${label.toLowerCase()}|${color}|${background}`, {
        id: `selection:${selectedNodeId}`,
        label,
        color,
        background,
        defaultHighlight: true,
        count: readNumber(props, 'keyword:frequency') || 1,
        frequency: readNumber(props, 'keyword:frequency'),
        source: 'selection',
        selected: true,
      })
    }
  } else if (selectedEdgeId) {
    const edge = edges.find(item => String(item?.id || '').trim() === selectedEdgeId)
    const props = (edge?.properties || {}) as Record<string, unknown>
    const label = String(edge?.label || '').trim()
    if (label) {
      const color = readString(props, 'visual:stroke')
      byKey.set(`${label.toLowerCase()}|${color}|`, {
        id: `selection:${selectedEdgeId}`,
        label,
        color,
        background: '',
        defaultHighlight: true,
        count: readNumber(props, 'count') || 1,
        frequency: readNumber(props, 'count'),
        source: 'selection',
        selected: true,
      })
    }
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (!node) continue
    const props = (node.properties || {}) as Record<string, unknown>
    const keywordMarked = props['keyword:highlight'] === true
    const markdownMarked = props['markdown:highlight'] === true
    const visualMarked = props['visual:highlight'] === true
    if (!keywordMarked && !markdownMarked && !visualMarked) continue
    const label = (
      readString(props, 'markdown:highlight:text')
      || String(node.label || readString(props, 'keyword:key') || '').trim()
    )
    if (!label) continue
    const count = readNumber(props, 'keyword:highlight:count') || readNumber(props, 'markdown:highlight:count') || 1
    const frequency = readNumber(props, 'keyword:frequency')
    const color = readString(props, 'keyword:highlight:color') || readString(props, 'visual:labelColor') || readString(props, 'visual:stroke')
    const background = readString(props, 'keyword:highlight:background') || readString(props, 'visual:fill') || readString(props, 'fill')
    const source = keywordMarked ? 'keyword' : markdownMarked ? 'markdown' : 'visual'
    const key = `${label.toLowerCase()}|${color}|${background}`
    const existing = byKey.get(key)
    if (existing) {
      existing.count += count
      existing.frequency += frequency
      existing.defaultHighlight = existing.defaultHighlight || props['keyword:highlight:default'] === true || (markdownMarked && !background)
      existing.selected = existing.selected || String(node.id || '').trim() === selectedNodeId
      continue
    }
    byKey.set(key, {
      id: String(node.id || label),
      label,
      color,
      background,
      defaultHighlight: props['keyword:highlight:default'] === true || (markdownMarked && !background),
      count,
      frequency,
      source,
      selected: String(node.id || '').trim() === selectedNodeId,
    })
  }
  return Array.from(byKey.values())
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count || b.frequency - a.frequency || a.label.localeCompare(b.label))
    .slice(0, 8)
}

export function RendererGraphTopologySummary({ graph }: { graph?: GraphData } = {}) {
  const activeGraph = useActiveGraphRenderData()
  const graphData = graph ?? activeGraph
  const selectedNodeId = useGraphStore(s => s.selectedNodeId || null)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId || null)
  const topologyGraph = React.useMemo(() => {
    if (!graphData) return null
    if (readGraphTopologySummary(graphData)) return graphData
    return withGraphTopologyMetadata({ graphData, stage: 'renderer-panel', annotate: false })
  }, [graphData])
  const summary = readGraphTopologySummary(topologyGraph)
  const metadata = (topologyGraph?.metadata && typeof topologyGraph.metadata === 'object' && !Array.isArray(topologyGraph.metadata))
    ? (topologyGraph.metadata as Record<string, unknown>)
    : {}
  const prunedNodes = readNumber(metadata, 'canvasRenderNodePrunedCount')
  const prunedEdges = readNumber(metadata, 'canvasRenderEdgePrunedCount')
  const rendererHighlights = React.useMemo(
    () => readRendererHighlightTokens(topologyGraph, { selectedNodeId, selectedEdgeId }),
    [selectedEdgeId, selectedNodeId, topologyGraph],
  )
  const rendererHighlightCount = readNumber(metadata, 'markdownSigilHighlightCount') || readNumber(metadata, 'keywordHighlightedCount')
  const documentMetadataTokens = React.useMemo(
    () => readRendererDocumentMetadataTokens(topologyGraph),
    [topologyGraph],
  )

  if (!summary) return null

  return (
    <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} px-2 py-2`} aria-label="Graph topology">
      <section className={`mb-2 text-xs font-semibold ${UI_THEME_TOKENS.button.text}`}>Graph topology</section>
      <section className={RENDERER_GRAPH_TOPOLOGY_STATS_GRID_CLASS_NAME}>
        <section className="flex items-center justify-between gap-2">
          <span className={UI_THEME_TOKENS.text.tertiary}>Nodes</span>
          <span className={UI_THEME_TOKENS.text.primary}>{formatCount(summary.nodeCount)}</span>
        </section>
        <section className="flex items-center justify-between gap-2">
          <span className={UI_THEME_TOKENS.text.tertiary}>Edges</span>
          <span className={UI_THEME_TOKENS.text.primary}>{formatCount(summary.edgeCount)}</span>
        </section>
        <section className="flex items-center justify-between gap-2">
          <span className={UI_THEME_TOKENS.text.tertiary}>Connected</span>
          <span className={UI_THEME_TOKENS.text.primary}>{formatCount(summary.connectedNodeCount)}</span>
        </section>
        <section className="flex items-center justify-between gap-2">
          <span className={UI_THEME_TOKENS.text.tertiary}>Structural</span>
          <span className={UI_THEME_TOKENS.text.primary}>{formatCount(summary.structuralEdgeCount)}</span>
        </section>
        {(prunedNodes > 0 || prunedEdges > 0) ? (
          <section className={`col-span-2 flex items-center justify-between gap-2 ${UI_THEME_TOKENS.text.secondary}`}>
            <span>Pruned</span>
            <span>{formatCount(prunedNodes)} nodes / {formatCount(prunedEdges)} edges</span>
          </section>
        ) : null}
      </section>
      <section className={`mt-2 text-[11px] ${UI_THEME_TOKENS.text.tertiary}`}>
        Types: {compactCounts(summary.topNodeTypes)}
      </section>
      <section className={`mt-1 text-[11px] ${UI_THEME_TOKENS.text.tertiary}`}>
        Labels: {compactCounts(summary.topEdgeLabels)}
      </section>
      {rendererHighlights.length > 0 ? (
        <section className="mt-2">
          <section className={`mb-1 text-[11px] font-medium ${UI_THEME_TOKENS.text.secondary}`}>
            Highlights{rendererHighlightCount > rendererHighlights.length ? ` ${formatCount(rendererHighlightCount)}` : ''}
          </section>
          <section className="flex flex-wrap gap-1">
            {rendererHighlights.map(token => {
              const style = buildSemanticHighlightChipStyle({
                background: token.background,
                color: token.color,
                defaultHighlight: token.defaultHighlight,
              })
              const fallbackClass = token.background || token.color
                ? `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.primary}`
                : `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.secondary}`
              return (
                <span
                  key={token.id}
                  className={`${getSemanticHighlightSurfaceClassName(SEMANTIC_HIGHLIGHT_SURFACES.renderer)} max-w-full truncate rounded-sm border px-1.5 py-0.5 text-[11px] leading-4 ${fallbackClass}`}
                  style={style}
                  title={`${token.source}: ${token.label}`}
                  data-kg-renderer-highlight-chip="1"
                  {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.renderer)}
                >
                  {renderMarkdownSigilInlineText(token.label)}
                </span>
              )
            })}
          </section>
        </section>
      ) : null}
      <RendererDocumentMetadataSummary entries={documentMetadataTokens} />
    </section>
  )
}
