import {
  AGENTIC_PURCHASE_LOCAL_DETERMINISTIC_CHECKS,
  buildAgenticPurchaseReadiness,
} from '../../../grph-shared/src/payments/agenticPurchaseReadinessContract'

export const AGENTIC_PURCHASE_READINESS_VIEW =
  'agentic_purchase_readiness'

export const inspectAgenticPurchaseReadiness = () => Object.freeze({
  ok: true as const,
  view: AGENTIC_PURCHASE_READINESS_VIEW,
  boundary: 'deterministic-local' as const,
  readiness: buildAgenticPurchaseReadiness(
    AGENTIC_PURCHASE_LOCAL_DETERMINISTIC_CHECKS,
  ),
  claims: Object.freeze({
    providerSandboxProven: false,
    browserProven: false,
    protectedIntegrationProven: false,
    deployed: false,
  }),
})
