import paymentWorkerModule from '../../../cloudflare/workers/agenticgraph-payment/index.ts'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import { AGENTIC_COMMERCE_ROUTE_PATHS } from 'grph-shared/payments/agenticCommerceSsot'
import {
  AGENTIC_COMMERCE_SOLANA_PAY_KEY,
  AGENTIC_COMMERCE_SOLANA_PAY_SETTLE_PATH,
} from 'grph-shared/payments/agenticCommerceSolanaPaySsot'

const worker = (
  typeof (paymentWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? paymentWorkerModule
    : (paymentWorkerModule as unknown as { default: typeof paymentWorkerModule }).default
) as typeof paymentWorkerModule

const SOLANA_PAY_TEST_RECIPIENT = '11111111111111111111111111111111'
const SOLANA_PAY_TEST_SPL_TOKEN = 'So11111111111111111111111111111111111111112'
const SOLANA_PAY_TEST_SIGNATURE = '5'.repeat(88)

const createCommerceEnv = () => {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & Record<string, unknown>
  env.SELLER_ID = 'seller-neutral'
  env.CHECKOUT_BASE_URL = 'https://commerce.example'
  env.WEB3_ENABLED = 'true'
  env.OPENBOX_API_URL = 'https://openbox.example/risk'
  env.OPENBOX_API_KEY = 'openbox_test_key'
  env.SOLANA_PAY_RECIPIENT = SOLANA_PAY_TEST_RECIPIENT
  env.SOLANA_PAY_SPL_TOKEN = SOLANA_PAY_TEST_SPL_TOKEN
  env.SOLANA_PAY_RPC_URL = 'https://solana.example/rpc'
  return env
}

const createSolanaPaySession = async (env: ReturnType<typeof createCommerceEnv>, idempotencyKey = 'solana-pay-idempotency-1') => {
  const response = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ amount_total: 2500, currency: 'usd', payment_rail: AGENTIC_COMMERCE_SOLANA_PAY_KEY }),
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected Solana Pay session create ok, received ${response.status}: ${await response.text()}`)
  return await response.json() as {
    session: {
      id: string
      status: string
      payment_rail: string
      deposit_address: string
      solana_pay: {
        url: string
        recipient: string
        amount: string
        reference: string
        memo: string
        spl_token: string
      }
    }
  }
}

const buildSolanaPayRpcTransaction = (solanaPay: Awaited<ReturnType<typeof createSolanaPaySession>>['session']['solana_pay']) => ({
  result: {
    transaction: {
      message: {
        accountKeys: [{ pubkey: solanaPay.recipient }, { pubkey: solanaPay.reference }],
        instructions: [{ program: 'spl-memo', parsed: solanaPay.memo }],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [{ accountIndex: 0, mint: solanaPay.spl_token, owner: solanaPay.recipient, uiTokenAmount: { amount: '0', decimals: 6 } }],
      postTokenBalances: [{ accountIndex: 0, mint: solanaPay.spl_token, owner: solanaPay.recipient, uiTokenAmount: { amount: '25000000', decimals: 6 } }],
    },
  },
})

export async function testAgenticCommerceSolanaPayCheckoutReturnsTransferUrlAndReference() {
  const env = createCommerceEnv()
  const created = await createSolanaPaySession(env)
  const session = created.session
  const solanaPay = session.solana_pay
  if (session.status !== 'pending_onchain' || session.payment_rail !== AGENTIC_COMMERCE_SOLANA_PAY_KEY) throw new Error(`expected pending Solana Pay session, got ${JSON.stringify(created)}`)
  if (session.deposit_address !== SOLANA_PAY_TEST_RECIPIENT || solanaPay.recipient !== SOLANA_PAY_TEST_RECIPIENT) throw new Error(`expected configured Solana recipient to own session, got ${JSON.stringify(session)}`)
  if (!solanaPay.url.startsWith(`solana:${SOLANA_PAY_TEST_RECIPIENT}?`) || solanaPay.amount !== '25') throw new Error(`expected Solana Pay transfer URL with USD minor-unit conversion, got ${JSON.stringify(solanaPay)}`)
  if (!solanaPay.url.includes(`reference=${encodeURIComponent(solanaPay.reference)}`) || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(solanaPay.reference)) throw new Error(`expected base58 Solana Pay reference in URL, got ${JSON.stringify(solanaPay)}`)
  const repeated = await createSolanaPaySession(env)
  if (repeated.session.id !== session.id || repeated.session.solana_pay.reference !== solanaPay.reference) throw new Error(`expected idempotent Solana Pay reference reuse, got ${JSON.stringify({ created, repeated })}`)
  const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
  if (!traceTypes.includes('agenticgraph.commerce.solana_pay_request')) throw new Error(`expected Solana Pay request trace event, got ${JSON.stringify(traceTypes)}`)
}

export async function testAgenticCommerceSolanaPaySettleRouteValidatesRpcAndWritesProof() {
  const env = createCommerceEnv()
  delete env.OPENBOX_API_URL
  const created = await createSolanaPaySession(env, 'solana-pay-settle-idempotency-1')
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target !== 'https://solana.example/rpc') throw new Error(`unexpected fetch target ${target}`)
      const requestBody = JSON.parse(String(init?.body || '{}')) as { method?: string; params?: unknown[] }
      if (requestBody.method !== 'getTransaction' || requestBody.params?.[0] !== SOLANA_PAY_TEST_SIGNATURE) throw new Error(`expected Solana getTransaction lookup, got ${JSON.stringify(requestBody)}`)
      return new Response(JSON.stringify(buildSolanaPayRpcTransaction(created.session.solana_pay)), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_SOLANA_PAY_SETTLE_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: created.session.id, signature: SOLANA_PAY_TEST_SIGNATURE }),
      }),
      env as never,
    )
    if (!response.ok) throw new Error(`expected Solana Pay settle response ok, received ${response.status}: ${await response.text()}`)
    const body = await response.json() as { session?: { status?: string; payment_rail?: string }; proof?: { payment_rail?: string; canvas_node?: { payment_rail?: string; tx_hash?: string } } }
    if (body.session?.status !== 'complete' || body.session.payment_rail !== AGENTIC_COMMERCE_SOLANA_PAY_KEY) throw new Error(`expected completed Solana Pay session, got ${JSON.stringify(body)}`)
    if (body.proof?.payment_rail !== AGENTIC_COMMERCE_SOLANA_PAY_KEY || body.proof.canvas_node?.tx_hash !== SOLANA_PAY_TEST_SIGNATURE) throw new Error(`expected Solana Pay proof node with signature, got ${JSON.stringify(body.proof)}`)
    const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.solana_pay_confirm') || !traceTypes.includes('agenticgraph.commerce.settle')) throw new Error(`expected Solana Pay confirm and settle trace events, got ${JSON.stringify(traceTypes)}`)
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceSolanaPayRejectsGenericWebhookSettlement() {
  const env = createCommerceEnv()
  const created = await createSolanaPaySession(env, 'solana-pay-webhook-bypass-idempotency-1')
  const response = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.commerceWebhook}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: created.session.id, tx_hash: SOLANA_PAY_TEST_SIGNATURE }),
    }),
    env as never,
  )
  if (response.status !== 409) throw new Error(`expected generic webhook to reject Solana Pay settlement, received ${response.status}: ${await response.text()}`)
  const sessionRow = env.DB.agenticCommerceSessions.get(created.session.id)
  if (sessionRow?.status !== 'pending_onchain' || env.DB.agenticCommerceProofs.size !== 0) throw new Error(`expected rejected generic webhook to leave Solana Pay pending without proof, got ${JSON.stringify(sessionRow)}`)
}
