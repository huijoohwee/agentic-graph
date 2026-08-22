import { readBoundedJson } from '../../runtime/bounded-json'
import type { MarketplaceResolution, MarketplaceSplit, MarketplaceVendor } from './contracts'

const MAX_RESPONSE_BYTES = 64 * 1024

export async function resolveMarketplaceVendors(
  service: Fetcher,
  vendorIds: readonly string[],
): Promise<MarketplaceResolution> {
  let response: Response
  try {
    response = await service.fetch(new Request('https://marketplace.internal/v1/vendors/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vendorIds: [...new Set(vendorIds)].sort() }),
    }))
  } catch {
    return { ok: false, reason: 'marketplace-unavailable' }
  }
  const value = await readBoundedJson(response, MAX_RESPONSE_BYTES)
  if (!response.ok || !isRecord(value) || value.ok !== true || !Array.isArray(value.vendors)) {
    return { ok: false, reason: 'marketplace-unavailable' }
  }
  const vendors = value.vendors.filter(isVendor)
  return vendors.length === value.vendors.length
    ? { ok: true, vendors: Object.freeze(vendors) }
    : { ok: false, reason: 'marketplace-response-malformed' }
}

export async function authorizeMarketplacePayout(
  service: Fetcher, split: MarketplaceSplit,
): Promise<Readonly<{ allowed: boolean; reason: string | null; retryable: boolean }>> {
  try {
    const response = await service.fetch(new Request('https://marketplace.internal/v1/payouts/authorize', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ splitId: split.splitId, vendorId: split.vendorId }),
    }))
    const value = await readBoundedJson(response, MAX_RESPONSE_BYTES)
    if (!response.ok || !isRecord(value) || value.ok !== true || typeof value.allowed !== 'boolean') {
      return { allowed: false, reason: 'marketplace-unavailable', retryable: true }
    }
    return {
      allowed: value.allowed,
      reason: value.allowed ? null : typeof value.reason === 'string' ? value.reason : 'vendor-inactive',
      retryable: false,
    }
  } catch {
    return { allowed: false, reason: 'marketplace-unavailable', retryable: true }
  }
}

export async function reportMarketplaceState(
  service: Fetcher,
  splits: readonly MarketplaceSplit[],
  payouts: readonly Record<string, unknown>[],
): Promise<void> {
  const response = await service.fetch(new Request('https://marketplace.internal/v1/report', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ splits, payouts }),
  }))
  if (!response.ok) throw new Error('marketplace-report-failed')
}

function isVendor(value: unknown): value is MarketplaceVendor {
  if (!isRecord(value) || !isRecord(value.commissionRule)) return false
  return typeof value.vendorId === 'string' && typeof value.payoutPrincipalId === 'string'
    && ['pending_review', 'approved', 'active', 'suspended'].includes(String(value.lifecycleState))
    && typeof value.settlementCurrency === 'string' && typeof value.commissionRuleId === 'string'
    && typeof value.commissionRuleRevision === 'string'
    && (value.commissionRule.kind === 'flat' || value.commissionRule.kind === 'tiered')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
