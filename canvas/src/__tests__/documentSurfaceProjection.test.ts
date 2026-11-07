import { buildPanelOnlyNodeIdSetFromGraphNodes } from '@/lib/render/markdownPanelOverlayPool'
import { computeOverlayHalfExtentsByNodeId2d } from '@/lib/render/overlayHalfExtentsByNodeId2d'
import assert from 'node:assert/strict'
import * as d3 from 'd3'
import { resolveMarkdownPanelProjection } from '@/features/markdown-edgeless/markdownPanelProjection'
import type { MarkdownDesignBlock } from '@/features/markdown-edgeless/markdownDesignLayout'
import { createGroupsLayoutUpdater, type GroupLayoutCacheEntry } from '@/components/GraphCanvas/layers/groupsLayout'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testDocumentSurfaceTracksSameIdAndAliasAnchors() {
  const block: MarkdownDesignBlock = { id: 'page', type: 'html', startLine: 1, endLine: 1,
    title: 'Page', summary: '', preview: { kind: 'html' }, x: -99999, y: -99999, w: 320, h: 180 }
  let center = { x: 300, y: 200 }
  const calls: string[] = []
  const getCenter = (id: string) => { calls.push(id); return center }
  for (const anchorId of [undefined, 'page', 'alias']) {
    const projected = resolveMarkdownPanelProjection({ block, density: 'default', anchorId, getCenter })
    assert.equal(projected.cx, center.x, 'same-ID graph panels must discard stale seed coordinates')
    assert.equal(projected.cy, center.y)
  }
  assert.deepEqual(calls, ['page', 'page', 'alias'])
  center = { x: -40, y: 500 }
  assert.equal(resolveMarkdownPanelProjection({ block, density: 'default', getCenter }).cx, -40, 'dragged anchors stay live')
  const fallback = resolveMarkdownPanelProjection({ block, density: 'default', getCenter: () => null })
  assert.equal(fallback.cx, block.x + fallback.w / 2)
  assert.equal(fallback.cy, block.y + fallback.h / 2)
}

export function testDocumentGroupsRerankPaintAndHitTargets() {
  const { dom, restore } = initJsdomHarness('<!doctype html><svg><g id="paint"/><g id="hit"/></svg>')
  try {
    const groups: GraphGroup[] = ['small', 'large', 'child', 'raised'].map((id, index) => ({
      id, label: id, depth: id === 'child' ? 1 : 0, zIndex: id === 'raised' ? 2 : 0,
      memberNodeIds: Array.from({ length: 10 - index }, (_, n) => String(n)), style: {},
    }))
    const paint = d3.select(dom.window.document.querySelector<SVGGElement>('#paint')!)
    const hit = d3.select(dom.window.document.querySelector<SVGGElement>('#hit')!)
    const itemSel = paint.selectAll<SVGGElement, GraphGroup>('g').data(groups).enter().append('g').attr('data-kg-group-id', d => d.id)
    hit.selectAll('rect').data(groups).enter().append('rect').attr('data-kg-group-id', d => d.id)
    const layoutCache = new Map<string, GroupLayoutCacheEntry>()
    let smallWidth = 30
    const computeBoundsAndLabel = (group: GraphGroup): GroupLayoutCacheEntry => ({
      x: 0, y: 0, w: group.id === 'small' ? smallWidth : 300, h: 100, labelX: 0, labelY: 0, chevronCx: 0, chevronCy: 0, d: null,
    })
    const update = createGroupsLayoutUpdater({ itemSel, hitRoot: hit.node()!, layoutCache,
      groupDatumById: new Map(groups.map(group => [group.id, group])), computeBoundsAndLabel,
      applyComputedToGroup: (group, bounds) => { layoutCache.set(group.id, bounds) },
      readSelectedId: () => '', readActiveResizeId: () => '', allowResize: true, eps: 0.001,
    })
    const order = (root: SVGGElement) => Array.from(root.children).map(el => el.getAttribute('data-kg-group-id'))
    update()
    assert.deepEqual(order(paint.node()!), ['large', 'small', 'raised', 'child'], 'area wins over member count within a peer layer')
    assert.deepEqual(order(hit.node()!), order(paint.node()!))
    smallWidth = 600
    // Interactive resize writes its layout cache before the next scene update.
    layoutCache.set('small', computeBoundsAndLabel(groups[0]))
    update()
    assert.deepEqual(order(paint.node()!), ['small', 'large', 'raised', 'child'])
    assert.deepEqual(order(hit.node()!), order(paint.node()!))
    const observer = new dom.window.MutationObserver(() => {})
    observer.observe(dom.window.document.querySelector('svg')!, { childList: true, subtree: true, attributes: true })
    update()
    assert.equal(observer.takeRecords().length, 0, 'settled group ordering must not reorder DOM')
    observer.disconnect()
  } finally { restore() }
}

export function testImageParagraphRetainsRichMediaOwnership() {
  const nodes = [
    { id: 'image-paragraph', type: 'Paragraph', label: 'Image paragraph', properties: { image_url: 'https://example.test/slide.png' } },
    { id: 'video-paragraph', type: 'Paragraph', label: 'Video paragraph', properties: { video_url: 'https://example.test/clip.mp4' } },
    { id: 'web-paragraph', type: 'Paragraph', label: 'Web paragraph', properties: { iframe_url: 'https://example.test/page' } },
    { id: 'quote', type: 'Paragraph', label: 'Quote', properties: { text: '> A quote' } },
  ]
  const panelOnly = buildPanelOnlyNodeIdSetFromGraphNodes(nodes)
  assert.equal(panelOnly.has('image-paragraph'), false, 'image paragraphs must remain eligible for the shared rich media pool')
  assert.equal(panelOnly.has('video-paragraph'), false)
  assert.equal(panelOnly.has('web-paragraph'), true)
  assert.equal(panelOnly.has('quote'), true)
}

export function testDocumentPanelEdgeBoundsUseWorldDimensions() {
  const nodes = [{ id: 'doc', type: 'Paragraph', label: 'Document', properties: {} },
    { id: 'media', type: 'Image', label: 'Media', properties: { 'visual:width': 500, 'visual:height': 281 } }]
  const sizes = [0.25, 1, 2].map(zoomK => computeOverlayHalfExtentsByNodeId2d({ nodes,
    panelOnlyNodeIdSet: new Set(['doc']), mediaOverlayNodeIdSet: new Set(['media']),
    mediaPanelDensity: 'default', viewportW: 1000, viewportH: 800, zoomK }))
  assert.deepEqual(sizes[0], sizes[1], 'edge attachment bounds must not expand when zooming out')
  assert.deepEqual(sizes[1], sizes[2])
  assert.deepEqual(sizes[0]?.doc, { halfW: 160, halfH: 108 })
  assert.deepEqual(sizes[0]?.media, { halfW: 250, halfH: 140.5 })
}
