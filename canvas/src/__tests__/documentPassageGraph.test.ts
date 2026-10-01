import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveDocumentPassageGraph, PassageGraphError, PASSAGE_LIMITS } from '@/lib/parsers/documentPassageGraph'

test('passages preserve original CRLF ranges, duplicate occurrences and metadata exclusion', () => {
  const text = '---\r\ntitle: Notebook\r\n---\r\n# Field notes\r\n\r\nCopper lamps glow.\r\n\r\nCopper lamps glow.\r\n\r\n> Keep this quote.\r\n\r\n```txt\r\n[link](#field-notes)\r\n```\r\n\r\n| Item | Qty |\r\n| --- | --- |\r\n| Wire | 2 |\r\n'
  const result = deriveDocumentPassageGraph({ documentId: 'opaque-one', text })
  assert.equal(result.partial, false)
  assert.equal(result.passages.filter(p => p.text === 'Copper lamps glow.').length, 2)
  assert.equal(new Set(result.passages.map(p => p.id)).size, result.passages.length)
  assert.ok(result.passages.every(p => p.text === text.slice(p.start, p.end) && p.line >= 4))
  assert.ok(result.passages.some(p => p.kind === 'quote'))
  assert.ok(result.passages.some(p => p.kind === 'table'))
  assert.equal(result.passages.find(p => p.kind === 'code')?.references.length, 0)
  const heading = result.passages[0]!
  assert.ok(result.passages.slice(1).every(p => p.section === heading.id))
})

test('references stay inert and unresolved targets never create dangling edges', () => {
  const previous = globalThis.fetch
  let requests = 0
  globalThis.fetch = (() => { requests++; throw new Error('network forbidden') }) as typeof fetch
  try {
    const text = '# Local notes\n\n[Inside](#local-notes) [Outside](https://validation.invalid/topic) [Missing](#missing)\n\n![Diagram](https://validation.invalid/picture.png)\n\n![Empty](data:,)'
    const result = deriveDocumentPassageGraph({ documentId: 'opaque-two', text })
    const links = result.passages[1]!.references
    assert.equal(links.filter(link => link.status === 'resolved').length, 1)
    assert.equal(links.filter(link => link.status === 'unresolved').length, 2)
    const ids = new Set(result.graph.nodes.map(node => node.id))
    assert.ok(result.graph.edges.every(edge => ids.has(edge.source) && ids.has(edge.target)))
    assert.ok(result.passages.slice(2).every(p => p.kind === 'media'))
    assert.equal(requests, 0)
  } finally { globalThis.fetch = previous }
})

test('mutual lexical neighbors have bounded degree and reproducible evidence', () => {
  const input = { documentId: 'opaque-three', text: Array.from({ length: 12 }, (_, i) => `Copper lamps illuminate rooms number ${i}.`).join('\n\n'), k: 2 }
  const first = deriveDocumentPassageGraph(input)
  for (let run = 0; run < 2; run++) assert.deepEqual(deriveDocumentPassageGraph(input).graph, first.graph)
  const edges = first.graph.edges.filter(e => e.label === 'similar_to')
  assert.ok(edges.length)
  for (const node of first.graph.nodes) assert.ok(edges.filter(e => e.source === node.id || e.target === node.id).length <= 2)
  for (const edge of edges) {
    assert.ok(Number(edge.properties['passage:score']) >= 0 && Number(edge.properties['passage:score']) <= 1)
    assert.ok(Array.isArray(edge.properties['passage:terms']))
    assert.ok(Array.isArray(edge.properties['passage:ranges']))
    assert.equal(edge.properties['passage:method'], 'lexical-tfidf-cosine-v1')
  }
})

