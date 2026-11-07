import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '@/lib/graph/types';
import { GraphSchema } from '@/lib/graph/schema';
import { applyRadialClusterLayout } from './layout/radial';
import { applyForceModeSeeds } from './layout/seeding';
import { readMermaidAxisFromNodes } from './layout/mermaidDirection';
import { getNodeCollisionRadius, type NodeHalfExtents } from './layout/overlap';
import { createGroupBboxCollideForce } from './layout/groupOverlap';
import { createGroupBboxCollideForceByDepth } from './layout/groupOverlapByDepth';
import { createGroupKeyOfNode, type GroupKeyOfNode } from './layout/grouping';
import { readCollisionConfig } from './layout/collisionConfig';
import { readLayoutMode } from './layout/fitConfig';
import {
  DEFAULT_CENTER_STRENGTH,
  DEFAULT_DISJOINT_MIN_BASE_STRENGTH,
  DEFAULT_DISJOINT_STRENGTH,
  readForceLinkDistance,
} from '@/lib/graph/layoutDefaults';
import { detectKeywordGraph } from '@/components/GraphCanvas/layout/graphKind'
import { ZOOM_VIEWPORT_PRESET_16_9 } from 'grph-shared/zoom/presets';
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes';
import {
  clampCollideRadius2d,
  computeChargeDistanceMin2d,
  computeChargeStrength2d,
  computeBboxCollideIterations2d,
  computeBboxCollideStrength2d,
  computeCollideRadiusMax2d,
  computeCollideStrength2d,
  computeGroupBboxCollideIterations2d,
  computeGroupBboxCollideStrength2d,
  computeIdealSpacing2d,
  computeVelocityDecay2d,
  readPhysics2dTuning,
} from '@/lib/graph/physics2dTuning'
import { isRadarFlowEdge, isRadarGraph as detectRadarGraph, isRadarSpokeEdge, readRadarForceConfig } from '@/lib/graph/radarForces'
import { readFlowchartGridSizePx, readFlowchartLaneSeparationPx } from '@/lib/canvas/flowchartGrid'
import { snapScalarToGrid } from '@/lib/canvas/gridSnap'
import { createLayoutBboxForce2d, panelBoundsKey2d } from './layout/panelLayout2d'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'

export type EdgeWithRuntime = GraphEdge & {
  source?: GraphEdge['source'];
  target?: GraphEdge['target'];
}

export const getEdgeEndpoints = (edge: EdgeWithRuntime): { src: string | null; tgt: string | null } =>
  readGraphEdgeEndpoints(edge)

export const normalizeEdgesForSim = (nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] => {
  const nodeIds = new Set<string>((nodes || []).map(n => String(n.id)));
  const out: GraphEdge[] = [];
  for (const e of edges || []) {
    const { src: source, tgt: target } = readGraphEdgeEndpoints(e)
    if (!source || !target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    out.push({ ...e, source, target });
  }
  return out;
};

const updateManyBodyForce = (args: {
  simulation: d3.Simulation<GraphNode, GraphEdge>
  name: string
  strength: number
  distanceMin?: number
  distanceMax: number
}) => {
  const raw = args.simulation.force(args.name) as unknown
  const f =
    raw && typeof raw === 'function' && typeof (raw as { strength?: unknown }).strength === 'function'
      ? (raw as unknown as d3.ForceManyBody<GraphNode>)
      : null
  if (!f) {
    const distMin =
      typeof args.distanceMin === 'number' && Number.isFinite(args.distanceMin) && args.distanceMin > 0 ? args.distanceMin : 1
    args.simulation.force(
      args.name,
      d3.forceManyBody<GraphNode>().strength(args.strength).distanceMin(distMin).distanceMax(args.distanceMax),
    )
    return
  }
  f.strength(args.strength)
  try {
    const distMin = args.distanceMin
    if (typeof distMin === 'number' && Number.isFinite(distMin) && distMin > 0) {
      ;(f as unknown as { distanceMin?: (v: number) => unknown }).distanceMin?.(distMin)
    }
  } catch {
    void 0
  }
  f.distanceMax(args.distanceMax)
}

const updateManyBodyForceByNode = (args: {
  simulation: d3.Simulation<GraphNode, GraphEdge>
  name: string
  strength: (d: GraphNode) => number
  distanceMin?: number
  distanceMax: number
}) => {
  const raw = args.simulation.force(args.name) as unknown
  const f =
    raw && typeof raw === 'function' && typeof (raw as { strength?: unknown }).strength === 'function'
      ? (raw as unknown as d3.ForceManyBody<GraphNode>)
      : null
  if (!f) {
    const distMin =
      typeof args.distanceMin === 'number' && Number.isFinite(args.distanceMin) && args.distanceMin > 0 ? args.distanceMin : 1
    args.simulation.force(
      args.name,
      d3.forceManyBody<GraphNode>().strength(args.strength).distanceMin(distMin).distanceMax(args.distanceMax),
    )
    return
  }
  f.strength(args.strength)
  try {
    const distMin = args.distanceMin
    if (typeof distMin === 'number' && Number.isFinite(distMin) && distMin > 0) {
      ;(f as unknown as { distanceMin?: (v: number) => unknown }).distanceMin?.(distMin)
    }
  } catch {
    void 0
  }
  f.distanceMax(args.distanceMax)
}

const updatePositioningForce = (args: {
  simulation: d3.Simulation<GraphNode, GraphEdge>
  name: string
  axis: 'x' | 'y'
  target: number
  strength: number
}) => {
  const raw = args.simulation.force(args.name) as unknown
  const f = (() => {
    if (!raw || typeof raw !== 'function') return null
    if (typeof (raw as { strength?: unknown }).strength !== 'function') return null
    if (args.axis === 'x') {
      if (typeof (raw as { x?: unknown }).x !== 'function') return null
      return raw as unknown as d3.ForceX<GraphNode>
    }
    if (typeof (raw as { y?: unknown }).y !== 'function') return null
    return raw as unknown as d3.ForceY<GraphNode>
  })()

  if (!f) {
    args.simulation.force(
      args.name,
      args.axis === 'x'
        ? d3.forceX<GraphNode>(() => args.target).strength(args.strength)
        : d3.forceY<GraphNode>(() => args.target).strength(args.strength),
    )
    return
  }

  if (args.axis === 'x') {
    ;(f as unknown as d3.ForceX<GraphNode>).x(() => args.target)
  } else {
    ;(f as unknown as d3.ForceY<GraphNode>).y(() => args.target)
  }
  f.strength(args.strength)
}

const updatePositioningForceFn = (args: {
  simulation: d3.Simulation<GraphNode, GraphEdge>
  name: string
  axis: 'x' | 'y'
  target: (d: GraphNode) => number
  strength: number
  enabled: boolean
}) => {
  if (!args.enabled || !(args.strength > 0)) {
    args.simulation.force(args.name, null)
    return
  }

  const raw = args.simulation.force(args.name) as unknown
  const f = (() => {
    if (!raw || typeof raw !== 'function') return null
    if (typeof (raw as { strength?: unknown }).strength !== 'function') return null
    if (args.axis === 'x') {
      if (typeof (raw as { x?: unknown }).x !== 'function') return null
      return raw as unknown as d3.ForceX<GraphNode>
    }
    if (typeof (raw as { y?: unknown }).y !== 'function') return null
    return raw as unknown as d3.ForceY<GraphNode>
  })()

  if (!f) {
    args.simulation.force(
      args.name,
      args.axis === 'x' ? d3.forceX<GraphNode>(args.target).strength(args.strength) : d3.forceY<GraphNode>(args.target).strength(args.strength),
    )
    return
  }

  if (args.axis === 'x') {
    ;(f as unknown as d3.ForceX<GraphNode>).x(args.target)
  } else {
    ;(f as unknown as d3.ForceY<GraphNode>).y(args.target)
  }
  f.strength(args.strength)
}

const readIndexNumber = (raw: unknown): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const v = Number(raw)
    if (Number.isFinite(v)) return v
  }
  return null
}

