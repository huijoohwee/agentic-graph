import fs from 'node:fs'
import path from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { AgenticPurchaseEnvelope } from 'grph-shared/payments/agenticPurchaseRuntimeContract'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LS_KEYS } from '@/lib/config.ls.keys'
import {
  createPersistedCollectionDb,
} from '@/lib/storage/persistedCollectionStore'
import {
  AGENTIC_OS_STORAGE_COLLECTION_NAMES,
  type AgenticGraphStorageDb,
  type AgenticGraphStorageRecordMap,
} from '@/lib/storage/agentic-graph-storage-db'
import { PaywallOverlay } from '@/features/payments/PaywallOverlay'
import {
  createBuyerPaymentIntentCommand,
  createPaymentSurfaceController,
} from '@/features/payments/paymentSurfaceController'
import {
  listPaymentIntentQueue,
} from '@/features/payments/paymentIntentQueue'
import type {
  PaymentApiTransport,
} from '@/features/payments/paymentApiClient'
import {
  __resetTrustedPurchaseInvocationForTests,
  getTrustedPurchaseInvocationView,
  invokeTrustedCanvasPurchase,
  submitCanvasPurchaseInvocation,
  subscribeTrustedPurchaseInvocation,
} from '@/features/payments/trustedPurchaseInvocation'
import {
  readMigratedPaymentsPaywallEnabled,
} from '@/features/payments/paymentPaywallSetting'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  installDeterministicRaf,
  mountReactRoot,
  unmountReactRoot,
  waitForFrames,
} from '@/tests/lib/reactRootHarness'

const TEST_NOW_MS = Date.parse('2026-07-29T04:00:00.000Z')
const TEST_ENVELOPE: AgenticPurchaseEnvelope = Object.freeze({
  lifecycleKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  allowedOrigins: Object.freeze(['https://merchant.example']),
  item: Object.freeze({
    query: 'noise-cancelling headphones',
    requiredAttributes: Object.freeze(['black', 'wireless']),
  }),
  quantity: 1,
  maximumTotalMinor: 20_000,
  currency: 'sgd',
  expiresAt: '2026-07-29T05:00:00.000Z',
})

const createMemoryDb = (): AgenticGraphStorageDb =>
  createPersistedCollectionDb<AgenticGraphStorageRecordMap>({
    storageKey: `kg:trusted-purchase-test:${Date.now()}:${Math.random()}`,
    persistent: false,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES],
  })

const serializeStorage = (storage: Storage): string => {
  const entries: Array<readonly [string, string | null]> = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key) entries.push([key, storage.getItem(key)] as const)
  }
  return JSON.stringify(entries.sort(([left], [right]) =>
    left.localeCompare(right)))
}

export function testTrustedPurchaseInvocationRejectsUntrustedSourcesBeforeMutation() {
  const storage = new MemoryStorage()
  const { restore } = initWindowHarness({ storage })
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  let notifications = 0
  let unsubscribe = () => undefined

  try {
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('untrusted purchase invocation performed egress')
    }) as typeof fetch
    __resetTrustedPurchaseInvocationForTests()
    useGraphStore.getState().setPaymentsPaywallEnabled(false)
    useGraphStore.getState().setFloatingPanelOpen(false)
    useGraphStore.getState().setFloatingPanelView('propsPanel')
    storage.setItem('unrelated', 'preserve')

    const beforeView = getTrustedPurchaseInvocationView()
    const beforeStorage = serializeStorage(storage)
    unsubscribe = subscribeTrustedPurchaseInvocation(() => {
      notifications += 1
    })
    const result = submitCanvasPurchaseInvocation({
      source: Object.freeze({ owner: 'agentic-graph-canvas-host' }),
      envelope: TEST_ENVELOPE,
    }, TEST_NOW_MS)
    const graph = useGraphStore.getState()

    if (!('code' in result)) {
      throw new Error(`expected fail-closed untrusted rejection, got ${JSON.stringify(result)}`)
    }
    if (result.code !== 'purchase_invocation_untrusted') {
      throw new Error(`expected fail-closed untrusted rejection, got ${JSON.stringify(result)}`)
    }
    if (
      getTrustedPurchaseInvocationView() !== beforeView
      || notifications !== 0
      || graph.paymentsPaywallEnabled
      || graph.floatingPanelOpen
      || graph.floatingPanelView !== 'propsPanel'
      || serializeStorage(storage) !== beforeStorage
      || fetchCalls !== 0
    ) {
      throw new Error('untrusted invocation mutated storage, Canvas state, lifecycle state, or egress')
    }

    const malformedResult = invokeTrustedCanvasPurchase({
      ...TEST_ENVELOPE,
      maximumTotalMinor: 0,
    }, TEST_NOW_MS)
    if (
      !('code' in malformedResult)
      || malformedResult.code !== 'purchase_instruction_rejected'
      || getTrustedPurchaseInvocationView() !== beforeView
      || notifications !== 0
      || useGraphStore.getState().paymentsPaywallEnabled
      || serializeStorage(storage) !== beforeStorage
      || fetchCalls !== 0
    ) {
      throw new Error('malformed trusted instruction mutated state, storage, lifecycle state, or egress')
    }

    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/features/payments/trustedPurchaseInvocation.ts',
      ),
      'utf8',
    )
    for (const forbidden of [
      'addEventListener',
      'dispatchEvent',
      'postMessage',
      'location.search',
      'localStorage',
      'sessionStorage',
      'fetch(',
    ]) {
      if (source.includes(forbidden)) {
        throw new Error(`trusted invocation boundary contains forbidden ambient channel ${forbidden}`)
      }
    }
  } finally {
    unsubscribe()
    __resetTrustedPurchaseInvocationForTests()
    globalThis.fetch = originalFetch
    restore()
  }
}

