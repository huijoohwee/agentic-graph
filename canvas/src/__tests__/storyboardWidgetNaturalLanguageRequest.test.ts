import { createStoryboardWidgetWorkflowNodeRunner } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'
import {
  normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement,
  resolveStoryboardWidgetWorkflowOutputPanelPosition,
  STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION,
  STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { HEADLESS_RESPONSE_RUN_SCHEMA } from '@/features/chat/headlessResponseCoordinator'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  buildStoryboardWidgetRunMaterializationLayoutProperties,
  buildStoryboardWidgetRunExecutionAnchorSnapshot,
  planStoryboardWidgetRunMaterializationPositions,
  type StoryboardWidgetRunExecutionAnchorSnapshot,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRunExecutionAnchor'
import {
  RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
} from '@/lib/render/richMediaPanelDefaults'
import { readDefaultStoryboardCardSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { resolveStoryboardPaintScale } from '@/components/StoryboardCanvas/storyboardInfiniteZoomMetrics'
import { PROBE_TREE_OUTPUT_KEY } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import { screenToWorld, worldToScreen } from '@/lib/zoom/viewport'

export function testOwnedRichMediaPanelPlacementUsesLiveCanonicalAnchor() {
  const liveAnchor: GraphNode = {
    id: 'doc:placement-source',
    type: 'Document',
    label: 'placement source',
    x: 320,
    y: 240,
    properties: {},
  }
  const staleRunAnchor: GraphNode = {
    ...liveAnchor,
    x: 9_000,
    y: 5_000,
  }
  const position = resolveStoryboardWidgetWorkflowOutputPanelPosition({
    anchorNode: staleRunAnchor,
    liveDraftGraphData: { type: 'Graph', nodes: [liveAnchor], edges: [] },
  })
  const stalePosition = resolveStoryboardWidgetWorkflowOutputPanelPosition({
    anchorNode: staleRunAnchor,
    liveDraftGraphData: null,
  })
  if (
    position.y !== liveAnchor.y
    || position.x - (liveAnchor.x || 0) !== stalePosition.x - (staleRunAnchor.x || 0)
  ) {
    throw new Error(`expected workflow output placement to resolve the live canonical anchor, got ${JSON.stringify({ position, stalePosition })}`)
  }

  const userMovedPanel: GraphNode = {
    id: 'user-moved-output',
    type: 'RichMediaPanel',
    label: 'user moved output',
    x: 12_000,
    y: 8_000,
    properties: {
      workflowOutputAnchorNodeId: liveAnchor.id,
      workflowOutputKey: 'output',
      [STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY]:
        STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION,
    },
  }
  const versionedGraph: GraphData = {
    type: 'Graph',
    nodes: [liveAnchor, userMovedPanel],
    edges: [],
  }
  let commitCount = 0
  const repaired = normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement({
    anchorNode: staleRunAnchor,
    panelNodeId: userMovedPanel.id,
    readLiveDraftGraphData: () => versionedGraph,
    commitDraftGraphDataUpdate: () => { commitCount += 1 },
  })
  if (repaired || commitCount !== 0 || userMovedPanel.x !== 12_000 || userMovedPanel.y !== 8_000) {
    throw new Error('expected a version-stamped workflow output panel to preserve its user-authored placement')
  }

  const legacyOverlappingPanel: GraphNode = {
    id: 'legacy-overlapping-output',
    type: 'RichMediaPanel',
    label: 'legacy output',
    x: liveAnchor.x,
    y: liveAnchor.y,
    properties: {
      workflowOutputAnchorNodeId: liveAnchor.id,
      workflowOutputKey: 'output',
    },
  }
  let legacyGraph: GraphData = {
    type: 'Graph',
    nodes: [liveAnchor, legacyOverlappingPanel],
    edges: [],
  }
  const capturedPanelPosition = { x: 720, y: 420 }
  const repairedLegacyOverlap = normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement({
    anchorNode: staleRunAnchor,
    panelNodeId: legacyOverlappingPanel.id,
    anchorPositionOverride: { x: liveAnchor.x!, y: liveAnchor.y! },
    panelPositionOverride: capturedPanelPosition,
    readLiveDraftGraphData: () => legacyGraph,
    commitDraftGraphDataUpdate: (_current, next) => { legacyGraph = next },
  })
  const repairedLegacyPanel = legacyGraph.nodes.find(node => node.id === legacyOverlappingPanel.id)
  if (
    !repairedLegacyOverlap
    || repairedLegacyPanel?.x !== capturedPanelPosition.x
    || repairedLegacyPanel?.y !== capturedPanelPosition.y
    || repairedLegacyPanel?.properties[
      STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY
    ] !== STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION
  ) {
    throw new Error(`expected a captured Run position to repair a nearby overlapping legacy panel before stamping it current, got ${JSON.stringify(repairedLegacyPanel)}`)
  }

  const staleProbePanel: GraphNode = {
    id: 'stale-probe-output',
    type: 'RichMediaPanel',
    label: 'Probe output',
    x: 48_000,
    y: -31_000,
    properties: {
      workflowOutputAnchorNodeId: liveAnchor.id,
      workflowOutputKey: PROBE_TREE_OUTPUT_KEY,
      [STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY]:
        STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION,
      ...buildStoryboardWidgetRunMaterializationLayoutProperties(),
    },
  }
  let staleProbeGraph: GraphData = {
    type: 'Graph',
    nodes: [liveAnchor, staleProbePanel],
    edges: [],
  }
  const capturedProbePanelPosition = { x: 640, y: 360 }
  const repairedStaleProbe = normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement({
    anchorNode: liveAnchor,
    panelNodeId: staleProbePanel.id,
    panelPositionOverride: capturedProbePanelPosition,
    forcePanelPosition: true,
    readLiveDraftGraphData: () => staleProbeGraph,
    commitDraftGraphDataUpdate: (_current, next) => { staleProbeGraph = next },
  })
  const repairedProbePanel = staleProbeGraph.nodes.find(node => node.id === staleProbePanel.id)
  if (
    !repairedStaleProbe
    || repairedProbePanel?.x !== capturedProbePanelPosition.x
    || repairedProbePanel?.y !== capturedProbePanelPosition.y
  ) {
    throw new Error(`expected caller-owned captured layout authority to migrate an existing offscreen Probe output, got ${JSON.stringify(repairedProbePanel)}`)
  }
}

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

export async function testDocumentSummaryUsesSharedHeadlessCoordinatorBeforeSourceFallback() {
  const requestText = 'SGD800预算，从淘宝、拼多多、Shopee可进什么潮玩、3C等到新马泰开小店、直播，支付宝支付；空运/海运？'
  const generatedText = '# 低预算跨境试销建议\n\n先用小批量潮玩配件验证需求，再按毛利和合规结果扩展。'
  const node: GraphNode = {
    id: 'doc:md:note-20260729t110403z',
    type: 'Document',
    label: 'note_20260729T110403Z',
    x: 320,
    y: 240,
    properties: {
      summary: requestText,
      chatProvider: 'openai',
      chatAuthMode: 'serverManaged',
      chatEndpointUrl: 'https://api.openai.com/v1/responses',
      chatModel: 'gpt-5-nano',
      chatStream: true,
    },
  }
  const legacyOwnedPanel: GraphNode = {
    id: 'legacy-owned-output',
    type: 'RichMediaPanel',
    label: 'response',
    x: 9_540,
    y: 5_200,
    properties: {
      media_interactive: true,
      workflowOutputAnchorNodeId: node.id,
      workflowOutputKey: 'output',
    },
  }
  let graphData: GraphData = { type: 'Graph', nodes: [node, legacyOwnedPanel], edges: [] }
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
  const providerPayload = JSON.stringify(requestBodies[0] || {})
  const expectedPanelPosition = resolveStoryboardWidgetWorkflowOutputPanelPosition({
    anchorNode: node,
    liveDraftGraphData: graphData,
  })
  if (
    requestBodies.length !== 1
    || !providerPayload.includes(requestText)
    || updatedSource?.properties.output !== generatedText
    || updatedSource?.properties.headlessResponseRunSchema !== HEADLESS_RESPONSE_RUN_SCHEMA
    || resultPanels.length !== 1
    || resultPanels[0]?.properties.output !== generatedText
    || resultPanels[0]?.properties.markdownWorkspaceViewerSurface !== true
    || resultPanels[0]?.x !== expectedPanelPosition.x
    || resultPanels[0]?.y !== expectedPanelPosition.y
    || resultPanels[0]?.properties[STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY]
      !== STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION
    || toasts.some(toast => toast.message === 'Generated source-backed Rich Media output.')
  ) {
    throw new Error(`expected a Document card summary to run as natural-language input through the shared headless coordinator, got ${JSON.stringify({ requestBodies, graphData, toasts })}`)
  }
}

export async function testRunMaterializationUsesCapturedExecutionAnchorAtNaturalZoom() {
  const source: GraphNode = {
    id: 'doc:generic-request',
    type: 'Document',
    label: 'Generic request',
    x: -4_000,
    y: -2_500,
    properties: {
      summary: 'Compare the available options and identify the next decision.',
      chatProvider: 'openai',
      chatAuthMode: 'serverManaged',
      chatEndpointUrl: 'https://api.openai.com/v1/responses',
      chatModel: 'gpt-5-nano',
      chatStream: true,
    },
  }
  const renderedTransform = { k: 1, x: 982, y: -523 }
  const sourceScreenTopLeft = { left: 360, top: 240 }
  const sourceWorldTopLeft = screenToWorld({
    transform: renderedTransform,
    sx: sourceScreenTopLeft.left,
    sy: sourceScreenTopLeft.top,
  })
  const snapshot: StoryboardWidgetRunExecutionAnchorSnapshot = {
    nodeId: source.id,
    graphMetaKey: 'generic-document',
    authority: 'screen',
    world: sourceWorldTopLeft,
    screen: sourceScreenTopLeft,
    paintScale: 1,
    transform: renderedTransform,
    visibleViewport: {
      left: 0,
      top: 0,
      right: 1_200,
      bottom: 800,
      width: 1_200,
      height: 800,
    },
  }
  let graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [source],
    edges: [],
  }
  let captureCount = 0
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => responseStream([
      { type: 'response.output_text.delta', delta: 'A complete generic response.' },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [{
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'A complete generic response.' }],
          }],
        },
      },
      '[DONE]',
    ])) as typeof fetch
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
          nodes: graphData.nodes.map(node => String(node.id) === id ? { ...node, ...patch } : node),
        }
      },
      upsertUiToast: () => undefined,
      scheduleOverlayEdgeUpdate: () => undefined,
      captureExecutionAnchor: nodeId => {
        captureCount += 1
        if (nodeId !== source.id) throw new Error(`expected canonical source capture, got ${nodeId}`)
        return snapshot
      },
    })
    await runWorkflowNode(source.id, { propagateErrors: true })
  } finally {
    globalThis.fetch = originalFetch
  }

  const expected = planStoryboardWidgetRunMaterializationPositions({
    snapshot,
    count: 1,
    itemWidth: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    itemHeight: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
    preset: 'richMedia',
  })[0]!
  const retainedSource = graphData.nodes.find(node => node.id === source.id)
  const output = graphData.nodes.find(node => node.type === 'RichMediaPanel')
  const outputScreen = output
    ? worldToScreen({ transform: renderedTransform, x: Number(output.x), y: Number(output.y) })
    : null
  const outputRight = Number(outputScreen?.sx) + RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX
  const outputBottom = Number(outputScreen?.sy) + RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX
  const overlapsEffectiveSource = (
    Number(outputScreen?.sx) < sourceScreenTopLeft.left + RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX
    && outputRight > sourceScreenTopLeft.left
    && Number(outputScreen?.sy) < sourceScreenTopLeft.top + RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX
    && outputBottom > sourceScreenTopLeft.top
  )
  if (
    captureCount !== 1
    || retainedSource?.x !== source.x
    || retainedSource?.y !== source.y
    || !output
    || output.x !== expected.x
    || output.y !== expected.y
    || !outputScreen
    || outputRight <= snapshot.visibleViewport.left
    || outputScreen.sx >= snapshot.visibleViewport.right
    || outputBottom <= snapshot.visibleViewport.top
    || outputScreen.sy >= snapshot.visibleViewport.bottom
    || overlapsEffectiveSource
    || snapshot.transform.k !== 1
    || snapshot.transform.x === 0
    || snapshot.transform.y === 0
  ) {
    throw new Error(`expected Run materialization to use one immutable visible execution anchor without moving the source or camera, got ${JSON.stringify({ captureCount, graphData, expected })}`)
  }
}

