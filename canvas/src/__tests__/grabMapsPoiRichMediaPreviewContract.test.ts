import fs from 'node:fs'
import path from 'node:path'

import { JSDOM } from 'jsdom'

import {
  buildGrabMapsPoiRichMediaPreviewPayload,
  GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT,
  buildGrabMapsPoiRichMediaSrcDoc,
  publishGrabMapsPoiRichMediaPreview,
  readGrabMapsPoiRichMediaPreviewEventDetail,
  subscribeGrabMapsPoiRichMediaPreview,
} from '@/features/geospatial/grabMapsPoiRichMedia'
import { buildRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'

const readUtf8 = (relativePath: string): string => {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

export const testGrabMapsPoiPreviewHelpersCentralizeEventDispatchAndParsing = async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const received: Array<Record<string, unknown>> = []
  const unsubscribe = subscribeGrabMapsPoiRichMediaPreview(payload => {
    received.push(payload as unknown as Record<string, unknown>)
  })

  publishGrabMapsPoiRichMediaPreview({
    targetNodeId: 'node-1',
    srcDoc: ' <main>poi</main> ',
    label: '  POI label  ',
  })
  await new Promise<void>(resolve => setTimeout(resolve, 0))

  const last = received[received.length - 1]
  if (!last) throw new Error('expected GrabMaps POI preview helper to dispatch a preview payload')
  if (String(last.targetNodeId || '') !== 'node-1') {
    throw new Error(`expected shared GrabMaps preview listener to preserve targetNodeId, got ${JSON.stringify(last)}`)
  }
  if (String(last.srcDoc || '') !== '<main>poi</main>') {
    throw new Error(`expected shared GrabMaps preview listener to normalize srcDoc, got ${JSON.stringify(last)}`)
  }
  if (String(last.label || '') !== 'POI label') {
    throw new Error(`expected shared GrabMaps preview listener to normalize label, got ${JSON.stringify(last)}`)
  }

  const rawEvent = new dom.window.CustomEvent(GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT, {
    detail: { targetNodeId: 'node-2', srcDoc: ' test ', label: ' hello ' },
  })
  const parsed = readGrabMapsPoiRichMediaPreviewEventDetail(rawEvent)
  if (!parsed) throw new Error('expected shared GrabMaps preview parser to read CustomEvent detail')
  if (parsed.targetNodeId !== 'node-2' || parsed.srcDoc !== 'test' || parsed.label !== 'hello') {
    throw new Error(`expected shared GrabMaps preview parser to normalize CustomEvent detail, got ${JSON.stringify(parsed)}`)
  }

  unsubscribe()
}

export const testGrabMapsPoiPreviewCallsitesUseSharedHelpers = () => {
  const helperText = readUtf8('src/features/geospatial/grabMapsPoiRichMedia.ts')
  const viewportText = readUtf8('src/components/CanvasViewportGeospatialOverlay.tsx')
  const richMediaPanelText = readUtf8('src/components/RichMediaPanel.tsx')

  if (!helperText.includes('export function subscribeGrabMapsPoiRichMediaPreview')) {
    throw new Error('expected geospatial preview helper module to expose a shared preview subscription helper')
  }
  if (!helperText.includes('export function readGrabMapsPoiRichMediaPreviewEventDetail')) {
    throw new Error('expected geospatial preview helper module to expose shared event detail parsing')
  }
  if (!helperText.includes('new CustomEventCtor(GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT')) {
    throw new Error('expected GrabMaps POI preview emitter to use the shared event constant')
  }
  if (!viewportText.includes('publishGrabMapsPoiRichMediaPreview(payload)')) {
    throw new Error('expected CanvasViewportGeospatialOverlay to keep publishing GrabMaps POI previews through the shared helper')
  }
  if (!richMediaPanelText.includes('subscribeGrabMapsPoiRichMediaPreview')) {
    throw new Error('expected RichMediaPanel to subscribe through the shared GrabMaps preview helper')
  }
  if (richMediaPanelText.includes('addEventListener(GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT')) {
    throw new Error('expected RichMediaPanel to avoid raw GrabMaps preview event listener wiring')
  }
}

export const testGrabMapsPoiSrcDocIncludesRichGeoMetadataAndNeutralActions = () => {
  const srcDoc = buildGrabMapsPoiRichMediaSrcDoc({
    label: 'Marina Bay Sands',
    lat: 1.2834,
    lng: 103.8607,
    address: '10 Bayfront Ave, Singapore',
    category: 'landmark',
    properties: {
      Rank: 1,
      'C*': 0.82,
      'Decisive signal': 'zero competition near transit',
      'Residential POI Count': 22,
      kgSourceDocumentPath: '/reports/site-selection.md',
    },
  })
  if (!srcDoc.includes('<dt>Coordinates</dt><dd>1.283400, 103.860700</dd>')) {
    throw new Error('expected semantic POI details to include normalized six-decimal coordinates')
  }
  if (!srcDoc.includes('Open coordinates in OpenStreetMap')) {
    throw new Error('expected GrabMaps POI srcdoc to include a neutral coordinate map action')
  }
  if (!srcDoc.includes('Open location via geo URI')) {
    throw new Error('expected GrabMaps POI srcdoc to include a provider-agnostic geo URI action')
  }
  if (!srcDoc.includes('&quot;coordinates&quot;: {')) {
    throw new Error('expected GrabMaps POI srcdoc to include a structured payload preview')
  }
  if (!srcDoc.includes('<dt>C*</dt><dd>0.82</dd>')) {
    throw new Error('expected semantic place details to preserve generic score metadata')
  }
  if (!srcDoc.includes('<dt>Decisive Signal</dt><dd>zero competition near transit</dd>')) {
    throw new Error('expected semantic place details to render qualitative geo metadata')
  }
  if (!srcDoc.includes('<dt>Residential POI Count</dt><dd>22</dd>')) {
    throw new Error('expected semantic place details to render source count metrics')
  }
  if (!srcDoc.includes('<dt>Source document</dt><dd>/reports/site-selection.md</dd>')) {
    throw new Error('expected semantic place details to include source provenance')
  }
  if (!srcDoc.includes('<article aria-labelledby="poi-title">')
    || !srcDoc.includes('<nav aria-label="Place actions">')
    || !srcDoc.includes('<details><summary>View normalized place data</summary>')) {
    throw new Error('expected semantic Rich Media content and keyboard-operable place controls')
  }
  if (/<\/?div\b|aria-hidden=/u.test(srcDoc)) {
    throw new Error('expected POI Rich Media content to avoid generic wrappers and hidden decoration')
  }
  if (srcDoc.includes('mini-map') || srcDoc.includes('<svg')) {
    throw new Error('expected the shared main map to remain the only map surface')
  }
}

export const testDirectorySelectionReusesTheExistingRichMediaPanelForEachPlace = () => {
  const panel = buildRichMediaPanelNode({ id: 'existing-rich-media-panel' })
  const graphData = { type: 'Graph', context: '', nodes: [panel], edges: [] }
  const central = buildGrabMapsPoiRichMediaPreviewPayload({
    graphData,
    selectedNodeId: 'map-feature-central',
    openWidgetNodeIds: [panel.id],
    detail: {
      label: 'Synthetic Demo Place Central',
      lng: 103.852,
      lat: 1.286,
      category: 'shop',
      properties: { id: 'synthetic:demo-central', kgSourceFeatureId: 'synthetic:demo-central' },
    },
  })
  const south = buildGrabMapsPoiRichMediaPreviewPayload({
    graphData,
    selectedNodeId: 'map-feature-south',
    openWidgetNodeIds: [panel.id],
    detail: {
      label: 'Synthetic Demo Place South',
      lng: 103.83,
      lat: 1.26,
      category: 'f&b',
      properties: { id: 'synthetic:demo-south', kgSourceFeatureId: 'synthetic:demo-south' },
    },
  })
  if (central.targetNodeId !== panel.id || south.targetNodeId !== panel.id) {
    throw new Error('Directory selections must refresh the same existing Rich Media panel')
  }
  if (!central.srcDoc.includes('Synthetic Demo Place Central') || !south.srcDoc.includes('Synthetic Demo Place South')) {
    throw new Error('Directory selections must replace the shared panel content with the selected place details')
  }
  const fallback = buildGrabMapsPoiRichMediaPreviewPayload({
    graphData: { type: 'Graph', context: '', nodes: [], edges: [] },
    detail: { label: 'Synthetic Demo Place Central', lng: 103.852, lat: 1.286 },
  })
  if (fallback.targetNodeId !== 'geospatial-poi-rich-media-preview') {
    throw new Error('Directory and map selection must share the same transient Rich Media fallback panel')
  }
  const collisionSafeFallback = buildGrabMapsPoiRichMediaPreviewPayload({
    graphData: {
      type: 'Graph',
      context: '',
      nodes: [{ id: 'geospatial-poi-rich-media-preview', type: 'Place', label: 'Existing place', properties: {} }],
      edges: [],
    },
    detail: { label: 'Synthetic Demo Place Central', lng: 103.852, lat: 1.286 },
  })
  if (collisionSafeFallback.targetNodeId === 'geospatial-poi-rich-media-preview') {
    throw new Error('The transient fallback must not collide with a canonical non-widget graph node')
  }
}
