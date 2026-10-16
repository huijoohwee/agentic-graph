const limit = 2_000_000
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
declare const __AGENTIC_OS_SOURCE_REVISION__: string | undefined

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
): Promise<string[]> {
  if (!paths.length || paths.length > 40) throw new Error('Supply 1–40 local example paths.')
  const base = runtimeAssetBase(basePath)
  const revision = build.production ? build.sourceRevision?.trim() : undefined
  if (build.production && !/^[0-9a-f]{40}$/.test(revision || '')) throw new Error('Production examples require the native source revision.')
  const query = revision ? `?revision=${revision}` : ''
  let remaining = limit
  const results: string[] = []
  for (const path of paths) {
    if (!/^\/evidence-analysis\/fixtures\/[a-zA-Z0-9._-]+\.json$/.test(path)) throw new Error('Example path must be an authored local asset.')
    const response = await fetcher(`${base}${path.slice(1)}${query}`, { redirect: 'error', mode: 'same-origin', credentials: 'same-origin' })
    if (!response.ok || response.redirected) throw new Error(`Local example unavailable (${response.status}).`)
    if (Number(response.headers.get('content-length')) > remaining) { await response.body?.cancel(); throw new Error('Examples exceed the combined 2,000,000-byte input bound.') }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Bounded streaming is unavailable for this local example.')
    const chunks: Uint8Array[] = []
    let count = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        if (chunk.value.byteLength > remaining) throw new Error('Examples exceed the combined 2,000,000-byte input bound.')
        remaining -= chunk.value.byteLength; count += chunk.value.byteLength; chunks.push(chunk.value)
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error }
    finally { reader.releaseLock() }
    const bytes = new Uint8Array(count)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    results.push(decoder.decode(bytes))
  }
  return results
}
