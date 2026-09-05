import type { PaymentRequired, SettleResponse } from '@x402/core/types'

import {
  AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT,
  AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES,
  sha256AgenticCommercePaidResourceHex,
} from '../../../grph-shared/src/payments/agenticCommercePaidResourceSsot'
import type { PaidResourceRow } from './agenticCommercePaidResourcePersistence'
import { paymentRequiredHeader, paymentResponseHeader } from './agenticCommerceX402Xrpl'

export type PaidResourceCorsHeaders = Record<string, string>

export const paidResourceJson = (
  status: number,
  body: unknown,
  corsHeaders: PaidResourceCorsHeaders,
  headers: HeadersInit = {},
): Response => {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('content-type', 'application/json; charset=utf-8')
  responseHeaders.set('cache-control', 'no-store')
  for (const [key, value] of Object.entries(corsHeaders)) responseHeaders.set(key, value)
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

export const paidResourceError = (
  status: number,
  code: string,
  corsHeaders: PaidResourceCorsHeaders,
  detail: Record<string, unknown> = {},
): Response => paidResourceJson(status, {
  ok: false,
  contract: AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT,
  code,
  ...detail,
}, corsHeaders)

export const paidResourceChallengeResponse = (
  paymentRequired: PaymentRequired,
  corsHeaders: PaidResourceCorsHeaders,
): Response => paidResourceJson(402, paymentRequired, corsHeaders, {
  [AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES.paymentRequired]: paymentRequiredHeader(paymentRequired),
})

const parseStoredJson = <T>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export const paidResourceFulfilledResponse = async (
  row: PaidResourceRow,
  corsHeaders: PaidResourceCorsHeaders,
): Promise<Response> => {
  const body = parseStoredJson<unknown>(row.response_json)
  const settlement = parseStoredJson<SettleResponse>(row.settlement_json)
  if (!body || !settlement || settlement.success !== true || !row.response_json || !row.settlement_json) {
    return paidResourceError(503, 'paid_resource_receipt_corrupt', corsHeaders)
  }
  const [responseDigest, settlementDigest] = await Promise.all([
    sha256AgenticCommercePaidResourceHex(row.response_json),
    sha256AgenticCommercePaidResourceHex(row.settlement_json),
  ])
  if (
    responseDigest !== row.response_digest
    || settlementDigest !== row.settlement_digest
    || settlement.transaction?.toUpperCase() !== row.transaction_hash
    || settlement.network !== row.network
  ) {
    return paidResourceError(503, 'paid_resource_receipt_corrupt', corsHeaders)
  }
  return paidResourceJson(200, body, corsHeaders, {
    [AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES.paymentResponse]: paymentResponseHeader(settlement),
  })
}
