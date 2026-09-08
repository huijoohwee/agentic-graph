export const notifyWorkspaceFsDegraded = async (err: unknown) => {
  try {
    if (typeof window === 'undefined') return
    const mod = (await import('@/hooks/useGraphStore')) as typeof import('@/hooks/useGraphStore')
    const msg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message || '').trim()
        : ''
    mod.useGraphStore.getState().pushUiToast({
      id: 'workspace-fs-persistence-disabled',
      kind: 'warning',
      message: `Workspace persistence is unavailable. Changes may not survive reload.${msg ? ` ${msg}` : ''}`,
    })
  } catch {
    void 0
  }
}

