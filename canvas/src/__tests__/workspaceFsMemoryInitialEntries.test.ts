import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import {
  GEOSPATIAL_WORKSPACE_SEED_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
  WORKSPACE_README_SEED_PATH,
} from '@/features/workspace-fs/workspaceFs'

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
      { path: '/kgc-output_20260720T010203Z-video.mp4', parentPath: '/', kind: 'file', name: 'kgc-output_20260720T010203Z-video.mp4', updatedAtMs: 1 },
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
  if (!paths.has('/agentic-canvas-os/docs/MEMORY.md') || !paths.has('/video-runs-demo') || !paths.has('/kgc-output_20260720T010203Z-video.mp4')) {
    throw new Error('expected canonical source and current generated artifacts to remain intact')
  }
}

export const testWorkspaceFsMemoryForbidsInitializationFileDelete = async () => {
  const fs = createMemoryWorkspaceFs()

  await fs.ensureSeed()
  await fs.deleteEntry(WORKSPACE_README_SEED_PATH)
  await fs.deleteEntry(TEST_VALIDATION_WORKSPACE_SEED_PATH)
  await fs.deleteEntry(GEOSPATIAL_WORKSPACE_SEED_PATH)

  const entries = await fs.listEntries()
  if (!entries.some(e => e.kind === 'file' && e.path === WORKSPACE_README_SEED_PATH)) throw new Error('Expected README initialization file to remain after delete')
  if (!entries.some(e => e.kind === 'file' && e.path === TEST_VALIDATION_WORKSPACE_SEED_PATH)) throw new Error('Expected video demo initialization file to remain after delete')
  if (!entries.some(e => e.kind === 'file' && e.path === GEOSPATIAL_WORKSPACE_SEED_PATH)) throw new Error('Expected geospatial initialization file to remain after delete')
}

export const testWorkspaceFsMemoryRefreshesStaleInitializationFileText = async () => {
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      {
        path: WORKSPACE_README_SEED_PATH,
        parentPath: '/',
        kind: 'file',
        name: 'README.md',
        text: 'stale README initialization content',
        updatedAtMs: 1,
      },
      {
        path: TEST_VALIDATION_WORKSPACE_SEED_PATH,
        parentPath: '/',
        kind: 'file',
        name: TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
        text: 'stale video demo initialization content',
        updatedAtMs: 1,
      },
      {
        path: GEOSPATIAL_WORKSPACE_SEED_PATH,
        parentPath: '/',
        kind: 'file',
        name: 'agenticgraph-maps-grabmap-multim-demo.md',
        text: 'stale geospatial initialization content',
        updatedAtMs: 1,
      },
    ],
  })

  await fs.ensureSeed()

  const readmeText = await fs.readFileText(WORKSPACE_README_SEED_PATH)
  const videoDemoText = await fs.readFileText(TEST_VALIDATION_WORKSPACE_SEED_PATH)
  const geospatialText = await fs.readFileText(GEOSPATIAL_WORKSPACE_SEED_PATH)
  if (!String(readmeText || '').includes('kgCanvas2dRenderer: "d3"')) throw new Error('Expected stale README initialization content to refresh from current seed source')
  if (!String(videoDemoText || '').includes('kgCanvas2dRenderer: "storyboard"')) throw new Error('Expected stale video demo initialization content to refresh from current seed source')
  if (!String(geospatialText || '').includes('kgCanvasSurfaceMode: "geospatial"')) throw new Error('Expected stale geospatial initialization content to refresh from current seed source')
}
