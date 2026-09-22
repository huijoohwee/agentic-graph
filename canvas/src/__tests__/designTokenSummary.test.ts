import assert from 'node:assert/strict'
import { DESIGN_SCAN_LIMITS, summarizeDesignTokens } from '@/features/design/designTokenSummary'
import type { GraphData } from '@/lib/graph/types'

const makeGraph = (): GraphData => ({
  type: 'Graph',
  nodes: [
    {
      id: 'frame-a',
      label: 'Frame A',
      type: 'Frame',
      properties: {
        fill: '#FF0000',
        stroke: '#111111',
        gap: 12,
        padding: 16,
        fontSize: 14,
      },
    },
    {
      id: 'frame-b',
      label: 'Frame B',
      type: 'Frame',
      properties: {
        backgroundColor: '#ff0000',
        borderRadius: 8,
        fontWeight: 600,
      },
    },
  ],
  edges: [],
})

export function testDesignTokenSummaryExtractsDesignTokens() {
  const summary = summarizeDesignTokens({ graphData: makeGraph(), graphRevision: 1, maxEntries: 8 })
  if (!summary.semanticKey) throw new Error('expected design token summary to expose a semantic key')
  const red = summary.colorEntries.find(entry => entry.value === '#ff0000')
  if (!red || red.count !== 2) throw new Error(`expected shared red token count; got ${JSON.stringify(summary.colorEntries)}`)
  if (!summary.typeEntries.some(entry => entry.value === 'Frame' && entry.count === 2)) {
    throw new Error(`expected type summary to count frame nodes; got ${JSON.stringify(summary.typeEntries)}`)
  }
  if (!summary.spacingEntries.some(entry => entry.value === 'gap:12')) {
    throw new Error(`expected spacing tokens; got ${JSON.stringify(summary.spacingEntries)}`)
  }
  if (!summary.typographyEntries.some(entry => entry.value === 'fontSize:14')) {
    throw new Error(`expected typography tokens; got ${JSON.stringify(summary.typographyEntries)}`)
  }
}

export function testDesignTokenSummaryReusesSemanticKeyedCache() {
  const graph = makeGraph()
  const first = summarizeDesignTokens({ graphData: graph, graphRevision: 7, maxEntries: 8 })
  const second = summarizeDesignTokens({ graphData: graph, graphRevision: 7, maxEntries: 8 })
  if (first !== second) throw new Error('expected unchanged graph revision to reuse semantic-keyed token summary cache')
}

