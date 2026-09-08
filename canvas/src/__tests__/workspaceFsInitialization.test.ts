import assert from 'node:assert/strict'
import { createResilientWorkspaceFs, getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testWorkspaceFsConcurrentInitializationSharesInstance() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const instances = await Promise.all(Array.from({ length: 16 }, () => getWorkspaceFs()))
    for (const instance of instances) assert.equal(instance, instances[0], 'concurrent callers must share initialization')
    assert.equal(await getWorkspaceFs(), instances[0], 'settled calls must reuse the initialized instance')
    assert.ok((await instances[0]!.listEntries()).length > 0, 'initialization must complete before returning')
  } finally {
    resetWorkspaceFsForTests()
    restore()
  }
}

export async function testWorkspaceFsResetDuringInitializationPreservesNewInstance() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const oldPending = getWorkspaceFs()
    resetWorkspaceFsForTests()
    const currentPending = getWorkspaceFs()
    const [oldInstance, currentInstance] = await Promise.all([oldPending, currentPending])
    assert.notEqual(oldInstance, currentInstance, 'reset must start a separate initialization')
    assert.equal(await getWorkspaceFs(), currentInstance, 'old initialization must not replace the current instance')
    let rejectRead: (error: Error) => void = () => { throw new Error('read did not start') }
    const oldWrapper = createResilientWorkspaceFs({
      ...currentInstance,
      readFileText: () => new Promise<string | null>((_resolve, reject) => { rejectRead = reject }),
    })
    const staleRead = oldWrapper.readFileText('/test-initialization-read-only-missing.md')
    resetWorkspaceFsForTests()
    const latestInstance = await getWorkspaceFs()
    rejectRead(new Error('delayed old backend failure'))
    await staleRead
    assert.equal(await getWorkspaceFs(), latestInstance, 'old fallback must not replace the new filesystem')
  } finally {
    resetWorkspaceFsForTests()
    restore()
  }
}
