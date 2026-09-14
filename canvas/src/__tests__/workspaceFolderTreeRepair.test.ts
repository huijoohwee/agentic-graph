import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { resolveInitializedWorkspaceFs } from '@/features/workspace-fs/workspaceFsInitialization'
import { writeWorkspaceFileTextEnsuringFile } from '@/features/chat/chatWorkspaceFsWrite'

export async function testEnsureWorkspaceFolderTreeIfMissingCreatesNestedSeedFolders() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()

  await ensureWorkspaceFolderTreeIfMissing({
    fs,
    folderPath: '/fixtures/test-data',
  })

  const entries = await fs.listEntries()
  const folders = new Set(entries.filter(entry => entry.kind === 'folder').map(entry => String(entry.path || '')))
  if (!folders.has('/fixtures')) {
    throw new Error('expected nested workspace folder repair to create /fixtures')
  }
  if (!folders.has('/fixtures/test-data')) {
    throw new Error('expected nested workspace folder repair to create /fixtures/test-data')
  }

  let seedCalls = 0
  const injected = { ...fs, async ensureSeed() { seedCalls += 1; return fs.ensureSeed() } }
  await Promise.all([resolveInitializedWorkspaceFs(injected), resolveInitializedWorkspaceFs(injected)])
  await writeWorkspaceFileTextEnsuringFile({ fs: injected, path: '/fixtures/test-data/asset.md', text: 'first' })
  await writeWorkspaceFileTextEnsuringFile({ fs: injected, path: '/fixtures/test-data/asset.md', text: 'updated' })
  if (seedCalls !== 1 || await fs.readFileText('/fixtures/test-data/asset.md') !== 'updated') {
    throw new Error('repeated artifact writes must initialize once and preserve verified text')
  }
  await injected.ensureSeed()
  if (Number(seedCalls) !== 2) throw new Error('explicit source refresh must remain available')

  let attempts = 0
  const retryable = { ...fs, async ensureSeed() {
    if (++attempts === 1) throw new Error('initialization unavailable')
    return fs.ensureSeed()
  } }
  let rejected = false
  try { await resolveInitializedWorkspaceFs(retryable) } catch { rejected = true }
  if (!rejected) throw new Error('initialization failure must remain visible')
  await resolveInitializedWorkspaceFs(retryable)
  if (attempts !== 2) throw new Error('a failed initialization must permit a later retry')

  let unreadableRejected = false
  try {
    await writeWorkspaceFileTextEnsuringFile({ fs: { ...fs, readFileText: async () => null },
      path: '/fixtures/test-data/unverified.md', text: 'must verify' })
  } catch { unreadableRejected = true }
  if (!unreadableRejected) throw new Error('artifact writes must still require exact persistence readback')
}