export async function testDesignContextReviewProvenance() {
  const { buildDesignContext, serializeDesignContext } = await import('@/features/design/designContext')
  const graph: GraphData = { type: 'Graph', nodes: [{ id: 'card', label: 'Card', type: 'Frame', properties: {
    fill: '#ffffff', color: '#777777', backgroundColor: '#ffffff', opacity: 1,
    designTokens: { fill: 'canvas-accent', missing: 'unknown-token' },
  } }], edges: [] }
  const before = JSON.stringify(graph)
  const args = { active: true, graphData: graph, graphRevision: 1, theme: 'light' as const,
    documentName: 'review.md', markdown: '---\ndesign:\n  intent: Clear reading order\n---\n# Review' }
  const context = buildDesignContext(args)
  assert.ok(context.available)
  assert.equal(context.intent.intent, 'Clear reading order')
  assert.equal(context.intent.motion, null)
  assert.ok(context.unresolved.includes('motion'))
  assert.equal(context.tokens.length, 49)
  for (const rule of ['token-reference', 'token-value', 'declared-contrast']) {
    assert.ok(context.audit.findings.some(f => f.rule === rule && f.nodeId === 'card' && f.path && f.action))
  }
  assert.ok(context.audit.matches.some(match => match.path === 'properties.fill'))
  assert.equal(JSON.stringify(graph), before, 'Inspection must not mutate graph data')
  assert.deepEqual(JSON.parse(serializeDesignContext(context, 'json', context.semanticKey)), context)
  assert.ok(serializeDesignContext(context, 'markdown', context.semanticKey).includes(context.tokenRevision))
  assert.throws(() => serializeDesignContext(context, 'json', 'stale'), /changed/)
  assert.throws(() => serializeDesignContext(context, 'css' as 'json', context.semanticKey), /Unsupported/)
  const dark = buildDesignContext({ ...args, theme: 'dark' })
  assert.ok(dark.available)
  assert.notEqual(dark.semanticKey, context.semanticKey)
  const changedIntent = buildDesignContext({ ...args, markdown: '---\ndesign:\n  intent: Touch navigation\n---' })
  assert.ok(changedIntent.available)
  assert.notEqual(changedIntent.semanticKey, context.semanticKey)
  graph.nodes[0].properties!.fill = '#000000'
  const changedValue = buildDesignContext(args)
  assert.ok(changedValue.available)
  assert.notEqual(changedValue.semanticKey, context.semanticKey, 'Changed source content must invalidate even without a revision bump')
  const unsupported = buildDesignContext({ ...args, graphData: { type: 'Graph', nodes: [{ id: 'unknown', label: 'Unknown', type: 'Frame', properties: {
    color: '#fff', backgroundColor: '#000', opacity: 0.5,
  } }], edges: [] } })
  assert.ok(unsupported.available)
  assert.equal(unsupported.audit.status, 'unassessed')
  assert.ok(unsupported.audit.findings.some(f => f.severity === 'unassessed'))
  const opaque = buildDesignContext({ ...args, graphData: { type: 'Graph', nodes: [{ id: 'opaque', label: 'Opaque', type: 'Frame', properties: {
    color: '#fff', backgroundColor: '#000', opacity: 1,
  } }], edges: [] } })
  assert.ok(opaque.available)
  assert.equal(opaque.audit.checked, 1)
  assert.equal(opaque.audit.findings.length, 0)
  const hostile = '</script><img src=x onerror=alert(1)> ``` [link](https://invalid.example)'
  const escaped = buildDesignContext({ ...args, markdown: `---\ndesign:\n  intent: ${JSON.stringify(hostile)}\n---` })
  assert.ok(escaped.available)
  const markdown = serializeDesignContext(escaped, 'markdown', escaped.semanticKey)
  assert.ok(!markdown.includes('<img') && !markdown.includes('```') && !markdown.includes('[link]('))
  assert.ok(!serializeDesignContext(escaped, 'json', escaped.semanticKey).includes('</script>'))
  const inherited = buildDesignContext({ ...args, markdown: '---\n__proto__: { design: { intent: Inherited } }\n---' })
  assert.ok(inherited.available)
  assert.equal(inherited.intent.intent, null)
}

