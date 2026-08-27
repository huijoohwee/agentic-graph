import paymentWorkerModule from '../../../cloudflare/workers/agenticgraph-payment/index.ts'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import {
  STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID,
  STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL,
  STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY,
  STRIPE_CHECKOUT_METADATA_READINESS_SMOKE,
  STRIPE_CHECKOUT_METADATA_WORKSPACE_ID,
  STRIPE_CHECKOUT_SESSION_ID_TOKEN,
  STRIPE_PAYMENT_WEBHOOK_API_VERSION,
  STRIPE_PAYMENT_ROUTE_PATHS,
} from 'grph-shared/payments/stripePaymentSsot'

const worker = (
  typeof (paymentWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? paymentWorkerModule
    : (paymentWorkerModule as unknown as { default: typeof paymentWorkerModule }).default
) as typeof paymentWorkerModule

const textEncoder = new TextEncoder()

const buildStripeSignatureHeader = async (payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(`${timestamp}.${payload}`))
  const hex = Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}

const createPaymentsEnv = () => {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & Record<string, unknown>
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  env.STRIPE_WEBHOOK_SECRET = 'whsec_'
  return env
}

export async function testAgenticGraphPaymentWorkerCreatesStripeCheckoutSessionThroughServerRoute() {
  const env = createPaymentsEnv()
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        id: 'cs_accept_payment_1',
        url: 'https://checkout.stripe.com/c/pay/accept_payment_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        client_reference_id: 'workspace-payment',
        metadata: { [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-payment' },
        created: 1_777_500_000,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://example.com/agenticgraph?stripeCheckout=success',
          cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
          workspaceId: 'workspace-payment',
          stripeIdempotencyKey: 'caller_owned_replay_key',
        }),
      }),
      env as never,
    )

    if (!response.ok) throw new Error(`expected checkout create response ok, received ${response.status}: ${await response.text()}`)
    const body = await response.json() as { id?: string; url?: string; paymentStatus?: string }
    if (body.id !== 'cs_accept_payment_1' || !String(body.url || '').includes('checkout.stripe.com')) {
      throw new Error(`expected hosted Checkout Session response, got ${JSON.stringify(body)}`)
    }
    if (fetchCalls.length !== 1) throw new Error(`expected one Stripe API call, got ${fetchCalls.length}`)
    if (fetchCalls[0]?.url !== 'https://api.stripe.com/v1/checkout/sessions') {
      throw new Error(`expected Stripe Checkout Sessions endpoint, got ${JSON.stringify(fetchCalls[0]?.url)}`)
    }
    const headers = new Headers(fetchCalls[0]?.init?.headers)
    if (headers.get('authorization') !== 'Bearer rk_') {
      throw new Error('expected Worker to attach the server-managed Stripe key')
    }
    if (headers.get('Idempotency-Key')) {
      throw new Error('expected human hosted Checkout to ignore caller-owned Stripe idempotency so Open Checkout creates a fresh Session')
    }
    const params = new URLSearchParams(String(fetchCalls[0]?.init?.body || ''))
    if (params.get('mode') !== 'payment') {
      throw new Error(`expected one-time payment mode by default, got ${params.toString()}`)
    }
    if (!String(params.get('success_url') || '').includes(STRIPE_CHECKOUT_SESSION_ID_TOKEN)) {
      throw new Error(`expected success_url to preserve Checkout Session id token, got ${params.toString()}`)
    }
    if (params.get('line_items[0][price]') !== 'price_accept_payment') {
      throw new Error(`expected server-owned Stripe Price id, got ${params.toString()}`)
    }
    if (params.get(`metadata[${STRIPE_CHECKOUT_METADATA_WORKSPACE_ID}]`) !== 'workspace-payment') {
      throw new Error('expected checkout request to preserve workspace payment metadata')
    }
    const stored = env.DB.stripeCheckoutSessions.get('cs_accept_payment_1')
    if (!stored || stored.payment_status !== 'unpaid') {
      throw new Error(`expected checkout session to be stored server-side, got ${JSON.stringify(stored)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerReadinessSmokeExpiresHostedCheckoutBeforeResponse() {
  const env = createPaymentsEnv()
  const fetchTargets: string[] = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = url instanceof Request ? url.url : String(url)
      fetchTargets.push(target)
      if (target === 'https://api.stripe.com/v1/checkout/sessions') {
        const params = new URLSearchParams(String(init?.body || ''))
        if (params.get(`metadata[${STRIPE_CHECKOUT_METADATA_READINESS_SMOKE}]`) !== 'true') {
          throw new Error(`expected readiness smoke metadata on Stripe Checkout create, got ${params.toString()}`)
        }
        return new Response(JSON.stringify({
          id: 'cs_accept_payment_readiness_smoke_1',
          url: 'https://checkout.stripe.com/c/pay/readiness_smoke_1',
          status: 'open',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 1200,
          currency: 'usd',
          client_reference_id: 'stripe-readiness-smoke',
          metadata: {
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'stripe-readiness-smoke',
            [STRIPE_CHECKOUT_METADATA_READINESS_SMOKE]: 'true',
          },
          created: 1_777_500_000,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://api.stripe.com/v1/checkout/sessions/cs_accept_payment_readiness_smoke_1/expire') {
        return new Response(JSON.stringify({
          id: 'cs_accept_payment_readiness_smoke_1',
          status: 'expired',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 1200,
          currency: 'usd',
          client_reference_id: 'stripe-readiness-smoke',
          metadata: {
            [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'stripe-readiness-smoke',
            [STRIPE_CHECKOUT_METADATA_READINESS_SMOKE]: 'true',
          },
          created: 1_777_500_000,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected Stripe fetch target ${target}`)
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://example.com/agenticgraph?stripeCheckout=success',
          cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
          workspaceId: 'stripe-readiness-smoke',
          readinessSmoke: true,
        }),
      }),
      env as never,
    )

    if (!response.ok) throw new Error(`expected readiness smoke response ok, received ${response.status}: ${await response.text()}`)
    const body = await response.json() as { id?: string; url?: string; status?: string; readinessSmoke?: boolean }
    if (
      body.id !== 'cs_accept_payment_readiness_smoke_1'
      || body.status !== 'expired'
      || body.readinessSmoke !== true
      || body.url
    ) {
      throw new Error(`expected readiness smoke to return expired Session without hosted URL, got ${JSON.stringify(body)}`)
    }
    if (fetchTargets.join(' -> ') !== [
      'https://api.stripe.com/v1/checkout/sessions',
      'https://api.stripe.com/v1/checkout/sessions/cs_accept_payment_readiness_smoke_1/expire',
    ].join(' -> ')) {
      throw new Error(`expected readiness smoke to create then expire hosted Checkout, got ${JSON.stringify(fetchTargets)}`)
    }
    const stored = env.DB.stripeCheckoutSessions.get('cs_accept_payment_readiness_smoke_1')
    if (stored?.status !== 'expired' || stored.payment_status !== 'unpaid') {
      throw new Error(`expected readiness smoke D1 row to be expired, got ${JSON.stringify(stored)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerExpiresStripeCheckoutWhenAuditPersistenceFails() {
  const env = createPaymentsEnv()
  const originalPrepare = env.DB.prepare.bind(env.DB)
  env.DB.prepare = ((sql: string) => {
    if (String(sql || '').toLowerCase().includes('insert into stripe_checkout_sessions')) {
      const statement = {
        bind: () => statement,
        run: async () => {
          throw new Error('injected Stripe checkout audit persistence failure')
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
    globalThis.fetch = (async (url: string | URL | Request) => {
      const target = url instanceof Request ? url.url : String(url)
      fetchTargets.push(target)
      if (target === 'https://api.stripe.com/v1/checkout/sessions') {
        return new Response(JSON.stringify({
          id: 'cs_accept_payment_audit_failure_1',
          url: 'https://checkout.stripe.com/c/pay/accept_payment_audit_failure_1',
          status: 'open',
          payment_status: 'unpaid',
          mode: 'payment',
          amount_total: 1200,
          currency: 'usd',
          client_reference_id: 'workspace-payment-audit-failure',
          metadata: { [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-payment-audit-failure' },
          created: 1_777_500_000,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target === 'https://api.stripe.com/v1/checkout/sessions/cs_accept_payment_audit_failure_1/expire') {
        return new Response(JSON.stringify({
          id: 'cs_accept_payment_audit_failure_1',
          status: 'expired',
          payment_status: 'unpaid',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected Stripe fetch target ${target}`)
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://example.com/agenticgraph?stripeCheckout=success',
          cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
          workspaceId: 'workspace-payment-audit-failure',
        }),
      }),
      env as never,
    )

    const body = await response.json() as { error?: string }
    if (response.status !== 500 || !String(body.error || '').includes('Failed to persist Stripe Checkout Session after Stripe creation')) {
      throw new Error(`expected Stripe audit persistence failure to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
    if (!String(body.error || '').includes('hosted Stripe Session was expired')) {
      throw new Error(`expected Stripe audit persistence failure to report expiry cleanup, got ${JSON.stringify(body)}`)
    }
    if (!fetchTargets.includes('https://api.stripe.com/v1/checkout/sessions/cs_accept_payment_audit_failure_1/expire')) {
      throw new Error(`expected unowned hosted Checkout Session to be expired, got ${JSON.stringify(fetchTargets)}`)
    }
    if (env.DB.stripeCheckoutSessions.size !== 0) {
      throw new Error(`expected failed Stripe audit persistence to avoid stored checkout rows, got ${JSON.stringify(Array.from(env.DB.stripeCheckoutSessions.values()))}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerRejectsCallerOwnedStripeReturnUrls() {
  const env = createPaymentsEnv()
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('caller-owned return URLs must fail before Stripe API calls')
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://attacker.example/agenticgraph?stripeCheckout=success',
          cancelUrl: 'https://attacker.example/agenticgraph?stripeCheckout=cancel',
          workspaceId: 'workspace-payment',
        }),
      }),
      env as never,
    )

    const body = await response.json() as { error?: string }
    if (response.status !== 400 || !String(body.error || '').includes('server return origin')) {
      throw new Error(`expected caller-owned return URLs to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerAcceptsConfiguredStripeReturnOriginOverride() {
  const env = createPaymentsEnv()
  env.STRIPE_CHECKOUT_RETURN_ORIGIN = 'https://app.example'
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        id: 'cs_accept_configured_return_origin_1',
        url: 'https://checkout.stripe.com/c/pay/accept_configured_return_origin_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        created: 1_777_500_000,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://worker.example${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://app.example/agenticgraph?stripeCheckout=success',
          cancelUrl: 'https://app.example/agenticgraph?stripeCheckout=cancel',
          workspaceId: 'workspace-payment',
        }),
      }),
      env as never,
    )

    if (!response.ok) throw new Error(`expected configured return origin response ok, received ${response.status}: ${await response.text()}`)
    if (fetchCalls.length !== 1) throw new Error(`expected one Stripe API call, got ${fetchCalls.length}`)
    const params = new URLSearchParams(String(fetchCalls[0]?.init?.body || ''))
    if (!String(params.get('success_url') || '').startsWith('https://app.example/agenticgraph?')) {
      throw new Error(`expected configured return origin to reach Stripe, got ${params.toString()}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerCreatesAgenticStripeCheckoutSessionMetadata() {
  const env = createPaymentsEnv()
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        id: 'cs_accept_agentic_payment_1',
        url: 'https://checkout.stripe.com/c/pay/accept_agentic_payment_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        client_reference_id: 'acp_checkout_worker',
        metadata: {
          [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-payment',
          [STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID]: 'acp_checkout_worker',
        },
        created: 1_777_500_000,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://example.com/agenticgraph?stripeCheckout=success',
          cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
          workspaceId: 'workspace-payment',
          agenticCommerceSessionId: 'acp_checkout_worker',
          expectedAmountTotal: 1200,
          expectedCurrency: 'usd',
          stripeIdempotencyKey: 'caller_owned_replay_key',
        }),
      }),
      env as never,
    )

    if (!response.ok) throw new Error(`expected agentic checkout response ok, received ${response.status}: ${await response.text()}`)
    const params = new URLSearchParams(String(fetchCalls[0]?.init?.body || ''))
    if (params.get('client_reference_id') !== 'acp_checkout_worker') {
      throw new Error(`expected ACP session id to own client_reference_id, got ${params.toString()}`)
    }
    const headers = new Headers(fetchCalls[0]?.init?.headers)
    if (headers.get('Idempotency-Key') !== 'acp_checkout_worker') {
      throw new Error('expected ACP hosted Checkout to use the ACP session id, not caller data, as Stripe Idempotency-Key')
    }
    if (params.get(`metadata[${STRIPE_CHECKOUT_METADATA_WORKSPACE_ID}]`) !== 'workspace-payment') {
      throw new Error(`expected workspace metadata to stay separate, got ${params.toString()}`)
    }
    if (params.get(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`) !== 'acp_checkout_worker') {
      throw new Error(`expected ACP metadata to reach Stripe Checkout, got ${params.toString()}`)
    }
    if (
      params.get(`metadata[${STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL}]`) !== '1200'
      || params.get(`metadata[${STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY}]`) !== 'usd'
    ) {
      throw new Error(`expected ACP expected total metadata to reach Stripe Checkout, got ${params.toString()}`)
    }
    const stored = env.DB.stripeCheckoutSessions.get('cs_accept_agentic_payment_1')
    const metadata = JSON.parse(String(stored?.metadata_json || '{}')) as Record<string, unknown>
    if (stored?.workspace_id !== 'workspace-payment' || metadata[STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID] !== 'acp_checkout_worker') {
      throw new Error(`expected stored checkout metadata to preserve workspace and ACP ids, got ${JSON.stringify(stored)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerRejectsOversizedStripeClientReferenceId() {
  const env = createPaymentsEnv()
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('oversized Stripe client references must fail before Stripe API calls')
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://example.com/agenticgraph?stripeCheckout=success',
          cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
          agenticCommerceSessionId: `acp_${'x'.repeat(201)}`,
        }),
      }),
      env as never,
    )

    const body = await response.json() as { error?: string }
    if (response.status !== 400 || !String(body.error || '').includes('client_reference_id')) {
      throw new Error(`expected oversized client_reference_id to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerCreatesStripeSubscriptionCheckoutSessionFromServerMode() {
  const env = createPaymentsEnv()
  env.STRIPE_CHECKOUT_MODE = 'subscription'
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        id: 'cs_accept_subscription_1',
        url: 'https://checkout.stripe.com/c/pay/accept_subscription_1',
        status: 'open',
        payment_status: 'unpaid',
        mode: 'subscription',
        amount_total: 1200,
        currency: 'usd',
        created: 1_777_500_000,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          successUrl: 'https://example.com/agenticgraph?stripeCheckout=success&session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
        }),
      }),
      env as never,
    )

    if (!response.ok) throw new Error(`expected subscription checkout response ok, received ${response.status}: ${await response.text()}`)
    const params = new URLSearchParams(String(fetchCalls[0]?.init?.body || ''))
    if (params.get('mode') !== 'subscription' || params.get('line_items[0][price]') !== 'price_accept_payment') {
      throw new Error(`expected subscription mode with server-owned Price id, got ${params.toString()}`)
    }
    const stored = env.DB.stripeCheckoutSessions.get('cs_accept_subscription_1')
    if (!stored || stored.mode !== 'subscription') {
      throw new Error(`expected subscription checkout session to be stored, got ${JSON.stringify(stored)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerRejectsStripeSubscriptionWithoutPriceId() {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & Record<string, unknown>
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  env.STRIPE_CHECKOUT_MODE = 'subscription'
  env.STRIPE_CHECKOUT_CURRENCY = 'usd'
  env.STRIPE_CHECKOUT_UNIT_AMOUNT = '1200'
  env.STRIPE_CHECKOUT_PRODUCT_NAME = 'AgenticGraph'
  const response = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
      method: 'POST',
      headers: {
        origin: 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        successUrl: 'https://example.com/agenticgraph?stripeCheckout=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
      }),
    }),
    env as never,
  )
  const body = await response.json() as { error?: string }
  if (response.status !== 500 || !String(body.error || '').includes('STRIPE_CHECKOUT_PRICE_ID')) {
    throw new Error(`expected subscription mode without Price id to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
  }
}

export async function testAgenticGraphPaymentWorkerRejectsStripeCheckoutWithoutServerPriceAuthority() {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & Record<string, unknown>
  env.STRIPE_RESTRICTED_KEY = 'rk_'
  const response = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
      method: 'POST',
      headers: {
        origin: 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        successUrl: 'https://example.com/agenticgraph?stripeCheckout=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
      }),
    }),
    env as never,
  )
  if (response.status !== 500) {
    throw new Error(`expected missing server price authority to fail closed, received ${response.status}`)
  }
}

export async function testAgenticGraphPaymentWorkerExplainsMissingStripeWorkerSecretScope() {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & Record<string, unknown>
  env.STRIPE_CHECKOUT_PRICE_ID = 'price_accept_payment'
  const response = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`, {
      method: 'POST',
      headers: {
        origin: 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        successUrl: 'https://example.com/agenticgraph?stripeCheckout=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://example.com/agenticgraph?stripeCheckout=cancel',
      }),
    }),
    env as never,
  )
  if (response.status !== 500) {
    throw new Error(`expected missing server Stripe key to fail closed, received ${response.status}`)
  }
  const body = await response.json() as { error?: string }
  const error = String(body.error || '')
  if (!error.includes('STRIPE_SECRET_KEY') || !error.includes('Pages project variables')) {
    throw new Error(`expected missing key error to identify Worker-vs-Pages secret scope, got ${JSON.stringify(body)}`)
  }
}

