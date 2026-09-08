import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'

export type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch };

export const webpageHtml = (title: string, extraHead = '') => [
  '<!doctype html>',
  '<html>',
  '<head>',
  `<title>${title}</title>`,
  extraHead,
  '</head>',
  '<body>',
  `<main><h1>${title}</h1><p>Imported URL parsing renders body content through the shared webpage pipeline.</p></main>`,
  '</body>',
  '</html>',
].join('')

export function installWebpageProxyFetch(htmlByUrl: Map<string, string>, calls: string[]) {
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  g.fetch = (async (input: unknown) => {
    const url = input instanceof URL ? input.toString() : String(input || '')
    calls.push(url)
    if (url.startsWith('/__fetch_remote?url=')) {
      throw new Error(`unexpected legacy remote fetch for webpage import: ${url}`)
    }
    if (!url.startsWith('/__webpage_proxy?')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    const qs = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    const sourceUrl = qs.get('url') || ''
    const first = htmlByUrl.values().next()
    const html = htmlByUrl.get(sourceUrl) || (first.done ? '' : first.value) || ''
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }) as unknown as typeof fetch
  return () => {
    g.fetch = prev
  }
}

// Opt-in unit fixture: these public imports have no browser DOM provider.
export function installUnavailableWebpageDomFixture(urls: readonly string[]) {
  const expected = new Set(urls)
  const seen = new Set<string>()
  const unexpected: string[] = []
  let restored = false
  setWorkspaceWebpageDomExportForTests(async args => {
    if (!expected.has(args.url) || (args.mode !== 'html' && args.mode !== 'text')) {
      const request = `${args.mode} ${args.url}`
      unexpected.push(request)
      throw new Error(`Unexpected unavailable-DOM fixture request: ${request}`)
    }
    seen.add(args.url)
    return null
  })
  return {
    assertRequests() {
      if (unexpected.length) throw new Error(`Unexpected unavailable-DOM requests: ${unexpected.join(', ')}`)
      for (const url of expected) {
        if (!seen.has(url)) throw new Error(`Expected public import to attempt DOM recovery for ${url}`)
      }
    },
    restore() {
      if (restored) return
      restored = true
      setWorkspaceWebpageDomExportForTests(null)
    },
  }
}
