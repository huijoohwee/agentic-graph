import type { GraphData } from '@/lib/graph/types'
import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
import { agentGraphSourceGroup, agentGraphGroupColor, AGENT_GRAPH_CERTAINTY_STYLES } from '@/features/agent-graph/agentGraphVisualEvidence'

export function NodeEvidenceLegend({ graph }: { graph: GraphData }) {
  const native = isReadOnlyAgentGraphProjection(graph) && graph.metadata?.agentGraphVisualEvidence === 'source-directory-certainty/v1'
  const groups = native ? [...new Set(graph.nodes.map(agentGraphSourceGroup))].sort() : []
  return <details className="mt-2"><summary>Legend</summary>
    {native && <>
      <h4 className="mt-2 font-semibold">Node color</h4>
      <p>Color groups nodes by their captured top-level source directory. It does not represent quality or certainty. Colors can repeat; the directory label identifies each group.</p>
      <ul>{groups.slice(0, 12).map(group => <li key={group} className="flex items-center gap-2 break-all">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: agentGraphGroupColor(group) }} />{group}
      </li>)}</ul>
      {groups.length > 12 && <p>Showing 12 of {groups.length} source groups. Use path: to narrow the finder.</p>}
      <h4 className="mt-2 font-semibold">Edge weight and line style</h4>
      <p>Thickness and pattern show captured certainty, not traffic or probability. Selection and animation may add emphasis.</p>
      <ul>{Object.entries(AGENT_GRAPH_CERTAINTY_STYLES).map(([key, style]) => <li key={key} className="flex items-center gap-2">
        <svg width="32" height="12" aria-hidden="true"><line x1="0" x2="32" y1="6" y2="6" stroke="currentColor" strokeWidth={style.width} strokeDasharray={style.dash} /></svg>
        {style.label}
      </li>)}</ul>
    </>}
    <h4 className="mt-2 font-semibold">Provenance</h4>
    <p>Extracted: explicit source evidence. Inferred: a derived relationship. Ambiguous: unresolved evidence. Unreported: provenance was not captured.</p>
    <p>Runtime observations or synthesized statements require their own captured provenance; a static parse never implies either.</p>
    <p>Incoming points toward a node; outgoing points away. One hop follows one relationship. Most connected counts distinct incident relationships, including each self-link once.</p>
    <p>Provenance from incident edges describes those relationships, not a verified classification of the node. Counts cover the loaded graph.</p>
    {!native && <p>Canvas colors and line styles follow the current renderer settings.</p>}
  </details>
}
