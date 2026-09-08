import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { buildStoryboardHelpToast } from '@/components/StoryboardCanvas/storyboardHelpAction'
import { runStoryboardOpenSidepaneAction } from '@/components/StoryboardCanvas/storyboardOpenSidepaneAction'
import { runStoryboardConvertLoopAction } from '@/components/StoryboardCanvas/storyboardConvertLoopAction'
import { runStoryboardDuplicateAction } from '@/components/StoryboardCanvas/storyboardDuplicateAction'
import { buildStoryboardRunUnavailableToast, runStoryboardRunAction } from '@/components/StoryboardCanvas/storyboardRunAction'
import { runStoryboardSelectAction } from '@/components/StoryboardCanvas/storyboardSelectAction'
import { buildStoryboardToolbarActionBindings } from '@/components/StoryboardCanvas/storyboardToolbarActionBindings'
import { buildStoryboardToolbarProps } from '@/components/StoryboardCanvas/storyboardToolbarProps'
import { buildStoryboardToolbarPresentation } from '@/components/StoryboardCanvas/storyboardToolbarPresentation'
import { runStoryboardUpdateKvEntryAction } from '@/components/StoryboardCanvas/storyboardUpdateKvEntryAction'
import { commitStoryboardMarkdownDuplicate, runStoryboardMarkdownDuplicateAction } from '@/components/StoryboardCanvas/storyboardMarkdownDuplicate'
import { runStoryboardRemoveAction } from '@/components/StoryboardCanvas/storyboardRemoveAction'
import { runStoryboardStrybldrDuplicateAction } from '@/components/StoryboardCanvas/storyboardStrybldrDuplicate'
import { WIDGET_ACTIONS_TOOLBAR_OFFSET_PX } from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { buildStoryboardGraphBackedNodeLookup } from '@/components/StoryboardCanvas/storyboardNodeLookup'
import { findDuplicatedMarkdownNodeId } from '@/components/StoryboardCanvas/storyboardDuplicateSelection'
import { buildStrybldrStoryboardDocument, serializeStrybldrStoryboardMarkdown } from '@/features/strybldr/strybldrStoryboard'
import { getDocumentLocationFromMetadata } from '@/lib/graph/markdownMetadata'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { canUseStrybldrStoryboardDuplicatePath } from '@/components/StoryboardCanvas/storyboardDuplicateRouting'
import { duplicateMarkdownLineRange } from 'grph-shared/markdown/lineEditing'
async function buildMixedDuplicateRoutingFixture(): Promise<{
  mixedGraph: GraphData
  markdownBackedNode: GraphNode
  strybldrNodeId: string
  strybldrMarkdownText: string
  strybldrSourceUnitId: string
}> {
  const strybldrDoc = buildStrybldrStoryboardDocument({
    createdAtMs: 1,
    mediaUrlBySourceUnitId: {
      'mixed-routing-source': 'https://example.com/source.png',
    },
    sourceUnits: [
      {
        id: 'mixed-routing-source',
        workspacePath: '/mixed-routing-source.md',
        relativePath: 'mixed-routing-source.md',
        originalName: 'Mixed duplicate routing source',
        mediaKind: 'doc',
        mimeHint: 'text/markdown',
        byteSize: 64,
        textHash: 'mixed-routing-source-hash',
        status: 'unsupported',
        provenance: { importMode: 'file', importedAtMs: 1 },
      },
    ],
    elements: [
      {
        id: 'starter-source-brief-card',
        sourceUnitId: 'mixed-routing-source',
        label: 'Source brief',
        confidence: 1,
        sourceBox: null,
        evidenceKind: 'user-edit',
        provider: 'human',
        order: 1,
        summary: 'Capture the approved source metadata.',
        action: 'Keep the structured Strybldr path available for this card.',
        prompt: 'Preserve the Strybldr-backed duplicate route.',
      },
    ],
  })
  const strybldrMarkdownText = serializeStrybldrStoryboardMarkdown(strybldrDoc)
  const parsed = await loadGraphDataFromTextViaParser(
    'mixed-duplicate-routing.strybldr.md',
    strybldrMarkdownText,
    { applyToStore: false, syncMarkdownDocument: false },
  )
  if (!parsed?.graphData) throw new Error('expected parsed Strybldr graph for mixed duplicate routing fixture')

  const markdownBackedNode: GraphNode = {
    id: 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate',
    label: 'Runtime gate',
    type: 'Text',
    properties: {
      lane: 'Runtime',
      summary: 'Keep the generic markdown duplicate path durable in mixed boards.',
      action: 'Duplicate by line range instead of appending a new Strybldr element.',
      prompt: 'Use source line metadata to preserve the markdown-backed block.',
      order: 2,
    } as never,
    metadata: {
      documentPath: 'mixed-duplicate-routing.md',
      lineStart: 12,
      lineEnd: 15,
    } as never,
  }
  return {
    mixedGraph: {
      ...parsed.graphData,
      nodes: [...(parsed.graphData.nodes || []), markdownBackedNode],
    },
    markdownBackedNode,
    strybldrNodeId: 'starter-source-brief-card',
    strybldrMarkdownText,
    strybldrSourceUnitId: 'mixed-routing-source',
  }
}

