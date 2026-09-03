import { normalizeAgenticOsAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { extractChatResponseStructuredSurface } from '@/features/chat/chatResponseStructuredContent'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_WIDGET_REGISTRY_METADATA_KEY,
} from '@/lib/config.storyboard-widget'
import { resolveWidgetRegistryEntry } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { deriveFrontmatterFlowOverlayNodeIds } from '@/lib/storyboardWidget/frontmatterOverlayNodeIds'

export function testChatResponseStructuredContentProjectsToRenderableFlowNodes() {
  const assistantText = [
    'The response includes renderable MCP-style content.',
    '',
    '```yaml',
    'response:',
    '  structuredContent:',
    '    widgets:',
    '      - id: summary-card',
    '        label: Summary Card',
    '        kind: text',
    '        output: "Editable generated summary for the active workspace."',
    '      - id: voice-panel',
    '        label: Voice Panel',
    '        kind: audio',
    '        audioUrl: "https://example.com/generated-response.mp3"',
    '      - id: chart-panel',
    '        label: Chart Panel',
    '        kind: html',
    '        outputSrcDoc: "<main><h1>Structured response</h1><p>Renderer-neutral chart.</p></main>"',
    '    edges:',
    '      - id: summary-to-chart',
    '        source: summary-card',
    '        sourceHandle: output',
    '        target: chart-panel',
    '        targetHandle: outputSrcDoc',
    '        label: "summary feeds chart"',
    '```',
  ].join('\n')

  const surface = extractChatResponseStructuredSurface(assistantText)
  if (!surface || surface.nodes.length !== 3 || surface.edges.length !== 4) {
    throw new Error(`Expected three structured response nodes and four edges, got: ${JSON.stringify(surface)}`)
  }
  const authoredSurfaceEdge = surface.edges.find(edge => edge.id === 'e-mcp-response-summary-to-chart')
  if (
    !authoredSurfaceEdge
    || authoredSurfaceEdge.source !== 'mcp-response-summary-card'
    || authoredSurfaceEdge.target !== 'mcp-response-chart-panel'
    || authoredSurfaceEdge.sourceHandle !== 'output'
    || authoredSurfaceEdge.targetHandle !== 'outputSrcDoc'
  ) {
    throw new Error(`Expected authored structured edge references to resolve to canonical node ids, got: ${JSON.stringify(surface.edges)}`)
  }

  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 4, 12, 0, 0),
    workspacePath: '/workspace/chat/20260604T120000Z/agenticOs_20260604T120000Z.md',
    requestText: 'Render the LLM response like an MCP tool result with widgets, audio, cards, and edges.',
    assistantText,
  })
  const parsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-mcp-response.md', markdown)
  if (!parsed) throw new Error('Expected MCP-style response fallback to parse as a frontmatter-flow graph')

  const byId = new Map(parsed.graphData.nodes.map(node => [node.id, node]))
  const summary = byId.get('mcp-response-summary-card')
  const audio = byId.get('mcp-response-voice-panel')
  const chart = byId.get('mcp-response-chart-panel')
  if (!summary || !audio || !chart) {
    throw new Error(`Expected structured response nodes in parsed graph, got ids: ${Array.from(byId.keys()).join(', ')}`)
  }
  if (summary.type !== 'RichMediaPanel' || summary.properties?.output !== 'Editable generated summary for the active workspace.') {
    throw new Error(`Expected summary card to reuse RichMediaPanel output field, got: ${JSON.stringify(summary)}`)
  }
  if (summary.properties?.['chat:structuredRole'] !== 'widget' || summary.properties?.['flow:widgetFormId'] !== 'richMediaPanel') {
    throw new Error(`Expected summary record to keep widget role and Rich Media Panel widget form metadata, got: ${JSON.stringify(summary.properties)}`)
  }
  if (audio.type !== 'RichMediaPanel' || audio.properties?.audioUrl !== 'https://example.com/generated-response.mp3') {
    throw new Error(`Expected audio response to reuse RichMediaPanel audioUrl field, got: ${JSON.stringify(audio)}`)
  }
  if (chart.type !== 'RichMediaPanel' || typeof chart.properties?.outputSrcDoc !== 'string') {
    throw new Error(`Expected HTML response to reuse RichMediaPanel outputSrcDoc field, got: ${JSON.stringify(chart)}`)
  }

  const responseEdges = parsed.graphData.edges.filter(edge => String(edge.id || '').startsWith('e-mcp-response-'))
  if (responseEdges.length !== 4) {
    throw new Error(`Expected four MCP structured response edges, got: ${JSON.stringify(responseEdges)}`)
  }
  const audioEdge = responseEdges.find(edge => edge.target === 'mcp-response-voice-panel')
  if (
    !audioEdge
    || audioEdge.source !== 'n-deliver'
    || audioEdge.properties?.['flow:sourcePortKey'] !== 'rendered'
    || audioEdge.properties?.['flow:targetPortKey'] !== 'audioUrl'
  ) {
    throw new Error(`Expected audio response edge from n-deliver to audioUrl, got: ${JSON.stringify(audioEdge)}`)
  }
  const authoredEdge = responseEdges.find(edge => edge.id === 'e-mcp-response-summary-to-chart')
  if (
    !authoredEdge
    || authoredEdge.source !== 'mcp-response-summary-card'
    || authoredEdge.target !== 'mcp-response-chart-panel'
    || authoredEdge.properties?.['flow:sourcePortKey'] !== 'output'
    || authoredEdge.properties?.['flow:targetPortKey'] !== 'outputSrcDoc'
  ) {
    throw new Error(`Expected authored MCP structured edge to survive parser normalization, got: ${JSON.stringify(authoredEdge)}`)
  }
}