export async function testAgenticGraphPaymentWorkerAcceptsStripeWebhookAndStoresCompletedSession() {
  const env = createPaymentsEnv()
  const payload = JSON.stringify({
    id: 'evt_accept_payment_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_accept_payment_webhook',
        status: 'complete',
        payment_status: 'paid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        customer: 'cus_accept_payment',
        customer_details: { email: 'paid@example.com' },
        metadata: { workspace_id: 'workspace-webhook' },
        created: 1_777_500_100,
      },
    },
  })
  const response = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected webhook response ok, received ${response.status}: ${await response.text()}`)
  const eventRow = env.DB.stripeWebhookEvents.get('evt_accept_payment_1')
  if (!eventRow || eventRow.event_type !== 'checkout.session.completed') {
    throw new Error(`expected verified webhook event to be stored, got ${JSON.stringify(eventRow)}`)
  }
  const sessionRow = env.DB.stripeCheckoutSessions.get('cs_accept_payment_webhook')
  if (!sessionRow || sessionRow.payment_status !== 'paid' || !sessionRow.completed_at) {
    throw new Error(`expected paid checkout session to be stored, got ${JSON.stringify(sessionRow)}`)
  }

  const statusResponse = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?session_id=cs_accept_payment_webhook`),
    env as never,
  )
  if (!statusResponse.ok) throw new Error(`expected checkout status response ok, received ${statusResponse.status}`)
  const statusJson = await statusResponse.json() as { session?: Record<string, unknown> & { paymentStatus?: string } }
  if (statusJson.session?.paymentStatus !== 'paid' || 'workspaceId' in (statusJson.session || {}) || 'customerEmail' in (statusJson.session || {})) {
    throw new Error(`expected paid stored checkout status, got ${JSON.stringify(statusJson)}`)
  }
  if (sessionRow.workspace_id !== 'workspace-webhook' || sessionRow.customer_email !== 'paid@example.com') {
    throw new Error(`expected D1 checkout row to keep webhook audit metadata, got ${JSON.stringify(sessionRow)}`)
  }
}

