import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { upsertWorkspaceTextDocument } from '@/features/workspace-fs/upsertWorkspaceTextDocument'
import { createWorkspaceFolderTreeEnsurer } from '@/features/workspace-fs/ensureFolderTreeIfMissing'

test('text upserts reuse initialization while explicit seed refresh remains available', async () => {
  const stored = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 }] })
  let seeds = 0
  const fs = { ...stored, async ensureSeed() { seeds += 1; return stored.ensureSeed() } }
  await Promise.all(Array.from({ length: 20 }, (_, i) => upsertWorkspaceTextDocument({ fs, name: `page-${i}.md`, text: `page ${i}` })))
  await upsertWorkspaceTextDocument({ fs, name: 'page-0.md', text: 'updated' })
  assert.equal(seeds, 1)
  assert.equal(await stored.readFileText('/page-0.md'), 'updated')
  await fs.ensureSeed()
  assert.equal(seeds, 2)
})

test('one folder operation serializes shared ancestors and reports creation failures', async () => {
  const fs = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 }] })
  const ensure = await createWorkspaceFolderTreeEnsurer(fs)
  await Promise.all([ensure('/crawl/shared/a'), ensure('/crawl/shared/b'), ensure('/crawl/shared/a')])
  const folders = (await fs.listEntries()).filter(entry => entry.kind === 'folder').map(entry => entry.path)
  assert.deepEqual(folders.filter(path => path.startsWith('/crawl')), ['/crawl', '/crawl/shared', '/crawl/shared/a', '/crawl/shared/b'])
  const broken = await createWorkspaceFolderTreeEnsurer({ ...fs, async createFolder() { throw new Error('disk unavailable') } })
  await assert.rejects(broken('/new/folder'), /disk unavailable/)
})

test('failed initialization is retried without writing a partial document', async () => {
  const fs = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 }] })
  let attempts = 0
  const retryable = { ...fs, async ensureSeed() {
    if (++attempts === 1) throw new Error('seed unavailable')
    return fs.ensureSeed()
  } }
  await assert.rejects(upsertWorkspaceTextDocument({ fs: retryable, name: 'page.md', text: 'retained' }), /seed unavailable/)
  assert.equal(await fs.readFileText('/page.md'), null)
  await upsertWorkspaceTextDocument({ fs: retryable, name: 'page.md', text: 'retained' })
  assert.equal(attempts, 2)
  assert.equal(await fs.readFileText('/page.md'), 'retained')
})
