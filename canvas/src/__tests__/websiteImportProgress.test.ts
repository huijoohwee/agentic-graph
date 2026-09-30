import test from 'node:test'
import './websiteCollections.test'
import assert from 'node:assert/strict'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { createWebsiteImportWorkspaceWriter } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportNodeWriter'
import { runWorkspaceWebsiteImport } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction'
import { addCompletedWebsiteFileToExplorer } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportExplorerProgress'
import { beginWebsiteImportExplorerUpdates, isWebsiteImportExplorerUpdate } from '@/features/workspace-fs/websiteImportRefreshGuard'
import { projectWorkspaceEntriesToSourceFilesExplorer, resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import type { WebsiteImportManifestV1, WebsiteImportNode } from '@/lib/websites/server/websiteImportTypes'
import { parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'

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

test('query variants keep separate files without replacing a page already opened during the crawl', async () => {
  const fs = createMemoryWorkspaceFs()
  const published: string[] = []
  const writer = await createWebsiteImportWorkspaceWriter({
    fs, url: 'https://example.invalid/library', importId: 'query-pages',
    settings: { outputDirRel: '', concurrency: 2, defaultView: 'html', generateArtifactDocs: false, browserEnhance: false },
    importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} },
    onFileCreated: async source => { published.push(source.path) },
  })
  const home = node('home', 'https://example.invalid/library')
  await writer.writeNodes([home])
  const firstPath = published[0]!
  const firstText = await fs.readFileText(firstPath)
  assert.equal(parseCanvasWorkspaceFrontmatterPreset(String(firstText))?.canvas2dRenderer, 'd3')
  assert.equal(parseCanvasWorkspaceFrontmatterPreset(String(firstText))?.canvasRenderMode, '2d')
  await writer.writeNodes([home, node('a', 'https://example.invalid/library?category=a'), node('b', 'https://example.invalid/library?category=b')])
  assert.equal(new Set(published).size, 3, 'query variants must not overwrite a shared pathname')
  assert.equal(await fs.readFileText(firstPath), firstText, 'the displayed page must stay unchanged as later pages finish')
  assert.match(String(await fs.readFileText(published[1]!)), /category=a/)
  assert.match(String(await fs.readFileText(published[2]!)), /category=b/)
})

test('converted crawl pages carry the shared D3 preset when opened individually', async () => {
  const fs = createMemoryWorkspaceFs()
  const originalFetch = globalThis.fetch
  let path = ''
  try {
    globalThis.fetch = async () => new Response('# Complete article\n\nBody text.')
    const writer = await createWebsiteImportWorkspaceWriter({
      fs, url: 'https://example.invalid/', importId: 'page-preset',
      settings: { outputDirRel: '', concurrency: 2, defaultView: 'html', generateArtifactDocs: true, browserEnhance: false },
      importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} },
      onFileCreated: async source => { path = source.path },
    })
    await writer.writeNodes([node('article', 'https://example.invalid/article')])
    const text = String(await fs.readFileText(path))
    const preset = parseCanvasWorkspaceFrontmatterPreset(text)
    assert.equal(preset?.canvasSurfaceMode, '2d')
    assert.equal(preset?.canvas2dRenderer, 'd3')
    assert.match(text, /Complete article/)
    assert.match(text, /Body text\./)
  } finally { globalThis.fetch = originalFetch }
})

test('remaining sanitized path collisions cannot replace completed pages', async () => {
  const fs = createMemoryWorkspaceFs()
  const published: string[] = []
  const writer = await createWebsiteImportWorkspaceWriter({
    fs, url: 'https://example.invalid/', importId: 'collision',
    settings: { outputDirRel: '', concurrency: 2, defaultView: 'html', generateArtifactDocs: false, browserEnhance: false },
    importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} },
    onFileCreated: async source => { published.push(source.path) },
  })
  await writer.writeNodes([node('plus', 'https://example.invalid/a+b')])
  const text = await fs.readFileText(published[0]!)
  await assert.rejects(writer.writeNodes([node('at', 'https://example.invalid/a@b')]), /path collision/)
  assert.equal(published.length, 1)
  assert.equal(await fs.readFileText(published[0]!), text)
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
    assert.equal(parseCanvasWorkspaceFrontmatterPreset(String(text))?.canvas2dRenderer, 'd3')
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

