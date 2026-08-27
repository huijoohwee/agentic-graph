import {
  buildStripeCheckoutReturnUrls,
  createStripeHostedCheckoutSessionUrl,
  readStripeCheckoutSessionStatus,
  redirectToStripeHostedCheckoutUrl,
} from '@/features/payments/stripeCheckout'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { StripeCheckoutReturnRuntime } from '@/features/payments/StripeCheckoutReturnRuntime'
import { parseStripeCheckoutReturnSearch } from '@/features/payments/stripeCheckoutReturn'
import {
  STRIPE_CHECKOUT_RETURN_PARAM,
  STRIPE_CHECKOUT_SESSION_ID_PARAM,
  STRIPE_PAYMENT_ROUTE_PATHS,
} from 'grph-shared/payments/stripePaymentSsot'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LS_KEYS } from '@/lib/config.ls.keys'

const waitUntil = async (predicate: () => boolean, timeoutMs = 1200): Promise<void> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('timed out waiting for Stripe checkout return state')
}

export function testStripeCheckoutRedirectUsesCurrentWindowHttpsUrl() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const clicked: Array<{ href: string; target: string; rel: string }> = []
  const originalClickDescriptor = Object.getOwnPropertyDescriptor(dom.window.HTMLAnchorElement.prototype, 'click')

  try {
    Object.defineProperty(dom.window.HTMLAnchorElement.prototype, 'click', {
      value(this: HTMLAnchorElement) {
        clicked.push({
          href: this.href,
          target: this.target,
          rel: this.rel,
        })
      },
      configurable: true,
    })

    redirectToStripeHostedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_current_window', dom.window.document)

    const redirect = clicked[0]
    if (!redirect || redirect.href !== 'https://checkout.stripe.com/c/pay/cs_current_window') {
      throw new Error(`expected hosted Checkout redirect URL, got ${JSON.stringify(clicked)}`)
    }
    if (redirect.target !== '_self' || redirect.rel !== 'noopener') {
      throw new Error(`expected same-window noopener redirect, got ${JSON.stringify(redirect)}`)
    }
    if (dom.window.document.body.querySelector('a')) {
      throw new Error('expected transient Checkout redirect anchor to be removed')
    }

    let rejectedMessage = ''
    try {
      redirectToStripeHostedCheckoutUrl('javascript:alert(1)', dom.window.document)
    } catch (error) {
      rejectedMessage = error instanceof Error ? error.message : String(error)
    }
    if (rejectedMessage !== 'Stripe Checkout redirect URL must be HTTPS.') {
      throw new Error(`expected unsafe redirect URL to be rejected, got ${JSON.stringify(rejectedMessage)}`)
    }
  } finally {
    if (originalClickDescriptor) {
      Object.defineProperty(dom.window.HTMLAnchorElement.prototype, 'click', originalClickDescriptor)
    }
    restoreDom()
  }
}

export function testStripeCheckoutUrlStaysSessionOnly() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  try {
    storage.setItem(LS_KEYS.paymentsStripeCheckoutUrl, JSON.stringify('https://checkout.stripe.com/c/pay/cs_persisted_stale'))
    useGraphStore.getState().setPaymentsStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_session_only')

    if (useGraphStore.getState().paymentsStripeCheckoutUrl !== 'https://checkout.stripe.com/c/pay/cs_session_only') {
      throw new Error(`expected Checkout URL to remain available for the current runtime, got ${JSON.stringify(useGraphStore.getState().paymentsStripeCheckoutUrl)}`)
    }
    if (storage.getItem(LS_KEYS.paymentsStripeCheckoutUrl) !== null) {
      throw new Error(`expected Checkout URL setter to remove stale localStorage value, got ${JSON.stringify(storage.getItem(LS_KEYS.paymentsStripeCheckoutUrl))}`)
    }

    useGraphStore.getState().setPaymentsStripeCheckoutUrl('')
    if (useGraphStore.getState().paymentsStripeCheckoutUrl !== '') {
      throw new Error(`expected Checkout URL clear to update runtime state, got ${JSON.stringify(useGraphStore.getState().paymentsStripeCheckoutUrl)}`)
    }
  } finally {
    restoreWindow()
  }
}