export function testChatResponseStructuredContentAcceptsLiteralMcpToolResultEnvelopes() {
  const assistantText = JSON.stringify({
    jsonrpc: '2.0',
    id: 'tool-call-1',
    result: {
      content: [
        {
          type: 'text',
          text: 'Tool result also carries structuredContent for Canvas materialization.',
        },
      ],
      structuredContent: {
        widgets: [
          {
            id: 'mcp-runner',
            label: 'MCP Runner',
            nodeTypeId: 'TextGeneration',
            formId: 'textGeneration.openai',
            widgetTypeId: 'default',
            prompt: 'Produce a neutral response artifact.',
            'flow:compute': 'inputs => ({ text_out: String(inputs.prompt_in || "").toUpperCase() })',
          },
        ],
        media: [
          {
            id: 'mcp-video',
            label: 'MCP Video',
            kind: 'video',
            videoUrl: 'https://example.com/mcp-video.mp4',
          },
        ],
        edges: [
          {
            id: 'runner-to-video',
            source: 'mcp-runner.text_out',
            target: 'mcp-video.videoUrl',
          },
        ],
      },
    },
  }, null, 2)

  const surface = extractChatResponseStructuredSurface(assistantText)
  if (!surface || surface.nodes.length !== 2 || surface.edges.length !== 3) {
    throw new Error(`Expected literal MCP result.structuredContent to extract two nodes and three edges, got: ${JSON.stringify(surface)}`)
  }
  const runner = surface.nodes.find(node => node.id === 'mcp-response-mcp-runner')
  const video = surface.nodes.find(node => node.id === 'mcp-response-mcp-video')
  if (
    !runner
    || runner.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
    || runner.sourceHandle !== 'text_out'
    || runner.targetHandle !== 'prompt_in'
    || runner.properties.prompt !== 'Produce a neutral response artifact.'
    || typeof runner.properties['flow:compute'] !== 'string'
  ) {
    throw new Error(`Expected literal MCP result widget to preserve declared Storyboard Widget data, got: ${JSON.stringify(runner)}`)
  }
  if (!video || video.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID || video.targetHandle !== 'videoUrl' || video.properties.videoUrl !== 'https://example.com/mcp-video.mp4') {
    throw new Error(`Expected literal MCP result video to become a Rich Media Panel endpoint, got: ${JSON.stringify(video)}`)
  }
  const authoredEdge = surface.edges.find(edge => edge.id === 'e-mcp-response-runner-to-video')
  if (
    !authoredEdge
    || authoredEdge.source !== 'mcp-response-mcp-runner'
    || authoredEdge.sourceHandle !== 'text_out'
    || authoredEdge.target !== 'mcp-response-mcp-video'
    || authoredEdge.targetHandle !== 'videoUrl'
  ) {
    throw new Error(`Expected literal MCP authored edge to resolve references and handles, got: ${JSON.stringify(authoredEdge)}`)
  }

  const contentOnlyAssistantText = JSON.stringify({
    jsonrpc: '2.0',
    id: 'tool-call-2',
    result: {
      content: [
        {
          type: 'text',
          text: [
            'The MCP text part contains the structured response block.',
            '',
            '```yaml',
            'response:',
            '  structuredContent:',
            '    cards:',
            '      - id: content-card',
            '        label: Content Card',
            '        output: "Text-part card lands in workspace."',
            '    media:',
            '      - id: content-audio',
            '        label: Content Audio',
            '        audioUrl: "https://example.com/content.mp3"',
            '    edges:',
            '      - id: content-card-to-audio',
            '        source: content-card.output',
            '        target: content-audio.audioUrl',
            '```',
          ].join('\n'),
        },
      ],
    },
  }, null, 2)

  const contentSurface = extractChatResponseStructuredSurface(contentOnlyAssistantText)
  if (!contentSurface || contentSurface.nodes.length !== 2 || contentSurface.edges.length !== 3) {
    throw new Error(`Expected MCP result.content text part to extract structured response nodes, got: ${JSON.stringify(contentSurface)}`)
  }
  const contentEdge = contentSurface.edges.find(edge => edge.id === 'e-mcp-response-content-card-to-audio')
  if (
    !contentEdge
    || contentEdge.source !== 'mcp-response-content-card'
    || contentEdge.sourceHandle !== 'output'
    || contentEdge.target !== 'mcp-response-content-audio'
    || contentEdge.targetHandle !== 'audioUrl'
  ) {
    throw new Error(`Expected MCP result.content authored edge to resolve from embedded text, got: ${JSON.stringify(contentEdge)}`)
  }
}

