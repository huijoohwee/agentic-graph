import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import type { D1DatabaseLike } from '../../shared/d1'
import { handleStrytreeRoute } from '../strytreeApi'

const rejectingDb = {
  prepare() {
    throw new Error('production-disabled local checkout must not touch D1')
  },
} as unknown as D1DatabaseLike

const invoke = async (pathname: string, env: Record<string, unknown> = {}) => {
  const response = await handleStrytreeRoute(new Request(`https://payment.test${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'caller-key' },
    body: '{}',
  }), env, rejectingDb, {})
  assert.ok(response)
  return response
}

test('production checkout mode cannot create or client-complete local checkout value', async () => {
  const env = { STRYTREE_CHECKOUT_MODE: 'provider-webhook' }
  const create = await invoke('/api/strytree/checkout/sessions', env)
  assert.equal(create.status, 403)
  assert.equal((await create.json() as { code: string }).code, 'local_checkout_disabled')

  const complete = await invoke('/api/strytree/checkout/sessions/session-1/complete', env)
  assert.equal(complete.status, 403)
  assert.equal((await complete.json() as { code: string }).code, 'local_checkout_completion_disabled')
})

test('local checkout is fail closed when mode is missing or misspelled', async () => {
  for (const mode of [undefined, '', 'production', 'local_developmen']) {
    const response = await invoke('/api/strytree/checkout/sessions', {
      STRYTREE_CHECKOUT_MODE: mode,
    })
    assert.equal(response.status, 403)
  }
})

test('deployment configs isolate all net-settlement lanes and keep broad checkout webhook-only', async () => {
  const [isolated, broad] = await Promise.all([
    readFile(new URL('../wrangler.net-settlement.toml', import.meta.url), 'utf8'),
    readFile(new URL('../wrangler.toml', import.meta.url), 'utf8'),
  ])
  for (const lane of ['dev', 'staging', 'production']) {
    assert.match(isolated, new RegExp(`name = "knowgrph-travel-net-settlement-${lane}"`))
  }
  assert.match(isolated, /main = "netSettlementWorker\.ts"/)
  assert.doesNotMatch(isolated, /\[\[routes\]\]/)
  assert.match(isolated, /service = "knowgrph-travel-settlement-executor-production"/)
  assert.match(broad, /STRYTREE_CHECKOUT_MODE = "provider-webhook"/)
})
