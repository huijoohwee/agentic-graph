import type { MarketplaceQuote, MarketplaceSplit, MarketplaceVendor } from './contracts'

const BASIS_POINTS = 10_000n

export function projectMarketplaceSplits(
  bundleId: string,
  quotes: readonly MarketplaceQuote[],
  vendors: readonly MarketplaceVendor[],
): readonly MarketplaceSplit[] | null {
  const byVendor = new Map(vendors.map((vendor) => [vendor.vendorId, vendor]))
  const grouped = new Map<string, { legIds: string[]; gross: number; currency: string }>()
  for (const quote of quotes) {
    if (!quote.agentId || !Number.isSafeInteger(quote.amountMinor) || quote.amountMinor < 0) return null
    if (quote.amountMinor === 0) continue
    const group = grouped.get(quote.agentId) ?? { legIds: [], gross: 0, currency: quote.currency }
    if (group.currency !== quote.currency || !Number.isSafeInteger(group.gross + quote.amountMinor)) return null
    group.legIds.push(quote.legId)
    group.gross += quote.amountMinor
    grouped.set(quote.agentId, group)
  }
  const splits: MarketplaceSplit[] = []
  for (const vendorId of [...grouped.keys()].sort()) {
    const group = grouped.get(vendorId)!
    const vendor = byVendor.get(vendorId)
    if (!vendor || vendor.settlementCurrency !== group.currency) return null
    const basisPoints = resolveBasisPoints(vendor, group.gross)
    if (basisPoints === null) return null
    const commission = Number((BigInt(group.gross) * BigInt(basisPoints)) / BASIS_POINTS)
    splits.push(Object.freeze({
      splitId: `split:${bundleId}:${vendorId}`,
      bundleId,
      vendorId,
      payoutPrincipalId: vendor.payoutPrincipalId,
      coveredLegIds: Object.freeze(group.legIds.sort()),
      settlementCurrency: group.currency,
      grossAmountMinor: group.gross,
      commissionAmountMinor: commission,
      netPayoutAmountMinor: group.gross - commission,
      commissionRuleId: vendor.commissionRuleId,
      commissionRuleRevision: vendor.commissionRuleRevision,
    }))
  }
  return Object.freeze(splits)
}

export function validateMarketplaceSplits(
  bundleId: string,
  quotes: readonly MarketplaceQuote[],
  splits: readonly MarketplaceSplit[],
): boolean {
  if (new Set(splits.map((split) => split.vendorId)).size !== splits.length) return false
  const quoteByLeg = new Map(quotes.filter((quote) => quote.amountMinor > 0).map((quote) => [quote.legId, quote]))
  const covered = new Set<string>()
  for (const split of splits) {
    if (split.bundleId !== bundleId || split.splitId !== `split:${bundleId}:${split.vendorId}`
      || split.coveredLegIds.length === 0 || split.grossAmountMinor <= 0
      || split.grossAmountMinor !== split.commissionAmountMinor + split.netPayoutAmountMinor) return false
    let gross = 0
    for (const legId of split.coveredLegIds) {
      const quote = quoteByLeg.get(legId)
      if (!quote || covered.has(legId) || quote.agentId !== split.vendorId
        || quote.currency !== split.settlementCurrency) return false
      covered.add(legId)
      gross += quote.amountMinor
    }
    if (gross !== split.grossAmountMinor) return false
  }
  return covered.size === quoteByLeg.size
}

function resolveBasisPoints(vendor: MarketplaceVendor, gross: number): number | null {
  const rule = vendor.commissionRule
  const value = rule.kind === 'flat'
    ? rule.bps
    : rule.tiers?.find((tier) => tier.upToMinor === null || gross <= tier.upToMinor)?.bps
  return Number.isInteger(value) && value! >= 0 && value! <= 10_000 ? value! : null
}
