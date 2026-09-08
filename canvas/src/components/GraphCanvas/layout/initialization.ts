
import { GraphNode, GraphEdge } from '@/lib/graph/types'
import { GraphSchema } from '@/lib/graph/schema'
import { applyForceModeSeeds } from '@/components/GraphCanvas/layout/seeding'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { postFitNodesToViewport } from '@/components/GraphCanvas/layout/postFit'
import { applyCollectiveGraphLayout } from '@/components/GraphCanvas/layout/collectiveFit'
import { buildNodeNeighborSetFromIncidentEdges } from '@/components/GraphCanvas/layout/graphConnectivity'
import { readFitPadding } from '@/lib/graph/layoutDefaults'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { measureGraphElementCenterSet } from '@/lib/canvas/graph-elements/centroid'

import { hasFiniteXY, hash01, isFiniteNumber, seedMissingNodePositions } from './initializationSeeds'
export { seedMissingNodePositions } from './initializationSeeds'

const isFixedNode = (n: GraphNode): boolean => {
  const fx = (n as unknown as { fx?: unknown }).fx
  const fy = (n as unknown as { fy?: unknown }).fy
  return isFiniteNumber(fx) || isFiniteNumber(fy)
}

export const normalizeSeededLayoutToViewport = (args: { nodes: GraphNode[]; width: number; height: number; viewportCenter?: { x: number; y: number } | null }) => {
  const { nodes, width, height } = args
  if (!nodes || nodes.length < 2) return

  const metrics = measureGraphElementCenterSet(nodes, { fallbackToFixedPosition: false })
  if (!metrics || metrics.count < 2) return
  const spanX = Math.max(1e-6, metrics.maxX - metrics.minX)
  const spanY = Math.max(1e-6, metrics.maxY - metrics.minY)
  const targetW = Math.max(1, width - 80)
  const targetH = Math.max(1, height - 80)
  const sx = targetW / spanX
  const sy = targetH / spanY
  const scale = Math.min(sx, sy)

  const tooLarge = spanX > width * 1.6 || spanY > height * 1.6
  const tooSmall = spanX < width * 0.22 && spanY < height * 0.22
  const cx = metrics.centroidX
  const cy = metrics.centroidY
  const tx = args.viewportCenter ? args.viewportCenter.x : width / 2
  const ty = args.viewportCenter ? args.viewportCenter.y : height / 2
  const translateDist = Math.hypot(cx - tx, cy - ty)
  const needsRecenter = translateDist > Math.max(width, height) * 0.26

  if (!tooLarge && !tooSmall && !needsRecenter) return

  const desired = tooLarge
    ? Math.max(0.52, Math.min(0.92, scale))
    : tooSmall
      ? Math.min(1.35, Math.max(1.05, scale))
      : 1
  if (!Number.isFinite(desired) || desired <= 0) return
  if (!needsRecenter && Math.abs(desired - 1) < 0.02) return
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    if (!hasFiniteXY(n)) continue
    const x = n.x as number
    const y = n.y as number
    n.x = tx + (x - cx) * desired
    n.y = ty + (y - cy) * desired
    n.vx = 0
    n.vy = 0
  }
}

export const distributeComponents = (nodes: GraphNode[], edges: GraphEdge[], width: number, height: number, schema: GraphSchema) => {
  applyCollectiveGraphLayout({ nodes, edges, width, height, schema })
}

