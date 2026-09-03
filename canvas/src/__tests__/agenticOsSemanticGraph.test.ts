import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { builtInParsers, toParserId } from '@/features/parsers'
import {
  AGENTIC_OS_SEMANTIC_GRAPH_KIND,
  parseAgenticOsSemanticGraphFromMarkdown,
} from '@/features/parsers/agenticOsSemanticGraph'
import {
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
} from '@/lib/graph/flowPorts'
import { parseWorkspaceAgenticOsSemanticGraphDataCached } from '@/hooks/active-graph-data/workspaceStructuredGraph'
import {
  ancestorsAgenticOsSemanticNodeIds,
  bfsAgenticOsSemanticPath,
  descendantsAgenticOsSemanticNodeIds,
  filterAgenticOsSemanticNodeIdsByType,
  searchAgenticOsSemanticNodeIds,
} from '@/lib/graph/agenticOsSemanticQuery'
import type { GraphData } from '@/lib/graph/types'

const arrow = '\u2192'

const buildAgenticOsSemanticFixture = () => [
  '---',
  'title: "Portable Economics Contract"',
  'schema: "agentic-os-computing-flow/v1"',
  'node_types:',
  '  - metric',
  '  - lever',
  '  - cost',
  'edge_predicates:',
  '  - caps',
  '  - drives',
  '---',
  '',
  '# Portable Economics Contract',
  '',
  'Template placeholders `@node:{type}:{id}` and `@edge:{predicate}:{source}->{target}` are docs, not graph declarations.',
  '',
  'Declare `@node:metric:prompt_tokens` and `@node:lever:token_budget` in prose.',
  '',
  `Trace budget with \`@edge:caps:token_budget${arrow}prompt_tokens\`.`,
  `Trace actual spend with \`@edge:drives:prompt_tokens${arrow}estimated_cost_usd\`.`,
].join('\n')

const requireGraph = (): GraphData => {
  const parsed = parseAgenticOsSemanticGraphFromMarkdown({
    name: 'portable-economics.md',
    text: buildAgenticOsSemanticFixture(),
  })
  if (!parsed) throw new Error('expected AGENTIC_OS semantic graph parse result')
  if (parsed.warnings.length !== 0) throw new Error(`expected no parser warnings, got ${parsed.warnings.join('; ')}`)
  return parsed.graphData
}

export function testAgenticOsSemanticGraphParsesTypedSigilsWithoutLegacyRemap() {
  const graph = requireGraph()
  const meta = (graph.metadata || {}) as Record<string, unknown>
  if (meta.kind !== AGENTIC_OS_SEMANTIC_GRAPH_KIND) throw new Error('expected AGENTIC_OS semantic graph metadata kind')
  if (typeof meta.graphSemanticKey !== 'string' || !meta.graphSemanticKey) {
    throw new Error('expected AGENTIC_OS semantic graph to publish a shared graph semantic key')
  }
  const nodeById = new Map((graph.nodes || []).map(node => [String(node.id), node]))
  const prompt = nodeById.get('prompt_tokens')
  const budget = nodeById.get('token_budget')
  const estimated = nodeById.get('estimated_cost_usd')
  if (!prompt || !budget || !estimated) throw new Error('expected explicit and inferred AGENTIC_OS nodes')
  if (prompt.type !== 'metric') throw new Error(`expected prompt_tokens type metric, got ${prompt.type}`)
  if (budget.type !== 'lever') throw new Error(`expected token_budget type lever, got ${budget.type}`)
  if ((estimated.properties || {})['agentic-os:inferredFromEdge'] !== true) {
    throw new Error('expected edge-only endpoint to be marked as inferred, not duplicated')
  }
  const caps = (graph.edges || []).find(edge => edge.label === 'caps')
  const drives = (graph.edges || []).find(edge => edge.label === 'drives')
  if (!caps || caps.source !== 'token_budget' || caps.target !== 'prompt_tokens') {
    throw new Error('expected caps edge to retain directed source and target')
  }
  if (!drives || drives.source !== 'prompt_tokens' || drives.target !== 'estimated_cost_usd') {
    throw new Error('expected drives edge to retain directed source and target')
  }

  const legacyOnly = parseAgenticOsSemanticGraphFromMarkdown({
    name: 'legacy.md',
    text: ['# Legacy', 'A legacy reference `@node:n-trigger` should stay a reference, not a typed node.'].join('\n'),
  })
  if (legacyOnly) throw new Error('expected untyped legacy @node reference to stay out of the AGENTIC_OS typed graph parser')
}

