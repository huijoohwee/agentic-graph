import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { resolveExistingWebsiteImportWorkspaceRoot, resolveWebsiteImportWorkspaceRoot, resolveWorkspaceDocumentOutputRoot } from '../lib/websites/server/websiteImportStorage'
import { createWebsiteImportHandler } from '../lib/websites/server/websiteImportServer'

test('new imports use configured docs_ while existing sandbox generations remain readable and immutable', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'website-storage-')))
  const repo = path.join(root, 'repo'), docs = path.join(root, 'local-documents/docs')
  const previousDocs = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousStore = process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = docs
  delete process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
  await fs.mkdir(repo); await fs.writeFile(path.join(repo, 'sample.html'), '<h1>Portable local article</h1>')
  const handler = createWebsiteImportHandler({ repoRoot: repo })
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const oldId = '20260102T030405Z', oldRoot = path.join(root, 'sandbox/agentic-graph-workspace/website-imports')
  try {
    const expected = path.join(root, 'local-documents/docs_')
    assert.equal(resolveWorkspaceDocumentOutputRoot(repo), expected)
    const current = resolveWebsiteImportWorkspaceRoot({ repoRoot: repo })
    assert.ok(current.ok); if (!current.ok) return
    assert.equal(current.storeRootAbs, expected)
    const override = resolveWebsiteImportWorkspaceRoot({ repoRoot: repo, storeRoot: path.join(root, 'custom') })
    assert.ok(override.ok && override.abs.startsWith(path.join(root, 'custom/')))
    await fs.mkdir(path.join(oldRoot, oldId, 'nodes', 'local'), { recursive: true })
    await fs.writeFile(path.join(oldRoot, oldId, 'nodes/local/page.md'), 'Preserved old source')
    await fs.writeFile(path.join(oldRoot, oldId, 'manifest.json'), JSON.stringify({ importId: oldId, status: 'done', nodes: [] }))
    const legacy = await resolveExistingWebsiteImportWorkspaceRoot({ repoRoot: repo, importId: oldId })
    assert.ok(legacy.ok && legacy.abs === oldRoot)
    for (const route of ['manifest', 'status']) assert.equal((await fetch(`${base}/__website_import/${route}?importId=${oldId}`)).status, 200)
    const oldRead = await fetch(`${base}/__website_import/artifact?importId=${oldId}&nodeId=local&kind=markdown`)
    assert.equal(await oldRead.text(), 'Preserved old source')
    const send = (generationToken?: string) => fetch(`${base}/__website_import/import-url`, { method: 'POST',
      body: JSON.stringify({ url: 'sample.html', options: { generationToken } }) })
    assert.equal((await send(oldId)).status, 409, 'Old generation cannot be shadowed in the new store')
    const imported = await send(); assert.equal(imported.status, 200)
    const { importId, nodeId } = await imported.json()
    assert.match(await fs.readFile(path.join(current.abs, importId, 'nodes', nodeId, 'raw.html'), 'utf8'), /Portable local article/)
    assert.equal((await fetch(`${base}/__website_import/manifest?importId=${importId}`)).status, 200)
    const crawlResponse = await fetch(`${base}/__website_import/start`, { method: 'POST',
      body: JSON.stringify({ url: 'sample.html', options: { maxPages: 1 } }) })
    assert.equal(crawlResponse.status, 200)
    const crawl = await crawlResponse.json(), deadline = Date.now() + 5000
    let crawlManifest
    do {
      crawlManifest = JSON.parse(await fs.readFile(path.join(current.abs, crawl.importId, 'manifest.json'), 'utf8'))
      if (!['queued', 'running'].includes(crawlManifest.status)) break
      assert.ok(Date.now() < deadline, 'local crawler must terminate within its test budget')
      await new Promise(resolve => setTimeout(resolve, 10))
    } while (true)
    assert.equal(crawlManifest.status, 'done')
    assert.ok(crawlManifest.nodes.length > 0)
    assert.match(await fs.readFile(path.join(current.abs, crawl.importId, 'nodes', crawlManifest.nodes[0].nodeId, 'raw.html'), 'utf8'), /Portable local article/)

    assert.equal(await fs.readFile(path.join(oldRoot, oldId, 'nodes/local/page.md'), 'utf8'), 'Preserved old source')
    await fs.mkdir(path.join(current.abs, oldId), { recursive: true })
    const incomplete = await resolveExistingWebsiteImportWorkspaceRoot({ repoRoot: repo, importId: oldId })
    assert.ok(incomplete.ok && incomplete.abs === current.abs, 'Never mix incomplete new runs with old artifacts')
    process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = path.join(root, 'explicit-store')
    const explicit = await resolveExistingWebsiteImportWorkspaceRoot({ repoRoot: repo, importId: oldId })
    assert.ok(explicit.ok && explicit.storeRootAbs.endsWith('explicit-store'))
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (previousDocs === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocs
    if (previousStore === undefined) delete process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
    else process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = previousStore
    await fs.rm(root, { recursive: true, force: true })
  }
})
