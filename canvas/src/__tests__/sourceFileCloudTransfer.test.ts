import assert from 'node:assert/strict'
import { withDurableBrowserStorage } from '@/__tests__/helpers/durable-browser-storage'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { importSourceFileCloudSnapshot, normalizeSourceFileTransferScope } from '@/features/source-files/sourceFileCloudTransfer'
import { readAgenticGraphStorageRuntimeSyncAvailable } from '@/features/source-files/source-files-agentic-graph-storage-settings'
import { writeWorkspaceCloudSyncEnabledSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { resolveStorageDevProxyOrigin } from '../../viteStorageProxyEnv'

export async function testSourceFileCloudDownloadPreservesLocalBytesAndDirectoryScope() {
  await withDurableBrowserStorage(async () => {
    const dom = initJsdomHarness(), window = initWindowHarness({ storage: new MemoryStorage() })
    try {
      resetWorkspaceFsForTests()
      const fs = await getWorkspaceFs()
      await fs.createFolder({ parentPath: '/', name: 'notes', mirrorToHost: false })
      const localPath = await fs.createFile({ parentPath: '/notes', name: 'keep.md', text: '# Local owner bytes 保留', mirrorToHost: false })
      const snapshot = new Map([
        ['huijoohwee/docs/notes/keep.md', '# Cloud version 🧭'],
        ['huijoohwee/docs/nested/empty.md', ''],
        ['huijoohwee/docs/nested/readme.md', '# Downloaded'],
      ])
      const selected = await importSourceFileCloudSnapshot({ fs, snapshot, prefix: '/notes' })
      assert.equal(selected.transferred, 1)
      assert.equal(selected.conflicts.length, 1)
      assert.equal(await fs.readFileText(localPath), '# Local owner bytes 保留')
      assert.equal(await fs.readFileText(selected.conflicts[0]!), '# Cloud version 🧭')
      assert.equal(await fs.readFileText('/docs/nested/empty.md'), null)
      const repeat = await importSourceFileCloudSnapshot({ fs, snapshot, prefix: '/notes' })
      assert.equal(repeat.transferred, 0)
      assert.equal(repeat.unchanged, 1)
      assert.deepEqual(repeat.conflicts, selected.conflicts)
      const all = await importSourceFileCloudSnapshot({ fs, snapshot, prefix: '/docs/nested' })
      assert.equal(all.transferred, 2)
      assert.equal(await fs.readFileText('/docs/nested/empty.md'), '')
      assert.equal(await fs.readFileText('/docs/nested/readme.md'), '# Downloaded')
      assert((await fs.listEntries()).some(entry => entry.kind === 'folder' && entry.path === '/docs/nested'))
      const before = await fs.listEntries()
      await assert.rejects(importSourceFileCloudSnapshot({ fs, prefix: '/', snapshot: new Map([
        ['huijoohwee/docs/valid.md', '# Valid'], ['huijoohwee/docs/../escape.md', '# Invalid'],
      ]) }), /traversal/)
      assert.deepEqual(await fs.listEntries(), before)
      await assert.rejects(importSourceFileCloudSnapshot({ fs, prefix: '/', snapshot: new Map(
        Array.from({ length: 51 }, (_, index) => [`huijoohwee/docs/limit-${index}.md`, '# Test']),
      ) }), /smaller folder/)
      assert.deepEqual(await fs.listEntries(), before)
    } finally { resetWorkspaceFsForTests(); window.restore(); dom.restore() }
  })
}

export function testSourceFileCloudConfigurationAndProxyOriginBoundaries() {
  const dom = initJsdomHarness(), window = initWindowHarness({ storage: new MemoryStorage() })
  const previous = process.env.VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED
  try {
    delete process.env.VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED
    assert.equal(readAgenticGraphStorageRuntimeSyncAvailable(), false)
    writeWorkspaceCloudSyncEnabledSetting(true)
    assert.equal(readAgenticGraphStorageRuntimeSyncAvailable(), true)
    writeWorkspaceCloudSyncEnabledSetting(false)
    assert.equal(readAgenticGraphStorageRuntimeSyncAvailable(), false)
    process.env.VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED = 'false'
    writeWorkspaceCloudSyncEnabledSetting(true)
    assert.equal(readAgenticGraphStorageRuntimeSyncAvailable(), false)
    assert.equal(normalizeSourceFileTransferScope('notes/'), '/notes')
    assert.throws(() => normalizeSourceFileTransferScope('/notes/../secret'), /traversal/)
    assert.equal(resolveStorageDevProxyOrigin({ origin: 'http://127.0.0.1:4188', host: '127.0.0.1:4188', target: 'https://airvio.co' }), 'https://airvio.co')
    for (const origin of ['https://attacker.test', 'http://127.0.0.1:4189', 'null', undefined]) {
      assert.equal(resolveStorageDevProxyOrigin({ origin, host: '127.0.0.1:4188', target: 'https://airvio.co' }), null)
    }
  } finally {
    if (previous === undefined) delete process.env.VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED
    else process.env.VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED = previous
    window.restore(); dom.restore()
  }
}
