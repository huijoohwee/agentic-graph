import type { GeoCommandEnvelope } from 'grph-shared/geospatial/enhancedLayerContract'
import { parseGeoCommandEnvelope } from './geoInvocationDispatcher'

export type GeoCommandDeepLinkClaimState = {
  handled: boolean
}

export type GeoCommandDeepLinkClaim =
  | { kind: 'enable' }
  | { kind: 'command'; envelope: GeoCommandEnvelope }
  | { kind: 'invalid'; message: string }

export function claimGeoCommandDeepLink(
  search: unknown,
  state: GeoCommandDeepLinkClaimState,
): GeoCommandDeepLinkClaim | null {
  if (state.handled) return null
  const params = new URLSearchParams(String(search || ''))
  if (params.get('kgGeo') !== '1') return null
  state.handled = true

  if (!params.has('kgGeoCommand')) return { kind: 'enable' }
  const commandRaw = params.get('kgGeoCommand') || ''
  try {
    const envelope = parseGeoCommandEnvelope(JSON.parse(commandRaw))
    return envelope
      ? { kind: 'command', envelope }
      : { kind: 'invalid', message: 'The geospatial command envelope is invalid.' }
  } catch {
    return { kind: 'invalid', message: 'The geospatial command envelope is not valid JSON.' }
  }
}

export function buildConsumedGeoCommandUrl(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('kgGeoCommand')
  return `${url.pathname}${url.search}${url.hash}`
}
