import {
  buildGrabMapsProxyRequestHeaders,
  readGrabMapsAuthModeFromBrowser,
  readGrabMapsByokApiKeyFromBrowser,
} from 'grph-shared/geospatial/grabMapsAuth'
import { toGrabMapsProxyUrl } from 'grph-shared/geospatial/grabMapsProxy'
import { MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL } from './basemapStyle.js'

export type MapLibreProviderStyle =
  | string
  | Readonly<Record<string, unknown>>

export type MapLibreStylePreflightResult = Readonly<{
  shouldFallback: boolean
  style: MapLibreProviderStyle
}>

type ProviderStyleFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type InitialMapLibreStyleResolution = Readonly<{
  activationStyleOverride: Readonly<Record<string, unknown>> | null
  shouldFallback: boolean
  style: MapLibreProviderStyle
}>

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value != null && typeof value === 'object' && !Array.isArray(value)
)

export const isGrabMapsUrl = (rawUrl: string): boolean => {
  try {
    return new URL(String(rawUrl || '').trim()).hostname.toLowerCase()
      === 'maps.grab.com'
  } catch {
    return false
  }
}

export const canFetchMapLibreProviderStyle = (rawUrl: string): boolean => {
  try {
    const protocol = new URL(String(rawUrl || '').trim()).protocol.toLowerCase()
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const canUseDirectGrabMapsBrowserRequests = (): boolean => (
  typeof window !== 'undefined'
  && readGrabMapsAuthModeFromBrowser() === 'byok'
  && !!readGrabMapsByokApiKeyFromBrowser()
)

const buildGrabMapsDirectRequestHeaders = (): Record<string, string> => {
  const apiKey = readGrabMapsByokApiKeyFromBrowser()
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

const decodeGrabMapsTileTemplatePlaceholders = (url: string): string => (
  String(url || '')
    .replace(/%257B/gi, '{')
    .replace(/%257D/gi, '}')
    .replace(/%7B/gi, '{')
    .replace(/%7D/gi, '}')
)

const normalizeGrabMapsVectorTileUrl = (rawUrl: string): string => {
  const trimmed = decodeGrabMapsTileTemplatePlaceholders(
    String(rawUrl || '').trim(),
  )
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname.toLowerCase() !== 'maps.grab.com') return trimmed
    if (parsed.pathname.startsWith('/api/maps/tiles/v2/vector/')) {
      return decodeGrabMapsTileTemplatePlaceholders(parsed.toString())
    }
    if (parsed.pathname.startsWith('/maps/tiles/v2/vector/')) {
      parsed.pathname = `/api${parsed.pathname}`
    }
    return decodeGrabMapsTileTemplatePlaceholders(parsed.toString())
  } catch {
    return trimmed
  }
}

export const resolveGrabMapsRequestTarget = (
  rawUrl: string,
): {
  headers: Record<string, string>
  proxied: boolean
  url: string | null
} => {
  const normalizedUrl = normalizeGrabMapsVectorTileUrl(rawUrl)
  if (canUseDirectGrabMapsBrowserRequests()) {
    return {
      headers: buildGrabMapsDirectRequestHeaders(),
      proxied: false,
      url: normalizedUrl,
    }
  }
  const proxyUrl = toGrabMapsProxyUrl(normalizedUrl)
  return proxyUrl
    ? {
        headers: buildGrabMapsProxyRequestHeaders(),
        proxied: true,
        url: proxyUrl,
      }
    : { headers: {}, proxied: true, url: null }
}

const resolveStyleAssetUrl = (
  rawValue: unknown,
  styleDocumentUrl: string,
): string => {
  const trimmed = String(rawValue || '').trim()
  if (!trimmed) return ''
  try {
    if (trimmed.startsWith('//')) {
      const base = new URL(styleDocumentUrl)
      return new URL(`${base.protocol}${trimmed}`).toString()
    }
    if (trimmed.includes('://')) return new URL(trimmed).toString()
    return new URL(trimmed, new URL(styleDocumentUrl)).toString()
  } catch {
    return trimmed
  }
}

const resolveGrabMapsGlyphsUrl = (
  rawValue: unknown,
  styleDocumentUrl: string,
): string => {
  const normalized = decodeGrabMapsTileTemplatePlaceholders(
    resolveStyleAssetUrl(rawValue, styleDocumentUrl),
  )
  if (!normalized) return ''
  if (
    normalized.includes('{fontstack}')
    && normalized.includes('{range}')
  ) return normalized
  return `${normalized.replace(/\/+$/, '')}/{fontstack}/{range}.pbf`
}

const normalizeSourceDefinition = (
  rawSource: Record<string, unknown>,
  styleDocumentUrl: string,
): Record<string, unknown> => {
  const nextSource: Record<string, unknown> = { ...rawSource }
  if (typeof rawSource.url === 'string') {
    nextSource.url = normalizeGrabMapsVectorTileUrl(
      resolveStyleAssetUrl(rawSource.url, styleDocumentUrl),
    )
  }
  if (typeof rawSource.data === 'string') {
    nextSource.data = resolveStyleAssetUrl(
      rawSource.data,
      styleDocumentUrl,
    )
  }
  if (Array.isArray(rawSource.tiles)) {
    nextSource.tiles = rawSource.tiles.map(tile => (
      typeof tile === 'string'
        ? normalizeGrabMapsVectorTileUrl(
            decodeGrabMapsTileTemplatePlaceholders(
              resolveStyleAssetUrl(tile, styleDocumentUrl),
            ),
          )
        : tile
    ))
  }
  return nextSource
}

const normalizeStyleDocument = (
  rawStyle: unknown,
  styleDocumentUrl: string,
): Record<string, unknown> | null => {
  if (!isRecord(rawStyle)) return null
  const nextStyle: Record<string, unknown> = { ...rawStyle }
  if (typeof rawStyle.sprite === 'string') {
    nextStyle.sprite = resolveStyleAssetUrl(
      rawStyle.sprite,
      styleDocumentUrl,
    )
  }
  if (typeof rawStyle.glyphs === 'string') {
    nextStyle.glyphs = resolveGrabMapsGlyphsUrl(
      rawStyle.glyphs,
      styleDocumentUrl,
    )
  }
  if (isRecord(rawStyle.sources)) {
    const nextSources: Record<string, unknown> = {}
    for (const [sourceId, sourceValue] of Object.entries(rawStyle.sources)) {
      nextSources[sourceId] = isRecord(sourceValue)
        ? normalizeSourceDefinition(sourceValue, styleDocumentUrl)
        : sourceValue
    }
    nextStyle.sources = nextSources
  }
  return nextStyle
}

const readStyleDocumentUrl = (
  response: Response,
  requestedStyleUrl: string,
): string => {
  const responseUrl = String(response.url || '').trim()
  if (!responseUrl) return requestedStyleUrl
  try {
    const parsed = new URL(responseUrl)
    if (
      isGrabMapsUrl(requestedStyleUrl)
      && parsed.pathname.includes('/__grabmaps_proxy')
    ) return requestedStyleUrl
    return parsed.toString()
  } catch {
    return requestedStyleUrl
  }
}

export async function loadMapLibreProviderStyleDocument(
  styleUrl: string,
  fetchStyle: ProviderStyleFetch = fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!canFetchMapLibreProviderStyle(styleUrl)) {
    throw new Error('MapLibre provider style URL is not fetchable over HTTP.')
  }
  const response = await fetchStyle(styleUrl, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) {
    throw new Error(
      `MapLibre provider style request failed with status ${response.status}.`,
    )
  }
  const normalizedStyle = normalizeStyleDocument(
    await response.json(),
    readStyleDocumentUrl(response, styleUrl),
  )
  if (!normalizedStyle) {
    throw new Error(
      'MapLibre provider style response was not a style document.',
    )
  }
  return normalizedStyle
}

