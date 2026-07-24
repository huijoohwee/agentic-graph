import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  getAgenticOsRemoteGrammarCatalogSnapshot,
  resetAgenticOsRemoteGrammarCatalogForTests,
  useAgenticOsRemoteGrammarCatalog,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  AgenticOsRemoteGrammarAutoHydrationBoundary,
  resolveAgenticOsRemoteGrammarAutoHydration,
} from '@/features/agentic-os/useAgenticOsRemoteGrammarAutoHydration'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  mountReactRoot,
  unmountReactRoot,
} from '@/tests/lib/reactRootHarness'
import { QUERY_PARAM_RUNTIME_IDENTITY_PROOF } from '@/lib/routing/queryParams'

const offlineRunReadySource = (id: 'flight-sim' | 'xr-physics'): string => `---
run_ready_demo:
  id: "${id}"
---
`

function RemoteGrammarHydrationHarness() {
  useAgenticOsRemoteGrammarCatalog({ sigils: ['/', '#', '@'] })
  return null
}

const renderRemoteGrammarHydrationHarness = (): React.ReactElement => React.createElement(
  AgenticOsRemoteGrammarAutoHydrationBoundary,
  null,
  React.createElement(RemoteGrammarHydrationHarness),
)

test('automatic remote grammar policy fails closed until source identity is ready', () => {
  assert.equal(resolveAgenticOsRemoteGrammarAutoHydration({
    sourceFilesReady: false,
    offlineNativeXrActive: false,
    runtimeIdentityProofRequested: true,
  }), false)
  assert.equal(resolveAgenticOsRemoteGrammarAutoHydration({
    sourceFilesReady: true,
    offlineNativeXrActive: true,
    runtimeIdentityProofRequested: false,
  }), false)
  assert.equal(resolveAgenticOsRemoteGrammarAutoHydration({
    sourceFilesReady: true,
    offlineNativeXrActive: false,
    runtimeIdentityProofRequested: false,
  }), true)
  assert.equal(resolveAgenticOsRemoteGrammarAutoHydration({
    sourceFilesReady: true,
    offlineNativeXrActive: true,
    runtimeIdentityProofRequested: true,
  }), true)
})

test('offline native XR sources suppress automatic remote grammar hydration', async () => {
  const originalFetch = globalThis.fetch
  const originalDocumentName = useGraphStore.getState().markdownDocumentName
  const originalDocumentText = useGraphStore.getState().markdownDocumentText
  const attemptedRequests: string[] = []
  globalThis.fetch = (async input => {
    attemptedRequests.push(String(input))
    throw new Error('offline native XR source attempted remote grammar hydration')
  }) as typeof fetch

  try {
    completeSourceFilesBootstrap()
    for (const id of ['flight-sim', 'xr-physics'] as const) {
      resetAgenticOsRemoteGrammarCatalogForTests()
      useGraphStore.setState({
        markdownDocumentName: id === 'flight-sim'
          ? 'knowgrph-game-flight-sim-demo.md'
          : 'knowgrph-physics-playground-demo.md',
        markdownDocumentText: offlineRunReadySource(id),
      })
      const { dom, restore } = initJsdomHarness()
      const container = dom.window.document.createElement('section')
      dom.window.document.body.appendChild(container)
      const root = createRoot(container)
      try {
        await mountReactRoot(root, renderRemoteGrammarHydrationHarness(), {
          window: dom.window as unknown as Window,
          frames: 3,
          tasks: 6,
        })
        assert.equal(attemptedRequests.length, 0)
        assert.equal(getAgenticOsRemoteGrammarCatalogSnapshot().hydration.status, 'idle')
      } finally {
        await unmountReactRoot(root, { window: dom.window as unknown as Window })
        container.remove()
        restore()
      }
    }
  } finally {
    globalThis.fetch = originalFetch
    useGraphStore.setState({
      markdownDocumentName: originalDocumentName,
      markdownDocumentText: originalDocumentText,
    })
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
})

test('ordinary repo-local workspace sources retain automatic remote grammar hydration', async () => {
  const originalFetch = globalThis.fetch
  const originalRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const originalDocumentName = useGraphStore.getState().markdownDocumentName
  const originalDocumentText = useGraphStore.getState().markdownDocumentText
  const methods: string[] = []
  const requestUrls: string[] = []
  process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '1'
  completeSourceFilesBootstrap()
  useGraphStore.setState({
    markdownDocumentName: 'ordinary-workspace.md',
    markdownDocumentText: '# Ordinary workspace',
  })
  resetAgenticOsRemoteGrammarCatalogForTests()
  globalThis.fetch = (async (input, init) => {
    requestUrls.push(String(input))
    const body = JSON.parse(String(init?.body || '{}')) as { id?: unknown, method?: unknown }
    methods.push(String(body.method || ''))
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { protocolVersion: '2024-11-05' },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'ordinary-workspace-session',
        },
      })
    }
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision: 'a'.repeat(40),
          catalog: [],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await mountReactRoot(root, renderRemoteGrammarHydrationHarness(), {
      window: dom.window as unknown as Window,
      frames: 3,
      tasks: 8,
    })
    assert.deepEqual(methods, ['initialize', 'tools/call', 'tools/call', 'tools/call'])
    assert.ok(requestUrls.every(url => url === 'http://localhost/knowgrph/control-plane/mcp'))
  } finally {
    globalThis.fetch = originalFetch
    if (originalRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = originalRepoLocal
    useGraphStore.setState({
      markdownDocumentName: originalDocumentName,
      markdownDocumentText: originalDocumentText,
    })
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    resetAgenticOsRemoteGrammarCatalogForTests()
    container.remove()
    restore()
  }
})

test('runtime identity proof explicitly hydrates grammar for an offline native XR source', async () => {
  const originalFetch = globalThis.fetch
  const originalRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const originalDocumentName = useGraphStore.getState().markdownDocumentName
  const originalDocumentText = useGraphStore.getState().markdownDocumentText
  const methods: string[] = []
  process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '1'
  completeSourceFilesBootstrap()
  useGraphStore.setState({
    markdownDocumentName: 'knowgrph-physics-playground-demo.md',
    markdownDocumentText: offlineRunReadySource('xr-physics'),
  })
  resetAgenticOsRemoteGrammarCatalogForTests()
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}')) as { id?: unknown, method?: unknown }
    methods.push(String(body.method || ''))
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { protocolVersion: '2024-11-05' },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'runtime-identity-proof-session',
        },
      })
    }
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision: 'a'.repeat(40),
          catalog: [],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const { dom, restore } = initJsdomHarness()
  dom.window.history.replaceState(
    {},
    '',
    `/?${QUERY_PARAM_RUNTIME_IDENTITY_PROOF}=1`,
  )
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await mountReactRoot(root, renderRemoteGrammarHydrationHarness(), {
      window: dom.window as unknown as Window,
      frames: 3,
      tasks: 8,
    })
    assert.deepEqual(methods, ['initialize', 'tools/call', 'tools/call', 'tools/call'])
    assert.equal(getAgenticOsRemoteGrammarCatalogSnapshot().hydration.status, 'fresh')
  } finally {
    globalThis.fetch = originalFetch
    if (originalRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = originalRepoLocal
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    useGraphStore.setState({
      markdownDocumentName: originalDocumentName,
      markdownDocumentText: originalDocumentText,
    })
    resetAgenticOsRemoteGrammarCatalogForTests()
    container.remove()
    restore()
  }
})
