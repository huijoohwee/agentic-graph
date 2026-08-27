import { WorkerEntrypoint } from 'cloudflare:workers'
import { isCurrency, isIdentifier, isMinorUnits } from '../bundle/bundle-runtime'
import type {
  GuardrailDecision,
  TravelAgencyOffer,
} from '../../cloudflare/workers/agenticgraph-payment/travelAgency/guardrailGate'
import type { TravelAgencyIntent } from '../../cloudflare/workers/agenticgraph-payment/travelAgency/intentParser'
import type { TravelAgencyEnv } from '../../cloudflare/workers/agenticgraph-payment/travelAgency/runtimeConfig'
import {
  evaluateRegisteredTravelAgencyGuardrail,
  type RegisteredGuardrailContext,
} from './guardrail-envelope-adapter'
import type { OrdinaryOfferTransitionResult } from '../ledger/envelope-ledger'

const MAX_ALTERNATIVE_OFFERS = 3

export type RegisteredGuardrailEvaluationInput = Readonly<{
  context: RegisteredGuardrailContext
  intent: TravelAgencyIntent
  offer: TravelAgencyOffer
  alternativeOffers?: readonly TravelAgencyOffer[]
}>

export type RegisteredGuardrailLifecycleInput = Readonly<{
  principalId: string
  operationId: string
  agentId: string
}>

export class TravelAgencyGuardrailService extends WorkerEntrypoint<TravelCommerceEnv> {
  async evaluateOffer(input: RegisteredGuardrailEvaluationInput): Promise<GuardrailDecision> {
    if (!validEvaluation(input, this.env)) return configurationFailure('Guardrail_Request')
    const alternatives = [...(input.alternativeOffers ?? [])]
    let alternativeIndex = 0
    try {
      return await evaluateRegisteredTravelAgencyGuardrail({
        env: this.env as TravelCommerceEnv & TravelAgencyEnv,
        intent: input.intent,
        offer: input.offer,
        probe: {
          evolve: async () => alternatives[alternativeIndex++] ?? null,
        },
      }, input.context)
    } catch {
      return configurationFailure('Guardrail_Unavailable')
    }
  }

  async commitOffer(input: RegisteredGuardrailLifecycleInput): Promise<OrdinaryOfferTransitionResult> {
    return this.#transition(input, 'committed')
  }

  async releaseOffer(input: RegisteredGuardrailLifecycleInput): Promise<OrdinaryOfferTransitionResult> {
    return this.#transition(input, 'released')
  }

  ready(): Readonly<{
    ok: boolean
    capability: 'registered-offer-atomic-guardrail'
    lane: TravelCommerceEnv['DEPLOY_LANE']
  }> {
    const minimum = Number(this.env.TRAVEL_INTENT_MIN_BUDGET_MINOR)
    const maximum = Number(this.env.TRAVEL_INTENT_MAX_BUDGET_MINOR)
    const ok = isCurrency(this.env.SETTLEMENT_CURRENCY)
      && typeof this.env.ENVELOPE_LEDGER?.getByName === 'function'
      && validLane(this.env.DEPLOY_LANE)
      && nonNegativeInteger(minimum)
      && nonNegativeInteger(maximum)
      && minimum <= maximum
      && nonNegativeInteger(this.env.TRAVEL_GUARDRAIL_RETRY_BOUND)
    return Object.freeze({
      ok,
      capability: 'registered-offer-atomic-guardrail',
      lane: this.env.DEPLOY_LANE,
    })
  }

  async #transition(
    input: RegisteredGuardrailLifecycleInput,
    target: 'committed' | 'released',
  ): Promise<OrdinaryOfferTransitionResult> {
    if (!validLifecycle(input)) return { kind: 'rejected', reason: 'envelope-malformed' }
    try {
      const ledger = this.env.ENVELOPE_LEDGER.getByName(input.principalId)
      return target === 'committed'
        ? await ledger.commitOffer(input.operationId, input.agentId)
        : await ledger.releaseOffer(input.operationId, input.agentId)
    } catch {
      return { kind: 'rejected', reason: 'envelope-unavailable' }
    }
  }
}

