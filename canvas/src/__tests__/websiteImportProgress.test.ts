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
      getFs: async () => fs,
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
