import { analyzeAgenticOsRequest, sanitizeRequestIntent } from './chatAgenticOsRequestProfile'
import {
  COMPUTING_FLOW_COMPUTE_NODE_ID,
  COMPUTING_FLOW_GITGRAPH_ID,
  COMPUTING_FLOW_INPUT_FIELDS,
  COMPUTING_FLOW_OUTPUT_FIELDS,
  COMPUTING_FLOW_SOURCE_NODE_ID,
} from './chatComputingFlowContract'
import {
  type BaseFallbackArgs,
  slugify,
  typedBlockScalarEnvelopeLines,
} from './chatHistoryWorkspace.agenticOs.fallbackCommon'
import {
  buildResponseMarkdown,
  hasSubstantiveAssistantMarkdown,
  isTraceOnlyAssistantText,
} from './chatHistoryWorkspace.agenticOs.responseProjection'

const typedInlineEnvelope = (field: string, type: string, value: unknown): string => {
  return `{key: ${field}, type: ${type}, value: ${JSON.stringify(value)}}`
}

const escapeHtml = (value: unknown): string => String(value || '').replace(/[&<>"']/g, ch => {
  if (ch === '&') return '&amp;'
  if (ch === '<') return '&lt;'
  if (ch === '>') return '&gt;'
  if (ch === '"') return '&quot;'
  return '&#39;'
})

const plainTextFromMarkdown = (markdown: string): string => String(markdown || '')
  .replace(/\r\n/g, '\n')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/[#>*_`[\]()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const buildSeededOutputAssets = (markdown: string, fallbackTitle: string): {
  imageUrl: string
  outputSrcDoc: string
} => {
  const plain = plainTextFromMarkdown(markdown)
  const title = (plain || fallbackTitle || 'Compute output').slice(0, 96)
  const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0
  const target = 500
  const pct = Math.max(0, Math.min(100, Math.round((words / target) * 100)))
  const preview = (plain || title).slice(0, 260)
  const titleHtml = escapeHtml(title)
  const previewHtml = escapeHtml(preview)
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200">',
    '<rect width="640" height="200" fill="#f8fafc"/>',
    `<text x="320" y="82" font-family="system-ui" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">${titleHtml}</text>`,
    `<text x="320" y="116" font-family="system-ui" font-size="12" fill="#475569" text-anchor="middle">${words} words - ${pct}% of ${target} target</text>`,
    '</svg>',
  ].join('')
  const outputSrcDoc = [
    '<!doctype html><html><head><meta charset=utf-8><style>',
    'body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}',
    'h2{font-size:14px;font-weight:600;margin:0 0 10px}.track{height:16px;background:#e2e8f0;border-radius:8px;overflow:hidden}',
    `.bar{height:100%;background:#22c55e;border-radius:8px;width:${pct}%}.note{margin-top:8px;font-size:12px;color:#64748b}`,
    'p{font-size:12px;line-height:1.45;margin:10px 0 0;color:#334155}',
    `</style></head><body><h2>${titleHtml}</h2><div class=track><div class=bar></div></div>`,
    `<p class="note">${words} words - ${pct}% of ${target} target</p><p>${previewHtml}</p></body></html>`,
  ].join('')
  return {
    imageUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    outputSrcDoc,
  }
}

