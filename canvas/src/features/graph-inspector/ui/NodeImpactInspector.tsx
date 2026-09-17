import { useMemo, useState } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { inspectNodeImpact, impactExplanation, rankImpactNodes, filterImpactNodes, type ImpactDirection } from '../lib/nodeImpact'

export default function NodeImpactInspector({ nodeId }: { nodeId: string | null }) {
  const graphData = useGraphStore(s => s.graphData)
  const graphRevision = useGraphStore(s => s.graphDataRevision)
  const [query, setQuery] = useState('')
  const [depth, setDepth] = useState(2)
  const [direction, setDirection] = useState<ImpactDirection>('incoming')
  const result = useMemo(() => {
    if (!graphData) return { lookup: null, impact: null, error: null }
    try {
      if (graphData.nodes.length > 2000 || graphData.edges.length > 5000) throw new Error('Impact inspection supports at most 2,000 loaded nodes and 5,000 edges. Narrow the graph first.')
      const lookup = getCachedGraphLookup({ cacheScope: 'node-impact', graphData, graphRevision,
        graphSemanticKey: buildScopedGraphSemanticKey('node-impact', { graphData, graphRevision }), preferCurrentGraphDataRefs: true })
      return { lookup, impact: nodeId ? inspectNodeImpact(lookup, nodeId, depth, direction) : null, error: null }
    } catch (error) { return { lookup: null, impact: null, error: error instanceof Error ? error.message : 'Impact inspection failed.' } }
  }, [graphData, graphRevision, nodeId, depth, direction])
  const { lookup, impact, error } = result
  const ranked = useMemo(() => lookup ? rankImpactNodes(lookup) : [], [lookup])
  const found = useMemo(() => filterImpactNodes(ranked, query), [ranked, query])
  const selected = ranked.find(row => row.node.id === nodeId)
  const buttonClass = `App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`
  if (error) return <p role="alert" className="px-3 py-2 text-xs">{error}</p>
  if (!lookup) return null
  const selectNode = (id: string) => useGraphStore.getState().selectNode(id)
  return <><section aria-label="Find a node" className="min-w-0 px-3 py-2 text-xs">
    <label className="block font-semibold" htmlFor="impact-node-search">Find a node</label>
    <input id="impact-node-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
      className={`mt-2 w-full min-w-0 rounded border p-2 ${UI_THEME_TOKENS.panel.border}`}
      placeholder="Name, kind:function path:src/ prov:extracted" />
    <p className="mt-1">Filter by kind, path, or provenance using kind:, path:, prov:.</p>
    <h3 className="mt-2 font-semibold">Most connected</h3>
    <p aria-live="polite">{found.length} matching nodes in the loaded graph.</p>
    <ul className="mt-1 space-y-2">{found.slice(0, 8).map(row => <li key={row.node.id} className="min-w-0 break-words">
      <button type="button" className="underline" onClick={() => selectNode(row.node.id)}>{String(row.node.label || row.node.id)}</button>
      <span> · {row.degree} relationships</span>
      <p>kind: {row.kind} · path: {row.path || 'unreported'} · prov: {row.provenance} ({row.provenanceBasis})</p>
    </li>)}</ul>
    {found.length > 8 && <p>Showing the 8 most connected matches.</p>}
    <details className="mt-2"><summary>Legend</summary>
      <p>Extracted: explicit source evidence. Inferred: a derived relationship. Ambiguous: unresolved evidence. Unreported: provenance was not captured.</p>
      <p>Incoming points toward a node; outgoing points away. One hop follows one relationship. Most connected counts distinct incident relationships, including each self-link once.</p>
      <p>Provenance from incident edges describes those relationships, not a verified classification of the node. Counts cover the loaded graph. Canvas colors and line styles follow its current renderer settings.</p>
    </details>
  </section>{impact && <section aria-label="Blast radius" className={`min-w-0 border-b px-3 py-2 text-xs ${UI_THEME_TOKENS.panel.divider}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Blast radius</h3>
      <button className={buttonClass} type="button" onClick={() => useGraphStore.getState().selectNodesExpanded({
        nodeIds: impact.nodeIds, edgeIds: impact.edgeIds, activeNodeId: nodeId, forceMulti: true,
      })}>Show on canvas</button>
    </div>
    {selected && <p className="mt-2 break-words">kind: {selected.kind} · path: {selected.path || 'unreported'} · prov: {selected.provenance} ({selected.provenanceBasis})</p>}
    <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Depth">
      <span>Depth</span>{[1, 2, 3].map(value => <button key={value} type="button" className={buttonClass}
        aria-pressed={value === depth} onClick={() => setDepth(value)}>{value}</button>)}
    </div>
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Impact direction">
      {(['incoming', 'outgoing'] as const).map(value => <button key={value} type="button" className={buttonClass}
        aria-pressed={direction === value} onClick={() => setDirection(value)}>{value === 'incoming' ? 'Incoming' : 'Outgoing'}</button>)}
    </div>
    <p className="mt-2" aria-live="polite">Nodes affected: <strong>{impact.affected.length}</strong></p>
    <p>{impact.affected.length} {impact.affected.length === 1 ? 'node' : 'nodes'} across {impact.fileCount} {impact.fileCount === 1 ? 'file' : 'files'} could be affected within {depth} {depth === 1 ? 'hop' : 'hops'}.</p>
    <p className={UI_THEME_TOKENS.text.tertiary}>Potential reach in the loaded graph; {direction === 'incoming' ? 'following references toward this node' : 'following references from this node'}.</p>
    {impact.incomplete && <p role="status">Partial graph: these counts are a lower bound.</p>}
    {impact.unknownFiles > 0 && <p>{impact.unknownFiles} affected nodes have no captured source file.</p>}
    <ul aria-label="Affected nodes" className="mt-2 space-y-1">
      {impact.affected.slice(0, 32).map(({ node, hops }) => <li key={node.id} className="flex min-w-0 justify-between gap-2">
        <button type="button" className="min-w-0 truncate text-left underline" onClick={() => selectNode(node.id)} title={String(node.label || node.id)}>{String(node.label || node.id)}</button>
        <span className="shrink-0">{hops} {hops === 1 ? 'hop' : 'hops'}</span>
      </li>)}
    </ul>
    {impact.affected.length > 32 && <p>Showing 32 of {impact.affected.length} affected nodes.</p>}
    {(['outgoing', 'incoming'] as const).map(value => <details key={value} className="mt-2">
      <summary>{value === 'incoming' ? 'Incoming' : 'Outgoing'} ({impact[value].length})</summary>
      <ul className="mt-1 space-y-2">{impact[value].slice(0, 32).map(edge => {
        const other = value === 'incoming' ? edge.source : edge.target
        return <li key={edge.id} className="min-w-0 break-words">
          <button type="button" className="underline" onClick={() => selectNode(other)}>{edge.label || 'related'}: {other}</button>
          <p>{impactExplanation(edge)}</p>
        </li>
      })}</ul>
      {impact[value].length > 32 && <p>Showing 32 of {impact[value].length} relationships.</p>}
    </details>)}
  </section>}</>
}
