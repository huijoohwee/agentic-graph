import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'

export async function testWorkspaceFileTextPersistsAcrossFsReinit() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const fsA = await getWorkspaceFs()
    await fsA.ensureSeed()
    const filePath = await fsA.createFile({
      parentPath: WORKSPACE_ROOT_PATH,
      name: 'strict-persistence.md',
      text: '# Strict Persistence\n\ninitial',
    })
    const token = 'AG_STRICT_FILE_TEXT_ASSERTION_20260331'
    await fsA.writeFileText(filePath, `${token}\n\nbody`)
    const beforeReload = await fsA.readFileText(filePath)
    if (beforeReload !== `${token}\n\nbody`) {
      throw new Error('expected file text before reinit to match written content')
    }

    resetWorkspaceFsForTests()
    const fsB = await getWorkspaceFs()
    const afterReload = await fsB.readFileText(filePath)
    if (afterReload !== `${token}\n\nbody`) {
      throw new Error('expected file text after reinit to match persisted content')
    }
    const entries = await fsB.listEntries()
    if (!entries.some(e => e.path === filePath && e.kind === 'file')) {
      throw new Error('expected persisted file entry to exist after reinit')
    }
  } finally {
    resetWorkspaceFsForTests()
    restoreDom()
    restoreWindow()
  }
}