export function testAgenticOsSemanticQueryEnginePathFilterSearchAncestorsDescendants() {
  const graph = requireGraph()
  const path = bfsAgenticOsSemanticPath({
    graphData: graph,
    startId: 'token_budget',
    endId: 'estimated_cost_usd',
  })
  if (path.join('>') !== 'token_budget>prompt_tokens>estimated_cost_usd') {
    throw new Error(`expected shortest directed budget path, got ${path.join('>')}`)
  }
  const levers = filterAgenticOsSemanticNodeIdsByType({ graphData: graph, type: 'lever' })
  if (levers.join(',') !== 'token_budget') throw new Error(`expected lever filter to return token_budget, got ${levers.join(',')}`)
  const search = searchAgenticOsSemanticNodeIds({ graphData: graph, term: 'estimated cost' })
  if (search.join(',') !== 'estimated_cost_usd') throw new Error(`expected search to find estimated_cost_usd, got ${search.join(',')}`)
  const ancestors = ancestorsAgenticOsSemanticNodeIds({ graphData: graph, nodeId: 'estimated_cost_usd' })
  if (ancestors.join(',') !== 'prompt_tokens,token_budget') {
    throw new Error(`expected transitive ancestors, got ${ancestors.join(',')}`)
  }
  const descendants = descendantsAgenticOsSemanticNodeIds({ graphData: graph, nodeId: 'token_budget' })
  if (descendants.join(',') !== 'estimated_cost_usd,prompt_tokens') {
    throw new Error(`expected transitive descendants, got ${descendants.join(',')}`)
  }
}

export function testWorkspaceAgenticOsSemanticGraphFeedsActiveRendererGraphWithDocumentStructure() {
  const graph = parseWorkspaceAgenticOsSemanticGraphDataCached({
    markdownName: 'portable-economics.md',
    markdownText: buildAgenticOsSemanticFixture(),
  })
  if (!graph) throw new Error('expected workspace AGENTIC_OS semantic graph')
  const nodeIds = new Set((graph.nodes || []).map(node => String(node.id || '')))
  if (!nodeIds.has('token_budget') || !nodeIds.has('prompt_tokens')) {
    throw new Error('expected workspace graph to include AGENTIC_OS semantic nodes')
  }
  if (!nodeIds.has('doc:md:portable-economics')) {
    throw new Error('expected workspace graph to retain Markdown document structure nodes')
  }
  const meta = (graph.metadata || {}) as Record<string, unknown>
  if (meta.kind !== AGENTIC_OS_SEMANTIC_GRAPH_KIND || meta.graphKind !== AGENTIC_OS_SEMANTIC_GRAPH_KIND) {
    throw new Error('expected workspace graph metadata to preserve AGENTIC_OS semantic graph kind')
  }
}

export function testAgenticOsSemanticGraphSuppressesKeywordReDerivationInActiveGraphOwner() {
  const source = readFileSync(resolve(process.cwd(), 'src/hooks/active-graph-data/useActiveGraphData.impl.ts'), 'utf8')
  const blockStart = source.indexOf('const hasStructuredWorkspaceGraph =')
  const blockEnd = source.indexOf('const { graphData: apiGraphFlowchart } =', blockStart)
  const structuredBlock = blockStart >= 0
    ? source.slice(blockStart, blockEnd >= 0 ? blockEnd : blockStart + 400)
    : ''
  if (!structuredBlock.includes('workspaceAgenticOsSemanticGraphData')) {
    throw new Error('expected AGENTIC_OS semantic Markdown to count as a structured workspace graph and suppress keyword re-derivation')
  }
}

export function testMarkdownParserMergesAgenticOsSemanticGraphIntoNeutralMarkdownGraph() {
  const parser = builtInParsers.find(spec => spec.id === toParserId('markdown'))
  if (!parser) throw new Error('expected built-in markdown parser')
  const result = parser.parse('portable-economics.md', buildAgenticOsSemanticFixture())
  const graph = result.graphData
  const nodeIds = new Set((graph.nodes || []).map(node => String(node.id || '')))
  if (!nodeIds.has('doc:md:portable-economics')) throw new Error('expected Markdown parser to retain document node')
  if (!nodeIds.has('token_budget') || !nodeIds.has('estimated_cost_usd')) {
    throw new Error('expected Markdown parser to merge AGENTIC_OS semantic nodes')
  }
  const meta = (graph.metadata || {}) as Record<string, unknown>
  if (meta.kind !== AGENTIC_OS_SEMANTIC_GRAPH_KIND) throw new Error('expected merged graph kind to be AGENTIC_OS semantic')
}