const computeIndexAnchorPlan2d = (args: {
  nodes: GraphNode[]
  idealSpacing: number
  anchorStrength: number
  disjointEnabled: boolean
}): {
  enabled: boolean
  strength: number
  dxByNode: WeakMap<GraphNode, number>
  dyByNode: WeakMap<GraphNode, number>
} => {
  const nodes = args.nodes
  const dxByNode = new WeakMap<GraphNode, number>()
  const dyByNode = new WeakMap<GraphNode, number>()
  if (!Array.isArray(nodes) || nodes.length === 0) return { enabled: false, strength: 0, dxByNode, dyByNode }

  let countXY = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  let countZ = 0
  let minZ = Infinity
  let maxZ = -Infinity

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    const props = (n.properties || {}) as Record<string, unknown>
    const ix = readIndexNumber(props['visual:xIndex'])
    const iy = readIndexNumber(props['visual:yIndex'])
    if (ix != null && iy != null) {
      countXY += 1
      if (ix < minX) minX = ix
      if (ix > maxX) maxX = ix
      if (iy < minY) minY = iy
      if (iy > maxY) maxY = iy
    }
    const iz = readIndexNumber(props['visual:zIndex'] ?? props['visual:depth'] ?? props['visual:layer'])
    if (iz != null) {
      countZ += 1
      if (iz < minZ) minZ = iz
      if (iz > maxZ) maxZ = iz
    }
  }

  const ratioXY = countXY / Math.max(1, nodes.length)
  const enabled = countXY >= Math.max(2, Math.floor(nodes.length * 0.22)) && ratioXY >= 0.22 && minX <= maxX && minY <= maxY
  if (!enabled) return { enabled: false, strength: 0, dxByNode, dyByNode }

  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const spacing = Math.max(160, Math.min(900, Math.round(Math.max(240, args.idealSpacing * 1.35))))

  const zEnabled = countZ / Math.max(1, nodes.length) >= 0.45 && minZ <= maxZ
  const midZ = zEnabled ? (minZ + maxZ) / 2 : 0
  const zSpacing = Math.max(40, Math.min(240, Math.round(spacing * 0.25)))

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    const props = (n.properties || {}) as Record<string, unknown>
    const ix = readIndexNumber(props['visual:xIndex'])
    const iy = readIndexNumber(props['visual:yIndex'])
    if (ix == null || iy == null) continue
    const dx = (ix - midX) * spacing
    const iz = zEnabled ? readIndexNumber(props['visual:zIndex'] ?? props['visual:depth'] ?? props['visual:layer']) : null
    const dy = (iy - midY) * spacing + (zEnabled && iz != null ? (iz - midZ) * zSpacing : 0)
    dxByNode.set(n, dx)
    dyByNode.set(n, dy)
  }

  const strength = args.disjointEnabled ? 0.35 : 0.85
  return { enabled: true, strength, dxByNode, dyByNode }
}

const computeCollideIterations = (nodeCount: number): number =>
  nodeCount <= 450 ? 4 : nodeCount <= 1600 ? 3 : 2

const isFlowchartType = (t: unknown): t is 'problem' | 'solution' => {
  if (typeof t !== 'string') return false
  const v = t.trim().toLowerCase()
  return v === 'problem' || v === 'solution'
}

const isHubNode = (n: GraphNode): boolean => String(n.type || '').trim().toLowerCase() === 'hub'

const readFlowchartSide = (n: GraphNode): 'problem' | 'solution' | null => {
  const props = (n.properties || {}) as Record<string, unknown>
  const side = String(props['flowchart:side'] || '').trim().toLowerCase()
  if (side === 'problem' || side === 'solution') return side
  const type = String(n.type || '').trim().toLowerCase()
  if (type === 'problem' || type === 'solution') return type
  return null
}

type SimulationPresentationSignature = {
  disjointEnabled: boolean
  chargeStrength: number
  anchorStrength: number
  centerX: number
  centerY: number
  bboxEnabled: boolean
  groupBboxEnabled: boolean
  collideEnabled: boolean
  collideIterations: number
  collideKey: string
  bboxKey: string
  groupBboxKey: string
}

const presentationSignatureCache = new WeakMap<object, SimulationPresentationSignature>()

const computeAnchorStrength2d = (args: {
  schema: GraphSchema
  isKeywordGraph: boolean
  disjointEnabled: boolean
  disjointStrength: number
}): number => {
  if (args.disjointEnabled) {
    return Math.max(
      0,
      Math.min(2, Math.max(DEFAULT_DISJOINT_MIN_BASE_STRENGTH, args.disjointStrength)),
    )
  }

  const raw = args.schema.layout?.forces?.centerStrength
  const centerStrength = (() => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (args.isKeywordGraph) return Math.max(DEFAULT_CENTER_STRENGTH, 0.18)
    return Math.max(DEFAULT_CENTER_STRENGTH, 0.15)
  })()

  return Math.max(0, Math.min(2, centerStrength)) * 0.25
}


