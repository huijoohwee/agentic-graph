import path from 'node:path'

import { XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { readCanonicalRepoSourceText } from './xrPhysicsWorkspaceBootstrap.testSupport'

export async function testXrPhysicsCanonicalSeedReplacesConflictingDocsMirrorEntries() {
  const { mergeCanonicalXrPhysicsWorkspaceSeedIntoDocsMirror } = await import('@/features/workspace-fs/workspaceFs')
  const canonicalRelPath = `workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
  const merged = await mergeCanonicalXrPhysicsWorkspaceSeedIntoDocsMirror([
    { relPath: canonicalRelPath, text: 'conflicting external source', updatedAtMs: Date.now() + 10_000 },
    { relPath: `duplicate/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`, text: 'duplicate external source', updatedAtMs: Date.now() + 20_000 },
    { relPath: 'workspace-seeds/unrelated.md', text: '# Unrelated', updatedAtMs: 1 },
  ])
  const matching = merged.filter(entry => path.basename(entry.relPath).toLowerCase() === XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME.toLowerCase())
  if (
    matching.length !== 1
    || matching[0]?.relPath !== canonicalRelPath
    || matching[0]?.text !== readCanonicalRepoSourceText()
  ) {
    throw new Error(`expected the canonical in-repo XR seed to replace all conflicting mirror entries, got ${JSON.stringify(matching)}`)
  }
  if (!merged.some(entry => entry.relPath === 'workspace-seeds/unrelated.md')) {
    throw new Error('expected conflict replacement to preserve unrelated docs mirror entries')
  }
}
