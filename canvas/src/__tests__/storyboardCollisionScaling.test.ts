import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useStoryboardCardOverlayProjection2d } from '@/components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d'
import { resolveCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import {
  settleStoryboardFixedCardCollisionItems2d as settle,
  storyboardFixedCardCollisionRectsOverlap2d as overlaps,
  type StoryboardFixedCardCollisionItem2d as Item,
  type StoryboardFixedCardCollisionRect2d as Rect,
} from '../components/StoryboardWidgetCanvas/storyboardFixedCardCollisionLayout2d'

// Independent exhaustive oracle for small layouts: nearest free boundary pair,
// Manhattan distance, then top/left tie order. Never used in the application.
function exhaustive(items: Item[], obstacles: Rect[], gapPx: number): Item[] {
  const result = items.filter(item => !item.movable)
  for (const item of items.filter(item => item.movable)) {
    const blockers = [...obstacles, ...result]
    if (!blockers.some(blocker => overlaps(item, blocker, gapPx))) { result.push(item); continue }
    const xs = new Set([item.left])
    const ys = new Set([item.top])
    for (const blocker of blockers) {
      xs.add(blocker.left - item.width - gapPx); xs.add(blocker.left + blocker.width + gapPx)
      ys.add(blocker.top - item.height - gapPx); ys.add(blocker.top + blocker.height + gapPx)
    }
    const candidates = [...xs].flatMap(left => [...ys].map(top => ({ ...item, left, top })))
      .filter(candidate => !blockers.some(blocker => overlaps(candidate, blocker, gapPx)))
      .sort((a, b) => (Math.abs(a.left - item.left) + Math.abs(a.top - item.top))
        - (Math.abs(b.left - item.left) + Math.abs(b.top - item.top)) || a.top - b.top || a.left - b.left)
    assert.ok(candidates[0])
    result.push(candidates[0])
  }
  return result
}

test('collision settlement preserves exhaustive nearest placement, pins and obstacle clearance', () => {
  let seed = 20260928
  const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max }
  for (let run = 0; run < 80; run++) {
    const items = Array.from({ length: 10 }, (_, i): Item => ({
      id: String(i), left: random(200) / 4 - 25, top: random(200) / 4 - 25,
      width: 10 + random(160) / 4, height: 10 + random(160) / 4, movable: i > 1,
    }))
    const obstacles = [{ id: 'media', left: -10, top: 0, width: 35, height: 65 }]
    const gapPx = run % 4
    assert.deepEqual(settle({ items, obstacles, gapPx }), exhaustive(items, obstacles, gapPx))
  }
})

test('dense 1000-card layout retains all cards without overlaps within an interaction budget', () => {
  const items = Array.from({ length: 1000 }, (_, i): Item => ({
    id: String(i), left: (i % 17) * 3, top: (i % 23) * 2,
    width: 300 + (i % 7), height: 180 + (i % 5), movable: i > 0,
  }))
  const start = performance.now()
  const result = settle({ items, obstacles: [], gapPx: 24 })
  const elapsed = performance.now() - start
  assert.equal(result.length, items.length)
  assert.deepEqual(result[0], items[0])
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) assert.equal(overlaps(result[i]!, result[j]!, 24), false)
  }
  assert.ok(elapsed < 3000, `settlement blocked for ${elapsed.toFixed(0)} ms`)
  console.log(`1000-card collision settlement: ${elapsed.toFixed(1)} ms`)
})

test('projection notifies edge observers once after every changed card is committed', async () => {
  const { restore } = initJsdomHarness()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const ids = Array.from({ length: 100 }, (_, i) => String(i))
  const elements = new Map(ids.map(id => [id, document.createElement('div')]))
  const nodes = ids.map(id => ({ id, label: id, type: 'Thing', properties: {}, x: 0, y: 0 }))
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const cards = buildStoryboardBoardModel({ graphData: { type: 'Graph', nodes, edges: [] }, graphRevision: 1 }).lanes.flatMap(lane => lane.cards)
  let project: (() => void) | null = null
  let transform = { x: 0, y: 0, k: 1 }
  let events = 0
  const observe = () => {
    events++
    for (const element of elements.values()) assert.equal(element.dataset.kgVectorPaintedOverlay, '1')
  }
  window.addEventListener('kg-storyboard-widget-geometry-committed', observe)
  function Harness() {
    useStoryboardCardOverlayProjection2d({
      active: true, cards,
      dragWorldOverrideByCardIdRef: { current: new Map() }, effectiveFlowWidgetPinnedByNodeId: null,
      fixedCardReferencePlacements: new Map(), fixedLayoutEnabled: true,
      getTransform: () => transform, graphRevision: 1, layoutIdentity: 'generic', nodeById,
      overlayElsRef: { current: elements }, readCardSize: () => ({ width: 30, height: 20 }),
      registerInteractionFrameProjectionScheduler: scheduler => { project = scheduler }, rootRef: { current: host },
    })
    return null
  }
  try {
    await act(async () => { root.render(React.createElement(Harness)) })
    assert.ok(project)
    ;(project as () => void)()
    assert.equal(events, 1)
    ;(project as () => void)()
    assert.equal(events, 1, 'unchanged geometry needs no edge redraw')
    transform = { x: 25, y: 30, k: 1 }
    ;(project as () => void)()
    assert.equal(events, 2, 'pan commits one complete projection batch')
  } finally {
    await act(async () => { root.unmount() })
    window.removeEventListener('kg-storyboard-widget-geometry-committed', observe)
    host.remove()
    restore()
  }
})

test('any legacy website import defaults to D3 while explicit document renderer choices survive', () => {
  const rawText = '---\nkgWebsiteImportId: generic-crawl\nkgWebsiteNodeId: arbitrary-page\n---\n# Content'
  assert.equal(resolveCanvasFrontmatterPreset({ rawText })?.canvas2dRenderer, 'd3')
  assert.equal(resolveCanvasFrontmatterPreset({ rawText })?.canvasRenderMode, '2d')
  assert.equal(resolveCanvasFrontmatterPreset({ rawText, preset: { canvas2dRenderer: 'storyboard' } })?.canvas2dRenderer, 'storyboard')
  assert.equal(resolveCanvasFrontmatterPreset({ rawText: '# Ordinary document' }), null)
})
