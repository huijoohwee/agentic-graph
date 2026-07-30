import {
  buildAgenticPurchaseEnvelopeDigestInput,
  validateAgenticPurchaseEnvelope,
  type AgenticPurchaseEnvelope,
  type AgenticPurchaseLifecycleSnapshot,
  type AgenticPurchaseReadinessSnapshot,
} from 'grph-shared/payments/agenticPurchaseRuntimeContract'
import {
  AGENTIC_PURCHASE_LOCAL_DETERMINISTIC_CHECKS,
  buildAgenticPurchaseLifecyclePreview,
  buildAgenticPurchaseReadiness,
  cancelAgenticPurchaseLifecycle,
} from 'grph-shared/payments/agenticPurchaseReadinessContract'
import { useGraphStore } from '@/hooks/useGraphStore'

const TRUSTED_CANVAS_HOST_SOURCE = Object.freeze({
  owner: 'knowgrph-canvas-host',
})

export type TrustedPurchaseInvocationView = Readonly<{
  envelope: AgenticPurchaseEnvelope | null
  lifecycle: AgenticPurchaseLifecycleSnapshot | null
  readiness: AgenticPurchaseReadinessSnapshot
  acceptedAtMs: number | null
}>

export type TrustedPurchaseInvocationResult =
  | Readonly<{
      ok: true
      idempotentReplay: boolean
      view: TrustedPurchaseInvocationView
    }>
  | Readonly<{
      ok: false
      code:
        | 'purchase_invocation_untrusted'
        | 'purchase_instruction_rejected'
        | 'purchase_instruction_conflict'
        | 'purchase_lifecycle_active'
      message: string
    }>

const buildUnavailableReadiness = (
  trustedInvocation: boolean,
): AgenticPurchaseReadinessSnapshot => buildAgenticPurchaseReadiness({
  ...AGENTIC_PURCHASE_LOCAL_DETERMINISTIC_CHECKS,
  trustedInvocation,
})

const createEmptyView = (): TrustedPurchaseInvocationView => Object.freeze({
  envelope: null,
  lifecycle: null,
  readiness: buildUnavailableReadiness(false),
  acceptedAtMs: null,
})

const listeners = new Set<() => void>()
let view = createEmptyView()

const publish = (next: TrustedPurchaseInvocationView): void => {
  view = Object.freeze(next)
  listeners.forEach(listener => listener())
}

const openExistingPaywall = (): void => {
  const graph = useGraphStore.getState()
  graph.setPaymentsPaywallEnabled(true)
  graph.setFloatingPanelOpen(true)
  graph.setFloatingPanelView('chat')
}

const isInvocationRecord = (
  value: unknown,
): value is Readonly<{ source?: unknown; envelope?: unknown }> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const getTrustedPurchaseInvocationView =
  (): TrustedPurchaseInvocationView => view

export const subscribeTrustedPurchaseInvocation = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const submitCanvasPurchaseInvocation = (
  request: unknown,
  nowMs = Date.now(),
): TrustedPurchaseInvocationResult => {
  if (
    !isInvocationRecord(request)
    || request.source !== TRUSTED_CANVAS_HOST_SOURCE
  ) {
    return Object.freeze({
      ok: false,
      code: 'purchase_invocation_untrusted',
      message: 'Only the direct-import Canvas host may start a purchase lifecycle.',
    })
  }

  const validation = validateAgenticPurchaseEnvelope(request.envelope, nowMs)
  if (validation.ok === false) {
    return Object.freeze({
      ok: false,
      code: 'purchase_instruction_rejected',
      message: validation.message,
    })
  }

  const envelope = validation.value
  if (view.envelope && view.lifecycle) {
    if (view.envelope.lifecycleKey === envelope.lifecycleKey) {
      const unchanged =
        buildAgenticPurchaseEnvelopeDigestInput(view.envelope)
        === buildAgenticPurchaseEnvelopeDigestInput(envelope)
      if (!unchanged) {
        return Object.freeze({
          ok: false,
          code: 'purchase_instruction_conflict',
          message: 'The lifecycle key is already bound to a different purchase instruction.',
        })
      }
      openExistingPaywall()
      return Object.freeze({ ok: true, idempotentReplay: true, view })
    }
    if (!view.lifecycle.cancelled) {
      return Object.freeze({
        ok: false,
        code: 'purchase_lifecycle_active',
        message: 'Finish or cancel the active purchase lifecycle before starting another.',
      })
    }
  }

  const readiness = buildUnavailableReadiness(true)
  const lifecycle = buildAgenticPurchaseLifecyclePreview(envelope, readiness)
  const next = Object.freeze({
    envelope,
    lifecycle,
    readiness,
    acceptedAtMs: Math.floor(nowMs),
  })
  publish(next)
  openExistingPaywall()
  return Object.freeze({ ok: true, idempotentReplay: false, view: next })
}

export const invokeTrustedCanvasPurchase = (
  envelope: unknown,
  nowMs = Date.now(),
): TrustedPurchaseInvocationResult => submitCanvasPurchaseInvocation({
  source: TRUSTED_CANVAS_HOST_SOURCE,
  envelope,
}, nowMs)

export const cancelTrustedCanvasPurchase =
  (): AgenticPurchaseLifecycleSnapshot | null => {
    if (!view.lifecycle || !view.envelope) return null
    if (view.lifecycle.cancelled) return view.lifecycle
    const lifecycle = cancelAgenticPurchaseLifecycle(view.lifecycle)
    publish(Object.freeze({ ...view, lifecycle }))
    return lifecycle
  }

export const __resetTrustedPurchaseInvocationForTests = (): void => {
  view = createEmptyView()
  listeners.forEach(listener => listener())
}
