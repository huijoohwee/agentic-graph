import { useGraphStore } from '@/hooks/useGraphStore'
import { reportActivePathMaterializationError } from '@/features/source-files/sourceFilesMaterializationError'

export function testReportActivePathMaterializationErrorSuppressesStaleToast() {
  const store = useGraphStore.getState()
  store.resetAll()
  reportActivePathMaterializationError(Object.assign(new Error('Active document source changed during materialization (persisted active bytes).'), {
    code: 'SOURCE_FILES_MATERIALIZATION_STALE',
    retryable: false,
  }))
  if ((useGraphStore.getState().uiToasts || []).length !== 0) {
    throw new Error('expected stale materialization convergence to avoid a user-facing error toast')
  }
  reportActivePathMaterializationError(new Error('real failure'))
  const toasts = useGraphStore.getState().uiToasts || []
  if (toasts.length !== 1 || toasts[0]?.message !== 'real failure') {
    throw new Error('expected non-stale materialization failures to keep surfacing an error toast')
  }
  store.resetAll()
}
