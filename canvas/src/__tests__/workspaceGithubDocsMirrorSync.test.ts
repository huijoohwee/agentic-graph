import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  readWorkspaceImportDefaultSourceUrlSetting,
  writeWorkspaceImportDefaultSourceUrlSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import {
  readWorkspaceInitializationDocsMirrorEntries,
} from '@/features/workspace-fs/workspaceSeedProvider'
import { resetCanonicalPublishedDocsMirrorCacheForTests } from '@/features/workspace-fs/workspaceGithubDocsMirror'
import { readPublishedAgenticDocsMirrorEntries } from '@/features/workspace-fs/workspacePublishedAgenticDocsSource'
import { resetWorkspaceSeedProviderStorageCacheForTests } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { readWorkspaceActiveDocumentResolvedText } from '@/features/source-files/sourceFilesRuntimeActive'
import { materializeActiveWorkspaceEntryIntoSourceFiles } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { mergeWorkspaceEntriesIntoSourceFiles } from '@/features/workspace-fs/syncToSourceFiles'
import {
  normalizeMarkdownWorkspaceDocsSourcePathFromCanonicalPath,
  readStorageCanonicalPathCandidatesForWorkspacePath,
} from '@/features/source-files/sourceFilesStoragePaths'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

type MockRoute = { test: (url: string) => boolean; handler: (url: string, init?: RequestInit) => Response | Promise<Response> }

const KG_GITHUB_ROOT = '/workspace'
const KG_AGENTIC_CANVAS_OS_DOCS_ROOT = `${KG_GITHUB_ROOT}/agentic-canvas-os/docs`

const jsonResponse = (obj: unknown, status: number = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

const textResponse = (text: string, status: number = 200) =>
  new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(text.length) },
  })

const decodeProxyUrl = (url: string): string => {
  if (!url.startsWith('/__fetch_remote')) return url
  const q = url.split('?')[1] || ''
  const pairs = q.split('&').map(p => p.split('='))
  const urlParam = pairs.find(([k]) => k === 'url')?.[1] || ''
  return decodeURIComponent(urlParam)
}

export async function testActiveWorkspaceMaterializationReplacesStaleTokenEconomicsSourceText() {
  const { restore } = initJsdomHarness()
  try {
    const targetPath = '/docs/knowgrph-token-economics-model-demo.md'
    const sourcePath = `workspace:${targetPath}`
    const staleText = '# stale token economics\n'
    const remoteText = '# remote token economics\n\nCurrent GitHub docs content wins.\n'

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setSourceFiles([{
      id: 'ws:token-economics',
      name: 'knowgrph-token-economics-model-demo.md',
      text: staleText,
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: sourcePath },
    }])

    const workspaceEntries = [{
      path: targetPath,
      parentPath: '/docs',
      kind: 'file',
      name: 'knowgrph-token-economics-model-demo.md',
      text: remoteText,
      updatedAtMs: 123,
    }] as Awaited<ReturnType<WorkspaceFs['listEntries']>>

    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => workspaceEntries,
      readFileText: async path => (String(path || '').trim() === targetPath ? remoteText : null),
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }

    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: targetPath,
      fs,
      activeWorkspaceEntriesSnapshot: workspaceEntries,
      applyToGraph: false,
    })

    const active = useGraphStore
      .getState()
      .sourceFiles
      .find(file => String(file.source?.path || '') === sourcePath) || null
    if (!active) throw new Error('expected token economics source file to stay materialized')
    if (active.text !== remoteText) {
      throw new Error(`expected refreshed workspace text to replace stale Source Files text, got ${JSON.stringify(active.text)}`)
    }
  } finally {
    restore()
  }
}

export function testSourceFilesMergeReplacesStaleTextAcrossDocsTree() {
  const workspaceEntries = [
    { path: '/docs/a.md', parentPath: '/docs', kind: 'file', name: 'a.md', text: '# A remote\n', updatedAtMs: 10 },
    { path: '/docs/b.json', parentPath: '/docs', kind: 'file', name: 'b.json', text: '{"remote":true}\n', updatedAtMs: 11 },
    { path: '/docs/empty.md', parentPath: '/docs', kind: 'file', name: 'empty.md', text: '', updatedAtMs: 12 },
    { path: '/docs/model.gltf', parentPath: '/docs', kind: 'file', name: 'model.gltf', text: '{"asset":{"version":"2.0"}}\n', updatedAtMs: 13 },
  ] as Awaited<ReturnType<WorkspaceFs['listEntries']>>
  const existing = workspaceEntries.map((entry, index) => ({
    id: `ws:stale:${index}`,
    name: entry.name,
    text: `stale ${entry.name}`,
    enabled: index === 0,
    status: 'idle' as const,
    source: { kind: 'local' as const, path: `workspace:${entry.path}` },
  }))

  const merged = mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries,
    sourcesByPath: {},
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs'],
  })
  const byPath = new Map(merged.map(file => [String(file.source?.path || ''), String(file.text ?? '')]))
  for (const entry of workspaceEntries) {
    const sourcePath = `workspace:${entry.path}`
    if (byPath.get(sourcePath) !== String(entry.text ?? '')) {
      throw new Error(`expected ${sourcePath} Source Files text to match current docs workspace entry`)
    }
  }
}