export function testStoryboardDuplicateRoutingScopesStrybldrPathPerCard() {
  const genericMarkdownCard: GraphNode = {
    id: 'workspace:/docs/mixed.md::blk:md:runtime-gate',
    label: 'Runtime gate',
    type: 'Text',
    properties: {
      lane: 'Runtime',
    } as never,
  }
  const mixedDocumentCanDuplicate = canUseStrybldrStoryboardDuplicatePath({
    hasStrybldrStoryboardDuplicatePath: true,
    sourceNode: genericMarkdownCard,
    resolvedCardNodeId: 'blk:md:runtime-gate',
    cardId: 'blk:md:runtime-gate',
    currentPropertiesByCardId: new Map([
      ['workspace:/docs/mixed.md::strybldr-card-1', { strybldrRunId: 'strybldr-demo', strybldrElementId: 'strybldr-card-1' }],
    ]),
  })
  if (mixedDocumentCanDuplicate) {
    throw new Error('expected mixed-document generic markdown card to avoid the Strybldr append path')
  }

  const directStrybldrCard: GraphNode = {
    id: 'starter-runtime-gate-card',
    label: 'Runtime gate',
    type: 'StoryboardElement',
    properties: {
      strybldrRunId: 'strybldr-starter-template',
      strybldrSourceUnitId: 'strybldr-starter-source',
      strybldrElementId: 'starter-runtime-gate-card',
    } as never,
  }
  if (!canUseStrybldrStoryboardDuplicatePath({
    hasStrybldrStoryboardDuplicatePath: true,
    sourceNode: directStrybldrCard,
    resolvedCardNodeId: 'starter-runtime-gate-card',
    cardId: 'starter-runtime-gate-card',
    currentPropertiesByCardId: new Map(),
  })) {
    throw new Error('expected Strybldr-backed storyboard card to keep the append duplicate path')
  }

  const composedSourceNode: GraphNode = {
    id: 'workspace:/docs/starter.md::starter-review-packet-card',
    label: 'Review packet',
    type: 'StoryboardElement',
    properties: {} as never,
  }
  if (!canUseStrybldrStoryboardDuplicatePath({
    hasStrybldrStoryboardDuplicatePath: true,
    sourceNode: composedSourceNode,
    resolvedCardNodeId: 'starter-review-packet-card',
    cardId: 'starter-review-packet-card',
    currentPropertiesByCardId: new Map([
      ['workspace:/docs/starter.md::starter-review-packet-card', { strybldrRunId: 'strybldr-starter-template', strybldrElementId: 'starter-review-packet-card' }],
    ]),
  })) {
    throw new Error('expected storyboard duplicate routing to read Strybldr metadata from the current card map entry')
  }
}

export async function testStoryboardDuplicateRoutingKeepsMixedBoardMarkdownCardsGeneric() {
  const { mixedGraph, markdownBackedNode, strybldrNodeId } = await buildMixedDuplicateRoutingFixture()

  const board = buildStoryboardBoardModel({ graphData: mixedGraph, graphRevision: 1 })
  const runtimeLane = board.lanes.find(lane => lane.id === 'Runtime') || null
  const elementsLane = board.lanes.find(lane => lane.id === 'Elements') || null
  if (!runtimeLane?.cards.some(card => card.id === markdownBackedNode.id || card.id === 'blk:md:runtime-gate')) {
    throw new Error(`expected mixed board to expose the markdown-backed runtime card, got ${JSON.stringify(board.lanes)}`)
  }
  if (!elementsLane?.cards.some(card => card.id === 'starter-source-brief-card')) {
    throw new Error(`expected mixed board to keep the parsed Strybldr element card, got ${JSON.stringify(board.lanes)}`)
  }

  const nodeById = buildStoryboardGraphBackedNodeLookup([mixedGraph])
  const markdownSourceNode = nodeById.get('workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate') || null
  const markdownInnerNode = nodeById.get('blk:md:runtime-gate') || null
  const strybldrNode = nodeById.get(strybldrNodeId) || null
  if (!markdownSourceNode || !markdownInnerNode || !strybldrNode) {
    throw new Error('expected mixed board lookup to expose composed markdown ids, inner markdown ids, and Strybldr ids together')
  }

  const currentPropertiesByCardId = new Map(
    (mixedGraph.nodes || []).map(node => [String(node.id || '').trim(), (node.properties || {}) as Record<string, unknown>]),
  )
  if (canUseStrybldrStoryboardDuplicatePath({
    hasStrybldrStoryboardDuplicatePath: true,
    sourceNode: markdownSourceNode,
    resolvedCardNodeId: 'blk:md:runtime-gate',
    cardId: 'blk:md:runtime-gate',
    currentPropertiesByCardId,
  })) {
    throw new Error('expected mixed board markdown-backed card to stay on the generic duplicate path')
  }
  if (!canUseStrybldrStoryboardDuplicatePath({
    hasStrybldrStoryboardDuplicatePath: true,
    sourceNode: strybldrNode,
    resolvedCardNodeId: strybldrNodeId,
    cardId: strybldrNodeId,
    currentPropertiesByCardId,
  })) {
    throw new Error('expected mixed board Strybldr card to preserve the structured append duplicate path')
  }
}

