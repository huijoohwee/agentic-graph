import { runStoryboardWidgetHeadlessTextResponse } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetHeadlessTextRun'
import { buildStoryboardWidgetTextRunSourceState } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextRunSourceState'
import { createStoryboardWidgetWorkflowNodeRunner } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'
import { HEADLESS_RESPONSE_RUN_SCHEMA } from '@/features/chat/headlessResponseCoordinator'
import {
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
  FLOW_PROMPT_INPUT_PORT_KEY,
  FLOW_TEXT_OUTPUT_PORT_KEY,
} from '@/lib/graph/flowPorts'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { createStoryboardWidgetTextOutputHarness as createTextOutputHarness } from '@/tests/lib/storyboardWidgetTextOutputHarness'

const responseStream = (events: readonly unknown[]): Response => {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        const data = event === '[DONE]' ? '[DONE]' : JSON.stringify(event)
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

export function testGenericTextRunFeedsExplicitWidgetWithoutIntermediatePanel() {
  const generatedText = '# Canonical result\n\nUse one inference result downstream.'
  const sourceProperties = buildStoryboardWidgetTextRunSourceState({
    properties: { prompt: 'Generate one reusable result.' },
    loading: false,
    runAt: '2026-07-29T08:45:00.000Z',
    responseText: generatedText,
    title: 'Source Widget',
    model: 'test-model',
  })
  const source: GraphNode = {
    id: 'source-widget',
    type: 'TextGeneration',
    label: 'Source Widget',
    properties: sourceProperties as never,
  }
  const target: GraphNode = {
    id: 'target-widget',
    type: 'TextGeneration',
    label: 'Target Widget',
    properties: { prompt: 'This authored prompt is replaced only in the connected run view.' },
  }
  const graph: GraphData = {
    type: 'Graph',
    nodes: [source, target],
    edges: [{
      id: 'source-to-target',
      source: source.id,
      target: target.id,
      label: 'text output to prompt',
      properties: {
        [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
        [FLOW_EDGE_TARGET_PORT_KEY]: FLOW_PROMPT_INPUT_PORT_KEY,
      },
    }],
  }
  const harness = createTextOutputHarness(graph)
  const publication = harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: generatedText,
    title: source.label || 'Source Widget',
    model: 'test-model',
    connectCreatedOutputToAnchor: true,
  })
  const published = harness.readGraph()
  const registry = [{
    id: 'text-generation',
    isEnabled: true,
    nodeTypeId: 'TextGeneration',
    widgetTypeId: 'default',
    formId: 'textGeneration',
    fields: [],
    ports: [
      { portKey: FLOW_PROMPT_INPUT_PORT_KEY, direction: 'input' as const, schemaPath: 'properties.prompt' },
      { portKey: FLOW_TEXT_OUTPUT_PORT_KEY, direction: 'output' as const, schemaPath: 'properties.output' },
    ],
    schemaMappings: [],
    updatedAt: '2026-07-29T08:45:00.000Z',
  }]
  const connectedPrompt = computeFlowConnectedValuesBySchemaPath({
    graphData: published,
    registry,
    targetNodeIds: new Set([target.id]),
  }).get(target.id)?.['properties.prompt']

  if (
    publication !== null
    || published.nodes.length !== 2
    || published.nodes.some(node => node.type === 'RichMediaPanel')
    || published.edges.length !== 1
    || connectedPrompt?.value !== generatedText
    || connectedPrompt.sources.length !== 1
    || connectedPrompt.sources[0]?.nodeId !== source.id
    || connectedPrompt.sources[0]?.portKey !== FLOW_TEXT_OUTPUT_PORT_KEY
  ) {
    throw new Error(`expected source Widget text_out to feed the explicit target Widget without an intermediate Rich Media panel, got ${JSON.stringify({ publication, published, connectedPrompt })}`)
  }
}

