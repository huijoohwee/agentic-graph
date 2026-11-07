type Request = {
  controller: AbortController
  promise: Promise<string>
  subscribers: number
  settled: boolean
}

const abortError = () => new DOMException('Aborted', 'AbortError')
const MAX_ENTRIES = 24
const MAX_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 24 * 1024 * 1024

// Own both response retention and request lifetime. An entry count alone does
// not bound memory when captured pages contain multi-megabyte application state.
export function createWebpageTextRequestCache(ttlForKey: (key: string) => number) {
  const cache = new Map<string, { text: string; at: number; bytes: number }>()
  const inflight = new Map<string, Request>()
  const requests = new Set<Request>()
  let retainedBytes = 0
  const remove = (key: string) => {
    retainedBytes -= cache.get(key)?.bytes || 0
    cache.delete(key)
  }
  const retain = (key: string, text: string) => {
    remove(key)
    // UTF-16 code units provide an upper bound without allocating an encoded copy.
    const bytes = text.length * 2
    if (bytes > MAX_ENTRY_BYTES) return
    cache.set(key, { text, bytes, at: Date.now() })
    retainedBytes += bytes
    while (cache.size > MAX_ENTRIES || retainedBytes > MAX_TOTAL_BYTES) remove(cache.keys().next().value!)
  }
  const subscribe = (key: string, request: Request, signal: AbortSignal): Promise<string> => {
    request.subscribers += 1
    return new Promise((resolve, reject) => {
      let released = false
      const release = () => {
        if (released) return
        released = true
        signal.removeEventListener('abort', cancel)
        request.subscribers -= 1
        if (!request.settled && request.subscribers === 0) {
          if (inflight.get(key) === request) inflight.delete(key)
          request.controller.abort()
        }
      }
      const cancel = () => { release(); reject(abortError()) }
      request.promise.then(value => { release(); resolve(value) }, error => { release(); reject(error) })
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }

  return {
    clear() {
      cache.clear(); retainedBytes = 0; inflight.clear()
      for (const request of requests) request.controller.abort()
    },
    fetch(key: string, run: (signal: AbortSignal) => Promise<string>, signal: AbortSignal,
      opts?: { bypassCache?: boolean; timeoutMs?: number }): Promise<string> {
      if (signal.aborted) return Promise.reject(abortError())
      const bypass = opts?.bypassCache === true
      if (!bypass) {
        const cached = cache.get(key)
        if (cached) {
          const ttl = ttlForKey(key)
          if (ttl > 0 && Date.now() - cached.at > ttl) remove(key)
          else { cache.delete(key); cache.set(key, cached); return Promise.resolve(cached.text) }
        }
        const existing = inflight.get(key)
        if (existing) return subscribe(key, existing, signal)
      }
      const controller = new AbortController()
      const request: Request = { controller, promise: Promise.resolve(''), subscribers: 0, settled: false }
      const timeoutMs = typeof opts?.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs)
        ? Math.max(0, Math.min(180_000, Math.floor(opts.timeoutMs))) : 30_000
      let timedOut = false
      const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs) : null
      const work = new Promise<string>((resolve, reject) => {
        const cancel = () => reject(timedOut ? new Error('Timeout') : abortError())
        controller.signal.addEventListener('abort', cancel, { once: true })
        // Observe late network failures even after all consumers leave.
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw abortError()
          return run(controller.signal)
        }).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', cancel))
      })
      request.promise = work.then(text => {
        if (controller.signal.aborted) throw abortError()
        if (!bypass) retain(key, text)
        return text
      }).finally(() => {
        request.settled = true
        if (timer) clearTimeout(timer)
        requests.delete(request)
        // An abandoned request may settle after a replacement for the same URL.
        if (inflight.get(key) === request) inflight.delete(key)
      })
      requests.add(request)
      if (!bypass) inflight.set(key, request)
      return subscribe(key, request, signal)
    },
  }
}
