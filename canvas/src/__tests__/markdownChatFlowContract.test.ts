import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphUsesLeadingAgenticOsBlockOnlyAndDedupesEdges() {
  const md = [
    '---',
    'doc:',
    '  id: "doc:agenticOs:turn:demo"',
    '  type: chatagentic-graph',
    'flow:',
    '  nodes:',
    '    - id: n-in',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-out',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - id: e-front',
    '      source: n-in.turn',
    '      target: n-out.turn',
    '---',
    '',
    '# Trailing chat history',
    '',
    '| Edge | From port | To port | Type |',
    '|---|---|---|---|',
    '| e-history | `n-in.turn` | `n-out.turn` | `STRING` |',
    '',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-chat.md', md)
  if (!res) throw new Error('expected chatAgenticGraph frontmatter-flow parse result')

  const g = res.graphData
  if (g.nodes.length !== 2) throw new Error(`expected 2 nodes from leading AGENTIC_OS block, got ${g.nodes.length}`)
  if (g.edges.length !== 1) throw new Error(`expected 1 deduped edge from leading AGENTIC_OS block, got ${g.edges.length}`)
  const edge = g.edges[0]
  if (String(edge.source || '') !== 'n-in' || String(edge.target || '') !== 'n-out') {
    throw new Error('expected canonical edge endpoints without @node prefix drift')
  }
}

export function testMarkdownFrontmatterFlowGraphFlowBlockParsesDottedEdgeEndpointsForWidgetLinks() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
    'flow:',
    '  nodes:',
    '    - id: n-in',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-out',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - source: n-in.turn',
    '      target: n-out.turn',
    '      label: "responds"',
    '---',
    '',
    '# trailing history',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-dotted-flow-edges.md', md)
  if (!res) throw new Error('expected frontmatter flow parse result')
  if (res.graphData.edges.length !== 1) throw new Error(`expected 1 parsed edge, got ${res.graphData.edges.length}`)
  const edge = res.graphData.edges[0]!
  const props = (edge.properties || {}) as Record<string, unknown>
  if (String(edge.source || '') !== 'n-in' || String(edge.target || '') !== 'n-out') {
    throw new Error('expected dotted endpoints to resolve to node ids')
  }
  if (String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'turn') throw new Error('expected source port from dotted endpoint')
  if (String(props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'turn') throw new Error('expected target port from dotted endpoint')
  if (String(edge.label || '') !== 'responds') throw new Error('expected label from dotted flow edge declaration')
}

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphKeepsOutputSourceHandlesForWidgetEdgeAnchors() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
    'flow:',
    '  nodes:',
    '    - id: n-in',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-out',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '        source: [detail]',
    '  edges:',
    '    - source: n-in.turn',
    '      target: n-out.turn',
    '    - source: n-out.detail',
    '      target: n-in.turn',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-output-source-handle.md', md)
  if (!res) throw new Error('expected chatAgenticGraph flow parse result')
  const registry = ((res.graphData.metadata || {}) as Record<string, unknown>)['flow:widgetRegistry']
  if (!Array.isArray(registry)) throw new Error('expected widget registry metadata')
  const form = registry.find((r: unknown) => {
    const rec = (r || {}) as Record<string, unknown>
    return String(rec.formId || '') === 'fm:n-out'
  }) as Record<string, unknown> | undefined
  if (!form) throw new Error('expected n-out widget form registry entry')
  const ports = Array.isArray(form.ports) ? (form.ports as Array<Record<string, unknown>>) : []
  const hasDetailOutput = ports.some(p => String(p.portKey || '') === 'detail' && String(p.direction || '') === 'output')
  if (!hasDetailOutput) throw new Error('expected chatAgenticGraph output node to keep source handle detail for widget edge anchors')
}

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphKeepsTurnEdgeDirectionAndHandleMapping() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
    'flow:',
    '  nodes:',
    '    - id: n-recommend-solo-founder-z',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-solution-1-use-case-prob',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '        source: [detail]',
    '  edges:',
    '    - source: n-recommend-solo-founder-z.turn',
    '      target: n-solution-1-use-case-prob.turn',
    '      label: "responds"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-turn-direction.md', md)
  if (!res) throw new Error('expected chatAgenticGraph flow parse result')
  if (res.graphData.edges.length !== 1) throw new Error(`expected exactly 1 edge, got ${res.graphData.edges.length}`)
  const e = res.graphData.edges[0]!
  const props = (e.properties || {}) as Record<string, unknown>
  if (String(e.source || '') !== 'n-recommend-solo-founder-z') {
    throw new Error('expected source node to remain n-recommend-solo-founder-z')
  }
  if (String(e.target || '') !== 'n-solution-1-use-case-prob') {
    throw new Error('expected target node to remain n-solution-1-use-case-prob')
  }
  if (String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'turn') {
    throw new Error('expected source handle mapping to port turn')
  }
  if (String(props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'turn') {
    throw new Error('expected target handle mapping to port turn')
  }
  if (String(e.label || '') !== 'responds') {
    throw new Error('expected edge label responds')
  }
}

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphFlowBlockOverridesLegacyTopLevelNodesAndEdges() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
    'nodes:',
    '  - id: legacy-a',
    '    label: "Legacy A"',
    '  - id: legacy-b',
    '    label: "Legacy B"',
    'edges:',
    '  - source: legacy-a.turn',
    '    target: legacy-b.turn',
    '    label: "legacy-edge"',
    'flow:',
    '  nodes:',
    '    - id: flow-a',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: flow-b',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - source: flow-a.turn',
    '      target: flow-b.turn',
    '      label: "flow-edge"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-flow-overrides-legacy.md', md)
  if (!res) throw new Error('expected parse result')
  const nodeIds = new Set((res.graphData.nodes || []).map(n => String(n.id || '')))
  if (nodeIds.has('legacy-a') || nodeIds.has('legacy-b')) {
    throw new Error('expected legacy top-level nodes to be ignored when flow block is present')
  }
  if (!nodeIds.has('flow-a') || !nodeIds.has('flow-b')) {
    throw new Error('expected only flow block nodes to remain')
  }
  if (res.graphData.edges.length !== 1) throw new Error(`expected only 1 flow edge, got ${res.graphData.edges.length}`)
  const e = res.graphData.edges[0]!
  if (String(e.source || '') !== 'flow-a' || String(e.target || '') !== 'flow-b' || String(e.label || '') !== 'flow-edge') {
    throw new Error('expected only flow block edge to remain')
  }
}