const buildComputingFlowComputeSource = (): string[] => [
  'inputs => {',
  '  const read = key => String(inputs?.[key] || "").trim()',
  '  const query = read("input_query")',
  '  const context = read("input_context")',
  '  const audience = read("input_audience")',
  '  const format = read("input_format")',
  '  const constraints = read("input_constraints")',
  '  const evidence = read("input_evidence")',
  '  const tone = read("input_tone")',
  '  const metricLabel = read("input_metric_label") || "items"',
  '  const metricTargetRaw = Number(read("input_metric_target"))',
  '  const metricTarget = Number.isFinite(metricTargetRaw) && metricTargetRaw > 0 ? metricTargetRaw : 1',
  '  const raw = [query, context, evidence].filter(Boolean).join("\\n\\n")',
  '  if (!raw) return { output: "", imageUrl: "", outputSrcDoc: "" }',
  '  const count = metricLabel.toLowerCase().includes("word")',
  '    ? raw.split(/\\s+/).filter(Boolean).length',
  '    : raw.length',
  '  const pct = Math.max(0, Math.min(100, Math.round((count / metricTarget) * 100)))',
  '  const preview = raw.slice(0, 240)',
  '  const escapeHtml = value => String(value || "").replace(/[&<>"\']/g, ch => {',
  '    if (ch === "&") return "&amp;"',
  '    if (ch === "<") return "&lt;"',
  '    if (ch === ">") return "&gt;"',
  '    if (ch.charCodeAt(0) === 34) return "&quot;"',
  '    return "&#39;"',
  '  })',
  '  const parts = [',
  '    preview,',
  '    audience ? "**Audience:** " + audience : "",',
  '    format ? "**Format:** " + format : "",',
  '    constraints ? "**Constraints:** " + constraints : "",',
  '    tone ? "**Tone:** " + tone : ""',
  '  ].filter(Boolean)',
  '  const output = parts.join("\\n\\n")',
  '  const title = (query || context || evidence || "Output").slice(0, 96)',
  '  const svg = "<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 640 200\\">" +',
  '    "<rect width=\\"640\\" height=\\"200\\" fill=\\"#f8fafc\\"/>" +',
  '    "<text x=\\"320\\" y=\\"84\\" font-family=\\"system-ui\\" font-size=\\"14\\" font-weight=\\"700\\" fill=\\"#0f172a\\" text-anchor=\\"middle\\">" + escapeHtml(title) + "</text>" +',
  '    "<text x=\\"320\\" y=\\"116\\" font-family=\\"system-ui\\" font-size=\\"12\\" fill=\\"#475569\\" text-anchor=\\"middle\\">" + count + " " + escapeHtml(metricLabel) + " · " + pct + "% of target</text>" +',
  '    "</svg>"',
  '  const imageUrl = "data:image/svg+xml," + encodeURIComponent(svg)',
  '  const outputSrcDoc = "<!doctype html><html><head><meta charset=\\"utf-8\\"><style>" +',
  '    "body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}" +',
  '    "h2{font-size:14px;font-weight:600;margin:0 0 10px}.track{height:16px;background:#e2e8f0;border-radius:8px;overflow:hidden}" +',
  '    ".bar{height:100%;background:#22c55e;border-radius:8px;width:" + pct + "%}.note{margin-top:8px;font-size:12px;color:#64748b}" +',
  '    "</style></head><body><h2>" + escapeHtml(title) + "</h2><div class=\\"track\\"><div class=\\"bar\\"></div></div>" +',
  '    "<p class=\\"note\\">" + count + " " + escapeHtml(metricLabel) + " · " + pct + "% of " + metricTarget + " target</p></body></html>"',
  '  return { output, imageUrl, outputSrcDoc }',
  '}',
]

const typedComputingFlowEdgeLines = (args: {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
  label: string
  type: string
}): string => [
  `    - id: ${typedInlineEnvelope('id', 'string', args.id)}`,
  `      source: ${typedInlineEnvelope('source', 'string', args.source)}`,
  `      sourceHandle: ${typedInlineEnvelope('sourceHandle', 'string', args.sourceHandle)}`,
  `      target: ${typedInlineEnvelope('target', 'string', args.target)}`,
  `      targetHandle: ${typedInlineEnvelope('targetHandle', 'string', args.targetHandle)}`,
  `      label: ${typedInlineEnvelope('label', 'string', args.label)}`,
  `      type: ${typedInlineEnvelope('type', 'string', args.type)}`,
].join('\n')

const readComputingFlowPortType = (field: string): string => {
  return field === 'input_metric_target' ? 'template_number_signal' : 'template_text_signal'
}

