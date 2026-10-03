import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'

register(`data:text/javascript,${encodeURIComponent(`
import { readFileSync } from 'node:fs';
export function load(url, context, next) {
  if (url.startsWith('file:') && new URL(url).pathname.endsWith('.css')) {
    readFileSync(new URL(url));
    return { format: 'module', shortCircuit: true, source: 'export {};' };
  }
  return next(url, context);
}`)}`, import.meta.url)

test('actual warehouse labels and cues select whole shared rows; Scene clears actor selection', { timeout: 10000 }, async () => {
  const { WarehouseTimelinePanel } = await import('../features/python-learning/WarehouseTimelinePanel')
  const { pythonLearningRuntime: runtime } = await import('../features/python-learning/learningRuntime')
  const { WAREHOUSE_INSPECTION } = await import('../features/python-learning/warehouseCoverageRoutes')
  const { useGraphStore: store } = await import('../hooks/useGraphStore')
  const env = initJsdomHarness(), initial = store.getState()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  const ids = ['scene', ...new Set(WAREHOUSE_INSPECTION.cues.map(cue => `warehouse:${cue.actorId}`))]
  const lane = (id: string, kind = 'label') => host.querySelector<HTMLElement>(`[data-kg-video-sequence-display-lane-${kind}="${id}"]`)!
  const button = (id: string) => lane(id).querySelector<HTMLButtonElement>('button')!
  const selected = (selectedId: string) => {
    for (const id of ids) {
      for (const kind of ['label', 'row']) {
        assert.equal(lane(id, kind).classList.contains(`timeline-video-sequence-lane-${kind}--selected`), id === selectedId)
        assert.equal(lane(id, kind).getAttribute('aria-current'), id === selectedId ? 'true' : null)
      }
      assert.equal(button(id).getAttribute('aria-pressed'), String(id === selectedId))
    }
  }
  const click = (node: HTMLElement) => act(async () => node.click())
  try {
    store.setState({ markdownDocumentText: '', markdownDocumentName: 'warehouse.py',
      mermaidDiagramSelectedRowKeyByKind: { ...initial.mermaidDiagramSelectedRowKeyByKind, gantt: '' } })
    runtime.bind({ workspaceId: 'lane-test', documentId: 'warehouse.py', lessonId: 'drone', source: 'takeoff(2)\nland()' })
    await act(async () => root.render(<WarehouseTimelinePanel />))
    await click([...host.querySelectorAll('button')].find(node => node.textContent === 'Open warehouse inspection')!)
    assert.ok(host.querySelector('[data-warehouse-inspection="active"]'))
    const selector = button('warehouse:drone001')
    assert.equal(selector.type, 'button')
    assert.equal(selector.tabIndex, 0)
    assert.equal(selector.getAttribute('aria-label'), 'Select Drone 001 timeline lane')
    await click(selector)
    selected('warehouse:drone001')
    assert.equal(store.getState().timelineTransportPosition, 0)
    const cue = WAREHOUSE_INSPECTION.cues.find(item => item.actorId === 'drone002' && item.startSeconds > 0)!
    const cueButton = [...lane('warehouse:drone002', 'row').querySelectorAll('button')].find(node => node.getAttribute('aria-label') === `Seek ${cue.label}`)!
    await act(async () => { store.getState().setTimelineTransportState({ playing: true }); cueButton.click() })
    selected('warehouse:drone002')
    assert.equal(store.getState().mermaidDiagramSelectedRowKeyByKind.gantt, 'warehouse:drone002')
    assert.ok(Math.abs(store.getState().timelineTransportPosition * 60 - cue.startSeconds) < 1e-7)
    assert.equal(store.getState().timelineTransportPlaying, false)
    await click(button('scene'))
    selected('scene')
    assert.equal(host.querySelectorAll('button button').length, 0)
    assert.equal(runtime.read().document?.source, 'takeoff(2)\nland()')
  } finally {
    await act(async () => root.unmount())
    runtime.dispose(); store.setState(initial); host.remove(); env.restore()
  }
})
