interface MarketplaceEnv { MARKETPLACE_DB: D1Database }

const MAX_BODY_BYTES = 128 * 1024
const STATES = new Set(['pending_review', 'approved', 'active', 'suspended'])
const TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  pending_review: ['approved'], approved: ['active', 'suspended'], active: ['suspended'], suspended: ['approved'],
})

export default {
  async fetch(request: Request, env: MarketplaceEnv): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (request.method === 'GET' && (url.pathname === '/livez' || url.pathname === '/readyz')) {
        const row = await env.MARKETPLACE_DB.prepare(
          "SELECT COUNT(*) AS count FROM marketplace_commission_rule WHERE commission_rule_id = 'travel-standard'",
        ).first<{ count: number }>()
        return json({ ok: row?.count === 1, contract: 'agenticgraph.marketplace/v1', storage: 'd1' }, row?.count === 1 ? 200 : 503)
      }
      if (request.method === 'POST' && url.pathname === '/v1/vendors/resolve') {
        const body = await readBody(request)
        if (!body || !Array.isArray(body.vendorIds) || body.vendorIds.length === 0 || body.vendorIds.length > 32
          || body.vendorIds.some((id) => typeof id !== 'string')) return json({ ok: false, reason: 'request-malformed' }, 400)
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
        if (rows.results.length !== ids.length) return json({ ok: false, reason: 'vendor-unresolvable' }, 422)
        return json({ ok: true, vendors: rows.results.map((row) => ({
          vendorId: row.vendor_id, payoutPrincipalId: row.payout_principal_id,
          lifecycleState: row.lifecycle_state, settlementCurrency: row.settlement_currency,
          commissionRuleId: row.commission_rule_id, commissionRuleRevision: row.commission_rule_revision,
          commissionRule: JSON.parse(row.rule_body),
        })) })
      }
      if (request.method === 'POST' && url.pathname === '/v1/payouts/authorize') {
        const body = await readBody(request)
        if (!body || typeof body.vendorId !== 'string' || typeof body.splitId !== 'string') {
          return json({ ok: false, reason: 'request-malformed' }, 400)
        }
        const vendor = await env.MARKETPLACE_DB.prepare(
          'SELECT lifecycle_state FROM marketplace_vendor WHERE vendor_id = ?',
        ).bind(body.vendorId).first<{ lifecycle_state: string }>()
        const allowed = vendor?.lifecycle_state === 'active'
        return json({ ok: true, allowed, reason: allowed ? null : vendor ? `vendor-${vendor.lifecycle_state}` : 'vendor-not-found' })
      }
      if (request.method === 'POST' && url.pathname === '/v1/report') {
        const body = await readBody(request)
        if (!body || !Array.isArray(body.splits) || !Array.isArray(body.payouts)) {
          return json({ ok: false, reason: 'request-malformed' }, 400)
        }
        const statements: D1PreparedStatement[] = []
        for (const value of body.splits) {
          if (!isRecord(value)) return json({ ok: false, reason: 'split-malformed' }, 400)
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
          if (!isRecord(value)) return json({ ok: false, reason: 'payout-malformed' }, 400)
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
        return json({ ok: true })
      }
      if (request.method === 'POST' && url.pathname.startsWith('/v1/vendors/') && url.pathname.endsWith('/transition')) {
        const vendorId = decodeURIComponent(url.pathname.split('/')[3] ?? '')
        const actor = request.headers.get('x-operator-id')
        const body = await readBody(request)
        if (!actor || !body || typeof body.state !== 'string' || !STATES.has(body.state)) {
          return json({ ok: false, reason: 'request-malformed' }, 400)
        }
        const current = await env.MARKETPLACE_DB.prepare(
          'SELECT lifecycle_state FROM marketplace_vendor WHERE vendor_id = ?',
        ).bind(vendorId).first<{ lifecycle_state: string }>()
        if (!current) return json({ ok: false, reason: 'vendor-not-found' }, 404)
        if (!TRANSITIONS[current.lifecycle_state]?.includes(body.state)) {
          return json({ ok: false, reason: 'transition-rejected' }, 409)
        }
        await env.MARKETPLACE_DB.prepare(
          'UPDATE marketplace_vendor SET lifecycle_state = ?, updated_at = ? WHERE vendor_id = ?',
        ).bind(body.state, new Date().toISOString(), vendorId).run()
        return json({ ok: true, vendorId, from: current.lifecycle_state, to: body.state, actor })
      }
      return json({ ok: false, reason: 'not-found' }, 404)
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'marketplace request failed', reason: error instanceof Error ? error.message : 'unknown' }))
      return json({ ok: false, reason: 'internal-error' }, 500)
    }
  },
} satisfies ExportedHandler<MarketplaceEnv>

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get('content-type')?.split(';', 1)[0] !== 'application/json') return null
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null
  try { const value: unknown = JSON.parse(text); return isRecord(value) ? value : null } catch { return null }
}

function timestamp(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
