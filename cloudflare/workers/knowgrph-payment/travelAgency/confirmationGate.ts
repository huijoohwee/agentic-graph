import { consumeAgenticPurchaseApproval, type AgenticPurchaseApprovalResult } from '../agenticPurchaseSafetyPersistence'
import type { D1DatabaseLike } from '../../shared/d1'

export type PaymentCallRequest = Readonly<{
  approvalRef: string
  lifecycleId: string
  envelopeDigest: string
  candidateDigest: string
  amountMinor: number
  merchantPolicyDigest: string
}>

export type PaymentCallConfirmationResult =
  | Readonly<{ ok: true; approvalRef: string; idempotentReplay: boolean; consumedNow: boolean }>
  | Readonly<{
      ok: false
      code:
        | Extract<AgenticPurchaseApprovalResult, Readonly<{ ok: false }>>['code']
        | 'human_confirmation_missing'
        | 'payment_call_invalid'
    }>

const readString = (value: unknown): string => String(value ?? '').trim()

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export const validatePaymentCallRequest = (value: unknown): PaymentCallRequest | null => {
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
  }
  if (
    !request.approvalRef
    || !request.lifecycleId
    || !request.envelopeDigest
    || !request.candidateDigest
    || !isPositiveInteger(request.amountMinor)
    || !request.merchantPolicyDigest
  ) return null
  return Object.freeze({ ...request, amountMinor: request.amountMinor })
}

/**
 * The only boundary allowed to admit a Payment_Call. A missing, expired,
 * conflicting, or already-consumed Human_Confirm_Event blocks before the caller
 * can invoke the payment provider/tool.
 */
export const requireHumanConfirmationForPaymentCall = async (
  db: D1DatabaseLike,
  value: unknown,
  now: string,
): Promise<PaymentCallConfirmationResult> => {
  const request = validatePaymentCallRequest(value)
  if (!request) return Object.freeze({ ok: false, code: 'payment_call_invalid' })
  const approval = await consumeAgenticPurchaseApproval(db, {
    approvalRef: request.approvalRef,
    lifecycleId: request.lifecycleId,
    envelopeDigest: request.envelopeDigest,
    candidateDigest: request.candidateDigest,
    amountMinor: request.amountMinor,
    merchantPolicyDigest: request.merchantPolicyDigest,
    now,
  })
  if (!approval.ok) {
    return Object.freeze({
      ok: false,
      code: (approval as Extract<AgenticPurchaseApprovalResult, { ok: false }>).code === 'approval_not_found'
            ? 'human_confirmation_missing'
            : (approval as Extract<AgenticPurchaseApprovalResult, { ok: false }>).code,
    })
  }
  return Object.freeze({
    ok: true,
    approvalRef: approval.approvalRef,
    idempotentReplay: approval.idempotentReplay,
    consumedNow: approval.consumedNow,
  })
}
