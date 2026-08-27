import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'
import {
  STORYBOARD_ACTION_PROPERTY_KEYS,
  STORYBOARD_EMPTY_LANE,
  STORYBOARD_OUTPUT_PROPERTY_KEYS,
  STORYBOARD_PROMPT_PROPERTY_KEYS,
  STORYBOARD_SUMMARY_PROPERTY_KEYS,
  STORYBOARD_TITLE_PROPERTY_KEYS,
} from '@/components/StoryboardCanvas/storyboardModel'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { UiToastInput } from '@/hooks/store/store-types/core'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { seedMissingFlowWidgetPinnedByIds } from '@/lib/storyboardWidget/flowWidgetPinnedState'
import {
  readGraphNodeCanonicalTextProperty,
  readGraphNodeCardTitle,
  readGraphNodeProperties,
} from '@/lib/cards/graphNodeCardFields'
import {
  AGENTICGRAPH_PROBE_TREE_GENERATE_TOOL_NAME,
  AGENTICGRAPH_PROBE_TREE_INVOCATION_TOKENS,
} from '@/features/agentic-os/probeTreePromptPreset'

type ProbeTreeResultKind = 'success' | 'neutral' | 'warning'

export type ProbeTreeBranchCardMaterializationResult = {
  graphData: GraphData | null
  changed: boolean
  kind: ProbeTreeResultKind
  message: string
  materializedNodeIds: string[]
  invocationText: string
}

