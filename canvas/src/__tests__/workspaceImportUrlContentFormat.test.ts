import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { fetchWorkspaceUrlContent, setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import {
  classifyWorkspaceImportUrlContent,
  normalizeWorkspaceImportUrlContentType,
} from '@/features/markdown-workspace/workspaceImport/urlContentFormat'

type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch }

function assertFormat(
  expected: ReturnType<typeof classifyWorkspaceImportUrlContent>['format'],
  args: Parameters<typeof classifyWorkspaceImportUrlContent>[0],
): void {
  const actual = classifyWorkspaceImportUrlContent(args).format
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`)
}

async function withTextResponse(args: {
  url: string
  headContentType?: string
  bodyContentType?: string
  body: string
  run: (calls: Array<{ url: string; method: string }>) => Promise<void>
}): Promise<void> {
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  const calls: Array<{ url: string; method: string }> = []
  resetWorkspaceUrlContentCacheForTests()
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : String(input || '')
    const method = String(init?.method || 'GET').toUpperCase()
    calls.push({ url, method })
    if (url !== args.url) return new Response('not found', { status: 404 })
    const contentType = method === 'HEAD' ? args.headContentType : args.bodyContentType
    return new Response(method === 'HEAD' ? null : args.body, {
      status: 200,
      headers: contentType ? { 'Content-Type': contentType } : undefined,
    })
  }) as typeof fetch
  try {
    await args.run(calls)
  } finally {
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export function testWorkspaceImportUrlContentFormatClassifiesExplicitMimeTypes(): void {
  if (normalizeWorkspaceImportUrlContentType(' Text/CSV ; charset=utf-8 ') !== 'text/csv') {
    throw new Error('Expected MIME normalization to remove parameters and normalize case')
  }
  assertFormat('csv', { contentType: 'text/csv; charset=utf-8', text: 'name,score\nAda,10\n' })
  assertFormat('tsv', { contentType: 'text/tab-separated-values', text: 'name\tscore\nAda\t10\n' })
  assertFormat('markdown', { contentType: 'text/markdown', text: '# Notes\n' })
  assertFormat('json', { contentType: 'application/problem+json', text: '[{"name":"Ada"}]' })
  assertFormat('unknown', { contentType: 'application/json', text: 'not valid json' })
}

export function testWorkspaceImportUrlContentFormatSniffsGenericTextConservatively(): void {
  assertFormat('csv', { contentType: 'text/plain', text: 'name,score\nAda,10\nGrace,11\n' })
  assertFormat('tsv', { text: 'name\tscore\nAda\t10\n' })
  assertFormat('json', { contentType: 'text/plain', text: '[{"name":"Ada"}]' })
  assertFormat('markdown', { contentType: 'text/plain', text: '# Notes\n\nUseful content.\n' })
  assertFormat('markdown', { contentType: 'text/plain', text: '| name | score |\n| --- | --- |\n| Ada | 10 |\n' })
  assertFormat('markdown', { contentType: 'text/plain', text: 'Hello, this is one line of prose.' })
}

export function testWorkspaceImportUrlContentFormatHtmlOverridesMisleadingMime(): void {
  const shell = '<!doctype html><html><head><title>Sign in</title></head><body><div id="root"></div></body></html>'
  assertFormat('html', { contentType: 'text/plain', text: shell })
  assertFormat('html', { contentType: 'text/csv', text: shell })
  assertFormat('html', { contentType: 'text/plain', text: '<div id="root"></div><script src="/app.js"></script>' })
}

export async function testWorkspaceImportExtensionlessCsvUsesExistingConversionArtifacts(): Promise<void> {
  const url = 'https://example.test/source?fixture=explicit-csv'
  await withTextResponse({
    url,
    headContentType: 'text/csv; charset=utf-8',
    bodyContentType: 'text/csv; charset=utf-8',
    body: 'name,score\nAda,10\nGrace,11\n',
    run: async calls => {
      const result = await importWorkspaceUrl({ fs: createMemoryWorkspaceFs(), urlRaw: url, parentPath: '/' })
      if (!result.createdPaths.includes('/source.csv')) throw new Error(`Expected source.csv, got ${result.createdPaths.join(', ')}`)
      const preview = result.jsonSourceDocuments?.find(item => item.path === '/source.csv')?.text || ''
      const parsed = JSON.parse(preview || '{}') as { rows?: Array<Record<string, string>> }
      if (parsed.rows?.[1]?.name !== 'Grace') throw new Error(`Expected existing CSV-to-JSON preview, got ${preview}`)
      if (calls.length !== 2 || calls[0]?.method !== 'HEAD' || calls[1]?.method !== 'GET') {
        throw new Error(`Expected bounded HEAD then GET, got ${JSON.stringify(calls)}`)
      }
    },
  })
}

export async function testWorkspaceImportExtensionlessPlainTextCsvIsDetectedFromBody(): Promise<void> {
  const url = 'https://example.test/source?fixture=plain-csv'
  await withTextResponse({
    url,
    headContentType: 'text/plain',
    bodyContentType: 'text/plain; charset=utf-8',
    body: 'name,score\nAda,10\n',
    run: async () => {
      const fetched = await fetchWorkspaceUrlContent(url, { mode: 'import' })
      if (fetched.name !== 'source.csv' || fetched.sourceMimeHint !== 'text/csv') {
        throw new Error(`Expected content-sniffed CSV identity, got ${JSON.stringify(fetched)}`)
      }
    },
  })
}

export async function testWorkspaceImportExtensionlessJsonUsesExistingConversionArtifacts(): Promise<void> {
  const url = 'https://example.test/source?fixture=json'
  await withTextResponse({
    url,
    headContentType: 'application/json',
    bodyContentType: 'application/json; charset=utf-8',
    body: '[{"name":"Ada","calc":"=1+1"}]',
    run: async () => {
      const fs = createMemoryWorkspaceFs()
      const result = await importWorkspaceUrl({ fs, urlRaw: url, parentPath: '/' })
      if (!result.createdPaths.includes('/source.json') || !result.createdPaths.includes('/source.csv')) {
        throw new Error(`Expected source JSON and derived CSV, got ${result.createdPaths.join(', ')}`)
      }
      const csv = String(await fs.readFileText('/source.csv') || '')
      if (!csv.includes("Ada,'=1+1")) throw new Error(`Expected formula-safe derived CSV, got ${csv}`)
    },
  })
}

export async function testWorkspaceImportExtensionlessMarkdownPreservesMarkdown(): Promise<void> {
  const url = 'https://example.test/source?fixture=markdown'
  const markdown = '# Public notes\n\n- one\n- two\n'
  await withTextResponse({
    url,
    headContentType: 'text/plain',
    bodyContentType: 'text/plain; charset=utf-8',
    body: markdown,
    run: async () => {
      const fs = createMemoryWorkspaceFs()
      const result = await importWorkspaceUrl({ fs, urlRaw: url, parentPath: '/' })
      if (!result.createdPaths.includes('/source.md')) {
        throw new Error(`Expected persisted source.md, got ${result.createdPaths.join(', ')}`)
      }
      const persisted = String(await fs.readFileText('/source.md') || '')
      if (persisted !== markdown) {
        throw new Error(`Expected preserved Markdown text, got ${JSON.stringify(persisted)}`)
      }
    },
  })
}

export async function testWorkspaceImportExtensionlessProbeKeepsProxyTransportForBody(): Promise<void> {
  const url = 'https://example.test/source?fixture=proxy-csv'
  const proxyUrl = `/__fetch_remote?url=${encodeURIComponent(url)}`
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  const calls: Array<{ url: string; method: string }> = []
  resetWorkspaceUrlContentCacheForTests()
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    const method = String(init?.method || 'GET').toUpperCase()
    calls.push({ url: requestUrl, method })
    if (requestUrl === url && method === 'HEAD') throw new Error('cross-origin transport unavailable')
    if (requestUrl === proxyUrl) {
      return new Response(method === 'HEAD' ? null : 'name,score\nAda,10\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  try {
    const fetched = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    if (fetched.name !== 'source.csv') throw new Error(`Expected proxied source.csv, got ${fetched.name}`)
    const expected = [
      { url, method: 'HEAD' },
      { url: proxyUrl, method: 'HEAD' },
      { url: proxyUrl, method: 'GET' },
    ]
    if (JSON.stringify(calls) !== JSON.stringify(expected)) {
      throw new Error(`Expected direct HEAD then proxy HEAD and GET, got ${JSON.stringify(calls)}`)
    }
  } finally {
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportExtensionlessHtmlAuthShellRejectsWithoutPersistence(): Promise<void> {
  const url = 'https://example.test/source?fixture=auth-shell'
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  const fs = createMemoryWorkspaceFs()
  resetWorkspaceUrlContentCacheForTests()
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    const method = String(init?.method || 'GET').toUpperCase()
    if (requestUrl === url && method === 'HEAD') return new Response(null, { status: 200, headers: { 'Content-Type': 'text/html' } })
    if (requestUrl === url || requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Readable body unavailable')
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => null)
  try {
    const rejected = await importWorkspaceUrl({ fs, urlRaw: url })
      .then(() => false, error => String((error as { message?: unknown })?.message || error).includes('Authenticated browser session required'))
    if (!rejected) throw new Error('Expected the default Import URL flow to reject the HTML authentication shell')
    const persistedFiles = (await fs.listEntries()).filter(entry => entry.kind === 'file')
    if (persistedFiles.length !== 0) throw new Error(`Expected authentication rejection to persist zero files, got ${persistedFiles.map(entry => entry.path).join(', ')}`)
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