export const initializeGraphLayout = (args: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
  schema: GraphSchema
  seedCenter?: { x: number; y: number } | null
  groupKeyOf?: (n: GraphNode) => string | null
  layoutPositions?: Record<string, { x: number; y: number }> | null
  groupsForBboxCollide?: GraphGroup[]
}) => {
  const { nodes, edges, width, height, schema, seedCenter, groupKeyOf, layoutPositions } = args

  const postFitEnabled = schema.layout?.forces?.postFitForce === true

  if (!nodes || nodes.length < 2) return

  const needsRepair = (): boolean => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let valid = 0
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!
      if (!hasFiniteXY(n)) continue
      const x = n.x as number
      const y = n.y as number
      valid += 1
      if (Math.abs(x) > 120000 || Math.abs(y) > 120000) return true
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    if (valid < 2 || minX === Infinity) return false
    const spanX = maxX - minX
    const spanY = maxY - minY
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    const ratio = Math.max(spanX / Math.max(1e-6, spanY), spanY / Math.max(1e-6, spanX))
    const tooFlat = ratio > 12 && Math.max(spanX, spanY) > Math.max(w, h) * 1.5
    const tooLarge = spanX > w * 6 || spanY > h * 6
    return tooFlat || tooLarge
  }

  if (layoutPositions) {
    let applied = 0
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const id = String(n.id)
      const pos = layoutPositions[id]
      if (!pos) continue
      n.x = pos.x
      n.y = pos.y
      n.vx = 0
      n.vy = 0
      applied += 1
    }

    if (applied >= 3 && applied / Math.max(1, nodes.length) >= 0.2) {
      seedMissingNodePositions(nodes, width, height, seedCenter)
      return
    }

    if (applied >= nodes.length * 0.8) {
      seedMissingNodePositions(nodes, width, height, seedCenter)
      return
    }
  }

  let missing = 0
  for (let i = 0; i < nodes.length; i += 1) {
    if (!hasFiniteXY(nodes[i]!)) missing += 1
  }

  // A stable partial layout is reusable even below the cache coverage threshold.
  if (missing > 0 && missing < nodes.length && !needsRepair()) {
    seedMissingNodePositions(nodes, width, height, seedCenter)
    return
  }

  const disjointForceMode = schema.layout?.forces?.disjointComponents !== false
  if (disjointForceMode) {
    const repair = needsRepair()
    if (repair || missing > 0) {
      applyForceModeSeeds({
        nodes,
        edges,
        width,
        height,
        schema,
        groupKeyOf,
        groupsForBboxCollide: Array.isArray(args.groupsForBboxCollide) ? args.groupsForBboxCollide : [],
      })
    }
    if (missing > 0) seedMissingNodePositions(nodes, width, height, seedCenter)
    return
  }

  const repair = needsRepair()
  if (!repair) {
    if (missing === 0) {
      return
    }
    seedMissingNodePositions(nodes, width, height, seedCenter)
    if (missing < nodes.length) {
      return
    }
  }

  applyForceModeSeeds({
    nodes,
    edges,
    width,
    height,
    schema,
    groupKeyOf,
    groupsForBboxCollide: Array.isArray(args.groupsForBboxCollide) ? args.groupsForBboxCollide : [],
  })
  seedMissingNodePositions(nodes, width, height, seedCenter)

  applyCollectiveGraphLayout({ nodes, edges, width, height, schema })

  const padPx = Math.max(24, Math.floor(readFitPadding(schema)))
  if (postFitEnabled) {
    postFitNodesToViewport({
      nodes,
      width: Math.max(1, width),
      height: Math.max(1, Math.floor(height)),
      paddingPx: padPx,
      minScale: 0.06,
      maxScale: 2.2,
      viewportCenter: seedCenter || undefined,
    })
  }
}

const getInitializationGraphLookup = (args: {
  cacheScope: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}) => {
  const { cacheScope, nodes, edges } = args
  return getCachedGraphLookup({
    cacheScope,
    graphData: { type: 'application/json', nodes, edges },
    graphSemanticKey: buildScopedGraphSemanticKey(cacheScope, {
      graphData: { type: 'application/json', nodes, edges },
      graphSemanticKey: [
        ...nodes.map(node => {
          const id = String(node?.id || '').trim()
          const x = typeof node?.x === 'number' && Number.isFinite(node.x) ? node.x : ''
          const y = typeof node?.y === 'number' && Number.isFinite(node.y) ? node.y : ''
          return `${id}:${String(node?.type || '').trim()}:${x}:${y}`
        }),
        ...edges.map(edge => {
          const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(edge)
          return `${String(edge?.id || '').trim()}:${sourceId}:${targetId}:${String(edge?.label || '').trim()}`
        }),
      ].join('\n'),
    }),
  })
}

