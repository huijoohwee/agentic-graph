import type { Quote } from '../bundle-types'

export type CommissionRule = Readonly<{
  kind: 'flat' | 'tiered'
  bps?: number
  tiers?: readonly Readonly<{ upToMinor: number | null; bps: number }>[]
}>

export type MarketplaceVendor = Readonly<{
  vendorId: string
  payoutPrincipalId: string
  lifecycleState: 'pending_review' | 'approved' | 'active' | 'suspended'
  settlementCurrency: string
  commissionRuleId: string
  commissionRuleRevision: string
  commissionRule: CommissionRule
}>

export type MarketplaceSplit = Readonly<{
  splitId: string
  bundleId: string
  vendorId: string
  payoutPrincipalId: string
  coveredLegIds: readonly string[]
  settlementCurrency: string
  grossAmountMinor: number
  commissionAmountMinor: number
  netPayoutAmountMinor: number
  commissionRuleId: string
  commissionRuleRevision: string
}>

export type MarketplaceResolution = Readonly<{
  ok: true
  vendors: readonly MarketplaceVendor[]
}> | Readonly<{ ok: false; reason: string }>

export type MarketplaceQuote = Pick<Quote, 'legId' | 'agentId' | 'amountMinor' | 'currency'>
