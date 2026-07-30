import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import {
  acquireWorkspaceSeedSyncSuspension,
  beginWorkspaceSeedSyncTask,
  resetWorkspaceSeedSyncRuntimeForTests,
} from '@/lib/workspace/workspaceSeedSyncRuntime'
import { readWorkspaceExplorerReadOnlySnapshot } from '@/lib/markdown-workspace-runtime/workspaceExplorerReadOnlySnapshot'

test('Flight seed-sync suspension lets Explorer read the existing local Folder docs snapshot without mutation', async t => {
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(resetWorkspaceSeedSyncRuntimeForTests)
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  t.after(releaseSuspension)

  let ensureSeedCalls = 0
  let listEntriesCalls = 0
  let writeCalls = 0
  const entries: WorkspaceEntry[] = [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    {
      path: '/docs/flight.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'flight.md',
      text: '',
      updatedAtMs: 1,
    },
  ]
  const fs: WorkspaceFs = {
    ensureSeed: async () => {
      ensureSeedCalls += 1
      throw new Error('Explorer snapshot must not seed while Flight owns the suspension')
    },
    listEntries: async () => {
      listEntriesCalls += 1
      return entries
    },
    readFileText: async path => (path === '/docs/flight.md' ? '# Flight docs\n' : null),
    writeFileText: async () => {
      writeCalls += 1
    },
    createFile: async () => '/docs/unexpected.md',
    createFolder: async () => '/unexpected',
    deleteEntry: async () => void 0,
  }

  assert.equal(beginWorkspaceSeedSyncTask(), null)
  const snapshot = await readWorkspaceExplorerReadOnlySnapshot({
    fs,
    activePath: '/docs/flight.md',
    sourcesByPath: {
      '/docs/flight.md': { kind: 'local', originalName: 'flight.md' },
    },
  })

  assert.equal(ensureSeedCalls, 0)
  assert.equal(listEntriesCalls, 1)
  assert.equal(writeCalls, 0)
  assert.ok(snapshot.entries.some(entry => entry.kind === 'folder' && entry.path === '/docs'))
  assert.equal(
    snapshot.entries.find(entry => entry.kind === 'file' && entry.path === '/docs/flight.md')?.text,
    '# Flight docs\n',
  )
  assert.deepEqual(snapshot.sourcesByPath, {
    '/docs/flight.md': { kind: 'local', originalName: 'flight.md' },
  })
})

test('deferred Explorer refresh hydrates local state but reserves seed and Source Files work for resume', () => {
  const runtimePath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceExplorerState.tsx')
  const snapshotPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'workspaceExplorerReadOnlySnapshot.ts')
  const runtime = readFileSync(runtimePath, 'utf8')
  const snapshot = readFileSync(snapshotPath, 'utf8')
  const branchStart = runtime.indexOf('if (!finishSeedSyncTask) {')
  const branchEnd = runtime.indexOf('workspaceRefreshDeferredRef.current = false', branchStart)
  assert.ok(branchStart >= 0 && branchEnd > branchStart)
  const deferredBranch = runtime.slice(branchStart, branchEnd)

  assert.match(snapshot, /const entries = await args\.fs\.listEntries\(\)/)
  assert.match(snapshot, /hydrateWorkspaceEntriesInlineText/)
  assert.match(snapshot, /pruneWorkspaceEntriesForInlineSnapshot/)
  assert.doesNotMatch(snapshot, /ensureSeed|mergeWorkspaceEntriesIntoSourceFiles|scheduleApplyComposedGraphFromSourceFiles/)
  assert.match(deferredBranch, /workspaceRefreshDeferredRef\.current = true/)
  assert.match(deferredBranch, /readWorkspaceExplorerReadOnlySnapshot/)
  assert.match(deferredBranch, /currentRuntime\.setEntries/)
  assert.match(deferredBranch, /currentRuntime\.setSourcesByPath/)
  assert.match(deferredBranch, /currentRuntime\.setLoading\(false\)/)
  assert.doesNotMatch(deferredBranch, /ensureSeed|mergeWorkspaceEntriesIntoSourceFiles|scheduleApplyComposedFromSourceFiles/)
})
