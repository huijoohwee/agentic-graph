import type { DashboardMetric } from '@/components/DashboardCanvas/dashboardModel'
import type { WorkspaceCodebaseIndex } from '@/features/agent-graph/agentGraphWorkspaceIndex'
import { known, numberLabel, record, traceResources, type RunTrace } from './missionControlProjection'
import { spanMetricLabel, type SpanMetric } from './agentRunSpanMetric'
import type { GraphData } from '@/lib/graph/types'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { inspectNodeImpact, impactSourcePath } from '@/features/graph-inspector/lib/nodeImpact'
import type { TraceSpan } from './missionControlProjection'

/** Only exact recorded component identities bind a span to code; names are never fuzzy matched. */
export function agentMissionSpanImpact(span: TraceSpan | null, graph: GraphData | null) {
  const empty = { nodeIds: [] as string[], edgeIds: [] as string[], incomplete: false }
  if (!span || !graph) return { ...empty, reason: 'Select a span to inspect its codebase impact.' }
  const lookup = getCachedGraphLookup({ cacheScope: 'mission-codebase', graphData: graph })!
  const identity = record(graph.metadata?.agentGraphProjection), digest = span.component.digest
  if (!/^[a-f0-9]{64}$/.test(digest)) return { ...empty, reason: 'Impact unobserved: this span has no source digest.' }
  const matchingPaths = new Set(graph.edges.filter(edge => edge.properties['evidence:sourceDigest'] === digest)
    .map(edge => String(edge.properties['evidence:sourcePath'])))
  const anchors = graph.nodes.filter(node =>
    digest === identity.snapshotDigest && node.id === span.component.id
    || impactSourcePath(node) === span.component.id && matchingPaths.has(span.component.id))
  if (!anchors.length) return { ...empty, reason: 'Impact unobserved: no exact component/source binding in this snapshot projection.' }
  const nodes = new Set(anchors.map(node => node.id)), edges = new Set<string>()
  let incomplete = anchors.length > 32
  // Reuse the same bounded native neighborhood traversal as the node impact inspector.
  for (const node of anchors.slice(0,32)) for (const direction of ['incoming', 'outgoing'] as const) {
    const impact = inspectNodeImpact(lookup, node.id, 1, direction)
    impact?.nodeIds.forEach(id => nodes.add(id)); impact?.edgeIds.forEach(id => edges.add(id))
    incomplete ||= impact?.incomplete === true
  }
  return { nodeIds: [...nodes], edgeIds: [...edges], incomplete,
    reason: `${nodes.size} source-bound nodes · static one-hop impact${incomplete ? ' · Partial projection' : ''}. Runtime execution is not inferred.` }
}

/** Presentation over retained evidence. Indexing and workflow consumption never share a total. */
export function agentMissionOverviewModel(trace: RunTrace, index?: WorkspaceCodebaseIndex) {
  const value = index?.value ?? {}, counts = record(value.counts), projection = record(value.projection)
  const observation = record(value.observation), model = record(observation.model), sources = record(observation.sources)
  const resources = traceResources(trace), workflow = record(trace.profile.workflow)
  const metric = (id: string, label: string, value: number | null, unit: SpanMetric, detail: string): DashboardMetric =>
    ({ id, label, value: spanMetricLabel(value, unit), detail, tone: 'blue' })
  const input = known(model.promptTokens), output = known(model.completionTokens)
  const roots = trace.spans.filter(span => !span.parentSpanId && span.status !== 'reused')
  const wall = trace.localObservation?.elapsedMs ?? (roots.length === 1 ? known(roots[0]!.timing.inclusive) : null)
  return {
    sources: numberLabel(known(counts.sources)), nodes: numberLabel(known(counts.nodes)), edges: numberLabel(known(counts.edges)),
    parsed: numberLabel(known(sources.parsed)), reused: numberLabel(known(sources.reused)),
    loadedNodes: numberLabel(known(projection.loadedNodes)), loadedEdges: numberLabel(known(projection.loadedEdges)),
    truncated: projection.truncated === true, complete: value.complete === true,
    model: typeof model.id === 'string' ? model.id : known(model.calls) === 0 ? 'Native · no model calls' : 'Model unreported',
    modelCalls: numberLabel(known(model.calls)),
    indexMetrics: [
      metric('index-time', 'Index time', known(observation.elapsedMs), 'time', 'Captured import'),
      metric('index-cpu', 'Index CPU', known(record(observation.cpu).totalMs), 'cpuMs', 'Process window'),
      metric('index-rss', 'Index RSS', known(record(observation.memory).rssAfterBytes), 'peakMemoryBytes', 'Process sample after import'),
      metric('index-tokens', 'Index tokens', input === null || output === null ? null : input + output, 'tokens', 'Captured model usage'),
      metric('index-cost', 'Index model cost', known(model.costUsd), 'costUsd', 'Native runtime scope'),
    ],
    workflowMetrics: [
      metric('mission-time', 'Run time', wall, 'time', 'Observed root; separate clocks stay unknown'),
      metric('mission-cpu', 'Run CPU', resources.cpuMs, 'cpuMs', 'Observed retained spans'),
      metric('mission-rss', 'Run peak RSS', resources.peakMemoryBytes, 'peakMemoryBytes', 'Maximum reported process'),
      metric('mission-tokens', 'Run tokens', resources.tokens, 'tokens', 'Reported consumption'),
      metric('mission-cost', 'Run model cost', resources.costUsd, 'costUsd', 'Estimated; cash unreported'),
    ],
    worktrees: Array.isArray(workflow.members) ? workflow.members.length : null,
    missing: Array.isArray(workflow.missing) ? workflow.missing.map(String) : [],
    evaluation: trace.evaluation.status || 'unobserved', evaluationScore: numberLabel(known(trace.evaluation.score)),
  }
}