export function testChatResponseStructuredContentProjectsFromAcceptedAgenticOsFrontmatter() {
  const base = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 4, 13, 0, 0),
    workspacePath: '/workspace/chat/20260604T130000Z/agenticOs_20260604T130000Z.md',
    requestText: '',
    assistantText: 'Create a canonical AGENTIC_OS base document.',
  })
  const structuredAgenticOs = base.replace(
    '\nflow:\n',
    [
      '\nwidget_bundle:',
      '  graph:',
      '    nodes_ref: [n-deliver]',
      '\nresponse:',
      '  structuredContent:',
      '    cards:',
      '      - id: accepted-card',
      '        label: Accepted Card',
      '        kind: text',
      '        output: "Accepted AGENTIC_OS card output remains editable."',
      '    media:',
      '      - id: accepted-video',
      '        label: Accepted Video',
      '        kind: video',
      '        videoUrl: "https://example.com/accepted.mp4"',
      '    edges:',
      '      - id: accepted-card-to-video',
      '        source: accepted-card.output',
      '        target: accepted-video.videoUrl',
      '        label: "card drives video"',
      'flow:',
    ].join('\n') + '\n',
  )

  const normalized = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 4, 13, 0, 0),
    workspacePath: '/workspace/chat/20260604T130000Z/agenticOs_20260604T130000Z.md',
    requestText: '',
    assistantText: structuredAgenticOs,
  })
  const parsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-accepted-mcp-response.md', normalized)
  if (!parsed) throw new Error('Expected accepted AGENTIC_OS structuredContent projection to remain parseable')
  if (!normalized.includes('nodes_ref: ["n-deliver", "mcp-response-accepted-card", "mcp-response-accepted-video"]')) {
    throw new Error(`Expected accepted AGENTIC_OS projection to append structured response nodes to widget_bundle.graph.nodes_ref, got: ${normalized}`)
  }

  const byId = new Map(parsed.graphData.nodes.map(node => [node.id, node]))
  const card = byId.get('mcp-response-accepted-card')
  const video = byId.get('mcp-response-accepted-video')
  if (!card || !video) {
    throw new Error(`Expected accepted AGENTIC_OS structured content nodes, got ids: ${Array.from(byId.keys()).join(', ')}`)
  }
  if (card.properties?.['chat:structuredRole'] !== 'card' || card.properties?.output !== 'Accepted AGENTIC_OS card output remains editable.') {
    throw new Error(`Expected accepted card to preserve role and output field, got: ${JSON.stringify(card.properties)}`)
  }
  if (video.properties?.['chat:structuredRole'] !== 'media' || video.properties?.videoUrl !== 'https://example.com/accepted.mp4') {
    throw new Error(`Expected accepted video to preserve media role and videoUrl field, got: ${JSON.stringify(video.properties)}`)
  }
  const authoredEdge = parsed.graphData.edges.find(edge => edge.id === 'e-mcp-response-accepted-card-to-video')
  if (
    !authoredEdge
    || authoredEdge.source !== 'mcp-response-accepted-card'
    || authoredEdge.target !== 'mcp-response-accepted-video'
    || authoredEdge.properties?.['flow:sourcePortKey'] !== 'output'
    || authoredEdge.properties?.['flow:targetPortKey'] !== 'videoUrl'
  ) {
    throw new Error(`Expected accepted AGENTIC_OS authored edge to survive projection, got: ${JSON.stringify(authoredEdge)}`)
  }
  const overlayIds = new Set(deriveFrontmatterFlowOverlayNodeIds(parsed.graphData))
  if (!overlayIds.has('mcp-response-accepted-card') || !overlayIds.has('mcp-response-accepted-video')) {
    throw new Error(`Expected Storyboard Widget overlay ids to include accepted structured response widgets, got: ${Array.from(overlayIds).join(', ')}`)
  }

  const renormalized = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 4, 13, 0, 0),
    workspacePath: '/workspace/chat/20260604T130000Z/agenticOs_20260604T130000Z.md',
    requestText: '',
    assistantText: normalized,
  })
  const reparsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-accepted-mcp-response-renormalized.md', renormalized)
  if (!reparsed) throw new Error('Expected renormalized accepted AGENTIC_OS projection to remain parseable')
  const projectedCardNodes = reparsed.graphData.nodes.filter(node => node.id === 'mcp-response-accepted-card')
  const projectedAuthoredEdges = reparsed.graphData.edges.filter(edge => edge.id === 'e-mcp-response-accepted-card-to-video')
  if (projectedCardNodes.length !== 1 || projectedAuthoredEdges.length !== 1) {
    throw new Error(`Expected accepted AGENTIC_OS projection to be idempotent, got nodes=${projectedCardNodes.length} edges=${projectedAuthoredEdges.length}`)
  }
}

