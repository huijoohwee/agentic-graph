import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import DocumentKeywordInsights from '@/features/panels/views/DocumentKeywordInsights'
import { registerDocumentInsightsSource } from '@/features/markdown-workspace/documentInsightsRuntime'
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
    const jump = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Jump to source'))!
    await act(async () => jump.click())
    assert.deepEqual(visited, [3])
    dispose()
    dispose = registerDocumentInsightsSource({ ...source, text: 'Replacement source' })
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
