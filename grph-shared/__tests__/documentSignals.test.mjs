import assert from 'node:assert/strict'
import test from 'node:test'
import { indexDocumentSignals, summarizeCategorizedSignalsFromMarkdown } from '../dist/websites/signalTokens.js'

const counts = index => Object.fromEntries(['nav', 'cta', 'price', 'time'].map(kind =>
  [kind, index[kind].map(({ label, count }) => ({ label, count }))]))

test('summary and insights share visible-content rules and source locations', () => {
  const markdown = [
    '---', 'title: "[Start](https://example.test) $99 03:00"', '---',
    '[Start](https://example.test/$88/02:00) $9 01:30',
    '```text', '[Start](https://example.test) $99 03:00', '```',
    '    [Start](https://example.test) $99 03:00',
    '`[Start](https://example.test) $99 03:00`',
    '![Start $99 03:00](https://example.test)',
    '[Docs](https://example.test) $9 01:30',
  ].join('\n')
  const index = indexDocumentSignals(markdown)
  assert.deepEqual(summarizeCategorizedSignalsFromMarkdown(markdown), counts(index))
  assert.deepEqual(index.cta, [{ label: '[CTA] Start', count: 1, lines: [4] }])
  assert.deepEqual(index.price, [{ label: '[PRICE] $9', count: 2, lines: [4, 11] }])
  assert.deepEqual(index.time, [{ label: '[TIME] 01:30', count: 2, lines: [4, 11] }])
  assert.equal(index.nav[0].label, '[NAV] Docs')
})

test('summary limits project the shared bounded scan without leaking locations', () => {
  const text = '$9\n$10\n$9'
  assert.deepEqual(summarizeCategorizedSignalsFromMarkdown(text, { maxLines: 2, maxPerKind: 1 }),
    counts(indexDocumentSignals(text, { maxLines: 2, maxGroups: 1 })))
  assert.deepEqual(summarizeCategorizedSignalsFromMarkdown(text, { maxLines: 0 }).price, [])
  const long = Array.from({ length: 8001 }, () => '$9').join('\n')
  const index = indexDocumentSignals(long, { maxLines: Infinity, maxGroups: NaN })
  assert.equal(index.price[0].count, 8000)
  assert.equal(index.price[0].lines.length, 10)
  assert.equal(index.truncated, true)
  assert.deepEqual(summarizeCategorizedSignalsFromMarkdown(long, { maxLines: 9000 }).price, counts(index).price)
})
