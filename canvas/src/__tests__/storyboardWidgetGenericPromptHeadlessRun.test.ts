import { createStoryboardWidgetWorkflowNodeRunner } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'
import {
  planStoryboardWidgetRunMaterializationPositions,
  type StoryboardWidgetRunExecutionAnchorSnapshot,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRunExecutionAnchor'
import { HEADLESS_RESPONSE_RUN_SCHEMA } from '@/features/chat/headlessResponseCoordinator'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
} from '@/lib/render/richMediaPanelDefaults'
import type { GraphData, GraphNode } from '@/lib/graph/types'

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

export async function testGenericPromptWidgetUsesSharedHeadlessCoordinatorBeforeSourceFallback() {
  useGraphStore.getState().resetAll()
  const generatedText = '# Generic Widget response\n\nGenerated through the shared headless response contract.'
  const executionAnchor: StoryboardWidgetRunExecutionAnchorSnapshot = {
    nodeId: 'generic-prompt-widget',
    graphMetaKey: 'generic-headless-run',
    authority: 'screen',
    world: { x: 160, y: 220 },
    screen: { left: 160, top: 220 },
    paintScale: 1,
    transform: { k: 1, x: 0, y: 0 },
    visibleViewport: {
      left: 0,
      top: 0,
      right: 1_200,
      bottom: 800,
      width: 1_200,
      height: 800,
    },
  }
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
  let captureCount = 0
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
      captureExecutionAnchor: () => {
        captureCount += 1
        return executionAnchor
      },
    })
    await runWorkflowNode(node.id, { propagateErrors: true })
  } finally {
    globalThis.fetch = originalFetch
  }

  const updatedSource = graphData.nodes.find(candidate => candidate.id === node.id)
  const resultPanels = graphData.nodes.filter(candidate => candidate.type === 'RichMediaPanel')
  const instructions = String(requestBodies[0]?.instructions || '')
  const materializationRequest = useGraphStore.getState().storyboardWidgetLayoutRebalanceRequest
  const expectedPanelPosition = planStoryboardWidgetRunMaterializationPositions({
    snapshot: executionAnchor,
    count: 1,
    itemWidth: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    itemHeight: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
    preset: 'richMedia',
  })[0]
  if (
    requestBodies.length !== 1
    || captureCount !== 1
    || !instructions.includes('pipeline AI assistant operating inside a graph workspace canvas')
    || updatedSource?.properties.output !== generatedText
    || updatedSource?.properties.headlessResponseRunSchema !== HEADLESS_RESPONSE_RUN_SCHEMA
    || resultPanels.length !== 1
    || resultPanels[0]?.properties.output !== generatedText
    || resultPanels[0]?.x !== expectedPanelPosition?.x
    || resultPanels[0]?.y !== expectedPanelPosition?.y
    || materializationRequest != null
    || toasts.some(toast => toast.message === 'Generated source-backed Rich Media output.')
  ) {
    throw new Error(`expected a prompt-bearing generic Widget to use one shared headless provider lane and upstream viewport placement without downstream camera recovery before source-backed fallback, got ${JSON.stringify({ requestBodies, graphData, materializationRequest, toasts })}`)
  }
}
