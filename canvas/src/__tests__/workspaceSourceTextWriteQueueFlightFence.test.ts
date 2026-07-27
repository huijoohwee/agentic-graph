import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getWorkspaceFs,
  resetWorkspaceFsForTests,
} from '@/features/workspace-fs/workspaceFs'
import { enqueueWorkspaceSourceTextWrite } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import {
  acquireWorkspaceSeedSyncSuspension,
  resetWorkspaceSeedSyncRuntimeForTests,
} from '@/lib/workspace/workspaceSeedSyncRuntime'

test('workspace source text writes wait behind the Flight seed-sync suspension', async (t) => {
  resetWorkspaceFsForTests()
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(() => {
    resetWorkspaceFsForTests()
    resetWorkspaceSeedSyncRuntimeForTests()
  })

  const workspaceFs = await getWorkspaceFs()
  const folderPath = await workspaceFs.createFolder({
    parentPath: '/',
    name: 'flight-fence-test',
  })
  const filePath = await workspaceFs.createFile({
    parentPath: folderPath,
    name: 'mission.md',
    text: 'before',
  })
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  let settled = false
  const queuedWrite = enqueueWorkspaceSourceTextWrite(filePath, 'after')
    .finally(() => {
      settled = true
    })

  await Promise.resolve()
  await Promise.resolve()
  assert.equal(settled, false)
  assert.equal(await workspaceFs.readFileText(filePath), 'before')

  releaseSuspension()
  assert.equal(await queuedWrite, true)
  assert.equal(await workspaceFs.readFileText(filePath), 'after')
})
