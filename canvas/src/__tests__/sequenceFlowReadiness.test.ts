import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { isExplicitOfflineWorkspace } from '@/lib/routing/queryParams'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { AgenticOsRemoteGrammarAutoHydrationBoundary } from '@/features/agentic-os/useAgenticOsRemoteGrammarAutoHydration'
import { getAgenticOsRemoteGrammarCatalogSnapshot, refreshAgenticOsRemoteGrammarCatalog, resetAgenticOsRemoteGrammarCatalogForTests, useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import { resetCanonicalPublishedDocsMirrorCacheForTests } from '@/features/workspace-fs/workspaceGithubDocsMirror'
import { resetWorkspaceSeedProviderStorageCacheForTests } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { readWorkspaceImportDefaultSourceUrlSetting, writeWorkspaceImportDefaultSourceUrlSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { buildAgenticOsTestCatalogMetadata } from './helpers/agenticOsCatalogDigest'

const revision = 'a'.repeat(40)
const routes = ['studio-offline', 'python-learning-offline'] as const
const source = '# Retained local source\n\nDraft text 保留; punctuation stays exact.\n'

test('explicit offline routing requires one complete unambiguous revision', () => {
  for (const route of routes) {
    assert.equal(isExplicitOfflineWorkspace(`?${route}=${revision}&openEditorWorkspace=1`), true)
    for (const value of ['', 'latest', 'a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), `${revision}%20`]) {
      assert.equal(isExplicitOfflineWorkspace(`?${route}=${value}`), false)
    }
    assert.equal(isExplicitOfflineWorkspace(`?${route}=${revision}&${route}=${revision}`), false)
  }
  assert.equal(isExplicitOfflineWorkspace(`?studio-offline=${revision}&python-learning-offline=${revision}`), false)
  assert.equal(isExplicitOfflineWorkspace('?openEditorWorkspace=1'), false)
})

test('offline source bootstrap retains local candidates without published fetches and ordinary online fallback remains available', async () => {
  const { dom, restore } = initJsdomHarness()
  const originalState = useGraphStore.getState(), originalFetch = globalThis.fetch
  const originalDefaultSource = readWorkspaceImportDefaultSourceUrlSetting()
  const keys = ['VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT', 'VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT', 'VITE_WORKSPACE_INITIALIZATION_OUTPUT_DOCS_ABS_ROOT', 'VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT', 'VITE_AGENTIC_OS_STORAGE_BASE_URL', 'VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED', 'VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL']
  const originalEnv = keys.map(key => process.env[key]), requests: string[] = []
  try {
    for (const key of keys) process.env[key] = ''
    process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL = '0'
    writeWorkspaceImportDefaultSourceUrlSetting('')
    useGraphStore.setState({
      sourceFiles: [{ id: 'retained-source', name: 'retained.md', text: source, enabled: true, status: 'idle', source: { kind: 'local', path: 'docs/retained.md' } }],
      localMarkdownSelectedFolderPath: 'docs', localMarkdownFolderName: 'docs', localMarkdownFolderAccessMode: 'file-input',
      localMarkdownFolderHandle: null, localMarkdownFolderCacheId: null,
      markdownDocumentName: 'retained.md', markdownDocumentText: source,
    })
    globalThis.fetch = (async input => {
      requests.push(String(input))
      return new Response('Unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    }) as typeof fetch
    for (const route of routes) {
      resetCanonicalPublishedDocsMirrorCacheForTests(); resetWorkspaceSeedProviderStorageCacheForTests()
      dom.reconfigure({ url: `http://localhost/?${route}=${revision}` })
      const entries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
      assert.equal(requests.length, 0, `${route}: background bootstrap must not attempt published fetches`)
      assert.equal(entries.find(entry => entry.relPath === 'retained.md')?.text, source)
      assert.equal(useGraphStore.getState().sourceFiles[0]?.text, source)
      assert.equal(useGraphStore.getState().markdownDocumentText, source)
    }
    dom.reconfigure({ url: 'http://localhost/' })
    const online = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    assert.ok(requests.some(url => url.includes('git/refs/heads/') || url.includes('git%2Frefs%2Fheads%2F')), 'ordinary online bootstrap still consults published sources')
    assert.equal(online.find(entry => entry.relPath === 'retained.md')?.text, source, 'failed online fallback preserves local source')
  } finally {
    globalThis.fetch = originalFetch
    keys.forEach((key, index) => { const value = originalEnv[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value })
    writeWorkspaceImportDefaultSourceUrlSetting(originalDefaultSource)
    useGraphStore.setState(originalState)
    resetCanonicalPublishedDocsMirrorCacheForTests(); resetWorkspaceSeedProviderStorageCacheForTests()
    restore()
  }
})

function GrammarReader() {
  useAgenticOsRemoteGrammarCatalog({ sigils: ['/', '#', '@'] })
  return null
}

test('both verified routes suppress automatic grammar requests while explicit refresh and ordinary online hydration retain their owner', async () => {
  const { dom, restore } = initJsdomHarness()
  const originalState = useGraphStore.getState(), originalFetch = globalThis.fetch
  const metadata = buildAgenticOsTestCatalogMetadata([]), methods: string[] = []
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}')) as { id?: unknown; method?: string }
    methods.push(body.method || '')
    const result = body.method === 'initialize' ? { protocolVersion: '2024-11-05' }
      : { structuredContent: { ok: true, sourceRevision: revision, catalog: [], ...metadata } }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200,
      headers: { 'Content-Type': 'application/json', 'mcp-session-id': 'readiness-session' } })
  }) as typeof fetch
  try {
    completeSourceFilesBootstrap()
    useGraphStore.setState({ markdownDocumentName: 'retained.md', markdownDocumentText: source })
    for (const route of [...routes, 'online']) {
      resetAgenticOsRemoteGrammarCatalogForTests(); methods.length = 0
      dom.reconfigure({ url: route === 'online' ? 'http://localhost/' : `http://localhost/?${route}=${revision}&kgRuntimeIdentityProof=1` })
      const container = dom.window.document.createElement('section'); dom.window.document.body.append(container)
      const root = createRoot(container)
      try {
        await mountReactRoot(root, React.createElement(AgenticOsRemoteGrammarAutoHydrationBoundary, null, React.createElement(GrammarReader)), { window: dom.window as unknown as Window, frames: 3, tasks: 8 })
        if (route !== 'online') {
          assert.equal(methods.length, 0, `${route}: even identity proof does not auto-connect an explicit offline workspace`)
          assert.equal(getAgenticOsRemoteGrammarCatalogSnapshot().hydration.status, 'idle')
          await act(async () => { await refreshAgenticOsRemoteGrammarCatalog() })
        }
        assert.deepEqual(methods, ['initialize', 'tools/call', 'tools/call', 'tools/call'], `${route}: explicit refresh or ordinary online hydration retains the transport`)
        assert.equal(useGraphStore.getState().markdownDocumentText, source)
      } finally { await unmountReactRoot(root, { window: dom.window as unknown as Window }); container.remove() }
    }
  } finally {
    globalThis.fetch = originalFetch; useGraphStore.setState(originalState)
    resetAgenticOsRemoteGrammarCatalogForTests(); restore()
  }
})
