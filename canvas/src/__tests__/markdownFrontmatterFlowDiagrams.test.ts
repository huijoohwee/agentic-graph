import fs from 'node:fs'
import path from 'node:path'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { shouldUseSummaryGraphForMarkdown } from '@/features/parsers/markdownLargeDocumentGraph'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import type { GraphData, GraphNode } from '@/lib/graph/types'

const readRegistry = (graphData: GraphData): never[] => (
  Array.isArray((graphData.metadata || {})[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? (graphData.metadata || {})[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
    : []
)

const readNode = (graphData: GraphData, id: string): GraphNode | null => (
  (graphData.nodes || []).find(node => String(node.id || '') === id) || null
)

export function testMarkdownFrontmatterFlowDiagramsDeriveDynamicRichMediaPanels() {
  const md = [
    '---',
    'title: "Neutral flow diagram demo"',
    'kgCanvas2dRenderer: "storyboard"',
    'flow_diagrams:',
    '  key: flow_diagrams',
    '  type: object',
    '  value:',
    '    gitgraph:',
    '      key: gitgraph',
    '      type: mermaid_gitgraph',
    '      render_on: [flow_editor]',
    '      value: |-',
    '        gitGraph',
    '          commit id:"source_input"',
    '          branch research',
    '          checkout research',
    '          commit id:"parallel_review"',
    '          checkout main',
    '          merge research',
    '    gantt:',
    '      key: gantt',
    '      type: mermaid_gantt',
    '      render_on: [document_view, timeline_view, storyboard]',
    '      value: |-',
    '        gantt',
    '          title computing flow',
    '          dateFormat YYYY-MM-DD',
    '          section Source',
    '          Source input :done, source_input, 2026-06-05, 1d',
    '          Parallel review :crit, parallel_review, after source_input, 2d',
    '    architecture:',
    '      key: architecture',
    '      type: mermaid_architecture',
    '      render_on: [bottom_panel, storyboard]',
    '      value: |-',
    '        architecture-beta',
    '          group cloud(cloud)[Cloud]',
    '          service ui(internet)[Vercel UI] in cloud',
    '          service mcp(server)[MCP Worker] in cloud',
    '          ui:R --> L:mcp',
    '    event_model:',
    '      key: event_model',
    '      type: mermaid_eventmodeling',
    '      render_on: [bottom_panel, storyboard]',
    '      value: |-',
    '        eventmodeling',
    '        tf 01 ui UserBrief',
    '        tf 02 cmd StartRun',
    '        tf 03 evt RunStarted',
    '---',
    '',
    '# Neutral diagram document',
  ].join('\n')

  const parsed = tryParseMarkdownFrontmatterFlowGraph('neutral-flow-diagrams.md', md)
  if (!parsed) throw new Error('expected flow_diagrams-only frontmatter to parse as frontmatter-flow')
  const graphData = parsed.graphData
  if (String(graphData.context || '') !== 'frontmatter-flow') throw new Error(`expected frontmatter-flow, got ${String(graphData.context || '')}`)

  const expectedNodes = [
    ['flow-diagram-gitgraph-source', 'FlowDiagramSource'],
    ['flow-diagram-gitgraph-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
    ['flow-diagram-gitgraph-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
    ['flow-diagram-gantt-source', 'FlowDiagramSource'],
    ['flow-diagram-gantt-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
    ['flow-diagram-gantt-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
    ['flow-diagram-architecture-source', 'FlowDiagramSource'],
    ['flow-diagram-architecture-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
    ['flow-diagram-architecture-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
    ['flow-diagram-event_model-source', 'FlowDiagramSource'],
    ['flow-diagram-event_model-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
    ['flow-diagram-event_model-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
  ] as const
  for (const [id, type] of expectedNodes) {
    const node = readNode(graphData, id)
    if (!node) throw new Error(`expected derived flow_diagrams node ${id}`)
    if (String(node.type || '') !== type) throw new Error(`expected ${id} type ${type}, got ${String(node.type || '')}`)
  }

  const frontmatterMeta = ((graphData.metadata || {}) as Record<string, unknown>).frontmatterMeta as Record<string, unknown> | null
  if (!frontmatterMeta || !frontmatterMeta.flow_diagrams) {
    throw new Error('expected source frontmatterMeta to preserve typed flow_diagrams block')
  }

  const edgeSignatures = new Set((graphData.edges || []).map(edge => [
    String(edge.source || ''),
    String((edge.properties || {})['flow:sourcePortKey'] || ''),
    String(edge.target || ''),
    String((edge.properties || {})['flow:targetPortKey'] || ''),
  ].join('|')))
  for (const signature of [
    'flow-diagram-gitgraph-source|diagramSource|flow-diagram-gitgraph-compute|diagramSource',
    'flow-diagram-gitgraph-compute|outputSrcDoc|flow-diagram-gitgraph-panel|outputSrcDoc',
    'flow-diagram-gantt-source|diagramSource|flow-diagram-gantt-compute|diagramSource',
    'flow-diagram-gantt-compute|outputSrcDoc|flow-diagram-gantt-panel|outputSrcDoc',
    'flow-diagram-architecture-source|diagramSource|flow-diagram-architecture-compute|diagramSource',
    'flow-diagram-architecture-compute|outputSrcDoc|flow-diagram-architecture-panel|outputSrcDoc',
    'flow-diagram-event_model-source|diagramSource|flow-diagram-event_model-compute|diagramSource',
    'flow-diagram-event_model-compute|outputSrcDoc|flow-diagram-event_model-panel|outputSrcDoc',
  ]) {
    if (!edgeSignatures.has(signature)) throw new Error(`expected derived dataflow edge ${signature}`)
  }

  const registry = readRegistry(graphData)
  const connected = computeFlowConnectedValuesBySchemaPath({
    graphData,
    registry,
    targetNodeIds: new Set(['flow-diagram-gitgraph-panel', 'flow-diagram-gantt-panel']),
  })
  const gitgraphSrcDoc = connected.get('flow-diagram-gitgraph-panel')?.['properties.outputSrcDoc']
  const ganttSrcDoc = connected.get('flow-diagram-gantt-panel')?.['properties.outputSrcDoc']
  const architectureConnected = computeFlowConnectedValuesBySchemaPath({
    graphData,
    registry,
    targetNodeIds: new Set(['flow-diagram-architecture-panel', 'flow-diagram-event_model-panel']),
  })
  const architectureSrcDoc = architectureConnected.get('flow-diagram-architecture-panel')?.['properties.outputSrcDoc']
  const eventModelSrcDoc = architectureConnected.get('flow-diagram-event_model-panel')?.['properties.outputSrcDoc']
  if (
    typeof gitgraphSrcDoc?.value !== 'string'
    || !gitgraphSrcDoc.value.includes('Parallel lanes')
    || !gitgraphSrcDoc.value.includes('First-class terms')
    || !gitgraphSrcDoc.value.includes("data-kg-flow-diagram-chart='1'")
    || !gitgraphSrcDoc.value.includes('data-kg-mermaid-source="1"')
    || !gitgraphSrcDoc.value.includes('research')
    || !gitgraphSrcDoc.value.includes('source_input')
  ) {
    throw new Error(`expected GitGraph panel srcdoc to render a data-backed chart with parallel branch coverage, got ${String(gitgraphSrcDoc?.value || '')}`)
  }
  if (
    typeof ganttSrcDoc?.value !== 'string'
    || !ganttSrcDoc.value.includes('Critical path')
    || !ganttSrcDoc.value.includes('First-class terms')
    || !ganttSrcDoc.value.includes("data-kg-flow-diagram-chart='1'")
    || !ganttSrcDoc.value.includes('data-kg-mermaid-source="1"')
    || !ganttSrcDoc.value.includes('Parallel review')
  ) {
    throw new Error(`expected Gantt panel srcdoc to render a data-backed chart with critical path coverage, got ${String(ganttSrcDoc?.value || '')}`)
  }
  if (!gitgraphSrcDoc.sources.some(source => source.nodeId === 'flow-diagram-gitgraph-compute' && source.portKey === 'outputSrcDoc')) {
    throw new Error('expected GitGraph Rich Media Panel outputSrcDoc to source from inline compute node')
  }
  if (
    typeof architectureSrcDoc?.value !== 'string'
    || !architectureSrcDoc.value.includes('Architecture services')
    || !architectureSrcDoc.value.includes('MCP Worker')
    || !architectureSrcDoc.value.includes('data-kg-flow-diagram-kind="architecture"')
  ) {
    throw new Error(`expected Architecture panel srcdoc to summarize services, got ${String(architectureSrcDoc?.value || '')}`)
  }
  if (
    typeof eventModelSrcDoc?.value !== 'string'
    || !eventModelSrcDoc.value.includes('Event model commands')
    || !eventModelSrcDoc.value.includes('RunStarted')
    || !eventModelSrcDoc.value.includes('data-kg-flow-diagram-kind="eventmodeling"')
  ) {
    throw new Error(`expected Event Modeling panel srcdoc to summarize commands/events, got ${String(eventModelSrcDoc?.value || '')}`)
  }

  const editedGraphData: GraphData = {
    ...graphData,
    nodes: graphData.nodes.map(node => String(node.id || '') === 'flow-diagram-gitgraph-source'
      ? {
          ...node,
          properties: {
            ...(node.properties || {}),
            diagramSource: [
              'gitGraph',
              '  commit id:"source_input"',
              '  branch research',
              '  branch build',
              '  checkout build',
              '  commit id:"parallel_build"',
              '  checkout main',
              '  merge build',
            ].join('\n'),
          },
        }
      : node),
  }
  const recomputed = computeFlowConnectedValuesBySchemaPath({
    graphData: editedGraphData,
    registry,
    targetNodeIds: new Set(['flow-diagram-gitgraph-panel']),
  }).get('flow-diagram-gitgraph-panel')?.['properties.outputSrcDoc']?.value
  if (typeof recomputed !== 'string' || !recomputed.includes('build') || recomputed.includes('static fallback')) {
    throw new Error(`expected edited diagram source to recompute panel output, got ${String(recomputed || '')}`)
  }

  const storyboard = buildStoryboardBoardModel({ graphData, graphRevision: 1, widgetRegistry: registry })
  const storyboardCard = storyboard.lanes.flatMap(lane => lane.cards).find(card => card.id === 'flow-diagram-gantt-panel') || null
  if (!storyboardCard || storyboardCard.media?.kind !== 'iframe' || !storyboardCard.media.srcDoc?.includes('Critical path')) {
    throw new Error(`expected Storyboard card to reuse computed Rich Media Panel srcdoc, got ${JSON.stringify(storyboardCard)}`)
  }
}

export function testMarkdownFrontmatterFlowDiagramsKeepLargeMarkdownOnFlowParserPath() {
  const md = [
    '---',
    'flow_diagrams:',
    '  key: flow_diagrams',
    '  type: object',
    '  value:',
    '    gantt:',
    '      key: gantt',
    '      type: mermaid_gantt',
    '      value: |-',
    '        gantt',
    '          title large frontmatter flow',
    '          dateFormat YYYY-MM-DD',
    '          section Build',
    '          Source :crit, source_input, 2026-06-05, 1d',
    '---',
    '',
    '# Large body',
    'x'.repeat(510_000),
  ].join('\n')

  if (shouldUseSummaryGraphForMarkdown(md)) {
    throw new Error('expected flow_diagrams frontmatter to bypass summary-only large markdown fallback')
  }
}

export function testMarkdownFrontmatterFlowDiagramsParserForbidsDemoHardcodes() {
  const helperPath = path.resolve(process.cwd(), 'src', 'features', 'parsers', 'markdownFrontmatterFlowGraph.flowDiagrams.ts')
  const source = fs.readFileSync(helperPath, 'utf8')
  const computeSource = source.match(/const FLOW_DIAGRAM_COMPUTE_SOURCE = `([\s\S]*?)`/)?.[1] || ''
  if (!computeSource || computeSource.length > 5200) {
    throw new Error(`expected flow_diagrams inline compute source to stay within the shared safety cap, got ${computeSource.length}`)
  }
  for (const forbidden of [
    /agentic-graph-[\w-]*-demo/i,
    /\/Users\//,
    /AG_TEST_/,
  ]) {
    if (forbidden.test(source)) throw new Error(`expected flow_diagrams parser helper to avoid hardcoded fixture token ${forbidden.source}`)
  }
}