export async function testAgenticGraphPaymentWorkerSkipsDuplicateStripeWebhookEventIds() {
  const env = createPaymentsEnv()
  const payload = JSON.stringify({
    id: 'evt_accept_payment_duplicate_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_accept_payment_duplicate',
        status: 'complete',
        payment_status: 'unpaid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        metadata: { workspace_id: 'workspace-duplicate-webhook' },
        created: 1_777_500_101,
      },
    },
  })

  const firstResponse = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!firstResponse.ok) throw new Error(`expected first webhook response ok, received ${firstResponse.status}: ${await firstResponse.text()}`)

  const replayResponse = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!replayResponse.ok) throw new Error(`expected duplicate webhook response ok, received ${replayResponse.status}: ${await replayResponse.text()}`)
  const replayBody = await replayResponse.json() as { duplicate?: boolean }
  if (replayBody.duplicate !== true) {
    throw new Error(`expected duplicate webhook response to flag duplicate delivery, got ${JSON.stringify(replayBody)}`)
  }

  const eventRows = Array.from(env.DB.stripeWebhookEvents.values())
  if (eventRows.length !== 1 || eventRows[0]?.id !== 'evt_accept_payment_duplicate_1') {
    throw new Error(`expected one stored webhook event id, got ${JSON.stringify(eventRows)}`)
  }
  const sessionRow = env.DB.stripeCheckoutSessions.get('cs_accept_payment_duplicate')
  if (sessionRow?.payment_status !== 'unpaid' || sessionRow.completed_at) {
    throw new Error(`expected duplicate webhook replay not to rewrite Checkout row, got ${JSON.stringify(sessionRow)}`)
  }
}

