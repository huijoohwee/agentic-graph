import { UI_FONT_MONO, UI_FONT_SANS } from 'grph-shared/ui/typography'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { resolvePreferredRichMediaPanelNodeId } from '@/lib/render/richMediaSsot'
import {
  buildGeoPoiRichMediaRows,
  buildGeoPoiRichMediaSemanticKey,
  normalizeGeoPoiRichMediaProperties,
  resolveGeoPoiAddressFromProperties,
  resolveGeoPoiCategoryFromProperties,
  type GeoPoiRichMediaProperties,
} from 'grph-shared/geospatial/poiRichMedia'

export type GrabMapsPoiRichMediaDetail = {
  label: string
  lng: number
  lat: number
  address?: string
  category?: string
  properties?: GeoPoiRichMediaProperties | Record<string, unknown> | null
}

export type GrabMapsPoiRichMediaPreviewPayload = {
  targetNodeId: string
  srcDoc: string
  label: string
}

export const GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT = 'kg:grabmaps:poi-rich-media-preview'
export const GEOSPATIAL_POI_PREVIEW_NODE_ID = 'geospatial-poi-rich-media-preview'

let latestGrabMapsPoiRichMediaPreviewPayload: GrabMapsPoiRichMediaPreviewPayload | null = null

function readGraphNodes(graphData: GraphData | null | undefined): GraphNode[] {
  return Array.isArray(graphData?.nodes) ? graphData.nodes : []
}

export function resolveGrabMapsPoiRichMediaPanelNodeId(args: {
  graphData: GraphData | null | undefined
  selectedNodeId?: string | null
  selectedNodeIds?: readonly string[]
  openWidgetNodeIds?: readonly string[]
  storyboardWidgetOpenWidgetNodeIds?: readonly string[]
}): string {
  const nodes = readGraphNodes(args.graphData)
  if (nodes.length === 0) return ''
  const nodeById = new Map<string, GraphNode>()
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!
    const id = String(node.id || '').trim()
    if (!id) continue
    nodeById.set(id, node)
  }
  return resolvePreferredRichMediaPanelNodeId({
    graphData: args.graphData,
    selectedNodeId: args.selectedNodeId,
    selectedNodeIds: args.selectedNodeIds,
    openWidgetNodeIds: args.openWidgetNodeIds,
    storyboardWidgetOpenWidgetNodeIds: args.storyboardWidgetOpenWidgetNodeIds,
    nodeById,
  })
}

