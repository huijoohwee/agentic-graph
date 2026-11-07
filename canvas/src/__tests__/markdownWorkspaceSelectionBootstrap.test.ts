import {
  GEOSPATIAL_WORKSPACE_SEED_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
  WORKSPACE_README_SEED_PATH,
  XR_PHYSICS_WORKSPACE_SEED_PATH,
} from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { resolveWorkspaceStartupDefaultStarterPath } from '@/features/source-files/sourceFilesRuntimeStartup'
import { resolveMarkdownWorkspaceBootstrapActivePath } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionBootstrap'
import { buildWorkspaceEntriesIndex } from '@/lib/markdown-workspace-runtime/workspaceEntriesIndex'

const buildFileEntry = (path: string): WorkspaceEntry => ({
  path,
  parentPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) || '/' : '/',
  kind: 'file',
  name: path.split('/').pop() || '',
  text: '',
  updatedAtMs: 1,
})

export function testMarkdownWorkspaceSelectionBootstrapCentralizesStartupAndFallbackSelection() {
  const defaultSeedEntries = [
    buildFileEntry(WORKSPACE_README_SEED_PATH),
    buildFileEntry(TEST_VALIDATION_WORKSPACE_SEED_PATH),
    buildFileEntry(GEOSPATIAL_WORKSPACE_SEED_PATH),
    buildFileEntry(XR_PHYSICS_WORKSPACE_SEED_PATH),
  ]

  const startup = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex(defaultSeedEntries),
    activePath: null,
    lastSetActivePath: null,
    lastRequestedActivePath: null,
    nowMs: 10_000,
  })
  if (startup !== XR_PHYSICS_WORKSPACE_SEED_PATH || startup.includes('/share/')) {
    throw new Error(`expected bootstrap helper to use the source-backed Physics Playground without a share route, got ${String(startup)}`)
  }

  const startupWithWorkspaceCorpus = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex([
      buildFileEntry('/docs/a.md'),
      buildFileEntry(XR_PHYSICS_WORKSPACE_SEED_PATH),
      buildFileEntry('/docs/b.md'),
    ]),
    activePath: null,
    lastSetActivePath: null,
    lastRequestedActivePath: null,
    nowMs: 10_000,
  })
  if (startupWithWorkspaceCorpus !== XR_PHYSICS_WORKSPACE_SEED_PATH) {
    throw new Error(`expected the canonical Physics Playground to own a cold unselected workspace even when other documents exist, got ${String(startupWithWorkspaceCorpus)}`)
  }

  const sourceFilesStarter = resolveWorkspaceStartupDefaultStarterPath(defaultSeedEntries)
  if (sourceFilesStarter !== XR_PHYSICS_WORKSPACE_SEED_PATH) {
    throw new Error(`expected initial Source Files bootstrap to reuse the Physics Playground starter, got ${String(sourceFilesStarter)}`)
  }

  const preserveExplicitReadmeWithXrAvailable = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex([
      buildFileEntry('/docs/README.md'),
      buildFileEntry(TEST_VALIDATION_WORKSPACE_SEED_PATH),
      buildFileEntry(XR_PHYSICS_WORKSPACE_SEED_PATH),
    ]),
    activePath: '/docs/README.md' as never,
    lastSetActivePath: null,
    lastRequestedActivePath: null,
    nowMs: 10_000,
  })
  if (preserveExplicitReadmeWithXrAvailable !== null) {
    throw new Error(`expected explicit README selection to remain authoritative while XR is available, got ${String(preserveExplicitReadmeWithXrAvailable)}`)
  }

  const preserveValidActivePath = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry('/docs/a.md'), buildFileEntry('/docs/b.md')]),
    activePath: '/docs/b.md' as never,
    lastSetActivePath: { path: '/docs/b.md' as never, atMs: 8_000 },
    lastRequestedActivePath: null,
    nowMs: 10_000,
  })
  if (preserveValidActivePath !== null) {
    throw new Error(`expected valid active path to suppress bootstrap fallback, got ${String(preserveValidActivePath)}`)
  }

  const canonicalDocsMirrorActivePath = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex([
      buildFileEntry('/a.md'),
      buildFileEntry('/docs/a.md'),
    ]),
    activePath: '/a.md' as never,
    lastSetActivePath: null,
    lastRequestedActivePath: null,
    nowMs: 10_000,
  })
  if (canonicalDocsMirrorActivePath !== '/docs/a.md') {
    throw new Error(`expected bootstrap helper to canonicalize root docs aliases to docs mirror entries, got ${String(canonicalDocsMirrorActivePath)}`)
  }

  const preserveCanonicalDocsMirrorActivePath = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex([
      buildFileEntry('/a.md'),
      buildFileEntry('/docs/a.md'),
    ]),
    activePath: '/docs/a.md' as never,
    lastSetActivePath: null,
    lastRequestedActivePath: null,
    nowMs: 10_000,
  })
  if (preserveCanonicalDocsMirrorActivePath !== null) {
    throw new Error(`expected bootstrap helper not to reselect root docs aliases over canonical docs mirror paths, got ${String(preserveCanonicalDocsMirrorActivePath)}`)
  }

  const preserveRecentMissingRequest = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry('/docs/a.md')]),
    activePath: '/docs/missing.md' as never,
    lastSetActivePath: null,
    lastRequestedActivePath: { path: '/docs/missing.md' as never, atMs: 9_500 },
    nowMs: 10_000,
  })
  if (preserveRecentMissingRequest !== null) {
    throw new Error(`expected recent missing request to suppress first-file fallback, got ${String(preserveRecentMissingRequest)}`)
  }

  const preserveStaleMissingActivePath = resolveMarkdownWorkspaceBootstrapActivePath({
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry('/docs/first.md'), buildFileEntry('/docs/second.md')]),
    activePath: '/docs/missing.md' as never,
    lastSetActivePath: { path: '/docs/missing.md' as never, atMs: 1_000 },
    lastRequestedActivePath: null,
    nowMs: 10_000,
  })
  if (preserveStaleMissingActivePath !== null) {
    throw new Error(`expected stale missing active path to remain owned by the caller instead of falling back to an arbitrary first file, got ${String(preserveStaleMissingActivePath)}`)
  }

  for (const entries of [defaultSeedEntries, [
    ...defaultSeedEntries,
    buildFileEntry('/docs/python-lessons/01-variables-in-motion.py'),
  ]]) {
    const remountedSelection = resolveMarkdownWorkspaceBootstrapActivePath({
      entriesIndex: buildWorkspaceEntriesIndex(entries),
      activePath: '/docs/python-lessons/01-variables-in-motion.py' as never,
      lastSetActivePath: null,
      lastRequestedActivePath: null,
      nowMs: 10_000,
    })
    if (remountedSelection !== null) {
      throw new Error(`expected Explorer remount to preserve the authored selection with a complete or partial seed inventory, got ${String(remountedSelection)}`)
    }
  }
}
