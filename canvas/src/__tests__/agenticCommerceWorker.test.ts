import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import paymentWorkerModule from '../../../cloudflare/workers/agenticgraph-payment/index.ts'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import {
  AGENTIC_COMMERCE_ROUTE_PATHS,
  AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY,
} from 'grph-shared/payments/agenticCommerceSsot'
import {
  STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID,
  STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL,
  STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY,
  STRIPE_CHECKOUT_METADATA_WORKSPACE_ID,
  STRIPE_CHECKOUT_SESSION_ID_TOKEN,
  STRIPE_PAYMENT_ROUTE_PATHS,
  STRIPE_PAYMENT_WEBHOOK_API_VERSION,
} from 'grph-shared/payments/stripePaymentSsot'

const worker = (
  typeof (paymentWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? paymentWorkerModule
    : (paymentWorkerModule as unknown as { default: typeof paymentWorkerModule }).default
) as typeof paymentWorkerModule

const createCommerceEnv = () => {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & Record<string, unknown>
  env.SELLER_ID = 'seller-neutral'
  env.CHECKOUT_BASE_URL = 'https://commerce.example'
  env.WEB3_ENABLED = 'true'
  env.OPENBOX_API_URL = 'https://openbox.example/risk'
  env.OPENBOX_API_KEY = 'openbox_test_key'
  return env
}

const readPaymentRequiredHeader = (response: Response): { x402Version?: number; accepts?: Array<Record<string, unknown>> } | null => {
  const headerValue = response.headers.get('payment-required')
  if (!headerValue) return null
  try {
    return JSON.parse(Buffer.from(headerValue, 'base64').toString('utf8')) as { x402Version?: number; accepts?: Array<Record<string, unknown>> }
  } catch {
    return null
  }
}

const withX402FacilitatorSupportedKinds = async (callback: () => Promise<void>) => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = typeof url === 'string' || url instanceof URL ? String(url) : url.url
      if (target === 'https://x402.org/facilitator/supported') {
        return new Response(JSON.stringify({
          kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:84532' }],
          extensions: [],
          signers: { 'eip155:*': ['0xd407e409E34E0b9afb99EcCeb609bDbcD5e7f1bf'] },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return originalFetch(url as never, init)
    }) as typeof fetch
    await callback()
  } finally {
    globalThis.fetch = originalFetch
  }
}

const createCheckoutSession = async (env: ReturnType<typeof createCommerceEnv>, overrides: Record<string, unknown> = {}) => {
  const response = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': String(overrides.idempotencyKey || 'checkout-idempotency-1'),
      },
      body: JSON.stringify({
        amount_total: 2500,
        currency: 'usd',
        buyer: { email: 'buyer@example.com' },
        ...overrides,
      }),
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected session create ok, received ${response.status}: ${await response.text()}`)
  return await response.json() as { session: { id: string; status: string; idempotency_key: string; deposit_address?: string | null } }
}

const createHostedStripeAcpSessionForTest = async (
  env: ReturnType<typeof createCommerceEnv>,
  args: {
    idempotencyKey: string
    workspaceId: string
    amountTotal?: number
    currency?: string
  },
) => {
  const response = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
      method: 'POST',
      headers: {
        origin: 'https://commerce.example',
        'content-type': 'application/json',
        'idempotency-key': args.idempotencyKey,
      },
      body: JSON.stringify({
        amount_total: args.amountTotal ?? 2500,
        currency: args.currency ?? 'usd',
        buyer: { email: 'buyer@example.com' },
        [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
          success_url: 'https://commerce.example/agenticgraph?stripeCheckout=success',
          cancel_url: 'https://commerce.example/agenticgraph?stripeCheckout=cancel',
          workspace_id: args.workspaceId,
        },
      }),
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected hosted Stripe ACP session response ok, received ${response.status}: ${await response.text()}`)
  const body = await response.json() as { session?: { id?: string; stripe_checkout?: { id?: string } } }
  const sessionId = String(body.session?.id || '')
  if (!sessionId) throw new Error(`expected hosted Stripe ACP session id, got ${JSON.stringify(body)}`)
  return { body, sessionId }
}

