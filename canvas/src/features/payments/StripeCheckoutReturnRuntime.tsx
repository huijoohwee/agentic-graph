import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readStripeCheckoutSessionStatus } from './stripeCheckout'
import {
  consumeStripeCheckoutReturnParams,
  parseStripeCheckoutReturnSearch,
} from './stripeCheckoutReturn'

const STRIPE_CHECKOUT_RETURN_TOAST_ID = 'stripe-checkout-return'

const isStripeCheckoutSettled = (args: { status: string; paymentStatus: string }): boolean => {
  const paymentStatus = String(args.paymentStatus || '').trim().toLowerCase()
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
}

export function StripeCheckoutReturnRuntime(props: { search: string }) {
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const setPaymentsPaywallEnabled = useGraphStore(s => s.setPaymentsPaywallEnabled)
  const setPaymentsStripeCheckoutUrl = useGraphStore(s => s.setPaymentsStripeCheckoutUrl)

  React.useEffect(() => {
    const currentSearch = typeof window !== 'undefined' ? String(window.location.search || '') : String(props.search || '')
    const checkoutReturn = parseStripeCheckoutReturnSearch(currentSearch)
    if (!checkoutReturn) return
    consumeStripeCheckoutReturnParams(currentSearch)
    setPaymentsStripeCheckoutUrl('')

    if (checkoutReturn.kind === 'cancel') {
      pushUiToast({
        id: STRIPE_CHECKOUT_RETURN_TOAST_ID,
        kind: 'warning',
        message: 'Stripe Checkout was cancelled.',
        ttlMs: 4200,
        dismissible: true,
      })
      return
    }

    if (!checkoutReturn.sessionId) {
      pushUiToast({
        id: STRIPE_CHECKOUT_RETURN_TOAST_ID,
        kind: 'error',
        message: 'Stripe Checkout returned without a Session id.',
        ttlMs: 5200,
        dismissible: true,
      })
      return
    }

    let cancelled = false
    pushUiToast({
      id: STRIPE_CHECKOUT_RETURN_TOAST_ID,
      kind: 'neutral',
      message: 'Checking Stripe Checkout status...',
      ttlMs: null,
      dismissible: false,
      busy: true,
    })
    void readStripeCheckoutSessionStatus(checkoutReturn.sessionId)
      .then(session => {
        if (cancelled) return
        if (isStripeCheckoutSettled({ status: session.status, paymentStatus: session.paymentStatus })) {
          setPaymentsPaywallEnabled(false)
          pushUiToast({
            id: STRIPE_CHECKOUT_RETURN_TOAST_ID,
            kind: 'success',
            message: `Stripe Checkout verified: ${session.paymentStatus || session.status}.`,
            ttlMs: 5200,
            dismissible: true,
          })
          return
        }
        pushUiToast({
          id: STRIPE_CHECKOUT_RETURN_TOAST_ID,
          kind: 'warning',
          message: `Stripe Checkout returned with status ${session.status || 'unknown'} / ${session.paymentStatus || 'unknown'}.`,
          ttlMs: 6400,
          dismissible: true,
        })
      })
      .catch(err => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to verify Stripe Checkout status.'
        pushUiToast({
          id: STRIPE_CHECKOUT_RETURN_TOAST_ID,
          kind: 'error',
          message,
          ttlMs: 6400,
          dismissible: true,
        })
      })

    return () => {
      cancelled = true
    }
  }, [props.search, pushUiToast, setPaymentsStripeCheckoutUrl, setPaymentsPaywallEnabled])

  return null
}

export default StripeCheckoutReturnRuntime