export async function testAgenticGraphPaymentWorkerRejectsDuplicateStripeWebhookEventIdWithDifferentPayload() {
  const env = createPaymentsEnv()
  const buildPayload = (paymentStatus: 'unpaid' | 'paid') => JSON.stringify({
    id: 'evt_accept_payment_conflict_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_accept_payment_conflict',
        status: 'complete',
        payment_status: paymentStatus,
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        metadata: { workspace_id: 'workspace-conflict-webhook' },
        created: 1_777_500_101,
      },
    },
  })

  const firstPayload = buildPayload('unpaid')
  const firstResponse = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(firstPayload, 'whsec_'),
      },
      body: firstPayload,
    }),
    env as never,
  )
  if (!firstResponse.ok) throw new Error(`expected first webhook response ok, received ${firstResponse.status}: ${await firstResponse.text()}`)

  const conflictingPayload = buildPayload('paid')
  const conflictResponse = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(conflictingPayload, 'whsec_'),
      },
      body: conflictingPayload,
    }),
    env as never,
  )
  const conflictBody = await conflictResponse.json() as { error?: string }
  if (conflictResponse.status !== 409 || !String(conflictBody.error || '').includes('different payload')) {
    throw new Error(`expected webhook event id payload conflict to fail closed, received ${conflictResponse.status}: ${JSON.stringify(conflictBody)}`)
  }

  const eventRows = Array.from(env.DB.stripeWebhookEvents.values())
  if (eventRows.length !== 1 || eventRows[0]?.id !== 'evt_accept_payment_conflict_1') {
    throw new Error(`expected one stored conflicting webhook event id, got ${JSON.stringify(eventRows)}`)
  }
  const sessionRow = env.DB.stripeCheckoutSessions.get('cs_accept_payment_conflict')
  if (sessionRow?.payment_status !== 'unpaid' || sessionRow.completed_at) {
    throw new Error(`expected conflicting payload not to rewrite Checkout row, got ${JSON.stringify(sessionRow)}`)
  }
}

