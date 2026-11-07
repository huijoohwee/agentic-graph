import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { persistImportedWebpageUrlArtifact } from '@/features/markdown-workspace/workspaceImport/webpageUrlExport'
import { saveWorkspaceRevealSnapshot } from '../../viteWorkspaceRevealSnapshot'
import { createWorkspaceRevealHandler } from '../../viteWorkspaceReveal'
import { createKgFsPathPolicy } from '../../viteWorkspaceArtifactBridge'
import { saveWorkspaceWebsiteLocalCopy } from '@/features/workspace-fs/workspaceRevealInFileManager'
import { projectWebsiteImportTree } from '@/features/source-files/websiteImportTreeProjection'
import { toWorkspaceDocsMirrorPath } from '@/features/workspace-fs/workspaceFsPersistedReconciliation'
import { buildWebsiteCrawlTablePanelMarkdown } from '@/lib/websites/websiteCrawlTablePanel'

const body = (url: string, text: string) => `---\nkgWebpageUrl: "${url}"\n---\n${text}\n`

test('URL imports retain one host/path file across titles and revisions, with distinct query identity', async () => {
  const store = createMemoryWorkspaceFs()
  const url = 'https://example.invalid/library/article-42'
  const importPage = (source: string, title: string, text: string) => persistImportedWebpageUrlArtifact({
    fs: store, url: source, importedName: title + '.md', importedText: body(source, text), mirrorToHost: false,
  })
  const first = await importPage(url, 'Original title', 'first')
  assert.equal(first?.exportMarkdownPath, '/websites/example.invalid/library/article-42.md')
  assert.equal(toWorkspaceDocsMirrorPath('docs_/websites/example.invalid/library/article-42.md'), first?.exportMarkdownPath)
  assert.equal(toWorkspaceDocsMirrorPath('docs_/ordinary.md'), '/docs_/ordinary.md')
  const second = await importPage(url, 'Changed title', 'second')
  assert.equal(second?.exportMarkdownPath, first?.exportMarkdownPath)
  assert.match(String(await store.readFileText(first!.exportMarkdownPath)), /second/)
  const variant = await importPage(url + '?view=full', 'Changed title', 'query page')
  assert.notEqual(variant?.exportMarkdownPath, first?.exportMarkdownPath)
  const files = (await store.listEntries()).filter(entry => entry.kind === 'file' && entry.path.startsWith('/websites/'))
  assert.equal(files.length, 2)
  await store.createFile({ parentPath: '/websites/example.invalid/library', name: 'occupied.md', text: 'User document' })
  await assert.rejects(importPage('https://example.invalid/library/occupied', 'Occupied', 'replacement'), /another document/)
  assert.equal(await store.readFileText('/websites/example.invalid/library/occupied.md'), 'User document')
})

test('local website publication and Reveal share the direct output tree and preserve edited files', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'stable-websites-')))
  const workspacePath = '/websites/example.invalid/library/article.md'
  try {
    const first = await saveWorkspaceRevealSnapshot(root, { workspacePath, text: 'first' })
    assert.equal(first, path.join(root, workspacePath))
    assert.equal(await saveWorkspaceRevealSnapshot(root, { workspacePath, text: 'second' }), first)
    assert.equal(await fs.readFile(first, 'utf8'), 'second')
    assert.deepEqual(await fs.readdir(path.dirname(first)), ['article.md'])
    await assert.rejects(fs.stat(path.join(root, 'revealed')), { code: 'ENOENT' })
    await fs.writeFile(first, 'Local user edit')
    await assert.rejects(saveWorkspaceRevealSnapshot(root, { workspacePath, text: 'third' }), /edited.*preserved/)
    assert.equal(await fs.readFile(first, 'utf8'), 'Local user edit')
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside); await fs.symlink(outside, path.join(root, 'websites/linked.invalid'))
    await assert.rejects(saveWorkspaceRevealSnapshot(root, { workspacePath: '/websites/linked.invalid/page.md', text: 'no' }), /replaced.*preserved/)
    assert.deepEqual(await fs.readdir(outside), [])
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('local Import save waits for guarded filesystem publication without opening a file manager', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'stable-import-host-')))
  const originalDocs = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalFetch = globalThis.fetch
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = path.join(root, 'docs')
  let opened = 0
  const handler = createWorkspaceRevealHandler(path.join(root, 'repo'), createKgFsPathPolicy(path.join(root, 'repo')), async () => { opened++ })
  const server = createServer((req, res) => { void handler(req, res, () => undefined) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: new URL(base) } })
  globalThis.fetch = (input, init) => originalFetch(new URL(String(input), base), { ...init, headers: { ...init?.headers, Origin: base } })
  try {
    const target = '/websites/example.invalid/library/page.md'
    await saveWorkspaceWebsiteLocalCopy(target, 'one')
    await saveWorkspaceWebsiteLocalCopy(target, 'two')
    const output = path.join(root, 'docs_', target)
    assert.equal(await fs.readFile(output, 'utf8'), 'two')
    assert.equal(opened, 0)
    await Promise.all(Array.from({ length: 6 }, (_, i) => saveWorkspaceWebsiteLocalCopy(`/websites/example.invalid/library/page-${i}.md`, String(i))))
    assert.equal((await fs.readdir(path.dirname(output))).length, 7, 'parallel crawl writes must serialize rather than collide with file-manager busy state')
    await fs.writeFile(output, 'Local edit')
    await assert.rejects(saveWorkspaceWebsiteLocalCopy(target, 'three'), /edited.*preserved/)
    const request = { saveOnly: true, snapshot: { workspacePath: target, text: 'three' } }
    assert.equal((await originalFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.invalid' }, body: JSON.stringify(request) })).status, 403)
    assert.equal((await globalThis.fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, snapshot: { workspacePath: '/notes/private.md', text: 'no' } }) })).status, 400)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocs === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = originalDocs
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('new crawl links address stable workspace documents while capture download identities remain explicit', () => {
  const markdown = buildWebsiteCrawlTablePanelMarkdown({ version: 1, importId: '20260101T010101Z', rootUrl: 'https://example.invalid/',
    status: 'done', startedAtMs: 1, errors: [], nodes: [{ nodeId: 'article', url: 'https://example.invalid/library/article', path: '/library/article', status: 'ok', artifacts: { markdownRelPath: 'nodes/article/page.md' } }] })
  assert.match(decodeURIComponent(markdown), /kgDoc=\/websites\/example.invalid\/library\/article.md/)
})

test('discovery from a nested website document projects the same URL path used by URL and crawl imports', async () => {
  const store = createMemoryWorkspaceFs()
  const url = 'https://example.invalid/library/article', next = 'https://example.invalid/library/next'
  const imported = await persistImportedWebpageUrlArtifact({ fs: store, url, importedName: 'Article.md', importedText: body(url, 'Article'), mirrorToHost: false })
  const tree = projectWebsiteImportTree(await store.listEntries(), {}, { id: 1, url, sourcePath: imported!.exportMarkdownPath,
    pages: [{ url: next, path: '/library/next' }], selected: new Set([next]), visited: new Set(), busy: false, error: '', limited: false, query: '' })
  assert.equal(tree.pageUrls.get('/websites/example.invalid/library/next.md'), next)
  assert(!tree.entries.some(entry => entry.path.includes('/library/library/')))
})
