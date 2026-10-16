import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorkspaceProjectMiddleware, WORKSPACE_PROJECT_PATH } from '../../viteWorkspaceProject'

test('project runtime remains available after Vite closes its configuration module runner', async t => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-project-vite-')))
  const rootDir = path.join(directory, 'store')
  await fs.mkdir(rootDir)
  const configFile = path.join(directory, 'vite.config.mjs')
  const bridge = fileURLToPath(new URL('../../viteWorkspaceProject.ts', import.meta.url))
  await fs.writeFile(configFile, `
    import { createWorkspaceProjectMiddleware, WORKSPACE_PROJECT_PATH } from ${JSON.stringify(bridge)};
    export default { root: ${JSON.stringify(directory)}, logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [{ name: 'test-native-project-owner', configureServer(server) {
        server.middlewares.use(WORKSPACE_PROJECT_PATH, createWorkspaceProjectMiddleware(server.httpServer, ${JSON.stringify(rootDir)}));
      } }] };
  `)
  const { createServer } = await import('vite')
  const server = await createServer({ configFile, configLoader: 'runner' })
  t.after(async () => { await server.close(); await fs.rm(directory, { recursive: true, force: true }) })
  await server.listen()
  const port = (server.httpServer!.address() as import('node:net').AddressInfo).port
  const url = `http://127.0.0.1:${port}${WORKSPACE_PROJECT_PATH}`
  const session = await fetch(url + '/session')
  assert.equal(session.status, 200, await session.clone().text())
  const { token } = await session.json()
  const discovery = await fetch(url + '/api/plan', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-token': token },
    body: JSON.stringify({ operation: 'project-list', path: '_', workspaceRoot: rootDir }),
  })
  assert.equal(discovery.status, 200, await discovery.clone().text())
  assert.deepEqual((await discovery.json()).data.projects, [])
})

test('Canvas bridge uses its existing loopback listener, scoped session and exact project owner', async t => {
  const rootDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-project-')))
  const server = http.createServer((request, response) => {
    request.url = request.url!.slice(WORKSPACE_PROJECT_PATH.length)
    return middleware(request, response, () => { throw new Error('Unexpected fallback') })
  })
  const middleware = createWorkspaceProjectMiddleware(server, rootDir)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    await fs.rm(rootDir, { recursive: true, force: true })
  })
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
  const url = origin + WORKSPACE_PROJECT_PATH
  const session = await fetch(url + '/session')
  assert.equal(session.status, 200)
  assert.match(session.headers.get('set-cookie')!, /Path=\/__workspace_project/)
  const { token } = await session.json()
  const post = (mode: string, args: unknown, extra = {}) => fetch(`${url}/api/${mode}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-workspace-token': token, ...extra }, body: JSON.stringify(args),
  })
  const args = { operation: 'project-checkpoint', path: 'canvas-test', workspaceRoot: rootDir, expectedVersion: '', files: [{ path: 'note.md', content: '# Canvas 雪\n' }] }
  const plan = await (await post('plan', args)).json()
  assert.equal(plan.ok, true)
  const result = await (await post('apply', { ...args, planDigest: plan.planDigest, operatorAuthorized: true })).json()
  assert.equal(result.ok, true)
  const inspected = await (await post('plan', { operation: 'project-inspect', path: args.path, workspaceRoot: rootDir })).json()
  assert.equal(inspected.data.version, result.version)
  assert.equal(inspected.data.files[0].content, args.files[0].content)
  assert.equal((await fetch(url + '/session', { headers: { origin: 'https://outside.invalid' } })).status, 403)
  const deniedHost = await new Promise<number>(resolve => {
    http.get(url + '/session', { headers: { host: 'outside.invalid' } }, response => { response.resume(); resolve(response.statusCode!) })
  })
  assert.equal(deniedHost, 403)
  assert.equal((await post('apply', args, { 'x-workspace-token': 'wrong' })).status, 403)
  assert.equal((await fetch(url + '/')).status, 404, 'no standalone page or fallback')
})

test('Canvas project bridge refuses absent configuration and non-loopback listeners', async () => {
  for (const [server, rootDir] of [[null, ''], [{ address: () => ({ address: '0.0.0.0', port: 8000 }) }, '/tmp']] as const) {
    const middleware = createWorkspaceProjectMiddleware(server as unknown as http.Server, rootDir)
    let body = ''
    const response = { statusCode: 0, setHeader() {}, end(value: string) { body = value } }
    await middleware({ headers: { host: '127.0.0.1:8000' } } as http.IncomingMessage, response as unknown as http.ServerResponse, () => {})
    assert.equal(response.statusCode, 503)
    assert.equal(JSON.parse(body).error.code, 'STORAGE_UNAVAILABLE')
  }
})