export function testChatResponseStructuredContentAcceptsTypedKtvEnvelopeRecords() {
  const assistantText = [
    '```yaml',
    'response:',
    '  structuredContent:',
    '    widgets:',
    '      - id: {key: id, type: string, value: typed-card}',
    '        label: {key: label, type: string, value: Typed Card}',
    '        kind: {key: kind, type: string, value: text}',
    '        output: {key: output, type: string, value: "Typed envelope output stays editable."}',
    '    media:',
    '      - properties:',
    '          - {key: id, type: string, value: typed-audio}',
    '          - {key: label, type: string, value: Typed Audio}',
    '          - {key: kind, type: string, value: audio}',
    '          - {key: audioUrl, type: string, value: "https://example.com/typed.mp3"}',
    '    edges:',
    '      - id: {key: id, type: string, value: typed-card-to-audio}',
    '        source: {key: source, type: string, value: typed-card.output}',
    '        target: {key: target, type: string, value: typed-audio.audioUrl}',
    '        label: {key: label, type: string, value: "typed output narrates audio"}',
    '```',
  ].join('\n')

  const surface = extractChatResponseStructuredSurface(assistantText)
  if (!surface || surface.nodes.length !== 2 || surface.edges.length !== 3) {
    throw new Error(`Expected typed KTV structured records to extract two nodes and three edges, got: ${JSON.stringify(surface)}`)
  }
  const card = surface.nodes.find(node => node.id === 'mcp-response-typed-card')
  const audio = surface.nodes.find(node => node.id === 'mcp-response-typed-audio')
  if (!card || card.properties.output !== 'Typed envelope output stays editable.') {
    throw new Error(`Expected typed envelope card output to unwrap, got: ${JSON.stringify(card)}`)
  }
  if (!audio || audio.properties.audioUrl !== 'https://example.com/typed.mp3') {
    throw new Error(`Expected properties[] KTV audioUrl to unwrap, got: ${JSON.stringify(audio)}`)
  }
  const authoredEdge = surface.edges.find(edge => edge.id === 'e-mcp-response-typed-card-to-audio')
  if (
    !authoredEdge
    || authoredEdge.source !== 'mcp-response-typed-card'
    || authoredEdge.target !== 'mcp-response-typed-audio'
    || authoredEdge.sourceHandle !== 'output'
    || authoredEdge.targetHandle !== 'audioUrl'
  ) {
    throw new Error(`Expected typed KTV edge references to resolve, got: ${JSON.stringify(surface.edges)}`)
  }

  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 4, 14, 0, 0),
    workspacePath: '/workspace/chat/20260604T140000Z/agenticOs_20260604T140000Z.md',
    requestText: 'Materialize typed KTV MCP structured response records.',
    assistantText,
  })
  const parsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-typed-ktv-mcp-response.md', markdown)
  if (!parsed) throw new Error('Expected typed KTV structured response projection to parse as frontmatter-flow')
  const byId = new Map(parsed.graphData.nodes.map(node => [node.id, node]))
  if (byId.get('mcp-response-typed-card')?.properties?.output !== 'Typed envelope output stays editable.') {
    throw new Error(`Expected typed card output in parsed graph, got: ${JSON.stringify(byId.get('mcp-response-typed-card'))}`)
  }
  if (byId.get('mcp-response-typed-audio')?.properties?.audioUrl !== 'https://example.com/typed.mp3') {
    throw new Error(`Expected typed audioUrl in parsed graph, got: ${JSON.stringify(byId.get('mcp-response-typed-audio'))}`)
  }
}

