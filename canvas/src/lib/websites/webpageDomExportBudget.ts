// All capture phases consume one monotonic budget; no phase restarts it.
export function createWebpageExportBudget(timeoutMs: number) {
  const now = performance.now.bind(performance)
  const deadline = now() + timeoutMs
  const remaining = (limit = Infinity) => Math.max(0, Math.min(limit, deadline - now()))
  return { remaining, wait: (ms: number, signal?: AbortSignal) => waitMs(remaining(ms), signal) }
}

async function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(tid)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = () => finish()
    const tid = setTimeout(finish, ms)
    if (signal) {
      if (signal.aborted) return finish()
      signal.addEventListener('abort', onAbort)
    }
  })
}

