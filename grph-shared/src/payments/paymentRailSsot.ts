export const PAYMENT_RAIL_IDS = Object.freeze(['stripe', 'straitsx'] as const)
export const PAYMENT_SETTLEMENT_ASSETS = Object.freeze(['fiat', 'xsgd'] as const)
export const PAYMENT_RAIL_SELECTION_REASONS = Object.freeze([
  'sgd_fiat',
  'xsgd',
  'card_currency',
  'only_ready_rail',
] as const)

export type PaymentRailId = typeof PAYMENT_RAIL_IDS[number]
export type PaymentSettlementAsset = typeof PAYMENT_SETTLEMENT_ASSETS[number]
export type PaymentRailSelectionReason = typeof PAYMENT_RAIL_SELECTION_REASONS[number]
export type PaymentRailReadiness = Readonly<Record<PaymentRailId, boolean> & {
  /**
   * XSGD is a separately granted capability. A ready StraitsX fiat rail does
   * not imply that an account may accept XSGD.
   */
  xsgd?: boolean
}>

export type PaymentRailSelectionInput = Readonly<{
  currency: string
  settlementAsset: string
  readiness: PaymentRailReadiness
  cardSettledCurrencies: readonly string[]
}>

export type PaymentRailSelectionResult =
  | Readonly<{
      ok: true
      rail: PaymentRailId
      reason: PaymentRailSelectionReason
    }>
  | Readonly<{
      ok: false
      rail: null
      code: 'rail_unavailable'
      reason: 'no_ready_compatible_rail'
      compatibleRails: readonly PaymentRailId[]
    }>

const ISO_CURRENCY_PATTERN = /^[a-z]{3}$/
const NO_COMPATIBLE_RAILS = Object.freeze([] as PaymentRailId[])
const STRIPE_COMPATIBLE_RAILS = Object.freeze(['stripe'] as const)
const STRAITSX_COMPATIBLE_RAILS = Object.freeze(['straitsx'] as const)

const normalizeToken = (value: unknown): string => String(value || '').trim().toLowerCase()

const compatibleRailsFor = (
  currency: string,
  settlementAsset: string,
  cardSettledCurrencies: ReadonlySet<string>,
): readonly PaymentRailId[] => {
  if (settlementAsset === 'xsgd') return STRAITSX_COMPATIBLE_RAILS
  if (settlementAsset !== 'fiat' || !ISO_CURRENCY_PATTERN.test(currency)) {
    return NO_COMPATIBLE_RAILS
  }
  if (currency === 'sgd') return PAYMENT_RAIL_IDS
  return cardSettledCurrencies.has(currency)
    ? STRIPE_COMPATIBLE_RAILS
    : NO_COMPATIBLE_RAILS
}

export function selectPaymentRail(input: PaymentRailSelectionInput): PaymentRailSelectionResult {
  const currency = normalizeToken(input.currency)
  const settlementAsset = normalizeToken(input.settlementAsset)
  const cardSettledCurrencies = new Set(
    (input.cardSettledCurrencies || []).map(normalizeToken),
  )
  const compatibleRails = compatibleRailsFor(currency, settlementAsset, cardSettledCurrencies)
  const readyCompatibleRails = compatibleRails.filter(rail => {
    if (rail !== 'straitsx' || settlementAsset !== 'xsgd') {
      return input.readiness[rail] === true
    }
    return input.readiness.straitsx === true && input.readiness.xsgd === true
  })

  if (readyCompatibleRails.length === 0) {
    return Object.freeze({
      ok: false,
      rail: null,
      code: 'rail_unavailable',
      reason: 'no_ready_compatible_rail',
      compatibleRails,
    })
  }
  if (readyCompatibleRails.length === 1 && compatibleRails.length > 1) {
    return Object.freeze({
      ok: true,
      rail: readyCompatibleRails[0],
      reason: 'only_ready_rail',
    })
  }
  if (settlementAsset === 'xsgd') {
    return Object.freeze({ ok: true, rail: 'straitsx', reason: 'xsgd' })
  }
  if (currency === 'sgd') {
    return Object.freeze({ ok: true, rail: 'straitsx', reason: 'sgd_fiat' })
  }
  return Object.freeze({ ok: true, rail: 'stripe', reason: 'card_currency' })
}
