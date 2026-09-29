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
    `<section><strong>Address</strong><span>${address || 'Not provided'}</span></section>`,
    `<section><strong>Category</strong><span>${category || 'Uncategorized'}</span></section>`,
    `<section><strong>Coordinates</strong><span>${coordText || 'Not provided'}</span></section>`,
  ].filter(Boolean).join('')
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
    `<section><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.value)}</span></section>`
  )).join('')
  const payload = escapeHtml(JSON.stringify({
    semanticKey,
    label: rawLabel,
    address: resolvedAddress,
    category: resolvedCategory,
    coordinates: hasFiniteCoordinates ? { lat, lng } : null,
    properties,
  }, null, 2))
  const miniMap = (() => {
    if (!hasFiniteCoordinates) return ''
    const width = 320
    const height = 170
    const pad = 12
    const innerWidth = width - pad * 2
    const innerHeight = height - pad * 2
    const normalizedX = ((lng + 180) / 360) * innerWidth + pad
    const normalizedY = ((90 - lat) / 180) * innerHeight + pad
    const markerX = Math.max(pad, Math.min(width - pad, normalizedX))
    const markerY = Math.max(pad, Math.min(height - pad, normalizedY))
    const markerLabel = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    const latText = lat >= 0 ? `${Math.abs(lat).toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`
    const lngText = lng >= 0 ? `${Math.abs(lng).toFixed(2)}°E` : `${Math.abs(lng).toFixed(2)}°W`
    return [
      '<figure class="mini-map" aria-label="POI mini-map snapshot">',
      `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mini-map snapshot for ${label}">`,
      '<defs>',
      '<linearGradient id="kgMiniMapBg" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0%" stop-color="#dbeafe"/>',
      '<stop offset="100%" stop-color="#bfdbfe"/>',
      '</linearGradient>',
      '</defs>',
      `<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#kgMiniMapBg)"/>`,
      `<rect x="${pad}" y="${pad}" width="${innerWidth}" height="${innerHeight}" rx="8" fill="#f8fafc" stroke="#cbd5e1"/>`,
      `<line x1="${pad}" y1="${height / 2}" x2="${width - pad}" y2="${height / 2}" stroke="#cbd5e1" stroke-dasharray="4 4"/>`,
      `<line x1="${width / 2}" y1="${pad}" x2="${width / 2}" y2="${height - pad}" stroke="#cbd5e1" stroke-dasharray="4 4"/>`,
      `<circle cx="${markerX.toFixed(2)}" cy="${markerY.toFixed(2)}" r="5.5" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>`,
      `<circle cx="${markerX.toFixed(2)}" cy="${markerY.toFixed(2)}" r="14" fill="none" stroke="#ef4444" stroke-opacity="0.35" stroke-width="2"/>`,
      `<text x="${pad + 6}" y="${height - 16}" fill="#334155" font-size="12" font-family="${UI_FONT_MONO}">${escapeHtml(latText)} / ${escapeHtml(lngText)}</text>`,
      '</svg>',
      `<figcaption>${escapeHtml(markerLabel)}</figcaption>`,
      '</figure>',
    ].join('')
  })()
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
    'section{margin-top:16px;display:grid;gap:10px;}',
    'section div{display:grid;gap:2px;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;}',
    '.geo-details{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));}',
    '.actions{display:grid;gap:8px;margin-top:16px;}',
    '.actions a{display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;text-decoration:none;font-weight:600;}',
    '.actions a:hover{background:#f1f5f9;}',
    '.mini-map{margin:16px 0 0;display:grid;gap:8px;}',
    '.mini-map svg{width:100%;height:auto;display:block;border-radius:12px;box-shadow:inset 0 0 0 1px #cbd5e1;}',
    `.mini-map figcaption{font-size:12px;color:#475569;font-family:${UI_FONT_MONO};}`,
    `pre{margin:16px 0 0;padding:10px 12px;background:#0f172a;color:#e2e8f0;border-radius:10px;overflow:auto;font:12px/1.45 ${UI_FONT_MONO};}`,
    'strong{font-size:12px;letter-spacing:normal;text-transform:uppercase;color:#64748b;}',
    'span{font-size:14px;color:#0f172a;word-break:break-word;}',
    '</style></head><body>',
    `<main><article><h1>${label}</h1><p>GrabMaps POI selection rendered on the Rich Media Panel surface.</p>`,
    metaRows ? `<section>${metaRows}</section>` : '',
    geoRowsHtml ? `<section class="geo-details" aria-label="Geo metadata">${geoRowsHtml}</section>` : '',
    miniMap,
    actions ? `<section class="actions">${actions}</section>` : '',
    `<pre aria-label="POI payload">${payload}</pre>`,
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
