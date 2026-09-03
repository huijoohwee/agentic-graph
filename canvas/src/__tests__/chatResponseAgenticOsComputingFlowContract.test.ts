import { CHAT_BASE_AGENTIC_OS_RESPONSE_CONTRACT_PROMPT } from '@/features/chat/chatResponseBaseContract'
import {
  COMPUTING_FLOW_COMPUTE_NODE_ID,
  COMPUTING_FLOW_GITGRAPH_ID,
  COMPUTING_FLOW_INPUT_FIELDS,
  COMPUTING_FLOW_OUTPUT_FIELDS,
  COMPUTING_FLOW_SOURCE_NODE_ID,
} from '@/features/chat/chatComputingFlowContract'
import { isAgenticOsStructuredMarkdown, normalizeAgenticOsAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { buildResolvableVarKeySet, validateChatMarkdown } from '@/features/chat/chatMarkdownValidation'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const readPlainOrTypedValue = (value: unknown): unknown => {
  return isPlainRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value') ? value.value : value
}

const extractMarkdownSection = (markdown: string, heading: string): string => {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(line => String(line || '').trim() === heading)
  if (start < 0) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(String(lines[index] || ''))) {
      end = index
      break
    }
  }
  return lines.slice(start + 1, end).join('\n').trim()
}

const extractMarkdownBody = (markdown: string): string => {
  const marker = '\n---\n'
  const index = String(markdown || '').indexOf(marker)
  return index >= 0 ? markdown.slice(index + marker.length).trim() : ''
}

const readComputingFlowNode = (markdown: string, nodeId: string): Record<string, unknown> | null => {
  const parsedFrontmatter = parseMarkdownFrontmatter(splitMarkdownLines(markdown))
  const flow = isPlainRecord(parsedFrontmatter.meta.flow) ? parsedFrontmatter.meta.flow : null
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes.filter(isPlainRecord) : []
  return nodes.find(node => isPlainRecord(node.id) && node.id.value === nodeId) || null
}

const readParsedWidgetRegistry = (metadata: unknown): never[] => {
  const meta = isPlainRecord(metadata) ? metadata : {}
  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  return Array.isArray(registry) ? registry as never[] : []
}

const assertValidAgenticOs = (md: string, label: string): void => {
  if (!isAgenticOsStructuredMarkdown(md)) {
    throw new Error(`Expected ${label} to satisfy AGENTIC_OS structured markdown detection`)
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new Error(`Expected ${label} to validate, got ${first?.ruleId}: ${first?.message}`)
  }
}

export function testChatAgenticOsResponseContractPromptEnforcesComputingFlowShape() {
  const prompt = CHAT_BASE_AGENTIC_OS_RESPONSE_CONTRACT_PROMPT
  const requiredPromptSnippets = [
    'schema: "agentic-os-computing-flow/v1"',
    'typed KTV input rows as `{key,type,value}` envelopes',
    '`input_query`, `input_context`, `input_audience`, `input_format`, `input_constraints`, `input_evidence`, `input_tone`, `input_metric_label`, and `input_metric_target`',
    'explicit `sourceHandle` and `targetHandle` edges from `source_input` into `compute_summary`',
    'typed `flow_diagrams.value.template_gitgraph`',
    '`type: mermaid_gitgraph`',
    '`run_body_tokens`',
    '`canvas:runAction.bodyTokens`',
    '`compute_summary.output`, `compute_summary.imageUrl`, `compute_summary.outputSrcDoc`',
    'Run and Run All can update body projections',
    'every RichMediaPanel node must carry `flow:widgetFormId: richMediaPanel`, `frontmatter:primitive: node`, explicit handles, typed ports',
    '`## Response` with `{{compute_summary.output}}`, then `## Inputs`',
    'do not narrate frontmatter, dataflow, `flow.nodes`, or `flow.edges` in the body',
  ]
  requiredPromptSnippets.forEach(snippet => {
    if (!prompt.includes(snippet)) {
      throw new Error(`Expected AGENTIC_OS response contract prompt to include: ${snippet}`)
    }
  })
}