export function testTypedWidgetAndExplicitPanelShareCanonicalSourceProjection() {
  const generatedText = '# Shared result\n\nOne source response, two projections.'
  const source: GraphNode = {
    id: 'source-widget',
    type: 'TextGeneration',
    label: 'Source Widget',
    properties: buildStoryboardWidgetTextRunSourceState({
      properties: {
        prompt: 'Generate one reusable result.',
        'canvas:widgetCard': {
          key: 'canvas:widgetCard',
          type: 'object',
          value: {
            onEdit: { trigger: 'runDownstream', targets: ['target-widget'] },
          },
        },
      },
      loading: false,
      runAt: '2026-07-29T09:20:00.000Z',
      responseText: generatedText,
      title: 'Source Widget',
      model: 'test-model',
    }) as never,
  }
  const widgetTarget: GraphNode = {
    id: 'target-widget',
    type: 'TextGeneration',
    label: 'Target Widget',
    properties: { prompt: 'Consume the connected result.' },
  }
  const panelTarget: GraphNode = {
    id: 'target-panel',
    type: 'RichMediaPanel',
    label: 'Result Panel',
    properties: {},
  }
  const graph: GraphData = {
    type: 'Graph',
    nodes: [source, widgetTarget, panelTarget],
    edges: [
      {
        id: 'source-to-widget',
        source: source.id,
        target: widgetTarget.id,
        label: 'text output to prompt',
        properties: {
          [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
          [FLOW_EDGE_TARGET_PORT_KEY]: FLOW_PROMPT_INPUT_PORT_KEY,
        },
      },
      {
        id: 'source-to-panel',
        source: source.id,
        target: panelTarget.id,
        label: 'text output to panel',
        properties: {
          [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
          [FLOW_EDGE_TARGET_PORT_KEY]: 'output',
        },
      },
    ],
  }
  const harness = createTextOutputHarness(graph)
  const publication = harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: generatedText,
    title: source.label || 'Source Widget',
    model: 'test-model',
    connectCreatedOutputToAnchor: true,
  })
  const published = harness.readGraph()
  const registry = [{
    id: 'text-generation',
    isEnabled: true,
    nodeTypeId: 'TextGeneration',
    widgetTypeId: 'default',
    formId: 'textGeneration',
    fields: [],
    ports: [
      { portKey: FLOW_PROMPT_INPUT_PORT_KEY, direction: 'input' as const, schemaPath: 'properties.prompt' },
      { portKey: FLOW_TEXT_OUTPUT_PORT_KEY, direction: 'output' as const, schemaPath: 'properties.output' },
    ],
    schemaMappings: [],
    updatedAt: '2026-07-29T09:20:00.000Z',
  }]
  const connectedPrompt = computeFlowConnectedValuesBySchemaPath({
    graphData: published,
    registry,
    targetNodeIds: new Set([widgetTarget.id]),
  }).get(widgetTarget.id)?.['properties.prompt']
  const panels = published.nodes.filter(node => node.type === 'RichMediaPanel')
  if (
    !publication
    || published.nodes.length !== 3
    || panels.length !== 1
    || panels[0]?.id !== panelTarget.id
    || panels[0]?.properties.output !== generatedText
    || connectedPrompt?.value !== generatedText
    || published.edges.length !== 2
  ) {
    throw new Error(`expected one canonical source output to feed the typed Widget and explicit Rich Media target without an intermediary, got ${JSON.stringify({ published, connectedPrompt })}`)
  }
}

export function testExistingOwnedPanelStillProjectsWithTypedWidgetTarget() {
  const source: GraphNode = {
    id: 'source-widget', type: 'TextGeneration', label: 'Source Widget',
    properties: {
      prompt: 'Generate a reusable result.',
      'canvas:widgetCard': { value: { onEdit: { trigger: 'runDownstream', targets: ['target-widget'] } } },
    },
  }
  const target: GraphNode = { id: 'target-widget', type: 'TextGeneration', label: 'Target Widget', properties: { prompt: 'Consume the source output.' } }
  const panel: GraphNode = {
    id: 'owned-panel', type: 'RichMediaPanel', label: 'Generated Result',
    properties: { output: '# Previous result', workflowOutputAnchorNodeId: source.id, workflowOutputKey: 'output' },
  }
  const harness = createTextOutputHarness({
    type: 'Graph',
    nodes: [source, target, panel],
    edges: [
      {
        id: 'source-to-owned-panel', source: source.id, target: panel.id, label: 'output',
        properties: { workflowOutputEdge: true, workflowOutputAnchorNodeId: source.id, workflowOutputKey: 'output' },
      },
      {
        id: 'source-to-target', source: source.id, target: target.id, label: 'text output to prompt',
        properties: {
          [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
          [FLOW_EDGE_TARGET_PORT_KEY]: FLOW_PROMPT_INPUT_PORT_KEY,
        },
      },
    ],
  })
  const publication = harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source, outputText: '# Revised result',
    title: source.label || 'Source Widget', model: 'test-model', connectCreatedOutputToAnchor: true,
  })
  const published = harness.readGraph()
  const panels = published.nodes.filter(node => node.type === 'RichMediaPanel')
  const publishedPanel = panels[0]
  if (
    !publication
    || panels.length !== 1
    || published.nodes.length !== 3
    || publishedPanel?.properties.output !== '# Revised result'
    || publishedPanel.properties.workflowOutputAnchorNodeId !== source.id
    || publishedPanel.properties.workflowOutputKey !== 'output'
    || published.edges.length !== 2
    || published.edges[0]?.properties?.workflowOutputEdge !== true
  ) {
    throw new Error(`expected an existing owned panel to remain a projection after adding a typed Widget target, got ${JSON.stringify(published)}`)
  }
}

