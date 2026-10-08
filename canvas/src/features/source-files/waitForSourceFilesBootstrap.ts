import { readSourceFilesBootstrapSnapshot, subscribeSourceFilesBootstrapReady,
  type SourceFilesBootstrapSnapshot } from './sourceFilesBootstrapReadiness'

type ReadinessSource = {
  read: () => Pick<SourceFilesBootstrapSnapshot, 'basePhase' | 'error'>
  subscribe: (listener: () => void) => () => void
}
const source: ReadinessSource = { read: readSourceFilesBootstrapSnapshot, subscribe: subscribeSourceFilesBootstrapReady }

/** Imports wait for inventory hydration, not the active document they may replace. */
export function waitForSourceFilesBootstrap(
  { signal, timeoutMs = 30000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
  readiness: ReadinessSource = source,
): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) return Promise.reject(new RangeError('Invalid workspace initialization deadline'))
  return new Promise((resolve, reject) => {
    let settled = false, unsubscribe = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort)
      if (error) reject(error); else resolve()
    }
    const abort = () => finish(signal?.reason || new DOMException('Import cancelled', 'AbortError'))
    const check = () => {
      try {
        const snapshot = readiness.read()
        if (snapshot.basePhase === 'ready') finish()
        else if (snapshot.basePhase === 'error') finish(new Error(snapshot.error || 'Workspace initialization failed'))
      } catch (error) { finish(error) }
    }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => finish(new Error('Workspace initialization timed out; retry the import after reopening the workspace')), timeoutMs)
    try {
      unsubscribe = readiness.subscribe(check)
      if (settled) unsubscribe()
      else check() // Subscribe first so completion cannot fall between observation and registration.
    } catch (error) { finish(error) }
  })
}
