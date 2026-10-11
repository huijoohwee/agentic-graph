import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { createWebsiteImportWorkspaceWriter } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportNodeWriter'
import { runWorkspaceWebsiteImport } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction'
import type { WebsiteImportManifestV1 } from '@/lib/websites/server/websiteImportTypes'

test('collection imports emit and prefer a multi-dimensional table when conversion records are present', async () => {
  const fs = createMemoryWorkspaceFs()
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input), 'https://example.invalid')
      if (!url.pathname.includes('/__website_import/artifact')) throw new Error(`Unexpected request: ${url}`)
      const kind = url.searchParams.get('kind')
      if (kind === 'conversionJson') {
        return new Response(JSON.stringify({
          ok: true,
          collectionRecords: [{
            recordType: 'hackathon',
            sourceUrl: 'https://medo.devpost.com/?ref_feature=challenge&ref_medium=discover',
            title: 'Build with MeDo Hackathon',
            location: 'Online',
            status: '18 days left',
            timeline: 'Apr 09 - May 20, 2026',
            prize: '$50,000 in prizes',
            participants: '5357 participants',
            organizer: 'Baidu',
            tagsText: 'Beginner Friendly Low/No Code Machine Learning/AI',
          }],
        }))
      }
      if (kind === 'markdown') return new Response('# Imported page')
      throw new Error(`Unexpected artifact kind: ${kind}`)
    }
    const writer = await createWebsiteImportWorkspaceWriter({
      fs,
      url: 'https://devpost.com/hackathons',
      importId: 'devpost-collection',
      settings: { outputDirRel: '', concurrency: 1, defaultView: 'markdown', generateArtifactDocs: true, browserEnhance: false },
      importJobRef: { current: 1 },
      jobId: 1,
      status: { setStatusProgress() {} },
    })
    const result = await writer.finalize({
      version: 1,
      importId: 'devpost-collection',
      rootUrl: 'https://devpost.com/hackathons',
      status: 'done',
      startedAtMs: 1,
      errors: [],
      nodes: [{
        nodeId: 'root',
        url: 'https://devpost.com/hackathons',
        path: '/hackathons',
        status: 'ok',
        artifacts: { conversionJsonRelPath: 'unused', markdownRelPath: 'unused' },
      }],
    })
    assert.equal(result.collectionTablePath, '/websites/devpost.com/website.collection.table.md')
    assert.deepEqual(result.created.createdPaths, [
      '/websites/devpost.com/website.collection.table.md',
      '/websites/devpost.com/website.crawl.canvas.md',
      '/websites/devpost.com/website.sitemap.md',
      '/websites/devpost.com/hackathons.md',
    ])
    const tableText = String(await fs.readFileText(result.collectionTablePath!))
    assert.match(tableText, /kgCanvas2dRenderer: "multiDimTable"/)
    assert.match(tableText, /Build with MeDo Hackathon/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('collection table becomes the default activation path when a crawl yields collection records', async () => {
  const originalFetch = globalThis.fetch
  try {
    const fs = createMemoryWorkspaceFs()
    const opened: string[] = []
    const manifest: WebsiteImportManifestV1 = {
      version: 1,
      importId: 'devpost-open',
      rootUrl: 'https://devpost.com/hackathons',
      status: 'done',
      startedAtMs: 1,
      nodes: [{ nodeId: 'root', url: 'https://devpost.com/hackathons', path: '/hackathons', status: 'ok', artifacts: { markdownRelPath: 'unused', conversionJsonRelPath: 'unused' } }],
      errors: [],
    }
    globalThis.fetch = async input => {
      const url = new URL(String(input), 'https://example.invalid')
      const json = (value: unknown) => new Response(JSON.stringify(value))
      if (url.pathname.includes('/__website_import/start')) return json({ ok: true, importId: manifest.importId })
      if (url.pathname.includes('/__website_import/status')) return json({ ok: true, status: 'done' })
      if (url.pathname.includes('/__website_import/manifest')) return json({ ok: true, manifest })
      if (url.pathname.includes('/__website_import/artifact')) {
        const kind = url.searchParams.get('kind')
        if (kind === 'conversionJson') {
          return new Response(JSON.stringify({
            ok: true,
            collectionRecords: [{
              sourceUrl: 'https://medo.devpost.com/?ref_feature=challenge&ref_medium=discover',
              title: 'Build with MeDo Hackathon',
              location: 'Online',
            }],
          }))
        }
        return new Response('# Imported page')
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    await runWorkspaceWebsiteImport({
      url: manifest.rootUrl,
      opts: { generateArtifactDocs: true },
      importJobRef: { current: 1 },
      jobId: 1,
      status: { setStatusProgress() {} },
      getFs: async () => fs,
      focusAfterImport: async path => { opened.push(path) },
    })
    assert.deepEqual(opened, ['/websites/devpost.com/website.collection.table.md'])
    const tableText = String(await fs.readFileText(opened[0]!))
    assert.match(tableText, /Build with MeDo Hackathon/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
