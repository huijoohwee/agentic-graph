import assert from 'node:assert/strict'
import path from 'node:path'
import { resolveGrabMapsPoiRichMediaPanelNodeId } from '@/features/geospatial/grabMapsPoiRichMedia'
import { buildRichMediaPanelNode, isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { readUtf8 } from './geospatialHostIntegrationTestUtils'

export const testGeospatialPoiPreviewUsesTransientExistingPanelRuntime = () => {
  const text = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx'))
  const callback = text.slice(text.indexOf('const renderPoiInRichMediaPanel ='), text.indexOf('const handlers ='))
  assert.ok(callback.includes('buildGrabMapsPoiRichMediaPreviewPayload({')
    && callback.includes('publishGrabMapsPoiRichMediaPreview(payload)'),
  'POI preview must use the shared payload and publisher for existing and transient panel reuse')
  assert.ok(!callback.includes('gympgrphBridge.addNode('), 'map selection must not persist a new widget node')
  assert.ok(!callback.includes('gympgrphBridge.updateNode('), 'map selection must not mutate an authored widget node')
  assert.ok(!callback.includes('gympgrphBridge.updateOpenWidgetNodeIds('), 'panel visibility is owned by the transient renderer state')
  const helperText = readUtf8(path.resolve(process.cwd(), 'src', 'features', 'geospatial', 'grabMapsPoiRichMedia.ts'))
  assert.ok(helperText.includes('resolveGrabMapsPoiRichMediaPanelNodeId({')
    && helperText.includes('targetNodeId = GEOSPATIAL_POI_PREVIEW_NODE_ID')
    && helperText.includes('while (existingIds.has(targetNodeId))'),
  'POI preview payload must resolve one existing panel and avoid graph id collisions in the transient fallback')
  const viewportText = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx'))
  const runtimeText = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx'))
  assert.ok(viewportText.includes('subscribeGrabMapsPoiRichMediaPreview(setGeospatialPoiPreview)'))
  assert.ok(viewportText.includes('geospatialPoiPreviewNode={geospatialPoiPreviewNode}'))
  assert.ok(runtimeText.includes('setPendingOverlayNode(node)'))
  assert.ok(runtimeText.includes('allowExplicitOpenWidgetNodeIds: storyboardWidgetDisplayActive || Boolean(geospatialWidgetPanelMode && poiPreviewNodeId)'))

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
