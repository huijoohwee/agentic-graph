import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { createWebsiteImportWorkspaceWriter } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportNodeWriter'
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
