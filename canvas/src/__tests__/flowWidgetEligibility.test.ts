import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import type { GraphData } from '@/lib/graph/types'
import { filterGraphToFlowWidgetEligible } from '@/lib/graph/flowWidgetEligibility'

export function testFlowWidgetEligibilityKeepsDottedEndpointEdges() {
  const graph: GraphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'n-a', type: 'input', label: 'A', properties: { 'flow:widgetFormId': 'fm:n-a' } },
      { id: 'n-b', type: 'default', label: 'B', properties: { 'flow:widgetFormId': 'fm:n-b' } },
      { id: 'n-x', type: 'Node', label: 'X', properties: {} },
    ],
    edges: [
      { id: 'e-1', label: 'e-1', source: 'n-a.out', target: 'n-b.in', properties: {} },
      { id: 'e-x', label: 'e-x', source: 'n-a.out', target: 'n-x.in', properties: {} },
    ],
    metadata: {},
  }

  const filtered = filterGraphToFlowWidgetEligible(graph)
  const nodeIds = (filtered.nodes || []).map(n => String(n.id || '')).sort()
  const edgeIds = (filtered.edges || []).map(e => String(e.id || '')).sort()
  if (nodeIds.join(',') !== 'n-a,n-b') {
    throw new Error(`expected filtered nodes n-a,n-b, got ${nodeIds.join(',')}`)
  }
  if (edgeIds.join(',') !== 'e-1') {
    throw new Error(`expected dotted endpoint edge e-1 to remain visible, got ${edgeIds.join(',')}`)
  }
}

export function testFlowWidgetEligibilityKeepsCanonicalWidgetTypesWithoutMetadata() {
  const graph: GraphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'w-text', type: FLOW_TEXT_GENERATION_NODE_TYPE_ID, label: 'OpenAI Text Widget', properties: {} },
      { id: 'p-media', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, label: 'Rich Media Panel', properties: {} },
      { id: 'n-plain', type: 'Node', label: 'Plain node', properties: {} },
    ],
    edges: [
      { id: 'e-text', label: 'e-text', source: 'w-text', target: 'p-media', properties: {} },
      { id: 'e-plain', label: 'e-plain', source: 'n-plain', target: 'p-media', properties: {} },
    ],
    metadata: {},
  }

  const filtered = filterGraphToFlowWidgetEligible(graph)
  const nodeIds = (filtered.nodes || []).map(n => String(n.id || '')).sort()
  const edgeIds = (filtered.edges || []).map(e => String(e.id || '')).sort()
  if (nodeIds.join(',') !== 'p-media,w-text') {
    throw new Error(`expected canonical flow widget nodes to remain eligible without metadata, got ${nodeIds.join(',')}`)
  }
  if (edgeIds.join(',') !== 'e-text') {
    throw new Error(`expected only canonical widget-to-panel edge to remain, got ${edgeIds.join(',')}`)
  }
}

export function testFlowWidgetEligibilityReusesSharedReaders() {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'graph', 'flowWidgetEligibility.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes("import { readEdgeEndpointId } from '@/lib/graph/edgeEndpoints'")) {
    throw new Error('expected flow widget eligibility to reuse the shared edge endpoint reader upstream')
  }
  if (!/import\s*\{[^}]*\breadNodeProperties\b[^}]*\}\s*from\s*['"]@\/lib\/graph\/nodeProperties['"]/.test(text)) {
    throw new Error('expected flow widget eligibility to reuse the shared node properties reader upstream')
  }
  if (!text.includes("import { isPlainObject } from '@/lib/graph/value'")) {
    throw new Error('expected flow widget eligibility to reuse the shared plain-object guard upstream')
  }
  if (!text.includes('const props = readNodeProperties(node)')) {
    throw new Error('expected flow widget eligibility node-property reads to reuse the shared node properties helper')
  }
  if (!text.includes('const src = readEdgeEndpointId((e as { source?: unknown }).source)')) {
    throw new Error('expected flow widget eligibility edge filtering to reuse the shared edge endpoint helper')
  }
  if (text.includes('const isRecord = (v: unknown): v is Record<string, unknown> =>')) {
    throw new Error('expected flow widget eligibility to stop defining a local record guard')
  }
  if (text.includes('function readEndpointId(') || text.includes('function normalizeEndpointNodeId(')) {
    throw new Error('expected flow widget eligibility to stop defining local endpoint normalization helpers')
  }
}
