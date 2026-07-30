import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import {
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { GraphData } from '@/lib/graph/types'
import { buildNodeMediaProperties } from '@/lib/canvas/graph-elements/mediaSpec'

const makeGraph = (): GraphData => ({
  type: 'Graph',
  nodes: [
    {
      id: 'scene-1',
      label: 'Opening Scene',
      type: 'Scene',
      properties: {
        stage: 'Outline',
        summary: 'Set the problem and introduce the lead character.',
        location: 'Conference Room',
        timeOfDay: 'Monday',
        action: 'Designer and client review printed boards on the table.',
        dialogue: 'CLIENT: "Just a few small changes."',
        prompt: 'Conference room review with printed storyboard boards and marked-up notes.',
        style: 'Doodle',
        references: [
          'https://example.com/reference-a.jpg',
          'https://example.com/reference-b.jpg',
        ],
        tags: ['intro', 'hero'],
        media_url: 'https://example.com/opening.png',
        order: 1,
      },
    },
    {
      id: 'scene-2',
      label: 'Product Reveal',
      type: 'Scene',
      properties: {
        stage: 'Review',
        description: 'Reveal the product in context.',
        priority: 'High',
        videoUrl: 'https://example.com/reveal.mp4',
        order: 2,
      },
    },
    {
      id: 'root',
      label: 'Document Root',
      type: 'Document',
      properties: {
        heading: 'Storyboard Root',
      },
    },
  ],
  edges: [],
})

export function testStoryboardBoardModelProjectsSceneLikeNodesIntoLanes() {
  const board = buildStoryboardBoardModel({ graphData: makeGraph(), graphRevision: 4 })
  if (!board.semanticKey) throw new Error('expected storyboard board model to expose a semantic key')
  if (board.totalCards !== 2) throw new Error(`expected storyboard model to filter structural nodes, got ${board.totalCards}`)
  if (board.lanes.length !== 2) throw new Error(`expected two storyboard lanes, got ${board.lanes.length}`)
  const outlineLane = board.lanes.find(lane => lane.label === 'Outline')
  if (!outlineLane || outlineLane.cards.length !== 1) {
    throw new Error(`expected Outline lane with one card, got ${JSON.stringify(board.lanes)}`)
  }
  const reviewLane = board.lanes.find(lane => lane.label === 'Review')
  if (!reviewLane || reviewLane.cards[0]?.media?.kind !== 'video') {
    throw new Error(`expected Review lane video card, got ${JSON.stringify(board.lanes)}`)
  }
  const opening = outlineLane.cards[0]
  if (!opening.tags.includes('intro') || !opening.tags.includes('hero')) {
    throw new Error(`expected storyboard tags to preserve multi-value tags, got ${JSON.stringify(opening.tags)}`)
  }
  if (opening.slugline !== 'Conference Room - Monday') {
    throw new Error(`expected storyboard slugline to compose location and time, got ${opening.slugline}`)
  }
  if (!opening.action.includes('printed boards') || !opening.dialogue.includes('few small changes')) {
    throw new Error(`expected storyboard action/dialogue fields, got ${JSON.stringify(opening)}`)
  }
  if (opening.style !== 'Doodle' || !opening.prompt.includes('printed storyboard boards')) {
    throw new Error(`expected storyboard prompt/style fields, got ${JSON.stringify(opening)}`)
  }
  if (opening.references.length !== 2) {
    throw new Error(`expected storyboard references to preserve visual brief refs, got ${JSON.stringify(opening.references)}`)
  }
}

export function testStoryboardBoardModelPreservesAuthoredStructuralSourceAcrossGrowth() {
  const board = buildStoryboardBoardModel({
    graphData: {
      type: 'Graph',
      nodes: [
        {
          id: 'source',
          type: 'Document',
          label: 'Source request',
          properties: { summary: 'Compare the available approaches.' },
        },
        {
          id: 'empty-group',
          type: 'Group',
          label: 'Structural scaffold',
          properties: { stage: 'Generated' },
        },
        {
          id: 'branch-1',
          type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
          label: 'First branch',
          properties: { summary: 'Clarify the first missing decision variable.' },
        },
        {
          id: 'branch-2',
          type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
          label: 'Second branch',
          properties: { summary: 'Clarify the second missing decision variable.' },
        },
      ],
      edges: [],
    },
    graphRevision: 1,
  })
  const cardIds = board.lanes.flatMap(lane => lane.cards.map(card => card.id))
  if (
    cardIds.length !== 3
    || !cardIds.includes('source')
    || !cardIds.includes('branch-1')
    || !cardIds.includes('branch-2')
    || cardIds.includes('empty-group')
  ) {
    throw new Error(`expected authored structural content and generated cards to coexist without structural scaffold leakage, got ${JSON.stringify(cardIds)}`)
  }
}

export function testStoryboardBoardModelSupportsUniversalNeutralAliases() {
  const board = buildStoryboardBoardModel({
    graphData: {
      type: 'Graph',
      nodes: [
        {
          id: 'step-1',
          label: 'Review Intake',
          type: 'Panel',
          properties: {
            group: 'Backlog',
            step: 7,
            context: 'Product Surface',
            state: 'Open Review',
            task: 'Collect comments, consolidate intent, and keep one canonical source of truth.',
            narration: 'Stakeholder: "Keep the review loop clear and neutral."',
            brief: 'Neutral product review board with compact cards, no project-specific assumptions.',
            theme: 'Neutral UI',
            assets: [
              'https://example.com/ref-ui-a.png',
              'https://example.com/ref-ui-b.png',
            ],
            documentUrl: 'https://example.com/review-brief',
          },
        },
      ],
      edges: [],
    },
    graphRevision: 9,
  })
  const card = board.lanes[0]?.cards[0]
  if (!card) throw new Error('expected neutral alias graph to project one storyboard card')
  if (board.lanes[0]?.label !== 'Backlog') {
    throw new Error(`expected lane alias group -> Backlog, got ${JSON.stringify(board.lanes)}`)
  }
  if (card.indexLabel !== '7') {
    throw new Error(`expected step alias to project index label, got ${card.indexLabel}`)
  }
  if (card.slugline !== 'Product Surface - Open Review') {
    throw new Error(`expected context/state aliases to compose slugline, got ${card.slugline}`)
  }
  if (!card.action.includes('canonical source of truth') || !card.dialogue.includes('review loop')) {
    throw new Error(`expected task/narration aliases to project action/dialogue, got ${JSON.stringify(card)}`)
  }
  if (card.style !== 'Neutral UI' || !card.prompt.includes('compact cards')) {
    throw new Error(`expected brief/theme aliases to project prompt/style, got ${JSON.stringify(card)}`)
  }
  if (card.references.length !== 2 || card.href !== 'https://example.com/review-brief') {
    throw new Error(`expected assets/documentUrl aliases to project references and href, got ${JSON.stringify(card)}`)
  }
}

export function testStoryboardBoardModelReusesCanonicalWidgetTitles() {
  const board = buildStoryboardBoardModel({
    graphData: {
      type: 'Graph',
      nodes: [
        { id: 'legacy-text', type: 'TextGeneration', label: 'OpenAI Text Widget', properties: {} },
        { id: 'custom-text', type: 'TextGeneration', label: 'Campaign Copywriter', properties: {} },
      ],
      edges: [],
    },
    graphRevision: 1,
  })
  const cards = board.lanes.flatMap(lane => lane.cards)
  if (cards.find(card => card.id === 'legacy-text')?.title !== 'Widget Card') {
    throw new Error(`expected Card title to reuse canonical Widget Card naming, got ${JSON.stringify(cards)}`)
  }
  if (cards.find(card => card.id === 'custom-text')?.title !== 'Campaign Copywriter') {
    throw new Error(`expected Card title to preserve authored widget names, got ${JSON.stringify(cards)}`)
  }
}

export function testStoryboardBoardModelResolvesProviderVideoToRenderableEmbedAndThumbnail() {
  const videoId = ['Story', 'Board', '42'].join('')
  const watchUrl = ['https://www.youtube.com/watch', `?v=${videoId}&t=42`].join('')
  const board = buildStoryboardBoardModel({
    graphData: {
      type: 'Graph',
      nodes: [
        {
          id: 'video-source',
          label: 'Provider Video Source',
          type: 'StoryboardFrame',
          properties: {
            lane: 'Storyboard',
            mediaKind: 'video',
            mediaUrl: watchUrl,
            order: 1,
          },
        },
      ],
      edges: [],
    },
    graphRevision: 10,
  })
  const card = board.lanes[0]?.cards[0]
  if (!card) throw new Error('expected provider video source to project one storyboard card')
  if (card.media?.kind !== 'iframe' || !card.media.url.includes('/embed/') || card.media.url === watchUrl) {
    throw new Error(`expected provider video to resolve to renderable iframe media, got ${JSON.stringify(card.media)}`)
  }
  if (card.href !== watchUrl) {
    throw new Error(`expected card href to preserve source URL provenance, got ${card.href}`)
  }
  if (!card.references.some(reference => reference.kind === 'image' && reference.url.includes(`/vi/${videoId}/`))) {
    throw new Error(`expected provider video thumbnail image reference, got ${JSON.stringify(card.references)}`)
  }
}

export function testStoryboardBoardModelProjectsGeneratedOutputAndAudioMedia() {
  const board = buildStoryboardBoardModel({
    graphData: {
      type: 'Graph',
      nodes: [
        {
          id: 'text-run',
          label: 'Widget Card Run',
          type: 'TextGeneration',
          properties: {
            lane: 'Generated',
            output: '## Draft response\n\nA renderer-neutral text artifact from the active request.',
          },
        },
        {
          id: 'audio-run',
          label: 'Audio Review',
          type: 'Audio',
          properties: {
            lane: 'Generated',
            mediaKind: 'audio',
            mediaUrl: 'https://example.com/review.mp3',
          },
        },
      ],
      edges: [],
    },
    graphRevision: 11,
  })
  const generatedLane = board.lanes.find(lane => lane.label === 'Generated')
  if (!generatedLane || generatedLane.cards.length !== 2) {
    throw new Error(`expected generated lane with text and audio cards, got ${JSON.stringify(board.lanes)}`)
  }
  const textCard = generatedLane.cards.find(card => card.id === 'text-run') || null
  if (!textCard?.output.includes('renderer-neutral text artifact')) {
    throw new Error(`expected generated output to project into storyboard card output, got ${JSON.stringify(textCard)}`)
  }
  const audioCard = generatedLane.cards.find(card => card.id === 'audio-run') || null
  if (audioCard?.media?.kind !== 'audio') {
    throw new Error(`expected audio media to remain a renderable storyboard card media kind, got ${JSON.stringify(audioCard?.media)}`)
  }
}

export function testStoryboardBoardModelProjectsDroppedGenericMediaIntoVisibleCardMedia() {
  const imageUrl = 'https://example.com/uploads/storyboard-drop.png?kg_media_token=fresh'
  const videoUrl = 'https://example.com/uploads/storyboard-drop.mp4?kg_media_token=fresh'
  const panelVideoUrl = 'https://example.com/uploads/storyboard-panel-drop.mp4?kg_media_token=fresh'
  const board = buildStoryboardBoardModel({
    graphData: {
      type: 'Graph',
      nodes: [
        {
          id: 'image-drop',
          label: 'Dropped Image',
          type: 'StoryboardFrame',
          properties: {
            ...buildNodeMediaProperties({
              kind: 'image',
              url: imageUrl,
              includeCamelGeneric: true,
            }),
            lane: 'Runtime',
            outputSrcDoc: '',
            renderUrl: '',
            imageUrl: '',
            order: 1,
          },
        },
        {
          id: 'video-drop',
          label: 'Dropped Video',
          type: 'StoryboardFrame',
          properties: {
            ...buildNodeMediaProperties({
              kind: 'video',
              url: videoUrl,
              includeCamelGeneric: true,
            }),
            lane: 'Runtime',
            outputSrcDoc: '',
            renderUrl: '',
            videoUrl: '',
            order: 2,
          },
        },
        {
          id: 'rich-media-panel-drop',
          label: 'Dropped Rich Media Panel',
          type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
          properties: {
            ...buildNodeMediaProperties({
              kind: 'video',
              url: panelVideoUrl,
              includeCamelGeneric: true,
            }),
            [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
            [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
            lane: 'Runtime',
            output: '',
            outputSrcDoc: '',
            richMediaActiveTab: 'video',
            videoUrl: panelVideoUrl,
            order: 3,
          },
        },
      ],
      edges: [],
    },
    graphRevision: 13,
  })
  const cards = board.lanes.flatMap(lane => lane.cards)
  const imageCard = cards.find(card => card.id === 'image-drop') || null
  const videoCard = cards.find(card => card.id === 'video-drop') || null
  const panelCard = cards.find(card => card.id === 'rich-media-panel-drop') || null
  if (imageCard?.media?.kind !== 'image' || imageCard.media.url !== imageUrl) {
    throw new Error(`expected dropped generic image media to project as visible Storyboard card media, got ${JSON.stringify(imageCard?.media)}`)
  }
  if (videoCard?.media?.kind !== 'video' || videoCard.media.url !== videoUrl) {
    throw new Error(`expected dropped generic video media to project as visible Storyboard card media, got ${JSON.stringify(videoCard?.media)}`)
  }
  if (panelCard) {
    throw new Error(`expected dropped Rich Media Panel node type to stay out of Storyboard card shells, got ${JSON.stringify(panelCard)}`)
  }
  if (imageCard.href !== imageUrl || videoCard.href !== videoUrl) {
    throw new Error(`expected dropped media card hrefs to preserve runtime media URLs, got ${JSON.stringify({ imageHref: imageCard?.href, videoHref: videoCard?.href })}`)
  }
}

export function testStoryboardBoardModelUsesSharedDataflowForRichMediaPanelCards() {
  const registry: WidgetRegistryEntry[] = [
    {
      id: 'source-text',
      isEnabled: true,
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'source',
      formId: 'source.text',
      fields: [],
      ports: [{ portKey: 'output', direction: 'output', schemaPath: 'output' }],
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'inline-compute',
      isEnabled: true,
      nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'compute',
      formId: 'compute.inline',
      fields: [],
      ports: [
        { portKey: 'prompt', direction: 'input', schemaPath: 'prompt' },
        { portKey: 'output', direction: 'output', schemaPath: 'output' },
        { portKey: 'outputSrcDoc', direction: 'output', schemaPath: 'outputSrcDoc' },
      ],
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'rich-media-panel',
      isEnabled: true,
      nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      widgetTypeId: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
      formId: FLOW_RICH_MEDIA_PANEL_FORM_ID,
      fields: [],
      ports: [
        { portKey: 'output', direction: 'input', schemaPath: 'output' },
        { portKey: 'outputSrcDoc', direction: 'input', schemaPath: 'outputSrcDoc' },
      ],
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ]
  const graphData: GraphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [
      {
        id: 'source',
        label: 'Source',
        type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'source',
          [FLOW_WIDGET_FORM_ID_KEY]: 'source.text',
          lane: 'Inputs',
          output: 'story seed',
        },
      },
      {
        id: 'runner',
        label: 'Inline Runner',
        type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'compute',
          [FLOW_WIDGET_FORM_ID_KEY]: 'compute.inline',
          'flow:compute': "(inputs) => ({ output: `Computed ${inputs.prompt}`, outputSrcDoc: `<main><h1>Computed storyboard panel</h1><p>${inputs.prompt}</p></main>` })",
        },
      },
      {
        id: 'panel',
        label: 'Rich Media Panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
          lane: 'Outputs',
          richMediaActiveTab: 'text',
        },
      },
    ],
    edges: [
      {
        id: 'source-to-runner',
        source: 'source',
        target: 'runner',
        label: 'output',
        properties: {
          [FLOW_EDGE_SOURCE_PORT_KEY]: 'output',
          [FLOW_EDGE_TARGET_PORT_KEY]: 'prompt',
        },
      },
      {
        id: 'runner-to-panel-output',
        source: 'runner',
        target: 'panel',
        label: 'output',
        properties: {
          [FLOW_EDGE_SOURCE_PORT_KEY]: 'output',
          [FLOW_EDGE_TARGET_PORT_KEY]: 'output',
        },
      },
      {
        id: 'runner-to-panel-html',
        source: 'runner',
        target: 'panel',
        label: 'outputSrcDoc',
        properties: {
          [FLOW_EDGE_SOURCE_PORT_KEY]: 'outputSrcDoc',
          [FLOW_EDGE_TARGET_PORT_KEY]: 'outputSrcDoc',
        },
      },
    ],
  } as GraphData

  const board = buildStoryboardBoardModel({ graphData, graphRevision: 12, widgetRegistry: registry })
  const panelCard = board.lanes.flatMap(lane => lane.cards).find(card => card.id === 'panel') || null
  if (!panelCard) throw new Error(`expected computed Rich Media Panel to project as a Storyboard card, got ${JSON.stringify(board.lanes)}`)
  if (!panelCard.output.includes('Computed story seed')) {
    throw new Error(`expected Storyboard card output to come from shared inline dataflow, got ${JSON.stringify(panelCard)}`)
  }
  if (panelCard.media?.kind !== 'iframe' || !panelCard.media.srcDoc) {
    throw new Error(`expected computed outputSrcDoc to render as a Storyboard iframe card, got ${JSON.stringify(panelCard.media)}`)
  }
  if (!panelCard.media.srcDoc.includes('Computed storyboard panel') || !panelCard.media.srcDoc.includes('data-kg-rich-media-panel-srcdoc')) {
    throw new Error('expected Storyboard iframe card to reuse normalized Rich Media Panel srcdoc')
  }
}