export function testHeterogeneousRunMaterializationPreservesRendererProjectionAcrossZoom() {
  const viewport = {
    left: 0,
    top: 0,
    right: 1_400,
    bottom: 1_000,
    width: 1_400,
    height: 1_000,
  }
  const fixedCardSize = readDefaultStoryboardCardSize2d('9:16')
  const richMediaSize = {
    width: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    height: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  }
  const sourceNaturalSize = readDefaultStoryboardCardSize2d('16:9')
  const overlaps = (
    left: { left: number; top: number; width: number; height: number },
    right: { left: number; top: number; width: number; height: number },
  ): boolean => (
    left.left < right.left + right.width
    && left.left + left.width > right.left
    && left.top < right.top + right.height
    && left.top + left.height > right.top
  )

  for (const transform of [
    { k: 1, x: 982, y: -523 },
    { k: 0.65, x: 417, y: -188 },
  ]) {
    const paintScale = resolveStoryboardPaintScale(transform.k)
    const renderedScreenRect = {
      left: 160,
      top: 340,
      width: sourceNaturalSize.width * paintScale,
      height: sourceNaturalSize.height * paintScale,
    }
    const snapshot = buildStoryboardWidgetRunExecutionAnchorSnapshot({
      nodeId: 'heterogeneous-source',
      graphMetaKey: 'heterogeneous-run',
      graphPosition: { x: 90_000, y: -75_000 },
      liveWorldPosition: { x: -42_000, y: 18_000 },
      storedWorldPosition: { x: 8_000, y: 9_000 },
      storedScreenPosition: { left: 1_200, top: 800 },
      renderedScreenRect,
      defaultFixedCardSize: fixedCardSize,
      screenAuthority: false,
      worldPositionMode: 'center',
      worldPositionSize: sourceNaturalSize,
      paintScale,
      transform,
      visibleViewport: viewport,
    })
    if (
      !snapshot
      || snapshot.authority !== 'rendered'
      || snapshot.screen?.left !== renderedScreenRect.left
      || snapshot.screen?.top !== renderedScreenRect.top
      || snapshot.screen?.width !== renderedScreenRect.width
      || snapshot.screen?.height !== renderedScreenRect.height
      || snapshot.paintScale !== paintScale
      || snapshot.defaultFixedCardSize?.width !== fixedCardSize.width
      || snapshot.defaultFixedCardSize?.height !== fixedCardSize.height
    ) {
      throw new Error(`expected the measured rendered rectangle to be the authoritative heterogeneous Run source, got ${JSON.stringify(snapshot)}`)
    }
    const positions = planStoryboardWidgetRunMaterializationPositions({
      snapshot,
      sourceItem: sourceNaturalSize,
      items: [
        {
          ...fixedCardSize,
          worldPositionMode: 'center',
        },
        {
          ...richMediaSize,
          worldPositionMode: 'top-left',
        },
      ],
      preset: 'richMedia',
    })
    const fixedCenterScreen = worldToScreen({
      transform,
      x: positions[0]!.x,
      y: positions[0]!.y,
    })
    const richMediaCenterScreen = worldToScreen({
      transform,
      x: positions[1]!.x + richMediaSize.width / 2,
      y: positions[1]!.y + richMediaSize.height / 2,
    })
    const rects = [
      renderedScreenRect,
      {
        left: fixedCenterScreen.sx - fixedCardSize.width * paintScale / 2,
        top: fixedCenterScreen.sy - fixedCardSize.height * paintScale / 2,
        width: fixedCardSize.width * paintScale,
        height: fixedCardSize.height * paintScale,
      },
      {
        left: richMediaCenterScreen.sx - richMediaSize.width * paintScale / 2,
        top: richMediaCenterScreen.sy - richMediaSize.height * paintScale / 2,
        width: richMediaSize.width * paintScale,
        height: richMediaSize.height * paintScale,
      },
    ]
    const allInsideViewport = rects.every(rect => (
      rect.left >= viewport.left
      && rect.top >= viewport.top
      && rect.left + rect.width <= viewport.right
      && rect.top + rect.height <= viewport.bottom
    ))
    const allDisjoint = rects.every((rect, index) => (
      rects.slice(index + 1).every(other => !overlaps(rect, other))
    ))
    if (positions.length !== 2 || !allInsideViewport || !allDisjoint) {
      throw new Error(`expected mixed 9:16 center-owned cards and top-left Rich Media Panels to retain natural geometry in the captured viewport, got ${JSON.stringify({ transform, positions, rects })}`)
    }
  }
}

export {
  testCoordinatorFanoutRunMaterializationPreservesRightwardTopDownTopologyAtNaturalSize,
} from './storyboardWidgetCoordinatorFanoutMaterialization.test'
