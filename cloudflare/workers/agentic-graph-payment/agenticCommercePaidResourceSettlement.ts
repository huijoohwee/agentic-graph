import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from '@x402/core/types'

import {
  canonicalizeAgenticCommercePaidResourceJson,
  sha256AgenticCommercePaidResourceHex,
} from '../../../grph-shared/src/payments/agenticCommercePaidResourceSsot'
import type { D1DatabaseLike } from '../shared/d1'
import {
  claimPaidResourceSettlementRetry,
  fulfillPaidResource,
  markPaidResourceSettlementUnknown,
  releasePaidResourceSettlementFailure,
  type PaidResourceRow,
} from './agenticCommercePaidResourcePersistence'
import {
  paidResourceChallengeResponse as challengeResponse,
  paidResourceError as errorJson,
  paidResourceFulfilledResponse as fulfilledResponse,
  type PaidResourceCorsHeaders as HeadersRecord,
} from './agenticCommercePaidResourceResponse'
import {
  reconcileXrplTransaction,
  settleXrplPayment,
  type XrplX402Transport,
} from './agenticCommerceX402Xrpl'

const CLAIM_TTL_MS = 30_000
const MAX_SETTLEMENT_ATTEMPTS = 2

const unknownResponse = (
  row: PaidResourceRow,
  corsHeaders: HeadersRecord,
): Response => errorJson(503, 'settlement_unknown', corsHeaders, {
  retryable: true,
  phase: 'settle',
  settlementAttempted: true,
  transaction: row.transaction_hash,
})

const fulfill = async (args: {
  db: D1DatabaseLike
  row: PaidResourceRow
  response: SettleResponse
  corsHeaders: HeadersRecord
  now: () => Date
  claimToken?: string
}): Promise<Response> => {
  const settlementJson = canonicalizeAgenticCommercePaidResourceJson(args.response)
  const fulfilled = await fulfillPaidResource(args.db, {
    id: args.row.id,
    expectedRevision: args.row.revision,
    ...(args.claimToken ? { claimToken: args.claimToken } : {}),
    settlementJson,
    settlementDigest: await sha256AgenticCommercePaidResourceHex(settlementJson),
    payer: args.response.payer ?? null,
    now: args.now().toISOString(),
  })
  if (fulfilled.record?.state === 'fulfilled') {
    return fulfilledResponse(fulfilled.record, args.corsHeaders)
  }
  return errorJson(409, 'paid_resource_reconcile_conflict', args.corsHeaders, {
    retryable: true,
    settlementAttempted: true,
  })
}

export const rejectPaidResourceSettlement = async (args: {
  db: D1DatabaseLike
  row: PaidResourceRow
  fromState: 'settling' | 'settlement_unknown'
  paymentRequired: PaymentRequired
  corsHeaders: HeadersRecord
  now: () => Date
  claimToken?: string
}): Promise<Response> => {
  const released = await releasePaidResourceSettlementFailure(args.db, {
    id: args.row.id,
    expectedRevision: args.row.revision,
    ...(args.claimToken ? { claimToken: args.claimToken } : {}),
    fromState: args.fromState,
    now: args.now().toISOString(),
  })
  if (released.record?.state === 'fulfilled') {
    return fulfilledResponse(released.record, args.corsHeaders)
  }
  if (released.record?.state === 'challenged') {
    return challengeResponse(args.paymentRequired, args.corsHeaders)
  }
  return released.record?.state === 'expired'
    ? errorJson(409, 'paid_resource_expired', args.corsHeaders, { settlementAttempted: true })
    : errorJson(409, 'paid_resource_reconcile_conflict', args.corsHeaders, {
        retryable: true,
        settlementAttempted: true,
      })
}

const responseIntegrityMatches = async (row: PaidResourceRow): Promise<boolean> =>
  !!row.response_json
  && !!row.response_digest
  && await sha256AgenticCommercePaidResourceHex(row.response_json) === row.response_digest

export const recoverPaidResourceSettlement = async (args: {
  db: D1DatabaseLike
  row: PaidResourceRow
  paymentRequired: PaymentRequired
  requirements: PaymentRequirements
  transport: XrplX402Transport
  corsHeaders: HeadersRecord
  now: () => Date
  paymentPayload?: PaymentPayload
  randomUuid?: () => string
}): Promise<Response> => {
  if (!args.row.transaction_hash || !await responseIntegrityMatches(args.row)) {
    return errorJson(503, 'paid_resource_receipt_corrupt', args.corsHeaders)
  }
  const reconciled = await reconcileXrplTransaction({
    transport: args.transport,
    requirements: args.requirements,
    transactionHash: args.row.transaction_hash,
  })
  if (reconciled.status === 'fulfilled') {
    return fulfill({ ...args, response: reconciled.response })
  }
  if (reconciled.status === 'failed') {
    return rejectPaidResourceSettlement({ ...args, fromState: 'settlement_unknown' })
  }
  if (
    reconciled.status !== 'pending'
    || !args.paymentPayload
    || args.row.settlement_attempts >= MAX_SETTLEMENT_ATTEMPTS
  ) return unknownResponse(args.row, args.corsHeaders)

  const claimToken = args.randomUuid?.() ?? crypto.randomUUID()
  const claimNow = args.now()
  const claimed = await claimPaidResourceSettlementRetry(args.db, {
    id: args.row.id,
    expectedRevision: args.row.revision,
    claimToken,
    claimExpiresAt: new Date(claimNow.getTime() + CLAIM_TTL_MS).toISOString(),
    now: claimNow.toISOString(),
  })
  if (!claimed.ok) {
    if (claimed.record?.state === 'fulfilled') {
      return fulfilledResponse(claimed.record, args.corsHeaders)
    }
    return errorJson(409, 'paid_resource_in_progress', args.corsHeaders, {
      retryable: true,
      settlementAttempted: true,
    })
  }
  const settlement = await settleXrplPayment({
    transport: args.transport,
    paymentPayload: args.paymentPayload,
    requirements: args.requirements,
    transactionHash: claimed.record.transaction_hash as string,
  })
  if (settlement.ok) {
    return fulfill({
      ...args,
      row: claimed.record,
      response: settlement.response,
      claimToken,
    })
  }
  if (settlement.ok === false && settlement.code === 'settlement_failed') {
    return rejectPaidResourceSettlement({
      ...args,
      row: claimed.record,
      fromState: 'settling',
      claimToken,
    })
  }
  const unknown = await markPaidResourceSettlementUnknown(args.db, {
    id: claimed.record.id,
    expectedRevision: claimed.record.revision,
    claimToken,
    now: args.now().toISOString(),
  })
  return unknown.record?.state === 'fulfilled'
    ? fulfilledResponse(unknown.record, args.corsHeaders)
    : unknownResponse(unknown.record ?? claimed.record, args.corsHeaders)
}