export async function testStoryboardDuplicateSelectionFindsMixedBoardMarkdownDuplicateByLineRange() {
  const { mixedGraph, markdownBackedNode } = await buildMixedDuplicateRoutingFixture()
  const beforeIds = new Set((mixedGraph.nodes || []).map(node => String(node.id || '').trim()).filter(Boolean))
  const markdownDocumentText = [
    '# Mixed duplicate routing',
    '',
    'Intro paragraph.',
    '',
    'Setup paragraph.',
    '',
    'Strybldr section placeholder.',
    '',
    'Another paragraph.',
    '',
    '## Runtime',
    'Runtime gate summary',
    'Runtime gate action',
    'Runtime gate prompt',
    '',
    'Tail paragraph.',
  ].join('\n')
  const duplicatedRange = duplicateMarkdownLineRange({
    markdownText: markdownDocumentText,
    startLine: 12,
    endLine: 14,
  })
  const committedNodes: GraphNode[] = [
    ...(mixedGraph.nodes || []),
    {
      id: 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy',
      label: 'Runtime gate',
      type: 'Text',
      properties: {
        lane: 'Runtime',
        summary: 'Keep the generic markdown duplicate path durable in mixed boards.',
      } as never,
      metadata: {
        documentPath: 'mixed-duplicate-routing.md',
        lineStart: duplicatedRange.duplicatedStartLine,
        lineEnd: duplicatedRange.duplicatedEndLine,
      } as never,
    },
  ]
  const duplicatedNodeId = findDuplicatedMarkdownNodeId({
    committedNodes,
    beforeIds,
    documentPath: 'mixed-duplicate-routing.md',
    duplicatedStartLine: duplicatedRange.duplicatedStartLine,
    duplicatedEndLine: duplicatedRange.duplicatedEndLine,
  })
  if (duplicatedNodeId !== 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy') {
    throw new Error(`expected duplicate selection helper to find the new markdown-backed node, got ${String(duplicatedNodeId || '')}`)
  }

  const falsePositiveId = findDuplicatedMarkdownNodeId({
    committedNodes,
    beforeIds,
    documentPath: 'mixed-duplicate-routing.md',
    duplicatedStartLine: duplicatedRange.duplicatedStartLine + 20,
    duplicatedEndLine: duplicatedRange.duplicatedEndLine + 20,
  })
  if (falsePositiveId) {
    throw new Error(`expected duplicate selection helper to ignore unmatched line ranges, got ${falsePositiveId}`)
  }

  if (!String(markdownBackedNode.id || '').includes('blk:md:runtime-gate')) {
    throw new Error('expected mixed duplicate selection fixture to keep the original markdown-backed runtime card')
  }
}

export async function testStoryboardMarkdownDuplicateHelperCommitsMixedBoardSelection() {
  const { mixedGraph, markdownBackedNode } = await buildMixedDuplicateRoutingFixture()
  const beforeIds = new Set((mixedGraph.nodes || []).map(node => String(node.id || '').trim()).filter(Boolean))
  const markdownDocumentText = [
    '# Mixed duplicate routing',
    '',
    'Intro paragraph.',
    '',
    'Setup paragraph.',
    '',
    'Strybldr section placeholder.',
    '',
    'Another paragraph.',
    '',
    '## Runtime',
    'Runtime gate summary',
    'Runtime gate action',
    'Runtime gate prompt',
    '',
    'Tail paragraph.',
  ].join('\n')
  const expectedDuplicate = duplicateMarkdownLineRange({
    markdownText: markdownDocumentText,
    startLine: 12,
    endLine: 14,
  })
  let committedNextMarkdownText = ''
  const duplicateResult = commitStoryboardMarkdownDuplicate({
    markdownDocumentName: 'mixed-duplicate-routing.md',
    markdownDocumentText,
    sourceLocation: getDocumentLocationFromMetadata(markdownBackedNode.metadata),
    beforeIds,
    commitMutation: nextMarkdownText => {
      committedNextMarkdownText = nextMarkdownText
      return true
    },
    getCommittedNodes: () => [
      ...(mixedGraph.nodes || []),
      {
        id: 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy',
        label: 'Runtime gate',
        type: 'Text',
        properties: {
          lane: 'Runtime',
        } as never,
        metadata: {
          documentPath: 'mixed-duplicate-routing.md',
          lineStart: expectedDuplicate.duplicatedStartLine,
          lineEnd: expectedDuplicate.duplicatedEndLine,
        } as never,
      },
    ],
  })
  if (!duplicateResult.committed) {
    throw new Error('expected storyboard markdown duplicate helper to commit the generic markdown duplicate path')
  }
  if (committedNextMarkdownText !== expectedDuplicate.markdownText || duplicateResult.nextMarkdownText !== expectedDuplicate.markdownText) {
    throw new Error('expected storyboard markdown duplicate helper to commit the duplicated markdown text')
  }
  if (
    duplicateResult.duplicatedStartLine !== expectedDuplicate.duplicatedStartLine
    || duplicateResult.duplicatedEndLine !== expectedDuplicate.duplicatedEndLine
  ) {
    throw new Error(`expected storyboard markdown duplicate helper to report the duplicated line range, got ${duplicateResult.duplicatedStartLine}-${duplicateResult.duplicatedEndLine}`)
  }
  if (duplicateResult.duplicatedNodeId !== 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy') {
    throw new Error(`expected storyboard markdown duplicate helper to resolve the duplicated node id, got ${String(duplicateResult.duplicatedNodeId || '')}`)
  }
}

