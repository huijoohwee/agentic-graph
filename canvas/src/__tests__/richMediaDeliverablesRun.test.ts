import {
  AGENTIC_OS_DOCS_MCP_BRIDGE_PATH,
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
  type AgenticOsDocsMcpBridgeSuccess,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { invokeAgenticOsDocsMcpBridge } from '@/features/agent-ready/agenticOsDocsMcpClient'
import {
  buildRichMediaDeliverablesGenerationPrompt,
  collectRichMediaDeliverablesInvocationTokens,
  isRichMediaDeliverablesWidget,
  parseRichMediaDeliverablesResponse,
} from '@/features/rich-media/richMediaDeliverablesRun'
import { containsMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { splitSlides } from '@/features/markdown/ui/markdownPreviewSlides'
import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import {
  buildRichMediaPanelOverlayState,
  resolveRichMediaPanelDisplayText,
} from '@/lib/render/richMediaPanelState'
import {
  resolveStoryboardWidgetTextGenerationPrompts,
  resolveStoryboardWidgetTextSourceContexts,
  serializeStoryboardWidgetTextSourceProvenance,
  STORYBOARD_WIDGET_TEXT_SOURCE_PROVENANCE_SCHEMA,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunInputs'
import { runStoryboardWidgetRichMediaDeliverables } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaDeliverablesRun'

const structuredDeliverablesResponse = JSON.stringify({
  structuredContent: {
    panels: [{
      id: 'slide-deck',
      title: 'Slide Deck',
      kind: 'text',
      richMediaDeliverableKind: 'slide-deck',
      output: '# Investment case\n\nSource-grounded thesis.\n\n---\n\n# Risks\n\nExplicit downside risks.',
    }],
    tables: [{
      id: 'financial-model',
      title: 'Financial Model',
      kind: 'table',
      richMediaDeliverableKind: 'financial-model',
      columns: ['Metric', 'Base case', 'Downside', 'Upside', 'Source / assumption'],
      rows: [['Revenue', '100', '80', '120', 'Connected source']],
    }],
  },
})

export function testRichMediaDeliverablesParsesReusableMarkdownDeckAndFinancialModel() {
  const result = parseRichMediaDeliverablesResponse(structuredDeliverablesResponse)
  if (splitSlides(result.slideDeckMarkdown).slides.filter(slide => slide.text.trim()).length !== 2) {
    throw new Error(`expected two reusable Markdown slides, got ${result.slideDeckMarkdown}`)
  }
  if (!containsMarkdownPipeTable(result.financialModelMarkdown) || /<table\b/i.test(result.financialModelMarkdown)) {
    throw new Error(`expected a Markdown-only financial model table, got ${result.financialModelMarkdown}`)
  }
  const panel = buildRichMediaPanelOverlayState({
    node: {
      id: 'deck-panel',
      type: 'RichMediaPanel',
      label: 'Slide Deck',
      properties: {
        output: result.slideDeckMarkdown,
        richMediaActiveTab: 'text',
        markdownPresentationMode: true,
      },
    },
  })
  if (!panel?.hasText || panel.markdownPresentationMode !== true) {
    throw new Error(`expected Rich Media deck to reuse presentation mode, got ${JSON.stringify(panel)}`)
  }
  const mediaSpec = getNodeMediaSpec({
    id: 'deck-panel',
    type: 'RichMediaPanel',
    label: 'Slide Deck',
    properties: {
      output: result.slideDeckMarkdown,
      richMediaActiveTab: 'text',
      markdownPresentationMode: true,
    },
  })
  if (!mediaSpec || mediaSpec.kind !== 'iframe' || mediaSpec.srcDoc) {
    throw new Error(`expected presentation Markdown to stay on the native text surface, got ${JSON.stringify(mediaSpec)}`)
  }
  const explicitHtmlSpec = getNodeMediaSpec({
    id: 'deck-html-panel',
    type: 'RichMediaPanel',
    label: 'HTML Deck',
    properties: {
      output: result.slideDeckMarkdown,
      outputSrcDoc: '<main>Explicit HTML deck</main>',
      richMediaActiveTab: 'text',
      markdownPresentationMode: true,
    },
  })
  if (!explicitHtmlSpec?.srcDoc?.includes('Explicit HTML deck')) {
    throw new Error(`expected explicit outputSrcDoc to retain iframe priority, got ${JSON.stringify(explicitHtmlSpec)}`)
  }
}

export function testRichMediaDeliverablesBuildsBoundedMcpBackedGenerationPrompt() {
  const instructions = '/investment-research-agent @source.body #runtime-ready /investment-research-agent'
  const tokens = collectRichMediaDeliverablesInvocationTokens(instructions)
  if (tokens.join(' ') !== '/investment-research-agent @source.body #runtime-ready') {
    throw new Error(`expected distinct / @ # invocation tokens, got ${tokens.join(' ')}`)
  }
  const mcpResponse: AgenticOsDocsMcpBridgeSuccess = {
    ok: true,
    tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
    mcpInvoked: true,
    invocations: tokens.map(token => ({ token, ok: true, summary: `Resolved ${token}` })),
  }
  const prompt = buildRichMediaDeliverablesGenerationPrompt({
    sourceMarkdown: 'Connected source fact: budget is RM100,000.',
    instructions,
    mcpResponse,
  })
  for (const expected of ['Return JSON only', 'Markdown pipe table', 'RM100,000', AGENTIC_OS_DOCS_MCP_TOOL_NAME, 'mcpInvoked']) {
    if (!prompt.includes(expected)) throw new Error(`expected deliverables prompt to include ${expected}`)
  }
}

export function testRichMediaDeliverablesRunUsesConnectedSourceAndKeepsAuthoredInstructions() {
  const connectedValue = {
    value: 'Whole source text that was not selected.',
    sources: [{ edgeId: 'edge-neutral', nodeId: 'source-neutral', portKey: 'output' }],
  }
  const sourceContexts = resolveStoryboardWidgetTextSourceContexts({
    graphData: {
      type: 'GraphData',
      nodes: [{
        id: 'source-neutral',
        type: 'TextSource',
        label: 'Neutral research note',
        properties: {},
      }],
      edges: [{
        id: 'edge-neutral',
        label: 'Source selection',
        source: 'source-neutral',
        target: 'target-neutral',
        properties: {
          schema: 'agenticgraph-text-selection-widget-link/v1',
          'selection:text': 'Selected evidence only.',
          'selection:startLine': 12,
          'selection:endLine': 14,
          'selection:documentPath': 'notes/research.md',
          'selection:targetFieldId': 'prompt',
        },
      }],
    },
    connectedValue,
    targetPath: 'properties.prompt',
  })
  const prompts = resolveStoryboardWidgetTextGenerationPrompts({
    authoredPrompt: '/investment-research-agent\nGenerate a slide deck and financial model.',
    connectedValue: connectedValue.value,
    sourceContexts,
  })
  if (
    !prompts.authoredPrompt.startsWith('/investment-research-agent')
    || prompts.connectedPrompt !== 'Selected evidence only.'
    || sourceContexts[0]?.content !== 'Selected evidence only.'
    || sourceContexts[0]?.label !== 'Neutral research note'
    || sourceContexts[0]?.selection?.startLine !== 12
    || !prompts.prompt.includes(STORYBOARD_WIDGET_TEXT_SOURCE_PROVENANCE_SCHEMA)
    || !prompts.prompt.includes('"documentPath": "notes/research.md"')
    || prompts.prompt.includes('Whole source text that was not selected.')
    || !prompts.prompt.includes('<user-authored-request>\n/investment-research-agent\nGenerate a slide deck and financial model.\n</user-authored-request>')
  ) {
    throw new Error(`expected Widget Card Run to consume the connected Rich Media value without losing authored instructions, got ${JSON.stringify(prompts)}`)
  }
  const serialized = serializeStoryboardWidgetTextSourceProvenance(sourceContexts)
  if (!serialized.includes('Selected evidence only.') || serialized.includes('Whole source text that was not selected.')) {
    throw new Error(`expected output provenance to preserve only projected source evidence, got ${serialized}`)
  }
}

export function testConnectedSourceDoesNotReplaceMultilingualAuthoredRequest() {
  const prompts = resolveStoryboardWidgetTextGenerationPrompts({
    authoredPrompt: '生成财务报告',
    connectedValue: 'Sila huraikan pelan perniagaan dan bajet untuk gerai makanan.',
  })
  const sourceIndex = prompts.prompt.indexOf('<connected-source-context>')
  const requestIndex = prompts.prompt.indexOf('<user-authored-request>')
  if (sourceIndex !== 0 || requestIndex <= sourceIndex || !prompts.prompt.includes('生成财务报告')) {
    throw new Error(`expected connected Malay evidence followed by the authored Chinese request, got ${prompts.prompt}`)
  }
}

export function testRichMediaDeliverablesTypedTargetKeepsMarkerPromptAndInvocationTokens() {
  const persistedTargetProperties = {
    richMediaDeliverablesMode: {
      key: 'richMediaDeliverablesMode',
      type: 'boolean',
      value: true,
    },
    prompt: {
      key: 'prompt',
      type: 'textarea',
      value: '/investment-research-agent @source.body #runtime-ready\nGenerate both deliverables.',
    },
  }
  const prompts = resolveStoryboardWidgetTextGenerationPrompts({
    authoredPrompt: persistedTargetProperties.prompt,
    connectedValue: {
      key: 'prompt',
      type: 'textarea',
      value: '# Persisted Generated Result\n\nBudget: RM100,000.',
    },
  })
  const invocationTokens = collectRichMediaDeliverablesInvocationTokens(prompts.authoredPrompt)
  if (!isRichMediaDeliverablesWidget(persistedTargetProperties)) {
    throw new Error('expected the typed persisted deliverables marker to survive reload')
  }
  if (prompts.connectedPrompt !== '# Persisted Generated Result\n\nBudget: RM100,000.') {
    throw new Error(`expected the typed connected target prompt to unwrap, got ${JSON.stringify(prompts)}`)
  }
  if (invocationTokens.join(' ') !== '/investment-research-agent @source.body #runtime-ready') {
    throw new Error(`expected typed authored / # @ instructions to survive reload, got ${invocationTokens.join(' ')}`)
  }
}

export async function testRichMediaDeliverablesOwnedPanelsDisplayLocalArtifactsAcrossConnectedEdges() {
  const graphData = { type: 'GraphData', nodes: [], edges: [] }
  const sourceProperties = {
    richMediaDeliverablesMode: true,
    prompt: 'Generate both deliverables.',
    summary: 'Authored source-card summary.',
    output: 'Authored source-card output.',
  }
  const published: Array<{
    outputText: string
    title: string
    outputKey?: string
    allowCreateStandaloneOutput?: boolean
    connectCreatedOutputToAnchor?: boolean
    ownedOutputOnly?: boolean
    panelProperties?: Record<string, unknown>
  }> = []
  await runStoryboardWidgetRichMediaDeliverables({
    id: 'deliverables-card',
    node: {
      id: 'deliverables-card',
      type: 'TextGeneration',
      label: 'Deliverables Widget Card',
      properties: sourceProperties,
    },
    graphForRun: graphData,
    rawNodeProperties: sourceProperties,
    authoredPrompt: 'Generate both deliverables.',
    connectedPrompt: '# Generated Result\n\nBudget: RM100,000.',
    connectedSourceNodeId: 'generated-result',
    model: 'test-model',
    generateText: async () => structuredDeliverablesResponse,
    publishOutput: panelArgs => {
      published.push(panelArgs)
      return panelArgs.baseGraphData || graphData
    },
    readGraph: () => graphData,
    setLoading: () => void 0,
    reportFailure: message => { throw new Error(message) },
    upsertToast: () => void 0,
  })
  if (published.length !== 2) {
    throw new Error(`expected two owned Rich Media publications, got ${published.length}`)
  }
  if (
    sourceProperties.prompt !== 'Generate both deliverables.'
    || sourceProperties.summary !== 'Authored source-card summary.'
    || sourceProperties.output !== 'Authored source-card output.'
  ) {
    throw new Error(`expected deliverables Run to preserve authored source-card content, got ${JSON.stringify(sourceProperties)}`)
  }
  const expectedPublications = [
    { title: 'Slide Deck', outputKey: 'markdown-slide-deck' },
    { title: 'Financial Model', outputKey: 'financial-model-spreadsheet' },
  ]
  for (let index = 0; index < published.length; index += 1) {
    const artifact = published[index]!
    const expected = expectedPublications[index]!
    if (
      artifact.title !== expected.title
      || artifact.outputKey !== expected.outputKey
      || artifact.allowCreateStandaloneOutput !== true
      || artifact.connectCreatedOutputToAnchor !== true
      || artifact.ownedOutputOnly !== true
    ) {
      throw new Error(`expected ${expected.title} to remain a distinct connected Rich Media output, got ${JSON.stringify(artifact)}`)
    }
    if (artifact.panelProperties?.freezeConnectedOutput !== true) {
      throw new Error(`expected ${artifact.title} to freeze its generated local artifact across the lineage edge`)
    }
    if (artifact.title === 'Financial Model') {
      if (
        artifact.panelProperties?.workbookMimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        || !String(artifact.panelProperties.workbookSha256 || '').startsWith('sha256:')
        || Number(artifact.panelProperties.workbookSizeBytes) <= 0
      ) {
        throw new Error(`expected the Markdown financial panel to retain verified XLSX companion metadata, got ${JSON.stringify(artifact.panelProperties)}`)
      }
    }
    const panel = buildRichMediaPanelOverlayState({
      node: {
        id: `deliverable-panel-${index}`,
        type: 'RichMediaPanel',
        label: artifact.title,
        properties: {
          ...artifact.panelProperties,
          output: artifact.outputText,
          richMediaActiveTab: 'text',
        },
      },
      connectedValuesBySchemaPath: {
        'properties.output': {
          value: 'Generated Slide Deck and Financial Model.',
          sources: [{ edgeId: `deliverable-edge-${index}`, nodeId: 'deliverables-card', portKey: 'text_out' }],
        },
      },
    })
    const displayedText = resolveRichMediaPanelDisplayText(panel)
    if (!panel?.freezeConnectedOutput || displayedText !== artifact.outputText) {
      throw new Error(`expected ${artifact.title} display state to keep its local Markdown artifact, got ${JSON.stringify({ panel, displayedText })}`)
    }
  }
}

export async function testRichMediaDeliverablesRequiredWorkbookPersistenceFailsBeforePanelPublication() {
  const published: unknown[] = []
  let rejected = false
  try {
    await runStoryboardWidgetRichMediaDeliverables({
      id: 'deliverables-card',
      node: { id: 'deliverables-card', type: 'TextGeneration', label: 'Deliverables Widget Card', properties: { richMediaDeliverablesMode: true } },
      graphForRun: { type: 'GraphData', nodes: [], edges: [] },
      rawNodeProperties: { richMediaDeliverablesMode: true },
      authoredPrompt: 'Generate both deliverables.',
      connectedPrompt: '# Generated Result\n\nBudget: RM100,000.',
      connectedSourceNodeId: 'generated-result',
      requireDurablePersistence: true,
      model: 'test-model',
      generateText: async () => structuredDeliverablesResponse,
      publishOutput: args => { published.push(args); return args.baseGraphData || null },
      readGraph: () => null,
      setLoading: () => void 0,
      reportFailure: () => void 0,
      upsertToast: () => void 0,
    })
  } catch {
    rejected = true
  }
  if (!rejected || published.length !== 0) {
    throw new Error(`expected required workbook persistence to fail before either panel publication, got ${JSON.stringify({ rejected, published: published.length })}`)
  }
}

export function testRichMediaDeliverablesRejectsPartialStructuredOutput() {
  let rejected = false
  try {
    parseRichMediaDeliverablesResponse(JSON.stringify({
      structuredContent: {
        panels: [{ id: 'slide-deck', title: 'Slide Deck', output: '# Only one slide' }],
        tables: [{ id: 'financial-model', title: 'Financial Model', kind: 'table', columns: ['Metric'], rows: [['1']] }],
      },
    }))
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error('expected partial deliverables output to fail before either Rich Media panel is published')
}

export async function testAgenticOsDocsMcpClientPostsAllowlistedInvocationTokens() {
  let requestUrl = ''
  let requestInit: RequestInit | undefined
  const response = await invokeAgenticOsDocsMcpBridge({
    invocationTokens: ['/investment-research-agent', '@source.body', '#runtime-ready', 'invalid-tool'],
  }, (async (url, init) => {
    requestUrl = String(url)
    requestInit = init
    return new Response(JSON.stringify({
      ok: true,
      tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
      mcpInvoked: true,
      invocations: [
        { token: '/investment-research-agent', ok: true },
        { token: '@source.body', ok: true },
        { token: '#runtime-ready', ok: true },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch)
  const body = JSON.parse(String(requestInit?.body || '{}')) as { invocationTokens?: unknown }
  if (
    requestUrl !== AGENTIC_OS_DOCS_MCP_BRIDGE_PATH
    || requestInit?.method !== 'POST'
    || JSON.stringify(body.invocationTokens) !== JSON.stringify(['/investment-research-agent', '@source.body', '#runtime-ready'])
    || response.mcpInvoked !== true
  ) {
    throw new Error(`expected bounded same-origin docs MCP invocation, got ${JSON.stringify({ requestUrl, requestInit, body, response })}`)
  }
}
