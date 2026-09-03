import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCanvasEmbedIframeMarkup, AGENTIC_OS_XR_IFRAME_ALLOW } from '@/features/canvas/canvasEmbedIframeMarkup'
import { onRequest } from '../../../cloudflare/pages/agentic-graph-agent-ready.mjs'
import {
  AGENTIC_OS_XR_PERMISSIONS_POLICY,
  withAgenticGraphXrPermissionsPolicy,
} from '../../../cloudflare/pages/agentic-graph-agent-ready-shared.mjs'

const REQUIRED_SELF_FEATURES = ['accelerometer', 'camera', 'gyroscope', 'magnetometer', 'xr-spatial-tracking'] as const
const REQUIRED_IFRAME_FEATURES = [...REQUIRED_SELF_FEATURES, 'autoplay', 'fullscreen', 'picture-in-picture'] as const

function assertXrPolicy(response: Response, label: string): void {
  assert.equal(
    response.headers.get('permissions-policy'),
    AGENTIC_OS_XR_PERMISSIONS_POLICY,
    `${label} must carry the canonical XR Permissions-Policy`,
  )
}

export async function testAgenticGraphXrPermissionsPolicyCoversEveryPagesResponsePath(): Promise<void> {
  for (const feature of REQUIRED_SELF_FEATURES) {
    assert.match(AGENTIC_OS_XR_PERMISSIONS_POLICY, new RegExp(`(?:^|, )${feature}=\\(self\\)(?:,|$)`))
  }
  assert.equal(AGENTIC_OS_XR_PERMISSIONS_POLICY.includes('*'), false, 'powerful features must never use wildcard delegation')

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('stream-'))
      controller.enqueue(encoder.encode('preserved'))
      controller.close()
    },
  })
  const wrappedStream = withAgenticGraphXrPermissionsPolicy(new Response(stream, {
    status: 206,
    headers: { 'content-type': 'text/plain', 'x-stream-proof': '1' },
  }))
  assertXrPolicy(wrappedStream, 'shared streaming wrapper')
  assert.equal(wrappedStream.status, 206)
  assert.equal(wrappedStream.headers.get('x-stream-proof'), '1')
  assert.equal(await wrappedStream.text(), 'stream-preserved')

  const options = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/health', { method: 'OPTIONS' }),
    env: {},
    next: async () => new Response('unexpected'),
  } as never)
  assert.equal(options.status, 204)
  assertXrPolicy(options, 'OPTIONS response')

  const methodError = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/health', { method: 'PUT' }),
    env: {},
    next: async () => new Response('unexpected'),
  } as never)
  assert.equal(methodError.status, 405)
  assertXrPolicy(methodError, 'method error response')

  const health = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/health'),
    env: {},
    next: async () => new Response('unexpected'),
  } as never)
  assert.equal(health.status, 200)
  assertXrPolicy(health, 'routed response')

  const head = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/health', { method: 'HEAD' }),
    env: {},
    next: async () => new Response('unexpected'),
  } as never)
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assertXrPolicy(head, 'HEAD response')

  const nextResponse = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/unhandled.bin'),
    env: {},
    next: async () => new Response('next-stream', {
      status: 202,
      headers: { 'content-type': 'application/octet-stream', 'x-next-proof': '1' },
    }),
  } as never)
  assert.equal(nextResponse.status, 202)
  assert.equal(nextResponse.headers.get('x-next-proof'), '1')
  assert.equal(await nextResponse.text(), 'next-stream')
  assertXrPolicy(nextResponse, 'context.next response')

  const staticResponse = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/assets/revision/runtime.js'),
    env: {
      ASSETS: {
        fetch: async () => new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('static-stream'))
            controller.close()
          },
        }), {
          headers: { 'content-type': 'text/javascript', 'x-static-proof': '1' },
        }),
      },
    },
    next: async () => new Response('unexpected'),
  } as never)
  assert.equal(staticResponse.headers.get('x-static-proof'), '1')
  assert.equal(await staticResponse.text(), 'static-stream')
  assertXrPolicy(staticResponse, 'static asset response')

  const originalConsoleError = console.error
  try {
    console.error = () => void 0
    const thrownError = await onRequest({
      request: new Request('https://airvio.co/agentic-graph/unhandled.bin'),
      env: {},
      next: async () => { throw new Error('simulated next failure') },
    } as never)
    assert.equal(thrownError.status, 500)
    assert.equal((await thrownError.json() as { error?: string }).error, 'internal_error')
    assertXrPolicy(thrownError, 'caught error response')
  } finally {
    console.error = originalConsoleError
  }
}

