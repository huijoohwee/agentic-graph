import fs from 'node:fs'
import path from 'node:path'

import { XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME } from '@/features/workspace-fs/workspaceRunReadyDemos'

type WorkspaceEntries = Awaited<ReturnType<import('@/features/workspace-fs/types').WorkspaceFs['listEntries']>>

export const CANONICAL_XR_WORKSPACE_PATH = `/docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
export const ROOT_XR_WORKSPACE_ALIAS_PATH = `/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
export const IMPORT_XR_WORKSPACE_ALIAS_PATH = `/imports/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
export const MISSING_XR_SOURCE_ALIAS_PATH = `/removed-import/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
export const FOLDER_XR_WORKSPACE_ALIAS_PATH = `/folder-collision/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
export const EXISTING_WORKSPACE_FILE_PATH = '/existing-workspace-note.md'
export const EXISTING_WORKSPACE_FILE_TEXT = '# Keep this existing workspace file'

export const readCanonicalRepoSourceText = (): string => fs.readFileSync(path.resolve(
  process.cwd(),
  '..',
  'docs',
  'workspace-seeds',
  XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
), 'utf8')

export const assertCanonicalXrEntry = (entries: WorkspaceEntries) => {
  const canonicalEntries = entries.filter(entry => (
    entry.kind === 'file' && entry.name === XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME
  ))
  if (canonicalEntries.length !== 1 || canonicalEntries[0]?.path !== CANONICAL_XR_WORKSPACE_PATH) {
    throw new Error(`expected exactly one canonical XR Source Files entry at ${CANONICAL_XR_WORKSPACE_PATH}, got ${JSON.stringify(canonicalEntries)}`)
  }
  const materializedText = String(canonicalEntries[0]?.text || '')
  if (materializedText !== readCanonicalRepoSourceText()) {
    throw new Error('expected the Source Files entry to reuse the canonical in-repo XR document without a duplicated fallback copy')
  }
  for (const requiredMetadata of [
    'status: "runtime-ready"',
    'runtime_status: "runtime-ready"',
    'native_runtime: true',
    'external_dependencies: []',
  ]) {
    if (!materializedText.includes(requiredMetadata)) {
      throw new Error(`expected materialized XR seed to retain native runtime metadata ${requiredMetadata}`)
    }
  }
}

export const assertExistingWorkspaceFilePreserved = (entries: WorkspaceEntries) => {
  const existing = entries.find(entry => entry.path === EXISTING_WORKSPACE_FILE_PATH)
  if (existing?.kind !== 'file' || existing.text !== EXISTING_WORKSPACE_FILE_TEXT) {
    throw new Error(`expected XR bootstrap to preserve unrelated existing workspace content, got ${JSON.stringify(existing)}`)
  }
}

export const assertOnlyCanonicalXrFile = (entries: WorkspaceEntries) => {
  assertCanonicalXrEntry(entries)
  const files = entries.filter(entry => entry.kind === 'file')
  if (files.length !== 1) {
    throw new Error(`expected cleared-all migration to restore only the protected canonical XR document, got ${JSON.stringify(files)}`)
  }
}