export function testMarkdownParserPreservesTypedFlowBlockEdgesWhenAgenticOsSemanticMerges() {
  const parser = builtInParsers.find(spec => spec.id === toParserId('markdown'))
  if (!parser) throw new Error('expected built-in markdown parser')
  const typedFlowEdgeFixture = [
    '---',
    'title: Typed Flow Edge Contract',
    'schema: agentic-os-computing-flow/v1',
    'kgCanvas2dRenderer: storyboard',
    'kgFrontmatterModeEnabled: true',
    'node_types:',
    '  - metric',
    'edge_predicates:',
    '  - drives',
    'socket_types:',
    '  metric_signal: { color: "#8DB3FF", accepts: [metric_signal] }',
    'flow:',
    '  direction: LR',
    '  edgeType: bezier',
    '  nodes:',
    '    - id: source_card',
    '      type: default',
    '      label: Source Card',
    '      Widget: {key: Widget, type: string, value: qer-fm-SourceWidget}',
    '      handles:',
    '        source: [out_metric]',
    '      "flow:portTypes": {key: flow:portTypes, type: object, value: {out: {out_metric: metric_signal}}}',
    '    - id: target_card',
    '      type: default',
    '      label: Target Card',
    '      Widget: {key: Widget, type: string, value: qer-fm-TargetWidget}',
    '      handles:',
    '        target: [in_metric]',
    '      "flow:portTypes": {key: flow:portTypes, type: object, value: {in: {in_metric: metric_signal}}}',
    '  edges:',
    '    - id: {key: id, type: string, value: typed-flow-edge}',
    '      source: {key: source, type: string, value: source_card}',
    '      sourceHandle: {key: sourceHandle, type: string, value: out_metric}',
    '      target: {key: target, type: string, value: target_card}',
    '      targetHandle: {key: targetHandle, type: string, value: in_metric}',
    '      label: {key: label, type: string, value: out_metric}',
    '      type: {key: type, type: string, value: metric_signal}',
    '      animated: {key: animated, type: boolean, value: true}',
    '---',
    '',
    '# Typed Flow Edge Contract',
    '',
    'Declare `@node:metric:semantic_metric` and keep Storyboard Widget card wiring separate.',
    `Trace semantic evidence with \`@edge:drives:semantic_metric${arrow}semantic_result\`.`,
  ].join('\n')
  const result = parser.parse('typed-flow-edge-contract.md', typedFlowEdgeFixture)
  if (result.warnings.length !== 0) throw new Error(`expected no parser warnings, got ${result.warnings.join('; ')}`)
  const graph = result.graphData
  const meta = (graph.metadata || {}) as Record<string, unknown>
  if (meta.kind !== AGENTIC_OS_SEMANTIC_GRAPH_KIND) throw new Error('expected merged graph kind to be AGENTIC_OS semantic')
  if (String(meta.baseGraphKind || '') !== 'frontmatter-flow') {
    throw new Error(`expected merged graph to retain frontmatter-flow base kind, got ${String(meta.baseGraphKind || '')}`)
  }
  const flowEdge = (graph.edges || []).find(edge => String(edge.id || '') === 'typed-flow-edge')
  if (!flowEdge) throw new Error('expected typed frontmatter flow edge to survive AGENTIC_OS semantic merge')
  if (String(flowEdge.source || '') !== 'source_card' || String(flowEdge.target || '') !== 'target_card') {
    throw new Error('expected typed frontmatter flow edge to retain card endpoints')
  }
  const props = (flowEdge.properties || {}) as Record<string, unknown>
  if (String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'out_metric') {
    throw new Error('expected typed frontmatter flow edge to retain source handle')
  }
  if (String(props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'in_metric') {
    throw new Error('expected typed frontmatter flow edge to retain target handle')
  }
  if (props['flow:animated'] !== true) throw new Error('expected typed frontmatter flow edge to retain animated flag')
  const semanticEdge = (graph.edges || []).find(edge => String(edge.id || '').startsWith('agentic-os-edge:drives:'))
  if (!semanticEdge) throw new Error('expected AGENTIC_OS semantic edge to remain merged alongside Storyboard Widget edge')
}
