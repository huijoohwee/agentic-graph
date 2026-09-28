import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { createWebsiteImportWorkspaceWriter } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportNodeWriter'
import { runWorkspaceWebsiteImport } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction'
import { addCompletedWebsiteFileToExplorer } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportExplorerProgress'
import { beginWebsiteImportExplorerUpdates, isWebsiteImportExplorerUpdate } from '@/features/workspace-fs/websiteImportRefreshGuard'
import { projectWorkspaceEntriesToSourceFilesExplorer, resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import type { WebsiteImportManifestV1, WebsiteImportNode } from '@/lib/websites/server/websiteImportTypes'

const node = (id: string, url: string): WebsiteImportNode => ({
  nodeId: id,
  url,
  path: new URL(url).pathname,
  status: 'ok',
  artifacts: {},
})

test('a large progressive import initializes and inventories the workspace once', async () => {
  const stored = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 }] })
  let seeds = 0
  let inventories = 0
  const fs = {
    ...stored,
    async ensureSeed() { seeds += 1; return stored.ensureSeed() },
    async listEntries() { inventories += 1; return stored.listEntries() },
  }
  const published: string[] = []
  const writer = await createWebsiteImportWorkspaceWriter({
    fs, url: 'https://example.invalid/', importId: 'bounded',
    settings: { outputDirRel: '', concurrency: 2, defaultView: 'markdown', generateArtifactDocs: false, browserEnhance: false },
    importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} },
    onFileCreated: async source => { published.push(source.path) },
  })
  const nodes = Array.from({ length: 100 }, (_, i) => node(`page-${i}`, `https://example.invalid/section-${i}/page`))
  for (let i = 0; i < nodes.length; i += 10) await writer.writeNodes(nodes.slice(0, i + 10))
  await writer.finalize({ version: 1, importId: 'bounded', rootUrl: 'https://example.invalid/', status: 'done', startedAtMs: 1, nodes, errors: [] })
  assert.equal(published.length, 100)
  assert.equal(seeds, 1, 'page writes must not repeat full seed reconciliation')
  assert.equal(inventories, 1, 'nested folders must share one inventory across snapshots')
  assert.equal(new Set(published).size, 100)
  for (const path of published) assert.match(String(await stored.readFileText(path)), /kgWebsiteNodeId/)
})

test('missing server Markdown never reparses a large HTML capture on the client', async () => {
  const fs = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 }] })
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  try {
    globalThis.fetch = async input => {
      const kind = new URL(String(input), 'https://example.invalid').searchParams.get('kind') || ''
      requests.push(kind)
      return new Response('', { status: 404 })
    }
    const writer = await createWebsiteImportWorkspaceWriter({
      fs, url: 'https://example.invalid/', importId: 'missing-markdown',
      settings: { outputDirRel: '', concurrency: 2, defaultView: 'markdown', generateArtifactDocs: true, browserEnhance: false },
      importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} },
    })
    const page = node('oversized', 'https://example.invalid/oversized')
    page.artifacts = { rawHtmlRelPath: 'nodes/oversized/raw.html', rawHtmlBytes: 12_017_857 }
    await writer.writeNodes([page])
    assert.deepEqual(requests, ['markdown'])
    const text = await fs.readFileText('/websites/example.invalid/missing-markdown/oversized.md')
    assert.match(String(text), /Markdown conversion is unavailable/)
    assert.match(String(text), /kgWebsiteNodeId: "oversized"/)
    assert.ok(String(text).length < 1024, 'unconverted captures remain referenced, not copied into the workspace')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('completed crawl pages appear before the terminal sitemap and Canvas projection', async () => {
  const fs = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 }] })
  await fs.ensureSeed()
  const publishedPaths: string[] = []
  const job = { current: 1 }
  const writer = await createWebsiteImportWorkspaceWriter({
    fs,
    url: 'https://example.invalid/',
    importId: 'progress-test',
    settings: { outputDirRel: '', concurrency: 2, defaultView: 'markdown', generateArtifactDocs: false, browserEnhance: false },
    importJobRef: job,
    jobId: 1,
    status: { setStatusProgress: () => undefined },
    onFileCreated: async source => { publishedPaths.push(source.path) },
  })
  const home = node('home', 'https://example.invalid/')
  const docs = node('docs', 'https://example.invalid/docs')
  await writer.writeNodes([home])
  assert.equal(publishedPaths.length, 1)
  assert.match(String(await fs.readFileText(publishedPaths[0]!)), /kgWebsiteNodeId: "home"/)
  assert.ok(projectWorkspaceEntriesToSourceFilesExplorer(await fs.listEntries(), resolveWorkspaceSourceRootPaths())
    .some(entry => entry.path === publishedPaths[0]), 'Source Files must project the first page while the crawl is running')
  assert.equal((await fs.listEntries()).some(entry => entry.name === 'website.sitemap.md'), false)

  await writer.writeNodes([home, docs])
  assert.equal(publishedPaths.length, 2)
  assert.match(String(await fs.readFileText(publishedPaths[1]!)), /kgWebsiteNodeId: "docs"/)

  const manifest: WebsiteImportManifestV1 = {
    version: 1,
    importId: 'progress-test',
    rootUrl: 'https://example.invalid/',
    status: 'done',
    startedAtMs: 1,
    finishedAtMs: 2,
    nodes: [docs, home],
    errors: [],
  }
  const result = await writer.finalize(manifest)
  assert.equal(publishedPaths.length, 2, 'terminal snapshot must not rewrite already published pages')
  assert.equal(result.created.createdPaths.length, 4)
  assert.ok(result.canvasPath)
  assert.match(String(await fs.readFileText(result.canvasPath!)), /Website crawl/)
  const sitemap = result.created.createdPaths.find(path => path.endsWith('website.sitemap.md'))
  assert.ok(sitemap)
  assert.match(String(await fs.readFileText(sitemap!)), /example.invalid\/docs/)
})

