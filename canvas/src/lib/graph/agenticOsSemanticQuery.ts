import type { GraphData } from '@/lib/graph/types'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'

const clean = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

const norm = (value: unknown): string => clean(value).toLowerCase()

const readNodes = (graphData: GraphData | null | undefined) => Array.isArray(graphData?.nodes) ? graphData.nodes : []

const readEdges = (graphData: GraphData | null | undefined) => Array.isArray(graphData?.edges) ? graphData.edges : []

const readNodeType = (node: GraphData['nodes'][number]): string => {
  const props = node?.properties || {}
  return clean(props['agentic-os:nodeType']) || clean(node?.type)
}

const buildDirectedAdjacency = (graphData: GraphData | null | undefined): Map<string, string[]> => {
  const nodeIds = new Set(readNodes(graphData).map(node => clean(node?.id)).filter(Boolean))
  const out = new Map<string, string[]>()
  nodeIds.forEach(id => out.set(id, []))
  for (const edge of readEdges(graphData)) {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    const source = clean(src)
    const target = clean(tgt)
    if (!source || !target) continue
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue
    const list = out.get(source) || []
    list.push(target)
    out.set(source, list)
  }
  for (const [key, value] of out.entries()) {
    out.set(key, Array.from(new Set(value)).sort((a, b) => a.localeCompare(b)))
  }
  return out
}

const reverseAdjacency = (adjacency: Map<string, string[]>): Map<string, string[]> => {
  const out = new Map<string, string[]>()
  for (const id of adjacency.keys()) out.set(id, [])
  for (const [source, targets] of adjacency.entries()) {
    for (const target of targets) {
      const list = out.get(target) || []
      list.push(source)
      out.set(target, list)
    }
  }
  for (const [key, value] of out.entries()) {
    out.set(key, Array.from(new Set(value)).sort((a, b) => a.localeCompare(b)))
  }
  return out
}

export function bfsAgenticOsSemanticPath(args: {
  graphData: GraphData | null | undefined
  startId: string
  endId: string
  maxDepth?: number
}): string[] {
  const startId = clean(args.startId)
  const endId = clean(args.endId)
  if (!startId || !endId) return []
  if (startId === endId) return [startId]
  const adjacency = buildDirectedAdjacency(args.graphData)
  if (!adjacency.has(startId) || !adjacency.has(endId)) return []
  const maxDepth = Number.isFinite(args.maxDepth) ? Math.max(1, Math.min(1000, Math.floor(Number(args.maxDepth)))) : 256
  const visited = new Set<string>([startId])
  const queue: Array<{ id: string; path: string[]; depth: number }> = [{ id: startId, path: [startId], depth: 0 }]
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!
    if (current.depth >= maxDepth) continue
    const nextIds = adjacency.get(current.id) || []
    for (let j = 0; j < nextIds.length; j += 1) {
      const nextId = nextIds[j]!
      if (visited.has(nextId)) continue
      const nextPath = [...current.path, nextId]
      if (nextId === endId) return nextPath
      visited.add(nextId)
      queue.push({ id: nextId, path: nextPath, depth: current.depth + 1 })
    }
  }
  return []
}

export function filterAgenticOsSemanticNodeIdsByType(args: {
  graphData: GraphData | null | undefined
  type: string
}): string[] {
  const type = norm(args.type)
  if (!type) return []
  return readNodes(args.graphData)
    .filter(node => norm(readNodeType(node)) === type)
    .map(node => clean(node.id))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

export function searchAgenticOsSemanticNodeIds(args: {
  graphData: GraphData | null | undefined
  term: string
}): string[] {
  const term = norm(args.term)
  if (!term) return []
  return readNodes(args.graphData)
    .filter(node => {
      const props = node?.properties || {}
      const haystack = [
        node?.id,
        node?.label,
        node?.type,
        props['agentic-os:nodeType'],
        props.desc,
        props.description,
      ].map(norm).join('\n')
      return haystack.includes(term)
    })
    .map(node => clean(node.id))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function traverseAgenticOsSemanticNodeIds(args: {
  graphData: GraphData | null | undefined
  nodeId: string
  direction: 'ancestors' | 'descendants'
  maxDepth?: number
}): string[] {
  const nodeId = clean(args.nodeId)
  if (!nodeId) return []
  const adjacency = args.direction === 'ancestors'
    ? reverseAdjacency(buildDirectedAdjacency(args.graphData))
    : buildDirectedAdjacency(args.graphData)
  if (!adjacency.has(nodeId)) return []
  const maxDepth = Number.isFinite(args.maxDepth) ? Math.max(1, Math.min(1000, Math.floor(Number(args.maxDepth)))) : 20
  const visited = new Set<string>([nodeId])
  const out: string[] = []
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }]
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!
    if (current.depth >= maxDepth) continue
    const nextIds = adjacency.get(current.id) || []
    for (let j = 0; j < nextIds.length; j += 1) {
      const nextId = nextIds[j]!
      if (visited.has(nextId)) continue
      visited.add(nextId)
      out.push(nextId)
      queue.push({ id: nextId, depth: current.depth + 1 })
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

export function ancestorsAgenticOsSemanticNodeIds(args: {
  graphData: GraphData | null | undefined
  nodeId: string
  maxDepth?: number
}): string[] {
  return traverseAgenticOsSemanticNodeIds({ ...args, direction: 'ancestors' })
}

export function descendantsAgenticOsSemanticNodeIds(args: {
  graphData: GraphData | null | undefined
  nodeId: string
  maxDepth?: number
}): string[] {
  return traverseAgenticOsSemanticNodeIds({ ...args, direction: 'descendants' })
}
