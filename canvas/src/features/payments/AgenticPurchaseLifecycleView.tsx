import React from 'react'
import type {
  AgenticPurchaseReadinessCheck,
} from 'grph-shared/payments/agenticPurchaseRuntimeContract'
import type {
  TrustedPurchaseInvocationView,
} from './trustedPurchaseInvocation'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const CHECK_LABELS: Readonly<Record<AgenticPurchaseReadinessCheck, string>> =
  Object.freeze({
    requirementsAuthority: 'requirements authority',
    trustedInvocation: 'trusted invocation',
    durableLifecycleStore: 'durable lifecycle store',
    kycAccountGrant: 'KYC account grant',
    xsgdAvalancheTuple: 'XSGD Avalanche tuple',
    externalSigner: 'external signer',
    providerCreditAuthority: 'provider credit authority',
    cardSettlementBridge: 'card settlement bridge',
    browserControlOwner: 'browser-control owner',
    allowedMerchantFixture: 'allowed merchant fixture',
    discoveryCancellation: 'discovery cancellation',
    modelCostObserver: 'model cost observer',
    durableApprovalStore: 'durable approval store',
    cardProgramGrant: 'card-program grant',
    virtualCardProduct: 'virtual-card product',
    cardPool: 'card pool',
    remoteHostAuthorization: 'remote host authorization',
    secureCardBroker: 'secure card broker',
    cardDisposalContract: 'card disposal contract',
    browserProof: 'browser proof',
  })

export const AgenticPurchaseLifecycleView = ({
  invocation,
  textSizeClass,
}: Readonly<{
  invocation: TrustedPurchaseInvocationView
  textSizeClass: string
}>) => {
  if (!invocation.lifecycle) return null

  return (
    <section
      aria-label="Agentic purchase lifecycle readiness"
      data-agentic-purchase-lifecycle={invocation.lifecycle.lifecycleId}
      className={`mb-3 max-w-full min-w-0 overflow-x-hidden rounded-md border p-3 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}
    >
      <h2 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>
        Agentic purchase lifecycle
      </h2>
      <p className={`mt-1 break-all ${textSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
        Lifecycle: {invocation.lifecycle.lifecycleId}
      </p>
      <p
        role="status"
        className={`mt-2 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
      >
        {invocation.lifecycle.cancelled
          ? 'Cancelled before financial state. No provider or financial call was made.'
          : invocation.lifecycle.nextAction}
      </p>
      <ol className="mt-3 grid min-w-0 grid-cols-1 gap-2">
        {invocation.lifecycle.phases.map((phase, index) => {
          const readiness = invocation.readiness.phases[index]
          const ready = readiness?.ready === true
          return (
            <li
              key={phase.phase}
              data-agentic-purchase-phase={phase.phase}
              data-agentic-purchase-readiness={ready ? 'ready' : 'blocked'}
              className={`min-w-0 max-w-full rounded border p-2 ${UI_THEME_TOKENS.panel.border}`}
            >
              <section className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2">
                <span className={`font-medium ${UI_THEME_TOKENS.text.primary}`}>
                  {phase.label}
                </span>
                <span className={ready
                  ? UI_THEME_TOKENS.text.primary
                  : UI_THEME_TOKENS.text.tertiary}
                >
                  {ready ? 'Ready' : 'Blocked'}
                </span>
              </section>
              <p className={`mt-1 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
                {phase.nextAction}
              </p>
              {!ready && readiness?.missingChecks.length ? (
                <p className={`mt-1 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
                  Waiting for {readiness.missingChecks
                    .map(check => CHECK_LABELS[check])
                    .join(', ')}.
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
      <p className={`mt-3 break-words ${textSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
        Fail closed: this Canvas slice cannot fund, discover, issue, authorize, or execute.
      </p>
    </section>
  )
}