test('a running import refreshes and expands the first completed page before terminal status', async () => {
  const fs = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 }] })
  const root = '/websites/example.invalid/progress-live'
  const guardedFs = {
    ...fs,
    async createFolder(args: Parameters<typeof fs.createFolder>[0]) {
      if (`${args.parentPath}/${args.name}` === root) assert.equal(isWebsiteImportExplorerUpdate(root), true)
      return fs.createFolder(args)
    },
    async createFile(args: Parameters<typeof fs.createFile>[0]) {
      assert.equal(isWebsiteImportExplorerUpdate(`${args.parentPath}/${args.name}`), true,
        'the first file mutation must already be guarded before its notification')
      return fs.createFile(args)
    },
  }
  const first = node('first', 'https://example.invalid/')
  const second = node('second', 'https://example.invalid/docs')
  const snapshot = (status: 'running' | 'done', nodes: WebsiteImportNode[]): WebsiteImportManifestV1 => ({
    version: 1,
    importId: 'progress-live',
    rootUrl: 'https://example.invalid/',
    status,
    startedAtMs: 1,
    finishedAtMs: status === 'done' ? 2 : undefined,
    nodes,
    errors: [],
  })
  const originalFetch = globalThis.fetch
  let statusReads = 0
  let visibleEntries: string[] = []
  let explorerEntries: import('@/features/workspace-fs/types').WorkspaceEntry[] = []
  let expandedPaths = new Set<string>()
  let refreshes = 0
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/__website_import/start') && init?.method === 'POST') return json({ ok: true, importId: 'progress-live' })
      if (url.includes('/__website_import/status')) {
        statusReads += 1
        if (statusReads === 1) return json({ ok: true, status: 'running', running: true, progress: { stage: 'converting', total: 2, processed: 1, ok: 1, error: 0 } })
        assert.ok(visibleEntries.some(path => path.endsWith('/index.md')), 'first completed page must be visible before done')
        assert.ok(expandedPaths.has('/websites/example.invalid/progress-live'), 'import folder must be expanded before done')
        return json({ ok: true, status: 'done', running: false, progress: { stage: 'converting', total: 2, processed: 2, ok: 2, error: 0 } })
      }
      if (url.includes('/__website_import/manifest')) return json({ ok: true, manifest: snapshot(statusReads < 2 ? 'running' : 'done', statusReads < 2 ? [first] : [first, second]) })
      throw new Error(`Unexpected fetch: ${url}`)
    }
    const result = await runWorkspaceWebsiteImport({
      url: 'https://example.invalid/',
      opts: { generateArtifactDocs: false, preserveActiveDocument: true, maxPages: 2 },
      importJobRef: { current: 1 },
      jobId: 1,
      status: { setStatusProgress: () => undefined },
      getFs: async () => guardedFs,
      setEntries: updater => {
        explorerEntries = typeof updater === 'function' ? updater(explorerEntries) : updater
        visibleEntries = projectWorkspaceEntriesToSourceFilesExplorer(explorerEntries, resolveWorkspaceSourceRootPaths()).map(entry => entry.path)
      },
      refresh: async () => {
        refreshes += 1
        const entries = await fs.listEntries()
        visibleEntries = projectWorkspaceEntriesToSourceFilesExplorer(entries, resolveWorkspaceSourceRootPaths()).map(entry => entry.path)
        return { entries, sourcesByPath: {} }
      },
      setExpandedPaths: updater => {
        expandedPaths = typeof updater === 'function' ? updater(expandedPaths) : updater
      },
    })
    assert.equal(statusReads, 2)
    assert.equal(refreshes, 1, 'crawl pages should publish metadata directly and reconcile once at completion')
    assert.equal(result.createdPaths.length, 4)
    assert.ok(visibleEntries.some(path => path.endsWith('/docs.md')))
    assert.equal(isWebsiteImportExplorerUpdate(root), false, 'completion must release the refresh guard')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('completed page projection remains metadata-only and deduplicated for a large crawl', () => {
  let entries: import('@/features/workspace-fs/types').WorkspaceEntry[] = []
  const root = '/websites/example.invalid/large-crawl'
  const finish = beginWebsiteImportExplorerUpdates(root)
  try {
    assert.equal(isWebsiteImportExplorerUpdate(`${root}/page.md`), true)
    assert.equal(isWebsiteImportExplorerUpdate('/docs/unrelated.md'), false)
    for (let i = 0; i < 500; i += 1) {
      entries = addCompletedWebsiteFileToExplorer(entries, `${root}/page-${i}.md`)
    }
    assert.equal(entries.filter(entry => entry.kind === 'file').length, 500)
    assert.equal(entries.find(entry => entry.path === root)?.kind, 'folder')
    assert.equal(entries.some(entry => typeof entry.text === 'string'), false)
    assert.equal(addCompletedWebsiteFileToExplorer(entries, `${root}/page-499.md`), entries)
    assert.equal(projectWorkspaceEntriesToSourceFilesExplorer(entries, resolveWorkspaceSourceRootPaths()).filter(entry => entry.kind === 'file').length, 500)
  } finally {
    finish()
  }
  assert.equal(isWebsiteImportExplorerUpdate(`${root}/page.md`), false)
})

