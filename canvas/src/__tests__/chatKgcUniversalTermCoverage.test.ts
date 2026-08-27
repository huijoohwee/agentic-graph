import { buildCanonicalKgcTemplateFixtureDocument } from '@/__tests__/helpers/neutralKgcFixture'
import { buildResolvableVarKeySet, validateChatMarkdown } from '@/features/chat/chatMarkdownValidation'
import { isKgcStructuredMarkdown, normalizeKgcAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_WIDGET_REGISTRY_METADATA_KEY,
} from '@/lib/config.storyboard-widget'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import type { GraphData, GraphNode } from '@/lib/graph/types'

const buildBaseTemplateSample = (): string => {
  return buildCanonicalKgcTemplateFixtureDocument()
}

const assertIncludes = (md: string, snippets: string[], label: string): void => {
  snippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected ${label} to include: ${snippet}`)
    }
  })
}

const assertOmits = (md: string, snippets: string[], label: string): void => {
  snippets.forEach(snippet => {
    if (md.includes(snippet)) {
      throw new Error(`Expected ${label} to omit: ${snippet}`)
    }
  })
}

const validateGeneratedKgc = (md: string, label: string): void => {
  if (!isKgcStructuredMarkdown(md)) {
    throw new Error(`Expected ${label} to satisfy KGC structured markdown detection`)
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new Error(`Expected ${label} to validate, got ${first?.ruleId}: ${first?.message}`)
  }
}

const readNode = (graphData: GraphData, id: string): GraphNode | null => (
  (graphData.nodes || []).find(node => String(node.id || '') === id) || null
)

export function testKgcFallbackPreservesNamedTermsForUnfamiliarPromptWithoutFamilyBranches() {
  const requestText = [
    'Draft a concise implementation memo for `QNX-42 gateway`,',
    'BlueLark adapter, 17ms jitter budget, DeltaSync handoff,',
    'outputSrcDoc chart panel, and audioUrl review notes.',
  ].join(' ')
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 5, 4, 15, 20),
    workspacePath: '/chat-log/20260605T041520Z/kgc_20260605T041520Z.md',
    requestText,
    assistantText: buildBaseTemplateSample(),
  })

  assertIncludes(md, [
    'QNX-42 gateway',
    'BlueLark adapter',
    '17ms jitter budget',
    'DeltaSync handoff',
    'outputSrcDoc chart panel',
    'audioUrl review notes',
    'Named terms',
    'Term coverage',
    'Rich Media Panels',
    'outputSrcDoc',
  ], 'universal KGC fallback')

  assertOmits(md, [
    'external discovery channels',
    'the stated revenue actions',
    'the monetized conversion trigger',
    'user-action monetization',
    'monetized user actions',
    'commercialization and integration assumptions',
    'OpenClaw marketplace distribution',
    'Stripe checkout',
  ], 'universal KGC fallback')

  validateGeneratedKgc(md, 'universal KGC fallback')
}

export function testKgcFallbackGeneratesFlowDiagramsForArbitraryPromptDynamicPanels() {
  const requestText = [
    'Draft a concise implementation memo for `QNX-42 gateway`,',
    'BlueLark adapter, 17ms jitter budget, DeltaSync handoff,',
    'outputSrcDoc chart panel, and audioUrl review notes.',
  ].join(' ')
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 5, 4, 17, 40),
    workspacePath: '/chat-log/20260605T041740Z/kgc_20260605T041740Z.md',
    requestText,
    assistantText: buildBaseTemplateSample(),
  })

  assertIncludes(md, [
    'kgCanvas2dRenderer: "storyboard"',
    'flow_diagrams:',
    'type: mermaid_gitgraph',
    'type: mermaid_gantt',
    'Request GitGraph dataflow lanes',
    'Request Gantt critical path',
    'QNX-42 gateway',
    'BlueLark adapter',
    '17ms jitter budget',
    'DeltaSync handoff',
    'Rich Media Panels :crit',
  ], 'universal KGC fallback flow_diagrams')
  assertOmits(md, [
    'agenticgraph-research-agent-demo',
    'agenticgraph-missalph-demo',
    'documentVersionGraph',
    'version control GitGraph',
    'flow-diagram-gitgraph-source:',
    'flow-diagram-gantt-panel:',
  ], 'universal KGC fallback flow_diagrams')
  validateGeneratedKgc(md, 'universal KGC fallback flow_diagrams')

  const parsed = tryParseMarkdownFrontmatterFlowGraph('kgc-universal-flow-diagrams.md', md)
  if (!parsed) throw new Error('Expected universal KGC fallback flow_diagrams to parse as frontmatter-flow')
  const graphData = parsed.graphData
  const frontmatterMeta = ((graphData.metadata || {}) as Record<string, unknown>).frontmatterMeta as Record<string, unknown> | undefined
  if (!frontmatterMeta?.flow_diagrams) throw new Error('Expected source frontmatterMeta to preserve flow_diagrams')

  const expectedNodes = [
    ['flow-diagram-gitgraph-source', 'FlowDiagramSource'],
    ['flow-diagram-gitgraph-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
    ['flow-diagram-gitgraph-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
    ['flow-diagram-gantt-source', 'FlowDiagramSource'],
    ['flow-diagram-gantt-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
    ['flow-diagram-gantt-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
  ] as const
  for (const [id, type] of expectedNodes) {
    const node = readNode(graphData, id)
    if (!node) throw new Error(`Expected derived flow_diagrams node ${id}`)
    if (String(node.type || '') !== type) throw new Error(`Expected ${id} type ${type}, got ${String(node.type || '')}`)
  }

  const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
    : []
  const connected = computeFlowConnectedValuesBySchemaPath({
    graphData,
    registry,
    targetNodeIds: new Set(['flow-diagram-gitgraph-panel', 'flow-diagram-gantt-panel']),
  })
  const gitgraphSrcDoc = connected.get('flow-diagram-gitgraph-panel')?.['properties.outputSrcDoc']
  const ganttSrcDoc = connected.get('flow-diagram-gantt-panel')?.['properties.outputSrcDoc']
  if (
    typeof gitgraphSrcDoc?.value !== 'string'
    || !gitgraphSrcDoc.value.includes('data-kg-flow-diagram-kind="gitgraph"')
    || !gitgraphSrcDoc.value.includes("data-kg-flow-diagram-chart='1'")
    || !gitgraphSrcDoc.value.includes('First-class terms')
    || !gitgraphSrcDoc.value.includes('QNX-42 gateway')
    || !gitgraphSrcDoc.value.includes('BlueLark adapter')
    || !gitgraphSrcDoc.sources.some(source => source.nodeId === 'flow-diagram-gitgraph-compute' && source.portKey === 'outputSrcDoc')
  ) {
    throw new Error(`Expected computed GitGraph Rich Media output with first-class prompt terms, got: ${String(gitgraphSrcDoc?.value || '')}`)
  }
  if (
    typeof ganttSrcDoc?.value !== 'string'
    || !ganttSrcDoc.value.includes('data-kg-flow-diagram-kind="gantt"')
    || !ganttSrcDoc.value.includes("data-kg-flow-diagram-chart='1'")
    || !ganttSrcDoc.value.includes('Critical path')
    || !ganttSrcDoc.value.includes('QNX-42 gateway coverage')
    || !ganttSrcDoc.value.includes('Rich Media Panels')
    || !ganttSrcDoc.sources.some(source => source.nodeId === 'flow-diagram-gantt-compute' && source.portKey === 'outputSrcDoc')
  ) {
    throw new Error(`Expected computed Gantt Rich Media output with critical path prompt terms, got: ${String(ganttSrcDoc?.value || '')}`)
  }
}

export function testKgcFallbackPreservesDenseSymbolicTermsWithoutPromptFamilyTemplate() {
  const requestText = [
    'Create a neutral response for AX-17 telemetry, RhoLake queue,',
    'GammaPulse adapter, 9s retry window, SigmaSwitch handoff,',
    'inline imageUrl preview, and transcriptUrl audio review.',
  ].join(' ')
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 5, 4, 16, 30),
    workspacePath: '/chat-log/20260605T041630Z/kgc_20260605T041630Z.md',
    requestText,
    assistantText: buildBaseTemplateSample(),
  })

  assertIncludes(md, [
    'AX-17 telemetry',
    'RhoLake queue',
    'GammaPulse adapter',
    '9s retry window',
    'SigmaSwitch handoff',
    'imageUrl preview',
    'transcriptUrl audio review',
    'Named terms',
    'Term coverage',
  ], 'dense symbolic KGC fallback')

  assertOmits(md, [
    'OpenClaw marketplace distribution',
    'Stripe checkout',
    'external discovery channels',
    'the stated revenue actions',
    'the monetized conversion trigger',
  ], 'dense symbolic KGC fallback')

  validateGeneratedKgc(md, 'dense symbolic KGC fallback')
}

export function testKgcFallbackKeepsAnalysisAsTermNotArtifactFamily() {
  const requestText = [
    '1-3 month horizon, portfolio: BTC 30% + gold 20% - factor analysis:',
    'ETF flow momentum vs spot premium/discount, options skew divergence between the two assets,',
    'signal/noise ratio on macro catalyst FOMC CPI print sensitivity;',
    'uncover BTC-gold skew convergence as institutional adoption matures.',
  ].join(' ')
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 5, 1, 18, 43),
    workspacePath: '/chat-log/20260605T011843Z/kgc_20260605T011843Z.md',
    requestText,
    assistantText: buildBaseTemplateSample(),
  })

  assertIncludes(md, [
    'BTC 30% + gold 20%',
    'factor analysis',
    'ETF flow momentum',
    'spot premium/discount',
    'options skew divergence between the two assets',
    'signal/noise ratio on macro catalyst',
    'FOMC',
    'CPI',
    'BTC-gold skew convergence',
  ], 'dense financial term coverage')

  assertOmits(md, [
    'doc_type: "analysis"',
    'AI Pipeline — analysis',
    'deliver analysis',
  ], 'dense financial term coverage')

  validateGeneratedKgc(md, 'dense financial term coverage')
}
