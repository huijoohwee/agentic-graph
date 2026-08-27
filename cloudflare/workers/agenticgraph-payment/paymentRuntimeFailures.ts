import type {
  PaymentFailureCode,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'

export const paymentFailureMessage = (code: PaymentFailureCode): string => {
  switch (code) {
    case 'approval_missing': return 'Approval is required before this payment can be created.'
    case 'capability_unavailable': return 'The requested payment capability is not available.'
    case 'intent_parameter_conflict': return 'This payment key already owns different parameters.'
    case 'integration_model_unsupported': return 'The configured payment integration is not supported.'
    case 'mode_mismatch': return 'Payment credential mode does not match the sandbox runtime.'
    case 'not_found': return 'Payment intent was not found.'
    case 'provider_declined': return 'The provider did not accept this payment operation.'
    case 'provider_operation_unverified': return 'This provider operation is not bound to a verified contract.'
    case 'provider_outcome_unknown': return 'The provider outcome is not yet known.'
    case 'rail_unavailable': return 'No compatible payment rail is ready.'
    case 'refund_not_applicable': return 'Only a paid payment can be refunded.'
    case 'schema_invalid': return 'The payment request is invalid.'
    case 'storage_unavailable': return 'The payment record could not be stored.'
  }
}