export function testUntypedWidgetTargetKeepsOwnedPanelFallback() {
  const source: GraphNode = {
    id: 'source-widget',
    type: 'TextGeneration',
    label: 'Source Widget',
    properties: { prompt: 'Generate a result.' },
  }
  const target: GraphNode = {
    id: 'target-widget',
    type: 'TextGeneration',
    label: 'Target Widget',
    properties: { prompt: 'Use a connected result.' },
  }
  const invalidPortProperties = [
    {},
    {
      [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
      [FLOW_EDGE_TARGET_PORT_KEY]: 'unregistered_input',
    },
  ]

  for (const properties of invalidPortProperties) {
    const graph: GraphData = {
      type: 'Graph',
      nodes: [source, target],
      edges: [{
        id: `source-to-target-${Object.keys(properties).length}`,
        source: source.id,
        target: target.id,
        label: 'authored target',
        properties,
      }],
    }
    const harness = createTextOutputHarness(graph)
    const publication = harness.publishers.publishTextRunOutputToRichMediaPanel({
      anchorNode: source,
      outputText: '# Safe fallback',
      title: source.label || 'Source Widget',
      model: 'test-model',
      connectCreatedOutputToAnchor: true,
    })
    const published = harness.readGraph()
    const panels = published.nodes.filter(node => node.type === 'RichMediaPanel')
    if (
      !publication
      || panels.length !== 1
      || panels[0]?.properties.output !== '# Safe fallback'
    ) {
      throw new Error(`expected untyped or incompatible Widget topology to retain the owned Rich Media fallback, got ${JSON.stringify(published)}`)
    }
  }
}

export function testOwnedOutputIgnoresTypedWidgetFallbackSuppression() {
  const source: GraphNode = {
    id: 'deliverables-widget',
    type: 'TextGeneration',
    label: 'Deliverables Widget',
    properties: { prompt: 'Create owned deliverables.' },
  }
  const target: GraphNode = {
    id: 'downstream-widget',
    type: 'TextGeneration',
    label: 'Downstream Widget',
    properties: { prompt: 'Consume the source separately.' },
  }
  const graph: GraphData = {
    type: 'Graph',
    nodes: [source, target],
    edges: [{
      id: 'deliverables-to-downstream',
      source: source.id,
      target: target.id,
      label: 'deliverable source to downstream prompt',
      properties: {
        [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
        [FLOW_EDGE_TARGET_PORT_KEY]: FLOW_PROMPT_INPUT_PORT_KEY,
      },
    }],
  }
  const harness = createTextOutputHarness(graph)
  const publication = harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: '# Owned deliverable',
    title: 'Owned deliverable',
    model: 'test-model',
    outputKey: 'owned-deliverable',
    ownedOutputOnly: true,
    allowCreateStandaloneOutput: true,
  })
  const published = harness.readGraph()
  const panels = published.nodes.filter(node => node.type === 'RichMediaPanel')
  if (!publication || panels.length !== 1 || panels[0]?.properties.output !== '# Owned deliverable') {
    throw new Error(`expected owned deliverables to materialize even when a typed Widget target also exists, got ${JSON.stringify(published)}`)
  }
}

