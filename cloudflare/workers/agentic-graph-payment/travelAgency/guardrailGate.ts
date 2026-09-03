import { zeroModelCostLog, type TravelAgencyCostLog } from './costLog'
import { type TravelAgencyIntent } from './intentParser'
import { resolveTravelAgencyGuardrailConfig, type TravelAgencyConfigError, type TravelAgencyEnv } from './runtimeConfig'

export type TravelAgencyOffer = {
  offerId: string
  amountMinor: number
  currency: string
  date: string
}

export type GuardrailProbe = {
  evolve: (args: { intent: TravelAgencyIntent; blockedOffer: TravelAgencyOffer; attempt: number }) => Promise<TravelAgencyOffer | null>
}

export type GuardrailDecision =
  | { ok: true; offer: TravelAgencyOffer; attempts: number; costLog: TravelAgencyCostLog }
  | { ok: false; code: 'budget-exceeded' | 'configuration-missing'; attempts: number; error?: TravelAgencyConfigError; costLog: TravelAgencyCostLog }

const sameCurrency = (offer: TravelAgencyOffer, intent: TravelAgencyIntent): boolean =>
  offer.currency.toUpperCase() === intent.budgetCeiling.currency.toUpperCase()

const withinBudget = (offer: TravelAgencyOffer, intent: TravelAgencyIntent, maxBudgetMinor: number): boolean =>
  sameCurrency(offer, intent)
  && offer.amountMinor <= intent.budgetCeiling.amountMinor
  && offer.amountMinor <= maxBudgetMinor

export const evaluateTravelAgencyGuardrail = async (args: {
  env: TravelAgencyEnv
  intent: TravelAgencyIntent
  offer: TravelAgencyOffer
  probe: GuardrailProbe
}): Promise<GuardrailDecision> => {
  const config = resolveTravelAgencyGuardrailConfig(args.env)
  if ('code' in config) return { ok: false, code: 'configuration-missing', attempts: 0, error: config, costLog: zeroModelCostLog('guardrail') }
  if (args.intent.budgetCeiling.amountMinor < config.minBudgetMinor || args.intent.budgetCeiling.amountMinor > config.maxBudgetMinor) {
    return { ok: false, code: 'budget-exceeded', attempts: 0, costLog: zeroModelCostLog('guardrail') }
  }
  if (withinBudget(args.offer, args.intent, config.maxBudgetMinor)) {
    return { ok: true, offer: args.offer, attempts: 0, costLog: zeroModelCostLog('guardrail') }
  }

  let blockedOffer = args.offer
  for (let attempt = 1; attempt <= config.retryBound; attempt += 1) {
    const evolved = await args.probe.evolve({ intent: args.intent, blockedOffer, attempt })
    if (!evolved) break
    if (withinBudget(evolved, args.intent, config.maxBudgetMinor)) {
      return { ok: true, offer: evolved, attempts: attempt, costLog: zeroModelCostLog('guardrail') }
    }
    blockedOffer = evolved
  }
  return { ok: false, code: 'budget-exceeded', attempts: config.retryBound, costLog: zeroModelCostLog('guardrail') }
}