export async function testAgenticCommerceCheckoutSessionCanCreateHostedStripeCheckoutHandoff() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      const params = new URLSearchParams(String(init?.body || ''))
      const acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
      return new Response(JSON.stringify({
        id: 'cs_agentic_hosted_1',
        url: 'https://checkout.stripe.com/c/pay/agentic_hosted_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 2500,
        currency: 'usd',
        client_reference_id: acpSessionId,
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
          [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic',
        },
        created: 1_777_500_000,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
        method: 'POST',
        headers: {
          origin: 'https://commerce.example',
          'content-type': 'application/json',
          'idempotency-key': 'hosted-stripe-idempotency-1',
        },
        body: JSON.stringify({
          amount_total: 2500,
          currency: 'usd',
          buyer: { email: 'buyer@example.com' },
          [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
            success_url: 'https://commerce.example/agenticgraph?stripeCheckout=success',
            cancel_url: 'https://commerce.example/agenticgraph?stripeCheckout=cancel',
            workspace_id: 'workspace-agentic',
          },
        }),
      }),
      env as never,
    )
    if (!response.ok) throw new Error(`expected hosted Stripe ACP session response ok, received ${response.status}: ${await response.text()}`)
    const body = await response.json() as {
      session?: {
        id?: string
        status?: string
        stripe_checkout?: { id?: string; url?: string; payment_status?: string }
      }
    }
    const session = body.session
    const sessionId = String(session?.id || '')
    if (!session || session.status !== 'open' || session.stripe_checkout?.id !== 'cs_agentic_hosted_1') {
      throw new Error(`expected ACP session response with hosted Stripe checkout, got ${JSON.stringify(body)}`)
    }
    const stripeCheckout = session.stripe_checkout
    if (!String(stripeCheckout.url || '').includes('checkout.stripe.com')) {
      throw new Error(`expected hosted Checkout url, got ${JSON.stringify(stripeCheckout)}`)
    }
    const params = new URLSearchParams(String(fetchCalls[0]?.init?.body || ''))
    if (params.get('client_reference_id') !== sessionId) {
      throw new Error(`expected ACP session id to own Stripe client_reference_id, got ${params.toString()}`)
    }
    const headers = new Headers(fetchCalls[0]?.init?.headers)
    if (headers.get('Idempotency-Key') !== sessionId) {
      throw new Error(`expected ACP session id to own Stripe Idempotency-Key, got ${headers.get('Idempotency-Key')}`)
    }
    if (params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) !== sessionId) {
      throw new Error(`expected Stripe Checkout metadata to include ACP session id, got ${params.toString()}`)
    }
    if (params.get(`metadata[${STRIPE_CHECKOUT_METADATA_WORKSPACE_ID}]`) !== 'workspace-agentic') {
      throw new Error(`expected Stripe Checkout metadata to include workspace id, got ${params.toString()}`)
    }
    if (
      params.get(`metadata[${STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL}]`) !== '2500'
      || params.get(`metadata[${STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY}]`) !== 'usd'
    ) {
      throw new Error(`expected Stripe Checkout metadata to include ACP expected total, got ${params.toString()}`)
    }
    if (!String(params.get('success_url') || '').includes(STRIPE_CHECKOUT_SESSION_ID_TOKEN)) {
      throw new Error(`expected hosted checkout success_url to preserve Stripe Session id, got ${params.toString()}`)
    }
    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_hosted_1')
    if (stripeRow?.workspace_id !== 'workspace-agentic' || !String(stripeRow.metadata_json || '').includes(sessionId)) {
      throw new Error(`expected hosted Stripe Checkout row with ACP metadata, got ${JSON.stringify(stripeRow)}`)
    }
    const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.stripe_checkout_session')) {
      throw new Error(`expected hosted Stripe checkout trace event, got ${JSON.stringify(traceTypes)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceHostedStripeCheckoutExpiresWhenAcpPersistenceFails() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  const originalPrepare = env.DB.prepare.bind(env.DB)
  env.DB.prepare = ((sql: string) => {
    if (String(sql || '').toLowerCase().includes('insert into agentic_commerce_sessions')) {
      const statement = {
        bind: () => statement,
        run: async () => {
          throw new Error('injected ACP session persistence failure')
        },
        all: async () => ({ results: [] }),
      }
      return statement
    }
    return originalPrepare(sql)
  }) as typeof env.DB.prepare
  const fetchTargets: string[] = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      fetchTargets.push(target)
      if (target === 'https://api.stripe.com/v1/checkout/sessions') {
        const params = new URLSearchParams(String(init?.body || ''))
        const acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
        return new Response(JSON.stringify({
          id: 'cs_agentic_persistence_failure_1',
          url: 'https://checkout.stripe.com/c/pay/agentic_persistence_failure_1',
          status: 'open',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: acpSessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-persistence-failure',
          },
          created: 1_777_500_000,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://api.stripe.com/v1/checkout/sessions/cs_agentic_persistence_failure_1/expire') {
        return new Response(JSON.stringify({
          id: 'cs_agentic_persistence_failure_1',
          status: 'expired',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          metadata: {
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-persistence-failure',
          },
          created: 1_777_500_000,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected Stripe fetch target ${target}`)
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
        method: 'POST',
        headers: {
          origin: 'https://commerce.example',
          'content-type': 'application/json',
          'idempotency-key': 'hosted-stripe-persistence-failure-1',
        },
        body: JSON.stringify({
          amount_total: 2500,
          currency: 'usd',
          buyer: { email: 'buyer@example.com' },
          [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
            success_url: 'https://commerce.example/agenticgraph?stripeCheckout=success',
            cancel_url: 'https://commerce.example/agenticgraph?stripeCheckout=cancel',
            workspace_id: 'workspace-agentic-persistence-failure',
          },
        }),
      }),
      env as never,
    )

    const body = await response.json() as { error?: string }
    if (response.status !== 500 || !String(body.error || '').includes('Failed to persist ACP checkout session')) {
      throw new Error(`expected ACP persistence failure to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
    if (!String(body.error || '').includes('hosted Stripe Checkout Session was expired')) {
      throw new Error(`expected ACP persistence failure to report Stripe expiry cleanup, got ${JSON.stringify(body)}`)
    }
    if (!fetchTargets.includes('https://api.stripe.com/v1/checkout/sessions/cs_agentic_persistence_failure_1/expire')) {
      throw new Error(`expected hosted Stripe Session to be expired after ACP persistence failure, got ${JSON.stringify(fetchTargets)}`)
    }
    if (env.DB.agenticCommerceSessions.size !== 0 || env.DB.agenticCommerceTraceEvents.size !== 0) {
      throw new Error('expected failed ACP persistence to avoid ACP session and trace rows')
    }
    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_persistence_failure_1')
    if (stripeRow?.status !== 'expired' || stripeRow.payment_status !== 'unpaid') {
      throw new Error(`expected Stripe audit row to refresh to expired after cleanup, got ${JSON.stringify(stripeRow)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceHostedStripeCheckoutExpiresMismatchedStripeTotal() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  const fetchTargets: string[] = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      fetchTargets.push(target)
      if (target === 'https://api.stripe.com/v1/checkout/sessions') {
        const params = new URLSearchParams(String(init?.body || ''))
        const acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
        return new Response(JSON.stringify({
          id: 'cs_agentic_mismatched_total_1',
          url: 'https://checkout.stripe.com/c/pay/agentic_mismatched_total_1',
          status: 'open',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 1200,
          currency: 'usd',
          client_reference_id: acpSessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-mismatch',
          },
          created: 1_777_500_000,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://api.stripe.com/v1/checkout/sessions/cs_agentic_mismatched_total_1/expire') {
        return new Response(JSON.stringify({
          id: 'cs_agentic_mismatched_total_1',
          status: 'expired',
          payment_status: 'unpaid',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected Stripe fetch target ${target}`)
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
        method: 'POST',
        headers: {
          origin: 'https://commerce.example',
          'content-type': 'application/json',
          'idempotency-key': 'hosted-stripe-mismatched-total-1',
        },
        body: JSON.stringify({
          amount_total: 2500,
          currency: 'usd',
          buyer: { email: 'buyer@example.com' },
          [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
            success_url: 'https://commerce.example/agenticgraph?stripeCheckout=success',
            cancel_url: 'https://commerce.example/agenticgraph?stripeCheckout=cancel',
            workspace_id: 'workspace-agentic-mismatch',
          },
        }),
      }),
      env as never,
    )

    const body = await response.json() as { error?: string }
    if (response.status !== 409 || !String(body.error || '').includes('amount/currency')) {
      throw new Error(`expected mismatched Stripe total to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
    if (!fetchTargets.includes('https://api.stripe.com/v1/checkout/sessions/cs_agentic_mismatched_total_1/expire')) {
      throw new Error(`expected mismatched Stripe Session to be expired, got ${JSON.stringify(fetchTargets)}`)
    }
    if (env.DB.agenticCommerceSessions.size !== 0 || env.DB.stripeCheckoutSessions.size !== 0) {
      throw new Error('expected mismatched hosted Stripe handoff to avoid writing ACP or Stripe checkout rows')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceHostedStripeCheckoutRejectsInlinePriceMismatchBeforeStripe() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_CURRENCY = 'usd'
  env.STRIPE_CHECKOUT_UNIT_AMOUNT = '1200'
  env.STRIPE_CHECKOUT_PRODUCT_NAME = 'AgenticGraph ACP Checkout'
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('inline ACP price mismatch must fail before Stripe API calls')
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
        method: 'POST',
        headers: {
          origin: 'https://commerce.example',
          'content-type': 'application/json',
          'idempotency-key': 'hosted-stripe-inline-mismatch-1',
        },
        body: JSON.stringify({
          amount_total: 2500,
          currency: 'usd',
          buyer: { email: 'buyer@example.com' },
          [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
            success_url: 'https://commerce.example/agenticgraph?stripeCheckout=success',
            cancel_url: 'https://commerce.example/agenticgraph?stripeCheckout=cancel',
            workspace_id: 'workspace-agentic-inline-mismatch',
          },
        }),
      }),
      env as never,
    )

    const body = await response.json() as { error?: string }
    if (response.status !== 422 || !String(body.error || '').includes('server-owned checkout price authority')) {
      throw new Error(`expected inline price mismatch to fail before Stripe, received ${response.status}: ${JSON.stringify(body)}`)
    }
    if (env.DB.agenticCommerceSessions.size !== 0 || env.DB.stripeCheckoutSessions.size !== 0) {
      throw new Error('expected inline mismatched hosted Stripe handoff to avoid writing ACP or Stripe checkout rows')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceHostedStripeCheckoutRejectsCallerOwnedReturnUrls() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('caller-owned ACP Stripe return URLs must fail before Stripe API calls')
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'application/json',
          'idempotency-key': 'hosted-stripe-attacker-origin-1',
        },
        body: JSON.stringify({
          amount_total: 2500,
          currency: 'usd',
          buyer: { email: 'buyer@example.com' },
          [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
            success_url: 'https://attacker.example/agenticgraph?stripeCheckout=success',
            cancel_url: 'https://attacker.example/agenticgraph?stripeCheckout=cancel',
            workspace_id: 'workspace-agentic',
          },
        }),
      }),
      env as never,
    )

    const body = await response.json() as { error?: string }
    if (response.status !== 400 || !String(body.error || '').includes('server return origin')) {
      throw new Error(`expected ACP caller-owned return URLs to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
    if (env.DB.agenticCommerceSessions.size !== 0) {
      throw new Error('expected rejected hosted Stripe ACP handoff to avoid writing an ACP session')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceHostedStripeCheckoutRejectsDelegateTokenCompletion() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  env.STRIPE_DELEGATE_PAYMENT_URL = 'https://stripe.example/delegate'
  const fetchTargets: string[] = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      fetchTargets.push(target)
      if (target !== 'https://api.stripe.com/v1/checkout/sessions') {
        throw new Error(`hosted Stripe completion must not call delegate endpoint, got ${target}`)
      }
      const params = new URLSearchParams(String(init?.body || ''))
      const acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
      return new Response(JSON.stringify({
        id: 'cs_agentic_hosted_no_delegate_1',
        url: 'https://checkout.stripe.com/c/pay/agentic_hosted_no_delegate_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 2500,
        currency: 'usd',
        client_reference_id: acpSessionId,
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
          [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-no-delegate',
        },
        created: 1_777_500_440,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const { sessionId } = await createHostedStripeAcpSessionForTest(env, {
      idempotencyKey: 'hosted-no-delegate-idempotency-1',
      workspaceId: 'workspace-agentic-no-delegate',
    })
    const completeResponse = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vault_token: 'vlt_must_not_bypass_hosted_checkout' }),
      }),
      env as never,
    )
    if (completeResponse.status !== 409) {
      throw new Error(`expected hosted Stripe ACP session to reject delegate completion, received ${completeResponse.status}: ${await completeResponse.text()}`)
    }
    const body = await completeResponse.json() as { error?: string }
    if (!String(body.error || '').includes('Hosted Stripe')) {
      throw new Error(`expected hosted Stripe ownership error, got ${JSON.stringify(body)}`)
    }
    const sessionRow = env.DB.agenticCommerceSessions.get(sessionId)
    if (sessionRow?.status !== 'open' || env.DB.agenticCommerceProofs.size !== 0) {
      throw new Error(`expected hosted Stripe ACP session to stay open without proof, got ${JSON.stringify(sessionRow)}`)
    }
    if (fetchTargets.some(target => target === 'https://stripe.example/delegate')) {
      throw new Error(`expected delegate endpoint not to be called, got ${JSON.stringify(fetchTargets)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceTerminalFiatSessionsRejectDelegateCompletion() {
  const env = createCommerceEnv()
  const cancelled = await createCheckoutSession(env, { idempotencyKey: 'terminal-cancelled-idempotency-1' })
  const cancelResponse = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${cancelled.session.id}/cancel`, {
      method: 'POST',
    }),
    env as never,
  )
  if (!cancelResponse.ok) throw new Error(`expected cancel response ok, received ${cancelResponse.status}: ${await cancelResponse.text()}`)
  const cancelledComplete = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${cancelled.session.id}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vault_token: 'vlt_after_cancel' }),
    }),
    env as never,
  )
  if (cancelledComplete.status !== 409) {
    throw new Error(`expected cancelled ACP session to reject completion, received ${cancelledComplete.status}: ${await cancelledComplete.text()}`)
  }

  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_DELEGATE_PAYMENT_URL = 'https://stripe.example/delegate'
  const originalFetch = globalThis.fetch
  let delegateCalls = 0
  try {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target !== 'https://stripe.example/delegate') throw new Error(`unexpected fetch target ${target}`)
      delegateCalls += 1
      return new Response(JSON.stringify({ error: 'declined' }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const failed = await createCheckoutSession(env, { idempotencyKey: 'terminal-failed-idempotency-1' })
    const failedAttempt = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${failed.session.id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vault_token: 'vlt_declined' }),
      }),
      env as never,
    )
    if (failedAttempt.status !== 422) {
      throw new Error(`expected delegate payment failure to mark session failed, received ${failedAttempt.status}: ${await failedAttempt.text()}`)
    }
    const failedCancel = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${failed.session.id}/cancel`, {
        method: 'POST',
      }),
      env as never,
    )
    if (failedCancel.status !== 409) {
      throw new Error(`expected payment_failed ACP session to reject cancellation, received ${failedCancel.status}: ${await failedCancel.text()}`)
    }
    const retry = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${failed.session.id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vault_token: 'vlt_retry_after_failed_terminal' }),
      }),
      env as never,
    )
    if (retry.status !== 409) {
      throw new Error(`expected payment_failed ACP session to reject completion retry, received ${retry.status}: ${await retry.text()}`)
    }
    if (delegateCalls !== 1) {
      throw new Error(`expected terminal retry to avoid delegate payment call, got ${delegateCalls}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }

  if (env.DB.agenticCommerceProofs.size !== 0) {
    throw new Error(`expected terminal rejected completions to avoid proof writes, got ${JSON.stringify(Array.from(env.DB.agenticCommerceProofs.values()))}`)
  }
}

export async function testAgenticCommerceStripePaidWebhookCannotSettleCancelledAcpSession() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  let acpSessionId = ''
  let openboxCalls = 0
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target === 'https://openbox.example/risk') {
        openboxCalls += 1
        return new Response(JSON.stringify({ score: 0.11, action: 'authorized' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (target !== 'https://api.stripe.com/v1/checkout/sessions') {
        throw new Error(`unexpected fetch target ${target}`)
      }
      const params = new URLSearchParams(String(init?.body || ''))
      acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
      return new Response(JSON.stringify({
        id: 'cs_agentic_cancelled_late_paid_1',
        url: 'https://checkout.stripe.com/c/pay/agentic_cancelled_late_paid_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 2500,
        currency: 'usd',
        client_reference_id: acpSessionId,
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
          [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-cancelled-late-paid',
        },
        created: 1_777_500_450,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const { sessionId } = await createHostedStripeAcpSessionForTest(env, {
      idempotencyKey: 'cancelled-late-paid-idempotency-1',
      workspaceId: 'workspace-agentic-cancelled-late-paid',
    })
    const cancelResponse = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${sessionId}/cancel`, {
        method: 'POST',
      }),
      env as never,
    )
    if (!cancelResponse.ok) throw new Error(`expected cancel response ok, received ${cancelResponse.status}: ${await cancelResponse.text()}`)

    const payload = JSON.stringify({
      id: 'evt_agentic_cancelled_late_paid_1',
      api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_agentic_cancelled_late_paid_1',
          status: 'complete',
          payment_status: 'paid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: sessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: sessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-cancelled-late-paid',
          },
          created: 1_777_500_450,
        },
      },
    })
    const webhookResponse = await worker.fetch(
      new Request('https://commerce.example/api/payments/stripe/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
        },
        body: payload,
      }),
      env as never,
    )
    if (!webhookResponse.ok) throw new Error(`expected late paid Stripe webhook to be acknowledged, received ${webhookResponse.status}: ${await webhookResponse.text()}`)

    const sessionRow = env.DB.agenticCommerceSessions.get(sessionId)
    if (sessionRow?.status !== 'cancelled' || sessionRow.completed_at) {
      throw new Error(`expected late paid Stripe webhook to leave cancelled ACP session terminal, got ${JSON.stringify(sessionRow)}`)
    }
    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_cancelled_late_paid_1')
    if (stripeRow?.payment_status !== 'paid' || !stripeRow.completed_at) {
      throw new Error(`expected Stripe row to store late paid status for audit, got ${JSON.stringify(stripeRow)}`)
    }
    if (env.DB.agenticCommerceProofs.size !== 0 || openboxCalls !== 0) {
      throw new Error(`expected late paid terminal webhook to avoid proof and OpenBOX, got proofs=${env.DB.agenticCommerceProofs.size} openboxCalls=${openboxCalls}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceAcpConfigExposesNeutralRoutes() {
  const env = createCommerceEnv()
  const response = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig}`),
    env as never,
  )
  if (!response.ok) throw new Error(`expected acp config response ok, received ${response.status}`)
  const body = await response.json() as {
    api_version?: string
    seller?: { id?: string }
    endpoints?: { create_session?: string; complete_session?: string }
    payment_methods?: string[]
    capabilities?: { web3?: boolean; risk_signals?: boolean }
    extensions?: string[]
  }
  if (body.api_version !== '2026-01-30' || body.seller?.id !== 'seller-neutral') {
    throw new Error(`expected configured ACP seller and version, got ${JSON.stringify(body)}`)
  }
  if (body.endpoints?.create_session !== 'https://commerce.example/checkout/sessions') {
    throw new Error(`expected neutral checkout endpoint, got ${JSON.stringify(body.endpoints)}`)
  }
  if (!body.payment_methods?.includes('stripe_delegate_token') || !body.payment_methods.includes('erc20')) {
    throw new Error(`expected fiat and web3 payment methods, got ${JSON.stringify(body.payment_methods)}`)
  }
  if (body.capabilities?.web3 !== true || body.capabilities?.risk_signals !== true || !body.extensions?.includes('x-web3')) {
    throw new Error(`expected ACP commerce capabilities, got ${JSON.stringify(body)}`)
  }
}