export async function testStoryboardMarkdownDuplicateActionSelectsMixedBoardDuplicate() {
  const { mixedGraph, markdownBackedNode } = await buildMixedDuplicateRoutingFixture()
  const markdownDocumentText = [
    '# Mixed duplicate routing',
    '',
    'Intro paragraph.',
    '',
    'Setup paragraph.',
    '',
    'Strybldr section placeholder.',
    '',
    'Another paragraph.',
    '',
    '## Runtime',
    'Runtime gate summary',
    'Runtime gate action',
    'Runtime gate prompt',
    '',
    'Tail paragraph.',
  ].join('\n')
  const expectedDuplicate = duplicateMarkdownLineRange({
    markdownText: markdownDocumentText,
    startLine: 12,
    endLine: 14,
  })
  let currentNodes: GraphNode[] = [...(mixedGraph.nodes || [])]
  let committedNextMarkdownText = ''
  let selectedNodeId = ''
  const actionResult = runStoryboardMarkdownDuplicateAction({
    markdownDocumentName: 'mixed-duplicate-routing.md',
    markdownDocumentText,
    sourceLocation: getDocumentLocationFromMetadata(markdownBackedNode.metadata),
    getNodes: () => currentNodes,
    commitMutation: nextMarkdownText => {
      committedNextMarkdownText = nextMarkdownText
      currentNodes = [
        ...currentNodes,
        {
          id: 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy',
          label: 'Runtime gate',
          type: 'Text',
          properties: {
            lane: 'Runtime',
          } as never,
          metadata: {
            documentPath: 'mixed-duplicate-routing.md',
            lineStart: expectedDuplicate.duplicatedStartLine,
            lineEnd: expectedDuplicate.duplicatedEndLine,
          } as never,
        },
      ]
      return true
    },
    selectNode: nodeId => {
      selectedNodeId = nodeId
    },
  })
  if (!actionResult.handled || !actionResult.committed) {
    throw new Error('expected storyboard markdown duplicate action helper to handle and commit the mixed-board markdown branch')
  }
  if (committedNextMarkdownText !== expectedDuplicate.markdownText) {
    throw new Error('expected storyboard markdown duplicate action helper to commit the duplicated markdown text')
  }
  if (selectedNodeId !== 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy') {
    throw new Error(`expected storyboard markdown duplicate action helper to select the duplicated markdown-backed node, got ${selectedNodeId}`)
  }
  if (actionResult.duplicatedNodeId !== selectedNodeId) {
    throw new Error('expected storyboard markdown duplicate action helper to return the same duplicated node id it selected')
  }
}

export async function testStoryboardStrybldrDuplicateActionCommitsMixedBoardCard() {
  const { mixedGraph, strybldrNodeId, strybldrMarkdownText, strybldrSourceUnitId } = await buildMixedDuplicateRoutingFixture()
  const board = buildStoryboardBoardModel({ graphData: mixedGraph, graphRevision: 1 })
  const strybldrCard = board.lanes.flatMap(lane => lane.cards).find(card => card.id === strybldrNodeId) || null
  if (!strybldrCard) {
    throw new Error('expected mixed-board fixture to expose the Strybldr-backed storyboard card')
  }
  let committedNextMarkdownText = ''
  let committedNextSelectedNodeId = ''
  const actionResult = runStoryboardStrybldrDuplicateAction({
    markdownDocumentText: strybldrMarkdownText,
    title: `${strybldrCard.title} copy`,
    typeLabel: strybldrCard.typeLabel,
    lane: strybldrCard.lane,
    order: strybldrCard.order + 1,
    sourceUnitId: strybldrSourceUnitId,
    summary: strybldrCard.summary,
    action: strybldrCard.action,
    prompt: strybldrCard.prompt,
    commitMutation: ({ nextMarkdownText, nextSelectedNodeId }) => {
      committedNextMarkdownText = nextMarkdownText
      committedNextSelectedNodeId = nextSelectedNodeId
      return true
    },
  })
  if (!actionResult.handled || !actionResult.committed) {
    throw new Error('expected storyboard Strybldr duplicate action helper to commit the mixed-board Strybldr branch')
  }
  if (!actionResult.nextMarkdownId || committedNextSelectedNodeId !== actionResult.nextMarkdownId) {
    throw new Error('expected storyboard Strybldr duplicate action helper to commit with the new selected Strybldr node id')
  }
  if (committedNextMarkdownText !== actionResult.nextMarkdownText) {
    throw new Error('expected storyboard Strybldr duplicate action helper to return the committed markdown text')
  }
  if (!committedNextMarkdownText.includes('Source brief copy')) {
    throw new Error('expected storyboard Strybldr duplicate action helper to append the duplicated Strybldr card title')
  }
}

