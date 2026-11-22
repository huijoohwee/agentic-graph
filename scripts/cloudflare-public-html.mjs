import { createHash } from 'node:crypto'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

const CLOUDFLARE_JSD_PARAMS = /window\.__CF\$cv\$params=\{r:'([0-9a-f]{16})',t:'([A-Za-z0-9+/=]+)'\};/gu
const CLOUDFLARE_JSD_RAY_QUERY = /\/cdn-cgi\/challenge-platform\/scripts\/jsd\/main\.js\?ray=([0-9a-f]{16})/gu
const CLOUDFLARE_JSD_V2_CANONICAL_SHA256 = 'b68c615f75b32ef2cf487d93f2d495121ce8436764f9ec76119f4c1bddfa856d'
const CLOUDFLARE_JSD_CANONICAL_SCRIPT = [
  `(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);`,
  `if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'',t:''};`,
  `var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';`,
  `document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}`,
  `if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;`,
  `a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';`,
  `a.style.visibility='hidden';document.body.appendChild(a);`,
  `if('loading'!==document.readyState)c();else if(window.addEventListener)`,
  `document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};`,
  `document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();`,
].join('')

function cloudflareJsDetectionVersion(script) {
  const parameterMatches = [...script.matchAll(new RegExp(CLOUDFLARE_JSD_PARAMS))]
  if (parameterMatches.length !== 1) return null
  const parameterStripped = script.replace(new RegExp(CLOUDFLARE_JSD_PARAMS), "window.__CF$cv$params={r:'',t:''};")
  if (parameterStripped === CLOUDFLARE_JSD_CANONICAL_SCRIPT) return 'v1'

  const rayMatches = [...script.matchAll(new RegExp(CLOUDFLARE_JSD_RAY_QUERY))]
  if (rayMatches.length !== 1 || rayMatches[0][1] !== parameterMatches[0][1]) return null
  const stableScript = parameterStripped.replace(
    new RegExp(CLOUDFLARE_JSD_RAY_QUERY),
    '/cdn-cgi/challenge-platform/scripts/jsd/main.js?ray=',
  )
  return digest(Buffer.from(stableScript)) === CLOUDFLARE_JSD_V2_CANONICAL_SHA256 ? 'v2' : null
}

export function normalizeCloudflarePublicHtml(body, origin) {
  const bytes = Buffer.from(body)
  let html = bytes.toString('utf8')
  const normalizations = []
  const webmcpBridge = `<script type="module" async fetchpriority="low" src="${new URL('/.webmcp/bridge.js', origin).href}" data-packs="c2pa,mcp-server-client"></script>`
  const bridgeStart = html.indexOf(webmcpBridge)
  if (bridgeStart >= 0 && html.indexOf(webmcpBridge, bridgeStart + webmcpBridge.length) < 0
    && bridgeStart < html.indexOf('<link rel="manifest"')) {
    html = `${html.slice(0, bridgeStart)}${html.slice(bridgeStart + webmcpBridge.length)}`
    normalizations.push('cloudflare-webmcp-bridge/v1')
  }

  const scriptStart = html.lastIndexOf('<script>')
  if (scriptStart < 0) return { body: Buffer.from(html), normalization: normalizations }
  const scriptEnd = html.indexOf('</script>', scriptStart)
  const suffixStart = scriptEnd + '</script>'.length
  if (scriptEnd < 0 || !/^\s*<\/body>\s*(?:<\/html>\s*)?$/iu.test(html.slice(suffixStart))) {
    return { body: Buffer.from(html), normalization: normalizations }
  }

  const script = html.slice(scriptStart + '<script>'.length, scriptEnd)
  const version = cloudflareJsDetectionVersion(script)
  if (!version) return { body: Buffer.from(html), normalization: normalizations }

  normalizations.push('cloudflare-js-detection/' + version)
  return {
    body: Buffer.from(`${html.slice(0, scriptStart)}${html.slice(suffixStart)}`),
    normalization: normalizations,
  }
}
