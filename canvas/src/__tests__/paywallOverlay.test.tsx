import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { PaywallOverlay } from '@/features/payments/PaywallOverlay'
import { buildStripeCheckoutReturnUrls } from '@/features/payments/stripeCheckout'
import {
  PAYMENT_DISCOVERY_API_PATH,
  PAYMENT_INTENT_API_PATH,
  createPaymentApiTransport,
} from '@/features/payments/paymentApiClient'
import {
  __resetPaymentSurfaceControllerForTests,
  createPaymentSurfaceController,
} from '@/features/payments/paymentSurfaceController'
import {
  createPersistedCollectionDb,
} from '@/lib/storage/persistedCollectionStore'
import {
  AGENTICGRAPH_STORAGE_COLLECTION_NAMES,
  type AgenticGraphStorageDb,
  type AgenticGraphStorageRecordMap,
} from '@/lib/storage/agenticgraphStorageDb'

const waitUntil = async (predicate: () => boolean, timeoutMs = 1200): Promise<void> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('timed out waiting for paywall checkout state')
}

export function testPaywallOverlayBuildsNeutralStripeCheckoutReturnUrls() {
  const urls = buildStripeCheckoutReturnUrls('https://airvio.co/agenticgraph?doc=alpha&stripeCheckout=cancel&session_id=cs_old#chat')
  if (urls.successUrl !== 'https://airvio.co/agenticgraph?doc=alpha&stripeCheckout=success#chat') {
    throw new Error(`expected success return URL to remove stale checkout params, got ${JSON.stringify(urls.successUrl)}`)
  }
  if (urls.cancelUrl !== 'https://airvio.co/agenticgraph?doc=alpha&stripeCheckout=cancel#chat') {
    throw new Error(`expected cancel return URL to remove stale session id, got ${JSON.stringify(urls.cancelUrl)}`)
  }
}

