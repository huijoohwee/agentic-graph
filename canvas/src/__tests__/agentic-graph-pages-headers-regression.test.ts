import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveSiblingFixturePath } from '@/tests/lib/repoTestData'
import { AGENTIC_GRAPH_CSP, buildAgentReadyHeaders } from '../../../scripts/pages-mirror-headers.mjs'
import { productionRuntimeReadinessHeaderLines } from '../../../scripts/production-runtime-readiness-build.mjs'
import { assertContentSecurityPolicy, formatContentSecurityPolicyHeader, setContentSecurityPolicy } from 'agentic-os/content-security-policy'
import { onRequest } from '../../../cloudflare/pages/agentic-graph-agent-ready.mjs'

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

const assertEnforcedCsp = (headersText: string): void => {
  let selected = false, hasRoute = false
  const policies: string[] = [], reports: string[] = []
  for (const line of headersText.split('\n')) {
    if (/^(?:\/|https?:\/\/)/.test(line)) {
      selected = line.trim() === '/agentic-graph/*'
      hasRoute ||= selected
    }
    const policy = selected ? line.match(/^[ \t]+Content-Security-Policy:[ \t]*(.*)$/i) : null
    const report = selected ? line.match(/^[ \t]+Content-Security-Policy-Report-Only:[ \t]*(.*)$/i) : null
    if (policy) policies.push(policy[1]!)
    if (report) reports.push(report[1]!)
  }
  if (!hasRoute || policies.length !== 1 || policies[0] !== AGENTIC_GRAPH_CSP) {
    throw new Error('expected /agentic-graph/* to have exactly one canonical enforced CSP')
  }
  if (reports.length) throw new Error('expected /agentic-graph/* to have no report-only CSP after enforcement')
  const responseHeaders = new Headers({ 'Content-Security-Policy': policies[0] })
  assertContentSecurityPolicy(responseHeaders, { mode: 'enforce', policy: AGENTIC_GRAPH_CSP })
  if (formatContentSecurityPolicyHeader('enforce', AGENTIC_GRAPH_CSP) !== `  Content-Security-Policy: ${AGENTIC_GRAPH_CSP}`) {
    throw new Error('production CSP header must be formatted by the shared policy owner')
  }
}

export async function testAgenticGraphReportOnlyCspAvoidsIgnoredUpgradeDirective() {
  const enforced = `  Content-Security-Policy: ${AGENTIC_GRAPH_CSP}`
  const report = "  Content-Security-Policy-Report-Only: default-src 'self'"
  assert.doesNotThrow(() => assertEnforcedCsp(['/agentic-graph/*', '  Permissions-Policy: camera=(self)', '/other/*', '  X-Example: retained', '/agentic-graph/*', enforced].join('\n')))
  assert.throws(() => assertEnforcedCsp('/content/agentic-graph/*\n' + enforced), /expected \/agentic-graph/)
  assert.throws(() => assertEnforcedCsp(['/agentic-graph/*', enforced, report].join('\n')), /no report-only CSP/)
  assertEnforcedCsp(readHeadersForValidation())
  const reportOnly = new Headers()
  setContentSecurityPolicy(reportOnly, { mode: 'report-only', policy: AGENTIC_GRAPH_CSP })
  assertContentSecurityPolicy(reportOnly, { mode: 'report-only', policy: AGENTIC_GRAPH_CSP })
  const appShellHtml = '<!doctype html><html><head><title>agentic-graph</title></head><body><main id="root"></main></body></html>'
  const response = await onRequest({
    request: new Request('http://127.0.0.1:4173/agentic-graph/', { headers: { accept: 'text/html' } }),
    env: {},
    next: async () => new Response(appShellHtml, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  })
  if (response.headers.get('content-security-policy-report-only') !== AGENTIC_GRAPH_CSP) {
    throw new Error('expected local Graph Dev HTML to use the shared report-only CSP')
  }
  if (response.headers.has('content-security-policy')) {
    throw new Error('local Graph Dev HTML must not enforce CSP before Production')
  }
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

