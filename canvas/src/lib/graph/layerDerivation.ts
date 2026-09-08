import { readEdgeEndpointId } from '@/lib/graph/edgeEndpoints'
import { readNodeProperties } from '@/lib/graph/nodeProperties'
import { isPlainObject } from '@/lib/graph/value'
import type { GraphData, GraphNode } from './types'

const FLOW_WIDGET_FORM_ID_KEY = 'flow:widgetFormId' as const
const FLOW_PORT_TYPES_KEY = 'flow:portTypes' as const
const FLOW_EDGE_SOURCE_PORT_KEY = 'flow:sourcePortKey' as const
const FLOW_EDGE_TARGET_PORT_KEY = 'flow:targetPortKey' as const

const isFrontmatterMermaidNode = (n: { properties?: unknown } | null | undefined): boolean => {
  if (!n) return false
  const p = readNodeProperties(n as Pick<GraphNode, 'properties'> | null | undefined)
  return p.isMermaidFrontmatter === true || p.mermaidScope === 'frontmatter'
}

const isFrontmatterMermaidScopedNode = (n: GraphNode | null | undefined): boolean => {
  if (!n) return false
  if (isFrontmatterMermaidNode(n)) return true
  const type = String((n as { type?: unknown }).type || '')
  return type === 'MermaidDiagram' || type === 'MermaidNode' || type === 'MermaidSubgraph'
}

export const hasFrontmatterMermaidSeeds = (data: GraphData): boolean => {
  const nodes = Array.isArray(data.nodes) ? data.nodes : []
  for (let i = 0; i < nodes.length; i += 1) {
    if (isFrontmatterMermaidNode(nodes[i])) return true
  }
  return false
}

export const filterGraphToFrontmatterMermaid = (data: GraphData): GraphData => {
  const allNodes = data.nodes || []
  const allEdges = data.edges || []

  const seedIds: string[] = []
  for (let i = 0; i < allNodes.length; i += 1) {
    const n = allNodes[i]
    const id = String(n?.id || '').trim()
    if (!id) continue
    if (isFrontmatterMermaidNode(n)) seedIds.push(id)
  }

  if (seedIds.length === 0) return data

  const nodeById = new Map(allNodes.map(n => [String(n.id), n]))

  const included = new Set<string>()
  const addId = (id: string) => {
    const nid = String(id || '').trim()
    if (!nid) return false
    if (included.has(nid)) return false
    if (!nodeById.has(nid)) return false
    included.add(nid)
    return true
  }

  for (let i = 0; i < seedIds.length; i += 1) addId(seedIds[i] as string)

  const parentQueue = Array.from(included)
  let parentQi = 0
  while (parentQi < parentQueue.length) {
    const id = parentQueue[parentQi] as string
    parentQi += 1
    const n = nodeById.get(id)
    if (!n) continue
    const props = readNodeProperties(n)
    const parentId = typeof props['visual:parentId'] === 'string' ? String(props['visual:parentId'] || '').trim() : ''
    const topParentId = typeof props['visual:topParentId'] === 'string' ? String(props['visual:topParentId'] || '').trim() : ''
    if (parentId && addId(parentId)) parentQueue.push(parentId)
    if (topParentId && addId(topParentId)) parentQueue.push(topParentId)
  }

  const neighborsById = new Map<string, string[]>()
  const edgeEndpoints = allEdges.map(edge => {
    const source = readEdgeEndpointId(edge.source)
    const target = readEdgeEndpointId(edge.target)
    if (source && target) {
      const sourceNeighbors = neighborsById.get(source) || []
      sourceNeighbors.push(target)
      neighborsById.set(source, sourceNeighbors)
      const targetNeighbors = neighborsById.get(target) || []
      targetNeighbors.push(source)
      neighborsById.set(target, targetNeighbors)
    }
    return { edge, source, target }
  })
  const reachableQueue = Array.from(included)
  for (let i = 0; i < reachableQueue.length; i += 1) {
    for (const nextId of neighborsById.get(reachableQueue[i]!) || []) {
      if (isFrontmatterMermaidScopedNode(nodeById.get(nextId)) && addId(nextId)) reachableQueue.push(nextId)
    }
  }

  const nodes = allNodes.filter(n => included.has(String(n.id)))
  const edges = edgeEndpoints.filter(({ source, target }) => (
    source && target && included.has(source) && included.has(target)
  )).map(({ edge }) => edge)

  return { ...data, nodes, edges }
}

function isFlowNode(n: unknown): boolean {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return false
  const props = readNodeProperties(n as Pick<GraphNode, 'properties'> | null | undefined)
  const form = props[FLOW_WIDGET_FORM_ID_KEY]
  if (typeof form === 'string' && form.trim()) return true
  const portTypes = props[FLOW_PORT_TYPES_KEY]
  if (isPlainObject(portTypes)) return true
  return false
}

function isFlowEdge(e: unknown): boolean {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false
  const props = (e as { properties?: unknown }).properties
  if (!isPlainObject(props)) return false
  const s = props[FLOW_EDGE_SOURCE_PORT_KEY]
  const t = props[FLOW_EDGE_TARGET_PORT_KEY]
  return (typeof s === 'string' && s.trim().length > 0) || (typeof t === 'string' && t.trim().length > 0)
}

export const filterGraphToFrontmatterFlow = (data: GraphData): GraphData => {
  const allNodes = Array.isArray(data.nodes) ? data.nodes : []
  const allEdges = Array.isArray(data.edges) ? data.edges : []

  const included = new Set<string>()
  for (let i = 0; i < allNodes.length; i += 1) {
    const n = allNodes[i]
    const id = String((n as { id?: unknown })?.id || '').trim()
    if (!id) continue
    if (isFlowNode(n)) included.add(id)
  }

  for (let i = 0; i < allEdges.length; i += 1) {
    const e = allEdges[i]
    if (!isFlowEdge(e)) continue
    const src = readEdgeEndpointId((e as { source?: unknown }).source)
    const tgt = readEdgeEndpointId((e as { target?: unknown }).target)
    if (src) included.add(src)
    if (tgt) included.add(tgt)
  }

  if (included.size === 0) return data

  const nodes = allNodes.filter(n => included.has(String((n as { id?: unknown })?.id || '').trim()))
  const edges = allEdges.filter(e => {
    const src = readEdgeEndpointId((e as { source?: unknown }).source)
    const tgt = readEdgeEndpointId((e as { target?: unknown }).target)
    return src && tgt && included.has(src) && included.has(tgt)
  })

  return { ...data, nodes, edges }
}
