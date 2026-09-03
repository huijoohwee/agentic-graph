import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { onRequest as graphOnRequest } from '../../cloudflare/pages/runtime-graph.mjs'
import { onRequest as chatProxyOnRequest } from '../../cloudflare/pages/runtime-chat-proxy.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const runtimeSourcePaths = [
  path.resolve(repoRoot, 'cloudflare', 'pages', 'runtime-integration-hub.mjs'),
  path.resolve(repoRoot, 'cloudflare', 'pages', 'runtime-graph.mjs'),
  path.resolve(repoRoot, 'cloudflare', 'pages', 'runtime-chat-proxy.mjs'),
]

test('source-owned production runtime functions use only canonical product paths and protocol environment names', () => {
  const source = runtimeSourcePaths.map(sourcePath => fs.readFileSync(sourcePath, 'utf8')).join('\n')

  assert.doesNotMatch(source, /AGENTICGRAPH_|\/agenticgraph|knowgrph/i)
  assert.match(source, /AGENTIC_OS_INTEGRATION_ALLOWED_HOSTS/)
  assert.match(source, /AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY/)
  assert.match(source, /\/agentic-graph\/imports\/hackamap\//)
})

test('graph API reads its canonical published HackaMap path', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input)
    requested.push({ url, init })
    if (url.endsWith('/agentic-graph/imports/hackamap/hackamap_api_graph.json')) {
      return new Response(JSON.stringify({ nodes: [{ id: 'Event:1', type: 'problem' }], edges: [] }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const response = await graphOnRequest({
    request: new Request('https://airvio.co/api/graph'),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { nodes: [{ id: 'Event:1', type: 'problem' }], edges: [] })
  assert.deepEqual(requested.map(({ url }) => url), [
    'https://airvio.co/agentic-graph/imports/hackamap/hackamap_api_graph.json',
  ])
})

test('chat proxy reads canonical runtime configuration without a legacy environment fallback', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    requested.push({ url: String(input), headers: new Headers(init.headers) })
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const response = await chatProxyOnRequest({
    request: new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-kg-chat-provider': 'openai',
      },
      body: JSON.stringify({ model: 'test-model' }),
    }),
    env: {
      AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY: 'canonical-test-token',
    },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(requested[0]?.url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(requested[0]?.headers.get('authorization'), 'Bearer canonical-test-token')
})
