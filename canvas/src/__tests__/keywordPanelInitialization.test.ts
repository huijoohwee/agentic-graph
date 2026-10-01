import { applyStrictOverlapRelax2d } from '@/components/GraphCanvas/sceneHandlers.simulationTick2d.strictOverlap'
import { readPhysics2dTuning } from '@/lib/graph/physics2dTuning'
import { getGraphDataForDisplay } from '@/components/GraphCanvas/displayFilter'
import { computeOverlayHalfExtentsByNodeId2d } from '@/lib/render/overlayHalfExtentsByNodeId2d'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { seedOverlayPanelPositions2d, createLayoutBboxForce2d, panelBoundsKey2d } from '@/components/GraphCanvas/layout/panelLayout2d'
import { buildSimulation, updateForceSimulationPresentation } from '@/components/GraphCanvas/simulation'
import { defaultSchema, type GraphSchema } from '@/lib/graph/schema'
import type { GraphNode } from '@/lib/graph/types'

function fixture(count: number) {
  const nodes: GraphNode[] = Array.from({ length: count }, (_, i) => ({
    id: `panel-${String(i).padStart(4, '0')}`, type: 'Image', label: '', properties: {}, x: 0, y: 0,
  }))
  const bounds = Object.fromEntries(nodes.map((n, i) => [n.id, { halfW: i % 3 ? 114 : 160, halfH: i % 3 ? 64 : 108 }]))
  return { nodes, bounds }
}
function overlapCount({ nodes, bounds }: ReturnType<typeof fixture>) {
  let count = 0
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i]!, b = nodes[j]!, sa = bounds[a.id]!, sb = bounds[b.id]!
    if (Math.abs(a.x! - b.x!) < sa.halfW + sb.halfW && Math.abs(a.y! - b.y!) < sa.halfH + sb.halfH) count++
  }
  return count
}
export function testKeywordPanelsSeparateBeforeFirstFrame() {
  for (const count of [16, 128, 512]) {
    const data = fixture(count), start = performance.now()
    const stats = seedOverlayPanelPositions2d({ nodes: data.nodes, halfExtents: data.bounds })
    const elapsed = performance.now() - start
    assert.equal(overlapCount(data), 0)
    assert.ok(stats.probes < count * count * 6, 'bounded cell probes, no full-graph relaxation')
    const again = fixture(count)
    again.nodes.reverse()
    seedOverlayPanelPositions2d({ nodes: again.nodes, halfExtents: again.bounds })
    assert.deepEqual(again.nodes.sort((a, b) => a.id.localeCompare(b.id)), data.nodes)
    const poses = data.nodes.map(n => [n.x, n.y])
    assert.equal(seedOverlayPanelPositions2d({ nodes: data.nodes, halfExtents: data.bounds }).moved, 0)
    assert.deepEqual(data.nodes.map(n => [n.x, n.y]), poses)
    console.log(`keyword-panel-init count=${count} elapsedMs=${elapsed.toFixed(2)} probes=${stats.probes}`)
  }
}
export function testKeywordPanelSeedPreservesSavedAndFixedPositions() {
  const data = fixture(16)
  data.nodes[0]!.fx = 0; data.nodes[0]!.fy = 0
  data.nodes[1]!.x = 4000; data.nodes[1]!.y = 4000
  const ordinary: GraphNode = { id: 'entity', type: 'Entity', label: '', properties: {}, x: 0, y: 0 }
  const original = { ...ordinary }
  seedOverlayPanelPositions2d({ nodes: [...data.nodes, ordinary], halfExtents: data.bounds })
  assert.deepEqual(data.nodes.slice(0, 2).map(n => [n.x, n.y]), [[0, 0], [4000, 4000]])
  assert.equal(overlapCount(data), 0, 'separated saved and fixed peers remain in place')
  assert.deepEqual(ordinary, original)
}
export function testDisjointPanelCollisionSurvivesPresentationUpdates() {
  for (const disjointComponents of [true, false]) {
    const schema: GraphSchema = { ...defaultSchema, layout: { ...defaultSchema.layout, forces: {
      ...defaultSchema.layout?.forces, disjointComponents, bboxCollide: true, bboxCollideStrength: 1, bboxCollideIterations: 4,
    } } }
    const data = fixture(16)
    seedOverlayPanelPositions2d({ nodes: data.nodes, halfExtents: data.bounds })
    const simulation = buildSimulation(data.nodes, [], 1340, 952, schema, {
      skipInitialLayout: true, nodeHalfExtentsByNodeId: data.bounds,
    }).stop()
    try {
      simulation.tick(300)
      assert.equal(overlapCount(data), 0, 'panels remain separated as the simulation cools')
      assert.ok(simulation.force('bboxCollide'), 'both graph layout policies retain media surface collision')
      const before = simulation.force('bboxCollide')
      const args = { simulation, nodes: data.nodes, edges: [], width: 1340, height: 952, schema,
        nodeHalfExtentsByNodeId: data.bounds }
      updateForceSimulationPresentation(args)
      updateForceSimulationPresentation(args)
      assert.equal(simulation.force('bboxCollide'), before, 'no duplicate force rebuild on settled updates')
      const key = panelBoundsKey2d(data.bounds)
      data.bounds[data.nodes[0]!.id]!.halfW *= 2
      assert.notEqual(panelBoundsKey2d(data.bounds), key)
      updateForceSimulationPresentation(args)
      assert.notEqual(simulation.force('bboxCollide'), before, 'resize refreshes shared world bounds')
      assert.equal(createLayoutBboxForce2d({ schema: defaultSchema, halfExtents: null, panelOnly: true, strength: 1, iterations: 1 }), null)
    } finally { simulation.stop() }
  }
}