const buildComputingFlowGitGraphLines = (): string[] => [
  'flow_diagrams:',
  '  key: flow_diagrams',
  '  type: object',
  '  value:',
  `    ${COMPUTING_FLOW_GITGRAPH_ID}:`,
  `      key: ${COMPUTING_FLOW_GITGRAPH_ID}`,
  '      type: mermaid_gitgraph',
  '      value: |-',
  '        gitGraph',
  '          commit id: "source_input" tag: "KTV inputs"',
  '          branch request_contract',
  '          checkout request_contract',
  '          commit id: "input_query"',
  '          commit id: "input_context"',
  '          commit id: "input_evidence"',
  '          checkout main',
  '          branch presentation_contract',
  '          checkout presentation_contract',
  '          commit id: "input_audience"',
  '          commit id: "input_format"',
  '          commit id: "input_tone"',
  '          checkout main',
  '          branch guardrail_contract',
  '          checkout guardrail_contract',
  '          commit id: "input_constraints"',
  '          checkout main',
  '          branch metric_contract',
  '          checkout metric_contract',
  '          commit id: "input_metric_label"',
  '          commit id: "input_metric_target"',
  '          checkout main',
  '          merge request_contract id: "merge_request_contract"',
  '          merge presentation_contract id: "merge_presentation_contract"',
  '          merge guardrail_contract id: "merge_guardrail_contract"',
  '          merge metric_contract id: "merge_metric_contract"',
  '          commit id: "compute_summary" tag: "compute" type: HIGHLIGHT',
  '          branch rich_media_panels',
  '          checkout rich_media_panels',
  '          commit id: "panel_text_output"',
  '          commit id: "panel_image_output"',
  '          commit id: "panel_chart_output"',
  '          checkout main',
  '          merge rich_media_panels id: "merge_rich_media_panels"',
  '          commit id: "run_body_tokens" tag: "response"',
]

const buildSeededComputeOutputLines = (args: {
  profile: ReturnType<typeof analyzeAgenticOsRequest>
  assistantText: string
}): string[] => {
  if (!hasSubstantiveAssistantMarkdown(args.assistantText) && !isTraceOnlyAssistantText(args.assistantText)) {
    return [
      '      output: {key: output, type: markdown, value: ""}',
      '      imageUrl: {key: imageUrl, type: svg_data_uri, value: ""}',
      '      outputSrcDoc: {key: outputSrcDoc, type: html_srcdoc, value: ""}',
    ]
  }
  const markdown = buildResponseMarkdown(args)
  const assets = buildSeededOutputAssets(markdown, args.profile.intent)
  return [
    ...typedBlockScalarEnvelopeLines('      ', 'output', 'markdown', markdown.split('\n')),
    ...typedBlockScalarEnvelopeLines('      ', 'imageUrl', 'svg_data_uri', [assets.imageUrl]),
    ...typedBlockScalarEnvelopeLines('      ', 'outputSrcDoc', 'html_srcdoc', [assets.outputSrcDoc]),
  ]
}

const buildRichMediaPanelNodeLines = (args: {
  id: string
  label: string
  position: { x: number; y: number }
  field: 'output' | 'imageUrl' | 'outputSrcDoc'
  portType: string
  fieldType: string
  readingSummary: string
  yIndex: number
}): string[] => [
  `    - id: ${typedInlineEnvelope('id', 'string', args.id)}`,
  '      type: {key: type, type: string, value: "RichMediaPanel"}',
  `      label: ${typedInlineEnvelope('label', 'string', args.label)}`,
  `      position: ${typedInlineEnvelope('position', 'object', args.position)}`,
  `      handles: ${typedInlineEnvelope('handles', 'object', { target: [args.field], source: [args.field] })}`,
  `      "flow:portTypes": ${typedInlineEnvelope('flow:portTypes', 'object', { in: { [args.field]: args.portType }, out: { [args.field]: args.portType } })}`,
  '      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "richMediaPanel"}',
  '      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}',
  `      "agentic-os:readingSummary": ${typedInlineEnvelope('agentic-os:readingSummary', 'string', args.readingSummary)}`,
  `      ${args.field}: ${typedInlineEnvelope(args.field, args.fieldType, '')}`,
  '      "template:nodeType": {key: "template:nodeType", type: string, value: "rich_media_panel"}',
  '      "visual:importance": {key: "visual:importance", type: number, value: 16}',
  '      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 14}',
  '      "visual:xIndex": {key: "visual:xIndex", type: number, value: 2}',
  `      "visual:yIndex": {key: "visual:yIndex", type: number, value: ${args.yIndex}}`,
]

