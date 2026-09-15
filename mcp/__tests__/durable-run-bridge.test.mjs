import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtempSync, realpathSync, writeFileSync, rmSync, chmodSync, linkSync, symlinkSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDurableRunBridgePlugin } from '../../canvas/viteDurableRunBridge.mjs'
import { readStableBoundedFile } from '../bounded-file-reader.js'

async function listen(handler) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, origin: 'http://127.0.0.1:' + server.address().port,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } }
}
function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'durable-bridge-')))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('local browser bridge uses private host authority and rejects foreign or malformed calls', async t => {
  const directory = privateDirectory(t), file = join(directory, 'host.json')
  const authorization = 'Bearer ' + randomBytes(32).toString('hex')
  let calls = 0
  const upstream = await listen(async (req, res) => {
    calls++; assert.equal(req.headers.authorization, authorization); assert.equal(req.headers.origin, undefined)
    let raw = ''; for await (const chunk of req) raw += chunk
    assert.deepEqual(JSON.parse(raw), { runId: 'retained-run' })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ runId: 'retained-run', status: 'completed' }))
  })
  t.after(() => upstream.close())
  writeFileSync(file, JSON.stringify({ endpoint: upstream.origin + '/api/agent-swarm/', authorization }), { mode: 0o600 })
  let middleware
  const bridge = await listen((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end() }) })
  t.after(() => bridge.close())
  createDurableRunBridgePlugin({ env: { AGENTIC_OS_DURABLE_RUN_HOST_CONFIG: file } }).configureServer({
    httpServer: bridge.server, middlewares: { use(value) { middleware = value } },
  })
  const send = (body = { runId: 'retained-run' }, headers = {}) => fetch(bridge.origin + '/api/agent-swarm/status', {
    method: 'POST', headers: { origin: bridge.origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
  const response = await send(); assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { runId: 'retained-run', status: 'completed' }); assert.equal(calls, 1)
  assert.equal((await send(undefined, { origin: 'https://foreign.example' })).status, 403)
  assert.equal((await send(undefined, { 'content-encoding': 'gzip' })).status, 415)
  const forgedHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(bridge.origin + '/api/agent-swarm/status', { method: 'POST',
      headers: { host: 'foreign.example', origin: bridge.origin, 'content-type': 'application/json' } },
    res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject); req.end(JSON.stringify({ runId: 'retained-run' }))
  })
  assert.equal(forgedHostStatus, 403)
  assert.equal((await send({ runId: 'retained-run', principalId: 'foreign' })).status, 400); assert.equal(calls, 1)
  chmodSync(file, 0o644); assert.equal((await send()).status, 503); assert.equal(calls, 1)
  chmodSync(file, 0o600)
  writeFileSync(file, JSON.stringify({ endpoint: 'https://foreign.example/api/agent-swarm/', authorization }))
  assert.equal((await send()).status, 503); assert.equal(calls, 1)
})

test('private bounded files reject extra links, symlinks, FIFOs and changed permissions', { timeout: 3000 }, async t => {
  const directory = privateDirectory(t), file = join(directory, 'config')
  const read = () => readStableBoundedFile({ filePath: file, containingDirectory: directory, maximumBytes: 100, requirePrivate: true })
  writeFileSync(file, 'private', { mode: 0o600 })
  assert.equal((await read()).content.toString(), 'private')
  linkSync(file, join(directory, 'extra')); await assert.rejects(read); rmSync(join(directory, 'extra'))
  await assert.rejects(() => readStableBoundedFile({ filePath: file, containingDirectory: directory, maximumBytes: 100,
    requirePrivate: true, afterOpen: () => { chmodSync(file, 0o644) } }))
  rmSync(file); symlinkSync(join(directory, 'missing'), file); await assert.rejects(read)
  rmSync(file); execFileSync('mkfifo', [file]); await assert.rejects(read)
})