export async function testTrustedPurchaseInvocationRendersFourBlockedPhasesWithZeroEgress() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  const db = createMemoryDb()
  let root: ReturnType<typeof createRoot> | null = null
  let providerCalls = 0
  const transport: PaymentApiTransport = Object.freeze({
    async readBuyerProduct() {
      providerCalls += 1
      throw new Error('trusted purchase preview must not discover a product')
    },
    async submitIntent() {
      providerCalls += 1
      throw new Error('trusted purchase preview must not create an intent')
    },
    async reconcileIntent() {
      providerCalls += 1
      throw new Error('trusted purchase preview must not reconcile an intent')
    },
  })
  const controller = createPaymentSurfaceController({
    db,
    transport,
    isOnline: () => true,
    nowMs: () => TEST_NOW_MS,
    windowTarget: null,
  })

  try {
    installDeterministicRaf(dom.window)
    __resetTrustedPurchaseInvocationForTests()
    useGraphStore.getState().setPaymentsPaywallEnabled(false)
    useGraphStore.getState().setFloatingPanelOpen(false)
    useGraphStore.getState().setFloatingPanelView('propsPanel')

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(PaywallOverlay, {
        portalTarget: container,
        controller,
      } as never),
      { window: dom.window, frames: 2 },
    )

    let invocationResult: ReturnType<typeof invokeTrustedCanvasPurchase> | null =
      null
    await act(async () => {
      invocationResult = invokeTrustedCanvasPurchase(
        TEST_ENVELOPE,
        TEST_NOW_MS,
      )
      await waitForFrames(dom.window, 4)
    })

    if (!invocationResult?.ok || invocationResult.idempotentReplay) {
      throw new Error(`expected trusted purchase acceptance, got ${JSON.stringify(invocationResult)}`)
    }
    const graph = useGraphStore.getState()
    if (
      !graph.paymentsPaywallEnabled
      || !graph.floatingPanelOpen
      || graph.floatingPanelView !== 'chat'
    ) {
      throw new Error('trusted direct import did not open the existing Chat Paywall')
    }

    const phaseElements = Array.from(
      container.querySelectorAll('[data-agentic-purchase-phase]'),
    ) as Element[]
    const phaseLabels = phaseElements.map(element =>
      (element.textContent || '').trim())
    for (const label of ['Funding', 'Discovery', 'Issuance', 'Execution']) {
      if (!phaseLabels.some(text => text.includes(label))) {
        throw new Error(`agentic purchase readiness missed ${label}: ${JSON.stringify(phaseLabels)}`)
      }
    }
    if (
      phaseElements.length !== 4
      || phaseElements.some(element =>
        element.getAttribute('data-agentic-purchase-readiness') !== 'blocked')
    ) {
      throw new Error('all four purchase phases must render blocked until external dependencies exist')
    }
    const text = container.textContent || ''
    if (
      !text.includes('Fail closed')
      || !text.includes('cannot fund, discover, issue, authorize, or execute')
    ) {
      throw new Error(`missing fail-closed readiness copy: ${JSON.stringify(text)}`)
    }
    const checkoutButton = (Array.from(
      container.querySelectorAll('button'),
    ) as HTMLButtonElement[]).find(button =>
      (button.textContent || '').trim() === 'Open Checkout')
    if (!checkoutButton?.disabled || providerCalls !== 0) {
      throw new Error(`trusted preview exposed payment action or provider egress: ${JSON.stringify({
        checkoutDisabled: checkoutButton?.disabled,
        providerCalls,
      })}`)
    }

    const queueBeforeSuppressedCalls = await listPaymentIntentQueue(db)
    let transientOperationCalls = 0
    await controller.loadBuyerProduct()
    await controller.confirm(createBuyerPaymentIntentCommand({
      clientIntentKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe9',
      amountMinor: 1_250,
      currency: 'sgd',
      settlementAsset: 'fiat',
    }))
    await controller.reconcile()
    await controller.retry()
    await controller.runTransientRequest(async () => {
      transientOperationCalls += 1
    }).catch(() => undefined)
    const queueAfterSuppressedCalls = await listPaymentIntentQueue(db)
    if (
      providerCalls !== 0
      || transientOperationCalls !== 0
      || queueAfterSuppressedCalls.length !== queueBeforeSuppressedCalls.length
    ) {
      throw new Error('active lifecycle did not suppress every ordinary controller mutation path')
    }

    const closeButton = (Array.from(
      container.querySelectorAll('button'),
    ) as HTMLButtonElement[]).find(button =>
      (button.textContent || '').trim() === 'Close')
    if (!closeButton) throw new Error('Paywall close action is missing')
    await act(async () => {
      closeButton.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
      )
      await waitForFrames(dom.window, 2)
    })
    const closedView = getTrustedPurchaseInvocationView()
    if (
      useGraphStore.getState().paymentsPaywallEnabled
      || !closedView.lifecycle?.cancelled
      || closedView.lifecycle.providerCallCount !== 0
      || closedView.lifecycle.financialCallCount !== 0
      || providerCalls !== 0
    ) {
      throw new Error('closing the trusted lifecycle did not remain zero-call and pre-financial')
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    __resetTrustedPurchaseInvocationForTests()
    await db.db.remove().catch(() => undefined)
    restoreDom()
    restoreWindow()
  }
}