export async function testHeadlessWidgetRunUsesOneProviderLaneAndCanonicalProjections() {
  const node: GraphNode = {
    id: 'source-widget',
    type: 'TextGeneration',
    label: 'Source Widget',
    properties: { prompt: 'Generate one concise answer.' },
  }
  const generatedText = '# Final answer\n\nOne canonical response.'
  const published: Array<Parameters<ReturnType<typeof createTextOutputHarness>['publishers']['publishTextRunOutputToRichMediaPanel']>[0]> = []
  const loadingStates: boolean[] = []
  const successes: string[] = []
  let providerCalls = 0
  let sourceProperties = { ...node.properties } as Record<string, unknown>

  const result = await runStoryboardWidgetHeadlessTextResponse({
    sourceNodeId: node.id,
    node,
    authoredRequestText: String(node.properties.prompt),
    providerPrompt: 'Generate one concise answer.\n\nConnected source context: none.',
    provider: 'test-provider',
    model: 'test-model',
    workspacePath: null,
    outputSourceProvenanceJson: '',
    generateText: async (prompt, onText, systemMessages) => {
      providerCalls += 1
      if (
        prompt !== 'Generate one concise answer.\n\nConnected source context: none.'
        || !systemMessages?.[0]?.content.includes('pipeline AI assistant operating inside a graph workspace canvas')
      ) throw new Error('expected the Widget adapter to forward the shared provider prompt and response contract')
      onText?.('# Final answer')
      return generatedText
    },
    updateSource: update => { sourceProperties = update(sourceProperties) },
    publishOutput: args => {
      published.push(args)
      return null
    },
    setLoading: loading => { loadingStates.push(loading) },
    reportFailure: message => { throw new Error(message) },
    reportSuccess: message => { successes.push(message) },
  })

  if (
    providerCalls !== 1
    || result?.schema !== HEADLESS_RESPONSE_RUN_SCHEMA
    || result.responseText !== generatedText
    || sourceProperties.output !== generatedText
    || sourceProperties.headlessResponseRunId !== result.runId
    || sourceProperties.headlessResponseRunStatus !== 'ok'
    || published.length !== 2
    || published[0]?.outputText !== '# Final answer'
    || published[0]?.loading !== true
    || published[1]?.outputText !== generatedText
    || published[1]?.loading !== false
    || loadingStates.join(',') !== 'true,false'
    || successes.join(',') !== 'Generated text output.'
  ) {
    throw new Error(`expected one Widget provider lane to project the same streamed and canonical response, got ${JSON.stringify({ providerCalls, result, sourceProperties, published, loadingStates, successes })}`)
  }
}

export async function testHeadlessWidgetFailurePreservesLastGoodOutput() {
  const node: GraphNode = {
    id: 'source-widget',
    type: 'TextGeneration',
    label: 'Source Widget',
    properties: {
      prompt: 'Try another response.',
      output: '# Previous answer',
      outputModel: 'previous-model',
    },
  }
  let sourceProperties = { ...node.properties } as Record<string, unknown>
  const failures: string[] = []
  const result = await runStoryboardWidgetHeadlessTextResponse({
    sourceNodeId: node.id,
    node,
    authoredRequestText: String(node.properties.prompt),
    providerPrompt: String(node.properties.prompt),
    provider: 'test-provider',
    model: 'test-model',
    workspacePath: null,
    outputSourceProvenanceJson: '',
    generateText: async () => '',
    updateSource: update => { sourceProperties = update(sourceProperties) },
    publishOutput: () => null,
    setLoading: () => undefined,
    reportFailure: message => { failures.push(message) },
    reportSuccess: () => undefined,
  })
  if (
    result !== null
    || sourceProperties.output !== '# Previous answer'
    || sourceProperties.outputModel !== 'previous-model'
    || failures.length !== 1
  ) {
    throw new Error(`expected a failed provider run to preserve the last good source output, got ${JSON.stringify({ result, sourceProperties, failures })}`)
  }
}

