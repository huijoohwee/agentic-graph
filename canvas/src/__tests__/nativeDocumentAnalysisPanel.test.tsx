import { collectTextSelectionMatchHighlightRects, useTextSelectionMatchHighlights } from '@/lib/ui/textSelectionMatchHighlights'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import DocumentKeywordInsights from '@/features/panels/views/DocumentKeywordInsights'
import { registerDocumentInsightsSource, readDocumentInsights, selectDocumentKeyword } from '@/features/markdown-workspace/documentInsightsRuntime'
import { indexDocumentSignals } from '@/lib/websites/signalTokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import { hashText } from '@/features/parsers/hash'

test('phrase controls show source context, follow selection and reject stale navigation', async () => {
  const env = initJsdomHarness()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const previous = useGraphStore.getState()
  const visited: number[] = []
  const text = 'Quartz tools help.\nQuartz tools grow.\nSilver river flows.'
  const source = { key: 'opaque-source', text, signals: indexDocumentSignals(text), revealLine: (line: number) => visited.push(line) }
  let dispose = registerDocumentInsightsSource(source)
  try {
    await act(async () => root.render(<DocumentKeywordInsights source={source} />))
    const phrases = host.querySelector('textarea')!
    await act(async () => { phrases.value = 'Quartz tools\nSilver river'; Simulate.change(phrases) })
    assert.match(host.textContent!, /2 occurrences/)
    assert.match(host.textContent!, /Quartz tools help/)
    await act(async () => useGraphStore.setState({ selectedNodeId: `kw:entity:${hashText('silver river')}`, selectedNodeIds: [] }))
    assert.match(host.textContent!, /1 occurrences/)
    assert.equal(host.querySelector('button[aria-pressed="true"]')?.textContent, 'Silver river · 1')
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')!.click())
    assert.deepEqual(readDocumentInsights().keyword, { text: 'Silver river', locale: 'und' })
    const jump = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Jump to source'))!
    await act(async () => jump.click())
    assert.deepEqual(visited, [3])
    dispose()
    dispose = registerDocumentInsightsSource({ ...source, text: 'Replacement source' })
    assert.equal(readDocumentInsights().keyword, null)
    assert.equal(selectDocumentKeyword(source, { text: 'Quartz tools', locale: 'und' }), false)
    await act(async () => jump.click())
    assert.deepEqual(visited, [3])
    assert.match(host.textContent!, /Source changed/)
    const language = host.querySelector('input')!
    await act(async () => { language.value = 'not_a_language'; Simulate.change(language) })
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /valid language tag/)
  } finally {
    dispose()
    await act(async () => root.unmount())
    useGraphStore.setState({ selectedNodeId: previous.selectedNodeId, selectedNodeIds: previous.selectedNodeIds })
    env.restore()
  }
})

test('Viewer phrases match complete Unicode tokens across inline markup within bounded geometry', () => {
  const env = initJsdomHarness()
  const matches: string[] = []
  const box = { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({}) } as DOMRect
  env.dom.window.Range.prototype.getClientRects = function () { matches.push(this.toString()); return [box] as unknown as DOMRectList }
  const element = document.createElement('section')
  element.innerHTML = '<p>QUARTZ <strong>tools</strong> work; quartz toolset differs.</p><p>Quartz</p><p>tools</p><button>Quartz tools</button><p aria-hidden="true">Quartz tools</p>'
  document.body.append(element)
  try {
    const phrase = { text: 'quartz tools', locale: 'en' }
    assert.equal(collectTextSelectionMatchHighlightRects({ root: element, phrase }).length, 1)
    assert.deepEqual(matches, ['QUARTZ tools'])
    element.innerHTML = '<p style="overflow:hidden;text-overflow:ellipsis">Quartz tools</p>'
    element.firstElementChild!.getBoundingClientRect = () => ({ ...box, width: 5, right: 5 })
    assert.equal(collectTextSelectionMatchHighlightRects({ root: element, phrase }).length, 0)
    element.innerHTML = '<p>Cafe\u0301. Café. cafe.</p>'
    assert.equal(collectTextSelectionMatchHighlightRects({ root: element, phrase: { text: 'café', locale: 'fr' } }).length, 2)
    element.innerHTML = `<p>${'quartz tools. '.repeat(500)}</p>`
    assert.equal(collectTextSelectionMatchHighlightRects({ root: element, phrase, maxRects: 9999 }).length, 300)
    element.innerHTML = `<p>${' '.repeat(60000)}quartz tools</p>`
    assert.equal(collectTextSelectionMatchHighlightRects({ root: element, phrase }).length, 0)
    assert.equal(collectTextSelectionMatchHighlightRects({ root: element, phrase: { ...phrase, locale: 'invalid_locale' } }).length, 0)
  } finally { env.restore() }
})

test('Viewer overlays follow toggles and rendered content without changing native selection', async () => {
  const env = initJsdomHarness()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const box = { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({}) } as DOMRect
  env.dom.window.Range.prototype.getClientRects = () => [box] as unknown as DOMRectList
  function Viewer({ enabled, content = 'Quartz tools. Quartz tools.' }: { enabled: boolean; content?: string }) {
    const ref = React.useRef<HTMLElement>(null)
    const rects = useTextSelectionMatchHighlights({ rootRef: ref, phrase: enabled ? { text: 'quartz tools', locale: 'en' } : null })
    return <section ref={ref}><p>{content}</p><output aria-hidden="true">{rects.length}</output></section>
  }
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 45)) })
  try {
    await act(async () => root.render(<Viewer enabled />)); await settle()
    assert.equal(host.querySelector('output')!.textContent, '2')
    assert.equal(window.getSelection()!.toString(), '')
    await act(async () => root.render(<Viewer enabled content="Quartz tools." />)); await settle()
    assert.equal(host.querySelector('output')!.textContent, '1')
    await act(async () => root.render(<Viewer enabled={false} />)); await settle()
    assert.equal(host.querySelector('output')!.textContent, '0')
    await act(async () => root.render(<Viewer enabled />)); await settle()
    assert.equal(host.querySelector('output')!.textContent, '2')
  } finally { await act(async () => root.unmount()); env.restore() }
})