export async function testStoryboardDuplicateActionRoutesMixedBoardCardsByBranch() {
  const { mixedGraph, markdownBackedNode, strybldrNodeId, strybldrMarkdownText, strybldrSourceUnitId } = await buildMixedDuplicateRoutingFixture()
  const board = buildStoryboardBoardModel({ graphData: mixedGraph, graphRevision: 1 })
  const strybldrCard = board.lanes.flatMap(lane => lane.cards).find(card => card.id === strybldrNodeId) || null
  if (!strybldrCard) {
    throw new Error('expected mixed-board fixture to expose the Strybldr-backed storyboard card')
  }
  const markdownDocumentText = [
    '# Mixed duplicate routing',
    '',
    'Intro paragraph.',
    '',
    'Setup paragraph.',
    '',
    'Strybldr section placeholder.',
    '',
    'Another paragraph.',
    '',
    '## Runtime',
    'Runtime gate summary',
    'Runtime gate action',
    'Runtime gate prompt',
    '',
    'Tail paragraph.',
  ].join('\n')
  const expectedMarkdownDuplicate = duplicateMarkdownLineRange({
    markdownText: markdownDocumentText,
    startLine: 12,
    endLine: 14,
  })
  let markdownNodes: GraphNode[] = [...(mixedGraph.nodes || [])]
  let markdownSelectedNodeId = ''
  const markdownResult = runStoryboardDuplicateAction({
    canUseStrybldrDuplicatePath: false,
    markdownDocumentName: 'mixed-duplicate-routing.md',
    markdownDocumentText,
    sourceLocation: getDocumentLocationFromMetadata(markdownBackedNode.metadata),
    title: 'Runtime gate copy',
    typeLabel: 'Text',
    lane: 'Runtime',
    order: 3,
    getNodes: () => markdownNodes,
    commitStrybldrMutation: () => false,
    commitMarkdownMutation: nextMarkdownText => {
      markdownNodes = [
        ...markdownNodes,
        {
          id: 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy',
          label: 'Runtime gate',
          type: 'Text',
          properties: { lane: 'Runtime' } as never,
          metadata: {
            documentPath: 'mixed-duplicate-routing.md',
            lineStart: expectedMarkdownDuplicate.duplicatedStartLine,
            lineEnd: expectedMarkdownDuplicate.duplicatedEndLine,
          } as never,
        },
      ]
      return nextMarkdownText === expectedMarkdownDuplicate.markdownText
    },
    selectNode: nodeId => {
      markdownSelectedNodeId = nodeId
    },
  })
  if (markdownResult.branch !== 'markdown' || !markdownResult.handled || !markdownResult.committed) {
    throw new Error('expected unified storyboard duplicate action to route markdown-backed cards through the markdown branch')
  }
  if (markdownSelectedNodeId !== 'workspace:/docs/mixed-duplicate-routing.md::blk:md:runtime-gate-copy') {
    throw new Error(`expected unified storyboard duplicate action to select the duplicated markdown-backed node, got ${markdownSelectedNodeId}`)
  }

  let strybldrSelectedNodeId = ''
  const strybldrResult = runStoryboardDuplicateAction({
    canUseStrybldrDuplicatePath: true,
    markdownDocumentName: 'mixed-duplicate-routing.strybldr.md',
    markdownDocumentText: strybldrMarkdownText,
    sourceLocation: getDocumentLocationFromMetadata(markdownBackedNode.metadata),
    title: `${strybldrCard.title} copy`,
    typeLabel: strybldrCard.typeLabel,
    lane: strybldrCard.lane,
    order: strybldrCard.order + 1,
    sourceUnitId: strybldrSourceUnitId,
    summary: strybldrCard.summary,
    action: strybldrCard.action,
    prompt: strybldrCard.prompt,
    getNodes: () => mixedGraph.nodes || [],
    commitStrybldrMutation: ({ nextMarkdownText, nextSelectedNodeId }) => {
      strybldrSelectedNodeId = nextSelectedNodeId
      return nextMarkdownText.includes('Source brief copy')
    },
    commitMarkdownMutation: () => false,
  })
  if (strybldrResult.branch !== 'strybldr' || !strybldrResult.handled || !strybldrResult.committed) {
    throw new Error('expected unified storyboard duplicate action to route Strybldr-backed cards through the Strybldr branch')
  }
  if (!strybldrResult.nextMarkdownId || strybldrSelectedNodeId !== strybldrResult.nextMarkdownId) {
    throw new Error('expected unified storyboard duplicate action to preserve the selected Strybldr duplicate id through the commit callback')
  }
}

