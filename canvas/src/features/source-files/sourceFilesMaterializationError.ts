import { useGraphStore } from '@/hooks/useGraphStore'

export function reportActivePathMaterializationError(error: unknown): void {
  if ((error as { code?: string } | null | undefined)?.code === 'SOURCE_FILES_MATERIALIZATION_STALE') return
  useGraphStore.getState().pushUiToast({
    id: 'source-files:active-path-materialization',
    kind: 'error',
    message: error instanceof Error ? error.message : 'Failed to activate the selected canvas source',
    ttlMs: 5000,
    dismissible: true,
  })
}