function validEvaluation(
  input: unknown,
  env: TravelCommerceEnv,
): input is RegisteredGuardrailEvaluationInput {
  if (!isRecord(input) || !exactKeys(input, ['context', 'intent', 'offer', 'alternativeOffers'])) {
    return false
  }
  if (!isCurrency(env.SETTLEMENT_CURRENCY) || !validLane(env.DEPLOY_LANE)) return false
  const alternatives = input.alternativeOffers ?? []
  return Array.isArray(alternatives)
    && validContext(input.context)
    && (input.context.priceVerification === 'verified'
      || (env.DEPLOY_LANE !== 'Production_Lane'
        && input.context.priceVerification === 'deterministic-demo'))
    && validIntent(input.intent)
    && input.intent.budgetCeiling.currency === env.SETTLEMENT_CURRENCY
    && validOffer(input.offer)
    && input.offer.currency === env.SETTLEMENT_CURRENCY
    && alternatives.length <= MAX_ALTERNATIVE_OFFERS
    && alternatives.every((offer) => validOffer(offer) && offer.currency === env.SETTLEMENT_CURRENCY)
}

function validContext(input: unknown): input is RegisteredGuardrailContext {
  return isRecord(input)
    && exactKeys(input, ['principalId', 'operationId', 'agentId', 'priceVerification'])
    && isIdentifier(input.principalId)
    && isIdentifier(input.operationId)
    && isIdentifier(input.agentId)
    && (input.priceVerification === 'verified' || input.priceVerification === 'deterministic-demo')
}

function validLifecycle(input: unknown): input is RegisteredGuardrailLifecycleInput {
  return isRecord(input)
    && exactKeys(input, ['principalId', 'operationId', 'agentId'])
    && isIdentifier(input.principalId)
    && isIdentifier(input.operationId)
    && isIdentifier(input.agentId)
}

function validIntent(intent: unknown): intent is TravelAgencyIntent {
  if (!isRecord(intent) || !exactKeys(intent, [
    'kind', 'origin', 'destination', 'dateRangeStart', 'dateRangeEnd', 'budgetCeiling',
  ]) || !isRecord(intent.budgetCeiling)
    || !exactKeys(intent.budgetCeiling, ['amountMinor', 'currency'])) return false
  return intent.kind === 'flight'
    && nonEmptyText(intent.origin)
    && nonEmptyText(intent.destination)
    && dateOnly(intent.dateRangeStart)
    && dateOnly(intent.dateRangeEnd)
    && intent.dateRangeStart <= intent.dateRangeEnd
    && isMinorUnits(intent.budgetCeiling.amountMinor)
    && isCurrency(intent.budgetCeiling.currency)
}

function validOffer(offer: unknown): offer is TravelAgencyOffer {
  return isRecord(offer)
    && exactKeys(offer, ['offerId', 'amountMinor', 'currency', 'date'])
    && isIdentifier(offer.offerId)
    && isMinorUnits(offer.amountMinor)
    && isCurrency(offer.currency)
    && dateOnly(offer.date)
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function dateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
}

function nonNegativeInteger(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const text = String(value).trim()
  if (!text) return false
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed >= 0
}

function validLane(value: unknown): value is TravelCommerceEnv['DEPLOY_LANE'] {
  return value === 'Dev_Lane' || value === 'Staging_Lane' || value === 'Production_Lane'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key))
}

function configurationFailure(field: string): GuardrailDecision {
  return {
    ok: false,
    code: 'configuration-missing',
    attempts: 0,
    error: { code: 'configuration-missing', fields: [field] },
    costLog: {
      model: 'none', prompt_tokens: 0, completion_tokens: 0,
      cache_hits: 0, estimated_cost_usd: 0, incomplete: false,
    },
  }
}
