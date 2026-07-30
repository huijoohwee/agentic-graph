import { resolveStoryboardWidgetTextProjectionTargets } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextProjectionTargets'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config'
import {
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
  FLOW_PROMPT_INPUT_PORT_KEY,
  FLOW_TEXT_OUTPUT_PORT_KEY,
} from '@/lib/graph/flowPorts'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { createStoryboardWidgetTextOutputHarness } from '@/tests/lib/storyboardWidgetTextOutputHarness'

const createSourceNode = (): GraphNode => ({
  id: 'source-widget',
  type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  label: 'Source Widget',
  properties: { prompt: 'Generate reusable text.' },
})

export function testVideoWidgetPromptPortTakesPrecedenceOverPanelProjection() {
  const source = createSourceNode()
  const videoTarget: GraphNode = {
    id: 'video-widget',
    type: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
    label: 'Video Widget',
    properties: { prompt: 'Use the connected text as the video prompt.' },
  }
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [source, videoTarget],
    edges: [{
      id: 'source-to-video-prompt',
      source: source.id,
      target: videoTarget.id,
      label: 'text output to prompt',
      properties: {
        [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
        [FLOW_EDGE_TARGET_PORT_KEY]: FLOW_PROMPT_INPUT_PORT_KEY,
      },
    }],
  }
  const targets = resolveStoryboardWidgetTextProjectionTargets({
    anchorNode: source,
    graphData,
    resolveNodeById: nodeId => graphData.nodes.find(node => node.id === nodeId) || null,
  })
  const harness = createStoryboardWidgetTextOutputHarness(graphData)
  const publication = harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: '# Canonical prompt',
    title: source.label || 'Source Widget',
    model: 'test-model',
    connectCreatedOutputToAnchor: true,
  })
  const published = harness.readGraph()
  const publishedVideo = published.nodes.find(node => node.id === videoTarget.id)
  if (
    targets.explicitPanelNodeIds.length !== 0
    || !targets.hasExplicitWidgetTarget
    || publication !== null
    || published.nodes.length !== 2
    || publishedVideo?.properties.output !== undefined
    || publishedVideo?.properties.richMediaActiveTab !== undefined
    || publishedVideo?.properties.outputVersions !== undefined
  ) {
    throw new Error(`expected text_out -> prompt_in to retain VideoGeneration as a downstream Widget, got ${JSON.stringify({ targets, publication, published })}`)
  }
}

export function testNonTextPanelPortRejectsTextProjection() {
  const source = createSourceNode()
  const mediaTarget: GraphNode = {
    id: 'media-panel',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Image Input',
    properties: { imageUrl: 'https://example.invalid/existing.png' },
  }
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [source, mediaTarget],
    edges: [{
      id: 'source-to-panel-image',
      source: source.id,
      target: mediaTarget.id,
      label: 'text must not overwrite image input',
      properties: {
        [FLOW_EDGE_SOURCE_PORT_KEY]: FLOW_TEXT_OUTPUT_PORT_KEY,
        [FLOW_EDGE_TARGET_PORT_KEY]: 'imageUrl',
      },
    }],
  }
  const targets = resolveStoryboardWidgetTextProjectionTargets({
    anchorNode: source,
    graphData,
    resolveNodeById: nodeId => graphData.nodes.find(node => node.id === nodeId) || null,
  })
  const harness = createStoryboardWidgetTextOutputHarness(graphData)
  const publication = harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: '# Text fallback',
    title: source.label || 'Source Widget',
    model: 'test-model',
    connectCreatedOutputToAnchor: true,
  })
  const published = harness.readGraph()
  const originalTarget = published.nodes.find(node => node.id === mediaTarget.id)
  const generatedPanels = published.nodes.filter(node => (
    node.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID && node.id !== mediaTarget.id
  ))
  if (
    targets.explicitPanelNodeIds.length !== 0
    || targets.hasExplicitWidgetTarget
    || !publication
    || originalTarget?.properties.imageUrl !== mediaTarget.properties.imageUrl
    || originalTarget?.properties.output !== undefined
    || originalTarget?.properties.richMediaActiveTab !== undefined
    || generatedPanels.length !== 1
    || generatedPanels[0]?.properties.output !== '# Text fallback'
  ) {
    throw new Error(`expected a non-text panel port to remain untouched and use a text fallback panel, got ${JSON.stringify({ targets, publication, published })}`)
  }
}
