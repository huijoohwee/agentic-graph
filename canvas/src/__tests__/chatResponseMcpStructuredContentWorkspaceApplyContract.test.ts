import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { appendChatHistoryWorkspaceFile } from '@/features/chat/chatHistoryWorkspace'
import { applyChatAgenticOsWorkspaceDocumentToCanvas } from '@/features/chat/chatAgenticOsCanvasApply'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_WIDGET_REGISTRY_METADATA_KEY,
} from '@/lib/config.storyboard-widget'
import { resolveWidgetRegistryEntry } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { deriveFrontmatterFlowOverlayNodeIds } from '@/lib/storyboardWidget/frontmatterOverlayNodeIds'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { getCachedStoryboardWidgetWorkflowRunPlan } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { buildStoryboardWidgetInlineComputeOutputPatch } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunInputs'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import {
  buildGraphNodeCanonicalTextPatch,
  GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS,
  readGraphNodeCanonicalTextProperty,
} from '@/lib/cards/graphNodeCardFields'

export async function testChatResponseStructuredContentFinalizesWorkspaceAndAppliesCanvasGraph() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = [
      '```yaml',
      'response:',
      '  structuredContent:',
      '    widgets:',
      '      - id: apply-widget',
      '        label: Apply Widget',
      '        nodeTypeId: TextGeneration',
      '        formId: textGeneration.openai',
      '        widgetTypeId: default',
      '        prompt: "Summarize the applied workspace."',
      '      - id: compute-widget',
      '        label: Inline Compute Widget',
      '        nodeTypeId: TextGeneration',
      '        formId: textGeneration.openai',
      '        widgetTypeId: default',
      '        "flow:compute": "inputs => ({ text_out: String(inputs.prompt_in || \'\').trim().toUpperCase() })"',
      '    cards:',
      '      - id: apply-card',
      '        label: Apply Card',
      '        kind: text',
      '        output: "Editable card output from the applied chat response."',
      '    panels:',
      '      - id: computed-panel',
      '        label: Computed Panel',
      '        kind: text',
      '        output: "Waiting for inline compute."',
      '    media:',
      '      - id: apply-image',
      '        label: Apply Image',
      '        kind: image',
      '        imageUrl: "https://example.com/applied.png"',
      '      - id: apply-video',
      '        label: Apply Video',
      '        kind: video',
      '        videoUrl: "https://example.com/applied.mp4"',
      '      - id: apply-audio',
      '        label: Apply Audio',
      '        kind: audio',
      '        audioUrl: "https://example.com/applied.mp3"',
      '    edges:',
      '      - id: widget-to-card',
      '        source: apply-widget',
      '        target: apply-card',
      '      - id: card-to-compute',
      '        source: apply-card.output',
      '        target: compute-widget.prompt_in',
      '      - id: compute-to-panel',
      '        source: compute-widget.text_out',
      '        target: computed-panel.output',
      '      - id: card-to-video',
      '        source: apply-card.output',
      '        target: apply-video.videoUrl',
      '      - id: card-to-image',
      '        source: apply-card.output',
      '        target: apply-image.imageUrl',
      '```',
    ].join('\n')

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260604T160000Z/agenticOs_20260604T160000Z.md',
      timestampMs: Date.UTC(2026, 5, 4, 16, 0, 0),
      providerSummary: 'OpenAI · structured test',
      userText: 'Finalize MCP-style response into the workspace and canvas.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-apply',
      title: 'Knowledge Graph Canvas Storage',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    if (
      !canonicalText.includes('flow:widgetRegistry')
      || !canonicalText.includes('mcp-response-apply-widget')
      || !canonicalText.includes('mcp-response-compute-widget')
      || !canonicalText.includes('mcp-response-apply-card')
      || !canonicalText.includes('mcp-response-computed-panel')
      || !canonicalText.includes('mcp-response-apply-image')
      || !canonicalText.includes('mcp-response-apply-video')
      || !canonicalText.includes('mcp-response-apply-audio')
    ) {
      throw new Error(`Expected finalized AGENTIC_OS workspace file to contain structured response registry and nodes, got: ${canonicalText}`)
    }

    const applied = await applyChatAgenticOsWorkspaceDocumentToCanvas(workspacePath)
    if (!applied) throw new Error('Expected finalized structured response workspace document to apply to canvas graph')

    const graphData = useGraphStore.getState().graphData
    if (!graphData || graphData.context !== 'frontmatter-flow') {
      throw new Error(`Expected active canvas graph to be frontmatter-flow after apply, got: ${JSON.stringify(graphData?.metadata || null)}`)
    }
    const byId = new Map((graphData.nodes || []).map(node => [String(node.id || ''), node]))
    const widget = byId.get('mcp-response-apply-widget')
    const computeWidget = byId.get('mcp-response-compute-widget')
    const card = byId.get('mcp-response-apply-card')
    const computedPanel = byId.get('mcp-response-computed-panel')
    const image = byId.get('mcp-response-apply-image')
    const video = byId.get('mcp-response-apply-video')
    const audio = byId.get('mcp-response-apply-audio')
    if (!widget || widget.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
      throw new Error(`Expected applied graph to contain TextGeneration widget node, got: ${JSON.stringify(widget)}`)
    }
    if (
      !computeWidget
      || computeWidget.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
      || typeof computeWidget.properties?.['flow:compute'] !== 'string'
    ) {
      throw new Error(`Expected applied graph to contain inline compute TextGeneration widget node, got: ${JSON.stringify(computeWidget)}`)
    }
    if (!card || card.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
      throw new Error(`Expected applied graph to contain card as Rich Media Panel endpoint, got: ${JSON.stringify(card)}`)
    }
    if (!computedPanel || computedPanel.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
      throw new Error(`Expected applied graph to contain computed output Rich Media Panel endpoint, got: ${JSON.stringify(computedPanel)}`)
    }
    if (!image || image.properties?.imageUrl !== 'https://example.com/applied.png') {
      throw new Error(`Expected applied graph to contain image Rich Media Panel endpoint, got: ${JSON.stringify(image)}`)
    }
    if (!video || video.properties?.videoUrl !== 'https://example.com/applied.mp4') {
      throw new Error(`Expected applied graph to contain video Rich Media Panel endpoint, got: ${JSON.stringify(video)}`)
    }
    if (!audio || audio.properties?.audioUrl !== 'https://example.com/applied.mp3') {
      throw new Error(`Expected applied graph to contain audio Rich Media Panel endpoint, got: ${JSON.stringify(audio)}`)
    }
    const cardOutput = readGraphNodeCanonicalTextProperty(card.properties || {}, GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS)
    if (cardOutput !== 'Editable card output from the applied chat response.') {
      throw new Error(`Expected applied card output to use shared card output field, got: ${cardOutput}`)
    }

    const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const widgetRegistryEntry = resolveWidgetRegistryEntry({ node: widget, registry, graphMetaKind: 'frontmatter-flow' })
    if (!widgetRegistryEntry || widgetRegistryEntry.formId !== 'textGeneration.openai') {
      throw new Error(`Expected applied widget to resolve through document registry, got: ${JSON.stringify(widgetRegistryEntry)}`)
    }
    const computeWidgetRegistryEntry = resolveWidgetRegistryEntry({ node: computeWidget, registry, graphMetaKind: 'frontmatter-flow' })
    if (
      !computeWidgetRegistryEntry
      || !computeWidgetRegistryEntry.ports.some(port => port.portKey === 'prompt_in' && port.direction === 'input')
      || !computeWidgetRegistryEntry.ports.some(port => port.portKey === 'text_out' && port.direction === 'output')
    ) {
      throw new Error(`Expected inline compute widget to resolve through document registry ports, got: ${JSON.stringify(computeWidgetRegistryEntry)}`)
    }

    const widgetToCardEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-widget-to-card')
    const cardToComputeEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-card-to-compute')
    const computeToPanelEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-compute-to-panel')
    const cardToVideoEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-card-to-video')
    const cardToImageEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-card-to-image')
    if (
      !widgetToCardEdge
      || widgetToCardEdge.source !== 'mcp-response-apply-widget'
      || widgetToCardEdge.target !== 'mcp-response-apply-card'
      || widgetToCardEdge.properties?.['flow:sourcePortKey'] !== 'text_out'
      || widgetToCardEdge.properties?.['flow:targetPortKey'] !== 'output'
    ) {
      throw new Error(`Expected applied widget-to-card edge with widget and card handles, got: ${JSON.stringify(widgetToCardEdge)}`)
    }
    if (
      !cardToComputeEdge
      || cardToComputeEdge.source !== 'mcp-response-apply-card'
      || cardToComputeEdge.target !== 'mcp-response-compute-widget'
      || cardToComputeEdge.properties?.['flow:sourcePortKey'] !== 'output'
      || cardToComputeEdge.properties?.['flow:targetPortKey'] !== 'prompt_in'
    ) {
      throw new Error(`Expected applied card-to-compute edge with dataflow handles, got: ${JSON.stringify(cardToComputeEdge)}`)
    }
    if (
      !computeToPanelEdge
      || computeToPanelEdge.source !== 'mcp-response-compute-widget'
      || computeToPanelEdge.target !== 'mcp-response-computed-panel'
      || computeToPanelEdge.properties?.['flow:sourcePortKey'] !== 'text_out'
      || computeToPanelEdge.properties?.['flow:targetPortKey'] !== 'output'
    ) {
      throw new Error(`Expected applied compute-to-panel edge with dataflow handles, got: ${JSON.stringify(computeToPanelEdge)}`)
    }
    if (
      !cardToVideoEdge
      || cardToVideoEdge.source !== 'mcp-response-apply-card'
      || cardToVideoEdge.target !== 'mcp-response-apply-video'
      || cardToVideoEdge.properties?.['flow:sourcePortKey'] !== 'output'
      || cardToVideoEdge.properties?.['flow:targetPortKey'] !== 'videoUrl'
    ) {
      throw new Error(`Expected applied card-to-video edge with rich-media handles, got: ${JSON.stringify(cardToVideoEdge)}`)
    }
    if (
      !cardToImageEdge
      || cardToImageEdge.source !== 'mcp-response-apply-card'
      || cardToImageEdge.target !== 'mcp-response-apply-image'
      || cardToImageEdge.properties?.['flow:sourcePortKey'] !== 'output'
      || cardToImageEdge.properties?.['flow:targetPortKey'] !== 'imageUrl'
    ) {
      throw new Error(`Expected applied card-to-image edge with rich-media handles, got: ${JSON.stringify(cardToImageEdge)}`)
    }

    const computedValues = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry,
      targetNodeIds: new Set(['mcp-response-computed-panel']),
    }).get('mcp-response-computed-panel')
    const computedOutput = computedValues?.['properties.output']
    if (
      computedOutput?.value !== 'EDITABLE CARD OUTPUT FROM THE APPLIED CHAT RESPONSE.'
      || !computedOutput.sources.some(source => source.nodeId === 'mcp-response-compute-widget' && source.portKey === 'text_out')
    ) {
      throw new Error(`Expected inline compute output to flow into computed panel, got: ${JSON.stringify(computedValues)}`)
    }
    const updatedGraphData = {
      ...graphData,
      nodes: graphData.nodes.map(node => String(node.id || '') === 'mcp-response-apply-card'
        ? { ...node, properties: { ...(node.properties || {}), output: 'live recompute input' } }
        : node),
    }
    const recomputedOutput = computeFlowConnectedValuesBySchemaPath({
      graphData: updatedGraphData,
      registry,
      targetNodeIds: new Set(['mcp-response-computed-panel']),
    }).get('mcp-response-computed-panel')?.['properties.output']?.value
    if (recomputedOutput !== 'LIVE RECOMPUTE INPUT') {
      throw new Error(`Expected shared dataflow compute to react to upstream value changes, got: ${String(recomputedOutput)}`)
    }

    const runPlan = getCachedStoryboardWidgetWorkflowRunPlan({
      graphData,
      graphRevision: readGraphDataRevision(graphData),
      preferCurrentGraphDataRefs: true,
    })
    if (!runPlan?.orderedNodeIds.includes('mcp-response-compute-widget')) {
      throw new Error(`Expected inline compute widget to participate in Storyboard Widget run-all plan, got: ${JSON.stringify(runPlan)}`)
    }

    const overlayIds = new Set(deriveFrontmatterFlowOverlayNodeIds(graphData))
    for (const id of ['mcp-response-apply-widget', 'mcp-response-compute-widget', 'mcp-response-apply-card', 'mcp-response-computed-panel', 'mcp-response-apply-image', 'mcp-response-apply-video', 'mcp-response-apply-audio']) {
      if (!overlayIds.has(id)) throw new Error(`Expected applied structured response overlay ids to include ${id}, got: ${Array.from(overlayIds).join(', ')}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatResponseLiteralMcpResultFinalizesWorkspaceAndAppliesCanvasGraph() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = JSON.stringify({
      jsonrpc: '2.0',
      id: 'literal-mcp-result',
      result: {
        content: [
          {
            type: 'text',
            text: 'Literal MCP tool result with structuredContent for shared Canvas materialization.',
          },
        ],
        structuredContent: {
          widgets: [
            {
              id: 'literal-runner',
              label: 'Literal Runner',
              nodeTypeId: 'TextGeneration',
              formId: 'textGeneration.openai',
              widgetTypeId: 'default',
              prompt: 'Transform the incoming card output.',
              'flow:compute': "inputs => ({ text_out: String(inputs.prompt_in || '').trim().toUpperCase() })",
            },
          ],
          cards: [
            {
              id: 'literal-card',
              label: 'Literal Card',
              output: 'literal mcp card output',
            },
          ],
          panels: [
            {
              id: 'literal-panel',
              label: 'Literal Panel',
              output: 'Waiting for literal MCP compute.',
            },
          ],
          media: [
            {
              id: 'literal-video',
              label: 'Literal Video',
              kind: 'video',
              videoUrl: 'https://example.com/literal.mp4',
            },
          ],
          edges: [
            {
              id: 'literal-card-to-runner',
              source: 'literal-card.output',
              target: 'literal-runner.prompt_in',
            },
            {
              id: 'literal-runner-to-panel',
              source: 'literal-runner.text_out',
              target: 'literal-panel.output',
            },
            {
              id: 'literal-card-to-video',
              source: 'literal-card.output',
              target: 'literal-video.videoUrl',
            },
          ],
        },
      },
    }, null, 2)

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260604T170000Z/agenticOs_20260604T170000Z.md',
      timestampMs: Date.UTC(2026, 5, 4, 17, 0, 0),
      providerSummary: 'MCP · literal result test',
      userText: 'Finalize a literal MCP result into the workspace and canvas.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-literal-mcp-apply',
      title: 'Knowledge Graph Canvas Storage',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    for (const token of [
      'flow:widgetRegistry',
      'mcp-response-literal-runner',
      'mcp-response-literal-card',
      'mcp-response-literal-panel',
      'mcp-response-literal-video',
      'Assistant structured-content entries are projected',
    ]) {
      if (!canonicalText.includes(token)) {
        throw new Error(`Expected literal MCP workspace AGENTIC_OS to include ${JSON.stringify(token)}, got: ${canonicalText}`)
      }
    }

    const applied = await applyChatAgenticOsWorkspaceDocumentToCanvas(workspacePath)
    if (!applied) throw new Error('Expected finalized literal MCP workspace document to apply to canvas graph')

    const graphData = useGraphStore.getState().graphData
    if (!graphData || graphData.context !== 'frontmatter-flow') {
      throw new Error(`Expected literal MCP graph to be frontmatter-flow after apply, got: ${JSON.stringify(graphData?.metadata || null)}`)
    }
    const byId = new Map((graphData.nodes || []).map(node => [String(node.id || ''), node]))
    const runner = byId.get('mcp-response-literal-runner')
    const card = byId.get('mcp-response-literal-card')
    const panel = byId.get('mcp-response-literal-panel')
    const video = byId.get('mcp-response-literal-video')
    if (!runner || runner.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID || typeof runner.properties?.['flow:compute'] !== 'string') {
      throw new Error(`Expected literal MCP runner to become a compute-aware TextGeneration widget, got: ${JSON.stringify(runner)}`)
    }
    if (!card || card.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
      throw new Error(`Expected literal MCP card to become a Rich Media Panel endpoint, got: ${JSON.stringify(card)}`)
    }
    if (!panel || panel.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
      throw new Error(`Expected literal MCP panel to become a Rich Media Panel endpoint, got: ${JSON.stringify(panel)}`)
    }
    if (!video || video.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID || video.properties?.videoUrl !== 'https://example.com/literal.mp4') {
      throw new Error(`Expected literal MCP video to become a Rich Media Panel video endpoint, got: ${JSON.stringify(video)}`)
    }

    const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const registryEntry = resolveWidgetRegistryEntry({ node: runner, registry, graphMetaKind: 'frontmatter-flow' })
    if (
      !registryEntry
      || registryEntry.formId !== 'textGeneration.openai'
      || !registryEntry.ports.some(port => port.portKey === 'prompt_in' && port.direction === 'input')
      || !registryEntry.ports.some(port => port.portKey === 'text_out' && port.direction === 'output')
    ) {
      throw new Error(`Expected literal MCP runner to resolve through document registry ports, got: ${JSON.stringify(registryEntry)}`)
    }

    const cardToRunnerEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-literal-card-to-runner')
    const runnerToPanelEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-literal-runner-to-panel')
    const cardToVideoEdge = graphData.edges.find(edge => edge.id === 'e-mcp-response-literal-card-to-video')
    if (
      !cardToRunnerEdge
      || cardToRunnerEdge.properties?.['flow:sourcePortKey'] !== 'output'
      || cardToRunnerEdge.properties?.['flow:targetPortKey'] !== 'prompt_in'
      || !runnerToPanelEdge
      || runnerToPanelEdge.properties?.['flow:sourcePortKey'] !== 'text_out'
      || runnerToPanelEdge.properties?.['flow:targetPortKey'] !== 'output'
      || !cardToVideoEdge
      || cardToVideoEdge.properties?.['flow:sourcePortKey'] !== 'output'
      || cardToVideoEdge.properties?.['flow:targetPortKey'] !== 'videoUrl'
    ) {
      throw new Error(`Expected literal MCP authored edges with canonical dataflow handles, got: ${JSON.stringify(graphData.edges)}`)
    }

    const computedOutput = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry,
      targetNodeIds: new Set(['mcp-response-literal-panel']),
    }).get('mcp-response-literal-panel')?.['properties.output']?.value
    if (computedOutput !== 'LITERAL MCP CARD OUTPUT') {
      throw new Error(`Expected literal MCP inline compute output to flow into panel, got: ${String(computedOutput)}`)
    }
    const editedCardOutput = 'inline edited card result'
    useGraphStore.getState().updateNode('mcp-response-literal-card', {
      properties: buildGraphNodeCanonicalTextPatch({
        currentProperties: card.properties || {},
        propertyKeys: GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS,
        canonicalKey: 'output',
        nextValue: editedCardOutput,
      }) as never,
    })
    const editedState = useGraphStore.getState()
    const editedGraphData = editedState.graphData
    const editedCard = editedGraphData?.nodes.find(node => String(node.id || '') === 'mcp-response-literal-card')
    const editedCardCanonicalOutput = readGraphNodeCanonicalTextProperty(editedCard?.properties || {}, GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS)
    if (editedCardCanonicalOutput !== editedCardOutput) {
      throw new Error(`Expected shared inline edit patch to update literal MCP card output, got: ${JSON.stringify(editedCard)}`)
    }
    const activeMarkdownText = String(editedState.markdownDocumentText || '')
    const frontmatterEndIndex = activeMarkdownText.indexOf('\n---', 4)
    const activeFrontmatterText = frontmatterEndIndex >= 0
      ? activeMarkdownText.slice(0, frontmatterEndIndex)
      : activeMarkdownText
    if (!activeFrontmatterText.includes(editedCardOutput)) {
      throw new Error(`Expected shared inline edit path to write literal MCP card output back into active AGENTIC_OS frontmatter, got: ${activeFrontmatterText}`)
    }
    if (activeFrontmatterText.includes('literal mcp card output')) {
      throw new Error(`Expected active AGENTIC_OS frontmatter to stop carrying stale literal MCP card output after inline edit, got: ${activeFrontmatterText}`)
    }
    const editedRegistry = Array.isArray(editedGraphData?.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? editedGraphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const recomputedOutput = editedGraphData
      ? computeFlowConnectedValuesBySchemaPath({
        graphData: editedGraphData,
        registry: editedRegistry,
        targetNodeIds: new Set(['mcp-response-literal-panel']),
      }).get('mcp-response-literal-panel')?.['properties.output']?.value
      : null
    if (recomputedOutput !== 'INLINE EDITED CARD RESULT') {
      throw new Error(`Expected shared dataflow compute to react to inline-edited MCP card output, got: ${String(recomputedOutput)}`)
    }
    const inlineRunnerValues = computeFlowConnectedValuesBySchemaPath({
      graphData: editedGraphData,
      registry: editedRegistry,
      targetNodeIds: new Set(['mcp-response-literal-runner']),
    }).get('mcp-response-literal-runner')
    const inlineComputePatch = buildStoryboardWidgetInlineComputeOutputPatch({
      node: runner,
      registryEntry,
      connectedValuesBySchemaPath: inlineRunnerValues,
      currentProperties: runner.properties || {},
    })
    if (!inlineComputePatch || inlineComputePatch.output !== 'INLINE EDITED CARD RESULT') {
      throw new Error(`Expected shared inline compute runner patch to write the computed output port, got: ${JSON.stringify(inlineComputePatch)}`)
    }
    if (inlineComputePatch.prompt !== runner.properties?.prompt) {
      throw new Error(`Expected shared inline compute runner patch to preserve input fields instead of writing connected inputs, got: ${JSON.stringify(inlineComputePatch)}`)
    }
    useGraphStore.getState().updateNode('mcp-response-literal-runner', { properties: inlineComputePatch as never })
    const runnerWritebackState = useGraphStore.getState()
    const runnerWritebackNode = runnerWritebackState.graphData?.nodes.find(node => String(node.id || '') === 'mcp-response-literal-runner')
    if (runnerWritebackNode?.properties?.output !== 'INLINE EDITED CARD RESULT') {
      throw new Error(`Expected shared inline compute runner writeback to update MCP runner output, got: ${JSON.stringify(runnerWritebackNode)}`)
    }
    const runnerFrontmatterText = String(runnerWritebackState.markdownDocumentText || '')
    const runnerFrontmatterEndIndex = runnerFrontmatterText.indexOf('\n---', 4)
    const runnerFrontmatter = runnerFrontmatterEndIndex >= 0
      ? runnerFrontmatterText.slice(0, runnerFrontmatterEndIndex)
      : runnerFrontmatterText
    if (!runnerFrontmatter.includes('INLINE EDITED CARD RESULT')) {
      throw new Error(`Expected inline compute runner writeback to persist output in active AGENTIC_OS frontmatter, got: ${runnerFrontmatter}`)
    }

    const runPlan = getCachedStoryboardWidgetWorkflowRunPlan({
      graphData: runnerWritebackState.graphData || editedGraphData || graphData,
      graphRevision: readGraphDataRevision(runnerWritebackState.graphData || editedGraphData || graphData),
      preferCurrentGraphDataRefs: true,
    })
    if (!runPlan?.orderedNodeIds.includes('mcp-response-literal-runner')) {
      throw new Error(`Expected literal MCP runner to participate in Storyboard Widget run-all plan, got: ${JSON.stringify(runPlan)}`)
    }

    const overlayIds = new Set(deriveFrontmatterFlowOverlayNodeIds(graphData))
    for (const id of ['mcp-response-literal-runner', 'mcp-response-literal-card', 'mcp-response-literal-panel', 'mcp-response-literal-video']) {
      if (!overlayIds.has(id)) throw new Error(`Expected literal MCP overlay ids to include ${id}, got: ${Array.from(overlayIds).join(', ')}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}
