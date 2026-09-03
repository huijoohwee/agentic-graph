import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { importWorkspaceLocalFiles } from '@/features/markdown-workspace/workspaceImport/localImport'
import { buildPendingLocalImportStub } from '@/features/markdown-workspace/workspaceImport/pendingLocalImport'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'

export async function testWorkspaceLocalImportOverwritesPendingStubInsteadOfRenaming() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()

  const path = normalizeWorkspacePath('/agentic-graph-demo-video.md')
  await fs.createFile({
    parentPath: '/',
    name: 'agentic-graph-demo-video.md',
    text: buildPendingLocalImportStub({ kind: 'text', originalName: 'agentic-graph-demo-video.md', source: 'file' }),
  })

  const file = new File(['hello-world'], 'agentic-graph-demo-video.md', { type: 'text/markdown' })
  const res = await importWorkspaceLocalFiles({ fs, files: [file], parentPath: '/' })

  if (!res.createdPaths.includes(path)) {
    throw new Error(`expected createdPaths to include ${path}`)
  }
  if (res.createdPaths.some(p => String(p).includes('-2'))) {
    throw new Error('expected import to overwrite stub instead of creating -2 renamed file')
  }
  const text = await fs.readFileText(path)
  if (String(text || '') !== 'hello-world') {
    throw new Error('expected stub to be overwritten with imported file text')
  }
}
