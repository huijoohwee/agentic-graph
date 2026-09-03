import { readDb } from '../../shared/d1'
import { json, readRequestJson, type HeadersRecord } from '../agenticCommerceHttp'
import { parseTravelAgencyIntent } from './intentParser'
import { prepareTravelAgencyIssuance } from './issuanceService'
import {
  handleNetSettlementRoute,
  NET_SETTLEMENT_PATH,
  PAYMENT_LIVE_PATH,
  PAYMENT_READY_PATH,
  type NetSettlementWorkerEnv,
} from './netSettlement'
import type { TravelAgencyEnv } from './runtimeConfig'

export const TRAVEL_AGENCY_ROUTE_PREFIX = '/api/payments/travel-agency'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const readString = (value: unknown): string => String(value ?? '').trim()

export const isTravelAgencyRoute = (pathname: string): boolean =>
  pathname === NET_SETTLEMENT_PATH
  || pathname === PAYMENT_LIVE_PATH
  || pathname === PAYMENT_READY_PATH
  || pathname === `${TRAVEL_AGENCY_ROUTE_PREFIX}/intent`
  || pathname.startsWith(`${TRAVEL_AGENCY_ROUTE_PREFIX}/`)

const readProductionIssuanceEnabled = (env: TravelAgencyEnv): boolean =>
  readString(env.TRAVEL_PRODUCTION_ISSUANCE_ENABLED).toLowerCase() === 'true'

export const handleTravelAgencyRoute = async (
  request: Request,
  env: TravelAgencyEnv & NetSettlementWorkerEnv,
  corsHeaders: HeadersRecord,
): Promise<Response | null> => {
  const url = new URL(request.url)
  if (!isTravelAgencyRoute(url.pathname)) return null
  const settlementResponse = await handleNetSettlementRoute(request, env, corsHeaders)
  if (settlementResponse) return settlementResponse
  if (request.method !== 'POST') return json(405, { ok: false, code: 'method-not-allowed' }, corsHeaders)
  const body = await readRequestJson(request)
  if (!isRecord(body)) return json(400, { ok: false, code: 'unparseable-request', fields: ['body'] }, corsHeaders)

  if (url.pathname === `${TRAVEL_AGENCY_ROUTE_PREFIX}/intent`) {
    const result = await parseTravelAgencyIntent({
      env,
      input: readString(body.input),
      requestDateIso: readString(body.requestDateIso),
    })
    return json(result.ok ? 200 : 400, result, corsHeaders)
  }

  if (url.pathname === `${TRAVEL_AGENCY_ROUTE_PREFIX}/issuance/prepare`) {
    const db = readDb(env as { DB?: unknown })
    if (!db) return json(503, { ok: false, code: 'configuration-missing', fields: ['DB'] }, corsHeaders)
    const result = await prepareTravelAgencyIssuance({
      db,
      env,
      request: body,
      now: new Date().toISOString(),
      productionIssuanceEnabled: readProductionIssuanceEnabled(env),
    })
    return json(result.ok ? 200 : 409, result, corsHeaders)
  }

  return json(404, { ok: false, code: 'travel-agency-route-not-found' }, corsHeaders)
}
