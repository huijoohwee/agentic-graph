import path from 'node:path'
import os from 'node:os'
import fsPromises from 'node:fs/promises'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  readWorkspaceImportShareExportRootPathSetting,
  writeWorkspaceImportShareExportRootPathSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import {
  projectWorkspaceEntriesToSourceFilesExplorer,
  resolveWorkspaceSourceRootPaths,
} from '@/features/workspace-fs/workspaceSourceRoots'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import { resolveWorkspaceRepoLocalRunReadyBootstrap } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { resolveKnowgrphWorkspaceSeedsAbsRoot, resolveWorkspaceDocsMirrorLocalRootRequests } from '@/features/workspace-fs/workspaceDocsMirrorLocalRoots'
import { resetCanonicalPublishedDocsMirrorCacheForTests } from '@/features/workspace-fs/workspaceGithubDocsMirror'
import { toWorkspaceDocsMirrorPath } from '@/features/workspace-fs/workspaceFsPersistedReconciliation'

export function testWorkspaceSourceRootPathsKeepAgenticOsDocsOutOfExplorer(): void {
  const { restore } = initJsdomHarness()
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousValue = readWorkspaceImportShareExportRootPathSetting()
  try {
    if (!resolveWorkspaceRepoLocalRunReadyBootstrap({ viteDev: true, configuredValue: '' })) {
      throw new Error('ordinary Vite Dev must use the repo-local Agentic docs authority')
    }
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = path.join(os.tmpdir(), 'kg-root', 'docs')
    writeWorkspaceImportShareExportRootPathSetting('/docs_')
    const roots = resolveWorkspaceSourceRootPaths()
    if (roots.includes('/agentic-canvas-os/docs')) {
      throw new Error(`expected runtime-only agentic-canvas-os/docs root to stay out of Source Files, got ${roots.join(', ')}`)
    }
    if (!roots.includes('/notes')) {
      throw new Error(`expected authored notes to remain isolated as a workspace source root, got ${roots.join(', ')}`)
    }
    if (!roots.includes('/docs_')) {
      throw new Error(`expected generated output root to remain visible in Source Files, got ${roots.join(', ')}`)
    }
    if (!roots.includes('/docs')) {
      throw new Error(`expected runnable demo root to remain visible in Source Files, got ${roots.join(', ')}`)
    }
    const visible = projectWorkspaceEntriesToSourceFilesExplorer([
      { path: '/agentic-canvas-os', parentPath: '/', kind: 'folder', name: 'agentic-canvas-os', updatedAtMs: 1 },
      { path: '/agentic-canvas-os/docs', parentPath: '/agentic-canvas-os', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      { path: '/agentic-canvas-os/docs/AGENTS.md', parentPath: '/agentic-canvas-os/docs', kind: 'file', name: 'AGENTS.md', text: '# Runtime', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      { path: '/docs/demo.md', parentPath: '/docs', kind: 'file', name: 'demo.md', text: '# Demo', updatedAtMs: 1 },
      { path: '/docs_', parentPath: '/', kind: 'folder', name: 'docs_', updatedAtMs: 1 },
      { path: '/docs_/output.md', parentPath: '/docs_', kind: 'file', name: 'output.md', text: '# Output', updatedAtMs: 1 },
      { path: '/unrelated.md', parentPath: '/', kind: 'file', name: 'unrelated.md', text: '# Hidden', updatedAtMs: 1 },
    ], roots)
    const visiblePaths = visible.map(entry => entry.path)
    if (visiblePaths.join(',') !== '/docs,/docs/demo.md,/docs_,/docs_/output.md') {
      throw new Error(`expected Explorer to project only operator-owned source roots, got ${visiblePaths.join(', ')}`)
    }
    if (toWorkspaceDocsMirrorPath('agentic-canvas-os/docs/AGENTS.md') !== '/agentic-canvas-os/docs/AGENTS.md') {
      throw new Error('expected Agentic Canvas OS documents to retain their runtime-only workspace namespace')
    }
    if (toWorkspaceDocsMirrorPath('workspace-seeds/demo.md') !== '/docs/workspace-seeds/demo.md') {
      throw new Error('expected demo documents to remain mounted under the visible /docs root')
    }
    if (toWorkspaceDocsMirrorPath('docs_/runs/output.md') !== '/docs_/runs/output.md') {
      throw new Error('expected generated outputs to remain mounted under the visible /docs_ root')
    }
  } finally {
    writeWorkspaceImportShareExportRootPathSetting(previousValue)
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    restore()
  }
}

export async function testWorkspaceSeedProviderIncludesSiblingAgenticOsDocsMirrorRoot() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const tmpRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-agentic-docs-mirror-'))
  const docsRoot = path.join(tmpRoot, 'docs')
  const agenticDocsRoot = path.join(tmpRoot, 'agentic-canvas-os', 'docs')
  const previousAgenticDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = docsRoot
    process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT = agenticDocsRoot
    process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '1'
    await fsPromises.mkdir(docsRoot, { recursive: true })
    await fsPromises.mkdir(agenticDocsRoot, { recursive: true })
    await fsPromises.writeFile(path.join(docsRoot, 'workspace-readme.md'), '# Docs Root\n')
    await fsPromises.writeFile(path.join(agenticDocsRoot, 'RUNTIME-READINESS.md'), '# Runtime Readiness\n')

    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const relPaths = new Set(mirrored.map(entry => entry.relPath))
    if (!relPaths.has('workspace-readme.md')) throw new Error(`expected canonical docs root entry to stay unprefixed, got ${JSON.stringify([...relPaths])}`)
    if (!relPaths.has('agentic-canvas-os/docs/RUNTIME-READINESS.md')) throw new Error(`expected sibling agentic-canvas-os/docs entry to keep its workspace root prefix, got ${JSON.stringify([...relPaths])}`)
    if (relPaths.has('RUNTIME-READINESS.md')) throw new Error('expected sibling agentic-canvas-os/docs entry not to flatten into the docs root')
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousAgenticDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT = previousAgenticDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT
    if (typeof previousRepoLocal === 'string') process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    else delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    await fsPromises.rm(tmpRoot, { recursive: true, force: true })
  }
}

