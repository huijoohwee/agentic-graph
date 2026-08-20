import assert from 'node:assert/strict'
import test from 'node:test'

import { createLocalAgenticCanvasOsMcpServer } from '../local-agentic-canvas-os-mcp.mjs'

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject)
    resolve(server.address().port)
  })
})

const close = server => new Promise(resolve => server.close(resolve))

test('local Agentic Canvas OS MCP is session-bound, bounded, and returns structured catalog evidence', async () => {
  const payload = {
    ok: true,
    sourceRevision: 'a'.repeat(40),
    catalogDigest: 'b'.repeat(64),
    routingSchema: 'agentic-canvas-os-docs-routing/v1',
    routingDigest: 'c'.repeat(64),
    counts: { command: 1, semantic: 1, binding: 1 },
    catalog: [{ token: '/verify', kind: 'command' }],
  }
  const server = createLocalAgenticCanvasOsMcpServer({ invoke: async () => payload })
  const port = await listen(server)
  const endpoint = `http://127.0.0.1:${port}/knowgrph/control-plane/mcp`
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), {
      schema: 'knowgrph-local-agentic-canvas-os-mcp-health/v1', status: 'ready',
    })

    const initialized = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    const sessionId = initialized.headers.get('mcp-session-id')
    assert.ok(sessionId)
    assert.equal(initialized.headers.get('access-control-expose-headers'), 'mcp-session-id')
    assert.equal((await initialized.json()).result.protocolVersion, '2024-11-05')

    const called = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'knowgrph.agentic_canvas_os.docs.invoke', arguments: { query: '/' } },
      }),
    })
    const result = await called.json()
    assert.deepEqual(result.result.structuredContent, payload)
    assert.equal(JSON.parse(result.result.content[0].text).sourceRevision, payload.sourceRevision)

    const rejected = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'expired' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {} }),
    })
    assert.equal((await rejected.json()).error.code, -32001)
  } finally {
    await close(server)
  }
})
