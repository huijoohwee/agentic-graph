const CHAT_RESPONSE_FAILURE_FINISH_REASONS = new Set([
  'cancelled',
  'canceled',
  'content_filter',
  'error',
  'failed',
  'incomplete',
  'length',
  'max_completion_tokens',
  'max_output_tokens',
  'max_tokens',
])

export class AssistantResponseTerminalError extends Error {
  readonly finishReason: string

  constructor(finishReason: string) {
    const normalizedReason = String(finishReason || '').trim().toLowerCase() || 'incomplete'
    super(`Provider response did not complete successfully (finish_reason: ${normalizedReason}).`)
    this.name = 'AssistantResponseTerminalError'
    this.finishReason = normalizedReason
  }
}

export const assertAssistantResponseTerminalComplete = (
  state: { assistantText: string; finishReason: string | null },
): void => {
  if (!String(state.assistantText || '').trim()) return
  const finishReason = String(state.finishReason || '').trim().toLowerCase()
  if (CHAT_RESPONSE_FAILURE_FINISH_REASONS.has(finishReason)) {
    throw new AssistantResponseTerminalError(finishReason)
  }
}
