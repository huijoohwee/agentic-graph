import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testKnowgrphReportOnlyCspAvoidsIgnoredUpgradeDirective() {
  const headersPath = resolve(process.cwd(), '..', '..', 'huijoohwee', '_headers')
  const headersText = readFileSync(headersPath, 'utf8')
  const routeMarker = '/knowgrph/*'
  const routeStart = headersText.indexOf(routeMarker)
  if (routeStart < 0) {
    throw new Error('expected huijoohwee/_headers to define a /knowgrph/* header block')
  }
  const nextRouteStart = headersText.indexOf('\n/content/', routeStart)
  const reportOnlyBlock = nextRouteStart >= 0 ? headersText.slice(routeStart, nextRouteStart) : headersText.slice(routeStart)
  if (!reportOnlyBlock.includes('Content-Security-Policy-Report-Only:')) {
    throw new Error('expected /knowgrph/* header block to define a report-only CSP')
  }
  if (reportOnlyBlock.includes('upgrade-insecure-requests')) {
    throw new Error('expected /knowgrph/* report-only CSP to avoid ignored upgrade-insecure-requests noise')
  }
}

export function testKnowgrphAppShellHtmlAddsNoTransformForCloudflareJsd() {
  const headersPath = resolve(process.cwd(), '..', '..', 'huijoohwee', '_headers')
  const headersText = readFileSync(headersPath, 'utf8')
  for (const route of ['/content/knowgrph/index.html', '/knowgrph', '/knowgrph/', '/knowgrph/index.html']) {
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matcher = new RegExp(`^${escapedRoute}\\n  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0$`, 'm')
    if (!matcher.test(headersText)) {
      throw new Error(`expected ${route} Cache-Control to include no-transform for Cloudflare JSD suppression`)
    }
  }
}
