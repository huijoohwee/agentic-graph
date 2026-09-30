import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { indexDocumentSignals } from '@/lib/websites/signalTokens'
import { jumpToDocumentInsight, openDocumentInsights, readDocumentInsights, registerDocumentInsightsSource, type DocumentInsightsSource } from '@/features/markdown-workspace/documentInsightsRuntime'
import { installFloatingPanelBridge } from '@/features/toolbar/floatingPanelBridge'
import { isMainPanelTabKey } from '@/features/panels/mainPanelTabs'
import { useGraphStore } from '@/hooks/useGraphStore'

export function testDocumentInsightsSourceLocations() {
  const text = ['---', 'hidden: "$999 12:30"', '---', '# Notes', '[Docs](https://example.test/12:30)', '[Subscribe](https://example.test/$99)', 'Amount $20B; cost $1234/month; duration 1:02:03.', '```text', '$88 21:20', '```', '![Cost $20B](https://example.test/22:30)', 'Visit https://example.test/$765 and `example $50`.', '$20B'].join('\n')
  const index = indexDocumentSignals(text)
  assert.deepEqual(index.price.map(match => [match.label, match.count, match.lines]), [['[PRICE] $20B', 2, [7, 13]], ['[PRICE] $1234/month', 1, [7]]])
  assert.deepEqual(index.time.map(match => [match.label, match.lines]), [['[TIME] 1:02:03', [7]]])
  assert.deepEqual(index.nav[0].lines, [5])
  assert.deepEqual(index.cta[0].lines, [6])
  assert.equal(index.truncated, false)
  assert.deepEqual(indexDocumentSignals('$ 10/month and $20 berries').price.map(match => match.label), ['[PRICE] $ 10/month', '[PRICE] $20'])
  assert.equal(indexDocumentSignals('$7 and $7').truncated, false)
}

export function testDocumentInsightsBounds() {
  const groups = indexDocumentSignals(Array.from({ length: 30 }, (_, i) => `Value $${i + 1}`).join('\n'))
  assert.equal(groups.price.length, 24)
  assert.equal(groups.truncated, true)
  const locations = indexDocumentSignals(Array.from({ length: 11 }, () => '$7').join('\n'))
  assert.equal(locations.price[0].count, 11)
  assert.equal(locations.price[0].lines.length, 10)
  assert.equal(locations.truncated, true)
  const lines = indexDocumentSignals('\n'.repeat(8000) + '$42')
  assert.equal(lines.scannedLines, 8000)
  assert.equal(lines.price.length, 0)
  assert.equal(lines.truncated, true)
  const chars = indexDocumentSignals('x'.repeat(2_000_000) + '$42')
  assert.equal(chars.price.length, 0)
  assert.equal(chars.truncated, true)
  const longLine = indexDocumentSignals('['.repeat(4097) + '$10')
  assert.equal(longLine.price.length, 0)
  assert.equal(longLine.truncated, true)
}

export function testDocumentInsightsRejectStaleSource() {
  const visited: number[] = []
  const first: DocumentInsightsSource = { key: 'first.md', text: '# Heading\n$7', signals: indexDocumentSignals('# Heading\n$7'), revealLine: line => visited.push(line) }
  const disposeFirst = registerDocumentInsightsSource(first)
  assert.equal(jumpToDocumentInsight(first, 2), true)
  assert.equal(jumpToDocumentInsight(first, 3), false)
  const second = { ...first, key: 'second.md' }
  const disposeSecond = registerDocumentInsightsSource(second)
  disposeFirst()
  assert.equal(readDocumentInsights().source, second)
  assert.equal(jumpToDocumentInsight(first, 2), false)
  assert.equal(jumpToDocumentInsight(second, 2), true)
  disposeSecond()
  assert.equal(jumpToDocumentInsight(second, 2), false)
  assert.deepEqual(visited, [2, 2])
}

export function testDocumentInsightsFloatingRoute() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' })
  const prior = globalThis.window
  Object.assign(globalThis, { window: dom.window })
  const seen: unknown[] = []
  const cleanup = installFloatingPanelBridge({ openPropsPanel: () => {}, openRendererPanel: () => {}, openFloatingPanel: detail => seen.push(detail) })
  const oldView = useGraphStore.getState().floatingPanelView
  try {
    openDocumentInsights('price')
    assert.deepEqual(seen, [{ tab: 'preview', open: true }])
    assert.equal(readDocumentInsights().kind, 'price')
    assert.equal(isMainPanelTabKey('preview'), false)
    useGraphStore.getState().setFloatingPanelView('preview')
    assert.equal(useGraphStore.getState().floatingPanelView, 'preview')
  } finally {
    useGraphStore.getState().setFloatingPanelView(oldView)
    cleanup()
    Object.assign(globalThis, { window: prior })
    dom.window.close()
  }
}