export async function testAgenticCommerceX402RouteReturnsPaymentRequired() {
  await withX402FacilitatorSupportedKinds(async () => {
    const env = createCommerceEnv()
    for (const path of [AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired, AGENTIC_COMMERCE_ROUTE_PATHS.x402ApiRoot]) {
      const response = await worker.fetch(
        new Request(`https://commerce.example${path}`),
        env as never,
      )
      if (response.status !== 402) throw new Error(`expected ${path} to return HTTP 402, received ${response.status}`)
      const headerPayload = readPaymentRequiredHeader(response)
      if (headerPayload?.x402Version !== 2) throw new Error(`expected x402 v2 payment-required header, got ${JSON.stringify(headerPayload)}`)
      if (!headerPayload.accepts?.some(entry => (
        entry.scheme === 'exact'
        && /^0x[0-9a-fA-F]{40}$/.test(String(entry.payTo || ''))
        && entry.network === 'eip155:84532'
        && String(entry.asset || '').startsWith('0x')
      ))) {
        throw new Error(`expected middleware payment requirements with payTo/network/asset for ${path}, got ${JSON.stringify(headerPayload)}`)
      }
    }
  })
}

export async function testAgenticCommerceCheckoutLifecyclePersistsProofAndTrace() {
  const env = createCommerceEnv()
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== 'https://openbox.example/risk') throw new Error(`unexpected fetch target ${String(url)}`)
      const headers = new Headers(init?.headers)
      if (headers.get('authorization') !== 'Bearer openbox_test_key') throw new Error('expected OpenBOX bearer token')
      const requestBody = JSON.parse(String(init?.body || '{}')) as { session_id?: string; action?: string }
      return new Response(JSON.stringify({
        score: 0.18,
        action: 'authorized',
        session_id: requestBody.session_id,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const created = await createCheckoutSession(env)
    if (created.session.status !== 'open' || created.session.idempotency_key !== 'checkout-idempotency-1') {
      throw new Error(`expected open idempotent session, got ${JSON.stringify(created)}`)
    }
    const storedBefore = env.DB.agenticCommerceSessions.get(created.session.id)
    if (!storedBefore || String(storedBefore.request_json).includes('vault_token')) {
      throw new Error(`expected create payload to be stored without payment token, got ${JSON.stringify(storedBefore)}`)
    }

    const completeResponse = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${created.session.id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vault_token: 'vlt_never_persist' }),
      }),
      env as never,
    )
    if (!completeResponse.ok) throw new Error(`expected complete response ok, received ${completeResponse.status}: ${await completeResponse.text()}`)
    const completed = await completeResponse.json() as {
      session?: { status?: string; risk_signals?: Array<{ source?: string; score?: number; action?: string }> }
      proof?: { session_id?: string; openbox_risk?: { score?: number; action?: string; session_id?: string } }
    }
    if (completed.session?.status !== 'complete' || completed.proof?.session_id !== created.session.id) {
      throw new Error(`expected completed session and proof, got ${JSON.stringify(completed)}`)
    }
    if (completed.proof?.openbox_risk?.score !== 0.18 || completed.proof.openbox_risk.action !== 'authorized') {
      throw new Error(`expected OpenBOX risk proof block, got ${JSON.stringify(completed.proof)}`)
    }
    const storedAfter = env.DB.agenticCommerceSessions.get(created.session.id)
    if (String(storedAfter?.request_json || '').includes('vlt_never_persist') || String(storedAfter?.response_json || '').includes('vlt_never_persist')) {
      throw new Error('expected delegate payment token to avoid D1 persistence')
    }
    const proofRows = Array.from(env.DB.agenticCommerceProofs.values())
    if (proofRows.length !== 1 || !String(proofRows[0].proof_json || '').includes('openbox_risk')) {
      throw new Error(`expected one commerce proof with OpenBOX risk, got ${JSON.stringify(proofRows)}`)
    }
    const traceRows = Array.from(env.DB.agenticCommerceTraceEvents.values())
    const traceTypes = traceRows.map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.delegate_payment') || !traceTypes.includes('agenticgraph.commerce.settle')) {
      throw new Error(`expected settle trace event, got ${JSON.stringify(traceRows)}`)
    }
    const proofArtifactResponse = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.commerceProofArtifact}?session_id=${created.session.id}`),
      env as never,
    )
    if (!proofArtifactResponse.ok) throw new Error(`expected harness-proof artifact ok, received ${proofArtifactResponse.status}`)
    const proofArtifact = await proofArtifactResponse.json() as { commerce?: Array<{ session_id?: string; openbox_risk?: unknown }> }
    if (proofArtifact.commerce?.[0]?.session_id !== created.session.id || !proofArtifact.commerce[0].openbox_risk) {
      throw new Error(`expected harness-proof commerce entry with OpenBOX risk, got ${JSON.stringify(proofArtifact)}`)
    }
    const traceArtifactResponse = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.commerceTraceArtifact}?session_id=${created.session.id}`),
      env as never,
    )
    if (!traceArtifactResponse.ok) throw new Error(`expected trace artifact ok, received ${traceArtifactResponse.status}`)
    const traceArtifact = await traceArtifactResponse.text()
    if (!traceArtifact.includes('agenticgraph.commerce.settle') || !traceArtifact.includes(created.session.id)) {
      throw new Error(`expected trace.jsonl settle entry, got ${traceArtifact}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceWeb3CheckoutReturnsDeterministicDepositAddress() {
  const env = createCommerceEnv()
  const created = await createCheckoutSession(env, {
    idempotencyKey: 'web3-idempotency-1',
    currency: 'usdc',
    'x-web3': {
      payment_method: 'erc20',
      payer_did: 'did:debox:0xabc',
    },
  })
  if (created.session.status !== 'pending_onchain') {
    throw new Error(`expected pending_onchain web3 session, got ${JSON.stringify(created)}`)
  }
  if (!/^0x[0-9a-f]{40}$/i.test(String(created.session.deposit_address || ''))) {
    throw new Error(`expected deterministic L2 deposit address, got ${JSON.stringify(created.session)}`)
  }
  const repeated = await createCheckoutSession(env, {
    idempotencyKey: 'web3-idempotency-1',
    currency: 'usdc',
    'x-web3': {
      payment_method: 'erc20',
      payer_did: 'did:debox:0xabc',
    },
  })
  if (repeated.session.id !== created.session.id || repeated.session.deposit_address !== created.session.deposit_address) {
    throw new Error(`expected idempotent web3 session reuse, got ${JSON.stringify({ created, repeated })}`)
  }
}

export async function testAgenticCommerceWeb3SettlementWritesProofNode() {
  const env = createCommerceEnv()
  delete env.OPENBOX_API_URL
  const created = await createCheckoutSession(env, {
    idempotencyKey: 'web3-settle-idempotency-1',
    currency: 'usdc',
    'x-web3': {
      payment_method: 'erc20',
      payer_did: 'did:debox:0xdef',
    },
  })
  const completeResponse = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/${created.session.id}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tx_hash: '0xabc123',
        attestation_uid: 'eas_attestation_123',
      }),
    }),
    env as never,
  )
  if (!completeResponse.ok) throw new Error(`expected web3 complete response ok, received ${completeResponse.status}: ${await completeResponse.text()}`)
  const body = await completeResponse.json() as {
    session?: { status?: string }
    proof?: { attestation_uid?: string; canvas_node?: { type?: string; tx_hash?: string; attestation_uid?: string } }
  }
  if (body.session?.status !== 'complete' || body.proof?.attestation_uid !== 'eas_attestation_123') {
    throw new Error(`expected web3 session to complete with attestation UID, got ${JSON.stringify(body)}`)
  }
  if (
    body.proof?.canvas_node?.type !== '@node:proof'
    || body.proof.canvas_node.tx_hash !== '0xabc123'
    || body.proof.canvas_node.attestation_uid !== 'eas_attestation_123'
  ) {
    throw new Error(`expected @node:proof canvas payload, got ${JSON.stringify(body.proof)}`)
  }
  const proofRows = Array.from(env.DB.agenticCommerceProofs.values())
  if (proofRows.length !== 1 || !String(proofRows[0].proof_json || '').includes('@node:proof')) {
    throw new Error(`expected stored proof node payload, got ${JSON.stringify(proofRows)}`)
  }
}

export async function testAgenticCommerceStripeWebhookSettlesAcpSession() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      openbox_risk: { score: 0.31, action: 'manual_review' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
    const created = await createCheckoutSession(env, { idempotencyKey: 'webhook-idempotency-1' })
    const payload = JSON.stringify({
      id: 'evt_agentic_commerce_1',
      api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_agentic_commerce_1',
          status: 'complete',
          payment_status: 'paid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: created.session.id,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: created.session.id,
          },
          created: 1_777_500_200,
        },
      },
    })
    const header = await buildStripeSignatureHeader(payload, 'whsec_')
    const response = await worker.fetch(
      new Request('https://commerce.example/api/payments/stripe/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': header,
        },
        body: payload,
      }),
      env as never,
    )
    if (!response.ok) throw new Error(`expected Stripe webhook to settle ACP session, received ${response.status}: ${await response.text()}`)
    const sessionRow = env.DB.agenticCommerceSessions.get(created.session.id)
    if (sessionRow?.status !== 'complete' || !String(sessionRow.risk_signals_json || '').includes('manual_review')) {
      throw new Error(`expected completed ACP session from Stripe webhook, got ${JSON.stringify(sessionRow)}`)
    }
    const proofRows = Array.from(env.DB.agenticCommerceProofs.values())
    if (proofRows.length !== 1 || !String(proofRows[0].proof_json || '').includes('openbox_risk')) {
      throw new Error(`expected commerce proof from Stripe webhook, got ${JSON.stringify(proofRows)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceStripeWebhookDuplicateEventSkipsSettlement() {
  const env = createCommerceEnv()
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  let openboxCalls = 0
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target === 'https://openbox.example/risk') {
        openboxCalls += 1
        return new Response(JSON.stringify({ score: 0.05, action: 'authorized' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch target ${target}`)
    }) as typeof fetch

    const created = await createCheckoutSession(env, { idempotencyKey: 'webhook-duplicate-idempotency-1' })
    const buildPayload = (paymentStatus: 'unpaid' | 'paid') => JSON.stringify({
      id: 'evt_agentic_duplicate_1',
      api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_agentic_duplicate_1',
          status: 'complete',
          payment_status: paymentStatus,
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: created.session.id,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: created.session.id,
          },
          created: 1_777_500_205,
        },
      },
    })

    const firstPayload = buildPayload('unpaid')
    const firstResponse = await worker.fetch(
      new Request('https://commerce.example/api/payments/stripe/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': await buildStripeSignatureHeader(firstPayload, 'whsec_'),
        },
        body: firstPayload,
      }),
      env as never,
    )
    if (!firstResponse.ok) throw new Error(`expected first Stripe webhook to be acknowledged, received ${firstResponse.status}: ${await firstResponse.text()}`)

    const replayResponse = await worker.fetch(
      new Request('https://commerce.example/api/payments/stripe/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': await buildStripeSignatureHeader(firstPayload, 'whsec_'),
        },
        body: firstPayload,
      }),
      env as never,
    )
    if (!replayResponse.ok) throw new Error(`expected duplicate Stripe webhook to be acknowledged, received ${replayResponse.status}: ${await replayResponse.text()}`)
    const replayBody = await replayResponse.json() as { duplicate?: boolean }
    if (replayBody.duplicate !== true) {
      throw new Error(`expected duplicate webhook response to flag duplicate delivery, got ${JSON.stringify(replayBody)}`)
    }

    const sessionRow = env.DB.agenticCommerceSessions.get(created.session.id)
    if (sessionRow?.status !== 'open' || sessionRow.completed_at) {
      throw new Error(`expected duplicate webhook replay to leave ACP session open, got ${JSON.stringify(sessionRow)}`)
    }
    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_duplicate_1')
    if (stripeRow?.payment_status !== 'unpaid' || stripeRow.completed_at) {
      throw new Error(`expected duplicate webhook replay not to rewrite Stripe audit row, got ${JSON.stringify(stripeRow)}`)
    }
    if (env.DB.agenticCommerceProofs.size !== 0 || openboxCalls !== 0) {
      throw new Error(`expected duplicate webhook replay to avoid proof and OpenBOX, got proofs=${env.DB.agenticCommerceProofs.size} openboxCalls=${openboxCalls}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceStripeStatusRefreshSettlesAcpSessionBeforeWebhook() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  let acpSessionId = ''
  const fetchTargets: string[] = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      fetchTargets.push(target)
      if (target === 'https://api.stripe.com/v1/checkout/sessions') {
        const params = new URLSearchParams(String(init?.body || ''))
        acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
        return new Response(JSON.stringify({
          id: 'cs_agentic_status_return_1',
          url: 'https://checkout.stripe.com/c/pay/agentic_status_return_1',
          status: 'open',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: acpSessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-return',
          },
          created: 1_777_500_310,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://api.stripe.com/v1/checkout/sessions/cs_agentic_status_return_1') {
        return new Response(JSON.stringify({
          id: 'cs_agentic_status_return_1',
          status: 'complete',
          payment_status: 'paid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          customer: 'cus_agentic_status_return',
          client_reference_id: acpSessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-return',
          },
          created: 1_777_500_310,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://openbox.example/risk') {
        return new Response(JSON.stringify({ score: 0.27, action: 'authorized' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch target ${target}`)
    }) as typeof fetch

    const createResponse = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
        method: 'POST',
        headers: {
          origin: 'https://commerce.example',
          'content-type': 'application/json',
          'idempotency-key': 'status-refresh-idempotency-1',
        },
        body: JSON.stringify({
          amount_total: 2500,
          currency: 'usd',
          buyer: { email: 'buyer@example.com' },
          [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
            success_url: 'https://commerce.example/agenticgraph?stripeCheckout=success',
            cancel_url: 'https://commerce.example/agenticgraph?stripeCheckout=cancel',
            workspace_id: 'workspace-agentic-return',
          },
        }),
      }),
      env as never,
    )
    if (!createResponse.ok) throw new Error(`expected hosted Stripe ACP session response ok, received ${createResponse.status}: ${await createResponse.text()}`)
    const createdBody = await createResponse.json() as { session?: { id?: string; stripe_checkout?: { id?: string } } }
    const sessionId = String(createdBody.session?.id || '')
    if (!sessionId || acpSessionId !== sessionId || createdBody.session?.stripe_checkout?.id !== 'cs_agentic_status_return_1') {
      throw new Error(`expected ACP session id to own hosted Stripe checkout, got ${JSON.stringify(createdBody)}`)
    }

    const statusResponse = await worker.fetch(
      new Request(`https://commerce.example${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?session_id=cs_agentic_status_return_1`),
      env as never,
    )
    if (!statusResponse.ok) throw new Error(`expected Stripe status refresh to settle ACP session, received ${statusResponse.status}: ${await statusResponse.text()}`)
    const statusBody = await statusResponse.json() as { liveVerified?: boolean; session?: Record<string, unknown> & { paymentStatus?: string } }
    if (statusBody.liveVerified !== true || statusBody.session?.paymentStatus !== 'paid') {
      throw new Error(`expected live Stripe retrieve to return paid ACP checkout status, got ${JSON.stringify(statusBody)}`)
    }
    if ('workspaceId' in (statusBody.session || {}) || 'metadata' in (statusBody.session || {})) {
      throw new Error(`expected public Stripe status payload to omit ACP workspace metadata, got ${JSON.stringify(statusBody)}`)
    }

    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_status_return_1')
    if (stripeRow?.payment_status !== 'paid' || !stripeRow.completed_at || stripeRow.workspace_id !== 'workspace-agentic-return') {
      throw new Error(`expected Stripe checkout row to refresh to paid, got ${JSON.stringify(stripeRow)}`)
    }
    const sessionRow = env.DB.agenticCommerceSessions.get(sessionId)
    if (sessionRow?.status !== 'complete' || !String(sessionRow.risk_signals_json || '').includes('authorized')) {
      throw new Error(`expected paid Stripe status refresh to settle ACP session, got ${JSON.stringify(sessionRow)}`)
    }
    const proofRows = Array.from(env.DB.agenticCommerceProofs.values())
    if (proofRows.length !== 1 || !String(proofRows[0].proof_json || '').includes('openbox_risk')) {
      throw new Error(`expected ACP proof from Stripe status refresh, got ${JSON.stringify(proofRows)}`)
    }
    if (!fetchTargets.includes('https://api.stripe.com/v1/checkout/sessions/cs_agentic_status_return_1')) {
      throw new Error(`expected status route to retrieve Checkout Session from Stripe, got ${JSON.stringify(fetchTargets)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceStripeExpiredStatusRefreshCancelsAcpSessionBeforeWebhook() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  let acpSessionId = ''
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target === 'https://api.stripe.com/v1/checkout/sessions') {
        const params = new URLSearchParams(String(init?.body || ''))
        acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
        return new Response(JSON.stringify({
          id: 'cs_agentic_status_expired_1',
          url: 'https://checkout.stripe.com/c/pay/agentic_status_expired_1',
          status: 'open',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: acpSessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-expired-return',
          },
          created: 1_777_500_420,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://api.stripe.com/v1/checkout/sessions/cs_agentic_status_expired_1') {
        return new Response(JSON.stringify({
          id: 'cs_agentic_status_expired_1',
          status: 'expired',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: acpSessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-expired-return',
          },
          created: 1_777_500_420,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected fetch target ${target}`)
    }) as typeof fetch

    const { body, sessionId } = await createHostedStripeAcpSessionForTest(env, {
      idempotencyKey: 'status-expired-idempotency-1',
      workspaceId: 'workspace-agentic-expired-return',
    })
    if (acpSessionId !== sessionId || body.session?.stripe_checkout?.id !== 'cs_agentic_status_expired_1') {
      throw new Error(`expected ACP session id to own hosted Stripe checkout, got ${JSON.stringify(body)}`)
    }

    const statusResponse = await worker.fetch(
      new Request(`https://commerce.example${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?session_id=cs_agentic_status_expired_1`),
      env as never,
    )
    if (!statusResponse.ok) throw new Error(`expected expired Stripe status refresh to be acknowledged, received ${statusResponse.status}: ${await statusResponse.text()}`)
    const statusBody = await statusResponse.json() as { liveVerified?: boolean; session?: { status?: string; paymentStatus?: string } }
    if (statusBody.liveVerified !== true || statusBody.session?.status !== 'expired' || statusBody.session.paymentStatus !== 'unpaid') {
      throw new Error(`expected live Stripe retrieve to return expired unpaid status, got ${JSON.stringify(statusBody)}`)
    }

    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_status_expired_1')
    if (stripeRow?.status !== 'expired' || stripeRow.payment_status !== 'unpaid' || stripeRow.completed_at) {
      throw new Error(`expected expired Stripe checkout row to stay unsettled, got ${JSON.stringify(stripeRow)}`)
    }
    const sessionRow = env.DB.agenticCommerceSessions.get(sessionId)
    if (sessionRow?.status !== 'cancelled' || !sessionRow.cancelled_at || sessionRow.completed_at) {
      throw new Error(`expected expired Stripe status refresh to cancel ACP session without proof completion, got ${JSON.stringify(sessionRow)}`)
    }
    const responseJson = JSON.parse(String(sessionRow.response_json || '{}')) as { status?: string; stripe_checkout?: { status?: string; payment_status?: string } }
    if (responseJson.status !== 'cancelled' || responseJson.stripe_checkout?.status !== 'expired' || responseJson.stripe_checkout.payment_status !== 'unpaid') {
      throw new Error(`expected ACP response_json to reflect expired Stripe status, got ${JSON.stringify(responseJson)}`)
    }
    if (env.DB.agenticCommerceProofs.size !== 0) {
      throw new Error(`expected expired Stripe Checkout to avoid proof writes, got ${JSON.stringify(Array.from(env.DB.agenticCommerceProofs.values()))}`)
    }
    const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.checkout_expired')) {
      throw new Error(`expected expired Stripe checkout trace event, got ${JSON.stringify(traceTypes)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceStripeExpiredWebhookCancelsAcpSession() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  let acpSessionId = ''
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target !== 'https://api.stripe.com/v1/checkout/sessions') {
        throw new Error(`unexpected fetch target ${target}`)
      }
      const params = new URLSearchParams(String(init?.body || ''))
      acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
      return new Response(JSON.stringify({
        id: 'cs_agentic_expired_webhook_1',
        url: 'https://checkout.stripe.com/c/pay/agentic_expired_webhook_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 2500,
        currency: 'usd',
        client_reference_id: acpSessionId,
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
          [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-expired-webhook',
        },
        created: 1_777_500_430,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const { body, sessionId } = await createHostedStripeAcpSessionForTest(env, {
      idempotencyKey: 'expired-webhook-idempotency-1',
      workspaceId: 'workspace-agentic-expired-webhook',
    })
    if (acpSessionId !== sessionId || body.session?.stripe_checkout?.id !== 'cs_agentic_expired_webhook_1') {
      throw new Error(`expected ACP session id to own hosted Stripe checkout, got ${JSON.stringify(body)}`)
    }

    const payload = JSON.stringify({
      id: 'evt_agentic_expired_webhook_1',
      api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
      type: 'checkout.session.expired',
      livemode: false,
      data: {
        object: {
          id: 'cs_agentic_expired_webhook_1',
          status: 'expired',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: sessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: sessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-expired-webhook',
          },
          created: 1_777_500_430,
        },
      },
    })
    const webhookResponse = await worker.fetch(
      new Request('https://commerce.example/api/payments/stripe/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
        },
        body: payload,
      }),
      env as never,
    )
    if (!webhookResponse.ok) throw new Error(`expected expired Stripe webhook to be acknowledged, received ${webhookResponse.status}: ${await webhookResponse.text()}`)

    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_expired_webhook_1')
    if (stripeRow?.status !== 'expired' || stripeRow.payment_status !== 'unpaid' || stripeRow.completed_at) {
      throw new Error(`expected expired Stripe checkout row to stay unsettled, got ${JSON.stringify(stripeRow)}`)
    }
    const sessionRow = env.DB.agenticCommerceSessions.get(sessionId)
    if (sessionRow?.status !== 'cancelled' || !sessionRow.cancelled_at || sessionRow.completed_at) {
      throw new Error(`expected expired Stripe webhook to cancel ACP session without proof completion, got ${JSON.stringify(sessionRow)}`)
    }
    if (env.DB.agenticCommerceProofs.size !== 0) {
      throw new Error(`expected expired Stripe webhook to avoid proof writes, got ${JSON.stringify(Array.from(env.DB.agenticCommerceProofs.values()))}`)
    }
    const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.checkout_expired')) {
      throw new Error(`expected expired Stripe checkout trace event, got ${JSON.stringify(traceTypes)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceStripeAsyncPaymentFailedWebhookMarksAcpPaymentFailed() {
  const env = createCommerceEnv()
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  let acpSessionId = ''
  let openboxCalls = 0
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target === 'https://openbox.example/risk') {
        openboxCalls += 1
        return new Response(JSON.stringify({ score: 0.17, action: 'authorized' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (target !== 'https://api.stripe.com/v1/checkout/sessions') {
        throw new Error(`unexpected fetch target ${target}`)
      }
      const params = new URLSearchParams(String(init?.body || ''))
      acpSessionId = String(params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) || '')
      return new Response(JSON.stringify({
        id: 'cs_agentic_async_failed_1',
        url: 'https://checkout.stripe.com/c/pay/agentic_async_failed_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 2500,
        currency: 'usd',
        client_reference_id: acpSessionId,
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: acpSessionId,
          [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-failed',
        },
        created: 1_777_500_410,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const createResponse = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
        method: 'POST',
        headers: {
          origin: 'https://commerce.example',
          'content-type': 'application/json',
          'idempotency-key': 'async-failed-idempotency-1',
        },
        body: JSON.stringify({
          amount_total: 2500,
          currency: 'usd',
          buyer: { email: 'buyer@example.com' },
          [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
            success_url: 'https://commerce.example/agenticgraph?stripeCheckout=success',
            cancel_url: 'https://commerce.example/agenticgraph?stripeCheckout=cancel',
            workspace_id: 'workspace-agentic-failed',
          },
        }),
      }),
      env as never,
    )
    if (!createResponse.ok) throw new Error(`expected hosted Stripe ACP session response ok, received ${createResponse.status}: ${await createResponse.text()}`)
    const createdBody = await createResponse.json() as { session?: { id?: string; stripe_checkout?: { id?: string; payment_status?: string } } }
    const sessionId = String(createdBody.session?.id || '')
    if (!sessionId || acpSessionId !== sessionId || createdBody.session?.stripe_checkout?.id !== 'cs_agentic_async_failed_1') {
      throw new Error(`expected ACP session id to own hosted Stripe checkout, got ${JSON.stringify(createdBody)}`)
    }

    const payload = JSON.stringify({
      id: 'evt_agentic_async_failed_1',
      api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
      type: 'checkout.session.async_payment_failed',
      livemode: false,
      data: {
        object: {
          id: 'cs_agentic_async_failed_1',
          status: 'complete',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: sessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: sessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-failed',
          },
          created: 1_777_500_410,
        },
      },
    })
    const webhookResponse = await worker.fetch(
      new Request('https://commerce.example/api/payments/stripe/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
        },
        body: payload,
      }),
      env as never,
    )
    if (!webhookResponse.ok) throw new Error(`expected async failed Stripe webhook to be acknowledged, received ${webhookResponse.status}: ${await webhookResponse.text()}`)

    const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_async_failed_1')
    if (stripeRow?.status !== 'complete' || stripeRow.payment_status !== 'unpaid' || stripeRow.completed_at) {
      throw new Error(`expected failed Stripe checkout row to stay unsettled, got ${JSON.stringify(stripeRow)}`)
    }
    const sessionRow = env.DB.agenticCommerceSessions.get(sessionId)
    if (sessionRow?.status !== 'payment_failed' || sessionRow.completed_at) {
      throw new Error(`expected ACP session to be payment_failed without proof completion, got ${JSON.stringify(sessionRow)}`)
    }
    const responseJson = JSON.parse(String(sessionRow.response_json || '{}')) as { status?: string; stripe_checkout?: { status?: string; payment_status?: string } }
    if (responseJson.status !== 'payment_failed' || responseJson.stripe_checkout?.status !== 'complete' || responseJson.stripe_checkout.payment_status !== 'unpaid') {
      throw new Error(`expected ACP response_json to reflect failed Stripe status, got ${JSON.stringify(responseJson)}`)
    }
    if (env.DB.agenticCommerceProofs.size !== 0) {
      throw new Error(`expected failed Stripe payment to avoid proof writes, got ${JSON.stringify(Array.from(env.DB.agenticCommerceProofs.values()))}`)
    }
    const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.payment_failed')) {
      throw new Error(`expected failed Stripe payment trace event, got ${JSON.stringify(traceTypes)}`)
    }

    const latePaidPayload = JSON.stringify({
      id: 'evt_agentic_async_failed_late_paid_1',
      api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_agentic_async_failed_1',
          status: 'complete',
          payment_status: 'paid',
          mode: 'payment',
          amount_total: 2500,
          currency: 'usd',
          client_reference_id: sessionId,
          metadata: {
            [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: sessionId,
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-agentic-failed',
          },
          created: 1_777_500_410,
        },
      },
    })
    const latePaidResponse = await worker.fetch(
      new Request('https://commerce.example/api/payments/stripe/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': await buildStripeSignatureHeader(latePaidPayload, 'whsec_'),
        },
        body: latePaidPayload,
      }),
      env as never,
    )
    if (!latePaidResponse.ok) throw new Error(`expected late paid Stripe webhook to be acknowledged, received ${latePaidResponse.status}: ${await latePaidResponse.text()}`)
    const sessionRowAfterLatePaid = env.DB.agenticCommerceSessions.get(sessionId)
    if (sessionRowAfterLatePaid?.status !== 'payment_failed' || sessionRowAfterLatePaid.completed_at) {
      throw new Error(`expected late paid Stripe webhook to leave payment_failed ACP session terminal, got ${JSON.stringify(sessionRowAfterLatePaid)}`)
    }
    if (env.DB.agenticCommerceProofs.size !== 0 || openboxCalls !== 0) {
      throw new Error(`expected late paid failed webhook to avoid proof and OpenBOX, got proofs=${env.DB.agenticCommerceProofs.size} openboxCalls=${openboxCalls}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceStripeWebhookRejectsMismatchedAcpAmount() {
  const env = createCommerceEnv()
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  const created = await createCheckoutSession(env, { idempotencyKey: 'webhook-mismatch-idempotency-1' })
  const payload = JSON.stringify({
    id: 'evt_agentic_commerce_mismatch_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_agentic_commerce_mismatch_1',
        status: 'complete',
        payment_status: 'paid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        client_reference_id: created.session.id,
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: created.session.id,
        },
        created: 1_777_500_201,
      },
    },
  })
  const response = await worker.fetch(
    new Request('https://commerce.example/api/payments/stripe/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected mismatched Stripe webhook to be acknowledged, received ${response.status}: ${await response.text()}`)
  const sessionRow = env.DB.agenticCommerceSessions.get(created.session.id)
  if (sessionRow?.status !== 'open') {
    throw new Error(`expected mismatched Stripe amount to avoid ACP settlement, got ${JSON.stringify(sessionRow)}`)
  }
  if (env.DB.agenticCommerceProofs.size !== 0) {
    throw new Error(`expected mismatched Stripe amount to avoid proof writes, got ${JSON.stringify(Array.from(env.DB.agenticCommerceProofs.values()))}`)
  }
}

export async function testAgenticCommerceStripeWebhookRejectsMissingAcpCurrency() {
  const env = createCommerceEnv()
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  const created = await createCheckoutSession(env, { idempotencyKey: 'webhook-missing-currency-idempotency-1' })
  const payload = JSON.stringify({
    id: 'evt_agentic_commerce_missing_currency_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_agentic_commerce_missing_currency_1',
        status: 'complete',
        payment_status: 'paid',
        mode: 'payment',
        amount_total: 2500,
        client_reference_id: created.session.id,
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: created.session.id,
        },
        created: 1_777_500_202,
      },
    },
  })
  const response = await worker.fetch(
    new Request('https://commerce.example/api/payments/stripe/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected missing-currency Stripe webhook to be acknowledged, received ${response.status}: ${await response.text()}`)
  const sessionRow = env.DB.agenticCommerceSessions.get(created.session.id)
  if (sessionRow?.status !== 'open' || sessionRow.completed_at) {
    throw new Error(`expected missing Stripe currency to avoid ACP settlement, got ${JSON.stringify(sessionRow)}`)
  }
  const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_commerce_missing_currency_1')
  if (stripeRow?.payment_status !== 'paid' || !stripeRow.completed_at) {
    throw new Error(`expected Stripe audit row to persist paid status even when ACP settlement is skipped, got ${JSON.stringify(stripeRow)}`)
  }
  if (env.DB.agenticCommerceProofs.size !== 0) {
    throw new Error(`expected missing Stripe currency to avoid proof writes, got ${JSON.stringify(Array.from(env.DB.agenticCommerceProofs.values()))}`)
  }
}

export async function testAgenticCommerceStripeWebhookRejectsMismatchedClientReference() {
  const env = createCommerceEnv()
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  const created = await createCheckoutSession(env, { idempotencyKey: 'webhook-mismatched-client-reference-idempotency-1' })
  const payload = JSON.stringify({
    id: 'evt_agentic_commerce_mismatched_client_reference_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_agentic_commerce_mismatched_client_reference_1',
        status: 'complete',
        payment_status: 'paid',
        mode: 'payment',
        amount_total: 2500,
        currency: 'usd',
        client_reference_id: 'acp_other_checkout_session',
        metadata: {
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: created.session.id,
        },
        created: 1_777_500_203,
      },
    },
  })
  const response = await worker.fetch(
    new Request('https://commerce.example/api/payments/stripe/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected mismatched-client-reference Stripe webhook to be acknowledged, received ${response.status}: ${await response.text()}`)
  const sessionRow = env.DB.agenticCommerceSessions.get(created.session.id)
  if (sessionRow?.status !== 'open' || sessionRow.completed_at) {
    throw new Error(`expected mismatched Stripe client_reference_id to avoid ACP settlement, got ${JSON.stringify(sessionRow)}`)
  }
  const stripeRow = env.DB.stripeCheckoutSessions.get('cs_agentic_commerce_mismatched_client_reference_1')
  if (stripeRow?.payment_status !== 'paid' || !stripeRow.completed_at) {
    throw new Error(`expected Stripe audit row to persist paid status even when ACP settlement is skipped, got ${JSON.stringify(stripeRow)}`)
  }
  if (env.DB.agenticCommerceProofs.size !== 0) {
    throw new Error(`expected mismatched Stripe client_reference_id to avoid proof writes, got ${JSON.stringify(Array.from(env.DB.agenticCommerceProofs.values()))}`)
  }
}

export async function testAgenticCommerceWeb3SettleRouteConfirmsBaseRpcAndAttests() {
  const env = createCommerceEnv()
  delete env.OPENBOX_API_URL
  env.BASE_RPC_URL = 'https://base.example/rpc'
  env.EAS_ATTEST_URL = 'https://eas.example/attest'
  const created = await createCheckoutSession(env, {
    idempotencyKey: 'web3-rpc-settle-idempotency-1',
    currency: 'usdc',
    'x-web3': {
      payment_method: 'erc20',
      payer_did: 'did:debox:0x987',
    },
  })
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target === 'https://base.example/rpc') {
        const requestBody = JSON.parse(String(init?.body || '{}')) as { method?: string }
        if (requestBody.method !== 'eth_getTransactionByHash') throw new Error(`unexpected RPC method ${requestBody.method}`)
        return new Response(JSON.stringify({
          result: {
            to: '0x0000000000000000000000000000000000000001',
            value: '0x0',
            input: encodeErc20TransferInput(String(created.session.deposit_address), 2500),
            blockNumber: '0x10',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://eas.example/attest') {
        return new Response(JSON.stringify({ attestation_uid: 'eas_rpc_123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch target ${target}`)
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.web3Settle}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: created.session.id, tx_hash: '0xabc123' }),
      }),
      env as never,
    )
    if (!response.ok) throw new Error(`expected web3 settle route ok, received ${response.status}: ${await response.text()}`)
    const body = await response.json() as {
      session?: { status?: string }
      proof?: { attestation_uid?: string; canvas_node?: { tx_hash?: string; attestation_uid?: string } }
    }
    if (body.session?.status !== 'complete' || body.proof?.attestation_uid !== 'eas_rpc_123') {
      throw new Error(`expected Base RPC + EAS settlement proof, got ${JSON.stringify(body)}`)
    }
    const canvasNode = body.proof?.canvas_node
    if (canvasNode?.tx_hash !== '0xabc123' || canvasNode.attestation_uid !== 'eas_rpc_123') {
      throw new Error(`expected @node:proof tx and attestation, got ${JSON.stringify(body.proof)}`)
    }
    const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.web3_confirm') || !traceTypes.includes('agenticgraph.commerce.attest')) {
      throw new Error(`expected Web3 confirmation and attest trace events, got ${JSON.stringify(traceTypes)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceOpenboxIngestRoutePostsProofArtifact() {
  const env = createCommerceEnv()
  env.OPENBOX_INGEST_URL = 'https://openbox.example/ingest'
  const created = await createCheckoutSession(env, { idempotencyKey: 'openbox-ingest-idempotency-1' })
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target !== 'https://openbox.example/ingest') throw new Error(`unexpected fetch target ${target}`)
      const headers = new Headers(init?.headers)
      if (headers.get('authorization') !== 'Bearer openbox_test_key') throw new Error('expected OpenBOX ingest bearer token')
      const requestBody = JSON.parse(String(init?.body || '{}')) as { commerce?: Array<{ session_id?: string }> }
      if (requestBody.commerce?.[0]?.session_id !== created.session.id) throw new Error(`expected posted proof artifact, got ${JSON.stringify(requestBody)}`)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const response = await worker.fetch(
      new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.openboxIngest}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'agenticgraph-commerce-proof/v1',
          commerce: [{ session_id: created.session.id, proof_id: 'proof_ingest_route' }],
        }),
      }),
      env as never,
    )
    if (!response.ok) throw new Error(`expected OpenBOX ingest route ok, received ${response.status}: ${await response.text()}`)
    const traceTypes = Array.from(env.DB.agenticCommerceTraceEvents.values()).map(row => row.event_type)
    if (!traceTypes.includes('agenticgraph.commerce.openbox_ingest')) {
      throw new Error(`expected OpenBOX ingest trace event, got ${JSON.stringify(traceTypes)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticCommerceBearerTokenProtectsDbBackedRoutes() {
  const env = createCommerceEnv()
  env.ACP_BEARER_TOKEN = 'acp_secret'
  const configResponse = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig}`),
    env as never,
  )
  if (!configResponse.ok) throw new Error(`expected public ACP config with bearer configured, received ${configResponse.status}`)
  const blocked = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_total: 2500, currency: 'usd' }),
    }),
    env as never,
  )
  if (blocked.status !== 401) throw new Error(`expected unauthenticated checkout to be blocked, received ${blocked.status}`)
  const allowed = await worker.fetch(
    new Request(`https://commerce.example${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer acp_secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount_total: 2500, currency: 'usd', idempotency_key: 'bearer-idempotency-1' }),
    }),
    env as never,
  )
  if (!allowed.ok) throw new Error(`expected authenticated checkout to pass, received ${allowed.status}: ${await allowed.text()}`)
}

export function testAgenticCommerceWorkerUsesSharedSemanticKeyHelper() {
  const workerText = readFileSync(resolve(process.cwd(), '../cloudflare/workers/agenticgraph-payment/agenticCommerce.ts'), 'utf8')
  const sharedText = readFileSync(resolve(process.cwd(), '../grph-shared/src/payments/agenticCommerceSemanticKey.ts'), 'utf8')
  if (!workerText.includes('buildAgenticCommerceSemanticKey')) {
    throw new Error('expected commerce worker to use the shared agentic commerce semantic-key helper')
  }
  if (!sharedText.includes("hashSignatureParts(['agentic-commerce'")) {
    throw new Error('expected commerce semantic-key helper to be rooted in the shared hash signature helper')
  }
}

export function testAgenticCommerceDocsPinStripeWebhookIdempotencyContract() {
  const repoRoot = resolve(process.cwd(), '..')
  const docs = [
    'docs/documents/agenticgraph-agentic-commerce-prd-tad.md',
    'docs/documents/agenticgraph-api-document.md',
    'docs/documents/agenticgraph-backend-document.md',
  ].map(path => readFileSync(resolve(repoRoot, path), 'utf8')).join('\n')
  const requiredSnippets = [
    'same-payload',
    'conflicting payloads',
    'stale `processing`',
    'worker.payments.stripe.webhook.duplicatePayloadConflict',
    'worker.payments.stripe.webhook.reclaimsStaleProcessingClaim',
  ]
  requiredSnippets.forEach(snippet => {
    if (!docs.includes(snippet)) {
      throw new Error(`expected Stripe webhook idempotency docs to include ${JSON.stringify(snippet)}`)
    }
  })
}

export function testAgenticCommerceSharedSsotUsesCurrentCapabilityNames() {
  const sharedText = readFileSync(resolve(process.cwd(), '../grph-shared/src/payments/agenticCommerceSsot.ts'), 'utf8')
  if (sharedText.includes('legacyCapabilities')) {
    throw new Error('expected shared agentic commerce SSOT to remove stale legacy capability owner naming')
  }
  if (!sharedText.includes('const commerceCapabilities')) {
    throw new Error('expected shared agentic commerce SSOT to keep current commerce capability owner naming')
  }
}

const encodeErc20TransferInput = (recipient: string, amount: number): string => {
  const address = recipient.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const amountHex = BigInt(amount).toString(16).padStart(64, '0')
  return `0xa9059cbb${address}${amountHex}`
}

const buildStripeSignatureHeader = async (payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const hex = Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}
