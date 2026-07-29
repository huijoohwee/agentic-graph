import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import PreviewOverlay from '@/features/panels/views/preview-panel/ui/PreviewOverlay'
import {
  redirectToStripeHostedCheckoutUrl,
} from '@/features/payments/stripeCheckout'
import { PaymentSurfaceView } from './PaymentSurfaceView'
import { AgenticPurchaseLifecycleView } from './AgenticPurchaseLifecycleView'
import {
  createBuyerPaymentIntentCommand,
  type PaymentSurfaceController,
} from './paymentSurfaceController'
import { usePaymentSurfaceController } from './usePaymentSurfaceController'
import {
  UI_RESPONSIVE_WIDE_DIALOG_MESSAGE_CLASSNAME,
  UI_RESPONSIVE_WIDE_DIALOG_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type PaywallOverlayProps = Readonly<{
  portalTarget: HTMLElement | null
  controller?: PaymentSurfaceController
}>

export function PaywallOverlay(props: PaywallOverlayProps) {
  const paywallEnabled = useGraphStore(s => s.paymentsPaywallEnabled === true)
  const floatingPanelOpen = useGraphStore(s => s.floatingPanelOpen === true)
  const floatingPanelView = useGraphStore(s => s.floatingPanelView)
  const setPaywallEnabled = useGraphStore(s => s.setPaymentsPaywallEnabled)
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')
  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || 'text-xs',
  )
  const active = paywallEnabled
    && floatingPanelOpen
    && floatingPanelView === 'chat'
  const { controller, view } = usePaymentSurfaceController(
    props.controller,
    active,
  )

  if (!active) return null

  const handleClose = (): void => {
    if (
      view.purchaseInvocation.lifecycle
      && !view.purchaseInvocation.lifecycle.cancelled
    ) {
      controller.cancelPurchase()
    }
    setPaywallEnabled(false)
  }

  const redirectToCheckoutUrl = (url: string) => {
    try {
      redirectToStripeHostedCheckoutUrl(url)
    } catch (error) {
      pushUiToast({
        id: 'stripe-checkout-redirect-failed',
        kind: 'error',
        message: error instanceof Error ? error.message : 'Stripe Checkout redirect failed.',
        ttlMs: 10_000,
      })
    }
  }

  const handlePrimaryAction = (): void => {
    if (view.purchaseInvocation.lifecycle) return
    if (
      view.snapshot.state === 'paid'
      || view.snapshot.state === 'refunded'
    ) {
      void controller.openReceipt()
      return
    }
    if (view.snapshot.state === 'no_payment_required') {
      setPaywallEnabled(false)
      return
    }
    if (view.snapshot.instruction?.kind === 'hosted_checkout') {
      redirectToCheckoutUrl(view.snapshot.instruction.url)
      return
    }
    if (
      view.snapshot.state === 'failed'
      || view.snapshot.state === 'expired'
      || view.snapshot.state === 'cancelled'
      || view.snapshot.state === 'queued_offline'
      || view.snapshot.state === 'reconciliation_unresolved'
    ) {
      void controller.retry()
      return
    }
    if (view.snapshot.state === 'pending_provider') {
      void controller.reconcile()
      return
    }
    if (view.snapshot.state !== 'idle') return
    if (!view.buyerProduct) {
      void controller.loadBuyerProduct()
      pushUiToast({
        id: 'payment-buyer-product-unavailable',
        kind: 'warning',
        message: view.buyerProductError
          || 'The server-authoritative buyer product is not ready.',
        ttlMs: 10_000,
      })
      return
    }
    const command = createBuyerPaymentIntentCommand(view.buyerProduct)
    void controller.confirm(command)
      .then(snapshot => {
        if (snapshot.instruction?.kind === 'hosted_checkout') {
          redirectToCheckoutUrl(snapshot.instruction.url)
        }
      })
      .catch(error => {
        pushUiToast({
          id: 'payment-intent-create-failed',
          kind: 'error',
          message: error instanceof Error
            ? error.message
            : 'Payment intent creation failed.',
          ttlMs: 10_000,
        })
      })
  }

  const handleCopyInstruction = (label: string, value: string): void => {
    void (async () => {
      try {
        if (!globalThis.navigator?.clipboard?.writeText) {
          throw new Error('Clipboard access is unavailable.')
        }
        await globalThis.navigator.clipboard.writeText(value)
        pushUiToast({
          id: `payment-instruction-copied-${label.toLowerCase().replace(/\W+/g, '-')}`,
          kind: 'success',
          message: `${label} copied.`,
        })
      } catch (error) {
        pushUiToast({
          id: 'payment-instruction-copy-failed',
          kind: 'error',
          message: error instanceof Error
            ? error.message
            : 'Payment instruction could not be copied.',
          ttlMs: 10_000,
        })
      }
    })()
  }

  const actionUnavailableReason = view.purchaseInvocation.lifecycle
    ? 'Agentic purchase execution is fail-closed until every phase dependency is ready.'
    : view.snapshot.state === 'idle'
      && view.buyerProductStatus !== 'ready'
      ? view.buyerProductStatus === 'loading'
        ? 'Loading the server-authoritative product…'
        : view.buyerProductError
      : null

  return (
    <PreviewOverlay
      open={paywallEnabled}
      onClose={handleClose}
      scope="container"
      portalTarget={props.portalTarget}
      overlayClassName="bg-black/60"
      panelClassName={`${UI_RESPONSIVE_WIDE_DIALOG_PANEL_CLASSNAME} max-w-full overflow-x-hidden bg-[color:var(--kg-panel-bg)] border ${UI_THEME_TOKENS.panel.border}`}
    >
      <section
        className={`h-full min-w-0 max-w-full overflow-x-hidden flex flex-col ${uiPanelTextFontClass}`}
        aria-label="Paywall"
      >
        <header
          className={`flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2 px-3 py-2 border-b ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}
        >
          <section className="min-w-0 flex-1">
            <section className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>
              Paywall
            </section>
            <section className={`break-words ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
              One payment state and one trusted agentic purchase lifecycle.
            </section>
          </section>
          <button
            type="button"
            className={`App-toolbar__btn shrink-0 text-xs border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}
            onClick={handleClose}
          >
            Close
          </button>
        </header>
        <section className="flex-1 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden">
          <section className={`${UI_RESPONSIVE_WIDE_DIALOG_MESSAGE_CLASSNAME} max-w-full`}>
            <AgenticPurchaseLifecycleView
              invocation={view.purchaseInvocation}
              textSizeClass={uiPanelMicroLabelTextSizeClass}
            />
            <PaymentSurfaceView
              snapshot={view.snapshot}
              requestInFlight={view.requestInFlight}
              buyerProduct={view.buyerProduct}
              primaryActionDisabled={
                Boolean(view.purchaseInvocation.lifecycle)
                || (
                  view.snapshot.state === 'idle'
                  && view.buyerProductStatus === 'loading'
                )
              }
              actionUnavailableReason={actionUnavailableReason}
              receipt={view.receipt}
              receiptError={view.receiptError}
              textSizeClass={uiPanelMicroLabelTextSizeClass}
              onPrimaryAction={handlePrimaryAction}
              onCopyInstruction={handleCopyInstruction}
              onCloseReceipt={controller.closeReceipt}
            />
          </section>
        </section>
      </section>
    </PreviewOverlay>
  )
}
