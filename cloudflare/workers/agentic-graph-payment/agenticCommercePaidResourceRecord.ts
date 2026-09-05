import { parsePaymentRequired, parsePaymentRequirements } from '@x402/core/schemas'
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types'

import {
  AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS,
  AGENTIC_COMMERCE_PAID_RESOURCE_ID,
  buildAgenticCommercePaidResourcePaymentRequired,
  buildAgenticCommercePaidResourcePaymentRequirements,
  buildAgenticCommercePaidResourceTransportDigest,
  canonicalizeAgenticCommercePaidResourceJson,
  readAgenticCommercePaidResourceConfiguration,
  sha256AgenticCommercePaidResourceHex,
  type AgenticCommercePaidResourceConfiguration,
} from '../../../grph-shared/src/payments/agenticCommercePaidResourceSsot'
import type { PaidResourceRow } from './agenticCommercePaidResourcePersistence'

export type StoredPaidResourceContract = Readonly<{
  config: AgenticCommercePaidResourceConfiguration
  paymentRequired: PaymentRequired
  requirements: PaymentRequirements
}>

export const exactPaidResourceRequest = (
  row: PaidResourceRow,
  expected: {
    invoiceId: string
    idempotencyKey: string
    requestDigest: string
  },
): boolean => row.id === expected.invoiceId
  && row.resource_id === AGENTIC_COMMERCE_PAID_RESOURCE_ID
  && row.idempotency_key === expected.idempotencyKey
  && row.request_digest === expected.requestDigest

export const exactStoredPaidResourcePayment = (
  row: PaidResourceRow,
  payment: {
    paymentPayloadDigest: string
    signedTxBlobDigest: string
    transactionHash: string
  },
): boolean => {
  const stored = [row.payment_payload_digest, row.signed_blob_digest, row.transaction_hash]
  return stored.every(value => value === null) || (
    row.payment_payload_digest === payment.paymentPayloadDigest
    && row.signed_blob_digest === payment.signedTxBlobDigest
    && row.transaction_hash === payment.transactionHash
  )
}

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const digestMatches = async (json: string, digest: string): Promise<boolean> =>
  digest === `sha256:${await sha256AgenticCommercePaidResourceHex(json)}`

const readResourceUrl = (paymentRequired: PaymentRequired): string | null => {
  const resource = (paymentRequired as unknown as { resource?: unknown }).resource
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return null
  const url = (resource as { url?: unknown }).url
  return typeof url === 'string' ? url : null
}

export const readStoredPaidResourceContract = async (
  row: PaidResourceRow,
): Promise<StoredPaidResourceContract | null> => {
  if (!await digestMatches(row.requirements_json, row.requirements_digest)
    || !await digestMatches(row.payment_required_json, row.payment_required_digest)
    || row.transport_digest !== await buildAgenticCommercePaidResourceTransportDigest({
      network: row.network,
      facilitatorUrl: row.facilitator_url,
      rpcUrl: row.rpc_url,
    })) {
    return null
  }
  const parsedRequirements = parsePaymentRequirements(parseJson(row.requirements_json))
  const parsedPaymentRequired = parsePaymentRequired(parseJson(row.payment_required_json))
  if (!parsedRequirements.success || !parsedPaymentRequired.success) return null
  const requirements = parsedRequirements.data as unknown as PaymentRequirements
  const paymentRequired = parsedPaymentRequired.data as unknown as PaymentRequired
  const extra = requirements.extra
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return null
  const invoiceId = (extra as Record<string, unknown>).invoiceId
  const sourceTag = (extra as Record<string, unknown>).sourceTag
  const destinationTag = (extra as Record<string, unknown>).destinationTag
  const resourceUrl = readResourceUrl(paymentRequired)
  if (typeof invoiceId !== 'string' || invoiceId !== row.id || !resourceUrl) return null

  const configured = readAgenticCommercePaidResourceConfiguration({
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.network]: requirements.network,
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.payToAddress]: requirements.payTo,
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.amountDrops]: requirements.amount,
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.sourceTag]: sourceTag,
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.destinationTag]: destinationTag ?? '',
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.facilitatorUrl]: row.facilitator_url,
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.rpcUrl]: row.rpc_url,
    [AGENTIC_COMMERCE_PAID_RESOURCE_ENV_KEYS.maxTimeoutSeconds]: requirements.maxTimeoutSeconds,
  })
  if (!configured.ok || configured.config.network !== row.network) return null

  const expectedRequirements = buildAgenticCommercePaidResourcePaymentRequirements({
    config: configured.config,
    invoiceId,
  })
  const expectedPaymentRequired = buildAgenticCommercePaidResourcePaymentRequired({
    baseUrl: resourceUrl,
    config: configured.config,
    invoiceId,
  })
  if (
    canonicalizeAgenticCommercePaidResourceJson(expectedRequirements)
      !== canonicalizeAgenticCommercePaidResourceJson(requirements)
    || canonicalizeAgenticCommercePaidResourceJson(expectedPaymentRequired)
      !== canonicalizeAgenticCommercePaidResourceJson(paymentRequired)
  ) return null

  return Object.freeze({
    config: configured.config,
    paymentRequired: expectedPaymentRequired as unknown as PaymentRequired,
    requirements: expectedRequirements as unknown as PaymentRequirements,
  })
}