export async function testWorkspaceSeedProviderUsesPublishedStorageForAgenticDocs() {
  const { restore } = initJsdomHarness()
  const g = globalThis as typeof globalThis & { fetch?: typeof fetch }
  const originalFetch = g.fetch
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousStorageBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousDefaultSourceUrl = readWorkspaceImportDefaultSourceUrlSetting()
  const localMirrorReadRoots: string[] = []
  const requestedUrls: string[] = []

  try {
    useGraphStore.getState().resetAll()
    resetCanonicalPublishedDocsMirrorCacheForTests()
    resetWorkspaceSeedProviderStorageCacheForTests()
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_AGENTIC_CANVAS_OS_DOCS_ROOT
    process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://storage.example.test'
    process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '0'
    writeWorkspaceImportDefaultSourceUrlSetting('')

    const routes: MockRoute[] = [
      {
        test: u => u === '/__kg_fs_list',
        handler: (_url, init) => {
          const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
          const requestedRoot = String(body.path || '')
          localMirrorReadRoots.push(requestedRoot)
          return jsonResponse({
            ok: true,
            files: requestedRoot === '/workspace/knowgrph/docs/workspace-seeds'
              ? [{ relPath: 'local-seed.md', text: '# canonical local seed\n', updatedAtMs: 1 }]
              : [{ relPath: 'alpha.md', text: '# stale local\n', updatedAtMs: 1 }],
          })
        },
      },
      {
        test: u => u === 'https://api.github.com/repos/huijoohwee/huijoohwee/git/refs/heads/main',
        handler: () => jsonResponse({ object: { sha: 'commit-sha-demo-docs' } }),
      },
      {
        test: u => u === 'https://api.github.com/repos/huijoohwee/huijoohwee/git/commits/commit-sha-demo-docs',
        handler: () => jsonResponse({ tree: { sha: 'tree-sha-demo-docs' } }),
      },
      {
        test: u => u === 'https://api.github.com/repos/huijoohwee/huijoohwee/git/trees/tree-sha-demo-docs?recursive=1',
        handler: () => jsonResponse({ truncated: false, tree: [
          { path: 'docs/demo.md', type: 'blob' },
          { path: 'docs_/output.md', type: 'blob' },
        ] }),
      },
      {
        test: u => u === 'https://raw.githubusercontent.com/huijoohwee/huijoohwee/main/docs/demo.md',
        handler: () => textResponse('# canonical demo\n'),
      },
      {
        test: u => u === 'https://raw.githubusercontent.com/huijoohwee/huijoohwee/main/docs_/output.md',
        handler: () => textResponse('# canonical output\n'),
      },
      {
        test: u => u.includes('/api/storage/export/kgws%3Acanonical-docs'),
        handler: () => jsonResponse({
          ok: true,
          apiVersion: '2026-05-04',
          workspaceId: 'kgws:canonical-docs',
          exportedAtMs: 10,
          documents: [
            {
              id: 'doc-alpha',
              canonicalPath: 'agentic-canvas-os/docs/alpha.md',
              contentMd: '# canonical storage alpha\n',
              updatedAtMs: 10,
              deleted: false,
            },
            {
              id: 'doc-prompt-catalog',
              canonicalPath: 'agentic-canvas-os/docs/PROMPT-PRESETS.md',
              contentMd: '# canonical prompt catalog\n',
              updatedAtMs: 11,
              deleted: false,
            },
            {
              id: 'stale-bare-alias',
              canonicalPath: 'PROMPT-PRESETS.md',
              contentMd: '# stale bare alias\n',
              updatedAtMs: 100,
              deleted: false,
            },
            {
              id: 'stale-docs-alias',
              canonicalPath: 'docs/PROMPT-PRESETS.md',
              contentMd: '# stale docs alias\n',
              updatedAtMs: 100,
              deleted: false,
            },
          ],
          documentChunks: [],
          graphSnapshots: [],
        }),
      },
    ]

    g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const url = decodeProxyUrl(raw)
      requestedUrls.push(url)
      const route = routes.find(r => r.test(url))
      if (route) return route.handler(url, init)
      return new Response(`not found: ${url}`, { status: 404 })
    }) as typeof fetch

    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const byPath = new Map(mirrored.map(entry => [entry.relPath, entry.text]))

    if (
      localMirrorReadRoots.length !== 1
      || localMirrorReadRoots[0] !== '/workspace/knowgrph/docs/workspace-seeds'
    ) {
      throw new Error(`expected only the canonical local seed root to overlay GitHub docs, got ${JSON.stringify(localMirrorReadRoots)}`)
    }
    if (byPath.get('demo.md') !== '# canonical demo\n') {
      throw new Error(`expected demo.md to come from the canonical demo repository, got ${String(byPath.get('demo.md') || '')}`)
    }
    if (byPath.get('docs_/output.md') !== '# canonical output\n') {
      throw new Error(`expected output.md to retain the canonical output namespace, got ${String(byPath.get('docs_/output.md') || '')}`)
    }
    if (byPath.get('agentic-canvas-os/docs/alpha.md') !== '# canonical storage alpha\n') {
      throw new Error(`expected Agentic alpha.md to retain its canonical storage namespace, got ${String(byPath.get('agentic-canvas-os/docs/alpha.md') || '')}`)
    }
    if (byPath.get('workspace-seeds/local-seed.md') !== '# canonical local seed\n') {
      throw new Error('expected the canonical local workspace-seed inventory to overlay the published aggregate')
    }
    if (byPath.has('PROMPT-PRESETS.md') || byPath.has('docs/PROMPT-PRESETS.md')) {
      throw new Error('expected stale bare and docs aliases to stay outside the canonical Agentic docs namespace')
    }
    if (!mirrored.some(entry => entry.authority === 'huijoohwee-demo-docs-github') || !mirrored.some(entry => entry.authority === 'huijoohwee-output-docs-github') || !mirrored.some(entry => entry.authority === 'agentic-canvas-os-storage') || !mirrored.some(entry => entry.authority === 'knowgrph-workspace-seeds-local')) {
      throw new Error('expected demo, output, canonical storage, and local seed documents to retain distinct source authority')
    }
    if (requestedUrls.some(url => url.includes('/huijoohwee/agentic-canvas-os/'))) {
      throw new Error(`published Agentic docs must not request mutable GitHub sources: ${JSON.stringify(requestedUrls)}`)
    }
    if (
      normalizeMarkdownWorkspaceDocsSourcePathFromCanonicalPath('agentic-canvas-os/docs/alpha.md')
      !== 'workspace:/agentic-canvas-os/docs/alpha.md'
    ) {
      throw new Error('expected Agentic Canvas OS D1 paths to retain their runtime-only workspace namespace')
    }
    const canonicalCandidates = readStorageCanonicalPathCandidatesForWorkspacePath('/docs/alpha.md')
    if (canonicalCandidates[0] !== 'agentic-canvas-os/docs/alpha.md') {
      throw new Error(`expected canonical D1 writes to prefer Agentic Canvas OS docs, got ${JSON.stringify(canonicalCandidates)}`)
    }

    resetWorkspaceSeedProviderStorageCacheForTests()
    g.fetch = (async () => jsonResponse({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:canonical-docs',
      exportedAtMs: 12,
      documents: [{
        id: 'oversized-agentic-doc',
        canonicalPath: 'agentic-canvas-os/docs/oversized.md',
        contentMd: 'x'.repeat((500 * 1024) + 1),
        updatedAtMs: 12,
        deleted: false,
      }],
      documentChunks: [],
      graphSnapshots: [],
    })) as typeof fetch
    const oversizedEntries = await readPublishedAgenticDocsMirrorEntries()
    if (oversizedEntries.length > 0) {
      throw new Error('expected oversized canonical Agentic documents to fail the bounded D1 projection')
    }

    resetWorkspaceSeedProviderStorageCacheForTests()
    g.fetch = (async () => jsonResponse({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:canonical-docs',
      exportedAtMs: 13,
      documents: Array.from({ length: 501 }, (_, index) => ({
        id: `agentic-doc-${index}`,
        canonicalPath: `agentic-canvas-os/docs/doc-${index}.md`,
        contentMd: `# Agentic document ${index}\n`,
        updatedAtMs: 13,
        deleted: false,
      })),
      documentChunks: [],
      graphSnapshots: [],
    })) as typeof fetch
    const overLimitEntries = await readPublishedAgenticDocsMirrorEntries()
    if (overLimitEntries.length > 0) {
      throw new Error('expected an over-limit canonical Agentic document inventory to fail closed')
    }
  } finally {
    resetCanonicalPublishedDocsMirrorCacheForTests()
    resetWorkspaceSeedProviderStorageCacheForTests()
    writeWorkspaceImportDefaultSourceUrlSetting(previousDefaultSourceUrl)
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousRepoLocal === 'string') process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    else delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    if (originalFetch) g.fetch = originalFetch
    restore()
  }
  await verifyWorkspaceSeedProviderRejectsLegacyAgenticGitHubDefaultSource()
}