export function testWorkspaceDocsMirrorLocalRootsSelectsSoleAgenticRootWhenPrimaryRootIsAbsent(): void {
  const canonicalSeedsRoot = resolveKnowgrphWorkspaceSeedsAbsRoot({
    docsAbsRoot: '/workspace/huijoohwee/docs',
  })
  if (canonicalSeedsRoot !== '/workspace/knowgrph/docs/workspace-seeds') {
    throw new Error(`expected sibling docs configuration to derive the canonical Knowgrph seed root, got ${canonicalSeedsRoot}`)
  }
  const soleAgenticRoot = resolveWorkspaceDocsMirrorLocalRootRequests({
    docsAbsRoot: '',
    agenticDocsAbsRoot: '/tmp/agentic-canvas-os/docs',
  })
  if (soleAgenticRoot.length !== 1 || soleAgenticRoot[0]?.workspaceRootName) {
    throw new Error(`expected the sole Agentic docs root to project unprefixed, got ${JSON.stringify(soleAgenticRoot)}`)
  }
  const combined = resolveWorkspaceDocsMirrorLocalRootRequests({
    docsAbsRoot: '/tmp/knowgrph/docs',
    outputDocsAbsRoot: '/tmp/huijoohwee/docs_',
    agenticDocsAbsRoot: '/tmp/agentic-canvas-os/docs',
    knowgrphWorkspaceSeedsAbsRoot: '/tmp/knowgrph/docs/workspace-seeds',
  })
  if (combined[0]?.excludedRelPathRoots?.[0] !== 'workspace-seeds') {
    throw new Error(`expected the general docs root to exclude the Knowgrph-owned seed subtree, got ${JSON.stringify(combined)}`)
  }
  if (combined[1]?.workspaceRootName !== 'workspace-seeds') {
    throw new Error(`expected the Knowgrph seed root to retain its Explorer namespace, got ${JSON.stringify(combined)}`)
  }
  if (combined[2]?.workspaceRootName !== 'docs_') {
    throw new Error(`expected the output root to retain its docs_ namespace, got ${JSON.stringify(combined)}`)
  }
  if (combined[3]?.workspaceRootName !== 'agentic-canvas-os/docs') {
    throw new Error(`expected a secondary Agentic docs root to retain its namespace, got ${JSON.stringify(combined)}`)
  }
}

export async function testWorkspaceSeedProviderUsesDeclaredRepoLocalAgenticDocsAuthority() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousAgenticDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousFetch = globalThis.fetch
  const globals = globalThis as typeof globalThis & { window?: Window }
  const previousWindow = globals.window
  const tmpRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-agentic-docs-local-'))
  const agenticDocsRoot = path.join(tmpRoot, 'agentic-canvas-os', 'docs')
  try {
    delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT = agenticDocsRoot
    process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '1'
    await fsPromises.mkdir(agenticDocsRoot, { recursive: true })
    await fsPromises.writeFile(path.join(agenticDocsRoot, 'README.md'), '# Local Agentic Docs\n')
    globalThis.fetch = async input => {
      throw new Error(`repo-local Agentic docs must not request a remote source: ${String(input)}`)
    }
    delete globals.window
    resetCanonicalPublishedDocsMirrorCacheForTests()

    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const readme = mirrored.find(entry => entry.relPath === 'README.md')
    if (readme?.text !== '# Local Agentic Docs\n') {
      throw new Error(`expected declared repo-local README authority, got ${JSON.stringify(mirrored)}`)
    }
    if (mirrored.some(entry => entry.relPath === 'agentic-canvas-os/docs/README.md')) {
      throw new Error('expected the sole Agentic docs root to materialize directly beneath /docs')
    }
  } finally {
    resetCanonicalPublishedDocsMirrorCacheForTests()
    globalThis.fetch = previousFetch
    if (previousWindow) globals.window = previousWindow
    else delete globals.window
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousAgenticDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT = previousAgenticDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT
    if (typeof previousRepoLocal === 'string') process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    else delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    await fsPromises.rm(tmpRoot, { recursive: true, force: true })
  }
}