test('crawl refresh ownership includes parent creation and ends only after all writers finish', () => {
  const root = '/websites/example.invalid/live'
  const finishFirst = beginWebsiteImportExplorerUpdates(root)
  const finishSecond = beginWebsiteImportExplorerUpdates(root)
  try {
    for (const path of ['/websites', '/websites/example.invalid', root, `${root}/page.md`]) {
      assert.equal(isWebsiteImportExplorerUpdate(path), true, path)
    }
    for (const path of ['/websites-other', '/websites/example.invalid-2', `${root}-other/page.md`, null]) {
      assert.equal(isWebsiteImportExplorerUpdate(path), false, String(path))
    }
    finishFirst()
    finishFirst()
    assert.equal(isWebsiteImportExplorerUpdate(root), true)
  } finally {
    finishFirst()
    finishSecond()
  }
  assert.equal(isWebsiteImportExplorerUpdate(root), false)
  assert.equal(isWebsiteImportExplorerUpdate('/websites'), false)
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


test('single selected page opens its own content, not the crawl canvas, including the root URL', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const requested of ['https://example.invalid/', 'https://example.invalid/topic?category=One%20Two']) {
      for (const fails of [false, true]) {
        const fs = createMemoryWorkspaceFs(), opened: string[] = []
        const selected = node('selected', requested)
        if (fails) selected.status = 'error'
        const manifest: WebsiteImportManifestV1 = { version: 1, importId: 'selected-content', rootUrl: 'https://example.invalid/',
          status: 'done', startedAtMs: 1, nodes: [node('other', 'https://example.invalid/other'), selected], errors: [] }
        globalThis.fetch = async input => {
          const url = String(input)
          const json = (value: unknown) => new Response(JSON.stringify(value))
          if (url.includes('/start?')) return json({ ok: true, importId: manifest.importId })
          if (url.includes('/status?')) return json({ ok: true, status: 'done' })
          if (url.includes('/manifest?')) return json({ ok: true, manifest })
          if (url.includes('/artifact?')) return new Response(new URL(url, requested).searchParams.get('nodeId') === 'selected' ? '# Exact requested page content' : '# Other page content')
          throw new Error('Unexpected request: ' + url)
        }
        const job = runWorkspaceWebsiteImport({ url: manifest.rootUrl, opts: { selectedUrls: [requested], generateArtifactDocs: true },
          importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} }, getFs: async () => fs,
          focusAfterImport: async path => { opened.push(path) } })
        if (fails) {
          await assert.rejects(job, /The requested page was not saved/)
          assert.deepEqual(opened, [], 'failed capture cannot open another page or summary')
        } else {
          await job
          assert.equal(opened.length, 1)
          const text = String(await fs.readFileText(opened[0]!))
          assert.match(text, /# Exact requested page content/)
          assert.ok(text.includes(requested))
          assert.doesNotMatch(text, /# Other page content|# Website crawl Canvas/)
        }
      }
    }
  } finally { globalThis.fetch = originalFetch }
})

test('a discovered page materializes at its projected row without a new crawl folder or summaries', async () => {
  const { projectWebsiteImportTree } = await import('@/features/source-files/websiteImportTreeProjection')
  const fs = createMemoryWorkspaceFs({ initialEntries: [
    { path: '/', parentPath: null, name: '', kind: 'folder', updatedAtMs: 1 },
    { path: '/collection', parentPath: '/', name: 'collection', kind: 'folder', updatedAtMs: 1 },
    { path: '/collection/index.md', parentPath: '/collection', name: 'index.md', kind: 'file', text: '# Original index', updatedAtMs: 1 },
  ] })
  const rootUrl = 'https://example.invalid/library'
  const urls = ['https://example.invalid/library/article?category=One', 'https://example.invalid/library/article?category=Two']
  const sources = { '/collection/index.md': { kind: 'url' as const, url: rootUrl, path: 'workspace:/collection/index.md' } }
  const session = { id: 1, url: rootUrl, sourcePath: '/collection/index.md', pages: urls.map(url => ({ url, path: new URL(url).pathname })),
    selected: new Set<string>(), visited: new Set<string>(), busy: false, error: '', limited: false, query: '' }
  await fs.ensureSeed()
  const initialFileCount = (await fs.listEntries()).filter(entry => entry.kind === 'file').length
  const projection = projectWebsiteImportTree(await fs.listEntries(), sources, session)
  const originalFetch = globalThis.fetch
  try {
    for (const [index, url] of urls.entries()) {
      const destinationPath = [...projection.pageUrls].find(([, value]) => value === url)![0]
      const opened: string[] = [], importId = `capture-${index}`
      const manifest: WebsiteImportManifestV1 = { version: 1, importId, rootUrl, status: 'done', startedAtMs: 1,
        nodes: [node('selected', url), node('unrequested', 'https://example.invalid/unrequested')], errors: [] }
      globalThis.fetch = async (input, init) => {
        const request = String(input), json = (value: unknown) => new Response(JSON.stringify(value))
        if (request.includes('/start?')) {
          assert.equal('destinationPath' in JSON.parse(String(init?.body)).options, false, 'workspace placement stays client-local')
          return json({ ok: true, importId })
        }
        if (request.includes('/status?')) return json({ ok: true, status: 'done' })
        if (request.includes('/manifest?')) return json({ ok: true, manifest })
        if (request.includes('/artifact?')) return new Response(`# Article ${index}`)
        throw new Error('Unexpected request: ' + request)
      }
      const result = await runWorkspaceWebsiteImport({ url: rootUrl, opts: { selectedUrls: [url], destinationPath, generateArtifactDocs: true },
        importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} }, getFs: async () => fs,
        focusAfterImport: async path => { opened.push(path) } })
      assert.deepEqual(result.createdPaths, [destinationPath]); assert.deepEqual(opened, [destinationPath])
      const text = String(await fs.readFileText(destinationPath))
      assert.match(text, new RegExp(`# Article ${index}`)); assert.ok(text.includes(importId), 'independent capture provenance retained')
      const saved = projectWebsiteImportTree(await fs.listEntries(), sources, session)
      assert.equal(saved.pendingPaths.has(destinationPath), false)
      assert.equal(saved.savedPaths.has(destinationPath), true)
      assert.deepEqual([...saved.pageUrls].filter(([, value]) => value === url).map(([path]) => path), [destinationPath])
    }
    const entries = await fs.listEntries()
    assert.equal(entries.filter(entry => entry.kind === 'file').length, initialFileCount + 2, 'only the two addressed pages are added')
    assert.equal(entries.some(entry => /capture-|website\.(sitemap|crawl)/.test(entry.path)), false)
    assert.equal(await fs.readFileText('/collection/index.md'), '# Original index')
  } finally { globalThis.fetch = originalFetch }
})

