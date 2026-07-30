import { STORYBOARD_WIDGET_PROVIDER_REPAIR_AUDIT_POLICY } from './storyboardWidgetProviderResponsePolicy'

const normalizeRepairReason = (value: string): string => (
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, 480)
)

export function buildStoryboardWidgetProbeTreeProviderRepairPrompt(args: {
  basePrompt: string
  rejectionReason: string
  repairAttempt: number
  maxRepairAttempts: number
}): string {
  return [
    args.basePrompt,
    '',
    'The previous provider response was rejected by the Probe-Tree runtime validator.',
    `Validation feedback: ${normalizeRepairReason(args.rejectionReason) || 'No acceptable card set was returned.'}`,
    `- This is bounded repair attempt ${args.repairAttempt} of ${args.maxRepairAttempts}. Return a new response rather than explaining or defending the rejected response.`,
    ...STORYBOARD_WIDGET_PROVIDER_REPAIR_AUDIT_POLICY,
    '- Return only the required fenced JSON block.',
  ].join('\n')
}
