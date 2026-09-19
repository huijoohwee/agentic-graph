import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { cancelStorageStream, fetchWithTimeout, readResponseTextWithDeadline } from '@/lib/storage/agentic-graph-storage-client-transport'
import { sha256Hex } from '@/lib/storage/agentic-graph-storage-file-sync-relay-support'
import { WORKSPACE_TEMPLATES_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'

/** Reference only: the website repository owns the authored template bytes. */
export const DASHBOARD_TEMPLATE_SOURCE = Object.freeze({
  repository: 'huijoohwee/huijoohwee.github.io',
  path: 'template/agentic-graph-agent-mission-template.md',
  revision: '722e2858b9db27011538f1bb863dc16c1079d2e4',
  sha256: '7a0f3eeb0f6a5849acc07d06010f84046aba07985e390a123aa0a7084cbe5bca',
})
export const DASHBOARD_TEMPLATE_ROOT = WORKSPACE_TEMPLATES_SOURCE_ROOT_PATH
export const DASHBOARD_TEMPLATE_DISPLAY_ROOT = `GitHub${DASHBOARD_TEMPLATE_ROOT}`
export const DASHBOARD_TEMPLATE_PATH = `/huijoohwee.github.io/${DASHBOARD_TEMPLATE_SOURCE.path}`
export const DASHBOARD_TEMPLATE_URL = `https://raw.githubusercontent.com/${DASHBOARD_TEMPLATE_SOURCE.repository}/${DASHBOARD_TEMPLATE_SOURCE.revision}/${DASHBOARD_TEMPLATE_SOURCE.path}`
const PREVIOUS_TEMPLATE_DIGEST = '64d41e8e551de20c970370b806a71f97c15dd4199812f15bfbe0a3bce9e8afb4'
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
  if (cached !== null) {
    const digest = await sha256Hex(new TextEncoder().encode(cached))
    if (digest !== PREVIOUS_TEMPLATE_DIGEST) return verifyTemplate(cached)
    const upgraded = await fetchDashboardTemplate(fetchImpl)
    if (await fs.readFileText(path) !== cached) throw Error('Shared template changed while updating. Preserve the edited copy.')
    await fs.writeFileText(path, upgraded, { mirrorToHost: false })
    setWorkspaceEntrySource(path, { kind: 'url', url: DASHBOARD_TEMPLATE_URL }, { persist: 'sync' })
    return upgraded
  }
  const text = await fetchDashboardTemplate(fetchImpl)
  const parentPath = DASHBOARD_TEMPLATE_ROOT
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parentPath })
  // Cache in the browser workspace only; never overwrite the repository or an authored variation.
  const concurrent = await fs.readFileText(path)
  if (concurrent !== null) return verifyTemplate(concurrent)
  await fs.createFile({ parentPath, name: 'agentic-graph-agent-mission-template.md', text, mirrorToHost: false })
  setWorkspaceEntrySource(path, { kind: 'url', url: DASHBOARD_TEMPLATE_URL }, { persist: 'sync' })
  return text
}
