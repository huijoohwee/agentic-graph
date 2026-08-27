export const AGENTICGRAPH_STORAGE_SYNC_LIMITS = {
  maxPushMutations: 50,
  maxMutationBytes: 512 * 1_024,
  maxResultRows: 100,
  maxResponseBytes: 8 * 1_024 * 1_024,
} as const