const hydrateGrabMapsSourceUrls = async (
  style: Record<string, unknown>,
  styleDocumentUrl: string,
  fetchStyle: ProviderStyleFetch,
  signal?: AbortSignal,
): Promise<{
  hadGrabMapsSourceFailure: boolean
  style: Record<string, unknown>
}> => {
  if (!isRecord(style.sources)) {
    return { style, hadGrabMapsSourceFailure: false }
  }
  const nextSources: Record<string, unknown> = {}
  let hadGrabMapsSourceFailure = false
  await Promise.all(Object.entries(style.sources).map(
    async ([sourceId, sourceValue]) => {
      if (!isRecord(sourceValue)) {
        nextSources[sourceId] = sourceValue
        return
      }
      const normalizedSource = normalizeSourceDefinition(
        sourceValue,
        styleDocumentUrl,
      )
      const sourceUrl = typeof normalizedSource.url === 'string'
        ? normalizedSource.url
        : ''
      if (!sourceUrl || !isGrabMapsUrl(sourceUrl)) {
        nextSources[sourceId] = normalizedSource
        return
      }
      const requestTarget = resolveGrabMapsRequestTarget(sourceUrl)
      if (!requestTarget.url) {
        hadGrabMapsSourceFailure = true
        nextSources[sourceId] = normalizedSource
        return
      }
      try {
        const response = await fetchStyle(requestTarget.url, {
          headers: requestTarget.headers,
          method: 'GET',
          ...(signal ? { signal } : {}),
        })
        if (!response.ok) throw new Error(`status ${response.status}`)
        const sourceJson = await response.json()
        if (!isRecord(sourceJson)) throw new Error('invalid source')
        const hydrated = normalizeSourceDefinition(
          sourceJson,
          readStyleDocumentUrl(response, sourceUrl),
        )
        nextSources[sourceId] = { ...normalizedSource, ...hydrated }
        delete (nextSources[sourceId] as Record<string, unknown>).url
      } catch (error) {
        if (signal?.aborted) throw error
        hadGrabMapsSourceFailure = true
        nextSources[sourceId] = normalizedSource
      }
    },
  ))
  return {
    style: { ...style, sources: nextSources },
    hadGrabMapsSourceFailure,
  }
}

