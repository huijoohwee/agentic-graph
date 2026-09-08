import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import SearchPanel from '@/components/SearchPanel'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testSearchPanelSelectionRequestsSharedSelectionZoom() {
  const prior = useGraphStore.getState()
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const calls: string[] = []
  let commits = 0
  try {
    useGraphStore.setState({
      graphId: 'test:toolbar-search-selection', graphDataRevision: Number(prior.graphDataRevision || 0) + 1,
      graphData: { type: 'graph', metadata: {}, nodes: [
        { id: 'n1', type: 'Entity', label: 'Invoice Alpha', properties: {} },
        { id: 'n2', type: 'Entity', label: 'Invoice Beta', properties: {} },
      ], edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'Invoice link', properties: {} }] },
      canvasRenderMode: '2d',
      selectNode: id => { calls.push(`node:${id}`) },
      selectEdge: id => { calls.push(`edge:${id}`) },
      setSelectionSource: source => { calls.push(`source:${source}`) },
      requestZoom: type => { calls.push(`zoom:${type}`) },
    })
    await act(async () => { root.render(React.createElement(React.Profiler, { id: 'search', onRender: () => { commits += 1 } },
      React.createElement(SearchPanel, { onClose: () => { calls.push('close') } }))) })
    const input = container.querySelector('input')!
    await act(async () => { Simulate.change(input, { target: { value: 'Invoice' } } as never) })
    for (let i = 0; i < 100 && container.querySelectorAll('[role="option"]').length < 3; i += 1) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    }
    const options = Array.from(container.querySelectorAll('[role="option"]')) as HTMLElement[]
    assert.equal(options.length, 3, 'search must expose each matching node and edge for selection')
    assert.equal(input.getAttribute('role'), 'combobox')
    assert.equal(input.getAttribute('aria-controls'), container.querySelector('[role="listbox"]')?.id)
    const beforeUnrelated = commits
    await act(async () => { useGraphStore.setState({ selectedNodeIds: ['unrelated'] }) })
    assert.equal(commits, beforeUnrelated, 'unrelated selection state must not rerender or reschedule search')
    const clicked = options.find(option => option.dataset.kgSearchResultId === 'n2')!
    await act(async () => { Simulate.click(clicked) })
    assert.deepEqual(calls.splice(0), ['source:menu', 'node:n2', 'zoom:selection', 'close'])
    await act(async () => { Simulate.keyDown(input, { key: 'ArrowDown' }) })
    const activeId = input.getAttribute('aria-activedescendant')
    const active = options.find(option => option.id === activeId)!
    assert.ok(active, 'keyboard selection must identify a rendered active option')
    assert.equal(active.getAttribute('aria-selected'), 'true')
    await act(async () => { Simulate.keyDown(input, { key: 'Enter' }) })
    assert.deepEqual(calls.splice(0), ['source:menu', `${active.dataset.kgSearchResultKind}:${active.dataset.kgSearchResultId}`, 'zoom:selection', 'close'])
    await act(async () => { Simulate.click(options.find(option => option.dataset.kgSearchResultId === 'e1')!) })
    assert.deepEqual(calls.splice(0), ['source:menu', 'edge:e1', 'zoom:selection', 'close'])
    await act(async () => { Simulate.keyDown(input, { key: 'Escape' }) })
    assert.equal(input.value, '')
    assert.equal(container.querySelectorAll('[role="option"]').length, 0)
    await act(async () => { Simulate.keyDown(input, { key: 'Enter' }) })
    assert.deepEqual(calls, [], 'empty results must not select or close')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    useGraphStore.setState(prior, true)
    restore()
  }
}