export async function testStoryboardRemoveActionPrefersMarkdownCommitBeforeGraphFallback() {
  const { mixedGraph, strybldrNodeId, strybldrMarkdownText } = await buildMixedDuplicateRoutingFixture()
  let removedGraphNodeId = ''
  const markdownResult = runStoryboardRemoveAction({
    markdownDocumentText: strybldrMarkdownText,
    cardId: strybldrNodeId,
    resolvedCardNodeId: strybldrNodeId,
    hasSourceNode: true,
    commitMarkdownRemoval: nextMarkdownText => {
      if (nextMarkdownText.includes('Source brief')) {
        throw new Error('expected storyboard remove action markdown branch to remove the Strybldr card content')
      }
      return true
    },
    removeGraphNode: nodeId => {
      removedGraphNodeId = nodeId
    },
  })
  if (markdownResult.branch !== 'markdown' || !markdownResult.handled || !markdownResult.committed) {
    throw new Error('expected storyboard remove action to commit the markdown removal branch before any graph fallback')
  }
  if (removedGraphNodeId) {
    throw new Error(`expected storyboard remove action to avoid graph fallback when markdown removal commits, got ${removedGraphNodeId}`)
  }

  let fallbackGraphNodeId = ''
  const graphResult = runStoryboardRemoveAction({
    markdownDocumentText: strybldrMarkdownText,
    cardId: strybldrNodeId,
    resolvedCardNodeId: 'graph-only-node',
    hasSourceNode: true,
    commitMarkdownRemoval: () => false,
    removeGraphNode: nodeId => {
      fallbackGraphNodeId = nodeId
    },
  })
  if (graphResult.branch !== 'graph' || !graphResult.handled || !graphResult.committed) {
    throw new Error('expected storyboard remove action to fall back to graph removal when markdown removal does not commit')
  }
  if (fallbackGraphNodeId !== 'graph-only-node') {
    throw new Error(`expected storyboard remove action to remove the resolved graph-backed node on fallback, got ${fallbackGraphNodeId}`)
  }

  if (!Array.isArray(mixedGraph.nodes) || mixedGraph.nodes.length === 0) {
    throw new Error('expected mixed-board remove fixture to keep the parsed graph available')
  }
}

export async function testStoryboardConvertLoopActionClassifiesMixedBoardGraphBackedCards() {
  const { mixedGraph, strybldrNodeId } = await buildMixedDuplicateRoutingFixture()
  const unavailableResult = runStoryboardConvertLoopAction({
    graphData: mixedGraph,
    hasSourceNode: false,
    resolvedCardNodeId: strybldrNodeId,
  })
  if (unavailableResult.status !== 'unavailable' || unavailableResult.changed) {
    throw new Error('expected storyboard convert-loop action to stay unavailable without a graph-backed source node')
  }

  const convertedResult = runStoryboardConvertLoopAction({
    graphData: mixedGraph,
    hasSourceNode: true,
    resolvedCardNodeId: strybldrNodeId,
  })
  if (convertedResult.status !== 'converted' || !convertedResult.changed) {
    throw new Error('expected storyboard convert-loop action to convert a graph-backed mixed-board card to a loop')
  }
  const convertedNode = (convertedResult.graphData.nodes || []).find(node => String(node?.id || '') === strybldrNodeId) || null
  if (!convertedNode || String(convertedNode.type || '') !== 'Loop') {
    throw new Error(`expected storyboard convert-loop action to rewrite the target node as Loop, got ${JSON.stringify(convertedNode)}`)
  }

  const alreadyLoopResult = runStoryboardConvertLoopAction({
    graphData: convertedResult.graphData,
    hasSourceNode: true,
    resolvedCardNodeId: strybldrNodeId,
  })
  if (alreadyLoopResult.status !== 'already-loop' || alreadyLoopResult.changed) {
    throw new Error('expected storyboard convert-loop action to report already-loop after the first conversion')
  }
}

export function testStoryboardHelpActionBuildsCanonicalToast() {
  const toast = buildStoryboardHelpToast({
    message: 'Helpful Storyboard action guidance',
  })
  if (toast.id !== 'storyboard-widget-help' || toast.kind !== 'neutral' || toast.ttlMs !== 2800) {
    throw new Error(`expected storyboard help action to build the canonical neutral help toast, got ${JSON.stringify(toast)}`)
  }
  if (toast.message !== 'Helpful Storyboard action guidance') {
    throw new Error(`expected storyboard help action to preserve the provided help message, got ${toast.message}`)
  }
}

export function testStoryboardSelectActionSelectsResolvedNodeFromCanvas() {
  let selectionSource: string | null = null
  let selectedNodeId: string | null = null
  const result = runStoryboardSelectAction({
    resolvedCardNodeId: 'node-select',
    setSelectionSource: source => {
      selectionSource = source
    },
    selectNode: nodeId => {
      selectedNodeId = nodeId
    },
  })
  if (result.selectedNodeId !== 'node-select') {
    throw new Error(`expected storyboard select action to return the resolved node id, got ${result.selectedNodeId}`)
  }
  if (selectionSource !== 'canvas' || selectedNodeId !== 'node-select') {
    throw new Error(`expected storyboard select action to select the resolved node from canvas, got ${JSON.stringify({ selectionSource, selectedNodeId })}`)
  }
}

export function testStoryboardOpenSidepaneActionSelectsAndOpensResolvedNode() {
  let selectionSource: string | null = null
  let selectedNodeId: string | null = null
  let openSidepaneCount = 0
  let openWidgetNodeIds: string[] = ['node-a']
  const result = runStoryboardOpenSidepaneAction({
    resolvedCardNodeId: 'node-b',
    setSelectionSource: source => {
      selectionSource = source
    },
    selectNode: nodeId => {
      selectedNodeId = nodeId
    },
    updateOpenWidgetNodeIds: updater => {
      openWidgetNodeIds = updater(openWidgetNodeIds)
    },
    openSidepane: () => {
      openSidepaneCount += 1
    },
  })
  if (result.selectedNodeId !== 'node-b') {
    throw new Error(`expected storyboard open-sidepane action to return the resolved node id, got ${result.selectedNodeId}`)
  }
  if (selectionSource !== 'canvas' || selectedNodeId !== 'node-b') {
    throw new Error(`expected storyboard open-sidepane action to select the resolved node from canvas, got ${JSON.stringify({ selectionSource, selectedNodeId })}`)
  }
  if (openSidepaneCount !== 1) {
    throw new Error(`expected storyboard open-sidepane action to open the sidepane exactly once, got ${openSidepaneCount}`)
  }
  if (openWidgetNodeIds.length !== 2 || !openWidgetNodeIds.includes('node-b')) {
    throw new Error(`expected storyboard open-sidepane action to append the resolved node id to open widget ids, got ${JSON.stringify(openWidgetNodeIds)}`)
  }
}

