import assert from 'node:assert/strict'
import test from 'node:test'
import { generateDiscoverySurfaces } from '../discovery-generate.mjs'
import {
  parseDiscoveryFile,
  parseDiscoveryFiles,
  parseDiscoverySurfaces,
} from '../discovery-parse.mjs'

const registry = {
  publicOrigin: 'https://airvio.co',
  version: '1.0.0',
  policy: { contentSignals: 'ai-train=no, search=yes, ai-input=yes' },
  entries: [
    {
      artifactId: 'public.document',
      path: '/document',
      artifactClass: 'published-document',
      surfaceTier: 'public-discoverable',
      licenseId: 'CC-BY-4.0',
      canonicalUrl: 'https://airvio.co/document',
      representingPage: null,
      title: 'Public document',
      summary: 'A public document summary.',
      readOnly: true,
      ingressRoute: 'static-edge',
      targetExecutionRoute: 'none',
      spendBearing: false,
      lastModified: '2026-07-27',
      service: { method: 'GET', transport: 'http', trustBoundary: 'public' },
    },
    {
      artifactId: 'public.capability',
      path: '/capability',
      artifactClass: 'capability-description',
      surfaceTier: 'public-discoverable',
      licenseId: 'Apache-2.0',
      canonicalUrl: 'https://airvio.co/capability',
      representingPage: '/agents/',
      title: 'Public capability',
      summary: 'A public read-only capability.',
      readOnly: true,
      ingressRoute: 'public-read-mcp',
      targetExecutionRoute: 'public-read-mcp',
      spendBearing: false,
      lastModified: '2026-07-27',
      service: { method: 'GET', transport: 'http', trustBoundary: 'public' },
    },
    {
      artifactId: 'asset.bundle',
      path: 'assets/app.js',
      artifactClass: 'bundled-build-output',
      surfaceTier: 'public-artifact',
      representingPage: '/document',
    },
    {
      artifactId: 'gated.model',
      path: '/api/model',
      artifactClass: 'routed-path',
      surfaceTier: 'gated',
    },
  ],
}

test('parser round-trips generated entry sets and treats robots disallows as crawl controls', () => {
  const generated = generateDiscoverySurfaces(registry)
  const parsed = parseDiscoverySurfaces(generated.files)
  assert.deepEqual(parsed.errors, [])

  const publicIds = ['public.capability', 'public.document']
  for (const name of [
    'robots.txt',
    'llms.txt',
    'openapi.json',
    '.well-known/api-catalog',
    '.well-known/agent-card.json',
    '.well-known/mcp.json',
  ]) {
    assert.deepEqual(
      parsed.results.get(name).entries.map(entry => entry.entryId).sort(),
      publicIds,
      name,
    )
  }
  assert.deepEqual(
    parsed.results.get('sitemap.xml').entries.map(entry => entry.entryId).sort(),
    publicIds,
  )
  assert.deepEqual(parsed.results.get('robots.txt').crawlControls.disallowedPaths, ['/api/model'])
  assert.equal(
    parsed.results.get('robots.txt').entries.some(entry => entry.entryId === 'gated.model'),
    false,
  )
  assert.equal(
    parsed.results.get('sitemap.xml').entries.every(entry => entry.summary === ''),
    true,
  )
})

test('parseDiscoveryFiles exposes the gate-friendly result map', () => {
  const generated = generateDiscoverySurfaces(registry)
  const parsed = parseDiscoveryFiles(generated.files)
  assert.equal(parsed instanceof Map, true)
  assert.equal(parsed.get('llms.txt').error, undefined)
})

test('sitemap parser accepts representing-page URLs without exposing public-artifact ids', () => {
  const source = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:kg="https://airvio.co/ns/discovery">',
    '  <url>',
    '    <loc>https://airvio.co/product/</loc>',
    '    <lastmod>2026-07-27</lastmod>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n')
  assert.deepEqual(parseDiscoveryFile('sitemap.xml', source), { entries: [] })
})

test('sitemap parser fails closed on an exposed public-artifact identifier', () => {
  const source = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:kg="https://airvio.co/ns/discovery">',
    '  <url>',
    '    <loc>https://airvio.co/product/</loc>',
    '    <kg:artifact id="asset.bundle" tier="public-artifact" />',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n')
  assert.deepEqual(parseDiscoveryFile('sitemap.xml', source), {
    entries: [],
    error: { file: 'sitemap.xml', line: 5, code: 'SITEMAP_ARTIFACT' },
  })
})

test('JSON syntax failures report the first offending 1-based line and preserve bytes', () => {
  const bytes = Buffer.from('{\n  "entries": [\n    {\u0000}\n  ]\n}\n')
  const before = Buffer.from(bytes)
  const parsed = parseDiscoveryFile('.well-known/api-catalog', bytes)
  assert.deepEqual(parsed.entries, [])
  assert.deepEqual(parsed.error, {
    file: '.well-known/api-catalog',
    line: 3,
    code: 'INVALID_CONTROL_CHARACTER',
  })
  assert.equal(bytes.equals(before), true)
})

test('semantic entry failures return zero records and a located line', () => {
  const source = `${JSON.stringify({
    entries: [
      {
        entryId: 'public.ok',
        canonicalUrl: 'https://airvio.co/ok',
        summary: 'ok',
      },
      {
        entryId: 'public.broken',
        canonicalUrl: null,
        summary: 'broken',
      },
    ],
  }, null, 2)}\n`
  const parsed = parseDiscoveryFile('.well-known/agent-card.json', source)
  assert.deepEqual(parsed.entries, [])
  assert.equal(parsed.error.file, '.well-known/agent-card.json')
  assert.equal(parsed.error.code, 'CANONICAL_URL_INVALID')
  assert.equal(parsed.error.line > 1, true)
})

test('unsupported files fail closed without rewriting their input', () => {
  const bytes = Buffer.from('opaque\n')
  const before = Buffer.from(bytes)
  const parsed = parseDiscoveryFile('unknown.txt', bytes)
  assert.deepEqual(parsed, {
    entries: [],
    error: { file: 'unknown.txt', line: 1, code: 'UNSUPPORTED_DISCOVERY_FORMAT' },
  })
  assert.equal(bytes.equals(before), true)
})