export const applyBaselineDocumentPositionsToKeywordGraph = (args: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  baseline: Record<string, { x: number; y: number }>
  overwriteExisting?: boolean
}) => {
  const { nodes, edges, baseline } = args
  if (!nodes || nodes.length === 0) return
  if (!baseline || Object.keys(baseline).length === 0) return
  const overwriteExisting = args.overwriteExisting === true

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    if (isFixedNode(n)) continue
    if (!overwriteExisting && hasFiniteXY(n)) continue
    const id = String(n.id || '').trim()
    if (!id) continue

    const direct = baseline[id]
    if (direct) {
      n.x = direct.x
      n.y = direct.y
      n.vx = 0
      n.vy = 0
      if (!isFixedNode(n)) {
        n.fx = null
        n.fy = null
      }
      continue
    }

    if (!id.startsWith('doc:')) continue
    const props = (n.properties || {}) as Record<string, unknown>
    const srcId = typeof props['source:id'] === 'string' ? props['source:id'].trim() : ''
    if (!srcId) continue
    const p = baseline[srcId]
    if (!p) continue
    n.x = p.x
    n.y = p.y
    n.vx = 0
    n.vy = 0
    if (!isFixedNode(n)) {
      n.fx = null
      n.fy = null
    }
  }

  const graphLookup = getInitializationGraphLookup({
    cacheScope: 'graph-canvas-layout-baseline-keyword-graph',
    nodes,
    edges,
  })
  const nodeById = graphLookup?.nodeById || new Map<string, GraphNode>()
  const incidentEdgesByNodeId = graphLookup?.incidentEdgesByNodeId || new Map<string, GraphEdge[]>()
  const neighborIdsByNodeId = buildNodeNeighborSetFromIncidentEdges({
    nodes,
    nodeById,
    incidentEdgesByNodeId,
  })

  const jitter = (id: string, mag: number) => {
    const a = hash01(`${id}:a`) * Math.PI * 2
    const r = (0.4 + 0.6 * hash01(`${id}:r`)) * mag
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r }
  }

  for (let pass = 0; pass < 3; pass += 1) {
    let placed = 0
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!
      if (hasFiniteXY(n)) continue
      const id = String(n.id || '').trim()
      if (!id) continue
      const neigh = neighborIdsByNodeId.get(id)
      if (!neigh || neigh.size === 0) continue
      let sx = 0
      let sy = 0
      let c = 0
      neigh.forEach(nid => {
        const nn = nodeById.get(nid)
        if (!nn || !hasFiniteXY(nn)) return
        sx += nn.x as number
        sy += nn.y as number
        c += 1
      })
      if (c === 0) continue
      const j = jitter(id, 42 + pass * 22)
      n.x = sx / c + j.dx
      n.y = sy / c + j.dy
      n.vx = 0
      n.vy = 0
      if (!isFixedNode(n)) {
        n.fx = null
        n.fy = null
      }
      placed += 1
    }
    if (placed === 0) break
  }
}

