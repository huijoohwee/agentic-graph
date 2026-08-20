import { invalidateCachedBalance, readCachedBalance, writeCachedBalance } from '../cache/balance-cache'
import { isCurrency, isIdentifier, isMinorUnits } from '../bundle/bundle-runtime'
import type { Rejection } from '../bundle/bundle-types'
import {
  evaluateTravelAgencyGuardrail as evaluateInheritedTravelAgencyGuardrail,
  type GuardrailDecision,
} from '../../cloudflare/workers/knowgrph-payment/travelAgency/guardrailGate'
import type { TravelAgencyEnv } from '../../cloudflare/workers/knowgrph-payment/travelAgency/runtimeConfig'

type AuthoritativeBalance = Readonly<{
  principalId: string
  availableBalanceMinor: number
  revision: string
}>

export type RegisteredGuardrailContext = Readonly<{
  principalId: string
  operationId: string
  agentId: string
  priceVerification: 'verified' | 'deterministic-demo'
}>

type InheritedGuardrailArgs = Parameters<typeof evaluateInheritedTravelAgencyGuardrail>[0]

export async function evaluateRegisteredTravelAgencyGuardrail(
  args: Omit<InheritedGuardrailArgs, 'env'> & { env: TravelCommerceEnv & TravelAgencyEnv },
  context: RegisteredGuardrailContext,
): Promise<GuardrailDecision> {
  if (!validContext(context) || !isCurrency(args.intent.budgetCeiling.currency)
    || !isMinorUnits(args.intent.budgetCeiling.amountMinor)) {
    return configurationDecision('envelope-malformed')
  }
  const balance = await confirmAvailableBalance(args.env, context.principalId)
  if (isRejection(balance)) return configurationDecision(balance.reason)
  const envelopeAwareIntent = Object.freeze({
    ...args.intent,
    budgetCeiling: Object.freeze({
      ...args.intent.budgetCeiling,
      amountMinor: Math.min(args.intent.budgetCeiling.amountMinor, balance.availableBalanceMinor),
    }),
  })
  const decision = await evaluateInheritedTravelAgencyGuardrail({ ...args, intent: envelopeAwareIntent })
  if (!decision.ok) return decision
  if (!isMinorUnits(decision.offer.amountMinor) || !isCurrency(decision.offer.currency)
    || decision.offer.currency !== args.intent.budgetCeiling.currency) {
    return unavailableDecision(decision, 'envelope-malformed')
  }
  try {
    const reservation = await args.env.ENVELOPE_LEDGER.getByName(context.principalId).checkAndReserveOffer({
      operationId: context.operationId,
      agentId: context.agentId,
      offerId: decision.offer.offerId,
      amountMinor: decision.offer.amountMinor,
      currency: decision.offer.currency,
      priceVerification: context.priceVerification,
    })
    if (reservation.kind !== 'rejected') return decision
    await ignoreCacheFailure(
      () => invalidateCachedBalance(args.env.BALANCE_CACHE, context.principalId),
      undefined,
    )
    return reservation.reason === 'insufficient-envelope'
      ? blockedDecision(decision)
      : unavailableDecision(decision, reservation.reason)
  } catch {
    await ignoreCacheFailure(
      () => invalidateCachedBalance(args.env.BALANCE_CACHE, context.principalId),
      undefined,
    )
    return unavailableDecision(decision, 'envelope-unavailable')
  }
}

function validContext(context: unknown): context is RegisteredGuardrailContext {
  return Boolean(context && typeof context === 'object' && !Array.isArray(context)
    && isIdentifier((context as RegisteredGuardrailContext).principalId)
    && isIdentifier((context as RegisteredGuardrailContext).operationId)
    && isIdentifier((context as RegisteredGuardrailContext).agentId)
    && ((context as RegisteredGuardrailContext).priceVerification === 'verified'
      || (context as RegisteredGuardrailContext).priceVerification === 'deterministic-demo'))
}

export async function confirmAvailableBalance(
  env: TravelCommerceEnv,
  principalId: string,
): Promise<AuthoritativeBalance | Rejection> {
  if (!isIdentifier(principalId)) return { kind: 'rejected', reason: 'envelope-malformed' }
  const cached = await ignoreCacheFailure(() => readCachedBalance(env.BALANCE_CACHE, principalId), null)
  let authoritative: AuthoritativeBalance | Rejection
  try {
    authoritative = await env.ENVELOPE_LEDGER.getByName(principalId).getAvailableBalance()
  } catch {
    return { kind: 'rejected', reason: 'envelope-unavailable' }
  }
  if (isRejection(authoritative)) return authoritative
  if (!isAuthoritativeBalance(authoritative, principalId)) {
    return { kind: 'rejected', reason: 'envelope-malformed' }
  }
  if (
    cached
    && (cached.revision !== authoritative.revision
      || cached.availableBalanceMinor !== authoritative.availableBalanceMinor)
  ) await ignoreCacheFailure(() => invalidateCachedBalance(env.BALANCE_CACHE, principalId), undefined)
  await ignoreCacheFailure(
    () => writeCachedBalance(env.BALANCE_CACHE, Object.freeze({ ...authoritative, cachedAt: Date.now() })),
    undefined,
  )
  return authoritative
}

function isRejection(value: unknown): value is Rejection {
  return Boolean(value && typeof value === 'object' && 'kind' in value && value.kind === 'rejected')
}

function isAuthoritativeBalance(value: unknown, principalId: string): value is AuthoritativeBalance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.principalId === principalId
    && isMinorUnits(record.availableBalanceMinor)
    && typeof record.revision === 'string'
    && record.revision.length >= 1
    && record.revision.length <= 256
}

export async function guardrailEnvelopeCheck(
  env: TravelCommerceEnv,
  principalId: string,
  amountMinor: number,
): Promise<Readonly<{ status: 'pass'; availableBalanceMinor: number }> | Rejection> {
  if (!isMinorUnits(amountMinor)) return { kind: 'rejected', reason: 'envelope-malformed' }
  const balance = await confirmAvailableBalance(env, principalId)
  if ('kind' in balance) return balance
  return amountMinor <= balance.availableBalanceMinor
    ? { status: 'pass', availableBalanceMinor: balance.availableBalanceMinor }
    : { kind: 'rejected', reason: 'insufficient-envelope', details: { availableAtCheck: balance.availableBalanceMinor } }
}

async function ignoreCacheFailure<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try { return await operation() } catch { return fallback }
}

function blockedDecision(decision: Extract<GuardrailDecision, { ok: true }>): GuardrailDecision {
  return {
    ok: false,
    code: 'budget-exceeded',
    attempts: decision.attempts,
    costLog: decision.costLog,
  }
}

function configurationDecision(reason: string): GuardrailDecision {
  return {
    ok: false,
    code: 'configuration-missing',
    attempts: 0,
    error: { code: 'configuration-missing', fields: [`Envelope_Ledger:${reason}`] },
    costLog: {
      model: 'none', prompt_tokens: 0, completion_tokens: 0,
      cache_hits: 0, estimated_cost_usd: 0, incomplete: false,
    },
  }
}

function unavailableDecision(
  decision: Extract<GuardrailDecision, { ok: true }>,
  reason: string,
): GuardrailDecision {
  return {
    ok: false,
    code: 'configuration-missing',
    attempts: decision.attempts,
    error: { code: 'configuration-missing', fields: [`Envelope_Ledger:${reason}`] },
    costLog: decision.costLog,
  }
}
