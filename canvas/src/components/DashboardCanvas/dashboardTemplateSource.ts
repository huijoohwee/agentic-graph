import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { cancelStorageStream, fetchWithTimeout, readResponseTextWithDeadline } from '@/lib/storage/agentic-graph-storage-client-transport'
import { sha256Hex } from '@/lib/storage/agentic-graph-storage-file-sync-relay-support'

/** Reference only: the website repository owns the authored template bytes. */
export const DASHBOARD_TEMPLATE_SOURCE = Object.freeze({
  repository: 'huijoohwee/huijoohwee.github.io',
  path: 'template/agentic-graph-agent-mission-template.md',
  revision: '3bc612b4e421484a6bf99883a0368073e369f5e4',
  sha256: '64d41e8e551de20c970370b806a71f97c15dd4199812f15bfbe0a3bce9e8afb4',
})
export const DASHBOARD_TEMPLATE_PATH = `/huijoohwee.github.io/${DASHBOARD_TEMPLATE_SOURCE.path}`
export const DASHBOARD_TEMPLATE_URL = `https://raw.githubusercontent.com/${DASHBOARD_TEMPLATE_SOURCE.repository}/${DASHBOARD_TEMPLATE_SOURCE.revision}/${DASHBOARD_TEMPLATE_SOURCE.path}`
const MAX_TEMPLATE_BYTES = 128 * 1024

async function verifyTemplate(text: string) {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length > MAX_TEMPLATE_BYTES) throw Error('Dashboard template exceeds 128 KiB.')
  if (await sha256Hex(bytes) !== DASHBOARD_TEMPLATE_SOURCE.sha256) throw Error('Shared template bytes differ from the pinned source. Use another workspace path for an edited template.')
  return text
}

export async function fetchDashboardTemplate(fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchWithTimeout({ fetchImpl, input: DASHBOARD_TEMPLATE_URL,
    init: { credentials: 'omit', cache: 'force-cache', redirect: 'error' }, timeoutMs: 8000 })
  if (!response.ok) { cancelStorageStream(response.body, 'shared template unavailable'); throw Error('The shared GitHub template is unavailable. Import a Markdown template or try again online.') }
  return verifyTemplate(await readResponseTextWithDeadline(response, { maxBytes: MAX_TEMPLATE_BYTES, fatalUtf8: true }))
}

export async function readDashboardTemplate(fs: WorkspaceFs, path: string, fetchImpl?: typeof fetch): Promise<string> {
  const cached = await fs.readFileText(path)
  if (path !== DASHBOARD_TEMPLATE_PATH) {
    if (cached === null) throw Error('The selected workspace Markdown template is unavailable.')
    return cached
  }
  if (cached !== null) return verifyTemplate(cached)
  const text = await fetchDashboardTemplate(fetchImpl)
  const parentPath = '/huijoohwee.github.io/template'
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parentPath })
  // Cache in the browser workspace only; never overwrite the repository or an authored variation.
  const concurrent = await fs.readFileText(path)
  if (concurrent !== null) return verifyTemplate(concurrent)
  await fs.createFile({ parentPath, name: 'agentic-graph-agent-mission-template.md', text, mirrorToHost: false })
  setWorkspaceEntrySource(path, { kind: 'url', url: DASHBOARD_TEMPLATE_URL }, { persist: 'sync' })
  return text
}