export function testAgenticGraphXrPermissionsPolicyMatchesStaticAndIframeDelegation(): void {
  const headersSource = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')
  const syncSource = readFileSync(resolve(process.cwd(), '../scripts/sync-pages-agentic-graph.mjs'), 'utf8')
  const sharedSource = readFileSync(resolve(process.cwd(), '../cloudflare/pages/agentic-graph-agent-ready-shared.mjs'), 'utf8')
  const pagesSource = readFileSync(resolve(process.cwd(), '../cloudflare/pages/agentic-graph-agent-ready.mjs'), 'utf8')
  const viewportSource = readFileSync(resolve(process.cwd(), 'src/components/CanvasViewport.tsx'), 'utf8')
  const panelSource = readFileSync(resolve(process.cwd(), 'src/features/three/MotionControlFloatingPanelView.tsx'), 'utf8')

  for (const route of ['/agentic-graph/*', '/content/agentic-graph/*']) {
    const routeIndex = headersSource.indexOf(`${route}\n`)
    assert.notEqual(routeIndex, -1, `missing ${route} static policy route`)
    assert.equal(
      headersSource.slice(routeIndex, routeIndex + 600).includes(`Permissions-Policy: ${AGENTIC_OS_XR_PERMISSIONS_POLICY}`),
      true,
      `${route} must use the canonical policy`,
    )
  }
  assert.match(syncSource, /'\/agentic-graph\/\*', '\/content\/agentic-graph\/\*'/)
  assert.equal(syncSource.includes(`const XR_RUNTIME_PERMISSIONS_POLICY = '${AGENTIC_OS_XR_PERMISSIONS_POLICY}'`), true)
  assert.match(sharedSource, /new Response\(response\.body, response\)/)
  assert.doesNotMatch(sharedSource, /await response\.(?:arrayBuffer|blob|formData|json|text)\(/)
  assert.match(pagesSource, /withAgenticGraphXrPermissionsPolicy\(await routeRequest\(context\)\)/)
  assert.match(pagesSource, /withAgenticGraphXrPermissionsPolicy\(jsonStatusResponse\(500/)

  const iframeMarkup = buildCanvasEmbedIframeMarkup('https://airvio.co/agentic-graph/share/example')
  assert.ok(iframeMarkup)
  assert.match(iframeMarkup, new RegExp(`allow="${AGENTIC_OS_XR_IFRAME_ALLOW}"`))
  for (const feature of REQUIRED_IFRAME_FEATURES) {
    assert.equal(AGENTIC_OS_XR_IFRAME_ALLOW.split('; ').includes(feature), true, `iframe allow must delegate ${feature}`)
  }
  assert.equal(AGENTIC_OS_XR_IFRAME_ALLOW.includes('microphone'), false, 'iframes must not receive unrelated microphone access')
  assert.match(viewportSource, /allow=\{AGENTIC_OS_XR_IFRAME_ALLOW\}/)
  assert.match(panelSource, /data-kg-motion-control-start="1"/)
  assert.match(panelSource, /data-kg-motion-control-stop="1"/)
  assert.match(panelSource, /data-kg-motion-control-enable-sensors="1"/)
  assert.match(panelSource, /data-kg-motion-control-disable-sensors="1"/)
}