export async function testAgenticGraphPaymentWorkerRetriesFailedStripeWebhookEventProcessing() {
  const env = createPaymentsEnv()
  const originalPrepare = env.DB.prepare.bind(env.DB)
  let failNextCheckoutWrite = true
  env.DB.prepare = ((sql: string) => {
    if (failNextCheckoutWrite && String(sql || '').toLowerCase().includes('insert into stripe_checkout_sessions')) {
      const statement = {
        bind: () => statement,
        run: async () => {
          failNextCheckoutWrite = false
          throw new Error('injected checkout write failure')
        },
        all: async () => ({ results: [] }),
      }
      return statement
    }
    return originalPrepare(sql)
  }) as typeof env.DB.prepare
  const payload = JSON.stringify({
    id: 'evt_accept_payment_retry_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_accept_payment_retry',
        status: 'complete',
        payment_status: 'paid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        metadata: { workspace_id: 'workspace-retry-webhook' },
        created: 1_777_500_102,
      },
    },
  })

  const firstResponse = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (firstResponse.status !== 500) {
    throw new Error(`expected injected processing failure to return retryable 500, received ${firstResponse.status}: ${await firstResponse.text()}`)
  }
  const failedEventRow = env.DB.stripeWebhookEvents.get('evt_accept_payment_retry_1')
  if (failedEventRow?.processing_status !== 'failed' || !String(failedEventRow.processing_error || '').includes('injected checkout write failure')) {
    throw new Error(`expected failed webhook processing state to be persisted, got ${JSON.stringify(failedEventRow)}`)
  }
  if (env.DB.stripeCheckoutSessions.has('cs_accept_payment_retry')) {
    throw new Error(`expected failed first attempt to avoid Checkout row persistence, got ${JSON.stringify(env.DB.stripeCheckoutSessions.get('cs_accept_payment_retry'))}`)
  }

  const retryResponse = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!retryResponse.ok) throw new Error(`expected retry webhook response ok, received ${retryResponse.status}: ${await retryResponse.text()}`)
  const retryBody = await retryResponse.json() as { duplicate?: boolean }
  if (retryBody.duplicate !== false) {
    throw new Error(`expected failed webhook retry to process instead of duplicate-skip, got ${JSON.stringify(retryBody)}`)
  }
  const processedEventRow = env.DB.stripeWebhookEvents.get('evt_accept_payment_retry_1')
  if (processedEventRow?.processing_status !== 'processed' || !processedEventRow.processed_at || processedEventRow.processing_error) {
    throw new Error(`expected retry to mark webhook event processed, got ${JSON.stringify(processedEventRow)}`)
  }
  const sessionRow = env.DB.stripeCheckoutSessions.get('cs_accept_payment_retry')
  if (sessionRow?.payment_status !== 'paid' || !sessionRow.completed_at) {
    throw new Error(`expected retry to persist paid Checkout row, got ${JSON.stringify(sessionRow)}`)
  }
}

