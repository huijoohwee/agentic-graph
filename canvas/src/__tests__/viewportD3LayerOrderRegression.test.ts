import { observeGroupAltDrag } from './flowCanvasSharedLookupRegression.test'

import { DEFAULT_CANVAS_LAYER_ORDER_2D } from '@/lib/canvas/layerOrder2d'

export function testGraphCanvasLayerOrderSsotIncludesResizeHandlesAndGroupHit() {
  const rankById = new Map(DEFAULT_CANVAS_LAYER_ORDER_2D.map(x => [x.id, x.rank]))
  const mustHave = ['groups-hit', 'group-resize-handles', 'resize-handles']
  for (let i = 0; i < mustHave.length; i += 1) {
    const id = mustHave[i]
    if (!rankById.has(id)) throw new Error(`missing layer id in SSOT: ${id}`)
  }
  const labels = rankById.get('labels')
  const ports = rankById.get('port-handles')
  if (typeof labels !== 'number' || typeof ports !== 'number') throw new Error('missing labels or port-handles rank')
  if (ports <= labels) throw new Error('expected port-handles to be above labels')
  const resize = rankById.get('resize-handles')
  const nodes = rankById.get('nodes')
  if (typeof resize !== 'number' || typeof nodes !== 'number') throw new Error('missing resize-handles or nodes rank')
  if (resize <= nodes) throw new Error('expected resize-handles to be above nodes')
}

export function testGraphCanvasGroupDragWritesVisualZIndexNotOverrideKey() {
  for (const shiftKey of [false, true]) {
    const { writes, sourceNode } = observeGroupAltDrag(shiftKey)
    if (writes.length !== 1 || writes[0].id !== 'group') throw new Error('expected one selected-group update')
    const properties = writes[0].updates.properties || {}
    if (properties['visual:zIndex'] !== (shiftKey ? -4 : 8)) {
      throw new Error('expected Alt/Alt-Shift z-order to move past siblings at the same depth')
    }
    if (Object.hasOwn(properties, 'visual:zIndexOverride')) throw new Error('unexpected retired z-index override key')
    if (properties.retained !== 'source-owner' || Object.hasOwn(sourceNode.properties || {}, 'visual:zIndex')) {
      throw new Error('expected group z-order to preserve original node properties without mutating them')
    }
  }
}
