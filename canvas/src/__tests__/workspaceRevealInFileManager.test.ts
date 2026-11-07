import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { createKgFsPathPolicy } from '../../viteWorkspaceArtifactBridge'
import { createWorkspaceRevealHandler, resolveWorkspaceRevealTarget, workspaceRevealCommand } from '../../viteWorkspaceReveal'

test('reveal resolves exact saved files and folders; rejects missing files and symlink escapes', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-reveal-')))
  const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-reveal-outside-')))
  const repo = path.join(root, 'repo'), policy = createKgFsPathPolicy(repo)
  const nodeId = 'a123', importId = '20260928T034028Z'
  const artifact = path.join(root, 'sandbox/agentic-graph-workspace/website-imports', importId, 'nodes', nodeId, 'page.md')
  try {
    await fs.mkdir(repo)
    await fs.mkdir(path.dirname(artifact), { recursive: true })
    await fs.writeFile(artifact, '# Saved page')
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { website: { importId, nodeId } }), /not a capture identity/)
    assert.equal(await resolveWorkspaceRevealTarget(repo, policy, { path: artifact, kind: 'file' }), artifact)
    assert.equal(await resolveWorkspaceRevealTarget(repo, policy, { path: repo }), repo)
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { path: path.join(repo, 'missing.md') }), /no saved local/)
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { website: { importId, nodeId: '..' } }), /not a capture identity/)
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { path: outside }), /outside/)
    await fs.symlink(outside, path.join(repo, 'escape'))
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { path: path.join(repo, 'escape') }), /outside/)
    const seed = path.join(root, 'agentic-graph/docs/workspace-seeds/demo.md')
    await fs.mkdir(path.dirname(seed), { recursive: true }); await fs.writeFile(seed, '# Seed')
    assert.equal(await resolveWorkspaceRevealTarget(repo, policy, { workspacePath: '/docs/workspace-seeds/demo.md' }), seed)
    await assert.rejects(resolveWorkspaceRevealTarget(repo, policy, { path: repo, kind: 'file' }), /does not match/)
    assert.deepEqual(workspaceRevealCommand(repo, 'linux', true).args, [repo])
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
    assert.equal((await request('x'.repeat(500001))).status, 413)
    assert.equal(calls.length, 0)
    const result = await request(JSON.stringify({ path: repo }))
    assert.equal(result.status, 200); assert.equal((await result.json()).path, repo)
    assert.equal(calls.length, 1)
    const snapshot = { workspacePath: '/notes/研究.md', text: '# Current revision\nUnsaved text' }
    const mirror = path.join(repo, 'mirror.md')
    await fs.writeFile(mirror, 'Older disk content')
    const copyResult = await request(JSON.stringify({ kind: 'file', path: mirror, snapshot }))
    assert.equal(copyResult.status, 200)
    const copy = await copyResult.json()
    assert.ok(copy.path.startsWith(path.join(root, 'docs_/revealed/'))); assert.ok(copy.path.endsWith('/notes/研究.md')); assert.match(copy.message, /Saved local copy/)
    assert.equal(await fs.readFile(copy.path, 'utf8'), snapshot.text)
    assert.equal(await fs.readFile(mirror, 'utf8'), 'Older disk content')
    const repeat = await request(JSON.stringify({ kind: 'file', snapshot }))
    assert.equal((await repeat.json()).path, copy.path)
    await fs.writeFile(mirror, snapshot.text)
    const exact = await request(JSON.stringify({ kind: 'file', path: mirror, snapshot }))
    assert.equal((await exact.json()).path, mirror)
    const folderSnapshot = { workspacePath: '/websites', entries: [
      { workspacePath: '/websites/example.test/run/page.md', kind: 'file', text: 'Saved page' },
      { workspacePath: '/websites/empty', kind: 'folder' },
    ] }
    const folderResult = await request(JSON.stringify({ kind: 'folder', folderSnapshot }))
    assert.equal(folderResult.status, 200)
    const folder = await folderResult.json()
    assert.equal(folder.path, path.join(root, 'docs_/websites'))
    assert.ok(folder.path.endsWith('/websites'))
    assert.equal(await fs.readFile(path.join(folder.path, 'example.test/run/page.md'), 'utf8'), 'Saved page')
    assert.deepEqual(calls.at(-1)?.slice(1), workspaceRevealCommand(folder.path, process.platform, true).args)
    const before = calls.length
    assert.equal((await request(JSON.stringify({ kind: 'folder', folderSnapshot, snapshot }))).status, 400)
    assert.equal((await request(JSON.stringify({ kind: 'folder', folderSnapshot, path: repo }))).status, 400)
    assert.equal((await request(JSON.stringify({ kind: 'folder', folderSnapshot, outputRoot: path.join(os.tmpdir(), 'outside-folder-copy') }))).status, 403)
    assert.equal((await request(JSON.stringify({ kind: 'folder', snapshot }))).status, 400)
    assert.equal((await request(JSON.stringify({ path: path.join(os.tmpdir(), 'outside-reveal.md'), snapshot }))).status, 403)
    assert.equal((await request(JSON.stringify({ snapshot, outputRoot: path.join(os.tmpdir(), 'outside-output') }))).status, 403)
    assert.equal(calls.length, before)
    fail = true
    const failed = await request(JSON.stringify({ path: repo }))
    assert.equal(failed.status, 500); assert.equal((await failed.json()).ok, false)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.rm(root, { recursive: true, force: true })
  }
})
