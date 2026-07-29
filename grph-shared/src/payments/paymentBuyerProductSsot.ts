import type {
  PaymentIntentCommand,
} from './paymentRuntimeContract.js'
import type {
  PaymentSettlementAsset,
} from './paymentRailSsot.js'

export const PAYMENT_BUYER_PRODUCT_ENV_KEYS = Object.freeze({
  amountMinor: 'PAYMENT_BUYER_PRODUCT_AMOUNT_MINOR',
  currency: 'PAYMENT_BUYER_PRODUCT_CURRENCY',
  settlementAsset: 'PAYMENT_BUYER_PRODUCT_SETTLEMENT_ASSET',
} as const)

export type PaymentBuyerProduct = Readonly<{
  amountMinor: number
  currency: string
  settlementAsset: PaymentSettlementAsset
}>

export type PaymentBuyerProductResolution =
  | Readonly<{ ok: true; value: PaymentBuyerProduct; missing: readonly string[] }>
  | Readonly<{ ok: false; value: null; missing: readonly string[] }>

const readEnvString = (
  env: Readonly<Record<string, unknown>>,
  key: string,
): string => String(env[key] || '').trim()

export const resolvePaymentBuyerProduct = (
  env: Readonly<Record<string, unknown>>,
): PaymentBuyerProductResolution => {
  const amountText = readEnvString(
    env,
    PAYMENT_BUYER_PRODUCT_ENV_KEYS.amountMinor,
  )
  const currency = readEnvString(
    env,
    PAYMENT_BUYER_PRODUCT_ENV_KEYS.currency,
  ).toLowerCase()
  const settlementAsset = readEnvString(
    env,
    PAYMENT_BUYER_PRODUCT_ENV_KEYS.settlementAsset,
  ).toLowerCase()
  const amountMinor = /^[1-9]\d*$/.test(amountText)
    ? Number(amountText)
    : Number.NaN
  const missing = [
    ...(!Number.isSafeInteger(amountMinor)
      ? [PAYMENT_BUYER_PRODUCT_ENV_KEYS.amountMinor]
      : []),
    ...(!/^[a-z]{3}$/.test(currency)
      ? [PAYMENT_BUYER_PRODUCT_ENV_KEYS.currency]
      : []),
    ...(!['fiat', 'xsgd'].includes(settlementAsset)
      ? [PAYMENT_BUYER_PRODUCT_ENV_KEYS.settlementAsset]
      : []),
  ]
  if (missing.length > 0) {
    return Object.freeze({
      ok: false,
      value: null,
      missing: Object.freeze(missing),
    })
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      amountMinor,
      currency,
      settlementAsset: settlementAsset as PaymentSettlementAsset,
    }),
    missing: Object.freeze([]),
  })
}

export const paymentCommandMatchesBuyerProduct = (
  command: PaymentIntentCommand,
  product: PaymentBuyerProduct,
): boolean =>
  command.amountMinor === product.amountMinor
  && command.currency === product.currency
  && command.settlementAsset === product.settlementAsset