export async function testAgenticGraphPaymentWorkerReclaimsStaleStripeWebhookProcessingClaim() {
  const env = createPaymentsEnv()
  env.DB.stripeWebhookEvents.set('evt_accept_payment_stale_processing_1', {
    id: 'evt_accept_payment_stale_processing_1',
    event_type: 'checkout.session.completed',
    livemode: 0,
    payload_hash: '',
    received_at: '2026-01-01T00:00:00.000Z',
    processed_at: null,
    processing_status: 'processing',
    processing_error: null,
  })
  const payload = JSON.stringify({
    id: 'evt_accept_payment_stale_processing_1',
    api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_accept_payment_stale_processing',
        status: 'complete',
        payment_status: 'paid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        metadata: { workspace_id: 'workspace-stale-processing-webhook' },
        created: 1_777_500_103,
      },
    },
  })

  const response = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await buildStripeSignatureHeader(payload, 'whsec_'),
      },
      body: payload,
    }),
    env as never,
  )
  if (!response.ok) throw new Error(`expected stale processing webhook response ok, received ${response.status}: ${await response.text()}`)
  const body = await response.json() as { duplicate?: boolean }
  if (body.duplicate !== false) {
    throw new Error(`expected stale processing claim to be reclaimed instead of duplicate-skipped, got ${JSON.stringify(body)}`)
  }
  const eventRow = env.DB.stripeWebhookEvents.get('evt_accept_payment_stale_processing_1')
  if (eventRow?.processing_status !== 'processed' || !eventRow.processed_at || eventRow.processing_error) {
    throw new Error(`expected reclaimed stale webhook event to finish processed, got ${JSON.stringify(eventRow)}`)
  }
  if (eventRow.received_at === '2026-01-01T00:00:00.000Z') {
    throw new Error(`expected reclaimed webhook claim timestamp to refresh, got ${JSON.stringify(eventRow)}`)
  }
  const sessionRow = env.DB.stripeCheckoutSessions.get('cs_accept_payment_stale_processing')
  if (sessionRow?.payment_status !== 'paid' || !sessionRow.completed_at) {
    throw new Error(`expected reclaimed stale processing claim to persist paid Checkout row, got ${JSON.stringify(sessionRow)}`)
  }
}

