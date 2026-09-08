import assert from 'node:assert/strict'
import { withDurableBrowserStorage } from '@/__tests__/helpers/durable-browser-storage'
import { createFixture } from '@/__tests__/helpers/native-agentic-graph-storage-fixture'
import { createStorageWorkerRequest } from '@/__tests__/helpers/fake-agentic-graph-storage-worker-fetch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { syncWorkspaceEntryToCanonicalCloud } from '@/features/source-files/sourceFileCanonicalCloudSync'
import { __resetAgenticGraphStorageDbForTests, getAgenticGraphStorageDb } from '@/lib/storage/agentic-graph-storage-db'
import { cancelAgenticGraphStorageSync } from '@/lib/storage/agentic-graph-storage-client-sync'
import { AGENTIC_OS_STORAGE_SYNC_BOUNDS } from '@/lib/storage/agentic-graph-storage-bounds'
import { hashAgenticGraphStorageContent, type AgenticGraphStorageExportResponse } from '@/lib/storage/agentic-graph-storage-sync-contract'

// Property 24 executes the production pipeline; external GitHub and stale readbacks are explicit test adapters.
export const testStorageEnhancementProperty24CloudUploadOrderedRoundTrip = async () => withDurableBrowserStorage(async () => {
  const dom = initJsdomHarness(), window = initWindowHarness({ storage: new MemoryStorage() })
  const previousFetch = globalThis.fetch
  const cases = [
    { name: 'empty', text: '', staleReads: 0, succeeds: true },
    { name: 'exact-bytes', text: '\ufeff# Exact Unicode 中文\n\u0000Retained bytes 😀\n', staleReads: 2, succeeds: true },
    { name: 'exhausted', text: '# Persisted before failed readback\n', staleReads: Infinity, succeeds: false },
  ]
  try {
    for (const scenario of cases) {
      resetWorkspaceFsForTests()
      await __resetAgenticGraphStorageDbForTests()
      const fixture = await createFixture(undefined, { workspaceId: `workspace:cloud-property24:${scenario.name}`, origin: 'http://localhost' })
      Object.assign(fixture.env, { AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
        AGENTIC_OS_STORAGE_GITHUB_TOKEN: 'property24-local-adapter', AGENTIC_OS_STORAGE_GITHUB_OWNER: 'fixture-owner',
        AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO: 'fixture-workspace', AGENTIC_OS_STORAGE_GITHUB_BRANCH: 'main' })
      const events: string[] = [], exportedTexts: string[] = []
      let githubWrites = 0, exports = 0
      try {
        const fs = await getWorkspaceFs(), name = `cloud-property24-${scenario.name}.md`
        const path = await fs.createFile({ parentPath: '/', name, text: scenario.text })
        const entry = (await fs.listEntries()).find(row => row.path === path)
        assert.ok(entry, 'the durable workspace fixture must contain the actual upload entry')
        assert.equal((await getAgenticGraphStorageDb()).persistence.getState().mode, 'indexeddb')
        globalThis.fetch = async (input, init) => {
          const request = new Request(input, init), url = new URL(request.url)
          assert.equal(url.origin, 'https://api.github.com', 'no live request may escape the GitHub adapter')
          assert.equal(url.pathname, `/repos/fixture-owner/fixture-workspace/contents/docs/${name}`)
          if (request.method === 'GET') return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
          assert.equal(request.method, 'PUT')
          const body = await request.json() as { content: string }
          assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), scenario.text, 'GitHub receives exact saved workspace bytes')
          githubWrites++; events.push('github')
          return Response.json({ content: { sha: 'property24-content' }, commit: { sha: 'property24-commit' } })
        }
        const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const request = createStorageWorkerRequest(input, init), pathname = new URL(request.url).pathname
          const response = await fixture.fetch(request)
          assert.equal(response.ok, true, `native storage Worker rejected ${pathname}: ${await response.clone().text()}`)
          if (pathname === '/api/storage/push') events.push('d1')
          if (!pathname.startsWith('/api/storage/export/')) return response
          events.push('readback'); exports++
          const payload = await response.json() as AgenticGraphStorageExportResponse
          const document = payload.documents.find(row => row.canonicalPath === `huijoohwee/docs/${name}`)
          assert.ok(document, 'readback must come from a real persisted native Worker document')
          assert.equal(document.contentMd, scenario.text, 'native Worker readback preserves exact authored bytes')
          exportedTexts.push(document.contentMd)
          // Fault injection changes only an observed readback; the native D1 row and all acknowledgements remain real.
          if (exports <= scenario.staleReads) {
            document.contentMd = `stale:${scenario.name}`
            document.contentHash = hashAgenticGraphStorageContent(document.contentMd)
          }
          return Response.json(payload, { status: response.status })
        }
        const upload = () => syncWorkspaceEntryToCanonicalCloud({ entry, workspaceId: fixture.workspaceId,
          baseUrl: 'http://localhost', sessionToken: fixture.auth.sessionToken, deviceId: 'device:property24', fetchImpl })
        if (scenario.succeeds) {
          const result = await upload()
          assert.equal(result.readBackVerified, true)
          assert.equal(result.syncedText, scenario.text)
          assert.equal(result.readBackAttempts, scenario.staleReads + 1)
        } else await assert.rejects(upload, /Cloudflare read-back did not match/)
        const githubIndex = events.indexOf('github'), d1Index = events.indexOf('d1'), readBackIndex = events.indexOf('readback')
        assert.ok(githubIndex >= 0 && githubIndex < d1Index && d1Index < readBackIndex, 'expected GitHub, D1, read-back ordering')
        assert.equal(githubWrites, 1, 'readback retries reuse the completed GitHub save')
        assert.equal(exports, scenario.succeeds ? scenario.staleReads + 1 : AGENTIC_OS_STORAGE_SYNC_BOUNDS.cloudReadBackMaxAttempts)
        assert.ok(exports <= AGENTIC_OS_STORAGE_SYNC_BOUNDS.cloudReadBackMaxAttempts, 'readback retries stay bounded')
        assert.equal(exportedTexts.length, exports, 'every readback attempt delegates to the native Worker')
        const row = fixture.sql.prepare('select json_object(\'text\', content_md) payload from documents where workspace_id = ? and canonical_path = ?')
          .get(fixture.workspaceId, `huijoohwee/docs/${name}`)
        assert.equal(JSON.parse(String(row?.payload)).text, scenario.text, 'failed verification cannot corrupt committed D1 bytes')
      } finally { cancelAgenticGraphStorageSync(fixture.workspaceId); await fixture.close() }
    }
  } finally {
    globalThis.fetch = previousFetch
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    window.restore(); dom.restore()
  }
})
