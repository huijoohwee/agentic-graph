import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCloudflarePublicHtml } from '../verify-agentic-base-route.mjs'

const origin = 'https://airvio.co'
const manifestLink = '<link rel="manifest" href="./manifest.webmanifest">'
const sourceHtml = `<!doctype html>\n<html><head>${manifestLink}</head><body><h1>Base</h1></body>\n</html>\n`
const bridge = `<script type="module" async fetchpriority="low" src="${origin}/.webmcp/bridge.js" data-packs="c2pa,mcp-server-client"></script>`
const injectedScript = ray => [
  `<script>(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);`,
  `if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'${ray}',t:'MTc5MjkwMTY5Ng=='};`,
  `var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';`,
  `document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}`,
  `if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;`,
  `a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';`,
  `a.style.visibility='hidden';document.body.appendChild(a);`,
  `if('loading'!==document.readyState)c();else if(window.addEventListener)`,
  `document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};`,
  `document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script>`,
].join('')

const injectedScriptV2 = (ray, routeRay = ray) => injectedScript(ray).replace(
  "var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);",
  "var l=window.parent.location,o;try{o=new URL(l.origin).origin}catch(e){try{o=new URL(new URL(l.href).origin).origin}catch(e){o=''}}var u='/cdn-cgi/challenge-platform/scripts/jsd/main.js?ray="
    + routeRay
    + "',a=document.createElement('script');a.src=o?new URL(u,o).href:u;document.getElementsByTagName('head')[0].appendChild(a);",
)

test('normalizes only the exact Cloudflare WebMCP bridge and JavaScript Detection injections', () => {
  const withBridge = sourceHtml.replace(manifestLink, `${bridge}${manifestLink}`)
  const first = normalizeCloudflarePublicHtml(Buffer.from(withBridge.replace('</body>', `${injectedScript('a4fe65b29ee1d3c6')}</body>`)), origin)
  const second = normalizeCloudflarePublicHtml(Buffer.from(withBridge.replace('</body>', `${injectedScript('a4fe65b3e9f5d3c6')}</body>`)), origin)

  assert.deepEqual(first.normalization, ['cloudflare-webmcp-bridge/v1', 'cloudflare-js-detection/v1'])
  assert.deepEqual(second.normalization, ['cloudflare-webmcp-bridge/v1', 'cloudflare-js-detection/v1'])
  assert.deepEqual(first.body, Buffer.from(sourceHtml))
  assert.deepEqual(second.body, Buffer.from(sourceHtml))
})

test('normalizes the exact ray-bound Cloudflare JavaScript Detection v2 wrapper', () => {
  const withBridge = sourceHtml.replace(manifestLink, bridge + manifestLink)
  const firstRay = 'a4fe65b29ee1d3c6'
  const secondRay = 'a4fe65b3e9f5d3c6'
  const first = normalizeCloudflarePublicHtml(
    Buffer.from(withBridge.replace('</body>', injectedScriptV2(firstRay) + '</body>')),
    origin,
  )
  const second = normalizeCloudflarePublicHtml(
    Buffer.from(withBridge.replace('</body>', injectedScriptV2(secondRay) + '</body>')),
    origin,
  )

  assert.deepEqual(first.normalization, ['cloudflare-webmcp-bridge/v1', 'cloudflare-js-detection/v2'])
  assert.deepEqual(second.normalization, ['cloudflare-webmcp-bridge/v1', 'cloudflare-js-detection/v2'])
  assert.deepEqual(first.body, Buffer.from(sourceHtml))
  assert.deepEqual(second.body, Buffer.from(sourceHtml))
})

test('does not normalize a ray-mismatched or modified JavaScript Detection v2 wrapper', () => {
  const withBridge = sourceHtml.replace(manifestLink, bridge + manifestLink)
  const ray = 'a4fe65b29ee1d3c6'
  const inputs = [
    withBridge.replace('</body>', injectedScriptV2(ray, 'a4fe65b3e9f5d3c6') + '</body>'),
    withBridge.replace(
      '</body>',
      injectedScriptV2(ray).replace('appendChild(a);', 'appendChild(a);window.example=true;') + '</body>',
    ),
  ]

  for (const input of inputs) {
    const result = normalizeCloudflarePublicHtml(Buffer.from(input), origin)
    assert.deepEqual(result.normalization, ['cloudflare-webmcp-bridge/v1'])
    assert.notDeepEqual(result.body, Buffer.from(sourceHtml))
  }
})

test('preserves other scripts and malformed or non-trailing injections', () => {
  const unrelated = Buffer.from('<!doctype html><script>window.example = true</script></body>\n')
  const malformed = Buffer.from(sourceHtml.replace('</body>', `${injectedScript('not-a-ray')}</body>`))
  const misplaced = Buffer.from(sourceHtml.replace('</body>', `${injectedScript('a4fe65b29ee1d3c6')}<footer>late content</footer></body>`))

  for (const input of [unrelated, malformed, misplaced]) {
    const result = normalizeCloudflarePublicHtml(input, origin)
    assert.deepEqual(result.normalization, [])
    assert.deepEqual(result.body, input)
  }
})

test('does not normalize an unrecognized or duplicated WebMCP bridge', () => {
  const inputs = [
    Buffer.from(sourceHtml.replace(manifestLink, `${bridge.replace(origin, 'https://other.example')}${manifestLink}`)),
    Buffer.from(sourceHtml.replace(manifestLink, `${bridge.replace('c2pa,mcp-server-client', 'other-pack')}${manifestLink}`)),
    Buffer.from(sourceHtml.replace(manifestLink, `${bridge}${bridge}${manifestLink}`)),
  ]

  for (const input of inputs) {
    const result = normalizeCloudflarePublicHtml(input, origin)
    assert.deepEqual(result.normalization, [])
    assert.deepEqual(result.body, input)
  }
})
