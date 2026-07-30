import {
  buildStoryboardWidgetProbeTreeOutputGroupId,
  mergeStoryboardWidgetProbeTreeOutputPanels,
  normalizeStoryboardWidgetProbeTreeOutputLayout,
  PROBE_TREE_OUTPUT_KEY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import { buildRichMediaTextMarkdownDocument } from '@/features/rich-media/richMediaTextMarkdownContract.mjs'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import type { GraphData } from '@/lib/graph/types'

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message)
}

export function testProbeTreeOutputLayoutMergesLiveLedgersBeforeNormalization() {
  const propertiesWithLegitimateValue = readGraphNodeProperties({
    properties: { value: 'user-authored field', parentNodeId: 'root', probeTreeThreadRootId: 'root' },
  })
  assert(propertiesWithLegitimateValue.parentNodeId === 'root', 'expected a legitimate value field not to hide Probe-Tree ancestry')
  const materializedGraph: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      { id: 'child', type: 'TextGeneration', label: 'Child', x: 430, y: 0, properties: { parentNodeId: 'root', probeTreeThreadRootId: 'root' } },
    ],
    edges: [],
  }
  const liveGraph: GraphData = {
    ...materializedGraph,
    nodes: [
      ...materializedGraph.nodes,
      { id: 'panel-root', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 520, y: 0, properties: { workflowOutputAnchorNodeId: 'root', workflowOutputKey: PROBE_TREE_OUTPUT_KEY } },
      { id: 'panel-child', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 950, y: 0, properties: { workflowOutputAnchorNodeId: 'child' } },
    ],
    edges: [
      { id: 'root-panel', source: 'root', target: 'panel-root', label: PROBE_TREE_OUTPUT_KEY, properties: {} },
      { id: 'child-panel', source: 'child', target: 'panel-child', label: PROBE_TREE_OUTPUT_KEY, properties: {} },
    ],
  }
  const merged = mergeStoryboardWidgetProbeTreeOutputPanels({ graphData: materializedGraph, liveGraphData: liveGraph })
  const normalized = normalizeStoryboardWidgetProbeTreeOutputLayout({ graphData: merged, threadRootId: 'root' })
  const panels = normalized.nodes.filter(node => node.type === 'RichMediaPanel')
  assert(panels.length === 1, `expected one live ledger after terminal normalization, got ${JSON.stringify(panels)}`)
  assert(panels[0]?.properties.workflowOutputGroupId === buildStoryboardWidgetProbeTreeOutputGroupId('root'), 'expected the live ledger to adopt the thread group')

  const freshPanel = { id: 'panel-root', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 520, y: 0, properties: { workflowOutputAnchorNodeId: 'child', workflowOutputKey: PROBE_TREE_OUTPUT_KEY, output: 'fresh child continuation' } }
  const stalePanel = { ...freshPanel, properties: { ...freshPanel.properties, output: 'stale live ledger' } }
  const freshMaterializedGraph: GraphData = { ...materializedGraph, nodes: [...materializedGraph.nodes, freshPanel] }
  const staleLiveGraph: GraphData = { ...materializedGraph, nodes: [...materializedGraph.nodes, stalePanel] }
  const sameIdMerged = mergeStoryboardWidgetProbeTreeOutputPanels({ graphData: freshMaterializedGraph, liveGraphData: staleLiveGraph })
  const retainedPanel = sameIdMerged.nodes.find(node => node.id === 'panel-root')
  assert(retainedPanel?.properties.output === 'fresh child continuation', `expected same-id fresh run ledger to outrank stale live bytes, got ${JSON.stringify(retainedPanel)}`)
}

export function testProbeTreeOutputMarkdownUsesFrontmatterSharedViewerContract() {
  const markdown = buildRichMediaTextMarkdownDocument({
    title: 'Probe-Tree Branches',
    body: '# Probe-Tree Branches\n\n1. Evidence\n2. Assumption\n3. Reviewer',
    sourceContract: 'knowgrph-probe-tree/v0.1',
  })
  assert(markdown.startsWith('---\nschema: "knowgrph-rich-media-text/v1"\n'), 'expected Probe-Tree Markdown to start with the Rich Media text frontmatter contract')
  assert(markdown.includes('\nmedia_kind: "text"\ncontent_type: "text/markdown"\n'), 'expected Probe-Tree frontmatter to declare Markdown text media')
  assert(markdown.endsWith('# Probe-Tree Branches\n\n1. Evidence\n2. Assumption\n3. Reviewer'), 'expected the authored Markdown body to remain intact')
  assert(!/<!doctype|<html\b|<body\b/i.test(markdown), 'expected Probe-Tree text output to forbid HTML document materialization')
}