export function testAgenticOsDeterministicFallbackGeneratesComputingFlowKtvBodyTokens() {
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 7, 12, 0, 0),
    workspacePath: '/chat-log/20260607T120000Z/agenticOs_20260607T120000Z.md',
    requestText: 'Generate a Storyboard Widget computing flow with KTV key/type/value inputs, compute_summary, Run All body tokens, and Rich Media Panels.',
    assistantText: '',
  })

  const requiredText = [
    'schema: "agentic-os-computing-flow/v1"',
    'kgCanvas2dRenderer: "storyboard"',
    'flow_diagrams:',
    `key: ${COMPUTING_FLOW_GITGRAPH_ID}`,
    'type: mermaid_gitgraph',
    'commit id: "source_input" tag: "KTV inputs"',
    'commit id: "compute_summary" tag: "compute" type: HIGHLIGHT',
    'commit id: "run_body_tokens" tag: "response"',
    `value: "${COMPUTING_FLOW_SOURCE_NODE_ID}"`,
    `value: "${COMPUTING_FLOW_COMPUTE_NODE_ID}"`,
    '"canvas:runAction"',
    'bodyTokens',
    'sourceHandle',
    'targetHandle',
    '## Response',
    '{{compute_summary.output}}',
    '## Inputs',
    '{{source_input.input_query}}',
    '{{source_input.input_metric_target}}',
  ]
  requiredText.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected computing-flow fallback to include ${snippet}`)
    }
  })
  if (md.includes('date: "{{date}}"')) {
    throw new Error('Expected generated agenticOs_*.md computing-flow fallback to use a concrete runnable date, not a template placeholder')
  }

  for (const forbidden of ['{{source_input.query}}', '{{source_input.context}}', 'flow.nodes', 'flow.edges', 'flow_diagrams']) {
    if (extractMarkdownSection(md, '## Response').includes(forbidden)) {
      throw new Error(`Expected computing-flow response body to avoid stale or self-narrating token ${forbidden}`)
    }
  }

  const responseIndex = md.indexOf('## Response')
  const inputsIndex = md.indexOf('## Inputs')
  if (responseIndex < 0 || inputsIndex < 0 || responseIndex > inputsIndex) {
    throw new Error('Expected computing-flow body to keep Response before Inputs')
  }

  assertValidAgenticOs(md, 'computing-flow fallback')

  const parsedFrontmatter = parseMarkdownFrontmatter(splitMarkdownLines(md))
  const flow = isPlainRecord(parsedFrontmatter.meta.flow) ? parsedFrontmatter.meta.flow : null
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes.filter(isPlainRecord) : []
  const edges = Array.isArray(flow?.edges) ? flow.edges.filter(isPlainRecord) : []
  const sourceNode = nodes.find(node => isPlainRecord(node.id) && node.id.value === COMPUTING_FLOW_SOURCE_NODE_ID)
  const computeNode = nodes.find(node => isPlainRecord(node.id) && node.id.value === COMPUTING_FLOW_COMPUTE_NODE_ID)
  if (!sourceNode || !computeNode) {
    throw new Error('Expected computing-flow fallback to declare source_input and compute_summary nodes')
  }

  for (const field of COMPUTING_FLOW_INPUT_FIELDS) {
    const sourceField = sourceNode[field]
    if (!isPlainRecord(sourceField) || sourceField.key !== field || typeof sourceField.type !== 'string' || !Object.prototype.hasOwnProperty.call(sourceField, 'value')) {
      throw new Error(`Expected source_input.${field} to be a typed KTV row`)
    }
    const edge = edges.find(candidate =>
      readPlainOrTypedValue(candidate.source) === COMPUTING_FLOW_SOURCE_NODE_ID
      && readPlainOrTypedValue(candidate.sourceHandle) === field
      && readPlainOrTypedValue(candidate.target) === COMPUTING_FLOW_COMPUTE_NODE_ID
      && readPlainOrTypedValue(candidate.targetHandle) === field
    )
    if (!edge) {
      throw new Error(`Expected ${field} to connect from source_input to compute_summary through explicit handles`)
    }
  }

  const runActionWrapper = computeNode['canvas:runAction']
  const runAction = isPlainRecord(runActionWrapper) && isPlainRecord(runActionWrapper.value) ? runActionWrapper.value : null
  const bodyTokens = Array.isArray(runAction?.bodyTokens) ? runAction.bodyTokens.filter(isPlainRecord) : []
  const declaredTokens = new Set(bodyTokens.map(token => String(token.token || '')))
  for (const token of [
    ...COMPUTING_FLOW_OUTPUT_FIELDS.map(field => `${COMPUTING_FLOW_COMPUTE_NODE_ID}.${field}`),
    ...COMPUTING_FLOW_INPUT_FIELDS.map(field => `${COMPUTING_FLOW_SOURCE_NODE_ID}.${field}`),
  ]) {
    if (!declaredTokens.has(token)) {
      throw new Error(`Expected canvas:runAction.bodyTokens to declare ${token}`)
    }
  }

  const panelContracts = [
    { nodeId: 'panel_text_output', field: 'output', portType: 'template_text_signal' },
    { nodeId: 'panel_image_output', field: 'imageUrl', portType: 'template_image_signal' },
    { nodeId: 'panel_chart_output', field: 'outputSrcDoc', portType: 'template_chart_html' },
  ] as const
  for (const panelContract of panelContracts) {
    const panelNode = nodes.find(node => readPlainOrTypedValue(node.id) === panelContract.nodeId)
    if (!panelNode) throw new Error(`Expected computing-flow fallback to declare ${panelContract.nodeId}`)
    if (readPlainOrTypedValue(panelNode.type) !== 'RichMediaPanel') {
      throw new Error(`Expected ${panelContract.nodeId} to be a RichMediaPanel node`)
    }
    if (readPlainOrTypedValue(panelNode['flow:widgetFormId']) !== 'richMediaPanel') {
      throw new Error(`Expected ${panelContract.nodeId} to declare flow:widgetFormId richMediaPanel`)
    }
    if (readPlainOrTypedValue(panelNode['frontmatter:primitive']) !== 'node') {
      throw new Error(`Expected ${panelContract.nodeId} to declare frontmatter:primitive node`)
    }
    if (readPlainOrTypedValue(panelNode['template:nodeType']) !== 'rich_media_panel') {
      throw new Error(`Expected ${panelContract.nodeId} to declare template:nodeType rich_media_panel`)
    }
    if (typeof readPlainOrTypedValue(panelNode['agentic-os:readingSummary']) !== 'string') {
      throw new Error(`Expected ${panelContract.nodeId} to carry agenticOs:readingSummary`)
    }
    const fieldRow = panelNode[panelContract.field]
    if (!isPlainRecord(fieldRow) || fieldRow.key !== panelContract.field || typeof fieldRow.type !== 'string' || !Object.prototype.hasOwnProperty.call(fieldRow, 'value')) {
      throw new Error(`Expected ${panelContract.nodeId}.${panelContract.field} to be a consumed KTV field row`)
    }
    const handles = readPlainOrTypedValue(panelNode.handles)
    if (
      !isPlainRecord(handles)
      || !Array.isArray(handles.target)
      || !handles.target.includes(panelContract.field)
      || !Array.isArray(handles.source)
      || !handles.source.includes(panelContract.field)
    ) {
      throw new Error(`Expected ${panelContract.nodeId} handles to expose ${panelContract.field}`)
    }
    const portTypes = readPlainOrTypedValue(panelNode['flow:portTypes'])
    const inputPorts = isPlainRecord(portTypes) && isPlainRecord(portTypes.in) ? portTypes.in : null
    const outputPorts = isPlainRecord(portTypes) && isPlainRecord(portTypes.out) ? portTypes.out : null
    if (inputPorts?.[panelContract.field] !== panelContract.portType || outputPorts?.[panelContract.field] !== panelContract.portType) {
      throw new Error(`Expected ${panelContract.nodeId} typed ports to expose ${panelContract.field} as ${panelContract.portType}`)
    }
    const panelEdge = edges.find(candidate =>
      readPlainOrTypedValue(candidate.source) === COMPUTING_FLOW_COMPUTE_NODE_ID
      && readPlainOrTypedValue(candidate.sourceHandle) === panelContract.field
      && readPlainOrTypedValue(candidate.target) === panelContract.nodeId
      && readPlainOrTypedValue(candidate.targetHandle) === panelContract.field
    )
    if (!panelEdge) {
      throw new Error(`Expected compute_summary.${panelContract.field} to connect to ${panelContract.nodeId}`)
    }
  }

  const parsedGraph = tryParseMarkdownFrontmatterFlowGraph('agentic-os-computing-flow.md', md)
  if (!parsedGraph) throw new Error('Expected computing-flow fallback to parse as a frontmatter flow graph')
}

export function testAgenticOsDeterministicFallbackPreservesAssistantAnswerInResponseBody() {
  const assistantAnswer = [
    'Below is a structured view of how to think about an 80% BTC / 20% gold portfolio over 12-36 months.',
    '',
    '## ETF Flow Momentum vs Spot Premium/Discount',
    '',
    'BTC ETF flow momentum is the first-order marginal liquidity signal, while gold ETF flow is a cleaner macro hedge signal.',
    '',
    '## Options Skew Divergence',
    '',
    'The non-consensus signal is that long-dated BTC downside skew can converge toward gold-like macro hedge demand before spot correlation fully converges.',
  ].join('\n')
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 7, 5, 42, 56),
    workspacePath: '/chat-log/20260607T054256Z/agenticOs_20260607T054256Z.md',
    requestText: '12-36 month horizon, portfolio BTC 80% + gold 20%; compare ETF flow momentum, spot premium, options skew, FOMC and CPI sensitivity.',
    assistantText: assistantAnswer,
  })
  assertValidAgenticOs(md, 'assistant-answer fallback')
  const body = extractMarkdownBody(md)
  const responseSection = extractMarkdownSection(md, '## Response')
  if (!md.includes('$schema: "agentic-os-response/v1"') || !md.includes('schema: "agentic-os-2d-renderer-storyboard-template/v1"')) {
    throw new Error('Expected substantive no-slash assistant answer fallback to use response-only Storyboard template syntax')
  }
  for (const snippet of [
    'Below is a structured view of how to think about an 80% BTC / 20% gold portfolio',
    'ETF Flow Momentum vs Spot Premium/Discount',
    'long-dated BTC downside skew can converge toward gold-like macro hedge demand',
  ]) {
    if (!responseSection.includes(snippet)) {
      throw new Error(`Expected response-only body to preserve assistant answer snippet: ${snippet}`)
    }
  }
  for (const forbidden of ['schema: "agentic-os-computing-flow/v1"', 'template_flow_demo', 'source_input', 'compute_summary', 'No final assistant body was available', 'Assistant output signal:', '### Headless Structured Output', 'Dataflow:', 'Frontmatter keeps', '## Computing Flow Definition', 'flow.nodes', 'flow.edges']) {
    if (body.includes(forbidden)) {
      throw new Error(`Expected markdown body to avoid contract narration: ${forbidden}`)
    }
  }
}

export function testAgenticOsSubstantiveAssistantAnswerUsesResponseOnlyBody() {
  const assistantAnswer = [
    '## 1. Big Picture for an 80% BTC / 20% Gold Portfolio',
    '',
    'The portfolio is a high-beta macro and liquidity expression with gold ballast.',
    '',
    '## 2. What Options Desks Miss',
    '',
    'The non-consensus signal is that long-dated BTC downside skew can converge toward gold-like macro hedge demand before spot correlation fully converges.',
  ].join('\n')
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 7, 6, 27, 58),
    workspacePath: '/chat-log/20260607T062758Z/agenticOs_20260607T062758Z.md',
    requestText: '12-36 month horizon, portfolio BTC 80% + gold 20%; analyze ETF flow momentum, options skew divergence, FOMC and CPI sensitivity.',
    assistantText: assistantAnswer,
  })
  assertValidAgenticOs(md, '062758-style assistant-answer fallback')
  const body = extractMarkdownBody(md)
  const bodyHeadings = body.split('\n').filter(line => /^##\s+/.test(line)).map(line => line.trim())
  if (JSON.stringify(bodyHeadings) !== JSON.stringify(['## Response'])) {
    throw new Error(`Expected response-only markdown body to contain only Response, got: ${bodyHeadings.join(', ')}`)
  }
  for (const required of [
    '$schema: "agentic-os-response/v1"',
    'schema: "agentic-os-2d-renderer-storyboard-template/v1"',
    'runtime_readiness:',
    'agentic_os_contract:',
    'shared_renderer_contract:',
    'semantic_html_projection:',
  ]) {
    if (!md.includes(required)) {
      throw new Error(`Expected response-only AGENTIC_OS to include ${required}`)
    }
  }
  if (!body.includes('What Options Desks Miss') || !body.includes('long-dated BTC downside skew')) {
    throw new Error('Expected response-only body to retain the substantive assistant answer')
  }
  for (const forbidden of ['schema: "agentic-os-computing-flow/v1"', 'template_flow_demo', 'source_input', 'compute_summary', '# {{product}} · AI Pipeline', '## Computing Flow Definition', 'Machine source:', 'frontmatter', 'dataflow', 'flow.nodes', 'flow.edges']) {
    if (body.includes(forbidden)) {
      throw new Error(`Expected 062758-style body to avoid legacy narration: ${forbidden}`)
    }
  }
}

export function testAgenticOsSubstantiveAssistantAnswerSeedsRichMediaOutputs() {
  const assistantAnswer = [
    'Below is a structured view of the BTC and gold portfolio signal.',
    '',
    '### Flow Momentum',
    '',
    'BTC ETF flow momentum remains risk-on, while gold ETF flow is a cleaner macro hedge reference.',
    '',
    '---',
    '',
    '### Options Skew',
    '',
    'Long-dated BTC downside skew can converge toward gold-like demand before spot correlation fully converges.',
  ].join('\n')
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 7, 7, 20, 17),
    workspacePath: '/chat-log/20260607T072017Z/agenticOs_20260607T072017Z.md',
    requestText: 'Generate a Storyboard Widget computing flow with KTV key/type/value inputs for 12-36 month horizon, portfolio BTC 80% + gold 20%; factor analysis with ETF flow momentum, options skew, FOMC, CPI, premium/discount, and macro catalyst sensitivity.',
    assistantText: assistantAnswer,
  })
  assertValidAgenticOs(md, '072017-style assistant-answer fallback')

  const computeNode = readComputingFlowNode(md, COMPUTING_FLOW_COMPUTE_NODE_ID)
  const output = isPlainRecord(computeNode?.output) ? String(computeNode.output.value || '') : ''
  const imageUrl = isPlainRecord(computeNode?.imageUrl) ? String(computeNode.imageUrl.value || '') : ''
  const outputSrcDoc = isPlainRecord(computeNode?.outputSrcDoc) ? String(computeNode.outputSrcDoc.value || '') : ''
  if (!output.includes('BTC ETF flow momentum') || !output.includes('Options Skew')) {
    throw new Error('Expected seeded compute_summary.output to preserve the assistant response')
  }
  if (!imageUrl.startsWith('data:image/svg+xml,')) {
    throw new Error(`Expected seeded compute_summary.imageUrl data URI, got: ${imageUrl.slice(0, 40)}`)
  }
  if (!outputSrcDoc.includes('<!doctype html>') || !outputSrcDoc.includes('BTC and gold portfolio signal')) {
    throw new Error('Expected seeded compute_summary.outputSrcDoc to carry a chart preview of the assistant response')
  }

  const parsedGraph = tryParseMarkdownFrontmatterFlowGraph('agenticOs_20260607T072017Z.md', md)
  if (!parsedGraph) throw new Error('Expected seeded assistant-answer AGENTIC_OS to parse as a frontmatter graph')
  const registry = readParsedWidgetRegistry(parsedGraph.graphData.metadata)
  const connected = computeFlowConnectedValuesBySchemaPath({
    graphData: parsedGraph.graphData,
    registry,
    targetNodeIds: new Set(['panel_text_output', 'panel_image_output', 'panel_chart_output']),
  })
  const textOutput = connected.get('panel_text_output')?.['properties.output']
  const imageOutput = connected.get('panel_image_output')?.['properties.imageUrl']
  const chartOutput = connected.get('panel_chart_output')?.['properties.outputSrcDoc']
  if (textOutput?.value !== output || !textOutput.sources.some(source => source.nodeId === COMPUTING_FLOW_COMPUTE_NODE_ID && source.portKey === 'output')) {
    throw new Error(`Expected compute_summary.output to feed text panel, got: ${JSON.stringify(textOutput)}`)
  }
  if (imageOutput?.value !== imageUrl || !imageOutput.sources.some(source => source.nodeId === COMPUTING_FLOW_COMPUTE_NODE_ID && source.portKey === 'imageUrl')) {
    throw new Error(`Expected compute_summary.imageUrl to feed image panel, got: ${JSON.stringify(imageOutput)}`)
  }
  if (chartOutput?.value !== outputSrcDoc || !chartOutput.sources.some(source => source.nodeId === COMPUTING_FLOW_COMPUTE_NODE_ID && source.portKey === 'outputSrcDoc')) {
    throw new Error(`Expected compute_summary.outputSrcDoc to feed chart panel, got: ${JSON.stringify(chartOutput)}`)
  }

  const sampleLikeGraphData = {
    ...parsedGraph.graphData,
    nodes: parsedGraph.graphData.nodes.map(node => String(node.id || '') === COMPUTING_FLOW_COMPUTE_NODE_ID
      ? {
        ...node,
        properties: {
          ...(node.properties || {}),
          imageUrl: '',
          outputSrcDoc: '',
        },
      }
      : node),
  }
  const sampleLikeConnected = computeFlowConnectedValuesBySchemaPath({
    graphData: sampleLikeGraphData,
    registry,
    targetNodeIds: new Set(['panel_text_output', 'panel_image_output', 'panel_chart_output']),
  })
  const sampleTextOutput = sampleLikeConnected.get('panel_text_output')?.['properties.output']
  const sampleChartOutput = sampleLikeConnected.get('panel_chart_output')?.['properties.outputSrcDoc']
  const sampleImageOutput = sampleLikeConnected.get('panel_image_output')?.['properties.imageUrl']
  if (sampleTextOutput?.value !== output) {
    throw new Error(`Expected sample-like AGENTIC_OS text panel to preserve materialized answer, got: ${JSON.stringify(sampleTextOutput)}`)
  }
  if (typeof sampleChartOutput?.value !== 'string' || !sampleChartOutput.value.includes('BTC ETF flow momentum')) {
    throw new Error(`Expected sample-like AGENTIC_OS chart panel to derive from materialized answer, got: ${JSON.stringify(sampleChartOutput)}`)
  }
  if (String(sampleChartOutput.value || '').includes('factor analysis with ETF flow momentum')) {
    throw new Error('Expected sample-like AGENTIC_OS chart panel not to re-run stale source-input compute')
  }
  if (typeof sampleImageOutput?.value === 'string' && sampleImageOutput.value.startsWith('data:image/svg+xml,')) {
    throw new Error(`Expected sample-like AGENTIC_OS image panel not to synthesize stale image output, got: ${sampleImageOutput.value.slice(0, 80)}`)
  }

  const changedInputGraphData = {
    ...parsedGraph.graphData,
    nodes: parsedGraph.graphData.nodes.map(node => String(node.id || '') === COMPUTING_FLOW_SOURCE_NODE_ID
      ? {
        ...node,
        properties: {
          ...(node.properties || {}),
          input_query: 'Updated KTV input query for explicit Run recompute',
          input_metric_target: 50,
        },
      }
      : node),
  }
  const passiveConnected = computeFlowConnectedValuesBySchemaPath({
    graphData: changedInputGraphData,
    registry,
    targetNodeIds: new Set(['panel_text_output']),
  }).get('panel_text_output')
  const runConnected = computeFlowConnectedValuesBySchemaPath({
    graphData: changedInputGraphData,
    registry,
    targetNodeIds: new Set([COMPUTING_FLOW_COMPUTE_NODE_ID]),
    preserveMaterializedOutputs: false,
  }).get(COMPUTING_FLOW_COMPUTE_NODE_ID)
  const passiveOutput = String(passiveConnected?.['properties.output']?.value || '')
  const runOutput = String(runConnected?.['properties.output']?.value || '')
  const runChart = String(runConnected?.['properties.outputSrcDoc']?.value || '')
  if (passiveOutput !== output) {
    throw new Error('Expected passive connected-values preview to preserve materialized compute_summary.output')
  }
  if (!runOutput.includes('Updated KTV input query for explicit Run recompute')) {
    throw new Error(`Expected explicit Run dataflow to recompute from edited KTV input, got: ${runOutput}`)
  }
  if (!runChart.includes('50 target')) {
    throw new Error(`Expected explicit Run dataflow to reflect edited input_metric_target, got: ${runChart}`)
  }
}

export function testAgenticOsDeterministicFallbackTraceOnlyKeepsHumanFacingNoBackfill() {
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 7, 6, 3, 3),
    workspacePath: '/chat-log/20260607T060303Z/agenticOs_20260607T060303Z.md',
    requestText: 'Analyze BTC and gold portfolio factors and answer with non-consensus signals.',
    assistantText: [
      '## Provider Stream Trace',
      '',
      'The provider returned reasoning or tool-call trace events but did not return final assistant text.',
      '',
      '- Model: mirothinker-1-7-deepresearch-mini',
      '- SSE events: 1382',
    ].join('\n'),
  })
  assertValidAgenticOs(md, 'trace-only fallback')
  const responseSection = extractMarkdownSection(md, '## Response')
  for (const snippet of ['analyze btc and gold portfolio factors', 'no final assistant text', 'no answer is backfilled']) {
    if (!responseSection.toLowerCase().includes(snippet)) {
      throw new Error(`Expected trace-only response to preserve no-backfill message: ${snippet}`)
    }
  }
  for (const forbidden of ['schema: "agentic-os-computing-flow/v1"', 'template_flow_demo', 'source_input', 'compute_summary', 'RichMediaPanel', '### Headless Structured Output', 'Dataflow:', 'Frontmatter keeps']) {
    if (md.includes(forbidden)) {
      throw new Error(`Expected trace-only response body to avoid mutation narration: ${forbidden}`)
    }
  }
}

export function testAgenticOsNoSlashImageTraceKeepsCleanSlateNoBackfill() {
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 7, 16, 57, 38),
    workspacePath: '/chat-log/20260707T165738Z/agenticOs_20260707T165738Z.md',
    requestText: 'what ![strybldr-starter-source.png](http://localhost:5181/api/storage/media/airvio/runs/upload-017d1e965528642f/image/strybldr-starter-source-017d1e965528642f.png?agentic_os_media_token=secret)',
    assistantText: [
      '## Provider Stream Trace',
      '',
      'The provider stream is active. Incoming reasoning, tool, and assistant deltas are appended below.',
      '',
      '### Stream Transcript',
      '',
      '[signal]',
      '- Stream events are arriving.',
      '',
      '### Terminal Metadata',
      '',
      '- SSE events: 5',
    ].join('\n'),
  })
  assertValidAgenticOs(md, 'no-slash image trace fallback')
  const responseSection = extractMarkdownSection(md, '## Response').toLowerCase()
  for (const required of ['for the request "what [attached image]"', 'no final assistant text', 'no answer is backfilled']) {
    if (!responseSection.includes(required)) throw new Error(`Expected clean-slate fallback to preserve query-responsive no-backfill response: ${required}`)
  }
  for (const forbidden of ['agentic_os_media_token', 'localhost:5181', 'upload-017d1e965528642f', 'mcp-response-', 'MCP Structured Response', 'strybldr-starter-source', 'schema: "agentic-os-computing-flow/v1"', 'template_flow_demo', 'source_input', 'compute_summary', 'RichMediaPanel', 'what [attached image Computing Flow']) {
    if (md.includes(forbidden)) throw new Error(`Expected no-slash image trace fallback not to backfill runtime media/profile detail: ${forbidden}`)
  }
  if (!md.includes('what [attached image]')) throw new Error('Expected request profiling to keep a neutral attached-image placeholder')
  if (md.includes('Named terms: what [attached image')) throw new Error('Expected attached-image placeholder not to become a named term')
}

export function testAgenticOsComputingFlowStripsAppendedCanonicalSections() {
  const requestText = [
    'Storyboard Widget KTV compute_summary Run All bodyTokens.',
    'BTC gold signal.',
  ].join(' ')
  const assistantAnswer = [
    '## Signal',
    '',
    'Options-skew divergence leads ETF-flow momentum.',
    '',
    '---',
    '',
    'BTC ETF options slowly converge toward gold hedge demand.',
  ].join('\n')
  const base = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 7, 6, 42, 55),
    workspacePath: '/chat-log/20260607T064255Z/agenticOs_20260607T064255Z.md',
    requestText,
    assistantText: assistantAnswer,
  })
  const mixed = [
    base.trimEnd(),
    '',
    '<!-- agentic-os-consolidated:canonical:auxiliary-run:start -->',
    '## Auxiliary Run Manifest',
    '',
    '```markdown',
    '---',
    'schema: "auxiliary-run/v1"',
    'status: "ok"',
    '---',
    '',
    '## Artifact Contract',
    '',
    '- Persistence: workspace-fs',
    '',
    '## Failure State',
    '',
    'Structured failure: none recorded.',
    '```',
    '<!-- agentic-os-consolidated:canonical:auxiliary-run:end -->',
  ].join('\n')

  if (isAgenticOsStructuredMarkdown(mixed)) {
    throw new Error('Expected mixed canonical AGENTIC_OS plus auxiliary manifest to fail structured computing-flow validation')
  }

  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 7, 6, 42, 55),
    workspacePath: '/chat-log/20260607T064255Z/agenticOs_20260607T064255Z.md',
    requestText,
    assistantText: mixed,
  })
  if (!isAgenticOsStructuredMarkdown(md)) {
    throw new Error('Expected sanitized mixed computing-flow canonical AGENTIC_OS to parse as structured AGENTIC_OS')
  }
  const body = extractMarkdownBody(md)
  const bodyHeadings = body.split('\n').filter(line => /^##\s+/.test(line)).map(line => line.trim())
  if (JSON.stringify(bodyHeadings) !== JSON.stringify(['## Response', '## Inputs'])) {
    throw new Error(`Expected sanitized computing-flow body to contain only Response and Inputs, got: ${bodyHeadings.join(', ')}`)
  }
  for (const stale of ['agentic-os-consolidated', 'Auxiliary Run Manifest', 'Artifact Contract', 'Failure State', 'auxiliary-run/v1']) {
    if (md.includes(stale)) {
      throw new Error(`Expected sanitized computing-flow AGENTIC_OS to drop appended section: ${stale}`)
    }
  }
  const computeNode = readComputingFlowNode(md, COMPUTING_FLOW_COMPUTE_NODE_ID)
  const output = isPlainRecord(computeNode?.output) ? String(computeNode.output.value || '') : ''
  if (!output.includes('Options-skew divergence') || !output.includes('BTC ETF options slowly converge')) {
    throw new Error('Expected compute_summary.output to preserve the original response while stripping appended sections')
  }
}