export async function testAgenticGraphPaymentWorkerRefreshesStripeCheckoutStatusOnReturnBeforeWebhook() {
  const env = createPaymentsEnv()
  env.DB.stripeCheckoutSessions.set('cs_return_before_webhook', {
    id: 'cs_return_before_webhook',
    workspace_id: 'workspace-return',
    status: 'open',
    payment_status: 'unpaid',
    mode: 'payment',
    amount_total: 1200,
    currency: 'usd',
    customer_id: null,
    customer_email: null,
    url: 'https://checkout.stripe.com/c/pay/return_before_webhook',
    metadata_json: JSON.stringify({ [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-return' }),
    created_at: '2026-06-04T00:00:00.000Z',
    updated_at: '2026-06-04T00:00:00.000Z',
    completed_at: null,
  })

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        id: 'cs_return_before_webhook',
        status: 'complete',
        payment_status: 'paid',
        mode: 'payment',
        amount_total: 1200,
        currency: 'usd',
        customer: 'cus_return_before_webhook',
        customer_details: { email: 'return@example.com' },
        client_reference_id: 'workspace-return',
        metadata: { [STRIPE_CHECKOUT_METADATA_WORKSPACE_ID]: 'workspace-return' },
        created: 1_777_500_300,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?session_id=cs_return_before_webhook`),
      env as never,
    )
    if (!response.ok) throw new Error(`expected checkout status refresh ok, received ${response.status}: ${await response.text()}`)
    const body = await response.json() as { liveVerified?: boolean; session?: Record<string, unknown> & { paymentStatus?: string } }
    if (body.liveVerified !== true || body.session?.paymentStatus !== 'paid') {
      throw new Error(`expected live Stripe status refresh to return paid session, got ${JSON.stringify(body)}`)
    }
    const publicSessionKeys = new Set(Object.keys(body.session || {}))
    for (const forbiddenKey of ['customerId', 'customerEmail', 'metadata', 'url', 'workspaceId']) {
      if (publicSessionKeys.has(forbiddenKey)) {
        throw new Error(`expected public Checkout status payload to omit ${forbiddenKey}, got ${JSON.stringify(body)}`)
      }
    }
    if (fetchCalls.length !== 1 || fetchCalls[0]?.url !== 'https://api.stripe.com/v1/checkout/sessions/cs_return_before_webhook') {
      throw new Error(`expected one Stripe Checkout retrieve call, got ${JSON.stringify(fetchCalls)}`)
    }
    const headers = new Headers(fetchCalls[0]?.init?.headers)
    if (headers.get('authorization') !== 'Bearer rk_') {
      throw new Error('expected Worker status refresh to use the server-managed Stripe key')
    }
    const stored = env.DB.stripeCheckoutSessions.get('cs_return_before_webhook')
    if (
      stored?.payment_status !== 'paid'
      || stored.status !== 'complete'
      || !stored.completed_at
      || stored.customer_email !== 'return@example.com'
      || !String(stored.metadata_json || '').includes(STRIPE_CHECKOUT_METADATA_WORKSPACE_ID)
    ) {
      throw new Error(`expected D1 checkout status to update from live Stripe retrieve, got ${JSON.stringify(stored)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerRejectsUnownedStripeCheckoutStatusLookup() {
  const env = createPaymentsEnv()
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('unowned Checkout status lookup must fail before Stripe retrieve')
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?session_id=cs_unowned_status_lookup`),
      env as never,
    )
    const body = await response.json() as { error?: string }
    if (response.status !== 404 || !String(body.error || '').includes('status not found')) {
      throw new Error(`expected unowned Checkout status lookup to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
    if (env.DB.stripeCheckoutSessions.size !== 0) {
      throw new Error(`expected unowned Checkout lookup not to write Stripe rows, got ${JSON.stringify(Array.from(env.DB.stripeCheckoutSessions.values()))}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerRejectsLegacyStripeCheckoutStatusIdAlias() {
  const env = createPaymentsEnv()
  env.DB.stripeCheckoutSessions.set('cs_legacy_status_alias', {
    id: 'cs_legacy_status_alias',
    workspace_id: 'workspace-legacy-alias',
    status: 'complete',
    payment_status: 'paid',
    mode: 'payment',
    amount_total: 1200,
    currency: 'usd',
    customer_id: null,
    customer_email: null,
    url: 'https://checkout.stripe.com/c/pay/legacy_status_alias',
    metadata_json: '{}',
    created_at: '2026-06-04T00:00:00.000Z',
    updated_at: '2026-06-04T00:00:00.000Z',
    completed_at: '2026-06-04T00:00:00.000Z',
  })
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('legacy Checkout status id alias must fail before Stripe retrieve')
    }) as typeof fetch

    const response = await worker.fetch(
      new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?id=cs_legacy_status_alias`),
      env as never,
    )
    const body = await response.json() as { error?: string }
    if (response.status !== 400 || !String(body.error || '').includes('session_id is required')) {
      throw new Error(`expected legacy Checkout status id alias to fail closed, received ${response.status}: ${JSON.stringify(body)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testAgenticGraphPaymentWorkerRejectsStripeWebhookWithBadSignature() {
  const env = createPaymentsEnv()
  const payload = JSON.stringify({
    id: 'evt_accept_payment_bad_sig',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_bad_sig', payment_status: 'paid' } },
  })
  const response = await worker.fetch(
    new Request(`https://example.com${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1777500000,v1=bad',
      },
      body: payload,
    }),
    env as never,
  )
  if (response.status !== 400) {
    throw new Error(`expected bad webhook signature to fail closed, received ${response.status}`)
  }
  if (env.DB.stripeWebhookEvents.size !== 0 || env.DB.stripeCheckoutSessions.size !== 0) {
    throw new Error('expected bad webhook signature to avoid payment writes')
  }
}
