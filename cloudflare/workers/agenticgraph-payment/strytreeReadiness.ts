import { queryAll, type D1DatabaseLike } from '../shared/d1'

type LedgerStub = { fetch(request: Request): Promise<Response> }
type LedgerNamespace = {
  getByName?: (name: string) => LedgerStub
  idFromName?: (name: string) => unknown
  get?: (id: unknown) => LedgerStub
}

type ReadinessEnv = Record<string, unknown> & {
  STRYTREE_CHECKOUT_MODE?: unknown
  STRYTREE_CREDIT_LEDGER?: unknown
}

const PROBE_TIMEOUT_MS = 2_000

const json = (status: number, body: unknown, headers: Record<string, string>): Response => Response.json(body, {
  status,
  headers: { ...headers, 'cache-control': 'no-store' },
})

const ledgerStub = (env: ReadinessEnv): LedgerStub | null => {
  const namespace = env.STRYTREE_CREDIT_LEDGER as LedgerNamespace | undefined
  if (typeof namespace?.getByName === 'function') return namespace.getByName('readiness')
  if (typeof namespace?.idFromName === 'function' && typeof namespace.get === 'function') {
    return namespace.get(namespace.idFromName('readiness'))
  }
  return null
}

const verifyProjectionSchema = async (db: D1DatabaseLike): Promise<boolean> => {
  const columns = await queryAll<{ name: string }>(db, 'PRAGMA table_info(strytree_token_ledger)')
  const names = new Set(columns.map((column) => column.name))
  if (!names.has('semantic_digest') || !names.has('authority_version')) return false
  await queryAll(db, 'SELECT provider_event_id FROM strytree_provider_effect_claims LIMIT 1')
  return true
}

export const inspectStrytreeReadiness = async (
  env: ReadinessEnv,
  db: D1DatabaseLike,
  headers: Record<string, string>,
): Promise<Response> => {
  const checkoutMode = String(env.STRYTREE_CHECKOUT_MODE || '').trim().toLowerCase()
  const stub = ledgerStub(env)
  if (checkoutMode !== 'provider-webhook' || !stub) {
    return json(503, {
      ok: false,
      service: 'strytree-financial-runtime',
      code: 'configuration-unavailable',
      dependencies: {
        checkout: checkoutMode === 'provider-webhook' ? 'provider-webhook' : 'unsafe-or-missing',
        ledger: stub ? 'configured' : 'missing',
        projection: 'unchecked',
      },
    }, headers)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('strytree-readiness-deadline'), PROBE_TIMEOUT_MS)
  try {
    const [schemaReady, actorResponse] = await Promise.all([
      verifyProjectionSchema(db),
      stub.fetch(new Request('https://strytree-credit-ledger.internal/readyz', {
        signal: controller.signal,
      })),
    ])
    const actor = await actorResponse.json().catch(() => null) as Record<string, unknown> | null
    const actorReady = actorResponse.ok && actor?.ok === true && actor?.authority === 'durable-object-sqlite'
    if (!schemaReady || !actorReady) throw new Error('Strytree financial dependency unavailable')
    return json(200, {
      ok: true,
      service: 'strytree-financial-runtime',
      dependencies: {
        checkout: 'provider-webhook',
        ledger: 'durable-object-sqlite',
        projection: 'd1-versioned',
      },
    }, headers)
  } catch {
    return json(503, {
      ok: false,
      service: 'strytree-financial-runtime',
      code: 'dependency-unavailable',
      dependencies: {
        checkout: 'provider-webhook',
        ledger: 'unavailable',
        projection: 'unavailable',
      },
    }, headers)
  } finally {
    clearTimeout(timeout)
  }
}
