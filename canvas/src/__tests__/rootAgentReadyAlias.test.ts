import { onRequest as onRootRequest } from '../../../cloudflare/pages/root-agent-ready-index.mjs'

const PUBLISHED_APP_SHELL = `<!DOCTYPE html><html lang="en"><head><title>Knowgrph</title><script type="module" src="/knowgrph/assets/index-proof.js"></script></head><body><div id="root"></div></body></html>`

export async function testRootAgentReadyAliasCanonicalizesPublishedAppShellMount(): Promise<void> {
  const originalFetch = globalThis.fetch
  const fetchUrls: string[] = []

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      fetchUrls.push(url)
      if (url === 'https://airvio.co/knowgrph/?agentReadyRootAlias=1') {
        return new Response(PUBLISHED_APP_SHELL, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      throw new Error(`unexpected root alias fetch: ${url}`)
    }) as typeof fetch

    const response = await onRootRequest({
      request: new Request('https://airvio.co/', {
        method: 'GET',
        headers: { accept: 'text/html' },
      }),
      env: {},
      next: async () => new Response('unexpected next()'),
    } as never)
    const body = await response.text()

    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`expected root alias HTML response, got ${response.status} ${response.headers.get('content-type')}`)
    }
    if (fetchUrls.length !== 1 || fetchUrls[0] !== 'https://airvio.co/knowgrph/?agentReadyRootAlias=1') {
      throw new Error(`expected root alias to load only the published app shell, got ${JSON.stringify(fetchUrls)}`)
    }
    if (!body.includes('<main id="root"></main>') || body.includes('<div id="root"></div>')) {
      throw new Error(`expected the canonical React root mount, got ${body.slice(0, 400)}`)
    }
    if (!body.includes('/knowgrph/assets/index-proof.js')) {
      throw new Error('expected the root alias to retain the published React app assets')
    }
    if (!body.includes('name="x-knowgrph-root-alias" content="/knowgrph/"')) {
      throw new Error('expected root alias metadata for the Dev-owned React hero')
    }
    if (body.includes('data-kg-live-canvas-launch="true"') || body.includes('<iframe class="live-canvas"')) {
      throw new Error('expected the duplicated production-only hero shell to stay off the successful root path')
    }
    if (body.includes('id="knowgrph-root-fallback"') || body.includes('data-knowgrph-root-fallback')) {
      throw new Error('expected root alias to omit the old full-screen launch fallback')
    }
    if (body.includes('Open Knowgrph')) {
      throw new Error('expected root landing to omit the legacy launch CTA')
    }
    if (!body.includes('Agent-actionable chat-to-canvas knowledge graph workspace')) {
      throw new Error('expected root alias description to be canonical')
    }
    if (/http-equiv=["']refresh["']/i.test(body) || body.includes('url=/knowgrph/')) {
      throw new Error('expected root alias to avoid redirect-style fallbacks')
    }

    globalThis.fetch = (async () => new Response(
      '<!DOCTYPE html><html><body><main>legacy fallback</main></body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )) as typeof fetch
    let invalidShellError = ''
    try {
      await onRootRequest({
        request: new Request('https://airvio.co/', {
          method: 'GET',
          headers: { accept: 'text/html' },
        }),
        env: {},
        next: async () => new Response('unexpected next()'),
      } as never)
    } catch (error) {
      invalidShellError = String(error)
    }
    if (!invalidShellError.includes('canonical Knowgrph app shell is invalid')) {
      throw new Error(`expected an invalid canonical shell to fail closed, got ${invalidShellError || 'no error'}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
