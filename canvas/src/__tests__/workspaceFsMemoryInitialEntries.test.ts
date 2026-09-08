import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { isInitializationWorkspacePath, XR_PHYSICS_WORKSPACE_SEED_PATH } from '@/features/workspace-fs/workspaceFs'

export const testWorkspaceFsMemoryInitialEntries = async () => {
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      {
        path: '/a.md',
        parentPath: '/',
        kind: 'file',
        name: 'a.md',
        text: '# A',
        updatedAtMs: 1,
      },
    ],
  })

  await fs.ensureSeed()
  const entries = await fs.listEntries()
  if (!entries.some(e => e.kind === 'file' && e.path === '/a.md')) throw new Error('Expected initial file to be present')

  const text = await fs.readFileText('/a.md')
  if (text !== '# A') throw new Error(`Expected initial file text '# A', got ${String(text)}`)
}

export const testWorkspaceFsMemoryRemovesLegacySourceRootsAndKeepsCanonicalArtifacts = async () => {
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/agentic-os-docs', parentPath: '/', kind: 'folder', name: 'agentic-os-docs', updatedAtMs: 1 },
      { path: '/agentic-os-docs/MEMORY.md', parentPath: '/agentic-os-docs', kind: 'file', name: 'MEMORY.md', text: '# stale', updatedAtMs: 1 },
      { path: '/video-runs', parentPath: '/', kind: 'folder', name: 'video-runs', updatedAtMs: 1 },
      { path: '/video-runs/run.json', parentPath: '/video-runs', kind: 'file', name: 'run.json', text: '{}', updatedAtMs: 1 },
      { path: '/video-runs-24', parentPath: '/', kind: 'folder', name: 'video-runs-24', updatedAtMs: 1 },
      { path: '/video-runs-24/master.mp4', parentPath: '/video-runs-24', kind: 'file', name: 'master.mp4', updatedAtMs: 1 },
      { path: '/video-runs-demo', parentPath: '/', kind: 'folder', name: 'video-runs-demo', updatedAtMs: 1 },
      { path: '/agentic-canvas-os', parentPath: '/', kind: 'folder', name: 'agentic-canvas-os', updatedAtMs: 1 },
      { path: '/agentic-canvas-os/docs', parentPath: '/agentic-canvas-os', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      { path: '/agentic-canvas-os/docs/MEMORY.md', parentPath: '/agentic-canvas-os/docs', kind: 'file', name: 'MEMORY.md', text: '# canonical', updatedAtMs: 1 },
      { path: '/agentic-os-output_20260720T010203Z-video.mp4', parentPath: '/', kind: 'file', name: 'agentic-os-output_20260720T010203Z-video.mp4', updatedAtMs: 1 },
    ],
  })

  await fs.ensureSeed()
  const paths = new Set((await fs.listEntries()).map(entry => entry.path))
  if (paths.has('/agentic-os-docs') || paths.has('/agentic-os-docs/MEMORY.md')) {
    throw new Error('expected the legacy agentic-os-docs tree to be removed during seed reconciliation')
  }
  if ([...paths].some(path => /^\/video-runs(?:-\d+)?(?:\/|$)/.test(path))) {
    throw new Error('expected legacy video-runs trees to be removed during seed reconciliation')
  }
  if (!paths.has('/agentic-canvas-os/docs/MEMORY.md') || !paths.has('/video-runs-demo') || !paths.has('/agentic-os-output_20260720T010203Z-video.mp4')) {
    throw new Error('expected canonical source and current generated artifacts to remain intact')
  }
}

export const testWorkspaceFsMemoryForbidsInitializationFileDelete = async () => {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()
  const before = await fs.listEntries()
  const protectedFiles = before.filter(entry => entry.kind === 'file' && isInitializationWorkspacePath(entry.path))
  if (!protectedFiles.some(entry => entry.path === XR_PHYSICS_WORKSPACE_SEED_PATH)) {
    throw new Error('Expected canonical XR initialization document before exercising deletion protection')
  }
  for (const entry of protectedFiles) await fs.deleteEntry(entry.path)
  const after = await fs.listEntries()
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error('Deleting initialized documents must preserve the complete workspace snapshot')
  }
}

export const testWorkspaceFsMemoryRefreshesStaleInitializationFileText = async () => {
  const current = createMemoryWorkspaceFs()
  await current.ensureSeed()
  const canonicalText = await current.readFileText(XR_PHYSICS_WORKSPACE_SEED_PATH)
  if (!canonicalText?.trim()) throw new Error('Expected nonempty canonical initialization text')
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      {
        path: XR_PHYSICS_WORKSPACE_SEED_PATH,
        parentPath: '/docs/workspace-seeds', kind: 'file',
        name: XR_PHYSICS_WORKSPACE_SEED_PATH.split('/').pop()!,
        text: 'stale initialization content', updatedAtMs: 1,
      },
      {
        path: '/docs/private.md', parentPath: '/docs', kind: 'file', name: 'private.md',
        text: '# Authored document', updatedAtMs: 1,
      },
    ],
  })
  await fs.ensureSeed()
  if (await fs.readFileText(XR_PHYSICS_WORKSPACE_SEED_PATH) !== canonicalText) {
    throw new Error('Expected stale initialized content to refresh from the current canonical source')
  }
  if (await fs.readFileText('/docs/private.md') !== '# Authored document') {
    throw new Error('Refreshing initialized documents must preserve authored content')
  }
}