export const seedKeywordEntityNodesFromBaselineSources = (args: {
  keywordNodes: GraphNode[]
  allNodes: GraphNode[]
  allEdges: GraphEdge[]
  baseline: Record<string, { x: number; y: number }>
  overwriteExisting: boolean
}) => {
  const { keywordNodes, allNodes, allEdges, baseline, overwriteExisting } = args
  if (!keywordNodes.length) return
  if (!allNodes.length) return
  if (!allEdges.length) return
  if (!baseline || Object.keys(baseline).length === 0) return

  const graphLookup = getInitializationGraphLookup({
    cacheScope: 'graph-canvas-layout-keyword-source-baseline',
    nodes: allNodes,
    edges: allEdges,
  })
  const nodeById = graphLookup?.nodeById || new Map<string, GraphNode>()

  for (let i = 0; i < allNodes.length; i += 1) {
    const n = allNodes[i]!
    const id = String(n.id || '').trim()
    if (!id.startsWith('doc:')) continue
    const props = (n.properties || {}) as Record<string, unknown>
    const srcId = typeof props['source:id'] === 'string' ? props['source:id'].trim() : ''
    if (!srcId) continue
    const p = baseline[srcId]
    if (!p) continue
    n.x = p.x
    n.y = p.y
    n.vx = 0
    n.vy = 0
    if (!isFixedNode(n)) {
      n.fx = null
      n.fy = null
    }
  }

  const sourceIdsByKeywordId = (() => {
    const map = new Map<string, string[]>()
    const push = (kwId: string, docId: string) => {
      if (!kwId || !docId) return
      const arr = map.get(kwId) || []
      if (arr.includes(docId)) return
      arr.push(docId)
      map.set(kwId, arr)
    }
    for (let i = 0; i < allEdges.length; i += 1) {
      const e = allEdges[i] as unknown as { label?: unknown; source?: unknown; target?: unknown; properties?: unknown }
      if (!e) continue
      if (String(e.label || '') !== 'mentions') continue
      const { src: s, tgt: t } = readGraphEdgeEndpoints(e)
      if (!s || !t) continue
      if (!s.startsWith('doc:')) continue
      if (!t.startsWith('kw:')) continue
      push(t, s)
    }
    return map
  })()

  const jitter = (id: string, mag: number) => {
    const a = hash01(`${id}:kwseed:a`) * Math.PI * 2
    const r = (0.25 + 0.75 * hash01(`${id}:kwseed:r`)) * mag
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r }
  }

  for (let i = 0; i < keywordNodes.length; i += 1) {
    const n = keywordNodes[i]!
    if (isFixedNode(n)) continue
    if (!overwriteExisting && hasFiniteXY(n)) continue
    const id = String(n.id || '').trim()
    if (!id.startsWith('kw:')) continue
    const srcs = sourceIdsByKeywordId.get(id)
    if (!srcs || srcs.length === 0) continue

    let sx = 0
    let sy = 0
    let c = 0
    for (let j = 0; j < srcs.length; j += 1) {
      const docId = srcs[j]!
      const dn = nodeById.get(docId)
      if (!dn || !hasFiniteXY(dn)) continue
      sx += dn.x as number
      sy += dn.y as number
      c += 1
    }
    if (c === 0) continue

    const j = jitter(id, 46)
    n.x = sx / c + j.dx
    n.y = sy / c + j.dy
    n.vx = 0
    n.vy = 0
    if (!isFixedNode(n)) {
      n.fx = null
      n.fy = null
    }
  }
}

export const layoutLooksUnstableForViewport = (args: {
  nodes: GraphNode[]
  width: number
  height: number
  viewportCenter?: { x: number; y: number } | null
}): boolean => {
  const { nodes, width, height } = args
  if (!nodes || nodes.length < 2) return false

  const metrics = measureGraphElementCenterSet(nodes, { fallbackToFixedPosition: false })
  const valid = metrics?.count || 0
  let extreme = 0
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    if (!hasFiniteXY(n)) continue
    const x = n.x as number
    const y = n.y as number
    if (Math.abs(x) > 120000 || Math.abs(y) > 120000) extreme += 1
  }
  if (!metrics || valid < 2) return false
  if (extreme > 0) return true

  const spanX = metrics.maxX - metrics.minX
  const spanY = metrics.maxY - metrics.minY
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const ratio = Math.max(spanX / Math.max(1e-6, spanY), spanY / Math.max(1e-6, spanX))
  const tooFlat = ratio > 12 && Math.max(spanX, spanY) > Math.max(w, h) * 1.5
  const tooLarge = spanX > w * 6 || spanY > h * 6
  const tooSmall = spanX < Math.max(90, w * 0.12) && spanY < Math.max(90, h * 0.12)

  const cx = metrics.centroidX
  const cy = metrics.centroidY
  const tx = args.viewportCenter ? args.viewportCenter.x : w / 2
  const ty = args.viewportCenter ? args.viewportCenter.y : h / 2
  const dist = Math.hypot(cx - tx, cy - ty)
  const offCenter = dist > Math.max(w, h) * 0.42

  const bboxArea = Math.max(1e-6, spanX * spanY)
  const viewportArea = Math.max(1, w * h)
  const coverage = bboxArea / viewportArea
  const tooClustered = coverage < 0.014 && Math.max(spanX, spanY) < Math.max(w, h) * 0.45
  const tooLiney = ratio > 14 && Math.max(spanX, spanY) < Math.max(w, h) * 0.7

  return tooLarge || tooSmall || tooFlat || offCenter || tooClustered || tooLiney
}