export const buildSimulation = (
  nodes: GraphNode[],
  edgesForSim: GraphEdge[],
  width: number,
  height: number,
  schema: GraphSchema,
  options?: {
    skipInitialLayout?: boolean
    groupKeyOf?: GroupKeyOfNode
    groupsForBboxCollide?: GraphGroup[]
    treatKeywordGraphAsDocument?: boolean
    viewportCenter?: { x: number; y: number }
    nodeHalfExtentsByNodeId?: Record<string, NodeHalfExtents> | null
  }
) => {
  const frameW = width > 100 ? width : ZOOM_VIEWPORT_PRESET_16_9.maxWidth
  const frameH = height > 100 ? height : ZOOM_VIEWPORT_PRESET_16_9.maxHeight

  const viewportCenter = options?.viewportCenter || { x: 0, y: 0 }
  const centerX = viewportCenter.x
  const centerY = viewportCenter.y

  const computeTopology = (ns: GraphNode[], es: GraphEdge[]) => {
    const inDegree = new Map<string, number>()
    const outDegree = new Map<string, number>()
    ns.forEach(n => {
      inDegree.set(String(n.id), 0)
      outDegree.set(String(n.id), 0)
    })
    es.forEach(e => {
      const { src: s, tgt: t } = readGraphEdgeEndpoints(e)
      if (s && outDegree.has(String(s))) outDegree.set(String(s), (outDegree.get(String(s)) || 0) + 1)
      if (t && inDegree.has(String(t))) inDegree.set(String(t), (inDegree.get(String(t)) || 0) + 1)
    })
    return { inDegree, outDegree }
  }

  const isKeywordGraph =
    options?.treatKeywordGraphAsDocument === true ? false : detectKeywordGraph({ metadata: null, nodes, edges: edgesForSim })

  const idealSpacing = computeIdealSpacing2d({ width: frameW, height: frameH, nodeCount: nodes.length })
  const physicsTuning = readPhysics2dTuning(schema)

  const byLabelDistances = schema.layout?.forces?.linkDistanceByLabel || null
  const hasExplicitLinkDistance = (label: string): boolean => {
    if (!byLabelDistances || !label) return false
    const v = (byLabelDistances as Record<string, unknown>)[label]
    return typeof v === 'number' && Number.isFinite(v) && v > 0
  }

  const mode = readLayoutMode(schema);
  const disjointEnabled = schema.layout?.forces?.disjointComponents !== false;
  const disjointStrength =
    typeof schema.layout?.forces?.disjointStrength === 'number' ? schema.layout.forces.disjointStrength : DEFAULT_DISJOINT_STRENGTH;
  const isRadarGraph = detectRadarGraph(nodes)
  const radarForces = readRadarForceConfig(schema)

  const linkDist = (e: GraphEdge) => {
    const props = ((e as unknown as { properties?: unknown }).properties || {}) as Record<string, unknown>
    if (isRadarGraph && isRadarSpokeEdge(e)) return radarForces.spokeDistancePx
    if (isRadarGraph && isRadarFlowEdge(e)) return radarForces.flowDistancePx
    const perEdgeDistance = (() => {
      const raw = props.distance_px
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
      return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
    })()
    if (perEdgeDistance != null) return perEdgeDistance

    if (disjointEnabled) {
      const label = typeof e.label === 'string' ? e.label : String(e.label || '')
      if (label && hasExplicitLinkDistance(label)) return readForceLinkDistance(schema, e)
      return 30
    }

    const base = readForceLinkDistance(schema, e)
    if (!isKeywordGraph) return base
    const label = typeof e.label === 'string' ? e.label : String(e.label || '')
    if (hasExplicitLinkDistance(label)) return base
    return Math.max(40, Math.min(base, Math.round(idealSpacing * 1.1)))
  };

  const chargeStrength = computeChargeStrength2d({
    schema,
    isKeywordGraph,
    disjointEnabled,
    idealSpacing,
    nodeCount: nodes.length,
    edgeCount: edgesForSim.length,
    tuning: physicsTuning,
  })
  const chargeDistanceMin = computeChargeDistanceMin2d(idealSpacing)
  const collisionRadiusByType = schema.layout?.forces?.collisionByType || {};

  if (!options?.skipInitialLayout) {
    if (disjointEnabled) {
      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i]!
        const fx = (n as unknown as { fx?: unknown }).fx
        const fy = (n as unknown as { fy?: unknown }).fy
        const hasFx = typeof fx === 'number' && Number.isFinite(fx)
        const hasFy = typeof fy === 'number' && Number.isFinite(fy)
        if (!hasFx && !hasFy) continue

        if (hasFx && !(typeof n.x === 'number' && Number.isFinite(n.x))) n.x = fx as number
        if (hasFy && !(typeof n.y === 'number' && Number.isFinite(n.y))) n.y = fy as number

        ;(n as unknown as { fx?: null }).fx = null
        ;(n as unknown as { fy?: null }).fy = null
      }
    }

    const seedGroupKeyOf = options?.groupKeyOf || createGroupKeyOfNode({ nodes, edges: edgesForSim })
    if (mode === 'radial') {
      applyRadialClusterLayout(nodes, edgesForSim, frameW, frameH, schema, seedGroupKeyOf, options?.groupsForBboxCollide)
      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i]
        n.vx = 0
        n.vy = 0
      }
    }
    if (mode !== 'radial') {
      applyForceModeSeeds({
        nodes,
        edges: edgesForSim,
        width: frameW,
        height: frameH,
        schema,
        groupKeyOf: seedGroupKeyOf,
        groupsForBboxCollide: Array.isArray(options?.groupsForBboxCollide) ? options!.groupsForBboxCollide : [],
      })
    }

    if (disjointEnabled && centerX === 0 && centerY === 0) {
      let sumX = 0
      let sumY = 0
      let count = 0
      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i]!
        const x = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : null
        const y = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : null
        if (x == null || y == null) continue
        sumX += x
        sumY += y
        count += 1
      }
      if (count > 0) {
        const meanX = sumX / count
        const meanY = sumY / count
        if (Number.isFinite(meanX) && Number.isFinite(meanY) && (Math.abs(meanX) > 1e-6 || Math.abs(meanY) > 1e-6)) {
          for (let i = 0; i < nodes.length; i += 1) {
            const n = nodes[i]!
            const x = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : null
            const y = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : null
            if (x == null || y == null) continue
            n.x = x - meanX
            n.y = y - meanY
          }
        }
      }
    }
  }
  const linkForce = d3
    .forceLink<GraphNode, GraphEdge>(edgesForSim)
    .id(d => String(d.id))
    .distance(linkDist)
    .strength((e: GraphEdge) => {
      const props = ((e as unknown as { properties?: unknown }).properties || {}) as Record<string, unknown>
      const rawStrength = props.force_strength
      const n = typeof rawStrength === 'number' ? rawStrength : typeof rawStrength === 'string' ? Number(rawStrength) : null
      if (typeof n === 'number' && Number.isFinite(n)) {
        const scaled = (() => {
          if (isRadarGraph && isRadarSpokeEdge(e)) return n * radarForces.spokeStrengthScale
          if (isRadarGraph && isRadarFlowEdge(e)) return n * radarForces.flowStrengthScale
          return n
        })()
        return Math.max(0, Math.min(1, scaled))
      }
      const label = String(e.label || '').trim()
      if (label === 'spokeTo') return Math.max(0, Math.min(1, 0.42 * radarForces.spokeStrengthScale))
      if (label === 'pointsTo') return Math.max(0, Math.min(1, 0.1 * radarForces.flowStrengthScale))
      if (label === 'linksTo') return 0.012
      return 0.08
    });
  
  if (mode === 'radial') {
    const simulation = d3.forceSimulation<GraphNode>(nodes)
    simulation.stop()
    return simulation
  }

  const simulation = d3.forceSimulation<GraphNode>(nodes).force('link', linkForce);

    const nodeHalfExtentsByNodeId = options?.nodeHalfExtentsByNodeId || null
    const collideRadiusMax = computeCollideRadiusMax2d(idealSpacing)
    const collideRadiusFn = (d: GraphNode) => {
      const configured = collisionRadiusByType[d.type]
      if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) return clampCollideRadius2d(configured, collideRadiusMax)
      return clampCollideRadius2d(
        getNodeCollisionRadius(d, schema, nodeHalfExtentsByNodeId ? { halfExtentsByNodeId: nodeHalfExtentsByNodeId } : null),
        collideRadiusMax,
      )
    }

    const collisionCfg = readCollisionConfig(schema)
    const bboxCfg = collisionCfg.nodeBbox
    const collideIterations = computeCollideIterations(nodes.length)
    const collideStrength = computeCollideStrength2d({ isKeywordGraph, nodeCount: nodes.length, idealSpacing, tuning: physicsTuning })

    const bboxStrength = computeBboxCollideStrength2d({
      baseStrength: bboxCfg.strength,
      nodeCount: nodes.length,
      idealSpacing,
      isKeywordGraph,
      tuning: physicsTuning,
    })
    const bboxIterations = computeBboxCollideIterations2d({ baseIterations: bboxCfg.iterations, nodeCount: nodes.length })
    const groupBboxStrength = computeGroupBboxCollideStrength2d({
      baseStrength: collisionCfg.groupBbox.strength,
      nodeCount: nodes.length,
      idealSpacing,
      isKeywordGraph,
      tuning: physicsTuning,
    })
    const groupBboxIterations = computeGroupBboxCollideIterations2d({
      baseIterations: collisionCfg.groupBbox.iterations,
      nodeCount: nodes.length,
    })

    const portHandlesEnabled = Boolean(schema.behavior?.portHandles?.enabled)
    const hasMermaidNodes = portHandlesEnabled && nodes.some(n => String(n.type || '') === 'MermaidNode')
    const topologyNodes = hasMermaidNodes ? nodes.filter(n => String(n.type || '') === 'MermaidNode') : nodes
    const topologyNodeIds = hasMermaidNodes ? new Set(topologyNodes.map(n => String(n.id))) : null
    const topologyEdges = hasMermaidNodes
      ? edgesForSim.filter(e => {
          if (String(e.label || '') !== 'pointsTo') return false
          const { src: s, tgt: t } = readGraphEdgeEndpoints(e)
          return !!s && !!t && topologyNodeIds?.has(String(s)) && topologyNodeIds?.has(String(t))
        })
      : edgesForSim
    const { inDegree, outDegree } = portHandlesEnabled ? computeTopology(topologyNodes, topologyEdges) : { inDegree: new Map(), outDegree: new Map() }
    const portAxis = portHandlesEnabled ? readMermaidAxisFromNodes(nodes) : null
    if (portHandlesEnabled && portAxis) {
      for (let i = 0; i < topologyNodes.length; i += 1) {
        const n = topologyNodes[i]
        try {
          ;(n.properties as Record<string, unknown>)['visual:portAxis'] = portAxis.axis
          ;(n.properties as Record<string, unknown>)['visual:portForward'] = portAxis.forward
        } catch {
          void 0
        }
      }
    }
    if (portHandlesEnabled) {
      for (let i = 0; i < topologyNodes.length; i += 1) {
        const n = topologyNodes[i]
        const nid = String(n.id)
        const ind = inDegree.get(nid) || 0
        const outd = outDegree.get(nid) || 0
        const role = ind === 0 && outd > 0 ? 'input' : outd === 0 && ind > 0 ? 'output' : ind > 0 || outd > 0 ? 'process' : ''
        if (!role) continue
        try {
          ;(n.properties as Record<string, unknown>)['visual:portRole'] = role
        } catch {
          void 0
        }
      }
    }

    const groupKeyOf = options?.groupKeyOf || createGroupKeyOfNode({ nodes, edges: edgesForSim })

    const flowchart = (() => {
      const forces = (schema.layout?.forces || {}) as any
      if (forces?.flowchartMode !== true) return { enabled: false }
      let problems = 0
      let solutions = 0
      let hubs = 0
      for (let i = 0; i < nodes.length; i += 1) {
        const t = nodes[i]?.type
        if (String(t || '').trim().toLowerCase() === 'hub') {
          hubs += 1
          continue
        }
        if (!isFlowchartType(t)) continue
        if (t === 'problem') problems += 1
        else solutions += 1
      }
      const hasSpokeEdges = edgesForSim.some(e => String(e.label || '') === 'spokeTo')
      const hasHubNodes = hubs > 0
      const enabled = problems > 0 && solutions > 0
      return { enabled, hasHubNodes, hasSpokeEdges }
    })()

    const xTarget = () => centerX
    const yTarget = () => centerY

    const anchorStrength = computeAnchorStrength2d({ schema, isKeywordGraph, disjointEnabled, disjointStrength })

    const indexPlan = computeIndexAnchorPlan2d({ nodes, idealSpacing, anchorStrength, disjointEnabled })

    simulation
      .force(
        'charge',
        flowchart.enabled && (flowchart.hasHubNodes || flowchart.hasSpokeEdges)
          ? (disjointEnabled
              ? d3
                  .forceManyBody<GraphNode>()
                  .strength((d: GraphNode) => (isHubNode(d) ? -8 : -95))
                  .distanceMin(chargeDistanceMin)
              : d3
                  .forceManyBody<GraphNode>()
                  .strength((d: GraphNode) => (isHubNode(d) ? -8 : -95))
                  .distanceMin(chargeDistanceMin)
                  .distanceMax(Math.max(frameW, frameH) * 1.2))
          : isRadarGraph
            ? (disjointEnabled
                ? d3
                    .forceManyBody<GraphNode>()
                    .strength((d: GraphNode) => (isHubNode(d) ? radarForces.hubCharge : radarForces.nodeCharge))
                    .distanceMin(chargeDistanceMin)
                : d3
                    .forceManyBody<GraphNode>()
                    .strength((d: GraphNode) => (isHubNode(d) ? radarForces.hubCharge : radarForces.nodeCharge))
                    .distanceMin(chargeDistanceMin)
                    .distanceMax(Math.max(frameW, frameH) * 1.2))
          : disjointEnabled
            ? d3.forceManyBody().strength(chargeStrength).distanceMin(chargeDistanceMin)
            : d3.forceManyBody().strength(chargeStrength).distanceMin(chargeDistanceMin).distanceMax(Math.max(frameW, frameH) * 1.2),
      )
      .force(
        'collide',
        !disjointEnabled ? d3.forceCollide<GraphNode>(collideRadiusFn).strength(collideStrength).iterations(collideIterations) : null,
      )
      .force(
        'bboxCollide',
        createLayoutBboxForce2d({ schema, halfExtents: nodeHalfExtentsByNodeId,
          panelOnly: disjointEnabled, strength: bboxStrength, iterations: bboxIterations }),
      )
      .force(
        'groupBboxCollide',
        !disjointEnabled && collisionCfg.groupBbox.enabled
          ? (options?.groupsForBboxCollide && options.groupsForBboxCollide.length > 0
              ? createGroupBboxCollideForceByDepth({
                  schema,
                  groups: options.groupsForBboxCollide,
                  paddingX: collisionCfg.groupBbox.paddingX,
                  paddingY: collisionCfg.groupBbox.paddingY,
                  paddingZ: collisionCfg.groupBbox.paddingZ,
                  extraGapPx: collisionCfg.groupBbox.extraGapPx,
                  extraGapZPx: collisionCfg.groupBbox.extraGapZPx,
                  touchEpsilonPx: collisionCfg.groupBbox.touchEpsilonPx,
                  touchEpsilonXPx: collisionCfg.groupBbox.touchEpsilonXPx,
                  touchEpsilonYPx: collisionCfg.groupBbox.touchEpsilonYPx,
                  touchEpsilonZPx: collisionCfg.groupBbox.touchEpsilonZPx,
                  nestedTouchEpsilonPx: collisionCfg.groupBbox.nestedTouchEpsilonPx,
                  nestedTouchEpsilonXPx: collisionCfg.groupBbox.nestedTouchEpsilonXPx,
                  nestedTouchEpsilonYPx: collisionCfg.groupBbox.nestedTouchEpsilonYPx,
                  nestedTouchEpsilonZPx: collisionCfg.groupBbox.nestedTouchEpsilonZPx,
                  halfExtentsByNodeId: nodeHalfExtentsByNodeId,
                  strength: groupBboxStrength,
                  iterations: groupBboxIterations,
                })
              : createGroupBboxCollideForce({
                  schema,
                  paddingX: collisionCfg.groupBbox.paddingX,
                  paddingY: collisionCfg.groupBbox.paddingY,
                  strength: groupBboxStrength,
                  iterations: groupBboxIterations,
                  groupKeyOf,
                  halfExtentsByNodeId: nodeHalfExtentsByNodeId,
                }))
          : null,
      )
      .force(
        'xIndex',
        indexPlan.enabled
          ? d3.forceX<GraphNode>(d => centerX + (indexPlan.dxByNode.get(d) || 0)).strength(indexPlan.strength)
          : null,
      )
      .force(
        'yIndex',
        indexPlan.enabled
          ? d3.forceY<GraphNode>(d => centerY + (indexPlan.dyByNode.get(d) || 0)).strength(indexPlan.strength)
          : null,
      )
      .force(
        'flowchartX',
        flowchart.enabled
          ? (() => {
              const gridSize = readFlowchartGridSizePx(schema)
              const separation = readFlowchartLaneSeparationPx({ schema, frameW })
              const cx = snapScalarToGrid(centerX, gridSize)
              const leftX = cx - separation
              const rightX = cx + separation
              return d3
                .forceX<GraphNode>(d => {
                  const side = readFlowchartSide(d)
                  if (side === 'problem') return leftX
                  if (side === 'solution') return rightX
                  return cx
                })
                .strength(indexPlan.enabled ? 0.12 : 0.28)
            })()
          : null,
      )
      .force('x', d3.forceX<GraphNode>(xTarget).strength(anchorStrength))
      .force('y', d3.forceY<GraphNode>(yTarget).strength(anchorStrength))

  try {
    const velocityDecay = computeVelocityDecay2d({ nodeCount: nodes.length, idealSpacing, isKeywordGraph, tuning: physicsTuning })
    simulation.velocityDecay(velocityDecay)
  } catch {
    void 0
  }

  if (schema.layout?.forces?.alphaDecay != null) {
    simulation.alphaDecay(schema.layout.forces.alphaDecay!);
  }
  return simulation;
};

