import assert from 'node:assert/strict'
import {
  fetchAgenticOsRemoteGrammarCatalog,
  getAgenticOsRemoteGrammarCatalogSnapshot,
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { normalizeAgenticOsRemoteGrammarCatalogProvenance } from '@/features/agentic-os/agenticOsRemoteGrammarProvenance'
import { buildAgenticOsTestCatalogMetadata } from '@/__tests__/helpers/agenticOsCatalogDigest'

const SOURCE_REVISION = 'b'.repeat(40)
const STALE_REVISION = 'a'.repeat(40)
const SOURCE_ROOT_URL = `https://github.com/huijoohwee/agentic-canvas-os/blob/${SOURCE_REVISION}/docs`

const sourceBackedEntries = () => ([
  {
    token: '/camera.select',
    kind: 'command',
    sourcePath: 'DICTIONARY-COMMAND.md#/camera.select',
    sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${STALE_REVISION}/docs/DICTIONARY-COMMAND.md#/camera.select`,
  },
  {
    token: '#transform',
    kind: 'semantic',
    sourcePath: 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-SEMANTIC.md##transform',
    sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${STALE_REVISION}/docs/DICTIONARY-SEMANTIC.md##transform`,
  },
  {
    token: '@scene',
    kind: 'binding',
    sourcePath: 'DICTIONARY-BINDING.md#@scene',
    sourceUrl: 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-BINDING.md#@scene',
  },
])

export function testAgenticOsRemoteGrammarProvenanceRebasesExactDictionaryFragments() {
  const entries = normalizeAgenticOsRemoteGrammarCatalogProvenance(sourceBackedEntries(), SOURCE_REVISION)

  assert.deepEqual(entries.map(entry => ({
    token: entry.token,
    sourcePath: entry.sourcePath,
    sourceUrl: entry.sourceUrl,
  })), [
    {
      token: '/camera.select',
      sourcePath: 'DICTIONARY-COMMAND.md#/camera.select',
      sourceUrl: `${SOURCE_ROOT_URL}/DICTIONARY-COMMAND.md#/camera.select`,
    },
    {
      token: '#transform',
      sourcePath: 'DICTIONARY-SEMANTIC.md##transform',
      sourceUrl: `${SOURCE_ROOT_URL}/DICTIONARY-SEMANTIC.md##transform`,
    },
    {
      token: '@scene',
      sourcePath: 'DICTIONARY-BINDING.md#@scene',
      sourceUrl: `${SOURCE_ROOT_URL}/DICTIONARY-BINDING.md#@scene`,
    },
  ])

  for (const entry of [
    {
      token: '/external',
      kind: 'command',
      sourcePath: 'DICTIONARY-COMMAND.md#/external',
      sourceUrl: 'https://example.invalid/DICTIONARY-COMMAND.md#/external',
    },
    {
      token: '#malformed',
      kind: 'semantic',
      sourcePath: '../DICTIONARY-SEMANTIC.md##malformed',
      sourceUrl: `${SOURCE_ROOT_URL}/DICTIONARY-SEMANTIC.md##malformed`,
    },
    {
      token: '@scene',
      kind: 'binding',
      sourcePath: 'DICTIONARY-BINDING.md#@different',
      sourceUrl: `${SOURCE_ROOT_URL}/DICTIONARY-BINDING.md#@different`,
    },
  ]) {
    assert.throws(
      () => normalizeAgenticOsRemoteGrammarCatalogProvenance([entry], SOURCE_REVISION),
      /catalog provenance rejected token/,
    )
  }
}

export async function testAgenticOsRemoteGrammarFetchRegistersOnlyRevisionBoundProvenance() {
  const originalFetch = globalThis.fetch
  let catalog: Array<Record<string, unknown>> = sourceBackedEntries()
  const sourceCatalog = sourceBackedEntries()
  resetAgenticOsRemoteGrammarCatalogForTests()
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2024-11-05' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'provenance-session' },
      })
    }
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision: SOURCE_REVISION,
          ...buildAgenticOsTestCatalogMetadata(sourceCatalog),
          catalog,
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    catalog = [sourceCatalog[0]]
    const registered = await fetchAgenticOsRemoteGrammarCatalog({ query: '/' })
    assert.deepEqual(
      registered.map(entry => entry.sourceUrl),
      [
        `${SOURCE_ROOT_URL}/DICTIONARY-COMMAND.md#/camera.select`,
      ],
    )
    const safeSnapshot = getAgenticOsRemoteGrammarCatalogSnapshot()
    assert.equal(safeSnapshot.entries.length, 1)

    catalog = [{
      token: '/external',
      kind: 'command',
      sourcePath: 'DICTIONARY-COMMAND.md#/external',
      sourceUrl: 'https://external.invalid/DICTIONARY-COMMAND.md#/external',
    }]
    await assert.rejects(
      fetchAgenticOsRemoteGrammarCatalog({ query: '/' }),
      /catalog provenance rejected token \/external/,
    )
    const rejectedSnapshot = getAgenticOsRemoteGrammarCatalogSnapshot()
    assert.equal(rejectedSnapshot.entries.some(entry => entry.token === '/external'), false)
    assert.deepEqual(rejectedSnapshot.entries, safeSnapshot.entries)
  } finally {
    globalThis.fetch = originalFetch
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}
