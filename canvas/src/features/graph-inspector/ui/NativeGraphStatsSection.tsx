import { useMemo } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useStatsSelection } from '@/features/graph-stats/hooks/useStatsSelection'
import { agentGraphSourceGroup, agentGraphGroupColor, agentGraphEdgeCertainty } from '@/features/agent-graph/agentGraphVisualEvidence'
import { impactSourcePath } from '@/features/graph-inspector/lib/nodeImpact'
import NodeImpactInspector from '@/features/graph-inspector/ui/NodeImpactInspector'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { normalizeAgentGraphObservation } from '../../../../../contracts/agent-graph-observation.mjs'

/** Native source evidence has no inferred text communities or similarity scores. */
export default function NativeGraphStatsSection() {
  const { datasetGraph: graph, renderedGraph, effectiveGraph, statsScope, setStatsScope } = useStatsSelection()
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const summary = useMemo(() => {
    if (!effectiveGraph) return null
    const groups = new Map<string, string[]>(), kinds = new Map<string, number>(), provenance = new Map<string, number>(), certainty = new Map<string, number>()
    for (const node of effectiveGraph.nodes) {
      const group = agentGraphSourceGroup(node)
      const members = groups.get(group) || []; members.push(node.id); groups.set(group, members)
      kinds.set(node.type, (kinds.get(node.type) || 0) + 1)
    }
    for (const edge of effectiveGraph.edges) {
      const kind = String(edge.properties?.['evidence:kind'] || 'unreported'), weight = agentGraphEdgeCertainty(edge)
      provenance.set(kind, (provenance.get(kind) || 0) + 1)
      certainty.set(weight, (certainty.get(weight) || 0) + 1)
    }
    return { groups: [...groups].sort(([a], [b]) => a.localeCompare(b)), kinds: [...kinds].sort(([a], [b]) => a.localeCompare(b)),
      provenance: [...provenance].sort(), certainty: [...certainty].sort(),
      modules: new Set(effectiveGraph.nodes.map(impactSourcePath).filter(Boolean)).size }
  }, [effectiveGraph])
  if (!graph || !effectiveGraph || !summary) return null
  const projection = graph.metadata?.agentGraphProjection as Record<string, unknown> | undefined
  const counts = projection?.counts as Record<string, unknown> | undefined
  let observation
  try { observation = normalizeAgentGraphObservation(projection?.observation) } catch { /* Retained invalid measurements stay unknown. */ }
  const measured = (value: number | null | undefined, unit = '') => typeof value === 'number' ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}` : 'Unknown'
  const count = (key: string) => typeof counts?.[key] === 'number' ? String(counts[key]) : 'Unknown'
  const focus = (nodeIds: string[]) => {
    useGraphStore.getState().selectNodesExpanded({ nodeIds, edgeIds: [], activeNodeId: nodeIds[0] || null, forceMulti: true })
    useGraphStore.getState().requestZoom('selection')
  }
  return <section aria-label="Native graph statistics" className="h-full min-h-0 overflow-auto p-3 text-xs">
    <h3 className="font-semibold">Codebase graph statistics</h3>
    <p>Captured snapshot: {count('sources')} files · {count('nodes')} nodes · {count('edges')} edges.</p>
    <p role="status">Loaded graph: {graph.nodes.length} nodes / {graph.edges.length} edges. Rendered: {renderedGraph?.nodes.length ?? 0} nodes / {renderedGraph?.edges.length ?? 0} edges.</p>
    <p>Inspection uses the loaded projection. Canvas limits do not delete source evidence; partial projections cannot describe the full repository.</p>
    <details className="my-3"><summary>Import execution</summary>
      {observation ? <>
        <p>Elapsed: {measured(observation.elapsedMs, ' ms')} · Host CPU: {measured(observation.cpu.totalMs, ' ms')}.</p>
        <p>Host memory (RSS): {measured(observation.memory.rssBeforeBytes, ' bytes')} → {measured(observation.memory.rssAfterBytes, ' bytes')}.</p>
        <p>Host JS heap: {measured(observation.memory.heapUsedBeforeBytes, ' bytes')} → {measured(observation.memory.heapUsedAfterBytes, ' bytes')}.</p>
        <p>Parsed: {measured(observation.sources.parsed)} files · Reused: {measured(observation.sources.reused)} files · Admitted: {measured(observation.sources.admittedBytes, ' bytes')}.</p>
        <p>Result: {measured(observation.output.bytes, ' bytes')} before measurement metadata.</p>
        <p>Native model calls: 0 · Model tokens: 0 · Native model cost: $0.</p>
        <p>CPU and memory cover the host process, may include concurrent work, and exclude parser subprocesses. Memory is sampled at the start and end; peak use is unknown. Model cost excludes adapters and infrastructure.</p>
      </> : <p>Execution measurements are unavailable for this captured import.</p>}
    </details>
    <div role="group" aria-label="Stats scope" className="my-2 flex gap-2">
      {(['auto', 'dataset', 'selection'] as const).map(scope => <button type="button" key={scope}
        aria-pressed={statsScope === scope} className={`App-toolbar__btn ${UI_THEME_TOKENS.button.hoverBg}`}
        onClick={() => setStatsScope(scope)}>{scope === 'auto' ? 'Auto' : scope === 'dataset' ? 'Loaded graph' : 'Selection'}</button>)}
    </div>
    <p>Current scope: {effectiveGraph === graph ? 'Loaded graph' : 'Selection'} · {effectiveGraph.nodes.length} nodes · {effectiveGraph.edges.length} edges · {summary.modules} source-file modules · {summary.groups.length} source groups.</p>
    <details open className="mt-3"><summary>Source groups</summary>
      <p>Captured top-level directories, shared with Renderer colors and Workflow Manager layers.</p>
      <ul>{summary.groups.slice(0, 32).map(([group, ids]) => <li key={group} className="flex gap-2 py-1">
        <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: agentGraphGroupColor(group) }} />
        <button className="break-all text-left underline" type="button" onClick={() => focus(ids)}>{group}</button><span>{ids.length} nodes</span>
      </li>)}</ul>
      {summary.groups.length > 32 && <p>Showing 32 of {summary.groups.length} groups.</p>}
    </details>
    <details className="mt-3"><summary>Node kinds and relationship evidence</summary>
      <p>Node kinds: {summary.kinds.map(([kind, n]) => `${kind}: ${n}`).join(' · ')}</p>
      <p>Edge provenance: {summary.provenance.map(([kind, n]) => `${kind}: ${n}`).join(' · ') || 'No relationships'}</p>
      <p>Edge certainty: {summary.certainty.map(([kind, n]) => `${kind}: ${n}`).join(' · ') || 'No relationships'}</p>
    </details>
    <NodeImpactInspector nodeId={selectedNodeId} />
  </section>
}