export function testChatResponseStructuredContentPreservesDeclaredFlowWidgets() {
  const assistantText = [
    'The response includes interactive widget records and renderable panels.',
    '',
    '```yaml',
    'response:',
    '  structuredContent:',
    '    widgets:',
    '      - id: generator-widget',
    '        label: Generator Widget',
    '        nodeTypeId: TextGeneration',
    '        formId: textGeneration.openai',
    '        widgetTypeId: default',
    '        kind: text',
    '        prompt: "Draft a renderer-neutral summary."',
    '      - id: image-widget',
    '        label: Image Widget',
    '        formId: imageGeneration',
    '        kind: image',
    '        prompt: "Draw a neutral diagram."',
    '        imageUrl: "https://example.com/generated.png"',
    '    panels:',
    '      - id: output-panel',
    '        label: Output Panel',
    '        kind: text',
    '        output: "Panel content stays in Rich Media Panel."',
    '    edges:',
    '      - id: widget-to-panel',
    '        source: generator-widget',
    '        target: output-panel',
    '```',
  ].join('\n')

  const surface = extractChatResponseStructuredSurface(assistantText)
  if (!surface || surface.nodes.length !== 3 || surface.edges.length !== 4) {
    throw new Error(`Expected declared widget records plus panel to extract three nodes and four edges, got: ${JSON.stringify(surface)}`)
  }

  const textWidget = surface.nodes.find(node => node.id === 'mcp-response-generator-widget')
  const imageWidget = surface.nodes.find(node => node.id === 'mcp-response-image-widget')
  const panel = surface.nodes.find(node => node.id === 'mcp-response-output-panel')
  if (
    !textWidget
    || textWidget.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
    || textWidget.sourceHandle !== 'text_out'
    || textWidget.targetHandle !== 'prompt_in'
    || textWidget.properties['flow:widgetFormId'] !== 'textGeneration.openai'
    || textWidget.properties.prompt !== 'Draft a renderer-neutral summary.'
  ) {
    throw new Error(`Expected declared text widget to keep widget type, form, prompt, and widget handles, got: ${JSON.stringify(textWidget)}`)
  }
  if (
    !imageWidget
    || imageWidget.nodeTypeId !== FLOW_IMAGE_GENERATION_NODE_TYPE_ID
    || imageWidget.sourceHandle !== 'imageUrl'
    || imageWidget.targetHandle !== 'prompt_in'
    || imageWidget.properties['flow:widgetFormId'] !== 'imageGeneration'
    || imageWidget.properties.imageUrl !== 'https://example.com/generated.png'
  ) {
    throw new Error(`Expected declared image widget to keep image widget form and handles, got: ${JSON.stringify(imageWidget)}`)
  }
  if (
    !panel
    || panel.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    || panel.sourceHandle !== 'output'
    || panel.targetHandle !== 'output'
    || panel.properties['flow:widgetFormId'] !== FLOW_RICH_MEDIA_PANEL_FORM_ID
  ) {
    throw new Error(`Expected panel record to remain a Rich Media Panel endpoint, got: ${JSON.stringify(panel)}`)
  }

  const textDeliveryEdge = surface.edges.find(edge => edge.source === 'n-deliver' && edge.target === 'mcp-response-generator-widget')
  if (!textDeliveryEdge || textDeliveryEdge.targetHandle !== 'prompt_in') {
    throw new Error(`Expected default delivery edge to target the text widget input handle, got: ${JSON.stringify(textDeliveryEdge)}`)
  }
  const authoredEdge = surface.edges.find(edge => edge.id === 'e-mcp-response-widget-to-panel')
  if (
    !authoredEdge
    || authoredEdge.source !== 'mcp-response-generator-widget'
    || authoredEdge.target !== 'mcp-response-output-panel'
    || authoredEdge.sourceHandle !== 'text_out'
    || authoredEdge.targetHandle !== 'output'
  ) {
    throw new Error(`Expected authored widget-to-panel edge to use widget output and panel input handles, got: ${JSON.stringify(surface.edges)}`)
  }

  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 4, 15, 0, 0),
    workspacePath: '/workspace/chat/20260604T150000Z/agenticOs_20260604T150000Z.md',
    requestText: 'Materialize declared response widgets and panels.',
    assistantText,
  })
  const parsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-declared-widget-mcp-response.md', markdown)
  if (!parsed) throw new Error('Expected declared widget structured response projection to parse as frontmatter-flow')
  const byId = new Map(parsed.graphData.nodes.map(node => [node.id, node]))
  const parsedTextWidget = byId.get('mcp-response-generator-widget')
  const parsedImageWidget = byId.get('mcp-response-image-widget')
  const parsedPanel = byId.get('mcp-response-output-panel')
  if (
    !parsedTextWidget
    || parsedTextWidget.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
    || parsedTextWidget.properties?.['flow:widgetFormId'] !== 'textGeneration.openai'
    || parsedTextWidget.properties?.prompt !== 'Draft a renderer-neutral summary.'
  ) {
    throw new Error(`Expected parsed graph to preserve declared text widget node, got: ${JSON.stringify(parsedTextWidget)}`)
  }
  const registry = Array.isArray(parsed.graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? parsed.graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
    : []
  const textRegistryEntry = resolveWidgetRegistryEntry({
    node: parsedTextWidget,
    registry,
    graphMetaKind: 'frontmatter-flow',
  })
  if (
    !textRegistryEntry
    || textRegistryEntry.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
    || textRegistryEntry.formId !== 'textGeneration.openai'
    || !textRegistryEntry.fields.some(field => field.fieldKey === 'prompt' && field.schemaPath === 'properties.prompt')
    || !textRegistryEntry.ports.some(port => port.portKey === 'prompt_in' && port.direction === 'input')
    || !textRegistryEntry.ports.some(port => port.portKey === 'text_out' && port.direction === 'output')
  ) {
    throw new Error(`Expected declared text widget to resolve through document-scoped widget registry, got: ${JSON.stringify(textRegistryEntry)}`)
  }
  if (
    !parsedImageWidget
    || parsedImageWidget.type !== FLOW_IMAGE_GENERATION_NODE_TYPE_ID
    || parsedImageWidget.properties?.['flow:widgetFormId'] !== 'imageGeneration'
    || parsedImageWidget.properties?.imageUrl !== 'https://example.com/generated.png'
  ) {
    throw new Error(`Expected parsed graph to preserve declared image widget node, got: ${JSON.stringify(parsedImageWidget)}`)
  }
  const imageRegistryEntry = resolveWidgetRegistryEntry({
    node: parsedImageWidget,
    registry,
    graphMetaKind: 'frontmatter-flow',
  })
  if (
    !imageRegistryEntry
    || imageRegistryEntry.nodeTypeId !== FLOW_IMAGE_GENERATION_NODE_TYPE_ID
    || imageRegistryEntry.formId !== 'imageGeneration'
    || !imageRegistryEntry.fields.some(field => field.fieldKey === 'prompt' && field.schemaPath === 'properties.prompt')
    || !imageRegistryEntry.ports.some(port => port.portKey === 'imageUrl' && port.direction === 'output')
  ) {
    throw new Error(`Expected declared image widget to resolve through document-scoped widget registry, got: ${JSON.stringify(imageRegistryEntry)}`)
  }
  if (
    !parsedPanel
    || parsedPanel.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    || parsedPanel.properties?.['flow:widgetFormId'] !== FLOW_RICH_MEDIA_PANEL_FORM_ID
    || parsedPanel.properties?.output !== 'Panel content stays in Rich Media Panel.'
  ) {
    throw new Error(`Expected parsed graph to keep panel as Rich Media Panel, got: ${JSON.stringify(parsedPanel)}`)
  }

  const parsedAuthoredEdge = parsed.graphData.edges.find(edge => edge.id === 'e-mcp-response-widget-to-panel')
  if (
    !parsedAuthoredEdge
    || parsedAuthoredEdge.source !== 'mcp-response-generator-widget'
    || parsedAuthoredEdge.target !== 'mcp-response-output-panel'
    || parsedAuthoredEdge.properties?.['flow:sourcePortKey'] !== 'text_out'
    || parsedAuthoredEdge.properties?.['flow:targetPortKey'] !== 'output'
  ) {
    throw new Error(`Expected parsed widget-to-panel edge handles to survive normalization, got: ${JSON.stringify(parsedAuthoredEdge)}`)
  }
}