export function buildGrabMapsPoiRichMediaPreviewPayload(args: {
  detail: GrabMapsPoiRichMediaDetail
  graphData: GraphData | null | undefined
  selectedNodeId?: string | null
  selectedNodeIds?: readonly string[]
  openWidgetNodeIds?: readonly string[]
  storyboardWidgetOpenWidgetNodeIds?: readonly string[]
}): GrabMapsPoiRichMediaPreviewPayload {
  const detail = args.detail
  const properties = normalizeGeoPoiRichMediaProperties(detail.properties)
  const normalizedDetail = {
    ...detail,
    address: String(detail.address || '').trim() || resolveGeoPoiAddressFromProperties(properties),
    category: String(detail.category || '').trim() || resolveGeoPoiCategoryFromProperties(properties),
    properties,
  }
  const existingPanelNodeId = resolveGrabMapsPoiRichMediaPanelNodeId({
    graphData: args.graphData,
    selectedNodeId: args.selectedNodeId,
    selectedNodeIds: args.selectedNodeIds,
    openWidgetNodeIds: args.openWidgetNodeIds,
    storyboardWidgetOpenWidgetNodeIds: args.storyboardWidgetOpenWidgetNodeIds,
  })
  let targetNodeId = existingPanelNodeId
  if (!targetNodeId) {
    const existingIds = new Set(readGraphNodes(args.graphData).map(node => String(node.id || '').trim()).filter(Boolean))
    targetNodeId = GEOSPATIAL_POI_PREVIEW_NODE_ID
    let suffix = 2
    while (existingIds.has(targetNodeId)) {
      targetNodeId = `${GEOSPATIAL_POI_PREVIEW_NODE_ID}-${suffix}`
      suffix += 1
    }
  }
  return {
    targetNodeId,
    srcDoc: buildGrabMapsPoiRichMediaSrcDoc(normalizedDetail),
    label: String(detail.label || '').trim() || 'POI',
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildGrabMapsPoiRichMediaSrcDoc(detail: GrabMapsPoiRichMediaDetail): string {
  const properties = normalizeGeoPoiRichMediaProperties(detail.properties)
  const label = escapeHtml(String(detail.label || '').trim() || 'POI')
  const lat = Number(detail.lat)
  const lng = Number(detail.lng)
  const resolvedAddress = String(detail.address || '').trim() || resolveGeoPoiAddressFromProperties(properties)
  const resolvedCategory = String(detail.category || '').trim() || resolveGeoPoiCategoryFromProperties(properties)
  const address = escapeHtml(resolvedAddress)
  const category = escapeHtml(resolvedCategory)
  const coordText =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      : ''
  const rawLabel = String(detail.label || '').trim() || 'POI'
  const hasFiniteCoordinates = Number.isFinite(lat) && Number.isFinite(lng)
  const osmHref = hasFiniteCoordinates
    ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lng))}#map=17/${encodeURIComponent(String(lat))}/${encodeURIComponent(String(lng))}`
    : ''
  const geoHref = hasFiniteCoordinates
    ? `geo:${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}`
    : ''
  const searchHref = `https://www.openstreetmap.org/search?query=${encodeURIComponent(rawLabel)}`
  const actions = [
    osmHref ? `<a href="${osmHref}" target="_blank" rel="noopener noreferrer">Open coordinates in OpenStreetMap</a>` : '',
    geoHref ? `<a href="${geoHref}" rel="noopener noreferrer">Open location via geo URI</a>` : '',
    `<a href="${searchHref}" target="_blank" rel="noopener noreferrer">Search POI label in OpenStreetMap</a>`,
  ].filter(Boolean).join('')
  const metaRows = [
    `<dt>Address</dt><dd>${address || 'Not provided'}</dd>`,
    `<dt>Category</dt><dd>${category || 'Uncategorized'}</dd>`,
    `<dt>Coordinates</dt><dd>${coordText || 'Not provided'}</dd>`,
  ].join('')
  const semanticKey = buildGeoPoiRichMediaSemanticKey({
    label: rawLabel,
    lat,
    lng,
    properties,
  })
  const geoRows = buildGeoPoiRichMediaRows({
    properties,
    address: resolvedAddress,
    category: resolvedCategory,
    maxRows: 18,
  })
  const geoRowsHtml = geoRows.map(row => (
    `<dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd>`
  )).join('')
  const payload = escapeHtml(JSON.stringify({
    semanticKey,
    label: rawLabel,
    address: resolvedAddress,
    category: resolvedCategory,
    coordinates: hasFiniteCoordinates ? { lat, lng } : null,
    properties,
  }, null, 2))
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    '<style>',
    `html,body{margin:0;padding:0;background:#f8fafc;color:#0f172a;font:14px/1.45 ${UI_FONT_SANS};}`,
    'main{min-height:100vh;box-sizing:border-box;padding:18px;display:flex;align-items:flex-start;justify-content:center;}',
    'article{width:100%;max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 8px 28px rgba(15,23,42,.08);padding:16px 18px;}',
    'h1{margin:0;font-size:20px;line-height:1.25;}',
    'p{margin:8px 0 0;color:#475569;}',
    'dl{margin:16px 0 0;display:grid;grid-template-columns:minmax(7rem,auto) minmax(0,1fr);gap:8px 12px;}',
    'dt{font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;}',
    'dd{margin:0;color:#0f172a;overflow-wrap:anywhere;}',
    '.geo-details{padding-top:12px;border-top:1px solid #cbd5e1;}',
    'nav{display:grid;gap:8px;margin-top:16px;}',
    'nav a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;text-decoration:none;font-weight:600;}',
    'nav a:hover,nav a:focus-visible{background:#f1f5f9;outline:3px solid #2563eb;outline-offset:2px;}',
    'details{margin-top:16px;border-top:1px solid #cbd5e1;padding-top:12px;}',
    'summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:700;}',
    `pre{margin:8px 0 0;padding:10px 12px;background:#0f172a;color:#e2e8f0;border-radius:10px;overflow:auto;font:12px/1.45 ${UI_FONT_MONO};}`,
    '</style></head><body>',
    `<main><article aria-labelledby="poi-title"><header><h1 id="poi-title">${label}</h1><p>Place details from the selected feature on the shared map.</p></header>`,
    `<dl aria-label="Place details">${metaRows}</dl>`,
    geoRowsHtml ? `<dl class="geo-details" aria-label="Additional place details">${geoRowsHtml}</dl>` : '',
    actions ? `<nav aria-label="Place actions">${actions}</nav>` : '',
    `<details><summary>View normalized place data</summary><pre aria-label="POI payload">${payload}</pre></details>`,
    '</article></main></body></html>',
  ].join('')
}

export function publishGrabMapsPoiRichMediaPreview(payload: GrabMapsPoiRichMediaPreviewPayload): void {
  latestGrabMapsPoiRichMediaPreviewPayload = payload
  if (typeof window === 'undefined') return
  try {
    const CustomEventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent
    window.dispatchEvent(new CustomEventCtor(GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT, { detail: payload }))
  } catch {
    void 0
  }
}

export function readLatestGrabMapsPoiRichMediaPreview(): GrabMapsPoiRichMediaPreviewPayload | null {
  return latestGrabMapsPoiRichMediaPreviewPayload
}

export function readGrabMapsPoiRichMediaPreviewEventDetail(
  event: Event | null | undefined,
): GrabMapsPoiRichMediaPreviewPayload | null {
  if (!event || typeof event !== 'object' || !('detail' in event)) return null
  const detail = (event as CustomEvent<unknown>).detail
  if (!detail || typeof detail !== 'object') return null
  const payload = detail as Partial<GrabMapsPoiRichMediaPreviewPayload>
  return {
    targetNodeId: String(payload.targetNodeId || '').trim(),
    srcDoc: typeof payload.srcDoc === 'string' ? payload.srcDoc.trim() : '',
    label: String(payload.label || '').trim(),
  }
}

export function subscribeGrabMapsPoiRichMediaPreview(
  listener: (payload: GrabMapsPoiRichMediaPreviewPayload) => void,
): () => void {
  if (typeof window === 'undefined') return () => void 0
  const handle = (event: Event) => {
    const payload = readGrabMapsPoiRichMediaPreviewEventDetail(event)
    if (!payload) return
    listener(payload)
  }
  window.addEventListener(GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT, handle as EventListener)
  return () => {
    window.removeEventListener(GRABMAPS_POI_RICH_MEDIA_PREVIEW_EVENT, handle as EventListener)
  }
}
