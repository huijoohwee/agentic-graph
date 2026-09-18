import { unwrapKeyTypeValue } from '@/lib/graph/keyTypeValue'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import {
  FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID,
  FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config'
import { readFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'

export type FlowRunAllPhaseId = 'text' | 'imageFoundation' | 'imageScene' | 'annotation' | 'video'

export type FlowRunAllPhase = {
  id: FlowRunAllPhaseId
  label: string
}

export const FLOW_RUN_ALL_PHASES: readonly FlowRunAllPhase[] = [
  { id: 'text', label: 'Text' },
  { id: 'imageFoundation', label: 'Character + Location Image' },
  { id: 'imageScene', label: 'Scene Image' },
  { id: 'annotation', label: 'Annotation' },
  { id: 'video', label: 'Video' },
]

const SCENE_HINT_KEYWORDS = ['scene', 'shot', 's01', 's02', 's03', 's04']

function normalizeText(value: unknown): string {
  value = unwrapKeyTypeValue(value)
  return String(value || '').trim().toLowerCase()
}

function normalizeId(value: unknown): string {
  value = unwrapKeyTypeValue(value)
  return String(value || '').trim()
}

function classifyImageNodePhase(node: GraphNode): FlowRunAllPhaseId {
  const id = normalizeText(node.id)
  const label = normalizeText(node.label)
  const props = (node.properties || {}) as Record<string, unknown>
  const prompt = normalizeText(props.prompt)
  const haystack = `${id} ${label} ${prompt}`
  for (let i = 0; i < SCENE_HINT_KEYWORDS.length; i += 1) {
    if (haystack.includes(SCENE_HINT_KEYWORDS[i]!)) return 'imageScene'
  }
  return 'imageFoundation'
}

function classifyRunnablePhase(node: GraphNode): FlowRunAllPhaseId | null {
  if (readFlowComputeSource(node)) return 'text'
  const typeId = normalizeText(node.type)
  if (typeId === normalizeText(FLOW_TEXT_GENERATION_NODE_TYPE_ID)) return 'text'
  if (typeId === normalizeText(FLOW_IMAGE_GENERATION_NODE_TYPE_ID)) return classifyImageNodePhase(node)
  if (typeId === normalizeText(FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID)) return 'annotation'
  if (typeId === normalizeText(FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID)) return 'video'
  if (typeId === normalizeText(FLOW_VIDEO_GENERATION_NODE_TYPE_ID)) return 'video'
  return null
}

function readSortableCoordinate(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function compareNodesStable(a: GraphNode, b: GraphNode): number {
  const ay = readSortableCoordinate(a.y)
  const by = readSortableCoordinate(b.y)
  if (ay !== by) return ay - by
  const ax = readSortableCoordinate(a.x)
  const bx = readSortableCoordinate(b.x)
  if (ax !== bx) return ax - bx
  return String(a.id || '').localeCompare(String(b.id || ''))
}

function buildAdjacency(edges: ReadonlyArray<GraphEdge>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i]
    const source = normalizeId((e as { source?: unknown }).source)
    const target = normalizeId((e as { target?: unknown }).target)
    if (!source || !target) continue
    if (!out.has(source)) out.set(source, new Set())
    out.get(source)!.add(target)
  }
  return out
}

export function buildFlowRunAllNodeSequence(args: {
  graphData: GraphData
  eligibleNodeIds: ReadonlySet<string>
}): { orderedNodeIds: string[]; phaseCounts: Record<FlowRunAllPhaseId, number> } {
  const nodes = Array.isArray(args.graphData.nodes) ? (args.graphData.nodes as GraphNode[]) : []
  const edges = Array.isArray(args.graphData.edges) ? (args.graphData.edges as GraphEdge[]) : []
  const eligible = args.eligibleNodeIds
  const adjacency = buildAdjacency(edges)

  const phaseBuckets: Record<FlowRunAllPhaseId, GraphNode[]> = {
    text: [],
    imageFoundation: [],
    imageScene: [],
    annotation: [],
    video: [],
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const id = normalizeId(node?.id)
    if (!id || !eligible.has(id)) continue
    if (normalizeId(node?.type) === 'Section') continue
    const phase = classifyRunnablePhase(node)
    if (!phase) continue
    phaseBuckets[phase].push(node)
  }

  for (const phase of FLOW_RUN_ALL_PHASES) {
    phaseBuckets[phase.id].sort(compareNodesStable)
  }

  // Keep scene images before video, but prioritize any image feeding a video reference edge.
  if (phaseBuckets.video.length > 0 && phaseBuckets.imageScene.length > 1) {
    const imageFeedsVideo = new Set<string>()
    for (let i = 0; i < phaseBuckets.imageScene.length; i += 1) {
      const nodeId = normalizeId(phaseBuckets.imageScene[i]?.id)
      if (!nodeId) continue
      const targets = adjacency.get(nodeId)
      if (!targets || targets.size === 0) continue
      for (const target of targets.values()) {
        const targetNode = nodes.find(n => normalizeId(n?.id) === target)
        if (!targetNode) continue
        if (normalizeText(targetNode.type) === normalizeText(FLOW_VIDEO_GENERATION_NODE_TYPE_ID)) {
          imageFeedsVideo.add(nodeId)
          break
        }
      }
    }
    phaseBuckets.imageScene.sort((a, b) => {
      const aFeeds = imageFeedsVideo.has(String(a.id || '').trim()) ? 0 : 1
      const bFeeds = imageFeedsVideo.has(String(b.id || '').trim()) ? 0 : 1
      if (aFeeds !== bFeeds) return aFeeds - bFeeds
      return compareNodesStable(a, b)
    })
  }

  const orderedNodeIds: string[] = []
  for (const phase of FLOW_RUN_ALL_PHASES) {
    const bucket = phaseBuckets[phase.id]
    for (let i = 0; i < bucket.length; i += 1) {
      const id = normalizeId(bucket[i]?.id)
      if (!id) continue
      orderedNodeIds.push(id)
    }
  }

  return {
    orderedNodeIds,
    phaseCounts: {
      text: phaseBuckets.text.length,
      imageFoundation: phaseBuckets.imageFoundation.length,
      imageScene: phaseBuckets.imageScene.length,
      annotation: phaseBuckets.annotation.length,
      video: phaseBuckets.video.length,
    },
  }
}