export async function testStripeCheckoutUsesServerManagedRouteOnly() {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return {
        ok: true,
        json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/test_123' }),
      } as Response
    }) as typeof fetch

    const result = await createStripeHostedCheckoutSessionUrl({
      successUrl: 'http://localhost:5173/?stripeCheckout=success&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:5173/?stripeCheckout=cancel',
    })

    if (result.url !== 'https://checkout.stripe.com/c/pay/test_123') {
      throw new Error(`expected hosted Checkout url, got ${JSON.stringify(result.url)}`)
    }
    if (fetchCalls.length !== 1) {
      throw new Error(`expected one fetch call, got ${fetchCalls.length}`)
    }
    if (fetchCalls[0]?.url !== STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession) {
      throw new Error(`expected server-managed checkout route, got ${JSON.stringify(fetchCalls[0]?.url)}`)
    }
    const headers = fetchCalls[0]?.init?.headers as Record<string, string> | undefined
    if (headers?.Authorization) {
      throw new Error('expected no Authorization header from browser checkout helper')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testStripeCheckoutCarriesAgenticCommerceSessionIdToServerRoute() {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return {
        ok: true,
        json: async () => ({ id: 'cs_test_agentic', url: 'https://checkout.stripe.com/c/pay/test_agentic' }),
      } as Response
    }) as typeof fetch

    await createStripeHostedCheckoutSessionUrl({
      successUrl: 'http://localhost:5173/?stripeCheckout=success',
      cancelUrl: 'http://localhost:5173/?stripeCheckout=cancel',
      workspaceId: 'workspace-payment',
      agenticCommerceSessionId: 'acp_checkout_client',
      expectedAmountTotal: 1200,
      expectedCurrency: 'usd',
    })

    if (fetchCalls.length !== 1 || fetchCalls[0]?.url !== STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession) {
      throw new Error(`expected one server-managed checkout route call, got ${JSON.stringify(fetchCalls.map(call => call.url))}`)
    }
    const body = JSON.parse(String(fetchCalls[0]?.init?.body || '{}')) as Record<string, unknown>
    if (
      body.agenticCommerceSessionId !== 'acp_checkout_client'
      || body.workspaceId !== 'workspace-payment'
      || body.expectedAmountTotal !== 1200
      || body.expectedCurrency !== 'usd'
    ) {
      throw new Error(`expected ACP ids and expected total in Worker request body, got ${JSON.stringify(body)}`)
    }
    const headers = fetchCalls[0]?.init?.headers as Record<string, string> | undefined
    if (headers?.Authorization) {
      throw new Error('expected no Authorization header from browser checkout helper')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testStripeCheckoutReportsWorkerErrorMessage() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'Missing server-managed Stripe key.' }),
    }) as Response) as typeof fetch

    let message = ''
    try {
      await createStripeHostedCheckoutSessionUrl({
        successUrl: 'http://localhost:5173/?stripeCheckout=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'http://localhost:5173/?stripeCheckout=cancel',
      })
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    if (message !== 'Missing server-managed Stripe key.') {
      throw new Error(`expected Worker error string to surface, got ${JSON.stringify(message)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testStripeCheckoutStatusUsesServerManagedRouteOnly() {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return {
        ok: true,
        json: async () => ({
          session: {
            id: 'cs_test_123',
            status: 'complete',
            paymentStatus: 'paid',
            mode: 'payment',
            amountTotal: 1200,
            currency: 'usd',
            createdAt: '2026-06-04T00:00:00.000Z',
            updatedAt: '2026-06-04T00:00:01.000Z',
            completedAt: '2026-06-04T00:00:01.000Z',
          },
        }),
      } as Response
    }) as typeof fetch

    const session = await readStripeCheckoutSessionStatus('cs_test_123')
    if (session.paymentStatus !== 'paid') {
      throw new Error(`expected paid checkout status, got ${JSON.stringify(session)}`)
    }
    if (fetchCalls.length !== 1) {
      throw new Error(`expected one fetch call, got ${fetchCalls.length}`)
    }
    const calledUrl = fetchCalls[0]?.url || ''
    if (!calledUrl.startsWith(`${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?`) || !calledUrl.includes(`${STRIPE_CHECKOUT_SESSION_ID_PARAM}=cs_test_123`)) {
      throw new Error(`expected server-managed checkout status route, got ${JSON.stringify(calledUrl)}`)
    }
    const headers = fetchCalls[0]?.init?.headers as Record<string, string> | undefined
    if (headers?.Authorization) {
      throw new Error('expected no Authorization header from browser checkout status helper')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export function testStripeCheckoutUsesSharedReturnQueryKeys() {
  const checkoutUrls = buildStripeCheckoutReturnUrls(
    `https://airvio.co/agenticgraph?doc=alpha&${STRIPE_CHECKOUT_RETURN_PARAM}=cancel&${STRIPE_CHECKOUT_SESSION_ID_PARAM}=cs_old#chat`,
  )
  const successUrl = new URL(checkoutUrls.successUrl)
  const cancelUrl = new URL(checkoutUrls.cancelUrl)
  if (
    successUrl.searchParams.get(STRIPE_CHECKOUT_RETURN_PARAM) !== 'success'
    || cancelUrl.searchParams.get(STRIPE_CHECKOUT_RETURN_PARAM) !== 'cancel'
    || successUrl.searchParams.has(STRIPE_CHECKOUT_SESSION_ID_PARAM)
    || cancelUrl.searchParams.has(STRIPE_CHECKOUT_SESSION_ID_PARAM)
  ) {
    throw new Error(`expected shared Stripe return query keys to shape checkout URLs, got ${JSON.stringify(checkoutUrls)}`)
  }
  const parsed = parseStripeCheckoutReturnSearch(`?${STRIPE_CHECKOUT_RETURN_PARAM}=success&${STRIPE_CHECKOUT_SESSION_ID_PARAM}=cs_shared_keys`)
  if (!parsed || parsed.kind !== 'success' || parsed.sessionId !== 'cs_shared_keys') {
    throw new Error(`expected shared Stripe return query keys to parse checkout returns, got ${JSON.stringify(parsed)}`)
  }
}

export async function testStripeCheckoutReturnRuntimeVerifiesPaidStatus() {
  const parsed = parseStripeCheckoutReturnSearch('?stripeCheckout=success&session_id=cs_test_paid')
  if (!parsed || parsed.kind !== 'success' || parsed.sessionId !== 'cs_test_paid') {
    throw new Error(`expected Stripe success return parser to preserve Session id, got ${JSON.stringify(parsed)}`)
  }

  const { dom, restore: restoreDom } = initJsdomHarness()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const originalFetch = globalThis.fetch
  let root: ReturnType<typeof createRoot> | null = null
  const fetchCalls: string[] = []

  try {
    dom.window.history.replaceState(null, '', '/?stripeCheckout=success&session_id=cs_test_paid#paid')
    globalThis.fetch = (async (url: string | URL | Request) => {
      fetchCalls.push(String(url))
      return {
        ok: true,
        json: async () => ({
          session: {
            id: 'cs_test_paid',
            status: 'complete',
            paymentStatus: 'paid',
            mode: 'payment',
            amountTotal: 1200,
            currency: 'usd',
            createdAt: '2026-06-04T00:00:00.000Z',
            updatedAt: '2026-06-04T00:00:01.000Z',
            completedAt: '2026-06-04T00:00:01.000Z',
          },
        }),
      } as Response
    }) as typeof fetch

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setPaymentsPaywallEnabled(true)
    useGraphStore.getState().setPaymentsStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_paid')

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(StripeCheckoutReturnRuntime, { search: dom.window.location.search }), {
      window: dom.window,
      frames: 2,
    })
    await waitUntil(() => useGraphStore.getState().paymentsPaywallEnabled === false)

    const state = useGraphStore.getState()
    if (state.paymentsStripeCheckoutUrl !== '') {
      throw new Error(`expected paid checkout return to clear stale Checkout URL, got ${JSON.stringify(state.paymentsStripeCheckoutUrl)}`)
    }
    if (!state.uiToasts.some(toast => toast.kind === 'success' && toast.message.includes('Stripe Checkout verified'))) {
      throw new Error(`expected paid checkout return success toast, got ${JSON.stringify(state.uiToasts)}`)
    }
    if (fetchCalls.length !== 1 || !fetchCalls[0].startsWith(`${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?`)) {
      throw new Error(`expected status lookup through server-managed route, got ${JSON.stringify(fetchCalls)}`)
    }
    if (dom.window.location.search.includes('stripeCheckout') || dom.window.location.search.includes('session_id')) {
      throw new Error(`expected checkout return params to be consumed, got ${dom.window.location.href}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreWindow()
    restoreDom()
  }
}

export async function testStripeCheckoutReturnRuntimeRejectsCompleteUnpaidStatus() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const originalFetch = globalThis.fetch
  let root: ReturnType<typeof createRoot> | null = null

  try {
    dom.window.history.replaceState(null, '', '/?stripeCheckout=success&session_id=cs_test_unpaid#unpaid')
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        session: {
          id: 'cs_test_unpaid',
          status: 'complete',
          paymentStatus: 'unpaid',
          mode: 'payment',
          amountTotal: 1200,
          currency: 'usd',
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:01.000Z',
          completedAt: null,
        },
      }),
    }) as Response) as typeof fetch

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setPaymentsPaywallEnabled(true)
    useGraphStore.getState().setPaymentsStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_unpaid')

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(StripeCheckoutReturnRuntime, { search: dom.window.location.search }), {
      window: dom.window,
      frames: 2,
    })
    await waitUntil(() => useGraphStore.getState().uiToasts.some(toast => toast.kind === 'warning' && toast.message.includes('unpaid')))

    const state = useGraphStore.getState()
    if (state.paymentsPaywallEnabled !== true || state.paymentsStripeCheckoutUrl !== '') {
      throw new Error(`expected complete/unpaid checkout to stay locked and clear the stale Checkout URL, got ${JSON.stringify({
        paywall: state.paymentsPaywallEnabled,
        checkoutUrl: state.paymentsStripeCheckoutUrl,
      })}`)
    }
    if (state.uiToasts.some(toast => toast.kind === 'success' && toast.message.includes('verified'))) {
      throw new Error(`expected complete/unpaid checkout not to show verified toast, got ${JSON.stringify(state.uiToasts)}`)
    }
    if (dom.window.location.search.includes('stripeCheckout') || dom.window.location.search.includes('session_id')) {
      throw new Error(`expected checkout return params to be consumed, got ${dom.window.location.href}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreWindow()
    restoreDom()
  }
}

export async function testStripeCheckoutReturnRuntimeKeepsPaywallOnCancel() {
  const parsed = parseStripeCheckoutReturnSearch('?stripeCheckout=cancel&session_id=cs_test_cancelled')
  if (!parsed || parsed.kind !== 'cancel' || parsed.sessionId !== 'cs_test_cancelled') {
    throw new Error(`expected Stripe cancel return parser to preserve optional Session id, got ${JSON.stringify(parsed)}`)
  }

  const { dom, restore: restoreDom } = initJsdomHarness()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const originalFetch = globalThis.fetch
  let root: ReturnType<typeof createRoot> | null = null

  try {
    dom.window.history.replaceState(null, '', '/?stripeCheckout=cancel&session_id=cs_test_cancelled')
    globalThis.fetch = (async () => {
      throw new Error('cancelled checkout returns must not read paid status')
    }) as typeof fetch

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setPaymentsPaywallEnabled(true)
    useGraphStore.getState().setPaymentsStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_cancelled')

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      await mountReactRoot(root, React.createElement(StripeCheckoutReturnRuntime, { search: dom.window.location.search }), {
        window: dom.window,
        frames: 2,
      })
      await waitForFrames(dom.window, 2)
    })

    const state = useGraphStore.getState()
    if (state.paymentsPaywallEnabled !== true || state.paymentsStripeCheckoutUrl !== '') {
      throw new Error(`expected cancelled checkout to stay locked and clear the stale Checkout URL, got ${JSON.stringify({
        paywall: state.paymentsPaywallEnabled,
        url: state.paymentsStripeCheckoutUrl,
      })}`)
    }
    if (!state.uiToasts.some(toast => toast.kind === 'warning' && toast.message.includes('cancelled'))) {
      throw new Error(`expected checkout cancellation warning toast, got ${JSON.stringify(state.uiToasts)}`)
    }
    if (dom.window.location.search.includes('stripeCheckout') || dom.window.location.search.includes('session_id')) {
      throw new Error(`expected checkout cancellation params to be consumed, got ${dom.window.location.href}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreWindow()
    restoreDom()
  }
}