async function verifyWorkspaceSeedProviderRejectsLegacyAgenticGitHubDefaultSource() {
  const { restore } = initJsdomHarness()
  const g = globalThis as typeof globalThis & { fetch?: typeof fetch }
  const originalFetch = g.fetch
  const previousStorageBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousDefaultSourceUrl = readWorkspaceImportDefaultSourceUrlSetting()
  const requestedUrls: string[] = []

  try {
    useGraphStore.getState().resetAll()
    resetCanonicalPublishedDocsMirrorCacheForTests()
    resetWorkspaceSeedProviderStorageCacheForTests()
    process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://storage.example.test'
    process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '0'
    writeWorkspaceImportDefaultSourceUrlSetting(
      'https://github.com/huijoohwee/agentic-canvas-os/tree/main/docs',
    )
    g.fetch = (async (input: RequestInfo | URL) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      requestedUrls.push(decodeProxyUrl(raw))
      return new Response('', { status: 404 })
    }) as typeof fetch

    await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    if (requestedUrls.some(url => url.includes('/huijoohwee/agentic-canvas-os/'))) {
      throw new Error(`legacy Agentic GitHub defaults must not reactivate a runtime fallback: ${JSON.stringify(requestedUrls)}`)
    }
  } finally {
    resetCanonicalPublishedDocsMirrorCacheForTests()
    resetWorkspaceSeedProviderStorageCacheForTests()
    writeWorkspaceImportDefaultSourceUrlSetting(previousDefaultSourceUrl)
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousRepoLocal === 'string') process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    else delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    if (originalFetch) g.fetch = originalFetch
    restore()
  }
}