test('failed writer initialization releases its refresh guard and reconciles once', async () => {
  const fs = createMemoryWorkspaceFs()
  const originalFetch = globalThis.fetch
  let refreshed = 0
  try {
    globalThis.fetch = async input => {
      const url = String(input)
      const value = url.includes('/start') ? { ok: true, importId: 'failed-writer' }
        : url.includes('/status') ? { status: 'done', progress: { processed: 1, total: 1 } }
          : { ok: true, manifest: { version: 1, importId: 'failed-writer', rootUrl: 'https://example.invalid/',
            status: 'done', startedAtMs: 1, nodes: [node('first', 'https://example.invalid/')], errors: [] } }
      return new Response(JSON.stringify(value))
    }
    await assert.rejects(runWorkspaceWebsiteImport({
      url: 'https://example.invalid/', opts: { generateArtifactDocs: false }, importJobRef: { current: 1 }, jobId: 1,
      status: { setStatusProgress() {} }, setEntries() {},
      getFs: async () => ({ ...fs, async ensureSeed() { throw new Error('seed unavailable') } }),
      refresh: async () => { refreshed += 1; return { entries: [], sourcesByPath: {} } },
    }), /seed unavailable/)
    assert.equal(refreshed, 1)
    assert.equal(isWebsiteImportExplorerUpdate('/websites/example.invalid/failed-writer'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