export function testPaymentsPaywallStorageKeyMigratesOnceToGenericOwner() {
  const legacyKey = 'kg:payments:stripe:paywallEnabled'
  const storage = new MemoryStorage()
  storage.setItem(legacyKey, 'true')

  const migrated = readMigratedPaymentsPaywallEnabled(storage, false)
  if (
    migrated !== true
    || storage.getItem(LS_KEYS.paymentsPaywallEnabled) !== '1'
    || storage.getItem(legacyKey) !== null
  ) {
    throw new Error('legacy Stripe Paywall preference did not migrate to the generic owner')
  }

  storage.setItem(legacyKey, 'false')
  const reread = readMigratedPaymentsPaywallEnabled(storage, false)
  if (
    reread !== true
    || storage.getItem(LS_KEYS.paymentsPaywallEnabled) !== '1'
    || storage.getItem(legacyKey) !== null
  ) {
    throw new Error('legacy Paywall preference overrode the already-migrated generic key')
  }

  const ownerSources = [
    'src/lib/config.ls.keys.ts',
    'src/hooks/store/store-types/graph-state-chat-import.ts',
    'src/hooks/store/uiSliceInitialState.ts',
    'src/features/settings/registry-payments.ts',
    'src/features/payments/PaywallOverlay.tsx',
  ].map(file => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'))
    .join('\n')
  for (const staleName of [
    'paymentsStripePaywallEnabled',
    'setPaymentsStripePaywallEnabled',
    'payments.stripe.paywallEnabled',
  ]) {
    if (ownerSources.includes(staleName)) {
      throw new Error(`generic Paywall owner retained stale Stripe symbol ${staleName}`)
    }
  }
}