export const buildDeterministicComputingFlowAgenticOsTurn = (args: BaseFallbackArgs): string => {
  const profile = analyzeAgenticOsRequest(args.requestText)
  const fileName = String(args.fileName || '').trim() || 'agenticOs.md'
  const intent = sanitizeRequestIntent(profile.intent, 260) || 'Summarize the strongest signal in the selected source.'
  const graphId = `md:${slugify(fileName)}-computing-flow`
  const date = new Date(args.timestampMs || Date.now()).toISOString().slice(0, 10)
  const sourceHandles = JSON.stringify({ source: COMPUTING_FLOW_INPUT_FIELDS })
  const computeHandles = JSON.stringify({ target: COMPUTING_FLOW_INPUT_FIELDS, source: COMPUTING_FLOW_OUTPUT_FIELDS })
  const sourcePortTypes = JSON.stringify({
    out: Object.fromEntries(COMPUTING_FLOW_INPUT_FIELDS.map(field => [
      field,
      field === 'input_metric_target' ? 'template_number_signal' : 'template_text_signal',
    ])),
  })
  const computePortTypes = JSON.stringify({
    in: Object.fromEntries(COMPUTING_FLOW_INPUT_FIELDS.map(field => [
      field,
      field === 'input_metric_target' ? 'template_number_signal' : 'template_text_signal',
    ])),
    out: {
      output: 'template_text_signal',
      imageUrl: 'template_image_signal',
      outputSrcDoc: 'template_chart_html',
    },
  })
  const bodyTokens = [
    ...COMPUTING_FLOW_OUTPUT_FIELDS.map(field => ({ token: `${COMPUTING_FLOW_COMPUTE_NODE_ID}.${field}`, field })),
    ...COMPUTING_FLOW_INPUT_FIELDS.map(field => ({ token: `${COMPUTING_FLOW_SOURCE_NODE_ID}.${field}`, field })),
  ]
  const runAction = {
    fn: 'compute',
    inputs: COMPUTING_FLOW_INPUT_FIELDS,
    outputs: COMPUTING_FLOW_OUTPUT_FIELDS,
    updateBody: true,
    bodyTokens,
    sideEffects: [
      { field: 'run_status', set: 'done' },
      { field: 'template_flow_demo.active_graph_mutated', set: true },
      { field: 'template_flow_demo.run_id', pattern: 'agenticOsf_run_yyyyMMddHHmm' },
    ],
  }
  const sourceWidgetCard = {
    previewField: 'input_query',
    previewMaxChars: 80,
    onEdit: { trigger: 'runDownstream', targets: [COMPUTING_FLOW_COMPUTE_NODE_ID] },
    actions: [
      { id: 'edit', label: 'Edit', icon: 'pencil', trigger: 'openFieldEditor', targetField: 'input_query' },
      { id: 'run', label: 'Run', icon: 'play', trigger: 'runDownstream', targets: [COMPUTING_FLOW_COMPUTE_NODE_ID] },
    ],
  }
  const computeWidgetCard = {
    statusField: 'run_status',
    statusValues: { idle: 'gray', running: 'amber', done: 'green', error: 'red' },
    previewField: 'output',
    previewMaxChars: 100,
    actions: [
      { id: 'run', label: 'Run', icon: 'play', primary: true, trigger: 'compute' },
      { id: 'reset', label: 'Reset', icon: 'refresh', trigger: 'clearOutputs', clearFields: COMPUTING_FLOW_OUTPUT_FIELDS },
    ],
  }
  const inputDefaults: Record<(typeof COMPUTING_FLOW_INPUT_FIELDS)[number], [string, unknown]> = {
    input_query: ['textarea', intent],
    input_context: ['textarea', 'Use only supplied source text or connected upstream output.'],
    input_audience: ['string', profile.subject && profile.subject !== '{{subject}}' ? profile.subject : 'research reviewer, creators'],
    input_format: ['string', 'concise markdown response'],
    input_constraints: ['textarea', 'State uncertainty; avoid unsupported claims; keep the answer MECE.'],
    input_evidence: ['textarea', ''],
    input_tone: ['string', 'direct'],
    input_metric_label: ['string', 'words'],
    input_metric_target: ['number', 500],
  }
  const frontmatter = [
    `title: ${JSON.stringify(profile.product && profile.product !== '{{product}}' ? `${profile.product} Computing Flow` : 'Storyboard Widget Computing Flow')}`,
    `graphId: ${JSON.stringify(graphId)}`,
    'doc_type: "Computing Flow Template"',
    `date: ${JSON.stringify(date)}`,
    'lang: "en-US"',
    'schema: "agentic-os-computing-flow/v1"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    'kgWorkflowManagerModeEnabled: true',
    'socket_types:',
    '  template_text_signal: {color: "#14b8a6", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [template_text_signal]}',
    '  template_number_signal: {color: "#84cc16", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [template_number_signal]}',
    '  template_image_signal: {color: "#38bdf8", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [template_image_signal]}',
    '  template_chart_html: {color: "#f59e0b", edgeWidthPx: 3, handleStrokeWidthPx: 3, accepts: [template_chart_html]}',
    'template_flow_demo:',
    '  schema_version: "computing-flow-template/v1"',
    '  run_id: {key: run_id, type: string, value: "agenticOsf_template_run"}',
    '  active_graph_mutated: {key: active_graph_mutated, type: boolean, value: false}',
    '  mode: {key: mode, type: string, value: "local-template"}',
    `  input_fields: {key: input_fields, type: array, value: ${JSON.stringify(COMPUTING_FLOW_INPUT_FIELDS)}}`,
    `  output_fields: {key: output_fields, type: array, value: ${JSON.stringify(COMPUTING_FLOW_OUTPUT_FIELDS)}}`,
    ...buildComputingFlowGitGraphLines(),
    'flow:',
    '  direction: {key: direction, type: string, value: "LR"}',
    '  edgeType: {key: edgeType, type: string, value: "smoothstep"}',
    '  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}',
    '  computed: {key: computed, type: boolean, value: true}',
    '  snapToGrid: {key: snapToGrid, type: boolean, value: true}',
    '  nodes:',
    `    - id: ${typedInlineEnvelope('id', 'string', COMPUTING_FLOW_SOURCE_NODE_ID)}`,
    '      type: {key: type, type: string, value: "InputWidget"}',
    '      label: {key: label, type: string, value: "Source Input"}',
    '      position: {key: position, type: object, value: {"x":0,"y":0}}',
    ...COMPUTING_FLOW_INPUT_FIELDS.map(field => `      ${field}: ${typedInlineEnvelope(field, inputDefaults[field][0], inputDefaults[field][1])}`),
    `      handles: {key: handles, type: object, value: ${sourceHandles}}`,
    `      "canvas:widgetCard": {key: "canvas:widgetCard", type: object, value: ${JSON.stringify(sourceWidgetCard)}}`,
    `      "flow:portTypes": {key: "flow:portTypes", type: object, value: ${sourcePortTypes}}`,
    '      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "templateInput"}',
    '      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}',
    '      "agentic-os:readingSummary": {key: "agentic-os:readingSummary", type: string, value: "Reusable source widget with granular query, context, audience, format, constraints, evidence, tone, metric label, and metric target inputs."}',
    '      "template:nodeType": {key: "template:nodeType", type: string, value: "input"}',
    `    - id: ${typedInlineEnvelope('id', 'string', COMPUTING_FLOW_COMPUTE_NODE_ID)}`,
    '      type: {key: type, type: string, value: "ComputeWidget"}',
    '      label: {key: label, type: string, value: "Compute Summary Outputs"}',
    '      position: {key: position, type: object, value: {"x":380,"y":0}}',
    `      handles: {key: handles, type: object, value: ${computeHandles}}`,
    `      "canvas:runAction": {key: "canvas:runAction", type: object, value: ${JSON.stringify(runAction)}}`,
    `      "canvas:widgetCard": {key: "canvas:widgetCard", type: object, value: ${JSON.stringify(computeWidgetCard)}}`,
    `      "flow:portTypes": {key: "flow:portTypes", type: object, value: ${computePortTypes}}`,
    '      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "templateCompute"}',
    '      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}',
    ...buildSeededComputeOutputLines({ profile, assistantText: args.assistantText || '' }),
    '      run_status: {key: run_status, type: string, value: "idle"}',
    '      "agentic-os:readingSummary": {key: "agentic-os:readingSummary", type: string, value: "Compute widget with semantic ports for granular inputs and text, image, and outputSrcDoc outputs."}',
    '      "template:nodeType": {key: "template:nodeType", type: string, value: "compute"}',
    ...typedBlockScalarEnvelopeLines('      ', 'compute', 'string', buildComputingFlowComputeSource()),
    ...buildRichMediaPanelNodeLines({
      id: 'panel_text_output',
      label: 'Rich Media Panel - Text Output',
      position: { x: 760, y: 240 },
      field: 'output',
      portType: 'template_text_signal',
      fieldType: 'textarea',
      readingSummary: 'Text Rich Media Panel receives the output field.',
      yIndex: 1,
    }),
    ...buildRichMediaPanelNodeLines({
      id: 'panel_image_output',
      label: 'Rich Media Panel - Image Output',
      position: { x: 760, y: 0 },
      field: 'imageUrl',
      portType: 'template_image_signal',
      fieldType: 'text',
      readingSummary: 'Image Rich Media Panel receives the imageUrl field.',
      yIndex: 0,
    }),
    ...buildRichMediaPanelNodeLines({
      id: 'panel_chart_output',
      label: 'Rich Media Panel - Chart Output',
      position: { x: 760, y: -240 },
      field: 'outputSrcDoc',
      portType: 'template_chart_html',
      fieldType: 'textarea',
      readingSummary: 'Chart Rich Media Panel receives the outputSrcDoc field.',
      yIndex: -2,
    }),
    '  edges:',
    ...COMPUTING_FLOW_INPUT_FIELDS.map(field => typedComputingFlowEdgeLines({
      id: `edge_${field}_to_compute`,
      source: COMPUTING_FLOW_SOURCE_NODE_ID,
      sourceHandle: field,
      target: COMPUTING_FLOW_COMPUTE_NODE_ID,
      targetHandle: field,
      label: field,
      type: readComputingFlowPortType(field),
    })),
    typedComputingFlowEdgeLines({ id: 'edge_compute_to_text_panel', source: COMPUTING_FLOW_COMPUTE_NODE_ID, sourceHandle: 'output', target: 'panel_text_output', targetHandle: 'output', label: 'text output', type: 'template_text_signal' }),
    typedComputingFlowEdgeLines({ id: 'edge_compute_to_image_panel', source: COMPUTING_FLOW_COMPUTE_NODE_ID, sourceHandle: 'imageUrl', target: 'panel_image_output', targetHandle: 'imageUrl', label: 'image output', type: 'template_image_signal' }),
    typedComputingFlowEdgeLines({ id: 'edge_compute_to_chart_panel', source: COMPUTING_FLOW_COMPUTE_NODE_ID, sourceHandle: 'outputSrcDoc', target: 'panel_chart_output', targetHandle: 'outputSrcDoc', label: 'chart output', type: 'template_chart_html' }),
  ].join('\n')
  const body = [
    '## Response',
    '',
    `{{${COMPUTING_FLOW_COMPUTE_NODE_ID}.output}}`,
    '',
    '## Inputs',
    '',
    `- Query: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_query}}`,
    `- Context: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_context}}`,
    `- Audience: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_audience}}`,
    `- Format: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_format}}`,
    `- Constraints: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_constraints}}`,
    `- Evidence: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_evidence}}`,
    `- Tone: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_tone}}`,
    `- Metric: {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_metric_label}} / {{${COMPUTING_FLOW_SOURCE_NODE_ID}.input_metric_target}}`,
  ].join('\n')
  return ['---', frontmatter, '---', body].join('\n').trimEnd() + '\n'
}
