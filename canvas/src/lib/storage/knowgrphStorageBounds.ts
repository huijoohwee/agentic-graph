export const KNOWGRPH_STORAGE_SYNC_BOUNDS = {
  pushRequestTimeoutMs: 30_000,
  pollIntervalMs: 120_000,
  backoffBaseMs: 1_000,
  backoffFactor: 2,
  backoffCapMs: 30_000,
  maxRetryAttempts: 3,
  reloadRestoreBudgetMs: 3_000,
  minDocumentRevisionsRetained: 10,
  maxVersionSnapshots: 50,
  cloudReadBackMaxAttempts: 3,
  syncEventsTtlMs: 24 * 60 * 60 * 1_000,
  canonicalPathMaxLength: 1_024,
} as const

export const KNOWGRPH_SOURCE_IMPORT_LIMITS = {
  urlTimeoutMs: 30_000,
  maxBytes: 10_485_760,
} as const

export const buildKnowgrphStorageBackoffDelayMs = (attemptIndex: number): number => {
  const safeAttemptIndex = Number.isFinite(attemptIndex)
    ? Math.max(0, Math.floor(attemptIndex))
    : 0
  return Math.min(
    KNOWGRPH_STORAGE_SYNC_BOUNDS.backoffBaseMs
      * (KNOWGRPH_STORAGE_SYNC_BOUNDS.backoffFactor ** safeAttemptIndex),
    KNOWGRPH_STORAGE_SYNC_BOUNDS.backoffCapMs,
  )
}
