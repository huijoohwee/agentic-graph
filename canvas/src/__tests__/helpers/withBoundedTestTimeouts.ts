let active = false

// Test-owned waits retain native asynchronous callbacks and cancellation handles.
// Production code still requests its real delay; only this scoped clock wait is shortened.
export async function withBoundedTestTimeouts<T>(expectedDelay: number, run: (delays: readonly number[]) => Promise<T>): Promise<T> {
  if (!Number.isFinite(expectedDelay) || expectedDelay < 0) throw new Error('Invalid expected test delay')
  if (active) throw new Error('Concurrent bounded test timeout scopes are not allowed')
  active = true
  const original = globalThis.setTimeout, clear = globalThis.clearTimeout
  const owned = new Set<ReturnType<typeof setTimeout>>()
  const delays: number[] = []
  const immediate = ((handler: (...args: unknown[]) => void, delay = 0, ...args: unknown[]) => {
    if (delay !== expectedDelay) return original(handler, delay, ...args)
    if (typeof handler !== 'function' || !Number.isFinite(delay) || delay < 0 || delays.length >= 64) {
      throw new Error('Test timeout exceeded its callback or scheduling bound')
    }
    delays.push(delay)
    const handle = original(() => { owned.delete(handle); handler(...args) }, 0)
    owned.add(handle)
    return handle
  }) as typeof setTimeout
  globalThis.setTimeout = immediate
  try { return await run(delays) }
  finally {
    const changed = globalThis.setTimeout !== immediate
    if (!changed) globalThis.setTimeout = original
    for (const handle of owned) clear(handle)
    owned.clear(); active = false
    if (changed) throw new Error('Test timeout ownership changed before restoration')
  }
}
