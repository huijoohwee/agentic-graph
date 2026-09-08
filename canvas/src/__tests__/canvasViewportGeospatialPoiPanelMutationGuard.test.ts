import assert from 'node:assert/strict'
import path from 'node:path'
import { resolveGrabMapsPoiRichMediaPanelNodeId } from '@/features/geospatial/grabMapsPoiRichMedia'
import { buildRichMediaPanelNode, isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { readUtf8 } from './geospatialHostIntegrationTestUtils'

export const testGeospatialPoiPreviewReusesOrCreatesPanel = () => {
  const text = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx'))
  const callback = text.slice(text.indexOf('const renderPoiInRichMediaPanel ='), text.indexOf('const handlers ='))
  const resolveIndex = callback.indexOf('resolveGrabMapsPoiRichMediaPanelNodeId({')
  const missingIndex = callback.indexOf('if (!targetNodeId) {')
  const createIndex = callback.indexOf("createId('rich-media-panel')")
  const publishIndex = callback.indexOf('publishGrabMapsPoiRichMediaPreview({')
  assert.ok(resolveIndex >= 0 && resolveIndex < missingIndex && missingIndex < createIndex && createIndex < publishIndex,
    'POI preview must resolve an existing panel before conditionally creating and publishing one')
  assert.ok(callback.includes('gympgrphBridge.addNode(buildRichMediaPanelNode({ id: nextId, anchor: anchorNode }))'))
  assert.ok(callback.includes('targetNodeId = nextId'))
  assert.ok(callback.includes('gympgrphBridge.updateNode(panelNodeId,'))

  const existing = buildRichMediaPanelNode({ id: 'existing-panel' })
  const graphData = { context: '', type: 'Graph', nodes: [existing], edges: [] }
  const before = structuredClone(graphData)
  assert.equal(resolveGrabMapsPoiRichMediaPanelNodeId({ graphData, selectedNodeId: existing.id }), existing.id)
  assert.equal(resolveGrabMapsPoiRichMediaPanelNodeId({ graphData: { ...graphData, nodes: [] } }), '')
  const created = buildRichMediaPanelNode({ id: 'created-panel', anchor: existing })
  assert.ok(isRichMediaPanelNode(created))
  assert.equal(created.id, 'created-panel')
  assert.deepEqual(graphData, before)
}
