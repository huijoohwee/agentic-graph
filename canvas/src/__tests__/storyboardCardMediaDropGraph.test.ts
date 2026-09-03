import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import {
  applyStoryboardCardMediaDropGraph,
  buildStoryboardCardMediaDropOverlayEdgeId,
  isStoryboardCardMediaDropEdge,
  isStoryboardCardMediaDropOverlayEdge,
} from '@/components/StoryboardWidgetCanvas/storyboardCardMediaDropGraph'
import { resolveStoryboardCardMediaDropGraphData } from '@/components/StoryboardWidgetCanvas/storyboardCardMediaDropGraphData'
import { readStoryboardInlineMediaConsumerIds } from '@/components/StoryboardWidgetCanvas/storyboardCardInlineMediaConsumers'
import { getCachedStoryboardWidgetOverlayEdgeGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import {
  buildStoryboardContainedProjectionEdgePath,
  buildStoryboardOverlayEdgePathD,
  buildStoryboardOutputCardLeftSidePath,
  readStoryboardContainedProjectionEdgeAnchors,
  readStoryboardOutputCardLeftSideAnchors,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayEdgeAnchors'
import { buildRichMediaPanelRegistryDraft } from '@/features/storyboard-widget-manager/richMediaPanelRegistryDraft'
import { buildStoryboardElementRegistryDraft } from '@/features/storyboard-widget-manager/storyboardElementRegistryDraft'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { buildGraphFlowOrderIndexByNodeId, resolveGraphEdgeFlowOrderDirection } from '@/lib/graph/flowOrder'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_FORM_ID,
  FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardMediaAlbum } from '@/lib/cards/CardMediaAlbum'
import {
  appendStoryboardMediaAlbumItem,
  STORYBOARD_CARD_MEDIA_ALBUM_PROPERTY,
} from '@/components/StoryboardCanvas/storyboardCardMediaAlbum'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const readNode = (graphData: GraphData, id: string): GraphNode | null =>
  (graphData.nodes || []).find(node => String(node.id || '') === id) || null

const buildCardNode = (id = 'story-card'): GraphNode => ({
  id,
  type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  label: 'Story card',
  x: 120,
  y: 260,
  properties: {
    [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
    [FLOW_WIDGET_FORM_ID_KEY]: FLOW_STORYBOARD_ELEMENT_FORM_ID,
    lane: 'Storyboard',
  },
})

const registry = [
  { ...buildRichMediaPanelRegistryDraft(), id: 'rich-media', updatedAt: '2026-07-08T00:00:00.000Z' },
  { ...buildStoryboardElementRegistryDraft(), id: 'storyboard', updatedAt: '2026-07-08T00:00:00.000Z' },
]

const videoPayload: MediaDragPayload = {
  kind: 'video',
  url: 'https://example.com/story-reference.mp4',
  label: 'Story reference video',
  sourceKey: 'floating-media:story-reference',
  thumbnailUrl: 'https://example.com/story-reference.jpg',
}

export function testStoryboardCardMediaDropPrefersGraphThatOwnsCanonicalCard() {
  const staleGraph: GraphData = { type: 'Graph', nodes: [buildCardNode('ws:other::n3')], edges: [] }
  const authoritativeCard = buildCardNode('ws:5f7223e3::n3')
  const authoritativeGraph: GraphData = { type: 'Graph', nodes: [authoritativeCard], edges: [] }
  const selectedGraph = resolveStoryboardCardMediaDropGraphData({
    cardId: 'ws:5f7223e3::n3',
    preferredGraphData: staleGraph,
    fallbackGraphData: authoritativeGraph,
  })
  assert(selectedGraph === authoritativeGraph, 'expected media drop to mutate the overlay graph that owns the selected canonical card')
  const result = applyStoryboardCardMediaDropGraph({
    cardId: 'ws:5f7223e3::n3',
    cardProperties: authoritativeCard.properties as Record<string, unknown>,
    graphData: selectedGraph,
    media: videoPayload,
  })
  assert(result?.createdPanel === true, 'expected canonical card selection to create a Rich Media Panel')
  assert(result.createdEdge === true, 'expected canonical card selection to create the panel-to-card edge')
  assert(result.graphData.edges.some(edge => edge.target === 'ws:5f7223e3::n3'), 'expected the materialized edge to target the selected canonical card')
}

export function testStoryboardCardMediaDropCreatesInboundRichMediaPanelEdge() {
  const card = buildCardNode()
  const graphData: GraphData = { type: 'Graph', nodes: [card], edges: [] }
  const result = applyStoryboardCardMediaDropGraph({
    cardId: 'story-card',
    cardProperties: {
      ...card.properties,
      mediaKind: videoPayload.kind,
      mediaUrl: videoPayload.url,
      thumbnailUrl: videoPayload.thumbnailUrl,
    },
    graphData,
    media: videoPayload,
  })
  assert(result?.createdPanel === true, 'expected card media drop to create a source Rich Media Panel node')
  assert(result.createdEdge === true, 'expected card media drop to create an inbound Rich Media Panel edge')
  const panel = readNode(result.graphData, result.panelId)
  assert(panel?.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, `expected source panel node, got ${JSON.stringify(panel)}`)
  const panelProperties = panel.properties as Record<string, unknown>
  assert(panelProperties[FLOW_WIDGET_TYPE_ID_KEY] === FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID, 'expected source panel widget type metadata')
  assert(panelProperties[FLOW_WIDGET_FORM_ID_KEY] === FLOW_RICH_MEDIA_PANEL_FORM_ID, 'expected source panel form metadata')
  assert(panelProperties.storyboardCanvasRichMediaPanel === true, 'expected source panel to stay on the Storyboard Rich Media overlay path')
  assert(panelProperties.videoUrl === videoPayload.url && panelProperties.mediaSourceKey === videoPayload.sourceKey, 'expected source panel to own dropped video media')
  assert(panel.x === 240 && panel.fx === 240 && panel.y === 23 && panel.fy === 23, `expected source panel to be visibly placed near the card, got ${JSON.stringify({ x: panel.x, y: panel.y, fx: panel.fx, fy: panel.fy })}`)
  const edge = result.graphData.edges.find(candidate => String(candidate.id || '') === result.edgeId)
  assert(edge?.source === result.panelId && edge.target === 'story-card', `expected inbound panel -> card edge, got ${JSON.stringify(edge)}`)
  const edgeProperties = edge.properties as Record<string, unknown>
  assert(edgeProperties[FLOW_EDGE_SOURCE_PORT_KEY] === 'videoUrl', 'expected edge to source the Rich Media Panel video port')
  assert(edgeProperties[FLOW_EDGE_TARGET_PORT_KEY] === 'mediaUrl', 'expected edge to target the card media port')
  assert(edgeProperties.storyboardCardMediaDropEdge === true, 'expected edge to be marked as card media-drop owned')
  assert(isStoryboardCardMediaDropEdge(edge, 'story-card'), 'expected generated edge to be recognized by the shared card media-drop edge helper')
  assert(isStoryboardCardMediaDropOverlayEdge(edge, panel, 'story-card'), 'expected overlay edge helper to recognize generated panel -> card media edges')
  const overlayAnchors = readStoryboardOutputCardLeftSideAnchors({
    outputCardRect: { left: 387, top: 655, right: 608.4, bottom: 779.8, width: 221.4, height: 124.8 },
    sourceCardRect: { left: 98.1, top: 376.3, right: 319.5, bottom: 501.1, width: 221.4, height: 124.8 },
  })
  assert(overlayAnchors?.source.side === 'right', `expected generated media output edge to leave the source card side nearest the output, got ${JSON.stringify(overlayAnchors)}`)
  assert(overlayAnchors.target.side === 'left', `expected generated media output edge to enter the output card left side, got ${JSON.stringify(overlayAnchors)}`)
  const outputPath = buildStoryboardOutputCardLeftSidePath({ source: overlayAnchors.source, target: overlayAnchors.target })
  assert(outputPath.startsWith('M319.5,438.7'), `expected generated media output path to start at source card side, got ${outputPath}`)
  assert(outputPath.endsWith('L387,717.4'), `expected generated media output path to terminate on output card left side, got ${outputPath}`)

  const connectedOnlyGraph = {
    ...result.graphData,
    nodes: result.graphData.nodes.map(node => String(node.id || '') === 'story-card' ? card : node),
  }
  const board = buildStoryboardBoardModel({ graphData: connectedOnlyGraph, graphRevision: 1, widgetRegistry: registry })
  const targetCard = board.lanes.flatMap(lane => lane.cards).find(item => item.id === 'story-card')
  assert(targetCard?.media?.url === videoPayload.url && targetCard.media.kind === 'video', `expected inbound Rich Media edge to project card media, got ${JSON.stringify(targetCard?.media)}`)
}

export function testStoryboardCardMediaDropOverlayGraphRequiresExplicitConsumerEdge() {
  const card = buildCardNode()
  const result = applyStoryboardCardMediaDropGraph({
    cardId: 'story-card',
    cardProperties: {
      ...card.properties,
      mediaKind: videoPayload.kind,
      mediaUrl: videoPayload.url,
      thumbnailUrl: videoPayload.thumbnailUrl,
    },
    graphData: { type: 'Graph', nodes: [card], edges: [] },
    media: videoPayload,
  })
  assert(result, 'expected media drop graph result')
  const graphData: GraphData = {
    ...result.graphData,
    edges: [],
  }
  const overlayGraph = getCachedStoryboardWidgetOverlayEdgeGraph({
    graphData,
    graphRevision: 9101,
    overlayNodeIds: ['story-card', result.panelId],
    preferCurrentGraphDataRefs: true,
  })
  const expectedEdgeId = buildStoryboardCardMediaDropOverlayEdgeId(result.panelId, 'story-card')
  assert(!overlayGraph?.edges.some(edge => edge.id === expectedEdgeId), 'expected shared media panels not to invent a single-target edge from panel-local state')

  const explicitOverlayGraph = getCachedStoryboardWidgetOverlayEdgeGraph({
    graphData: result.graphData,
    graphRevision: 9102,
    overlayNodeIds: ['story-card', result.panelId],
    preferCurrentGraphDataRefs: true,
  })
  const mediaEdges = (explicitOverlayGraph?.edges || []).filter(edge => edge.source === result.panelId && edge.target === 'story-card')
  assert(mediaEdges.length === 1, `expected explicit card-media edge not to be duplicated by derived overlay edge, got ${JSON.stringify(mediaEdges)}`)
}

export function testStoryboardOverlayGraphRefreshesWhenEdgeArrivesWithinSameRevision() {
  const source = buildCardNode('story-source')
  const target = buildCardNode('story-target')
  const graphWithoutEdge: GraphData = {
    type: 'Graph',
    nodes: [source, target],
    edges: [],
  }
  const overlayNodeIds = ['story-source', 'story-target']
  const initial = getCachedStoryboardWidgetOverlayEdgeGraph({
    graphData: graphWithoutEdge,
    graphRevision: 9191,
    overlayNodeIds,
    preferCurrentGraphDataRefs: true,
  })
  assert(initial?.edges.length === 0, `expected the initial overlay lookup to have no edge, got ${JSON.stringify(initial?.edges)}`)

  const graphWithEdge: GraphData = {
    ...graphWithoutEdge,
    edges: [{ id: 'edge-story-source-target', source: 'story-source', target: 'story-target', label: 'linksTo', properties: {} }],
  }
  const refreshed = getCachedStoryboardWidgetOverlayEdgeGraph({
    graphData: graphWithEdge,
    graphRevision: 9191,
    overlayNodeIds,
    preferCurrentGraphDataRefs: true,
  })
  assert(
    refreshed?.edges.some(edge => edge.id === 'edge-story-source-target'),
    `expected an edge materialized after its target card to invalidate the same-revision overlay cache, got ${JSON.stringify(refreshed?.edges)}`,
  )
}

export function testStoryboardCardMediaDropReusesInboundRichMediaPanelEdge() {
  const card = buildCardNode()
  const first = applyStoryboardCardMediaDropGraph({
    cardId: 'story-card',
    cardProperties: { ...card.properties, mediaKind: videoPayload.kind, mediaUrl: videoPayload.url },
    graphData: { type: 'Graph', nodes: [card], edges: [] },
    media: videoPayload,
  })
  assert(first, 'expected initial media drop graph result')
  const refreshedVideoPayload: MediaDragPayload = {
    ...videoPayload,
    url: `${videoPayload.url}?agentic_os_media_token=rotated`,
    sourceKey: 'floating-media:refreshed-story-reference',
  }
  const second = applyStoryboardCardMediaDropGraph({
    cardId: 'story-card',
    cardProperties: { ...card.properties, mediaKind: refreshedVideoPayload.kind, mediaUrl: refreshedVideoPayload.url },
    graphData: first.graphData,
    media: refreshedVideoPayload,
  })
  assert(second, 'expected refreshed media graph result')
  assert(second.panelId === first.panelId, `expected the same media identity to reuse panel ${first.panelId}, got ${second.panelId}`)
  assert(second.edgeId === first.edgeId, `expected the same Card/media pair to reuse edge ${first.edgeId}, got ${second.edgeId}`)
  assert(second.graphData.nodes.length === first.graphData.nodes.length, 'expected refreshed media not to duplicate its Rich Media Panel')
  assert(second.graphData.edges.length === first.graphData.edges.length, 'expected refreshed media not to duplicate its inbound edge')
  const panelProperties = readNode(second.graphData, second.panelId)?.properties as Record<string, unknown>
  assert(panelProperties.videoUrl === refreshedVideoPayload.url, `expected the reused panel to refresh its runtime URL, got ${JSON.stringify(panelProperties)}`)
  const edgeProperties = second.graphData.edges.find(edge => String(edge.id || '') === second.edgeId)?.properties as Record<string, unknown>
  assert(edgeProperties[FLOW_EDGE_SOURCE_PORT_KEY] === 'videoUrl' && edgeProperties[FLOW_EDGE_TARGET_PORT_KEY] === 'mediaUrl', `expected reused edge to retain videoUrl -> mediaUrl, got ${JSON.stringify(edgeProperties)}`)
}

export function testStoryboardCardInlineMediaChipsRetainInboundRichMediaPanels() {
  const card = buildCardNode()
  const imagePayload: MediaDragPayload = {
    kind: 'image',
    url: 'https://example.com/reference-frame.png',
    label: 'Reference frame',
    sourceKey: 'floating-media:reference-frame',
  }
  const audioPayload: MediaDragPayload = {
    kind: 'audio',
    url: 'https://example.com/reference-score.mp3',
    label: 'Reference score',
    sourceKey: 'floating-media:reference-score',
  }
  const first = applyStoryboardCardMediaDropGraph({
    cardId: card.id,
    cardProperties: { ...card.properties, mediaKind: videoPayload.kind, mediaUrl: videoPayload.url },
    graphData: { type: 'Graph', nodes: [card], edges: [] },
    media: videoPayload,
  })
  assert(first, 'expected first inline media chip graph result')
  const second = applyStoryboardCardMediaDropGraph({
    cardId: card.id,
    cardProperties: { ...card.properties, mediaKind: imagePayload.kind, mediaUrl: imagePayload.url },
    graphData: first.graphData,
    media: imagePayload,
  })
  assert(second, 'expected second inline media chip graph result')
  const third = applyStoryboardCardMediaDropGraph({
    cardId: card.id,
    cardProperties: { ...card.properties, mediaKind: audioPayload.kind, mediaUrl: audioPayload.url },
    graphData: second.graphData,
    media: audioPayload,
  })
  assert(third, 'expected third inline media chip graph result')

  const panels = third.graphData.nodes.filter(node => node.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  const inboundEdges = third.graphData.edges.filter(edge => isStoryboardCardMediaDropEdge(edge, card.id))
  assert(panels.length === 3, `expected one Rich Media Panel per distinct inline media chip, got ${JSON.stringify(panels.map(node => node.id))}`)
  assert(inboundEdges.length === 3, `expected one inbound edge per distinct inline media chip, got ${JSON.stringify(inboundEdges)}`)
  assert(new Set(inboundEdges.map(edge => edge.id)).size === 3, `expected retained inline media edges to keep unique ids across graph normalization, got ${JSON.stringify(inboundEdges.map(edge => edge.id))}`)
  assert(new Set(inboundEdges.map(edge => edge.source)).size === 3, 'expected each inline media panel to own one deduplicated inbound edge')
  assert(new Set(panels.map(panel => panel.x)).size === 3, `expected retained panels to use distinct visible placements, got ${JSON.stringify(panels.map(panel => panel.x))}`)

  const repeated = applyStoryboardCardMediaDropGraph({
    cardId: card.id,
    cardProperties: { ...card.properties, mediaKind: imagePayload.kind, mediaUrl: `${imagePayload.url}?agentic_os_media_token=rotated` },
    graphData: third.graphData,
    media: { ...imagePayload, url: `${imagePayload.url}?agentic_os_media_token=rotated` },
  })
  assert(repeated, 'expected repeated inline media chip graph result')
  assert(repeated.panelId === second.panelId, 'expected a repeated semantic media chip to reuse its existing panel')
  assert(repeated.graphData.nodes.length === third.graphData.nodes.length, 'expected repeated inline media not to duplicate panels')
  assert(repeated.graphData.edges.length === third.graphData.edges.length, 'expected repeated inline media not to duplicate edges')
}

export function testStoryboardCardMediaDropAppendsResponsiveMixedMediaAlbum() {
  const image = {
    kind: 'image' as const,
    url: 'https://example.com/first-frame.png?agentic_os_media_token=old',
    sourceUrl: 'https://example.com/first-frame.png',
  }
  const video = {
    kind: 'video' as const,
    url: 'https://example.com/second-clip.mp4',
    sourceUrl: 'https://example.com/second-clip.mp4',
    thumbnailUrl: 'https://example.com/second-clip.jpg',
  }
  const album = appendStoryboardMediaAlbumItem({ existing: null, current: image, dropped: video })
  const deduplicated = appendStoryboardMediaAlbumItem({
    existing: album,
    current: video,
    dropped: { ...image, url: 'https://example.com/first-frame.png?agentic_os_media_token=rotated' },
  })
  assert(deduplicated.length === 2, `expected token-rotated media to stay deduplicated, got ${JSON.stringify(deduplicated)}`)
  assert(deduplicated.map(item => item.kind).join(',') === 'image,video', `expected ordered mixed-media album, got ${JSON.stringify(deduplicated)}`)

  const card = buildCardNode()
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{
      ...card,
      properties: {
        ...card.properties,
        mediaKind: 'video',
        mediaUrl: video.url,
        media: video.url,
        video: video.url,
        thumbnailUrl: video.thumbnailUrl,
        [STORYBOARD_CARD_MEDIA_ALBUM_PROPERTY]: deduplicated,
      },
    }],
    edges: [],
  }
  const board = buildStoryboardBoardModel({ graphData, graphRevision: 2, widgetRegistry: registry })
  const targetCard = board.lanes.flatMap(lane => lane.cards).find(item => item.id === card.id)
  assert(targetCard?.mediaItems?.length === 2, `expected card model to project two album items, got ${JSON.stringify(targetCard?.mediaItems)}`)
  assert(targetCard.mediaItems[0]?.kind === 'image' && targetCard.mediaItems[1]?.kind === 'video', 'expected card model to preserve album order and mixed kinds')

  const sevenItems = Array.from({ length: 7 }, (_, index) => ({
    kind: index === 1 ? 'video' as const : 'image' as const,
    url: `https://example.com/media-${index}.${index === 1 ? 'mp4' : 'png'}`,
    sourceUrl: `https://example.com/media-${index}.${index === 1 ? 'mp4' : 'png'}`,
    ...(index === 1 ? { thumbnailUrl: 'https://example.com/media-1.jpg' } : {}),
  }))
  const markup = renderToStaticMarkup(CardMediaAlbum({ items: sevenItems, title: 'Text Widget' }))
  assert(markup.includes('data-kg-card-media-album-count="7"'), `expected album count metadata, got ${markup}`)
  assert((markup.match(/data-kg-card-media-album-item="1"/g) || []).length === 6, 'expected responsive album to cap the visible tile set at six')
  assert(markup.includes('data-kg-card-media-album-kind="video"') && markup.includes('>+1<'), 'expected mixed video affordance and overflow count')
}

export function testStoryboardCardMediaDropSharesPanelAcrossConsumers() {
  const cardA = buildCardNode('story-card-a')
  const cardB = buildCardNode('story-card-b')
  const first = applyStoryboardCardMediaDropGraph({
    cardId: 'story-card-a',
    cardProperties: { ...cardA.properties, mediaKind: videoPayload.kind, mediaUrl: videoPayload.url },
    graphData: { type: 'Graph', nodes: [cardA, cardB], edges: [] },
    media: videoPayload,
  })
  assert(first, 'expected first media consumer graph result')
  const second = applyStoryboardCardMediaDropGraph({
    cardId: 'story-card-b',
    cardProperties: { ...cardB.properties, mediaKind: videoPayload.kind, mediaUrl: `${videoPayload.url}?agentic_os_media_token=rotated` },
    graphData: first.graphData,
    media: { ...videoPayload, url: `${videoPayload.url}?agentic_os_media_token=rotated`, sourceKey: 'another-catalog-entry-for-the-same-media' },
  })
  assert(second, 'expected second media consumer graph result')
  assert(second.panelId === first.panelId, `expected both consumers to share panel ${first.panelId}, got ${second.panelId}`)
  assert(second.createdPanel === false, 'expected the second consumer not to create a duplicate Rich Media Panel')
  const panels = second.graphData.nodes.filter(node => node.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  assert(panels.length === 1, `expected one semantic media panel, got ${JSON.stringify(panels.map(node => node.id))}`)
  const consumerEdges = second.graphData.edges.filter(edge => edge.source === first.panelId)
  assert(consumerEdges.length === 2, `expected one edge per consumer, got ${JSON.stringify(consumerEdges)}`)
  assert(new Set(consumerEdges.map(edge => edge.target)).size === 2, 'expected distinct panel -> Card/Widget consumer edges')
}

export function testStoryboardInlineMediaSharesPanelAcrossCardAndWidgetConsumers() {
  const card = buildCardNode('story-card-a')
  const widget = buildCardNode('n2')
  const rotatedUrl = `${videoPayload.url}?agentic_os_media_token=rotated`
  const inlineConsumers = [
    {
      id: card.id,
      summary: '', output: '', action: '', dialogue: '', style: '', slugline: '',
      prompt: `<video src="${videoPayload.url}" title="Shared reference" controls></video>`,
    },
    {
      id: 'ws:workspace-a::n2',
      summary: `Use <video src="${rotatedUrl}" title="Shared reference" controls></video>`,
      output: '', action: '', dialogue: '', prompt: '', style: '', slugline: '',
    },
  ]
  const consumerIds = readStoryboardInlineMediaConsumerIds(inlineConsumers, videoPayload)
  assert(consumerIds.length === 2, `expected both Card and Widget inline-chip consumers, got ${JSON.stringify(consumerIds)}`)

  let graphData: GraphData = { type: 'Graph', nodes: [card, widget], edges: [] }
  let panelId = ''
  for (const consumerId of consumerIds) {
    const result = applyStoryboardCardMediaDropGraph({
      cardId: consumerId,
      cardProperties: consumerId === card.id ? card.properties as Record<string, unknown> : widget.properties as Record<string, unknown>,
      graphData,
      media: videoPayload,
    })
    assert(result, `expected shared inline media graph result for ${consumerId}`)
    graphData = result.graphData
    panelId = panelId || result.panelId
    assert(result.panelId === panelId, `expected one shared Rich Media Panel ${panelId}, got ${result.panelId}`)
  }

  const panels = graphData.nodes.filter(node => node.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  const sharedEdges = graphData.edges.filter(edge => edge.source === panelId)
  assert(panels.length === 1, `expected one Rich Media Panel for the shared inline chip, got ${JSON.stringify(panels.map(node => node.id))}`)
  assert(sharedEdges.length === 2, `expected two edges from the shared panel, got ${JSON.stringify(sharedEdges)}`)
  assert(new Set(sharedEdges.map(edge => edge.id)).size === 2, 'expected a unique edge for each shared-media consumer')
  assert(new Set(sharedEdges.map(edge => edge.target)).size === 2, `expected shared panel edges to target both Card and Widget, got ${JSON.stringify(sharedEdges.map(edge => edge.target))}`)
  assert(sharedEdges.every(edge => isStoryboardCardMediaDropEdge(edge, String(edge.target || ''))), 'expected every shared-media consumer edge to retain Card/Widget ownership metadata')
}

export function testStoryboardCardMediaDropReusesExistingPanelAcrossRuntimeStorageOrigins() {
  const cardA = buildCardNode('story-card-a')
  const cardB = buildCardNode('story-card-b')
  const storagePath = '/api/storage/media/airvio/runs/upload-730/image/shared.jpg'
  const existingPanel: GraphNode = {
    id: 'existing-shared-media-panel',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
    x: 420,
    y: 260,
    properties: {
      [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
      [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
      imageUrl: `http://localhost:5181${storagePath}?agentic_os_media_token=old`,
      retainedProperty: 'keep-me',
    },
  }
  const result = applyStoryboardCardMediaDropGraph({
    cardId: cardB.id,
    cardProperties: { ...cardB.properties, mediaKind: 'image', mediaUrl: `http://localhost:5180${storagePath}?agentic_os_media_token=new` },
    graphData: { type: 'Graph', nodes: [cardA, cardB, existingPanel], edges: [] },
    media: { kind: 'image', url: `http://localhost:5180${storagePath}?agentic_os_media_token=new`, label: 'Shared image' },
  })
  assert(result, 'expected shared runtime storage media graph result')
  assert(result.panelId === existingPanel.id, `expected existing canonical panel reuse, got ${result.panelId}`)
  assert(result.createdPanel === false, 'expected no duplicate panel for the same storage resource')
  const panels = result.graphData.nodes.filter(node => node.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  assert(panels.length === 1, `expected one Rich Media Panel, got ${JSON.stringify(panels.map(node => node.id))}`)
  const properties = readNode(result.graphData, existingPanel.id)?.properties as Record<string, unknown>
  assert(properties.retainedProperty === 'keep-me', 'expected reuse to preserve existing panel properties')
  assert(properties.mediaSource !== 'storyboard-card-media-drop', 'expected reuse not to claim cleanup ownership of a pre-existing panel')
}

export function testStoryboardCardMediaDropCreatesEdgeForNamespacedWidgetConsumer() {
  const card = buildCardNode('n2')
  const result = applyStoryboardCardMediaDropGraph({
    cardId: 'ws:workspace-a::n2',
    cardProperties: { ...card.properties, mediaKind: videoPayload.kind, mediaUrl: videoPayload.url },
    graphData: { type: 'Graph', nodes: [card], edges: [] },
    media: videoPayload,
  })
  assert(result, 'expected namespaced Widget media graph result')
  assert(result.graphData.edges.length === 1, 'expected namespaced Widget @ media to create an inbound edge')
  const edge = result.graphData.edges[0]!
  assert(edge.source === result.panelId && edge.target === 'n2', `expected canonical panel -> Widget edge, got ${edge.source} -> ${edge.target}`)
}

export function testStoryboardCardMediaDropCreatesVisiblePanelInsteadOfReusingUnownedEdge() {
  const card = buildCardNode()
  const distantPanel: GraphNode = {
    id: 'preauthored-panel',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
    x: 860,
    y: 260,
    properties: {
      [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
      [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
      imageUrl: 'https://example.com/preauthored.png',
    },
  }
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [card, distantPanel],
    edges: [{
      id: 'preauthored-edge',
      label: 'preauthored',
      source: 'preauthored-panel',
      target: 'story-card',
      properties: {
        [FLOW_EDGE_SOURCE_PORT_KEY]: 'imageUrl',
        [FLOW_EDGE_TARGET_PORT_KEY]: 'mediaUrl',
      },
    }],
  }
  const result = applyStoryboardCardMediaDropGraph({
    cardId: 'story-card',
    cardProperties: { ...card.properties, mediaKind: videoPayload.kind, mediaUrl: videoPayload.url },
    graphData,
    media: videoPayload,
  })
  assert(result, 'expected media drop graph result')
  assert(result.panelId !== 'preauthored-panel', 'expected card media drop not to reuse a non-drop-owned Rich Media Panel')
  assert(result.edgeId !== 'preauthored-edge', 'expected card media drop not to reuse a non-drop-owned Rich Media Panel edge')
  const panel = readNode(result.graphData, result.panelId)
  assert(panel?.x === 240 && panel.fx === 240 && panel.y === 23 && panel.fy === 23, `expected generated panel to use visible card-adjacent placement, got ${JSON.stringify(panel)}`)
  const sourceEdge = result.graphData.edges.find(edge => String(edge.id || '') === result.edgeId)
  assert(sourceEdge?.source === result.panelId && sourceEdge.target === 'story-card', `expected generated panel to own the inbound card-media edge, got ${JSON.stringify(sourceEdge)}`)
  const board = buildStoryboardBoardModel({ graphData: result.graphData, graphRevision: 1, widgetRegistry: registry })
  const targetCard = board.lanes.flatMap(lane => lane.cards).find(item => item.id === 'story-card')
  assert(targetCard?.media?.url === videoPayload.url, `expected generated inbound edge to supply visible card media, got ${JSON.stringify(targetCard?.media)}`)
}

function readFirstLineX(pathD: string): number | null {
  const match = /^M[^L]+ L(-?\d+(?:\.\d+)?),/.exec(pathD)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

export function testStoryboardOverlayForwardTrackEdgeAvoidsReverseBacktrack() {
  const explicitOrderByNodeId = buildGraphFlowOrderIndexByNodeId([
    { id: 'care_canvas', properties: { 'visual:xIndex': 5 } },
    { id: 'care_validation', properties: { 'visual:xIndex': 6 } },
  ], { rankdir: 'LR' })
  const sourceOrderByNodeId = buildGraphFlowOrderIndexByNodeId([
    { id: 'care_canvas', properties: {} },
    { id: 'care_validation', properties: {} },
  ], { rankdir: 'LR' })
  const sourceMetadataOrderByNodeId = buildGraphFlowOrderIndexByNodeId([
    { id: 'blk:md:workspace-readme:li:215:1', metadata: { lineStart: 215 }, properties: {} },
    { id: 'blk:md:workspace-readme:list:215:11', metadata: { lineStart: 215 }, properties: {} },
    { id: 'blk:md:workspace-readme:p:210:10', metadata: { lineStart: 210 }, properties: {} },
  ], { rankdir: 'LR' })
  const markdownIdOrderByNodeId = buildGraphFlowOrderIndexByNodeId([
    { id: 'blk:md:workspace-readme:li:215:1', properties: {} },
    { id: 'blk:md:workspace-readme:list:215:11', properties: {} },
    { id: 'blk:md:workspace-readme:p:210:10', properties: {} },
  ], { rankdir: 'LR' })
  const explicitDirection = resolveGraphEdgeFlowOrderDirection({
    sourceId: 'care_canvas',
    targetId: 'care_validation',
    orderByNodeId: explicitOrderByNodeId,
  })
  const fallbackDirection = resolveGraphEdgeFlowOrderDirection({
    sourceId: 'care_canvas',
    targetId: 'care_validation',
    orderByNodeId: sourceOrderByNodeId,
  })
  const sourceMetadataDirection = resolveGraphEdgeFlowOrderDirection({
    sourceId: 'blk:md:workspace-readme:p:210:10',
    targetId: 'blk:md:workspace-readme:list:215:11',
    orderByNodeId: sourceMetadataOrderByNodeId,
  })
  const markdownIdDirection = resolveGraphEdgeFlowOrderDirection({
    sourceId: 'blk:md:workspace-readme:p:210:10',
    targetId: 'blk:md:workspace-readme:list:215:11',
    orderByNodeId: markdownIdOrderByNodeId,
  })
  const hasItemMetadataDirection = resolveGraphEdgeFlowOrderDirection({
    edgeLabel: 'hasItem',
    sourceId: 'blk:md:workspace-readme:list:215:11',
    targetId: 'blk:md:workspace-readme:li:215:1',
    orderByNodeId: sourceMetadataOrderByNodeId,
  })
  const hasItemMarkdownIdDirection = resolveGraphEdgeFlowOrderDirection({
    edgeLabel: 'hasItem',
    sourceId: 'blk:md:workspace-readme:list:215:11',
    targetId: 'blk:md:workspace-readme:li:215:1',
    orderByNodeId: markdownIdOrderByNodeId,
  })
  assert(explicitDirection === 'forward', `expected visual x-index metadata to mark the overlay edge as forward flow, got ${explicitDirection}`)
  assert(fallbackDirection === 'forward', `expected source node order to remain a deterministic forward fallback, got ${fallbackDirection}`)
  assert(sourceMetadataDirection === 'forward', `expected source metadata to mark markdown edges as forward even when rendered order is reversed, got ${sourceMetadataDirection}`)
  assert(markdownIdDirection === 'forward', `expected markdown block source ids to mark source-line edges as forward even when rendered order is reversed, got ${markdownIdDirection}`)
  assert(hasItemMetadataDirection === 'forward', `expected same-line markdown containment metadata to remain forward, got ${hasItemMetadataDirection}`)
  assert(hasItemMarkdownIdDirection === 'forward', `expected same-line markdown containment ids to remain forward despite list item ordinals, got ${hasItemMarkdownIdDirection}`)
  const sx = 533.06
  const sy = 495.34
  const tx = 97
  const ty = 273.41
  const backwardPath = buildStoryboardOverlayEdgePathD({
    edgeType: 'smoothstep',
    outputCardLeftSide: false,
    rankdir: 'LR',
    sx,
    sy,
    tx,
    ty,
  })
  const forwardPath = buildStoryboardOverlayEdgePathD({
    edgeType: 'smoothstep',
    outputCardLeftSide: false,
    flowForwardTrack: explicitDirection === 'forward',
    rankdir: 'LR',
    sx,
    sy,
    tx,
    ty,
  })
  const sourceLinePath = buildStoryboardOverlayEdgePathD({
    edgeType: 'smoothstep',
    outputCardLeftSide: false,
    flowForwardTrack: markdownIdDirection === 'forward',
    rankdir: 'LR',
    sx: 618.08,
    sy: 398.38,
    tx: 457,
    ty: 233.88,
  })
  const hasItemPath = buildStoryboardOverlayEdgePathD({
    edgeType: 'smoothstep',
    outputCardLeftSide: false,
    flowForwardTrack: hasItemMarkdownIdDirection === 'forward',
    rankdir: 'LR',
    sx: 531.08,
    sy: 218.96,
    tx: 369.5,
    ty: 123.88,
  })
  const backwardFirstX = readFirstLineX(backwardPath)
  const forwardFirstX = readFirstLineX(forwardPath)
  const sourceLineFirstX = readFirstLineX(sourceLinePath)
  const hasItemFirstX = readFirstLineX(hasItemPath)
  assert(backwardFirstX != null && backwardFirstX < sx, `expected baseline smoothstep to back-track first, got ${backwardPath}`)
  assert(forwardFirstX != null && forwardFirstX > sx, `expected forward-track path to move forward first, got ${forwardPath}`)
  assert(sourceLineFirstX != null && sourceLineFirstX > 618.08, `expected source-line forward edge to move forward before routing, got ${sourceLinePath}`)
  assert(hasItemFirstX != null && hasItemFirstX > 531.08, `expected same-line containment edge to move forward before routing, got ${hasItemPath}`)

  const containedProjectionAnchors = readStoryboardContainedProjectionEdgeAnchors({
    sourceRect: { left: 100, top: 100, right: 460, bottom: 300, width: 360, height: 200 },
    targetRect: { left: 100, top: 380, right: 460, bottom: 580, width: 360, height: 200 },
  })
  assert(
    containedProjectionAnchors?.trackSide === 'right'
      && containedProjectionAnchors.source.side === 'right'
      && containedProjectionAnchors.target.side === 'right',
    `expected a vertically stacked projected edge to use the collective's side gutter, got ${JSON.stringify(containedProjectionAnchors)}`,
  )
  const containedProjectionPath = buildStoryboardContainedProjectionEdgePath({
    source: containedProjectionAnchors!.source,
    target: containedProjectionAnchors!.target,
    trackSide: containedProjectionAnchors!.trackSide!,
  })
  const containedProjectionXs = Array.from(containedProjectionPath.matchAll(/-?\d+(?:\.\d+)?(?=,)/g))
    .map(match => Number(match[0]))
  assert(
    Math.max(...containedProjectionXs) === 484,
    `expected the projected edge track to stay inside the 48px auto-bounded group gutter, got ${containedProjectionPath}`,
  )
}
