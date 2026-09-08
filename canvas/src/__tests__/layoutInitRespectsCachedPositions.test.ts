import assert from 'node:assert/strict'
import { initializeGraphLayout } from '@/components/GraphCanvas/layout/initialization'
import { defaultSchema } from '@/lib/graph/schema'
import type { GraphNode } from '@/lib/graph/types'

export const testLayoutInitRespectsStableCachedPositions = () => {
  const nodes: GraphNode[] = [
    { id: 'a', label: 'a', type: 'T', x: 100, y: 100, properties: {} },
    { id: 'b', label: 'b', type: 'T', x: 220, y: 140, properties: {} },
  ]
  const before = nodes.map(n => ({ id: String(n.id), x: n.x as number, y: n.y as number }))

  initializeGraphLayout({
    nodes,
    edges: [],
    width: 800,
    height: 600,
    schema: defaultSchema,
    seedCenter: { x: 400, y: 300 },
    layoutPositions: {
      a: { x: 100, y: 100 },
      b: { x: 220, y: 140 },
    },
  })

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    const b = before[i]!
    if ((n.x as number) !== b.x || (n.y as number) !== b.y) {
      throw new Error(`expected cached position for ${b.id} to remain unchanged`)
    }
  }
}

export const testLayoutInitSeedsOnlyMissingPositionsWhenStable = () => {
  for (const disjointComponents of [true, false]) {
    const schema = {
      ...defaultSchema,
      layout: { ...defaultSchema.layout, forces: { ...defaultSchema.layout?.forces, disjointComponents } },
    }
    for (const cached of [true, false]) {
      for (const count of [2, 6, 12]) {
        const nodes: GraphNode[] = Array.from({ length: count }, (_, i) => ({
          id: `n${i}`, label: `n${i}`, type: 'T', properties: {},
          ...(i === 0 ? { x: 10, y: 20 } : {}),
        }))
        initializeGraphLayout({
          nodes, edges: [], width: 800, height: 600, schema,
          seedCenter: { x: 400, y: 300 },
          layoutPositions: cached ? { n0: { x: 10, y: 20 } } : null,
        })
        assert.equal(nodes[0]!.x, 10, 'existing x must survive partial layout initialization')
        assert.equal(nodes[0]!.y, 20, 'existing y must survive partial layout initialization')
        assert.ok(nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)), 'missing positions must be finite')
        const placed = nodes.map(n => [n.x, n.y])
        initializeGraphLayout({ nodes, edges: [], width: 800, height: 600, schema })
        assert.deepEqual(nodes.map(n => [n.x, n.y]), placed, 'unchanged reuse must not reseed')
      }
    }
    const unstable: GraphNode[] = [
      { id: 'a', label: 'a', type: 'T', x: 200000, y: 200000, properties: {} },
      { id: 'b', label: 'b', type: 'T', properties: {} },
    ]
    initializeGraphLayout({ nodes: unstable, edges: [], width: 800, height: 600, schema })
    assert.ok(unstable.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)))
    assert.ok(Math.abs(unstable[0]!.x!) < 120000 && Math.abs(unstable[0]!.y!) < 120000,
      'unstable positions must still enter layout repair')
  }
}
