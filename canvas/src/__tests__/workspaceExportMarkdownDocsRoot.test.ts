import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { exportMarkdownFile } from '@/features/markdown-workspace/main/exports/exportMarkdown'

test('Launch Markdown export saves in the configured sibling docs_ directory', async () => {
  const { restore } = initJsdomHarness()
  const previousRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = '/workspace/huijoohwee/docs'
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown> })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch
    await exportMarkdownFile({ exportBaseName: 'website.crawl.canvas', text: '# Crawl\n', activeDocumentPath: '/websites/example/crawl/website.crawl.canvas.md' })
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.url, '/__agentic_os_fs_write')
    assert.equal(requests[0]?.body.path, '/workspace/huijoohwee/docs_/website.crawl.canvas.md')
    assert.equal(Buffer.from(String(requests[0]?.body.base64), 'base64').toString('utf8'), '# Crawl\n')
  } finally {
    if (previousRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousRoot
    globalThis.fetch = previousFetch
    restore()
  }
})