export async function testPaywallOverlayOpensFromPaymentsToggle() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installDeterministicRaf(dom.window)
    __resetPaymentSurfaceControllerForTests()
    globalThis.fetch = (async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({ buyerProduct: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setPaymentsPaywallEnabled(false)
    useGraphStore.getState().setFloatingPanelOpen(false)
    useGraphStore.getState().setFloatingPanelView('propsPanel')
    useGraphStore.getState().setPaymentsStripeCheckoutUrl('')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root, React.createElement(PaywallOverlay, { portalTarget: container } as never), {
      window: dom.window,
      frames: 2,
    })

    const before = container.textContent || ''
    if (before.includes('Paywall')) {
      throw new Error(`expected paywall overlay to be closed by default, got ${JSON.stringify(before)}`)
    }
    if (fetchCalls !== 0) {
      throw new Error('a closed paywall must not perform payment discovery egress')
    }

    await act(async () => {
      useGraphStore.getState().setPaymentsPaywallEnabled(true)
      await waitForFrames(dom.window, 3)
    })

    const enabledButClosed = container.textContent || ''
    if (enabledButClosed.includes('Paywall')) {
      throw new Error(`expected paywall overlay to stay hidden when floating panel is closed, got ${JSON.stringify(enabledButClosed)}`)
    }
    if (fetchCalls !== 0) {
      throw new Error('a hidden paywall must not perform payment discovery egress')
    }

    await act(async () => {
      useGraphStore.getState().setFloatingPanelOpen(true)
      useGraphStore.getState().setFloatingPanelView('chat')
      await waitForFrames(dom.window, 3)
    })

    const after = container.textContent || ''
    if (!after.includes('Paywall')) {
      throw new Error(`expected paywall overlay to render when enabled and chat panel is open, got ${JSON.stringify(after)}`)
    }
    if (!after.includes('Open Checkout')) {
      throw new Error(`expected paywall overlay to include Stripe Checkout controls, got ${JSON.stringify(after)}`)
    }
    await waitUntil(() => fetchCalls === 1)
  } finally {
    globalThis.fetch = originalFetch
    __resetPaymentSurfaceControllerForTests()
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testPaywallOverlayGeneratesServerManagedCheckout() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  let root: ReturnType<typeof createRoot> | null = null
  let db: AgenticGraphStorageDb | null = null
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const redirectedUrls: string[] = []
  const eventLog: string[] = []
  const originalAnchorClickDescriptor = Object.getOwnPropertyDescriptor(dom.window.HTMLAnchorElement.prototype, 'click')

  try {
    installDeterministicRaf(dom.window)
    dom.window.history.replaceState(null, '', '/agenticgraph?doc=payment&stripeCheckout=success&session_id=cs_stale#paywall')
    Object.defineProperty(dom.window, 'open', {
      value: (url: string) => {
        throw new Error(`paywall checkout must use same-window redirect, got popup ${String(url || '')}`)
      },
      configurable: true,
    })
    Object.defineProperty(dom.window.HTMLAnchorElement.prototype, 'click', {
      value(this: HTMLAnchorElement) {
        redirectedUrls.push(this.href)
        eventLog.push(`redirect:${this.href}`)
      },
      configurable: true,
    })
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      eventLog.push(`fetch:${String(url)}`)
      fetchCalls.push({ url: String(url), init })
      if (String(url) === PAYMENT_DISCOVERY_API_PATH) {
        return new Response(JSON.stringify({
          buyerProduct: {
            amountMinor: 1_250,
            currency: 'sgd',
            settlementAsset: 'fiat',
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const command = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({
        ok: true,
        intent: {
          intentId: `pay_${String(command.clientIntentKey || '')}`,
          state: 'pending_provider',
          amountMinor: command.amountMinor,
          currency: command.currency,
        },
        rail: 'stripe',
        instruction: {
          kind: 'hosted_checkout',
          url: 'https://checkout.stripe.com/c/pay/cs_paywall_generated',
        },
        receiptRecord: null,
        idempotentReplay: false,
        modelCallCount: 0,
        modelCostUsd: 0,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setPaymentsPaywallEnabled(true)
    useGraphStore.getState().setFloatingPanelOpen(true)
    useGraphStore.getState().setFloatingPanelView('chat')
    useGraphStore.getState().setPaymentsStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_stale_browser_setting')
    db = createPersistedCollectionDb<AgenticGraphStorageRecordMap>({
      storageKey: `kg:paywall-runtime:${Date.now()}:${Math.random()}`,
      persistent: false,
      collectionNames: [...AGENTICGRAPH_STORAGE_COLLECTION_NAMES],
    })
    const controller = createPaymentSurfaceController({
      db,
      transport: createPaymentApiTransport(globalThis.fetch),
      isOnline: () => true,
      windowTarget: null,
    })

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root, React.createElement(PaywallOverlay, {
      portalTarget: container,
      controller,
    } as never), {
      window: dom.window,
      frames: 2,
    })
    await waitUntil(() =>
      fetchCalls.some(call => call.url === PAYMENT_DISCOVERY_API_PATH))
    await waitUntil(() => {
      const candidate = (Array.from(
        container.querySelectorAll('button'),
      ) as HTMLButtonElement[])
        .find(button => (button.textContent || '').includes('Open Checkout'))
      return Boolean(candidate && !(candidate as HTMLButtonElement).disabled)
    })

    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
    const button = buttons.find(candidate => (candidate.textContent || '').includes('Open Checkout'))
    if (!button) {
      throw new Error(`expected paywall overlay to render Open Checkout button, got ${JSON.stringify(container.textContent || '')}`)
    }
    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 2)
    })
    await waitUntil(() => redirectedUrls.length > 0)

    if (
      fetchCalls.length !== 2
      || fetchCalls[0]?.url !== PAYMENT_DISCOVERY_API_PATH
      || fetchCalls[0]?.init?.method !== 'GET'
      || fetchCalls[1]?.url !== PAYMENT_INTENT_API_PATH
      || fetchCalls[1]?.init?.method !== 'POST'
    ) {
      throw new Error(`expected discovery then neutral intent creation, got ${JSON.stringify(fetchCalls.map(call => call.url))}`)
    }
    const headers = fetchCalls[1]?.init?.headers as Record<string, string> | undefined
    if (headers?.Authorization) {
      throw new Error('expected buyer intent creation not to send browser Authorization headers')
    }
    const body = JSON.parse(String(fetchCalls[1]?.init?.body || '{}')) as Record<string, unknown>
    if (
      body.amountMinor !== 1_250
      || body.currency !== 'sgd'
      || body.settlementAsset !== 'fiat'
      || body.origin !== 'buyer'
      || !/^[0-9a-f-]{36}$/i.test(String(body.clientIntentKey || ''))
    ) {
      throw new Error(`expected command derived only from server product, got ${JSON.stringify(body)}`)
    }
    if (redirectedUrls[0] !== 'https://checkout.stripe.com/c/pay/cs_paywall_generated') {
      throw new Error(`expected paywall to redirect this window to hosted Checkout URL, got ${JSON.stringify(redirectedUrls)}`)
    }
    if (redirectedUrls.includes('https://checkout.stripe.com/c/pay/cs_stale_browser_setting')) {
      throw new Error(`expected paywall to ignore stale browser-stored Checkout URLs, got ${JSON.stringify(redirectedUrls)}`)
    }
    if (
      eventLog[0] !== `fetch:${PAYMENT_DISCOVERY_API_PATH}`
      || eventLog[1] !== `fetch:${PAYMENT_INTENT_API_PATH}`
      || eventLog[2] !== 'redirect:https://checkout.stripe.com/c/pay/cs_paywall_generated'
    ) {
      throw new Error(`expected server product, neutral intent, then redirect, got ${JSON.stringify(eventLog)}`)
    }
    if ((container.textContent || '').includes('cs_paywall_generated')) {
      throw new Error(`expected paywall overlay not to render hosted Checkout URLs, got ${JSON.stringify(container.textContent || '')}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    if (originalAnchorClickDescriptor) {
      Object.defineProperty(dom.window.HTMLAnchorElement.prototype, 'click', originalAnchorClickDescriptor)
    }
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    await db?.db.remove().catch(() => undefined)
    restoreDom()
    restoreWindow()
  }
}
