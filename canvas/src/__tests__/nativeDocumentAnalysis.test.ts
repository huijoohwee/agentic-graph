import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectKeywordEvidence, KEYWORD_TEXT_LIMIT } from '@/lib/semantic-mode/keywordEvidence'
import { normalizeEntityKey, segmentWordsWithOffsets, splitSentencesWithOffsets } from '@/lib/graph/textAnalysis/utils'
import { deriveKeywordGraphFromText } from '@/lib/semantic-mode/keywordGraph.impl'
import { buildDashboardCanvasModel } from '@/components/DashboardCanvas/dashboardModel'

test('native analysis preserves Unicode and original source offsets', () => {
  assert.equal(normalizeEntityKey('Cafe\u0301 東京 Ελληνικά'), 'café 東京 ελληνικά')
  const text = 'Café systems help. Cafe\u0301 systems grow. 東京の研究。東京の研究。'
  const result = collectKeywordEvidence(text, ['café systems', '東京'], 'ja')
  const phrase = result.byKey.get('café systems')!
  assert.equal(phrase.frequency, 2)
  assert.equal(phrase.spread, 2)
  assert.equal(result.byKey.get('東京')!.frequency, 2)
  for (const item of result.byKey.values()) for (const context of item.contexts) {
    assert.equal(text.slice(context.start, context.end), context.match)
    assert.ok(context.text.includes(context.match))
  }
})

test('matching uses complete tokens and does not join separate sentences or lines', () => {
  const text = 'Cat catalog cat. Silver. River. Silver\nriver. Silver river.'
  const result = collectKeywordEvidence(text, ['cat', 'silver river'])
  assert.equal(result.byKey.get('cat')!.frequency, 2)
  assert.equal(result.byKey.get('silver river')!.frequency, 1)
  assert.equal(result.byKey.get('silver river')!.contexts[0]!.line, 2)
})

test('context storage is bounded independently of occurrence counts', () => {
  const result = collectKeywordEvidence('Quartz tools improve.\n'.repeat(30), ['Quartz tools'])
  const evidence = result.byKey.get('quartz tools')!
  assert.equal(evidence.frequency, 30)
  assert.equal(evidence.contexts.length, 3)
  assert.equal(evidence.distribution.reduce((sum, value) => sum + value, 0), 30)
  assert.equal(result.truncated, false)
  const bounded = collectKeywordEvidence(' '.repeat(KEYWORD_TEXT_LIMIT) + 'Quartz tools', ['Quartz tools'])
  assert.equal(bounded.byKey.get('quartz tools')!.frequency, 0)
  assert.equal(bounded.truncated, true)
  const partial = collectKeywordEvidence(' '.repeat(KEYWORD_TEXT_LIMIT - 3) + 'catalog', ['cat', 'catalog'])
  assert.equal(partial.byKey.get('cat')!.frequency, 0)
  assert.equal(partial.byKey.get('catalog')!.frequency, 0)
  assert.equal(partial.truncated, true)
})

test('Unicode fallback is explicit and retains source positions', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
  Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true })
  try {
    const text = 'Καλημέρα κόσμε。Bonjour café!'
    const words = segmentWordsWithOffsets(text)
    assert.equal(words[0]!.raw, 'Καλημέρα')
    assert.equal(text.slice(words[1]!.start, words[1]!.end), 'κόσμε')
    assert.equal(splitSentencesWithOffsets(text).length, 2)
    assert.equal(collectKeywordEvidence(text, ['café']).policy, 'unicode-fallback-v1')
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor)
    else Reflect.deleteProperty(Intl, 'Segmenter')
  }
})

test('graph frequencies are occurrences while ranking stays separate', () => {
  const fetchBefore = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('Analysis must not request a network service') }) as typeof fetch
  try {
    const text = 'Quartz tools help teams. Quartz tools support teams. Quartz tools connect teams.'
    const { graph, nodeCountsById } = deriveKeywordGraphFromText({ documentId: 'opaque-source', documentText: text })
    const node = graph.nodes.find(node => node.properties?.['keyword:key'] === 'quartz tools')!
    assert.ok(node)
    assert.equal(node.properties?.['keyword:frequency'], 3)
    assert.equal(nodeCountsById.get(node.id), 3)
    assert.ok(Number(node.properties?.['keyword:importance']) > 3)
    for (const node of graph.nodes) assert.ok(Number.isInteger(node.properties?.['keyword:frequency']))
    const model = buildDashboardCanvasModel(graph, null)
    const section = model.sections.find(section => section.id === 'keyword-evidence')!
    assert.equal(section.cards.find(card => card.id === 'keyword-occurrences')!.rows.find(row => row.id === node.id)!.value, '3')
    assert.ok(model.metrics.some(metric => metric.id === 'nodes'))
    assert.ok(model.metrics.some(metric => metric.id === 'edges'))
    assert.ok(model.metrics.some(metric => metric.id === 'clusters'))
    assert.ok(graph.edges.every(edge => ['heuristic', 'co-occurrence'].includes(String(edge.properties?.['keyword:evidenceKind']))))
  } finally { globalThis.fetch = fetchBefore }
})

test('generic graph dashboards stay independent of text evidence', () => {
  const model = buildDashboardCanvasModel({ type: 'Graph', nodes: [{ id: 'n', type: 'Item', label: 'Item', properties: { 'visual:community': 0 } }], edges: [] }, null)
  assert.ok(!model.sections.some(section => section.id === 'keyword-evidence'))
  assert.equal(model.metrics.find(metric => metric.id === 'clusters')!.value, '1')
})
