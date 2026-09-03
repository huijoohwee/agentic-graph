import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PAYMENT_SURFACE_STATES,
  listPaymentSurfaceStatePresentations,
  type PaymentIntentCommand,
  type PaymentSurfaceSnapshot,
} from 'grph-shared/payments/paymentRuntimeContract'
import {
  createPersistedCollectionDb,
} from '@/lib/storage/persistedCollectionStore'
import {
  AGENTIC_OS_STORAGE_COLLECTION_NAMES,
  type AgenticGraphStorageDb,
  type AgenticGraphStorageRecordMap,
} from '@/lib/storage/agentic-graph-storage-db'
import { PaymentSurfaceView } from '@/features/payments/PaymentSurfaceView'
import {
  PAYMENT_RECONCILIATION_BACKOFF_MS,
} from '@/features/payments/paymentReconciler'
import {
  createPaymentSurfaceController,
} from '@/features/payments/paymentSurfaceController'
import type { PaymentApiTransport } from '@/features/payments/paymentApiClient'

const TEST_CLIENT_INTENT_KEY = 'a1b2c3d4-e5f6-4a7b-8c9d-a1b2c3d4e5f6'

const createMemoryDb = (): AgenticGraphStorageDb =>
  createPersistedCollectionDb<AgenticGraphStorageRecordMap>({
    storageKey: `kg:payment-surface-test:${Date.now()}:${Math.random()}`,
    persistent: false,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES],
  })

const waitUntil = async (
  predicate: () => boolean,
  timeoutMs = 1_200,
): Promise<void> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for payment surface state')
}

const surfaceSnapshots = (): PaymentSurfaceSnapshot[] => {
  const presentations = new Map(
    listPaymentSurfaceStatePresentations().map(entry => [entry.state, entry]),
  )
  return PAYMENT_SURFACE_STATES.map(state => {
    const presentation = presentations.get(state)
    if (!presentation) throw new Error(`missing presentation for ${state}`)
    return Object.freeze({
      clientIntentKey: state === 'idle' ? null : TEST_CLIENT_INTENT_KEY,
      state,
      amountMinor: state === 'idle' ? null : 1_250,
      currency: state === 'idle' ? null : 'sgd',
      rail: state === 'idle' || state === 'queued_offline' ? null : 'stripe',
      instruction: null,
      label: presentation.label,
      nextAction: presentation.nextAction,
      buyerSafeReason: state === 'failed'
        ? 'The payment could not be completed. No provider details were exposed.'
        : null,
    })
  })
}

export function testPaymentSurfaceRendersTenAccessibleStates() {
  const snapshots = surfaceSnapshots()
  if (snapshots.length !== 10) throw new Error(`expected ten states, got ${snapshots.length}`)
  const distinctLabels = new Set(snapshots.map(snapshot => snapshot.label))
  if (distinctLabels.size !== 10) {
    throw new Error(`expected distinct state labels, got ${JSON.stringify([...distinctLabels])}`)
  }

  for (const snapshot of snapshots) {
    const html = renderToStaticMarkup(
      <PaymentSurfaceView
        snapshot={snapshot}
        requestInFlight={false}
        receipt={null}
        receiptError={null}
        textSizeClass="text-xs"
        onPrimaryAction={() => undefined}
        onCloseReceipt={() => undefined}
      />,
    )
    for (const required of [
      'role="status"',
      'aria-live="polite"',
      `data-payment-state="${snapshot.state}"`,
      snapshot.label,
      snapshot.nextAction,
      'type="button"',
    ]) {
      if (!html.includes(required)) {
        throw new Error(`state ${snapshot.state} missed accessible contract ${required}`)
      }
    }
    if (snapshot.state === 'queued_offline') {
      if (
        !html.includes('Held on this device')
        || !html.includes('Will submit when this device reconnects')
        || !html.includes('No provider object or payment instruction was created while offline.')
      ) {
        throw new Error(`queued_offline copy is incomplete: ${html}`)
      }
    }
    if (
      snapshot.state === 'refunded'
      && (
        !html.includes('Refunded')
        || !html.includes('View refund receipt')
      )
    ) {
      throw new Error(`refunded copy is incomplete: ${html}`)
    }
  }

  const idleSnapshot = snapshots.find(snapshot => snapshot.state === 'idle')
  if (!idleSnapshot) throw new Error('missing idle payment surface state')
  const zeroDecimalHtml = renderToStaticMarkup(
    <PaymentSurfaceView
      snapshot={idleSnapshot}
      buyerProduct={{
        amountMinor: 1_250,
        currency: 'jpy',
        settlementAsset: 'fiat',
      }}
      requestInFlight={false}
      receipt={null}
      receiptError={null}
      textSizeClass="text-xs"
      onPrimaryAction={() => undefined}
      onCloseReceipt={() => undefined}
    />,
  )
  const expectedAmount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'JPY',
  }).format(1_250)
  if (!zeroDecimalHtml.includes(expectedAmount)) {
    throw new Error(`minor-unit exponent was ignored: ${zeroDecimalHtml}`)
  }
}