test('in-place writes preserve concurrent files and reject failed or stale captures without a replacement', async () => {
  for (const mode of ['collision', 'failed', 'stale'] as const) {
    const fs = createMemoryWorkspaceFs({ initialEntries: [{ path: '/', parentPath: null, name: '', kind: 'folder', updatedAtMs: 1 }] })
    const ref = { current: 1 }, url = 'https://example.invalid/article'
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async () => {
        if (mode === 'collision') await fs.createFile({ parentPath: '/collection', name: 'article.md', text: 'Concurrent user edit' })
        if (mode === 'stale') ref.current = 2
        return new Response('# Captured content')
      }
      const writer = await createWebsiteImportWorkspaceWriter({ fs, url, importId: `independent-capture-${mode}`,
        settings: { selectedUrls: [url], destinationPath: '/collection/article.md', outputDirRel: '', concurrency: 1,
          defaultView: 'markdown', generateArtifactDocs: true, browserEnhance: false },
        importJobRef: ref, jobId: 1, status: { setStatusProgress() {} } })
      const selected = node('selected', url)
      if (mode === 'failed') selected.status = 'error'
      await assert.rejects(writer.finalize({ version: 1, importId: `independent-capture-${mode}`, rootUrl: url,
        status: 'done', startedAtMs: 1, nodes: [selected], errors: [] }), /destination already exists|not saved|cancelled/)
      const files = (await fs.listEntries()).filter(entry => entry.kind === 'file' && !entry.path.startsWith('/docs/workspace-seeds/'))
      assert.equal(files.length, mode === 'collision' ? 1 : 0)
      if (mode === 'collision') assert.equal(await fs.readFileText('/collection/article.md'), 'Concurrent user edit')
    } finally { globalThis.fetch = originalFetch }
  }
})

test('later captures reuse the first website collection and retain occupied pages and summaries', async () => {
  const fs = createMemoryWorkspaceFs()
  const capture = async (importId: string, nodeUrl: string) => {
    const writer = await createWebsiteImportWorkspaceWriter({
      fs, url: 'https://example.invalid/library', importId,
      settings: { outputDirRel: '', concurrency: 1, defaultView: 'markdown', generateArtifactDocs: false, browserEnhance: false },
      importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} },
    })
    return writer.finalize({ version: 1, importId, rootUrl: 'https://example.invalid/library', status: 'done', startedAtMs: 1,
      nodes: [node(importId, nodeUrl)], errors: [] })
  }
  const firstCapture = await capture('20260101T010101Z', 'https://example.invalid/library/one')
  const oldFiles = new Map(await Promise.all(firstCapture.created.createdPaths.map(async path => [path, await fs.readFileText(path)] as const)))
  const laterCapture = await capture('20260202T020202Z', 'https://example.invalid/library/two')
  for (const path of laterCapture.created.createdPaths) assert(path.startsWith('/websites/example.invalid/20260101T010101Z/'))
  assert.equal((await fs.listEntries()).filter(entry => entry.kind === 'folder' && entry.parentPath === '/websites/example.invalid').length, 1)
  for (const [path, text] of oldFiles) assert.equal(await fs.readFileText(path), text, 'earlier content and summaries survive')
  const sameCapture = await capture('20260202T020202Z', 'https://example.invalid/library/two')
  assert.deepEqual(sameCapture.created.createdPaths, laterCapture.created.createdPaths, 'same capture is idempotent')
  const beforeProgress = (await fs.listEntries()).filter(entry => entry.kind === 'file').length
  const progressed = await capture('20260202T020202Z', 'https://example.invalid/library/three')
  assert.equal(progressed.canvasPath, laterCapture.canvasPath, 'progress updates the same capture summary')
  assert.equal((await fs.listEntries()).filter(entry => entry.kind === 'file').length, beforeProgress + 1)
  const repeat = await capture('20260303T030303Z', 'https://example.invalid/library/one')
  assert(repeat.created.createdPaths.some(path => path.includes('one--20260303T030303Z.md')))
  for (const [path, text] of oldFiles) assert.equal(await fs.readFileText(path), text)
})