test('computed groups never combine disconnected topics or invent isolate memberships', () => {
  const text = ['Copper lamps illuminate rooms.', 'Copper lamps brighten rooms.', 'Volcanoes reshape basalt islands.', 'Volcanoes reshape rocky islands.', 'Zebras migrate.'].join('\n\n')
  const result = deriveDocumentPassageGraph({ documentId: 'opaque-four', text })
  assert.equal(result.groups.length, 2)
  assert.ok(result.groups.every(group => group.members.length === 2))
  assert.ok(!result.groups.some(group => group.members.includes(result.passages[4]!.id)))
  for (const group of result.groups) {
    const reached = new Set([group.members[0]!])
    for (let i = 0; i < group.members.length; i++) for (const edge of result.graph.edges.filter(e => e.label === 'similar_to')) {
      if (group.members.includes(edge.source) && group.members.includes(edge.target) && (reached.has(edge.source) || reached.has(edge.target))) { reached.add(edge.source); reached.add(edge.target) }
    }
    assert.equal(reached.size, group.members.length)
  }
  const renamed = deriveDocumentPassageGraph({ documentId: 'another-name', text })
  assert.deepEqual(renamed.groups.map(g => g.terms), result.groups.map(g => g.terms))
})

test('exclusion is explicit and source structure remains recoverable', () => {
  const text = '# Links\n\n[Quartz tools](https://validation.invalid/a)\n\nQuartz tools improve work.\n\nQuartz tools support work.'
  const result = deriveDocumentPassageGraph({ documentId: 'opaque-five', text, excludeLinkOnly: true })
  const excluded = result.passages.find(p => p.excluded)!
  assert.ok(excluded && excluded.notice)
  assert.ok(result.graph.edges.some(e => e.target === excluded.id && e.label === 'contains'))
  assert.ok(!result.graph.edges.some(e => e.label === 'similar_to' && (e.source === excluded.id || e.target === excluded.id)))
  assert.ok(!deriveDocumentPassageGraph({ documentId: 'opaque-five', text }).passages.some(p => p.excluded))
})

test('bounds fail visibly; malformed metadata, cancellation and invalid options reject', () => {
  const derive = (text: string) => deriveDocumentPassageGraph({ documentId: 'bounded', text })
  assert.throws(() => derive('a'.repeat(PASSAGE_LIMITS.characters + 1)), (e: unknown) => e instanceof PassageGraphError && e.code === 'input-limit')
  assert.throws(() => derive('---\ntitle: [broken\n---\nBody.'), /metadata/)
  assert.throws(() => derive('---\nUnclosed metadata.'), /metadata/)
  assert.throws(() => derive('---\na: &a [*a]\n---\nBody.'), /metadata/)
  for (const k of [NaN, Infinity, 0, 5, 2.5]) assert.throws(() => deriveDocumentPassageGraph({ documentId: 'bounded', text: 'text', k }), /k from/)
  assert.throws(() => deriveDocumentPassageGraph({ documentId: 'bounded', text: 'text', locale: 'not_a_tag' }), /language tag/)
  const abort = new AbortController(); abort.abort()
  assert.throws(() => deriveDocumentPassageGraph({ documentId: 'bounded', text: 'text' }, { signal: abort.signal }), /cancelled/)
  let time = 0
  assert.throws(() => deriveDocumentPassageGraph({ documentId: 'bounded', text: 'Paragraph.\n\nAnother.' }, { now: () => time += 6000 }), /time limit/)
  const partial = derive(Array.from({ length: 202 }, (_, i) => `Passage ${i}.`).join('\n\n'))
  assert.equal(partial.passages.length, 200); assert.equal(partial.partial, true); assert.ok(partial.reasons.includes('passage-limit'))
})

test('Unicode and fallback segmentation preserve source ranges without claiming language parity', () => {
  for (const [locale, text] of [['en', 'Café lamps glow.\n\nCafe\u0301 lamps glow.'], ['ms', 'Lampu menerangi bilik.\n\nLampu menyinari bilik.'], ['zh', '灯光照亮房间。\n\n灯光照亮花园。']]) {
    const result = deriveDocumentPassageGraph({ documentId: 'languages', text: text!, locale })
    assert.ok(result.passages.every(p => text!.slice(p.start, p.end) === p.text))
  }
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!
  Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true })
  try { assert.equal(deriveDocumentPassageGraph({ documentId: 'fallback', text: 'Καλημέρα κόσμε。' }).policy, 'unicode-fallback-v1') }
  finally { Object.defineProperty(Intl, 'Segmenter', descriptor) }
})