const cleanPromptValue = (value: unknown, maxLength = 180): string => (
  String(unwrapGraphCellValue(value) ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
)

const readGraphIdentity = (value: unknown): string => cleanPromptValue(value, 240)

const readCardTextProperty = (properties: Record<string, unknown>, keys: readonly string[]): string => (
  cleanPromptValue(readGraphNodeCanonicalTextProperty(properties, keys), 320)
)

const readCardNumberProperty = (properties: Record<string, unknown>, keys: readonly string[]): number => {
  for (const key of keys) {
    const value = unwrapGraphCellValue(properties[key])
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

const readCardStringArrayProperty = (value: unknown): string[] => {
  const scalar = unwrapGraphCellValue(value)
  if (Array.isArray(scalar)) return scalar.map(item => cleanPromptValue(item, 80)).filter(Boolean)
  const text = cleanPromptValue(scalar, 160)
  return text ? [text] : []
}

const buildSelectedCardPromptContext = (card?: StoryboardCardModel | null): string => {
  if (!card) return 'Generate selectable Probe-Tree next-step cards for the active canvas context.'
  const lines = [
    `Selected card id: ${cleanPromptValue(card.id, 80)}`,
    `Selected card title: ${cleanPromptValue(card.title || card.id)}`,
    card.lane ? `Selected card lane: ${cleanPromptValue(card.lane, 80)}` : '',
    card.typeLabel ? `Selected card type: ${cleanPromptValue(card.typeLabel, 80)}` : '',
    card.summary ? `Selected card summary: ${cleanPromptValue(card.summary)}` : '',
    card.action ? `Selected card action: ${cleanPromptValue(card.action)}` : '',
    card.prompt ? `Selected card prompt: ${cleanPromptValue(card.prompt)}` : '',
  ].filter(Boolean)
  return [
    'Generate selectable Probe-Tree next-step cards from this selected card.',
    ...lines,
  ].join(' ')
}

export function buildProbeTreeCardFromGraphNode(node: GraphNode, inputIndex = 0): StoryboardCardModel {
  const properties = readGraphNodeProperties(node)
  const lane = cleanPromptValue(properties.lane || properties.stage || properties.status, 80) || STORYBOARD_EMPTY_LANE
  const typeLabel = cleanPromptValue(properties.cardTypeLabel || properties.typeLabel || properties.kind || node.type, 80) || 'Card'
  const order = readCardNumberProperty(properties, ['order', 'sort', 'sequence', 'index', 'rank'])
  return {
    id: readGraphIdentity(node.id),
    title: cleanPromptValue(readGraphNodeCardTitle(node), 160),
    summary: readCardTextProperty(properties, STORYBOARD_SUMMARY_PROPERTY_KEYS),
    output: readCardTextProperty(properties, STORYBOARD_OUTPUT_PROPERTY_KEYS),
    lane,
    lanePropertyKey: 'lane',
    typeLabel,
    indexLabel: cleanPromptValue(properties.index || properties.step || properties.position, 80),
    slugline: cleanPromptValue(properties.slugline, 180),
    action: readCardTextProperty(properties, STORYBOARD_ACTION_PROPERTY_KEYS),
    dialogue: cleanPromptValue(properties.dialogue || properties.voiceover || properties.narration, 320),
    prompt: readCardTextProperty(properties, STORYBOARD_PROMPT_PROPERTY_KEYS),
    style: cleanPromptValue(properties.style || properties.preset || properties.variant, 180),
    tags: readCardStringArrayProperty(properties.tags),
    meta: readCardStringArrayProperty(properties.meta),
    invocationTokens: readCardStringArrayProperty(properties.invocationTokens),
    sourceModelLabel: cleanPromptValue(properties.sourceModel || properties.modelLabel, 120),
    sourcePromptLabel: cleanPromptValue(properties.sourcePromptLabel || properties.promptLabel, 120),
    href: cleanPromptValue(properties.href || properties.url || properties.sourceUrl, 240),
    media: null,
    references: [],
    order,
    inputIndex,
    candidateScore: 0,
    structural: false,
  }
}

export function resolveProbeTreeCardMaterializationRequestText(card?: StoryboardCardModel | null): string {
  return [
    AGENTICGRAPH_PROBE_TREE_GENERATE_TOOL_NAME,
    buildSelectedCardPromptContext(card),
    'Return the AI/LLM response as `response.structuredContent.cards` so the canvas response projector can materialize editable branch cards for the user to select next steps.',
  ].join(' ')
}

export function revealProbeTreeBranchCardsOnCanvas(nodeIds: readonly string[]): void {
  const ids = Array.from(new Set(nodeIds.map(id => String(id || '').trim()).filter(Boolean)))
  if (ids.length === 0) return
  const store = useGraphStore.getState()
  disableAutoZoomModesForUserGesture(store)
  const nextPinnedById = seedMissingFlowWidgetPinnedByIds({
    pinnedById: store.flowWidgetPinnedByNodeId,
    nodeIds: ids,
    pinned: true,
  })
  if (nextPinnedById) store.setFlowWidgetPinnedByNodeId(nextPinnedById)
  store.selectNodesExpanded({ nodeIds: ids, activeNodeId: ids[0] })
}

export function materializeProbeTreeBranchCards(args: {
  graphData: GraphData | null | undefined
  card?: StoryboardCardModel | null
}): ProbeTreeBranchCardMaterializationResult {
  const invocationText = resolveProbeTreeCardMaterializationRequestText(args.card)
  if (!args.graphData || !args.card || !invocationText) {
    return {
      graphData: args.graphData || null,
      changed: false,
      kind: 'warning',
      message: 'Probe-Tree needs an active graph card.',
      materializedNodeIds: [],
      invocationText,
    }
  }

  const graphData = args.graphData
  const card = args.card
  const parent = (graphData.nodes || []).find(node => readGraphIdentity(node.id) === card.id) || null
  if (!parent) {
    return {
      graphData,
      changed: false,
      kind: 'warning',
      message: 'Probe-Tree could not resolve the selected card in the active graph.',
      materializedNodeIds: [],
      invocationText,
    }
  }

  const parentNodeId = readGraphIdentity(parent.id) || card.id
  const materializedNodeIds = (graphData.nodes || []).filter(node => {
    const properties = readGraphNodeProperties(node)
    return readGraphIdentity(properties.parentNodeId || properties.parentGraphNodeId) === parentNodeId
      && readGraphIdentity(properties.cardTypeLabel) === 'Probe-Tree Card'
      && readGraphIdentity(properties.probeTreeResponseMode) === 'llm-contract'
  }).map(node => readGraphIdentity(node.id)).filter(Boolean)
  const hasAcceptedCards = materializedNodeIds.length > 0

  return {
    graphData,
    changed: false,
    kind: hasAcceptedCards ? 'neutral' : 'warning',
    message: hasAcceptedCards
      ? 'Probe-Tree revealed the accepted model-backed branches for this card.'
      : 'Probe-Tree does not create hardcoded preview branches. Run the selected Widget Card to generate 2-4 context-specific branches.',
    materializedNodeIds,
    invocationText,
  }
}

export function materializeProbeTreeBranchCardsFromGraphNode(args: {
  graphData: GraphData | null | undefined
  node?: GraphNode | null
}): ProbeTreeBranchCardMaterializationResult {
  return materializeProbeTreeBranchCards({
    graphData: args.graphData,
    card: args.node ? buildProbeTreeCardFromGraphNode(args.node) : null,
  })
}

export function invokeProbeTreeFromStoryboardToolbar(args: {
  card?: StoryboardCardModel | null
  graphData: GraphData | null | undefined
  commitGraphData: (graphData: GraphData) => void
  addHistory: (label: string) => void
  upsertUiToast: (toast: UiToastInput) => void
}): ProbeTreeBranchCardMaterializationResult {
  disableAutoZoomModesForUserGesture(useGraphStore.getState())
  const result = materializeProbeTreeBranchCards({ graphData: args.graphData, card: args.card })
  if (result.changed && result.graphData) {
    args.commitGraphData(result.graphData)
    args.addHistory('Probe-Tree branch cards')
  }
  if (result.materializedNodeIds.length > 0) {
    revealProbeTreeBranchCardsOnCanvas(result.materializedNodeIds)
  }
  args.upsertUiToast({
    id: 'probe-tree:toolbar-materialize',
    kind: result.kind,
    message: result.message,
    dismissible: result.kind !== 'success',
    ttlMs: result.kind === 'success' ? 2600 : 4000,
  })
  return result
}