export async function testWorkspaceActiveDocumentFallsBackToDocsMirrorWhenPersistedTextIsBlank() {
  const { restore } = initJsdomHarness()
  const g = globalThis as typeof globalThis & { fetch?: typeof fetch }
  const originalFetch = g.fetch
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousDefaultSourceUrl = readWorkspaceImportDefaultSourceUrlSetting()
  const previousStorageBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL

  try {
    useGraphStore.getState().resetAll()
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = '/tmp/workspace/docs'
    process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://storage.example.test'
    writeWorkspaceImportDefaultSourceUrlSetting('')

    const targetPath = '/docs/knowgrph-token-economics-model-demo.md'
    const remoteText = [
      '---',
      'title: "Knowgrph Token Economics Model Demo - Storyboard Widget Cost Driver Ports"',
      '---',
      '',
      '# Knowgrph Token Economics Model Demo',
      '',
      'Canonical docs mirror text must repair a blank persisted workspace row.',
      '',
    ].join('\n')
    let mirrorReadCount = 0
    const capturedUrls: string[] = []

    g.fetch = (async (input: RequestInfo | URL) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      capturedUrls.push(raw)
      if (raw.includes('/api/storage/export/')) {
        return jsonResponse({
          ok: true,
          apiVersion: '2026-05-04',
          workspaceId: 'kgws:test',
          exportedAtMs: 1710000005000,
          documents: [],
          documentChunks: [],
          graphSnapshots: [],
        })
      }
      if (raw === '/__kg_fs_list') {
        mirrorReadCount += 1
        return jsonResponse({
          ok: true,
          files: [
            {
              relPath: 'knowgrph-token-economics-model-demo.md',
              text: remoteText,
              updatedAtMs: 123,
            },
          ],
        })
      }
      if (raw === `/@fs/tmp/workspace/docs/${encodeURIComponent('knowgrph-token-economics-model-demo.md')}`) {
        mirrorReadCount += 1
        return textResponse(remoteText)
      }
      return new Response(`not found: ${raw}`, { status: 404 })
    }) as typeof fetch

    const blankPersistedFs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [{
        path: targetPath,
        parentPath: '/docs',
        kind: 'file',
        name: 'knowgrph-token-economics-model-demo.md',
        text: '',
        updatedAtMs: 1,
      }],
      readFileText: async path => (String(path || '').trim() === targetPath ? '' : null),
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }

    const resolved = await readWorkspaceActiveDocumentResolvedText({
      activePath: targetPath,
      currentText: '',
      fs: blankPersistedFs,
    })

    if (resolved !== remoteText) {
      throw new Error(`expected docs mirror text to repair blank persisted workspace text, got ${JSON.stringify(resolved.slice(0, 120))}; urls=${JSON.stringify(capturedUrls)}`)
    }
    if (mirrorReadCount !== 1) {
      throw new Error(`expected one docs mirror read, got ${mirrorReadCount}`)
    }
  } finally {
    writeWorkspaceImportDefaultSourceUrlSetting(previousDefaultSourceUrl)
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (originalFetch) g.fetch = originalFetch
    restore()
  }
}