export const updateForceSimulationPresentation = (args: {
  simulation: d3.Simulation<GraphNode, GraphEdge>
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
  schema: GraphSchema
  groupKeyOf?: GroupKeyOfNode
  groupsForBboxCollide?: GraphGroup[]
  viewportCenter?: { x: number; y: number }
  nodeHalfExtentsByNodeId?: Record<string, NodeHalfExtents> | null
}) => {
  const { simulation, nodes, edges, width, height, schema } = args
  const mode = readLayoutMode(schema)
  if (mode === 'radial') return

  const frameW = width > 100 ? width : ZOOM_VIEWPORT_PRESET_16_9.maxWidth
  const frameH = height > 100 ? height : ZOOM_VIEWPORT_PRESET_16_9.maxHeight

  const viewportCenter = args.viewportCenter || { x: 0, y: 0 }
  const centerX = viewportCenter.x
  const centerY = viewportCenter.y

  const computeTopology = (ns: GraphNode[], es: GraphEdge[]) => {
    const inDegree = new Map<string, number>()
    const outDegree = new Map<string, number>()
    ns.forEach(n => {
      inDegree.set(String(n.id), 0)
      outDegree.set(String(n.id), 0)
    })
    es.forEach(e => {
      const { src: s, tgt: t } = readGraphEdgeEndpoints(e)
      if (s && outDegree.has(String(s))) outDegree.set(String(s), (outDegree.get(String(s)) || 0) + 1)
      if (t && inDegree.has(String(t))) inDegree.set(String(t), (inDegree.get(String(t)) || 0) + 1)
    })
    return { inDegree, outDegree }
  }

  const disjointEnabled = schema.layout?.forces?.disjointComponents !== false;
  const disjointStrength =
    typeof schema.layout?.forces?.disjointStrength === 'number' ? schema.layout.forces.disjointStrength : DEFAULT_DISJOINT_STRENGTH;

  const portHandlesEnabled = Boolean(schema.behavior?.portHandles?.enabled)
  const hasMermaidNodes = portHandlesEnabled && nodes.some(n => String(n.type || '') === 'MermaidNode')
  const topologyNodes = hasMermaidNodes ? nodes.filter(n => String(n.type || '') === 'MermaidNode') : nodes
  const topologyNodeIds = hasMermaidNodes ? new Set(topologyNodes.map(n => String(n.id))) : null
  const topologyEdges = hasMermaidNodes
    ? edges.filter(e => {
        if (String(e.label || '') !== 'pointsTo') return false
        const { src: s, tgt: t } = readGraphEdgeEndpoints(e)
        return !!s && !!t && topologyNodeIds?.has(String(s)) && topologyNodeIds?.has(String(t))
      })
    : edges
  const { inDegree, outDegree } = portHandlesEnabled
    ? computeTopology(topologyNodes, topologyEdges)
    : { inDegree: new Map(), outDegree: new Map() }
  const portAxis = portHandlesEnabled ? readMermaidAxisFromNodes(nodes) : null

  if (portHandlesEnabled && portAxis) {
    for (let i = 0; i < topologyNodes.length; i += 1) {
      const n = topologyNodes[i]
      try {
        ;(n.properties as Record<string, unknown>)['visual:portAxis'] = portAxis.axis
        ;(n.properties as Record<string, unknown>)['visual:portForward'] = portAxis.forward
      } catch {
        void 0
      }
    }
  }

  if (portHandlesEnabled) {
    for (let i = 0; i < topologyNodes.length; i += 1) {
      const n = topologyNodes[i]
      const nid = String(n.id)
      const ind = inDegree.get(nid) || 0
      const outd = outDegree.get(nid) || 0
      const role = ind === 0 && outd > 0 ? 'input' : outd === 0 && ind > 0 ? 'output' : ind > 0 || outd > 0 ? 'process' : ''
      if (!role) continue
      try {
        ;(n.properties as Record<string, unknown>)['visual:portRole'] = role
      } catch {
        void 0
      }
    }
  }

  const groupKeyOf = args.groupKeyOf || createGroupKeyOfNode({ nodes, edges })

  const isKeywordGraph = detectKeywordGraph({ metadata: null, nodes, edges })

    const idealSpacing = computeIdealSpacing2d({ width: frameW, height: frameH, nodeCount: nodes.length })
    const physicsTuning = readPhysics2dTuning(schema)
    const chargeStrength = computeChargeStrength2d({
      schema,
      isKeywordGraph,
      disjointEnabled,
      idealSpacing,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      tuning: physicsTuning,
    })
    const chargeDistanceMin = computeChargeDistanceMin2d(idealSpacing)

    const anchorStrength = computeAnchorStrength2d({ schema, isKeywordGraph, disjointEnabled, disjointStrength })
  const isRadarGraph = detectRadarGraph(nodes)
  const radarForces = readRadarForceConfig(schema)

  const flowchart = (() => {
    const forces = (schema.layout?.forces || {}) as any
    if (forces?.flowchartMode !== true) return { enabled: false }
      let problems = 0
      let solutions = 0
    let hubs = 0
      for (let i = 0; i < nodes.length; i += 1) {
        const t = nodes[i]?.type
      if (String(t || '').trim().toLowerCase() === 'hub') {
        hubs += 1
        continue
      }
      if (!isFlowchartType(t)) continue
        if (t === 'problem') problems += 1
        else solutions += 1
      }
    const hasSpokeEdges = edges.some(e => String(e.label || '') === 'spokeTo')
    const hasHubNodes = hubs > 0
    const enabled = problems > 0 && solutions > 0
    return { enabled, hasHubNodes, hasSpokeEdges }
    })()

    const collisionRadiusByType = schema.layout?.forces?.collisionByType || {}
    const nodeHalfExtentsByNodeId = args.nodeHalfExtentsByNodeId || null
    const collideRadiusMax = computeCollideRadiusMax2d(idealSpacing)
    const collideRadiusFn = (d: GraphNode) => {
      const configured = collisionRadiusByType[d.type]
      if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) return clampCollideRadius2d(configured, collideRadiusMax)
      return clampCollideRadius2d(
        getNodeCollisionRadius(d, schema, nodeHalfExtentsByNodeId ? { halfExtentsByNodeId: nodeHalfExtentsByNodeId } : null),
        collideRadiusMax,
      )
    }

    const collisionCfg = readCollisionConfig(schema)
    const bboxCfg = collisionCfg.nodeBbox
    const collideIterations = computeCollideIterations(nodes.length)
    const collideStrength = computeCollideStrength2d({ isKeywordGraph, nodeCount: nodes.length, idealSpacing, tuning: physicsTuning })

    const bboxStrength = computeBboxCollideStrength2d({
      baseStrength: bboxCfg.strength,
      nodeCount: nodes.length,
      idealSpacing,
      isKeywordGraph,
      tuning: physicsTuning,
    })
    const bboxIterations = computeBboxCollideIterations2d({ baseIterations: bboxCfg.iterations, nodeCount: nodes.length })
    const groupBboxStrength = computeGroupBboxCollideStrength2d({
      baseStrength: collisionCfg.groupBbox.strength,
      nodeCount: nodes.length,
      idealSpacing,
      isKeywordGraph,
      tuning: physicsTuning,
    })
    const groupBboxIterations = computeGroupBboxCollideIterations2d({
      baseIterations: collisionCfg.groupBbox.iterations,
      nodeCount: nodes.length,
    })

  const sortedKeyFromRecord = (rec: Record<string, unknown>): string => {
    const keys = Object.keys(rec)
    keys.sort()
    const parts: string[] = []
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i]!
      const v = rec[k]
      parts.push(`${k}=${typeof v === 'number' && Number.isFinite(v) ? v : String(v)}`)
    }
    return parts.join(',')
  }

  const collideKey = (() => {
    if (disjointEnabled) return 'disjoint'
    const byType = typeof schema.layout?.forces?.collisionByType === 'object' && schema.layout?.forces?.collisionByType
      ? (schema.layout.forces.collisionByType as Record<string, unknown>)
      : {}
    const str = Math.round(collideStrength * 1000) / 1000
    const rmax = Math.round(collideRadiusMax * 10) / 10
    return `iter=${collideIterations}|str=${str}|rmax=${rmax}|byType=${sortedKeyFromRecord(byType)}`
  })()

  const bboxKey = (() => {
    if (!bboxCfg.enabled) return ''
    const nums = [
      bboxCfg.paddingX,
      bboxCfg.paddingY,
      bboxCfg.paddingZ,
      bboxCfg.touchEpsilonPx,
      bboxCfg.touchEpsilonXPx,
      bboxCfg.touchEpsilonYPx,
      bboxCfg.touchEpsilonZPx,
      bboxStrength,
      bboxIterations,
    ]
    return `${disjointEnabled}|${panelBoundsKey2d(nodeHalfExtentsByNodeId)}|${nums.join(',')}`
  })()

  const groupBboxKey = (() => {
    if (disjointEnabled || !collisionCfg.groupBbox.enabled) return ''
    const g = collisionCfg.groupBbox
    const nums = [
      g.paddingX,
      g.paddingY,
      g.paddingZ,
      g.extraGapPx,
      g.extraGapZPx,
      g.touchEpsilonPx,
      g.touchEpsilonXPx,
      g.touchEpsilonYPx,
      g.touchEpsilonZPx,
      g.nestedTouchEpsilonPx,
      g.nestedTouchEpsilonXPx,
      g.nestedTouchEpsilonYPx,
      g.nestedTouchEpsilonZPx,
      groupBboxStrength,
      groupBboxIterations,
    ]
    const byDepth = !!(args.groupsForBboxCollide && args.groupsForBboxCollide.length > 0)
    return `${byDepth ? 'depth' : 'flat'}|${nums
      .map(v => (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''))
      .join(',')}`
  })()

  const signature: SimulationPresentationSignature = {
    disjointEnabled,
    chargeStrength,
    anchorStrength,
    centerX,
    centerY,
    bboxEnabled: bboxCfg.enabled && (!disjointEnabled || !!nodeHalfExtentsByNodeId),
    groupBboxEnabled: !disjointEnabled && collisionCfg.groupBbox.enabled,
    collideEnabled: !disjointEnabled,
    collideIterations,
    collideKey,
    bboxKey,
    groupBboxKey,
  }
  const prevSignature = presentationSignatureCache.get(simulation as unknown as object) || null
  const shouldReheat =
    !!prevSignature &&
    (prevSignature.disjointEnabled !== signature.disjointEnabled ||
      Math.abs(prevSignature.chargeStrength - signature.chargeStrength) > 1e-4 ||
      Math.abs(prevSignature.anchorStrength - signature.anchorStrength) > 1e-4 ||
      Math.abs(prevSignature.centerX - signature.centerX) > 0.25 ||
      Math.abs(prevSignature.centerY - signature.centerY) > 0.25)
  presentationSignatureCache.set(simulation as unknown as object, signature)

  if (flowchart.enabled && (flowchart.hasHubNodes || flowchart.hasSpokeEdges)) {
    updateManyBodyForceByNode({
      simulation,
      name: 'charge',
      strength: (d: GraphNode) => (isHubNode(d) ? -8 : -95),
      distanceMin: chargeDistanceMin,
      distanceMax: disjointEnabled ? Number.POSITIVE_INFINITY : Math.max(frameW, frameH) * 1.2,
    })
  } else if (isRadarGraph) {
    updateManyBodyForceByNode({
      simulation,
      name: 'charge',
      strength: (d: GraphNode) => (isHubNode(d) ? radarForces.hubCharge : radarForces.nodeCharge),
      distanceMin: chargeDistanceMin,
      distanceMax: disjointEnabled ? Number.POSITIVE_INFINITY : Math.max(frameW, frameH) * 1.2,
    })
  } else {
    updateManyBodyForce({
      simulation,
      name: 'charge',
      strength: chargeStrength,
      distanceMin: chargeDistanceMin,
      distanceMax: disjointEnabled ? Number.POSITIVE_INFINITY : Math.max(frameW, frameH) * 1.2,
    })
  }

  try {
    const velocityDecay = computeVelocityDecay2d({ nodeCount: nodes.length, idealSpacing, isKeywordGraph, tuning: physicsTuning })
    simulation.velocityDecay(velocityDecay)
  } catch {
    void 0
  }

  const desiredCollideEnabled = !disjointEnabled
  const desiredBboxEnabled = signature.bboxEnabled
  const desiredGroupBboxEnabled = !disjointEnabled && collisionCfg.groupBbox.enabled

  const shouldUpdateCollide = (() => {
    if (!prevSignature) {
      const existing = simulation.force('collide')
      return desiredCollideEnabled ? !existing : !!existing
    }
    return prevSignature.collideEnabled !== signature.collideEnabled || prevSignature.collideKey !== signature.collideKey
  })()
  if (shouldUpdateCollide) {
    if (!desiredCollideEnabled) {
      simulation.force('collide', null)
    } else {
      const existing = simulation.force('collide') as unknown as
        | { radius?: (fn: (d: GraphNode) => number) => unknown; iterations?: (n: number) => unknown; strength?: (v: number) => unknown }
        | null
      const canMutate =
        !!existing &&
        typeof existing.radius === 'function' &&
        typeof existing.iterations === 'function' &&
        typeof existing.strength === 'function'
      if (canMutate) {
        existing.radius!(collideRadiusFn)
        existing.iterations!(collideIterations)
        existing.strength!(collideStrength)
      } else {
        simulation.force(
          'collide',
          d3.forceCollide<GraphNode>(collideRadiusFn).strength(collideStrength).iterations(collideIterations),
        )
      }
    }
  }

  const shouldUpdateBbox = (() => {
    if (!prevSignature) {
      const existing = simulation.force('bboxCollide')
      return desiredBboxEnabled ? !existing : !!existing
    }
    return prevSignature.bboxEnabled !== signature.bboxEnabled || prevSignature.bboxKey !== signature.bboxKey
  })()
  if (shouldUpdateBbox) {
    simulation.force(
      'bboxCollide',
      createLayoutBboxForce2d({ schema, halfExtents: nodeHalfExtentsByNodeId,
        panelOnly: disjointEnabled, strength: bboxStrength, iterations: bboxIterations }),
    )
  }

  const shouldUpdateGroupBbox = (() => {
    if (!prevSignature) {
      const existing = simulation.force('groupBboxCollide')
      return desiredGroupBboxEnabled ? !existing : !!existing
    }
    return (
      prevSignature.groupBboxEnabled !== signature.groupBboxEnabled || prevSignature.groupBboxKey !== signature.groupBboxKey
    )
  })()
  if (shouldUpdateGroupBbox) {
    simulation.force(
      'groupBboxCollide',
      desiredGroupBboxEnabled
        ? (args.groupsForBboxCollide && args.groupsForBboxCollide.length > 0
            ? createGroupBboxCollideForceByDepth({
                schema,
                groups: args.groupsForBboxCollide,
                paddingX: collisionCfg.groupBbox.paddingX,
                paddingY: collisionCfg.groupBbox.paddingY,
                paddingZ: collisionCfg.groupBbox.paddingZ,
                extraGapPx: collisionCfg.groupBbox.extraGapPx,
                extraGapZPx: collisionCfg.groupBbox.extraGapZPx,
                touchEpsilonPx: collisionCfg.groupBbox.touchEpsilonPx,
                touchEpsilonXPx: collisionCfg.groupBbox.touchEpsilonXPx,
                touchEpsilonYPx: collisionCfg.groupBbox.touchEpsilonYPx,
                touchEpsilonZPx: collisionCfg.groupBbox.touchEpsilonZPx,
                nestedTouchEpsilonPx: collisionCfg.groupBbox.nestedTouchEpsilonPx,
                nestedTouchEpsilonXPx: collisionCfg.groupBbox.nestedTouchEpsilonXPx,
                nestedTouchEpsilonYPx: collisionCfg.groupBbox.nestedTouchEpsilonYPx,
                nestedTouchEpsilonZPx: collisionCfg.groupBbox.nestedTouchEpsilonZPx,
                halfExtentsByNodeId: nodeHalfExtentsByNodeId,
                strength: groupBboxStrength,
                iterations: groupBboxIterations,
              })
            : createGroupBboxCollideForce({
                schema,
                paddingX: collisionCfg.groupBbox.paddingX,
                paddingY: collisionCfg.groupBbox.paddingY,
                strength: groupBboxStrength,
                iterations: groupBboxIterations,
                groupKeyOf,
                halfExtentsByNodeId: nodeHalfExtentsByNodeId,
              }))
        : null,
    )
  }
  updatePositioningForce({ simulation, name: 'x', axis: 'x', target: centerX, strength: anchorStrength })
  updatePositioningForce({ simulation, name: 'y', axis: 'y', target: centerY, strength: anchorStrength })

  const indexPlan = computeIndexAnchorPlan2d({ nodes, idealSpacing, anchorStrength, disjointEnabled })
  updatePositioningForceFn({
    simulation,
    name: 'xIndex',
    axis: 'x',
    target: d => centerX + (indexPlan.dxByNode.get(d) || 0),
    strength: indexPlan.strength,
    enabled: indexPlan.enabled,
  })
  updatePositioningForceFn({
    simulation,
    name: 'yIndex',
    axis: 'y',
    target: d => centerY + (indexPlan.dyByNode.get(d) || 0),
    strength: indexPlan.strength,
    enabled: indexPlan.enabled,
  })

  updatePositioningForceFn({
    simulation,
    name: 'flowchartX',
    axis: 'x',
    target: (() => {
      const gridSize = readFlowchartGridSizePx(schema)
      const separation = readFlowchartLaneSeparationPx({ schema, frameW })
      const cx = snapScalarToGrid(centerX, gridSize)
      const leftX = cx - separation
      const rightX = cx + separation
      return (d: GraphNode) => {
        const side = readFlowchartSide(d)
        if (side === 'problem') return leftX
        if (side === 'solution') return rightX
        return cx
      }
    })(),
    strength: indexPlan.enabled ? 0.12 : 0.28,
    enabled: flowchart.enabled,
  })

  if (schema.layout?.forces?.alphaDecay != null) {
    simulation.alphaDecay(schema.layout.forces.alphaDecay!)
  }
  if (shouldReheat) {
    try {
      simulation.alphaTarget(0)
      const alpha = simulation.alpha()
      const targetAlpha = disjointEnabled ? 0.35 : 0.28
      simulation.alpha(Math.max(alpha, targetAlpha)).restart()
    } catch {
      void 0
    }
  }
}

export const buildNeighborIds = (data: { nodes: GraphNode[]; edges: GraphEdge[] }, selectedNodeId?: string | null) => {
  const neighborIds = new Set<string>();
  if (selectedNodeId) {
    data.edges.forEach((e) => {
      const { src, tgt } = getEdgeEndpoints(e as EdgeWithRuntime);
      if (src === selectedNodeId && tgt) neighborIds.add(tgt);
      if (tgt === selectedNodeId && src) neighborIds.add(src);
    });
  }
  return neighborIds;
};
