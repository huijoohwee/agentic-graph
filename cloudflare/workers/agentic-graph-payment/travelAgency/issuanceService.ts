import type { D1DatabaseLike } from '../../shared/d1'
import { requireHumanConfirmationForPaymentCall, type PaymentCallConfirmationResult, type PaymentCallRequest } from './confirmationGate'
import {
  resolveTravelAgencyIssuanceConfig,
  type TravelAgencyConfigError,
  type TravelAgencyEnv,
} from './runtimeConfig'

export type TravelAgencyIssuanceRequest = PaymentCallRequest & Readonly<{
  transactionId: string
  currency: string
}>

export type TravelAgencyIssuanceResult =
  | Readonly<{
      ok: true
      state: 'issuance-ready'
      providerDispatch: Readonly<{
        mcpServerKey: string
        transport: 'sse'
        toolName: string
        deadlineMs: number
        amountMinor: number
        currency: string
      }>
    }>
  | Readonly<{
      ok: false
      code:
        | 'configuration-missing'
        | 'confirmation-required'
        | 'amount-exceeds-per-card-cap'
        | 'currency-mismatch'
        | 'production-issuance-blocked'
        | 'payment-call-invalid'
      fields?: readonly string[]
      configuredCapMinor?: number
      approvedAmountMinor?: number
      expectedCurrency?: string
      receivedCurrency?: string
      configError?: TravelAgencyConfigError
    }>

const readString = (value: unknown): string => String(value ?? '').trim()
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export const validateTravelAgencyIssuanceRequest = (value: unknown): TravelAgencyIssuanceRequest | null => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const request = {
    approvalRef: readString(record.approvalRef),
    lifecycleId: readString(record.lifecycleId),
    envelopeDigest: readString(record.envelopeDigest),
    candidateDigest: readString(record.candidateDigest),
    amountMinor: record.amountMinor,
    merchantPolicyDigest: readString(record.merchantPolicyDigest),
    transactionId: readString(record.transactionId),
    currency: readString(record.currency).toUpperCase(),
  }
  if (
    !request.approvalRef
    || !request.lifecycleId
    || !request.envelopeDigest
    || !request.candidateDigest
    || !isPositiveInteger(request.amountMinor)
    || !request.merchantPolicyDigest
    || !request.transactionId
    || !request.currency
  ) return null
  return Object.freeze({ ...request, amountMinor: request.amountMinor })
}

export const prepareTravelAgencyIssuance = async (args: {
  db: D1DatabaseLike
  env: TravelAgencyEnv
  request: unknown
  now: string
  productionIssuanceEnabled?: boolean
}): Promise<TravelAgencyIssuanceResult> => {
  const issuanceRequest = validateTravelAgencyIssuanceRequest(args.request)
  if (!issuanceRequest) return Object.freeze({ ok: false, code: 'payment-call-invalid' })

  const config = resolveTravelAgencyIssuanceConfig(args.env)
  if ('code' in config) {
    return Object.freeze({ ok: false, code: 'configuration-missing', fields: Object.freeze(config.fields), configError: config })
  }
  if (issuanceRequest.currency !== config.currency) {
    return Object.freeze({
      ok: false,
      code: 'currency-mismatch',
      expectedCurrency: config.currency,
      receivedCurrency: issuanceRequest.currency,
    })
  }
  if (issuanceRequest.amountMinor > config.perCardCapMinor) {
    return Object.freeze({
      ok: false,
      code: 'amount-exceeds-per-card-cap',
      configuredCapMinor: config.perCardCapMinor,
      approvedAmountMinor: issuanceRequest.amountMinor,
    })
  }

  const confirmation = await requireHumanConfirmationForPaymentCall(args.db, issuanceRequest, args.now)
  if (!confirmation.ok) {
    const confirmationCode = (confirmation as Extract<PaymentCallConfirmationResult, { ok: false }>).code
    return Object.freeze({ ok: false, code: confirmationCode === 'human_confirmation_missing' ? 'confirmation-required' : 'payment-call-invalid' })
  }
  if (!args.productionIssuanceEnabled) {
    return Object.freeze({ ok: false, code: 'production-issuance-blocked' })
  }

  return Object.freeze({
    ok: true,
    state: 'issuance-ready',
    providerDispatch: Object.freeze({
      mcpServerKey: config.mcpServerKey,
      transport: config.transport,
      toolName: config.toolName,
      deadlineMs: config.responseDeadlineMs,
      amountMinor: issuanceRequest.amountMinor,
      currency: config.currency,
    }),
  })
}