const preflightGrabMapsStyle = async (
  styleUrl: string,
  fetchStyle: ProviderStyleFetch,
  signal?: AbortSignal,
): Promise<MapLibreStylePreflightResult> => {
  const requestTarget = resolveGrabMapsRequestTarget(styleUrl)
  if (!requestTarget.url) {
    return { style: styleUrl, shouldFallback: false }
  }
  try {
    const response = await fetchStyle(requestTarget.url, {
      headers: requestTarget.headers,
      method: 'GET',
      ...(signal ? { signal } : {}),
    })
    if (response.ok) {
      const styleDocumentUrl = readStyleDocumentUrl(response, styleUrl)
      const normalizedStyle = normalizeStyleDocument(
        await response.json(),
        styleDocumentUrl,
      )
      if (!normalizedStyle) {
        return { style: styleUrl, shouldFallback: false }
      }
      const hydrated = await hydrateGrabMapsSourceUrls(
        normalizedStyle,
        styleDocumentUrl,
        fetchStyle,
        signal,
      )
      return hydrated.hadGrabMapsSourceFailure
        ? {
            style: MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
            shouldFallback: true,
          }
        : { style: hydrated.style, shouldFallback: false }
    }
    if (
      (response.status === 404 && requestTarget.proxied)
      || response.status === 401
      || response.status === 403
      || response.status >= 500
    ) {
      return {
        style: MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
        shouldFallback: true,
      }
    }
    return { style: styleUrl, shouldFallback: false }
  } catch (error) {
    if (signal?.aborted) throw error
    return { style: styleUrl, shouldFallback: false }
  }
}

export function shouldPreflightInitialMapLibreStyle(
  styleUrl: string,
): boolean {
  return isGrabMapsUrl(styleUrl)
}

export async function preflightMapLibreStyle(
  styleUrl: string,
  options: Readonly<{
    fetchStyle?: ProviderStyleFetch
    signal?: AbortSignal
  }> = {},
): Promise<MapLibreStylePreflightResult> {
  const fetchStyle = options.fetchStyle ?? fetch
  if (isGrabMapsUrl(styleUrl)) {
    return preflightGrabMapsStyle(styleUrl, fetchStyle, options.signal)
  }
  if (!canFetchMapLibreProviderStyle(styleUrl)) {
    return { style: styleUrl, shouldFallback: false }
  }
  return {
    style: await loadMapLibreProviderStyleDocument(
      styleUrl,
      fetchStyle,
      options.signal,
    ),
    shouldFallback: false,
  }
}

export async function resolveInitialMapLibreStyle(options: Readonly<{
  preflight?: typeof preflightMapLibreStyle
  readActivationStyleOverride: (
  ) => Readonly<Record<string, unknown>> | null | undefined
  selectedStyle: MapLibreProviderStyle
  signal?: AbortSignal
}>): Promise<InitialMapLibreStyleResolution> {
  const initialOverride = options.readActivationStyleOverride() ?? null
  if (initialOverride) {
    return {
      activationStyleOverride: initialOverride,
      shouldFallback: false,
      style: initialOverride,
    }
  }
  try {
    const preflight = typeof options.selectedStyle === 'string'
      && shouldPreflightInitialMapLibreStyle(options.selectedStyle)
      ? await (options.preflight ?? preflightMapLibreStyle)(
          options.selectedStyle,
          { signal: options.signal },
        )
      : { style: options.selectedStyle, shouldFallback: false }
    const activationStyleOverride =
      options.readActivationStyleOverride() ?? null
    return activationStyleOverride
      ? {
          activationStyleOverride,
          shouldFallback: false,
          style: activationStyleOverride,
        }
      : { activationStyleOverride: null, ...preflight }
  } catch (error) {
    const activationStyleOverride =
      options.readActivationStyleOverride() ?? null
    if (!activationStyleOverride) throw error
    return {
      activationStyleOverride,
      shouldFallback: false,
      style: activationStyleOverride,
    }
  }
}