export function testKeywordVisibleMediaAnchorsParticipateInInitialization() {
  const nodes: GraphNode[] = [
    { id: 'paragraph', type: 'Paragraph', label: 'Ordinary', properties: {}, x: 0, y: 0 },
    { id: 'web', type: 'KeywordSource', label: 'Web', properties: { iframe_url: 'https://example.test/page' }, x: 0, y: 0 },
    { id: 'image', type: 'Image', label: 'Image', properties: { media_kind: 'image', media_url: 'https://example.test/image.png' }, x: 0, y: 0 },
    { id: 'term', type: 'Entity', label: 'Term', properties: {}, x: 0, y: 0 },
  ]
  const graph = getGraphDataForDisplay({ graphData: { type: 'graph', nodes, edges: [], metadata: { 'kg:activeDocumentViewMode': 'keyword' } } })
  assert.deepEqual(graph.nodes.map(n => n.id), ['web', 'image', 'term'])
  const halfExtents = computeOverlayHalfExtentsByNodeId2d({ nodes: graph.nodes,
    panelOnlyNodeIdSet: new Set(['web']), mediaOverlayNodeIdSet: new Set(['image']),
    viewportW: 1340, viewportH: 952, zoomK: 0.23, mediaPanelDensity: 'default' })
  assert.equal(seedOverlayPanelPositions2d({ nodes: graph.nodes, halfExtents }).moved, 1)
  assert.ok(Math.abs(nodes[1]!.x! - nodes[2]!.x!) >= halfExtents!.web!.halfW + halfExtents!.image!.halfW
    || Math.abs(nodes[1]!.y! - nodes[2]!.y!) >= halfExtents!.web!.halfH + halfExtents!.image!.halfH)
}

export function testKeywordSettlingUsesPanelFootprints() {
  const data = fixture(2)
  data.nodes[0]!.fx = 0; data.nodes[0]!.fy = 0
  data.nodes[1]!.x = 240
  const schema: GraphSchema = { ...defaultSchema, layout: { ...defaultSchema.layout, forces: {
    ...defaultSchema.layout?.forces, bboxCollide: true, bboxCollidePadding: 0, groupBboxCollide: false,
  } } }
  applyStrictOverlapRelax2d({ state: { lastStrictOverlapTick: -1, cache: null }, nodes: data.nodes,
    tick: 80, alpha: 0.07, schema, idealSpacing: 240, tuning: readPhysics2dTuning(schema),
    groupsForBboxCollide: [], halfExtentsByNodeId: data.bounds })
  assert.equal(data.nodes[0]!.x, 0, 'settling preserves the fixed peer')
  assert.ok(data.nodes[1]!.x! > 240, 'settling separates overlapping panels whose small graph glyphs do not overlap')
}
