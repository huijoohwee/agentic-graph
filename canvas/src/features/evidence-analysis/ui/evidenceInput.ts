const limit = 2_000_000
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
declare const __AGENTIC_OS_SOURCE_REVISION__: string | undefined
type ReadOptions = { signal?: AbortSignal; timeoutMs?: number }

function runtimeAssetBase(basePath: string): string {
  if (!basePath.startsWith('/') || basePath.startsWith('//') || /[?#\\\u0000-\u001f\u007f]/.test(basePath)) throw new Error('Example base must be a local application path.')
  for (const segment of basePath.split('/')) {
    let decoded: string
    try { decoded = decodeURIComponent(segment) } catch { throw new Error('Example base contains invalid encoding.') }
    if (decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f\u007f]/.test(decoded)) throw new Error('Example base cannot escape its application path.')
  }
  // Match the native BASE_URL convention without depending on a browser global.
  return new URL(basePath.endsWith('/') ? basePath : `${basePath}/`, 'https://local.invalid').pathname
}

/** Read authored local assets without allocating an unbounded response body. */
export async function readEvidenceExamples(
  paths: readonly string[], fetcher: typeof fetch = fetch, basePath = import.meta.env?.BASE_URL || '/',
  build: { production: boolean; sourceRevision?: string } = {
    production: import.meta.env?.PROD === true,
    sourceRevision: typeof __AGENTIC_OS_SOURCE_REVISION__ === 'string' ? __AGENTIC_OS_SOURCE_REVISION__ : undefined,
  },
  options: ReadOptions = {},
): Promise<string[]> {
  if (!paths.length || paths.length > 40) throw new Error('Supply 1–40 local example paths.')
  if (paths.some(path => !/^\/evidence-analysis\/fixtures\/[a-zA-Z0-9._-]+\.json$/.test(path))) throw new Error('Example path must be an authored local asset.')
  const base = runtimeAssetBase(basePath)
  const revision = build.production ? build.sourceRevision?.trim() : undefined
  if (build.production && !/^[0-9a-f]{40}$/.test(revision || '')) throw new Error('Production examples require the native source revision.')
  const query = revision ? `?revision=${revision}` : ''
  const timeoutMs = options.timeoutMs ?? 15_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('Example read deadline must be between 1 and 30,000 ms.')
  const controller = new AbortController(), signal = controller.signal
  const cancel = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) cancel()
  else options.signal?.addEventListener('abort', cancel, { once: true })
  signal.throwIfAborted()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const stop = () => {
    void reader?.cancel(signal.reason).catch(() => {})
    rejectAbort(signal.reason)
  }
  signal.addEventListener('abort', stop, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error(`Local evidence read exceeded its ${timeoutMs} ms deadline.`)), timeoutMs)
  let remaining = limit
  const results: string[] = []
  try {
    for (const path of paths) {
      signal.throwIfAborted()
      const pending = fetcher(`${base}${path.slice(1)}${query}`, { redirect: 'error', mode: 'same-origin', credentials: 'same-origin', signal }).then(response => {
        if (signal.aborted) { void response.body?.cancel().catch(() => {}); signal.throwIfAborted() }
        return response
      })
      const response = await Promise.race([pending, aborted])
      if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); throw new Error(`Local example unavailable (${response.status}).`) }
      if (Number(response.headers.get('content-length')) > remaining) { void response.body?.cancel().catch(() => {}); throw new Error('Examples exceed the combined 2,000,000-byte input bound.') }
      reader = response.body?.getReader()
      if (!reader) throw new Error('Bounded streaming is unavailable for this local example.')
      const chunks: Uint8Array[] = []
      let count = 0
      try {
        while (true) {
          const chunk = await Promise.race([reader.read(), aborted])
          signal.throwIfAborted()
          if (chunk.done) break
          if (chunk.value.byteLength > remaining) throw new Error('Examples exceed the combined 2,000,000-byte input bound.')
          remaining -= chunk.value.byteLength; count += chunk.value.byteLength; chunks.push(chunk.value)
        }
      } catch (error) { void reader.cancel().catch(() => {}); throw error }
      finally { reader.releaseLock(); reader = undefined }
      const bytes = new Uint8Array(count)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      results.push(decoder.decode(bytes))
    }
    return results
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', stop)
    options.signal?.removeEventListener('abort', cancel)
  }
}
