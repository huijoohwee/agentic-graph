import React from 'react'
import type {
  PaymentSurfaceSnapshot,
  PaymentSurfaceState,
} from 'grph-shared/payments/paymentRuntimeContract'
import type { LocalPaymentReceiptProjection } from './paymentReceiptProjection'
import type { PaymentBuyerProduct } from './paymentApiClient'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const PAYMENT_ACTION_LABELS: Readonly<Record<PaymentSurfaceState, string>> =
  Object.freeze({
    idle: 'Open Checkout',
    queued_offline: 'Retry now',
    pending_provider: 'Check payment',
    paid: 'View receipt',
    refunded: 'View refund receipt',
    no_payment_required: 'Continue',
    failed: 'Retry payment',
    expired: 'Retry payment',
    cancelled: 'Retry payment',
    reconciliation_unresolved: 'Check later',
  })

const formatPaymentAmount = (
  amountMinor: number | null,
  currency: string | null,
): string => {
  if (amountMinor === null || !currency) return 'Price is set by the payment service.'
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    })
    const minorUnitDigits = formatter.resolvedOptions().maximumFractionDigits
    return formatter.format(amountMinor / (10 ** minorUnitDigits))
  } catch {
    return `${currency.toUpperCase()} ${amountMinor} minor units`
  }
}

const railLabel = (snapshot: PaymentSurfaceSnapshot): string => {
  if (snapshot.rail === 'stripe') return 'Stripe card rail'
  if (snapshot.rail === 'straitsx') return 'StraitsX SGD rail'
  return 'Rail not selected'
}

const instructionLabel = (snapshot: PaymentSurfaceSnapshot): string => {
  if (snapshot.instruction?.kind === 'hosted_checkout') return 'Hosted checkout is ready.'
  if (snapshot.instruction?.kind === 'provider_instruction') {
    return 'Provider payment instructions are ready.'
  }
  if (snapshot.state === 'queued_offline') {
    return 'No provider object or payment instruction was created while offline.'
  }
  return 'No payment instruction yet.'
}

const readInstructionString = (
  value: unknown,
  key: string,
  maxLength = 4_096,
): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' && field.length > 0 && field.length <= maxLength
    ? field
    : null
}