export function testPaymentSurfaceRendersActionablePayNowInstruction() {
  const presentation = listPaymentSurfaceStatePresentations()
    .find(entry => entry.state === 'pending_provider')
  if (!presentation) throw new Error('missing pending-provider presentation')
  const snapshot: PaymentSurfaceSnapshot = Object.freeze({
    clientIntentKey: TEST_CLIENT_INTENT_KEY,
    state: 'pending_provider',
    amountMinor: 1_250,
    currency: 'sgd',
    rail: 'straitsx',
    instruction: Object.freeze({
      kind: 'provider_instruction',
      value: Object.freeze({
        id: 'paynow_test_one',
        type: 'paynow',
        virtualPaymentAddress: 'UEN123#AGENTIC-GRAPH',
        base64EncodedImage: 'cXItY29kZQ==',
        qrCodeData: '000201010212',
        referenceId: 'reference-from-provider',
        externalReference: 'external-reference',
        expiresAt: '2026-08-27T00:00:00.000Z',
      }),
    }),
    label: presentation.label,
    nextAction: presentation.nextAction,
    buyerSafeReason: null,
  })
  const html = renderToStaticMarkup(
    <PaymentSurfaceView
      snapshot={snapshot}
      requestInFlight={false}
      receipt={null}
      receiptError={null}
      textSizeClass="text-xs"
      onPrimaryAction={() => undefined}
      onCopyInstruction={() => undefined}
      onCloseReceipt={() => undefined}
    />,
  )
  for (const required of [
    'aria-label="PayNow payment instruction"',
    'src="data:image/png;base64,cXItY29kZQ=="',
    'paynow_test_one',
    'paynow',
    'UEN123#AGENTIC-GRAPH',
    '000201010212',
    'reference-from-provider',
    'external-reference',
    '2026-08-27T00:00:00.000Z',
    'aria-label="Copy PayNow address"',
    'aria-label="Copy PayNow QR data"',
  ]) {
    if (!html.includes(required)) {
      throw new Error(`PayNow instruction missed ${required}: ${html}`)
    }
  }
}

export function testPaywallOverlayConsumesSharedSnapshotAndIs375SafeBySourceContract() {
  const overlaySource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/payments/PaywallOverlay.tsx'),
    'utf8',
  )
  const viewSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/payments/PaymentSurfaceView.tsx'),
    'utf8',
  )
  if (
    overlaySource.includes('useState(')
    || overlaySource.includes('React.useState')
    || !overlaySource.includes('view.snapshot')
    || !overlaySource.includes('usePaymentSurfaceController')
  ) {
    throw new Error('PaywallOverlay must consume the controller snapshot without local payment state.')
  }
  for (const required of [
    'UI_RESPONSIVE_WIDE_DIALOG_PANEL_CLASSNAME',
    'UI_RESPONSIVE_WIDE_DIALOG_MESSAGE_CLASSNAME',
    'max-w-full',
    'overflow-x-hidden',
    'flex-wrap',
  ]) {
    if (!overlaySource.includes(required)) {
      throw new Error(`PaywallOverlay missed responsive contract ${required}`)
    }
  }
  for (const required of ['max-w-full', 'overflow-x-hidden', 'break-words', 'whitespace-normal']) {
    if (!viewSource.includes(required)) {
      throw new Error(`PaymentSurfaceView missed narrow-layout contract ${required}`)
    }
  }
  for (const forbidden of ['min-w-[375px]', 'w-[375px]', 'w-screen', 'whitespace-nowrap']) {
    if (overlaySource.includes(forbidden) || viewSource.includes(forbidden)) {
      throw new Error(`payment surface contains narrow-layout overflow risk ${forbidden}`)
    }
  }
}