export async function testDesignContextBoundsAndInvalidation() {
  const { buildDesignContext, serializeDesignContext } = await import('@/features/design/designContext')
  const args = { active: true, graphData: makeGraph(), graphRevision: 1, theme: 'light' as const }
  const empty = buildDesignContext({ ...args, graphData: null })
  assert.ok(empty.available)
  assert.equal(empty.audit.status, 'unassessed')
  assert.equal(empty.audit.checked, 0)
  const inactive = buildDesignContext({ ...args, active: false })
  assert.equal(inactive.status, 'inactive')
  assert.throws(() => serializeDesignContext(inactive, 'json', ''), /inactive/)
  for (const markdown of [
    '---\ndesign: []\n---', '---\ndesign:\n  unknown: field\n---',
    '---\ndesign:\n  intent: Text\n---invalid', '---\ndesign: 2026-09-21\n---',
    '---\ndesign:\n  intent: 123\n---', '---\ndesign:\n  intent: ' + 'x'.repeat(513) + '\n---',
    '---\ndesign:\n  intent: [\n---', '---\n' + 'x'.repeat(8192),
    '---\na: &a [1, 1, 1, 1]\nb: &b [*a, *a, *a, *a]\nc: &c [*b, *b, *b, *b]\nd: &d [*c, *c, *c, *c]\ne: &e [*d, *d, *d, *d]\nf: [*e, *e, *e, *e]\n---',
  ]) assert.equal(buildDesignContext({ ...args, markdown }).status, 'invalid', markdown.slice(0, 80))
  const many: GraphData = { type: 'Graph', nodes: Array.from({ length: 2001 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, type: 'Frame', properties: {} })), edges: [] }
  const summary = summarizeDesignTokens({ graphData: many, graphRevision: 5 })
  assert.equal(summary.scannedNodes, 2000)
  assert.equal(summary.nodeCount, 2001)
  assert.equal(summary.truncated, true)
  assert.notEqual(summarizeDesignTokens({ graphData: many, graphRevision: 5 }), summary, 'Partial scans must not be cached as complete')
  const wide: GraphData = { type: 'Graph', nodes: [{ id: 'wide', label: 'Wide', type: 'Frame', properties: Object.fromEntries(
    Array.from({ length: 10001 }, (_, i) => [`field${i}`, i])) }], edges: [] }
  const bounded = summarizeDesignTokens({ graphData: wide })
  assert.ok(bounded.visitedProperties <= 10000)
  assert.ok(bounded.observations.length <= 256)
  assert.equal(bounded.totalProperties, null)
  assert.equal(bounded.truncated, true)
  for (const rejectedBy of ['path', 'depth'] as const) {
    let reads = 0
    const siblings: Record<string, unknown> = {}
    for (let i = 0; i <= DESIGN_SCAN_LIMITS.properties; i++) {
      const key = rejectedBy === 'path' ? `${'x'.repeat(257)}${i}` : `field${i}`
      Object.defineProperty(siblings, key, { enumerable: true, get: () => { reads++; return 1 } })
    }
    Object.defineProperty(siblings, 'afterBudget', { enumerable: true,
      get: () => { throw new Error(`${rejectedBy}: read a sibling after the property budget`) } })
    let properties: Record<string, unknown> = siblings
    if (rejectedBy === 'depth') for (let i = 0; i < DESIGN_SCAN_LIMITS.depth; i++) properties = { nested: properties }
    const rejected = summarizeDesignTokens({ graphData: {
      type: 'Graph', nodes: [{ id: rejectedBy, properties }], edges: [],
    } as GraphData })
    assert.ok(reads > 0 && reads < DESIGN_SCAN_LIMITS.properties, `${rejectedBy}: sibling reads are bounded`)
    assert.equal(rejected.visitedProperties, DESIGN_SCAN_LIMITS.properties)
    assert.equal(rejected.truncated, true)
  }
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
  const cycle = summarizeDesignTokens({ graphData: { type: 'Graph', nodes: [{ id: 'cycle', properties: cyclic }], edges: [] } as GraphData })
  assert.equal(cycle.truncated, true)
  const excessive: GraphData = { type: 'Graph', nodes: Array.from({ length: 150 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, type: 'Frame', properties: { fill: 'var(--kg-missing)' } })), edges: [] }
  const context = buildDesignContext({ ...args, graphData: excessive })
  assert.ok(context.available)
  assert.ok(context.audit.findings.length <= 100)
  assert.equal(context.audit.truncated, true)
}

export async function testDesignFrontmatterTraversalBounds() {
  const { parseMarkdownFrontmatter } = await import('@/lib/markdown')
  const limits = { maxNodes: 64, maxDepth: 16 }
  const lines = ['---', 'a: &a [1, 1, 1, 1]']
  for (let i = 1; i < 7; i++) {
    const name = String.fromCharCode(97 + i), prior = String.fromCharCode(96 + i)
    lines.push(`${name}: &${name} [*${prior}, *${prior}, *${prior}, *${prior}]`)
  }
  lines.push('---')
  assert.equal(parseMarkdownFrontmatter(lines).warnings.length, 0, 'Existing callers retain their normal parsing contract')
  for (const input of [lines, ['---', 'a: &a { self: *a }', '---']]) {
    const bounded = parseMarkdownFrontmatter(input, limits)
    assert.deepEqual(bounded.meta, {})
    assert.ok(bounded.warnings.some(warning => warning.includes('traversal limit')))
  }
  const valid = parseMarkdownFrontmatter(['---', 'design:', '  intent: Local review', '---'], limits)
  assert.deepEqual(valid.meta, { design: { intent: 'Local review' } })
  assert.deepEqual(valid.warnings, [])
  const shallow = parseMarkdownFrontmatter(['---', 'design: { intent: Local review }', '---'], { ...limits, maxDepth: 1 })
  assert.ok(shallow.warnings.some(warning => warning.includes('traversal limit')))
  const data = parseMarkdownFrontmatter(['---', '__proto__: { design: { intent: Inherited } }', '---'], limits).meta
  assert.equal(Object.getPrototypeOf(data), Object.prototype)
  assert.equal(Object.hasOwn(data, '__proto__'), true)
  assert.equal(data.design, undefined, 'Prototype-shaped data must not invent authored Design intent')
  assert.throws(() => parseMarkdownFrontmatter([], { maxNodes: Infinity, maxDepth: 16 }), /Invalid/)
}