const StraitsxInstructionView = ({
  snapshot,
  textSizeClass,
  onCopyInstruction,
}: Readonly<{
  snapshot: PaymentSurfaceSnapshot
  textSizeClass: string
  onCopyInstruction?: (label: string, value: string) => void
}>) => {
  if (snapshot.instruction?.kind !== 'provider_instruction') return null
  const instruction = snapshot.instruction.value
  const paymentMethodId = readInstructionString(instruction, 'id')
  const paymentMethodType = readInstructionString(instruction, 'type')
  const virtualPaymentAddress = readInstructionString(
    instruction,
    'virtualPaymentAddress',
  )
  const qrCodeData = readInstructionString(instruction, 'qrCodeData')
  const base64EncodedImage = readInstructionString(
    instruction,
    'base64EncodedImage',
    500_000,
  )
  const referenceId = readInstructionString(instruction, 'referenceId')
  const externalReference = readInstructionString(instruction, 'externalReference')
  const expiresAt = readInstructionString(instruction, 'expiresAt')
  const copyRows = [
    paymentMethodId
      ? { label: 'Payment instruction ID', value: paymentMethodId }
      : null,
    virtualPaymentAddress
      ? { label: 'PayNow address', value: virtualPaymentAddress }
      : null,
    qrCodeData ? { label: 'PayNow QR data', value: qrCodeData } : null,
    referenceId ? { label: 'Reference', value: referenceId } : null,
    externalReference
      ? { label: 'External reference', value: externalReference }
      : null,
  ].filter((row): row is { label: string; value: string } => row !== null)

  return (
    <section
      aria-label="PayNow payment instruction"
      className={`mt-3 max-w-full overflow-x-hidden rounded-md border p-3 ${UI_THEME_TOKENS.panel.border}`}
    >
      {base64EncodedImage ? (
        <img
          src={`data:image/png;base64,${base64EncodedImage}`}
          alt="StraitsX PayNow QR code"
          className="mx-auto block h-auto max-w-full"
        />
      ) : null}
      <dl className={`mt-2 grid min-w-0 gap-2 ${textSizeClass}`}>
        {paymentMethodType ? (
          <div className="min-w-0">
            <dt className={UI_THEME_TOKENS.text.tertiary}>Payment method</dt>
            <dd className={`break-words ${UI_THEME_TOKENS.text.primary}`}>
              {paymentMethodType}
            </dd>
          </div>
        ) : null}
        {copyRows.map(row => (
          <div key={row.label} className="min-w-0">
            <dt className={UI_THEME_TOKENS.text.tertiary}>{row.label}</dt>
            <dd className={`mt-1 flex min-w-0 max-w-full flex-wrap items-start gap-2 ${UI_THEME_TOKENS.text.primary}`}>
              <code className="min-w-0 flex-1 break-all whitespace-normal">
                {row.value}
              </code>
              {onCopyInstruction ? (
                <button
                  type="button"
                  className={`App-toolbar__btn shrink-0 text-xs border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.primary}`}
                  onClick={() => onCopyInstruction(row.label, row.value)}
                  aria-label={`Copy ${row.label}`}
                >
                  Copy
                </button>
              ) : null}
            </dd>
          </div>
        ))}
        {expiresAt ? (
          <div className="min-w-0">
            <dt className={UI_THEME_TOKENS.text.tertiary}>Expires</dt>
            <dd className={`break-words ${UI_THEME_TOKENS.text.primary}`}>
              {expiresAt}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}

export type PaymentSurfaceViewProps = Readonly<{
  snapshot: PaymentSurfaceSnapshot
  requestInFlight: boolean
  buyerProduct?: PaymentBuyerProduct | null
  primaryActionDisabled?: boolean
  actionUnavailableReason?: string | null
  receipt: LocalPaymentReceiptProjection | null
  receiptError: string | null
  textSizeClass: string
  onPrimaryAction(): void
  onCopyInstruction?: (label: string, value: string) => void
  onCloseReceipt(): void
}>

export const PaymentSurfaceView = ({
  snapshot,
  requestInFlight,
  buyerProduct = null,
  primaryActionDisabled = false,
  actionUnavailableReason = null,
  receipt,
  receiptError,
  textSizeClass,
  onPrimaryAction,
  onCopyInstruction,
  onCloseReceipt,
}: PaymentSurfaceViewProps) => (
  <section className="w-full max-w-full min-w-0 overflow-x-hidden p-3">
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-payment-state={snapshot.state}
      className={`w-full max-w-full min-w-0 break-words rounded-md border p-3 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}
    >
      <h2 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>
        {snapshot.label}
      </h2>
      <p className={`mt-1 ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
        State: {snapshot.state}
      </p>
      <p className={`mt-1 ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
        {snapshot.nextAction}
      </p>
      <dl className={`mt-3 grid min-w-0 grid-cols-1 gap-2 ${textSizeClass}`}>
        <div className="min-w-0">
          <dt className={UI_THEME_TOKENS.text.tertiary}>Amount</dt>
          <dd className={`break-words ${UI_THEME_TOKENS.text.primary}`}>
            {formatPaymentAmount(
              snapshot.amountMinor ?? buyerProduct?.amountMinor ?? null,
              snapshot.currency || buyerProduct?.currency || null,
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={UI_THEME_TOKENS.text.tertiary}>Payment rail</dt>
          <dd className={`break-words ${UI_THEME_TOKENS.text.primary}`}>
            {railLabel(snapshot)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={UI_THEME_TOKENS.text.tertiary}>Instruction</dt>
          <dd className={`break-words ${UI_THEME_TOKENS.text.primary}`}>
            {instructionLabel(snapshot)}
          </dd>
        </div>
      </dl>
      <StraitsxInstructionView
        snapshot={snapshot}
        textSizeClass={textSizeClass}
        onCopyInstruction={onCopyInstruction}
      />
      {snapshot.buyerSafeReason ? (
        <p className={`mt-3 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
          {snapshot.buyerSafeReason}
        </p>
      ) : null}
    </section>

    <section className="mt-3 flex max-w-full flex-wrap items-center gap-2">
      <button
        type="button"
        className={`App-toolbar__btn max-w-full whitespace-normal text-xs border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}
        onClick={onPrimaryAction}
        disabled={requestInFlight || primaryActionDisabled}
        aria-describedby="payment-state-next-action"
      >
        {requestInFlight ? 'Working...' : PAYMENT_ACTION_LABELS[snapshot.state]}
      </button>
      <span
        id="payment-state-next-action"
        className={`min-w-0 flex-1 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}
      >
        {snapshot.nextAction}
      </span>
    </section>
    {actionUnavailableReason ? (
      <p
        role="status"
        className={`mt-2 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
      >
        {actionUnavailableReason}
      </p>
    ) : null}

    {receipt ? (
      <section
        aria-label="Local payment receipt"
        className={`mt-3 max-w-full overflow-x-hidden rounded-md border p-3 ${UI_THEME_TOKENS.panel.border}`}
      >
        <header className="flex max-w-full flex-wrap items-center justify-between gap-2">
          <h2 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>
            Offline receipt
          </h2>
          <button
            type="button"
            className={`App-toolbar__btn text-xs border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.primary}`}
            onClick={onCloseReceipt}
          >
            Close receipt
          </button>
        </header>
        <ul className={`mt-2 grid min-w-0 gap-2 ${textSizeClass}`}>
          {receipt.statuses.map(status => (
            <li
              key={status.intentId}
              className={`min-w-0 break-words ${UI_THEME_TOKENS.text.secondary}`}
            >
              {status.state} · {formatPaymentAmount(status.amountMinor, status.currency)}
            </li>
          ))}
        </ul>
      </section>
    ) : null}
    {receiptError ? (
      <p role="alert" className={`mt-3 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
        Receipt unavailable: {receiptError}
      </p>
    ) : null}
  </section>
)