export async function testPaymentSurfaceControllerQueuesOfflineWithZeroEgress() {
  const db = createMemoryDb()
  let networkCalls = 0
  const transport: PaymentApiTransport = Object.freeze({
    async readBuyerProduct() {
      networkCalls += 1
      throw new Error('offline controller must not load a product')
    },
    async submitIntent() {
      networkCalls += 1
      throw new Error('offline controller must not submit')
    },
    async reconcileIntent() {
      networkCalls += 1
      throw new Error('offline controller must not reconcile')
    },
  })
  const command: PaymentIntentCommand = Object.freeze({
    clientIntentKey: TEST_CLIENT_INTENT_KEY,
    amountMinor: 1_250,
    currency: 'sgd',
    settlementAsset: 'fiat',
    origin: 'buyer',
  })
  try {
    const controller = createPaymentSurfaceController({
      db,
      transport,
      isOnline: () => false,
      nowMs: () => 100,
      windowTarget: null,
    })
    const queued = await controller.confirm(command)
    if (
      queued.state !== 'queued_offline'
      || queued.clientIntentKey !== TEST_CLIENT_INTENT_KEY
      || networkCalls !== 0
    ) {
      throw new Error(`expected offline zero-egress snapshot, got ${JSON.stringify({
        queued,
        networkCalls,
      })}`)
    }

    const reloadedController = createPaymentSurfaceController({
      db,
      transport,
      isOnline: () => false,
      nowMs: () => 200,
      windowTarget: null,
    })
    const restored = await reloadedController.hydrate()
    if (
      restored.state !== 'queued_offline'
      || restored.clientIntentKey !== TEST_CLIENT_INTENT_KEY
      || networkCalls !== 0
    ) {
      throw new Error(`expected shared snapshot to survive controller reload, got ${JSON.stringify({
        restored,
        networkCalls,
      })}`)
    }
  } finally {
    await db.db.remove()
  }
}

export async function testPaymentSurfaceControllerSchedulesPersistedRetryAndCleansUp() {
  const db = createMemoryDb()
  const command: PaymentIntentCommand = Object.freeze({
    clientIntentKey: TEST_CLIENT_INTENT_KEY,
    amountMinor: 1_250,
    currency: 'sgd',
    settlementAsset: 'fiat',
    origin: 'buyer',
  })
  let online = false
  let nowMs = 0
  let submitCalls = 0
  let nextTimerId = 0
  const timers = new Map<number, { callback: () => void; delayMs: number }>()
  const transport: PaymentApiTransport = Object.freeze({
    async readBuyerProduct() {
      return Object.freeze({
        amountMinor: command.amountMinor,
        currency: command.currency,
        settlementAsset: command.settlementAsset,
      })
    },
    async submitIntent(intent) {
      submitCalls += 1
      return Object.freeze({
        ok: true as const,
        intent: Object.freeze({
          intentId: `pay_${intent.clientIntentKey}`,
          state: 'pending_provider' as const,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
        }),
        rail: 'stripe' as const,
        instruction: null,
        receiptRecord: null,
        idempotentReplay: false,
        modelCallCount: 0 as const,
        modelCostUsd: 0 as const,
      })
    },
    async reconcileIntent() {
      throw new Error('the first scheduled attempt must submit the queued intent')
    },
  })
  const controller = createPaymentSurfaceController({
    db,
    transport,
    isOnline: () => online,
    nowMs: () => nowMs,
    windowTarget: null,
    scheduleTimeout(callback, delayMs) {
      nextTimerId += 1
      timers.set(nextTimerId, { callback, delayMs })
      return nextTimerId as unknown as ReturnType<typeof setTimeout>
    },
    clearScheduledTimeout(handle) {
      timers.delete(Number(handle))
    },
  })

  try {
    await controller.confirm(command)
    if (submitCalls !== 0) throw new Error('offline confirm attempted provider egress')
    online = true
    const stop = controller.start()
    await waitUntil(() => timers.size === 1)
    const firstTimer = [...timers.values()][0]
    if (!firstTimer || firstTimer.delayMs !== 0) {
      throw new Error(`expected due persisted retry, got ${JSON.stringify(firstTimer)}`)
    }
    timers.clear()
    firstTimer.callback()
    await waitUntil(() => submitCalls === 1)
    await waitUntil(() =>
      [...timers.values()].some(timer =>
        timer.delayMs === PAYMENT_RECONCILIATION_BACKOFF_MS[0]))
    const scheduledRetry = [...timers.values()][0]
    if (!scheduledRetry) throw new Error('expected bounded follow-up retry timer')
    stop()
    if (timers.size !== 0) {
      throw new Error('payment retry timer was not released on controller stop')
    }
    nowMs += PAYMENT_RECONCILIATION_BACKOFF_MS[0]
    scheduledRetry.callback()
    await new Promise(resolve => setTimeout(resolve, 0))
    if (Number(submitCalls) !== 1) {
      throw new Error('a released payment retry timer performed provider egress')
    }
  } finally {
    await db.db.remove()
  }
}
