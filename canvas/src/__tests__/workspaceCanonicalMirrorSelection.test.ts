import path from 'node:path'
import os from 'node:os'
import fsPromises from 'node:fs/promises'
import { readWorkspaceSelectionResolvedTextForActivePath } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceSelection'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { initNodeWindowHarness } from '@/tests/lib/windowHarness'

// These cases exercise configured filesystem mirrors, outside repo-local browser bootstrap.
const withNodeMirrorEnvironment = async (run: () => Promise<void>): Promise<void> => {
  const scope = initNodeWindowHarness()
  const previousRepoLocal = process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL
  process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL = 'false'
  const errors: unknown[] = []
  try { await run() }
  catch (error) { errors.push(error) }
  finally {
    if (previousRepoLocal === undefined) delete process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL
    else process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL = previousRepoLocal
    try { scope.restore() } catch (error) { errors.push(error) }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, errors.map(error => String((error as Error)?.message ?? error)).join('; '))
}

export async function testWorkspaceSelectionSwitchPrefersCanonicalMirrorTextOverPollutedWorkspaceFs() {
  return withNodeMirrorEnvironment(async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-switch-docs-mirror-'))
    const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    const previousStorageBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
    delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    try {
      await fsPromises.writeFile(path.join(tempRoot, 'agentic-graph-video-demo.md'), '# agentic-graph Video Demo')
      const pollutedVideoEntry: WorkspaceEntry = {
        path: '/docs/agentic-graph-video-demo.md',
        parentPath: '/docs',
        kind: 'file',
        name: 'agentic-graph-video-demo.md',
        text: '# agentic-graph Token Economics Model Demo',
        updatedAtMs: 1,
      }
      const resolved = await readWorkspaceSelectionResolvedTextForActivePath({
        activePath: '/docs/agentic-graph-video-demo.md',
        activeEntry: pollutedVideoEntry,
        preferPathResolvedText: true,
        storageFallbackByPath: new Map<string, string>(),
        fs: {
          ensureSeed: async () => true,
          listEntries: async () => [],
          readFileText: async path => String(path || '') === '/docs/agentic-graph-video-demo.md'
            ? '# agentic-graph Token Economics Model Demo'
            : null,
          writeFileText: async () => {},
          createFile: async () => '/docs/new.md',
          createFolder: async () => '/docs/new-folder',
          deleteEntry: async () => {},
        },
      })
      if (resolved !== '# agentic-graph Video Demo') {
        throw new Error(`expected selected video demo path to prefer canonical mirror text over polluted workspace fs text, got ${JSON.stringify(resolved)}`)
      }
    } finally {
      if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
      else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
      if (typeof previousStorageBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousStorageBaseUrl
      else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })
}

export async function testWorkspaceSelectionCanonicalMirrorRefreshesAfterExternalFileChange() {
  return withNodeMirrorEnvironment(async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-switch-docs-mirror-refresh-'))
    const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    const previousStorageBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
    delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    try {
      const mirrorFile = path.join(tempRoot, 'agentic-graph-video-demo.md')
      const fallbackByPath = new Map<string, string>()
      const pollutedVideoEntry: WorkspaceEntry = {
        path: '/docs/agentic-graph-video-demo.md',
        parentPath: '/docs',
        kind: 'file',
        name: 'agentic-graph-video-demo.md',
        text: '# agentic-graph Token Economics Model Demo',
        updatedAtMs: 1,
      }
      const fs = {
        ensureSeed: async () => true,
        listEntries: async () => [],
        readFileText: async () => '# agentic-graph Token Economics Model Demo',
        writeFileText: async () => {},
        createFile: async () => '/docs/new.md',
        createFolder: async () => '/docs/new-folder',
        deleteEntry: async () => {},
      }
      await fsPromises.writeFile(mirrorFile, '# agentic-graph Token Economics Model Demo')
      const staleResolved = await readWorkspaceSelectionResolvedTextForActivePath({
        activePath: '/docs/agentic-graph-video-demo.md',
        activeEntry: pollutedVideoEntry,
        preferPathResolvedText: true,
        storageFallbackByPath: fallbackByPath,
        fs,
      })
      if (staleResolved !== '# agentic-graph Token Economics Model Demo') {
        throw new Error(`expected first canonical mirror read to use current mirror text, got ${JSON.stringify(staleResolved)}`)
      }

      await fsPromises.writeFile(mirrorFile, '# agentic-graph Video Demo')
      const refreshedResolved = await readWorkspaceSelectionResolvedTextForActivePath({
        activePath: '/docs/agentic-graph-video-demo.md',
        activeEntry: pollutedVideoEntry,
        preferPathResolvedText: true,
        storageFallbackByPath: fallbackByPath,
        fs,
      })
      if (refreshedResolved !== '# agentic-graph Video Demo') {
        throw new Error(`expected canonical mirror reads to refresh after external file changes, got ${JSON.stringify(refreshedResolved)}`)
      }
    } finally {
      if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
      else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
      if (typeof previousStorageBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousStorageBaseUrl
      else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })
}
