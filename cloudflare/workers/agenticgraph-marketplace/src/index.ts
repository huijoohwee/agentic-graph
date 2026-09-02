import { handleMarketplaceProviderRequest, marketplaceProviderConfigured } from './commerce-provider.ts'
import { isRecord, nativeJson, readJsonObject, timestamp } from './http.ts'

const MAX_BODY_BYTES = 128 * 1024

export default {
  async fetch(request: Request, env: MarketplaceEnv): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (request.method === 'GET' && url.pathname === '/livez') {
        return nativeJson({ ok: true, contract: 'agenticgraph.marketplace/v1', storage: 'd1' })
      }
      if (request.method === 'GET' && url.pathname === '/readyz') {
        const row = await env.MARKETPLACE_DB.prepare(
          "SELECT COUNT(*) AS count FROM marketplace_commission_rule WHERE commission_rule_id = 'travel-standard'",
        ).first<{ count: number }>()
        const configured = await marketplaceProviderConfigured(env)
        const ok = row?.count === 1 && configured
        return nativeJson({
          ok,
          contract: 'agenticgraph.marketplace/v1',
          providerContract: 'commerce.marketplace-provider/v1',
          storage: 'd1',
          evidenceConfigured: configured,
        }, ok ? 200 : 503)
      }
      const providerResponse = await handleMarketplaceProviderRequest(request, env)
      if (providerResponse) return providerResponse
      if (request.method === 'POST' && url.pathname === '/v1/vendors/resolve') {
        const body = await readJsonObject(request, MAX_BODY_BYTES)
        if (!body || !Array.isArray(body.vendorIds) || body.vendorIds.length === 0 || body.vendorIds.length > 32
          || body.vendorIds.some((id) => typeof id !== 'string')) return nativeJson({ ok: false, reason: 'request-malformed' }, 400)
        const ids = [...new Set(body.vendorIds as string[])].sort()
        const marks = ids.map(() => '?').join(',')
        const rows = await env.MARKETPLACE_DB.prepare(
          `SELECT v.vendor_id, v.payout_principal_id, v.lifecycle_state, v.settlement_currency,
             v.commission_rule_id, v.commission_rule_revision, r.rule_body
           FROM marketplace_vendor v JOIN marketplace_commission_rule r
             ON r.commission_rule_id = v.commission_rule_id AND r.revision = v.commission_rule_revision
           WHERE v.vendor_id IN (${marks}) ORDER BY v.vendor_id`,
        ).bind(...ids).all<{
          vendor_id: string; payout_principal_id: string; lifecycle_state: string; settlement_currency: string
          commission_rule_id: string; commission_rule_revision: string; rule_body: string
        }>()
        if (rows.results.length !== ids.length) return nativeJson({ ok: false, reason: 'vendor-unresolvable' }, 422)
        return nativeJson({ ok: true, vendors: rows.results.map((row) => ({
          vendorId: row.vendor_id, payoutPrincipalId: row.payout_principal_id,
          lifecycleState: row.lifecycle_state, settlementCurrency: row.settlement_currency,
          commissionRuleId: row.commission_rule_id, commissionRuleRevision: row.commission_rule_revision,
          commissionRule: JSON.parse(row.rule_body),
        })) })
      }
      if (request.method === 'POST' && url.pathname === '/v1/payouts/authorize') {
        const body = await readJsonObject(request, MAX_BODY_BYTES)
        if (!body || typeof body.vendorId !== 'string' || typeof body.splitId !== 'string') {
          return nativeJson({ ok: false, reason: 'request-malformed' }, 400)
        }
        const vendor = await env.MARKETPLACE_DB.prepare(
          'SELECT lifecycle_state FROM marketplace_vendor WHERE vendor_id = ?',
        ).bind(body.vendorId).first<{ lifecycle_state: string }>()
        const allowed = vendor?.lifecycle_state === 'active'
        return nativeJson({ ok: true, allowed, reason: allowed ? null : vendor ? `vendor-${vendor.lifecycle_state}` : 'vendor-not-found' })
      }
      if (request.method === 'POST' && url.pathname === '/v1/report') {
        const body = await readJsonObject(request, MAX_BODY_BYTES)
        if (!body || !Array.isArray(body.splits) || !Array.isArray(body.payouts)) {
          return nativeJson({ ok: false, reason: 'request-malformed' }, 400)
        }
        const statements: D1PreparedStatement[] = []
        for (const value of body.splits) {
          if (!isRecord(value)) return nativeJson({ ok: false, reason: 'split-malformed' }, 400)
          statements.push(env.MARKETPLACE_DB.prepare(
            `INSERT INTO marketplace_vendor_split_projection (
              split_id, bundle_id, vendor_id, leg_ids, settlement_currency, gross_amount_minor,
              commission_amount_minor, net_payout_amount_minor, commission_rule_id,
              commission_rule_revision, projected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(split_id) DO UPDATE SET projected_at = excluded.projected_at`,
          ).bind(value.splitId, value.bundleId, value.vendorId, JSON.stringify(value.coveredLegIds),
            value.settlementCurrency, value.grossAmountMinor, value.commissionAmountMinor,
            value.netPayoutAmountMinor, value.commissionRuleId, value.commissionRuleRevision,
            new Date().toISOString()))
        }
        for (const value of body.payouts) {
          if (!isRecord(value)) return nativeJson({ ok: false, reason: 'payout-malformed' }, 400)
          statements.push(env.MARKETPLACE_DB.prepare(
            `INSERT INTO marketplace_payout (
              payout_id, split_id, idempotency_key, payout_state, attempt_count, terminal_reason,
              settlement_reference, next_attempt_at, last_result_fingerprint, first_attempt_at, terminal_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(payout_id) DO UPDATE SET payout_state = excluded.payout_state,
              attempt_count = excluded.attempt_count, terminal_reason = excluded.terminal_reason,
              settlement_reference = excluded.settlement_reference, next_attempt_at = excluded.next_attempt_at,
              last_result_fingerprint = excluded.last_result_fingerprint, terminal_at = excluded.terminal_at,
              updated_at = excluded.updated_at`,
          ).bind(value.payout_id, value.split_id, value.idempotency_key, value.payout_state,
            value.attempt_count, value.terminal_reason, value.settlement_reference,
            timestamp(value.next_attempt_at), value.last_result_fingerprint,
            Number(value.attempt_count) > 0 ? new Date().toISOString() : null,
            ['settled', 'failed'].includes(String(value.payout_state)) ? new Date().toISOString() : null,
            new Date().toISOString()))
        }
        if (statements.length > 0) await env.MARKETPLACE_DB.batch(statements)
        return nativeJson({ ok: true })
      }
      return nativeJson({ ok: false, reason: 'not-found' }, 404)
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'marketplace request failed', reason: error instanceof Error ? error.message : 'unknown' }))
      return nativeJson({ ok: false, reason: 'internal-error' }, 500)
    }
  },
} satisfies ExportedHandler<MarketplaceEnv>
