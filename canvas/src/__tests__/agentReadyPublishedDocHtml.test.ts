import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import { onRequest } from '../../../cloudflare/pages/agentic-graph-agent-ready.mjs'

export async function testPublishedDocHtmlUsesAgenticGraphAppShellAsset(): Promise<void> {
  const shareToken = encodePublishedDocShareToken({ canonicalPath: 'docs/shared.md' })
  const appShellHtml = '<!doctype html><html><head><title>agentic-graph</title></head><body><main id="root"></main></body></html>'
  const rootAliasHtml = '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=/agentic-graph/" /></head><body></body></html>'
  const assetFetchUrls: string[] = []
  let nextCallCount = 0

  const response = await onRequest({
    request: new Request(`https://airvio.co/agentic-graph/share/${shareToken}`, {
      method: 'GET',
      headers: { accept: 'text/html' },
    }),
    env: {
      ASSETS: {
        fetch: async (input: RequestInfo | URL) => {
          const requestUrl = input instanceof Request ? input.url : String(input)
          assetFetchUrls.push(requestUrl)
          return new Response(appShellHtml, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        },
      },
    },
    next: async () => {
      nextCallCount += 1
      return new Response(rootAliasHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    },
  } as never)

  const html = await response.text()
  if (!response.ok || response.headers.get('x-agentic-graph-route-tag') !== 'shared-doc-html') {
    throw new Error(`expected published doc HTML route headers, got ${response.status} ${response.headers.get('x-agentic-graph-route-tag')}`)
  }
  if (nextCallCount !== 0) {
    throw new Error(`expected published doc HTML route to bypass root alias next(), got ${nextCallCount}`)
  }
  if (assetFetchUrls.length !== 1 || new URL(assetFetchUrls[0]).pathname !== '/agentic-graph/') {
    throw new Error(`expected published doc HTML route to fetch /agentic-graph/, got ${assetFetchUrls.join(', ')}`)
  }
  if (!html.includes('id="root"') || html.includes('url=/agentic-graph/')) {
    throw new Error(`expected published doc HTML route to return app shell without root refresh, got ${html.slice(0, 160)}`)
  }
  if (response.headers.get('content-security-policy') !== 'frame-ancestors *') {
    throw new Error(`expected the opaque published document route to allow external iframe hosts, got ${response.headers.get('content-security-policy')}`)
  }
  if (response.headers.has('x-frame-options')) {
    throw new Error('expected the embeddable published document route to omit conflicting X-Frame-Options')
  }
}

export async function testStaticAssetRejectsUnavailableOrHtmlFallbackWithoutCaching(): Promise<void> {
  for (const upstream of [
    { status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><main id="root"></main>' },
    { status: 404, contentType: 'text/plain; charset=utf-8', body: 'not found' },
  ]) {
    const response = await onRequest({
      request: new Request('https://airvio.co/agentic-graph/assets/revision/Toolbar.js'),
      env: {
        ASSETS: {
          fetch: async () => new Response(upstream.body, {
            status: upstream.status,
            headers: {
              'cache-control': 'public, max-age=31536000, immutable',
              'content-type': upstream.contentType,
            },
          }),
        },
      },
      next: async () => new Response('unexpected next()'),
    } as never)

    if (response.status !== 503 || response.headers.get('x-agentic-graph-asset-status') !== 'temporarily-unavailable') {
      throw new Error(`expected upstream ${upstream.status} asset fallback to become a retryable 503, got ${response.status}`)
    }
    if (response.headers.get('cache-control') !== 'no-store, max-age=0' || response.headers.get('retry-after') !== '1') {
      throw new Error(`expected failed asset response to forbid caching, got ${response.headers.get('cache-control')}`)
    }
    if (response.headers.get('content-type') !== 'text/plain; charset=utf-8') {
      throw new Error(`expected failed asset response to discard fallback content type, got ${response.headers.get('content-type')}`)
    }
  }
}

export async function testStaticAssetPassesThroughJavascriptResponse(): Promise<void> {
  let forwardedOrigin = ''
  const response = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/assets/revision/Toolbar.js', {
      headers: { origin: 'https://airvio.co' },
    }),
    env: {
      ASSETS: {
        fetch: async (input: RequestInfo | URL) => {
          const request = input instanceof Request ? input : new Request(input)
          forwardedOrigin = request.headers.get('origin') || ''
          return new Response('export const toolbar = true;', {
            status: 200,
            headers: {
              'cache-control': 'public, max-age=31536000, immutable',
              'content-type': 'application/javascript; charset=utf-8',
            },
          })
        },
      },
    },
    next: async () => new Response('unexpected next()'),
  } as never)

  if (!response.ok || await response.text() !== 'export const toolbar = true;') {
    throw new Error(`expected JavaScript asset response to pass through, got ${response.status}`)
  }
  if (response.headers.get('cache-control') !== 'public, max-age=31536000, immutable') {
    throw new Error(`expected valid revision asset to retain immutable caching, got ${response.headers.get('cache-control')}`)
  }
  if (forwardedOrigin) {
    throw new Error(`expected Pages asset binding request to omit origin, got ${forwardedOrigin}`)
  }
}