export function testStoryboardRunActionBuildsCanonicalUnavailableToast() {
  const toast = buildStoryboardRunUnavailableToast({
    cardId: 'card-run',
  })
  if (toast.id !== 'storyboard-run-card-run' || toast.kind !== 'neutral' || toast.ttlMs !== 2600) {
    throw new Error(`expected storyboard run action to build the canonical unavailable toast, got ${JSON.stringify(toast)}`)
  }
  if (toast.message !== 'Run is available in Storyboard Widget for runnable graph-backed nodes.') {
    throw new Error(`expected storyboard run action to preserve the canonical unavailable message, got ${toast.message}`)
  }
}

export function testStoryboardRunActionOpensBeforeClassifyingAvailability() {
  const calls: string[] = []
  const unavailableResult = runStoryboardRunAction({
    cardId: 'card-run',
    hasSourceNode: false,
    resolvedCardNodeId: 'node-run',
    openInSidepane: () => {
      calls.push('open')
      return { selectedNodeId: 'node-run' }
    },
    runNode: () => {
      calls.push('run')
    },
  })
  if (unavailableResult.status !== 'unavailable' || unavailableResult.ran || unavailableResult.openedNodeId !== 'node-run') {
    throw new Error(`expected storyboard run action to report unavailable after opening the resolved node, got ${JSON.stringify(unavailableResult)}`)
  }
  if (calls.join(',') !== 'open') {
    throw new Error(`expected storyboard run action to open the sidepane before classifying unavailable and avoid running, got ${JSON.stringify(calls)}`)
  }
  if (!unavailableResult.toast || unavailableResult.toast.id !== 'storyboard-run-card-run') {
    throw new Error(`expected storyboard run action to return the canonical unavailable toast, got ${JSON.stringify(unavailableResult.toast)}`)
  }

  const availableResult = runStoryboardRunAction({
    cardId: 'card-run',
    hasSourceNode: true,
    resolvedCardNodeId: 'node-run',
    openInSidepane: () => {
      calls.push('open-available')
      return { selectedNodeId: 'node-run' }
    },
    runNode: nodeId => {
      calls.push(`run:${nodeId}`)
    },
  })
  if (availableResult.status !== 'started' || !availableResult.ran || availableResult.runNodeId !== 'node-run') {
    throw new Error(`expected storyboard run action to start the shared runner for graph-backed nodes, got ${JSON.stringify(availableResult)}`)
  }
  if (calls.join(',') !== 'open,open-available,run:node-run') {
    throw new Error(`expected storyboard run action to open first and then run the resolved node id, got ${JSON.stringify(calls)}`)
  }
}

export function testStoryboardRunActionRoutesStrybldrCardsThroughSharedRunPath() {
  const calls: string[] = []
  const result = runStoryboardRunAction({
    cardId: 'starter-source-brief-card',
    hasSourceNode: true,
    resolvedCardNodeId: 'starter-source-brief-card',
    openInSidepane: () => {
      calls.push('open-sidepane')
      return { selectedNodeId: 'starter-source-brief-card' }
    },
    runNode: nodeId => {
      calls.push(`run-flow:${nodeId}`)
    },
  })
  if (result.status !== 'started' || !result.ran || result.runNodeId !== 'starter-source-brief-card') {
    throw new Error(`expected Strybldr storyboard card Run to start through the shared Storyboard run path, got ${JSON.stringify(result)}`)
  }
  if (calls.join(',') !== 'open-sidepane,run-flow:starter-source-brief-card') {
    throw new Error(`expected Strybldr card Run to use sidepane plus shared runner without a panel branch, got ${JSON.stringify(calls)}`)
  }
}

export function testStoryboardUpdateKvEntryActionBridgesResolvedNodeIntoWorkflowManager() {
  const calls: Array<{
    nodeId: string | null
    registryLength: number
    graphMetaKind: string | null
  }> = []
  const result = runStoryboardUpdateKvEntryAction({
    sourceNode: {
      id: 'node-kv',
      type: 'Text',
      properties: { lane: 'Runtime' } as never,
    },
    registry: [{ id: 'widget-a' } as never],
    graphMetaKind: 'storyboard',
    openMappingForNode: ({ node, registry, graphMetaKind }) => {
      calls.push({
        nodeId: String(node?.id || '') || null,
        registryLength: Array.isArray(registry) ? registry.length : 0,
        graphMetaKind: String(graphMetaKind || '') || null,
      })
    },
  })
  if (result.sourceNodeId !== 'node-kv') {
    throw new Error(`expected storyboard update-KV-entry action to return the resolved source node id, got ${result.sourceNodeId}`)
  }
  if (calls.length !== 1) {
    throw new Error(`expected storyboard update-KV-entry action to forward exactly one workflow-manager call, got ${calls.length}`)
  }
  const [call] = calls
  if (call.nodeId !== 'node-kv' || call.registryLength !== 1 || call.graphMetaKind !== 'storyboard') {
    throw new Error(`expected storyboard update-KV-entry action to preserve node, registry, and graph meta kind, got ${JSON.stringify(call)}`)
  }
}