export async function testHeadlessWidgetStreamingFailureClearsTerminalLoading() {
  const node: GraphNode = {
    id: 'source-widget',
    type: 'TextGeneration',
    label: 'Source Widget',
    properties: { prompt: 'Stream a response.' },
  }
  let sourceProperties = { ...node.properties } as Record<string, unknown>
  const published: Array<Record<string, unknown>> = []
  let thrown = ''
  try {
    await runStoryboardWidgetHeadlessTextResponse({
      sourceNodeId: node.id, node, authoredRequestText: String(node.properties.prompt),
      providerPrompt: String(node.properties.prompt), provider: 'test-provider', model: 'test-model',
      workspacePath: null, outputSourceProvenanceJson: '',
      generateText: async (_prompt, onText) => {
        onText?.('# Partial response')
        throw new Error('provider stream failed')
      },
      updateSource: update => { sourceProperties = update(sourceProperties) },
      publishOutput: args => { published.push(args as unknown as Record<string, unknown>); return null },
      setLoading: () => undefined,
      reportFailure: () => undefined,
      reportSuccess: () => undefined,
    })
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error)
  }
  const terminal = published[published.length - 1]
  const terminalProperties = terminal?.panelProperties as Record<string, unknown> | undefined
  if (
    thrown !== 'provider stream failed'
    || sourceProperties.output !== '# Partial response'
    || sourceProperties.outputLoading !== undefined
    || sourceProperties.headlessResponseRunStatus !== 'error'
    || terminal?.outputText !== '# Partial response'
    || terminal?.loading !== false
    || terminalProperties?.headlessResponseRunStatus !== 'error'
  ) {
    throw new Error(`expected a failed Widget stream to terminate its canonical partial projection, got ${JSON.stringify({ thrown, sourceProperties, published })}`)
  }
}

export async function testGenericPromptWidgetUsesSharedHeadlessCoordinatorBeforeSourceFallback() {
  const generatedText = '# Generic Widget response\n\nGenerated through the shared headless response contract.'
  const node: GraphNode = {
    id: 'generic-prompt-widget',
    type: 'XrDemoValidation',
    label: 'Generic Prompt Widget',
    properties: {
      prompt: 'Explain the selected runtime evidence in two sentences.',
      chatProvider: 'openai',
      chatAuthMode: 'serverManaged',
      chatEndpointUrl: 'https://api.openai.com/v1/responses',
      chatModel: 'gpt-5-nano',
      chatStream: true,
    },
  }
  let graphData: GraphData = { type: 'Graph', nodes: [node], edges: [] }
  const toasts: Array<{ message: string }> = []
  const requestBodies: Array<Record<string, unknown>> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/__chat_proxy/v1/responses') {
        throw new Error(`unexpected endpoint ${String(input)}`)
      }
      requestBodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
      return responseStream([
        { type: 'response.output_text.delta', delta: generatedText },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [{
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: generatedText }],
            }],
          },
        },
        '[DONE]',
      ])
    }) as typeof fetch

    const runWorkflowNode = createStoryboardWidgetWorkflowNodeRunner({
      baseGraphKind: 'frontmatter-flow',
      baseGraphData: graphData,
      readDraftGraphData: () => graphData,
      commitDraftGraphDataUpdate: (_current, next) => { graphData = next },
      commitPublishedGraphData: next => { graphData = next },
      persistDraftGraphData: next => { graphData = next },
      renderGraphDataOverride: null,
      markdownDocumentName: null,
      markdownDocumentSourceUrl: null,
      widgetRegistry: [],
      appendDraftNode: args => {
        const id = String(args.id || `n${graphData.nodes.length + 1}`)
        graphData = {
          ...graphData,
          nodes: [...graphData.nodes, { ...args, id, properties: args.properties || {} } as GraphNode],
        }
        return id
      },
      updateNode: (id, patch) => {
        graphData = {
          ...graphData,
          nodes: graphData.nodes.map(current => String(current.id) === id ? { ...current, ...patch } : current),
        }
      },
      upsertUiToast: toast => { toasts.push({ message: toast.message }) },
      scheduleOverlayEdgeUpdate: () => undefined,
    })
    await runWorkflowNode(node.id, { propagateErrors: true })
  } finally {
    globalThis.fetch = originalFetch
  }

  const updatedSource = graphData.nodes.find(candidate => candidate.id === node.id)
  const resultPanels = graphData.nodes.filter(candidate => candidate.type === 'RichMediaPanel')
  const instructions = String(requestBodies[0]?.instructions || '')
  if (
    requestBodies.length !== 1
    || !instructions.includes('pipeline AI assistant operating inside a graph workspace canvas')
    || updatedSource?.properties.output !== generatedText
    || updatedSource?.properties.headlessResponseRunSchema !== HEADLESS_RESPONSE_RUN_SCHEMA
    || resultPanels.length !== 1
    || resultPanels[0]?.properties.output !== generatedText
    || toasts.some(toast => toast.message === 'Generated source-backed Rich Media output.')
  ) {
    throw new Error(`expected a prompt-bearing generic Widget to use one shared headless provider lane before source-backed fallback, got ${JSON.stringify({ requestBodies, graphData, toasts })}`)
  }
}
