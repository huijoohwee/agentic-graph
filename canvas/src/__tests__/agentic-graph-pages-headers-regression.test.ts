import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveSiblingFixturePath } from '@/tests/lib/repoTestData'
import { buildAgentReadyHeaders } from '../../../scripts/pages-mirror-headers.mjs'
import { productionRuntimeReadinessHeaderLines } from '../../../scripts/production-runtime-readiness-build.mjs'

// Default to the source candidate; a release can explicitly validate its published file.
const readHeadersForValidation = (): string => {
  const publishedPath = String(process.env.AG_TEST_PAGES_HEADERS_PATH || '').trim()
  if (publishedPath) return readFileSync(publishedPath, 'utf8')
  return buildAgentReadyHeaders({
    existing: readFileSync(resolveSiblingFixturePath('huijoohwee', '_headers'), 'utf8'),
    artifacts: {},
    agentReadyHomepageLinkHeaderValue: '',
    productionRuntimeReadinessHeaderLines,
  })
}

const assertReportOnlyCsp = (headersText: string): void => {
  let selected = false, hasRoute = false
  const reports: string[] = []
  for (const line of headersText.split('\n')) {
    if (/^(?:\/|https?:\/\/)/.test(line)) {
      selected = line.trim() === '/agentic-graph/*'
      hasRoute ||= selected
    }
    const report = selected ? line.match(/^[ \t]+Content-Security-Policy-Report-Only:[ \t]*(.*)$/i) : null
    if (report) reports.push(report[1]!)
  }
  if (!hasRoute || !reports.length) throw new Error('expected selected header input to define /agentic-graph/* report-only CSP')
  if (reports.some(report => report.split(';').some(directive => /^upgrade-insecure-requests(?:\s|$)/i.test(directive.trim())))) {
    throw new Error('expected report-only CSP to avoid ignored upgrade-insecure-requests')
  }
}

export function testAgenticGraphReportOnlyCspAvoidsIgnoredUpgradeDirective() {
  const report = "  Content-Security-Policy-Report-Only: default-src 'self'"
  assert.doesNotThrow(() => assertReportOnlyCsp(['/agentic-graph/*', '  Permissions-Policy: camera=(self)', '/other/*', '  X-Example: retained', '/agentic-graph/*', report, '  # upgrade-insecure-requests is intentionally omitted'].join('\n')))
  assert.throws(() => assertReportOnlyCsp('/content/agentic-graph/*\n' + report), /expected selected header input/)
  assert.throws(() => assertReportOnlyCsp(['/agentic-graph/*', report, '/agentic-graph/*', report + '; upgrade-insecure-requests'].join('\n')), /ignored upgrade-insecure-requests/)
  assertReportOnlyCsp(readHeadersForValidation())
}

export function testAgenticGraphAppShellHtmlAddsNoTransformForCloudflareJsd() {
  const headersText = readHeadersForValidation()
  for (const route of ['/content/agentic-graph/index.html', '/agentic-graph', '/agentic-graph/', '/agentic-graph/index.html']) {
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matcher = new RegExp(`^${escapedRoute}\\n  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0$`, 'm')
    if (!matcher.test(headersText)) {
      throw new Error(`expected ${route} Cache-Control to include no-transform for Cloudflare JSD suppression`)
    }
  }
}