export function testStoryboardToolbarActionBindingsForwardCardScopedCallbacks() {
  const calls: string[] = []
  const card = {
    id: 'card-bind',
    lane: 'Runtime',
    title: 'Bound Card',
    indexLabel: '1',
    summary: '',
    output: '',
    action: '',
    dialogue: '',
    references: [],
  } as StoryboardCardModel
  const helpHandler = () => {
    calls.push('help')
  }
  const bindings = buildStoryboardToolbarActionBindings({
    card,
    runCard: nextCard => {
      calls.push(`run:${nextCard.id}`)
    },
    openCardInSidepane: nextCard => {
      calls.push(`sidepane:${nextCard.id}`)
    },
    duplicateCard: nextCard => {
      calls.push(`duplicate:${nextCard.id}`)
    },
    clearCardOutput: nextCard => {
      calls.push(`clear:${nextCard.id}`)
    },
    showCardHelp: helpHandler,
    removeCard: nextCard => {
      calls.push(`remove:${nextCard.id}`)
    },
    openCardWorkflowManagerMapping: nextCard => {
      calls.push(`mapping:${nextCard.id}`)
    },
    probeTreeCard: nextCard => { calls.push(`probe:${nextCard.id}`) }, convertCardToLoop: nextCard => {
      calls.push(`loop:${nextCard.id}`)
    },
  })
  if (bindings.onHelp !== helpHandler) {
    throw new Error('expected storyboard toolbar bindings to preserve the shared help callback reference')
  }
  bindings.onRun()
  bindings.onOpenInSidepane()
  bindings.onDuplicate()
  bindings.onClearOutput()
  bindings.onHelp()
  bindings.onRemove()
  bindings.onUpdateKvEntry(); bindings.onProbeTree(); bindings.onConvertToLoopNode()
  if (calls.join(',') !== 'run:card-bind,sidepane:card-bind,duplicate:card-bind,clear:card-bind,help,remove:card-bind,mapping:card-bind,probe:card-bind,loop:card-bind') {
    throw new Error(`expected storyboard toolbar bindings to forward the card-scoped callbacks in order, got ${JSON.stringify(calls)}`)
  }
}

export function testStoryboardToolbarPresentationBuildsSharedToolbarPayload() {
  const withReference = buildStoryboardToolbarPresentation({
    primaryReferenceUrl: 'https://example.com/reference',
  })
  if (withReference.actionVisibility.enableHandles !== false) {
    throw new Error(`expected storyboard toolbar presentation to hide enable-handles by default, got ${JSON.stringify(withReference.actionVisibility)}`)
  }
  if (!withReference.openExternalAction || withReference.openExternalAction.label !== 'Open ref') {
    throw new Error(`expected storyboard toolbar presentation to build the shared open-ref action when a reference url exists, got ${JSON.stringify(withReference.openExternalAction)}`)
  }
  const withoutReference = buildStoryboardToolbarPresentation({
    primaryReferenceUrl: '   ',
  })
  if (withoutReference.openExternalAction !== undefined) {
    throw new Error(`expected storyboard toolbar presentation to omit the external-open action when the reference url is blank, got ${JSON.stringify(withoutReference.openExternalAction)}`)
  }
}

export function testStoryboardToolbarPropsBuildSharedToolbarConfig() {
  const props = buildStoryboardToolbarProps({
    active: true,
    duplicateDisabled: false,
    primaryReferenceUrl: 'https://example.com/reference',
  })
  if (props.ariaLabel !== 'Storyboard card actions' || props.navClassName !== 'absolute inset-x-0 mx-auto z-10') {
    throw new Error(`expected storyboard toolbar props to reuse the Storyboard Widget bubble-toolbar anchor, got ${JSON.stringify(props)}`)
  }
  if (props.navStyle?.pointerEvents !== 'auto' || props.navStyle?.transform !== undefined || props.navStyle?.top !== -WIDGET_ACTIONS_TOOLBAR_OFFSET_PX || props.iconSizeClass !== 'h-3.5 w-3.5' || props.iconStrokeWidth !== 1.8) {
    throw new Error(`expected storyboard toolbar props to preserve the shared Storyboard Widget nav/icon configuration, got ${JSON.stringify(props)}`)
  }
  if (!props.active || props.enableHandlesDisabled !== true || props.convertToLoopDisabled !== false || props.duplicateDisabled !== false) {
    throw new Error(`expected storyboard toolbar props to preserve active/disabled state, got ${JSON.stringify(props)}`)
  }
  if (props.maxWidthPx == null || props.actionVisibility?.enableHandles !== false) {
    throw new Error(`expected storyboard toolbar props to compose the shared presentation payload, got ${JSON.stringify(props)}`)
  }
  if (!props.openExternalAction || props.openExternalAction.label !== 'Open ref') {
    throw new Error(`expected storyboard toolbar props to expose the shared open-ref action, got ${JSON.stringify(props.openExternalAction)}`)
  }
}
