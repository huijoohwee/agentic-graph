import { readWorkflowImport } from './agentWorkflowImport'

/** The host selects one native archive. The existing SSE importer verifies every page before publication. */
export async function readWorkspaceObservation(signal: AbortSignal, request: typeof fetch = fetch) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(30000)])
  const response = await request('/api/agent-swarm/workspace-source', { method: 'POST', signal,
    headers: { 'content-type': 'application/json' }, body: '{}' })
  if (response.status === 404) return null
  if (!response.ok || !response.headers.get('cache-control')?.includes('no-store'))
    throw Error('The selected .workspace observation is unavailable. Check its native manifest binding.')
  const text = await response.text()
  if (new TextEncoder().encode(text).length > 64000) throw Error('Workspace source exceeds its bound.')
  const source = JSON.parse(text)
  if (source.schema !== 'agentic-graph/workspace-observation-source/v1' || source.authority !== false
    || typeof source.manifestText !== 'string' || !/^[a-f0-9]{64}$/u.test(source.manifestDigest)
    || typeof source.manifestPath !== 'string' || !/^\.artifacts\/workflows\/[a-f0-9]{24}\/[a-f0-9]{64}\/manifest\.json$/u.test(source.manifestPath))
    throw Error('Workspace source identity is invalid.')
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.manifestText)))].map(n => n.toString(16).padStart(2, '0')).join('')
  if (digest !== source.manifestDigest || !source.manifestPath.includes(`/${digest}/`)) throw Error('Workspace source digest changed.')
  const trace = await readWorkflowImport(source.manifestText, '.workspace/' + source.manifestPath, signal, request)
  return { ...trace, workspaceObservation: { manifestPath: '.workspace/' + source.manifestPath, manifestDigest: digest } }
}
