import { mergeWorkspaceEntriesIntoSourceFiles } from '@/features/workspace-fs/syncToSourceFiles'
import { WORKSPACE_README_SEED_PATH, GEOSPATIAL_WORKSPACE_SEED_PATH } from '@/features/workspace-fs/workspaceFs'
import { WORKSPACE_DOCS_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'

export async function testWorkspaceSourceFilesSyncSuppressesLegacyRootSeedAliasesWhenDocsMirrorExists() {
  const entries: WorkspaceEntry[] = []
  const sourcesByPath: WorkspaceSourceIndex = {}
  const pairs = [WORKSPACE_README_SEED_PATH, GEOSPATIAL_WORKSPACE_SEED_PATH].map(root => {
    const name = root.split('/').pop()!
    const mirror = `${WORKSPACE_DOCS_SOURCE_ROOT_PATH}/${name}`
    entries.push(
      { kind: 'file', path: root, parentPath: '/', name, text: '# Root seed', updatedAtMs: 1 },
      { kind: 'file', path: mirror, parentPath: WORKSPACE_DOCS_SOURCE_ROOT_PATH, name, text: `# Mirrored seed ${name}`, updatedAtMs: 2 },
    )
    sourcesByPath[mirror] = { kind: 'local', originalName: name }
    return { root, mirror, name }
  })
  const rootsOnly = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [], workspaceEntries: entries.filter(entry => pairs.some(pair => pair.root === entry.path)), sourcesByPath: {},
  })
  if (rootsOnly.length !== pairs.length || rootsOnly.some(file => file.text !== '# Root seed')) {
    throw new Error('Root seed content must remain when no canonical mirror exists')
  }
  let previous = mergeWorkspaceEntriesIntoSourceFiles({ existing: rootsOnly, workspaceEntries: entries, sourcesByPath })
  for (const workspaceEntries of [entries, entries.slice().reverse()]) {
    const next = mergeWorkspaceEntriesIntoSourceFiles({ existing: previous, workspaceEntries, sourcesByPath })
    if (next.length !== pairs.length) throw new Error('Expected exactly one Source File per seed document')
    for (const { name } of pairs) {
      const document = next.find(file => file.text === `# Mirrored seed ${name}`)
      if (!document) throw new Error(`Expected canonical mirror content for ${name}`)
      const prior = previous.find(file => file.source?.path === document.source?.path)
      if (!prior || document.id !== prior.id) throw new Error(`Expected stable reconciled source identity for ${name}`)
    }
    previous = next
  }
}
