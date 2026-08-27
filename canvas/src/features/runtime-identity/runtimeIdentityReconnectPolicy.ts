export const AGENTICGRAPH_RUNTIME_IDENTITY_MAX_RECONNECT_ATTEMPTS = 2

export type AgenticGraphRuntimeIdentityReconnectAttempt = {
  attemptIndex: number
  nextFailureCount: number
}

export const consumeAgenticGraphRuntimeIdentityReconnectAttempt = (
  failureCount: number,
  maximumAttempts = AGENTICGRAPH_RUNTIME_IDENTITY_MAX_RECONNECT_ATTEMPTS,
): AgenticGraphRuntimeIdentityReconnectAttempt | null => {
  const normalizedFailureCount = Number.isInteger(failureCount) && failureCount > 0
    ? failureCount
    : 0
  if (normalizedFailureCount >= maximumAttempts) return null
  return {
    attemptIndex: normalizedFailureCount,
    nextFailureCount: normalizedFailureCount + 1,
  }
}
