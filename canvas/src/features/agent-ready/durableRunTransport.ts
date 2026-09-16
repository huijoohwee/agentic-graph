import type { RunOperation } from 'agentic-os/agents/invocation'
const observations = new Set<RunOperation>(['query', 'trace', 'evaluate', 'compare'])
let session: { token: string; expiresAt: number; path: string } | null = null
export function clearDurableRunSession() { session = null }

/** Only the trusted build can select the optional existing same-origin session owner. */
export function durableObservationBinding(environment: Record<string, unknown>, origin: string) {
  const path = environment.VITE_AGENTIC_OS_OBSERVATION_PATH
  const sessionPath = environment.VITE_AGENTIC_OS_SESSION_PATH
  const csrfHeader = environment.VITE_AGENTIC_OS_CSRF_HEADER
  if (!path && !sessionPath && !csrfHeader) return null
  const safePath = (value: unknown) => typeof value === 'string' && value.length <= 256
    && /^\/[A-Za-z0-9_/-]+$/.test(value) && !value.includes('//')
  if (!safePath(path) || !String(path).endsWith('/') || !safePath(sessionPath)
    || typeof csrfHeader !== 'string' || !/^x-[a-z0-9-]{1,60}$/.test(csrfHeader)) throw Error('Invalid runtime host binding.')
  return { endpoint: new URL(String(path), origin).href, sessionPath: new URL(String(sessionPath), origin).href, csrfHeader }
}
/** Bounded session contract shared by configured same-origin hosts. */
export async function readDurableSessionToken(response: Response, signal?: AbortSignal): Promise<string> {
  if (!response.ok || !response.headers.get('cache-control')?.split(',').some(value => value.trim().toLowerCase() === 'no-store')) {
    await response.body?.cancel()
    throw Object.assign(Error('Runtime session unavailable.'), { denied: response.status === 401 || response.status === 403 })
  }
  const reader = response.body?.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  if (!reader) throw Error('Runtime session unavailable.')
  let bytes = 0, content = ''
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break
      bytes += chunk.value.byteLength; if (bytes > 4096) throw Error('Runtime session response exceeds its bound.')
      content += decoder.decode(chunk.value, { stream: true }) }
    content += decoder.decode()
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const value = JSON.parse(content)
  if (value?.ok !== true || typeof value.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(value.csrfToken)) throw Error('Runtime session unavailable.')
  signal?.throwIfAborted()
  return value.csrfToken
}
async function sessionHeaders(binding: NonNullable<ReturnType<typeof durableObservationBinding>>, signal?: AbortSignal) {
  if (!session || session.path !== binding.sessionPath || session.expiresAt <= Date.now()) {
    session = null
    const response = await fetch(binding.sessionPath, { credentials: 'same-origin', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]) })
    const token = await readDurableSessionToken(response, signal)
    session = { token, expiresAt: Date.now() + 60000, path: binding.sessionPath }
  }
  return { [binding.csrfHeader]: session.token }
}
// This lazy browser transport uses the authenticated same-origin host. Tool JSON cannot
// choose a destination, credential, principal, provider or executable adapter.
export async function invokeDurableRun(operation: RunOperation, input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  if (typeof window === 'undefined') throw new Error('Durable run browser host is unavailable.')
  const { createAgentRunClient } = await import('agentic-os/agents/invocation')
  const binding = observations.has(operation) ? durableObservationBinding(import.meta.env ?? {}, window.location.origin) : null
  const headers = binding ? await sessionHeaders(binding, signal) : null
  const result = await createAgentRunClient({ endpoint: binding?.endpoint ?? new URL('/api/agent-swarm/', window.location.origin).href,
    ...(headers ? { getHeaders: () => headers } : {}) }).invoke(operation, input, { signal })
  if (result.httpStatus === 401 || result.httpStatus === 403) clearDurableRunSession()
  return result
}
