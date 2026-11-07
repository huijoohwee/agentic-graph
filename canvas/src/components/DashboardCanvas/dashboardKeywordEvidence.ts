import type { GraphData } from '@/lib/graph/types'
import { isPlainObject } from '@/lib/graph/value'
import type { DashboardSection } from './dashboardModel'

/** Optional projections of native evidence; no document type, filename or provider binding. */
export function buildDashboardKeywordEvidence(graph: GraphData | null | undefined): DashboardSection[] {
  const nodes = (graph?.nodes ?? []).filter(node => isPlainObject(node.properties?.['keyword:evidence']))
  if (!nodes.length) return []
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  const evidenceFor = (node: typeof nodes[number]) => node.properties!['keyword:evidence'] as Record<string, unknown>
  const sorted = [...nodes].sort((a, b) => count(evidenceFor(b).frequency) - count(evidenceFor(a).frequency) || a.id.localeCompare(b.id))
  const distribution = [0, 0, 0, 0, 0, 0]
  const clusters = new Map<string, string[]>()
  for (const node of sorted) {
    const evidence = evidenceFor(node)
    if (Array.isArray(evidence.distribution)) evidence.distribution.slice(0, 6).forEach((value, index) => { distribution[index] += count(value) })
    const community = node.properties?.['visual:community']
    if ((typeof community === 'number' && Number.isFinite(community)) || (typeof community === 'string' && community.trim())) {
      const key = String(community), labels = clusters.get(key) ?? []
      if (labels.length < 5) labels.push(String(node.label || node.id))
      clusters.set(key, labels)
    }
  }
  const analysis = graph?.metadata?.keywordAnalysis
  const bounded = isPlainObject(analysis) && analysis.truncated === true
  return [{
    id: 'keyword-evidence', title: 'Text evidence', cadence: bounded ? 'Partial text scan · retained keywords' : 'Retained keywords · current graph',
    cards: [
      { id: 'keyword-occurrences', title: 'Keyword Occurrences', subtitle: 'Observed counts, separate from ranking', kind: 'table', tone: 'blue', series: [],
        rows: sorted.slice(0, 24).map(node => ({ id: node.id, label: String(node.label || node.id), value: String(count(evidenceFor(node).frequency)), detail: `${count(evidenceFor(node).spread)} sentences · heuristic phrase` })) },
      { id: 'keyword-distribution', title: 'Term Distribution', subtitle: 'Six equal spans of the analyzed text', kind: 'bar', tone: 'green', rows: [],
        series: distribution.map((value, index) => ({ label: `${index + 1}/6`, value })), footnote: 'Overlapping phrases may share occurrences. Counts describe retained terms, not all words.' },
      { id: 'keyword-clusters', title: 'Cluster Terms', subtitle: 'Frequent terms in each existing community', kind: 'table', tone: 'amber', series: [],
        rows: Array.from(clusters, ([id, labels]) => ({ id, label: `Cluster ${id}`, value: labels.join(' · ') })).slice(0, 24) },
      { id: 'keyword-relationships', title: 'Relationship Evidence', subtitle: 'Associations and heuristic relations', kind: 'table', tone: 'slate', series: [],
        rows: (graph?.edges ?? []).filter(edge => edge.properties?.['keyword:evidenceKind']).slice(0, 24).map(edge => ({ id: edge.id,
          label: String(edge.label || 'Association'), value: String(edge.properties?.['keyword:evidenceKind']),
          detail: `Weighted strength ${count(edge.properties?.['strength:count']).toFixed(1)} · not an occurrence count or causal proof` })) },
    ],
  }]
}
