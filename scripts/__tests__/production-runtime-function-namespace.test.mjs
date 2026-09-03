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
const cloudflareAccountId = 'a'.repeat(32)
const cloudflareAiRestBase = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai`

test('source-owned production runtime functions use only canonical product paths and protocol environment names', () => {
  const source = runtimeSourcePaths.map(sourcePath => fs.readFileSync(sourcePath, 'utf8')).join('\n')

  assert.doesNotMatch(source, /AGENTICGRAPH_|\/agenticGraph|agenticGraph/i)
  assert.doesNotMatch(source, /\benv\.(?:AI_GATEWAY_TOKEN|CLOUDFLARE_API_TOKEN)\b/)
  assert.match(source, /AGENTIC_OS_INTEGRATION_ALLOWED_HOSTS/)
  assert.match(source, /AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY/)
  assert.match(source, /AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL/)
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

test('chat proxy keeps operator provider keys on canonical hosts and permits caller keys on custom upstreams', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    requested.push({ url: String(input), headers: new Headers(init.headers) })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const upstream = 'https://custom-ai.example'
  const env = {
    AGENTIC_OS_INTEGRATION_ALLOWED_HOSTS: 'custom-ai.example',
    AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY: 'operator-openai-token',
  }
  const request = headers => new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-kg-chat-provider': 'openai',
      'x-kg-chat-upstream': upstream,
      ...headers,
    },
    body: JSON.stringify({ model: 'test-model' }),
  })

  const operatorKeyAttempt = await chatProxyOnRequest({ request: request({}), env })
  assert.equal(operatorKeyAttempt.status, 401)
  assert.equal(requested.length, 0)

  const callerKeyAttempt = await chatProxyOnRequest({
    request: request({ 'x-kg-chat-api-key': 'caller-owned-token' }),
    env,
  })
  assert.equal(callerKeyAttempt.status, 200)
  assert.equal(requested[0]?.url, 'https://custom-ai.example/v1/chat/completions')
  assert.equal(requested[0]?.headers.get('authorization'), 'Bearer caller-owned-token')
})

test('chat proxy sends the operator AI Gateway token only to its validated Cloudflare REST base', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    requested.push({ url: String(input), headers: new Headers(init.headers), body: init.body, redirect: init.redirect })
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const response = await chatProxyOnRequest({
    request: new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        origin: 'https://airvio.co',
        'content-type': 'application/json',
        'x-kg-chat-provider': 'openai',
        'x-kg-chat-api-key': 'caller-token-must-not-override-operator-token',
        'x-kg-ai-gateway-route': 'dynamic/operator-route',
      },
      body: JSON.stringify({ model: 'client-selected-model' }),
    }),
    env: {
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL: cloudflareAiRestBase,
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_GATEWAY_ID: 'operator-gateway',
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_TOKEN: 'operator-gateway-token',
      CLOUDFLARE_API_TOKEN: 'must-not-be-read',
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://airvio.co')
  assert.equal(requested[0]?.url, `${cloudflareAiRestBase}/v1/chat/completions`)
  assert.equal(requested[0]?.headers.get('authorization'), 'Bearer operator-gateway-token')
  assert.equal(requested[0]?.headers.get('cf-aig-gateway-id'), 'operator-gateway')
  assert.equal(requested[0]?.redirect, 'error')
  assert.equal(await new Response(requested[0]?.body).text(), JSON.stringify({ model: 'dynamic/operator-route' }))
})

test('chat proxy does not fall back to CLOUDFLARE_API_TOKEN for an AI Gateway request', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    requested.push({ url: String(input), headers: new Headers(init.headers) })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const response = await chatProxyOnRequest({
    request: new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        origin: 'https://airvio.co',
        'content-type': 'application/json',
        'x-kg-chat-provider': 'openai',
        'x-kg-ai-gateway-route': 'dynamic/operator-route',
      },
      body: JSON.stringify({ model: 'client-selected-model' }),
    }),
    env: {
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL: cloudflareAiRestBase,
      CLOUDFLARE_API_TOKEN: 'legacy-token-must-not-forward',
    },
  })

  assert.equal(response.status, 401)
  assert.equal(requested.length, 0)
})

test('chat proxy rejects caller Cloudflare upstream overrides and untrusted origins before token forwarding', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    requested.push({ url: String(input), headers: new Headers(init.headers) })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const env = {
    AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL: cloudflareAiRestBase,
    AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_TOKEN: 'operator-gateway-token',
  }
  const upstreamOverride = `${cloudflareAiRestBase}/v1/chat/completions`
  const sameOriginOverride = await chatProxyOnRequest({
    request: new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        origin: 'https://airvio.co',
        'content-type': 'application/json',
        'x-kg-chat-provider': 'openai',
        'x-kg-chat-upstream': upstreamOverride,
      },
      body: JSON.stringify({ model: 'client-selected-model' }),
    }),
    env,
  })
  const untrustedOriginOverride = await chatProxyOnRequest({
    request: new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
        'x-kg-chat-provider': 'openai',
        'x-kg-chat-upstream': upstreamOverride,
      },
      body: JSON.stringify({ model: 'client-selected-model' }),
    }),
    env,
  })

  assert.equal(sameOriginOverride.status, 403)
  assert.equal(sameOriginOverride.headers.get('access-control-allow-origin'), 'https://airvio.co')
  assert.equal(untrustedOriginOverride.status, 403)
  assert.equal(untrustedOriginOverride.headers.get('access-control-allow-origin'), null)
  assert.equal(requested.length, 0)
})

test('chat proxy accepts only a safe Cloudflare provider-gateway base URL', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    requested.push({ url: String(input), headers: new Headers(init.headers) })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const safeGatewayBase = `https://gateway.ai.cloudflare.com/v1/${cloudflareAccountId}/default/openai`
  const response = await chatProxyOnRequest({
    request: new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        origin: 'https://airvio.co',
        'content-type': 'application/json',
        'x-kg-chat-provider': 'openai',
        'x-kg-ai-gateway-route': 'dynamic/operator-route',
      },
      body: JSON.stringify({ model: 'client-selected-model' }),
    }),
    env: {
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL: safeGatewayBase,
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_TOKEN: 'operator-gateway-token',
    },
  })

  assert.equal(response.status, 200)
  assert.equal(requested[0]?.url, `${safeGatewayBase}/chat/completions`)
  assert.equal(requested[0]?.headers.get('authorization'), null)
  assert.equal(requested[0]?.headers.get('cf-aig-authorization'), 'Bearer operator-gateway-token')
})

test('chat proxy fails closed when the configured AI Gateway base is not an account-scoped endpoint', { concurrency: false }, async t => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input, init = {}) => {
    requested.push({ url: String(input), headers: new Headers(init.headers) })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const response = await chatProxyOnRequest({
    request: new Request('https://airvio.co/__chat_proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        origin: 'https://airvio.co',
        'content-type': 'application/json',
        'x-kg-chat-provider': 'openai',
        'x-kg-ai-gateway-route': 'dynamic/operator-route',
      },
      body: JSON.stringify({ model: 'client-selected-model' }),
    }),
    env: {
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL: 'https://api.cloudflare.com/client/v4/accounts/not-an-account-id/ai',
      AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_TOKEN: 'operator-gateway-token',
    },
  })

  assert.equal(response.status, 500)
  assert.equal(requested.length, 0)
})
