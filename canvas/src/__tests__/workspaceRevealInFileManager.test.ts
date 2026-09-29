import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { createKgFsPathPolicy } from '../../viteWorkspaceArtifactBridge'
import { createWorkspaceRevealHandler, resolveWorkspaceRevealTarget, workspaceRevealCommand } from '../../viteWorkspaceReveal'

test('reveal resolves saved files, folders and import identities; rejects missing files and symlink escapes', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-reveal-')))
  const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-reveal-outside-')))
  const repo = path.join(root, 'repo'), policy = createKgFsPathPolicy(repo)
  const nodeId = 'a123', importId = '20260928T034028Z'
  const artifact = path.join(root, 'sandbox/agentic-graph-workspace/website-imports', importId, 'nodes', nodeId, 'page.md')
  try {
    await fs.mkdir(repo)
    await fs.mkdir(path.dirname(artifact), { recursive: true })
    await fs.writeFile(artifact, '# Saved page')
    assert.equal(await resolveWorkspaceRevealTarget(repo, policy, { website: { importId, nodeId } }), artifact)
    assert.equal(await resolveWorkspaceRevealTarget(repo, policy, { path: repo }), repo)
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { path: path.join(repo, 'missing.md') }), /no saved local/)
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { website: { importId, nodeId: '..' } }), /Invalid/)
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { path: outside }), /outside/)
    await fs.symlink(outside, path.join(repo, 'escape'))
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { path: path.join(repo, 'escape') }), /outside/)
    const seed = path.join(root, 'agentic-graph/docs/workspace-seeds/demo.md')
    await fs.mkdir(path.dirname(seed), { recursive: true }); await fs.writeFile(seed, '# Seed')
    assert.equal(await resolveWorkspaceRevealTarget(repo, policy, { workspacePath: '/docs/workspace-seeds/demo.md' }), seed)
    const shellLikeName = path.join(repo, 'a $(ignored); quote.md')
    assert.deepEqual(workspaceRevealCommand(shellLikeName, 'darwin').args, ['-R', shellLikeName])
    assert.equal(workspaceRevealCommand(shellLikeName, 'linux').command, 'xdg-open')
    assert.equal(workspaceRevealCommand(shellLikeName, 'win32').command, 'explorer.exe')
    assert.throws(() => workspaceRevealCommand(shellLikeName, 'aix'), /does not support/)
  } finally { await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }) }
})

test('HTTP reveal awaits host completion and rejects foreign origins, invalid bodies and host failures', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-reveal-http-')))
  const repo = path.join(root, 'repo')
  await fs.mkdir(repo)
  const calls: string[][] = []
  let fail = false
  const handler = createWorkspaceRevealHandler(repo, createKgFsPathPolicy(repo), async (command, args) => {
    calls.push([command, ...args]); if (fail) throw new Error('host failed')
  })
  const server = createServer((req, res) => { void handler(req, res, () => {}) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const request = (body: string, requestOrigin = origin) => fetch(origin, { method: 'POST', headers: {
    origin: requestOrigin, 'content-type': 'application/json' }, body })
  try {
    assert.equal((await request(JSON.stringify({ path: repo }), 'https://example.invalid')).status, 403)
    assert.equal((await request('{')).status, 400)
    assert.equal((await request('x'.repeat(9000))).status, 413)
    assert.equal(calls.length, 0)
    const result = await request(JSON.stringify({ path: repo }))
    assert.equal(result.status, 200); assert.equal((await result.json()).path, repo)
    assert.equal(calls.length, 1)
    fail = true
    const failed = await request(JSON.stringify({ path: repo }))
    assert.equal(failed.status, 500); assert.equal((await failed.json()).ok, false)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.rm(root, { recursive: true, force: true })
  }
})
