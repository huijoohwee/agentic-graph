import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  readRegistry,
  validateRegistry,
} from '../registry-validate.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const scriptPath = path.join(repositoryRoot, 'scripts/surface/registry-validate.mjs')
const seededRegistryPath = path.join(repositoryRoot, 'config/surface-registry.json')

function createEntry(overrides = {}) {
  return {
    artifactId: 'discovery.llms-txt',
    path: 'llms.txt',
    pathKind: 'exact',
    artifactClass: 'machine-readable-metadata',
    surfaceTier: 'public-discoverable',
    licenseId: 'Apache-2.0',
    publishPolicy: 'generated-only',
    owningRepository: 'public-origin',
    repositoryVisibility: 'public',
    artifactClassCategory: 'permissive',
    canonicalUrl: 'https://airvio.co/llms.txt',
    representingPage: null,
    title: 'Agent index',
    summary: 'Machine-readable public discovery index.',
    readOnly: null,
    ingressRoute: 'static-edge',
    targetExecutionRoute: 'none',
    spendBearing: false,
    rateLimit: null,
    lastModified: '2026-07-27',
    invocation: null,
    service: null,
    notes: 'Generated public metadata.',
    ...overrides,
  }
}

function createRegistry(entries = [createEntry()]) {
  return {
    schema: 'agentic-graph-surface-registry/v1',
    version: '1.0.0',
    publicOrigin: 'https://airvio.co',
    policy: {
      fetchProxyRateLimit: { requests: 20, windowSeconds: 60 },
      noReuseLicenseId: 'LicenseRef-airvio-no-reuse-1.0',
      contentSignals: 'ai-train=no, search=yes, ai-input=yes',
      unknownArtifactTier: 'private',
      promotionMode: 'fixture-only',
    },
    permittedRepositories: {
      private: ['dev', 'worker', 'public-origin'],
      gated: ['public-origin'],
      'public-artifact': ['public-origin'],
      'public-discoverable': ['dev', 'public-origin', 'site'],
    },
    distributionAllowlist: ['grph-shared/dist'],
    catalogDigest: '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
    invocationRegistry: { catalogId: 'mcp', entries: [] },
    catalogSources: [{
      catalogId: 'dev.commands',
      repository: 'dev',
      path: 'canvas/src/config/registryTemplates.ts',
    }],
    entries,
  }
}

function createProxyEntries(overridesByPath = {}) {
  return [
    '/api/link-proxy',
    '/api/link-preview',
    '/api/oembed',
    '/__youtube_transcript',
    '/__video_frame',
  ].map((routePath, index) => createEntry({
    artifactId: `route.fetch-proxy-${index}`,
    path: routePath,
    artifactClass: 'routed-path',
    surfaceTier: 'gated',
    licenseId: 'NONE-private',
    publishPolicy: 'never',
    artifactClassCategory: 'unlicensed-private',
    canonicalUrl: null,
    title: null,
    summary: null,
    readOnly: false,
    ingressRoute: 'static-edge',
    targetExecutionRoute: 'control-plane-mcp',
    rateLimit: { requests: 20, windowSeconds: 60 },
    lastModified: null,
    notes: 'Gated fetch-on-behalf proxy.',
    ...overridesByPath[routePath],
  }))
}

test('validateRegistry accepts the v1 schema without mutating its input', () => {
  const registry = createRegistry([createEntry(), ...createProxyEntries()])
  const before = JSON.stringify(registry)

  assert.deepEqual(validateRegistry(registry), { ok: true, violations: [] })
  assert.equal(JSON.stringify(registry), before)
})

test('catalog source paths cannot escape their declared repository', () => {
  const registry = createRegistry([createEntry(), ...createProxyEntries()])
  registry.catalogSources[0].path = '../../outside.md'

  const result = validateRegistry(registry)
  assert.equal(result.ok, false)
  assert.equal(
    result.violations.some(violation => (
      violation.code === 'SCHEMA_VIOLATION'
      && violation.field === 'path'
    )),
    true,
  )
})

test('seeded distribution policy contains only generated output and no source exceptions', async () => {
  const registry = JSON.parse(await readFile(seededRegistryPath, 'utf8'))

  assert.deepEqual(registry.distributionAllowlist, [
    'grph-shared/dist/**',
    'agentic-graph/assets/**',
  ])
  assert.equal(
    registry.entries.some(entry => (
      entry.surfaceTier === 'public-artifact'
      && (
        entry.path.startsWith('canvas/src/')
        || entry.path.startsWith('cloudflare/workers/')
      )
    )),
    false,
  )
  assert.equal(
    registry.entries.some(entry => (
      entry.surfaceTier === 'private'
      && entry.path === 'canvas/src/**'
    )),
    true,
  )
  assert.equal(
    registry.entries.some(entry => (
      entry.surfaceTier === 'private'
      && entry.path === 'cloudflare/workers/**'
    )),
    true,
  )
})

test('validateRegistry enforces seeded execution and fetch-proxy semantics', () => {
  const executionEntries = [
    createEntry({
      artifactId: 'invalid.spend-target',
      artifactClass: 'capability-description',
      spendBearing: true,
      ingressRoute: 'invocation-forwarder',
      targetExecutionRoute: 'public-read-mcp',
    }),
    createEntry({
      artifactId: 'invalid.public-read-mcp',
      artifactClass: 'mcp-endpoint',
      ingressRoute: 'public-read-mcp',
      targetExecutionRoute: 'public-read-mcp',
      readOnly: false,
    }),
    createEntry({
      artifactId: 'invalid.invocation-token',
      artifactClass: 'invocation-token',
      path: 'invocation://slash/video.generate',
      ingressRoute: 'public-read-mcp',
      targetExecutionRoute: 'public-read-mcp',
      spendBearing: true,
      readOnly: false,
      invocation: {
        token: '/video.generate',
        prefixRole: 'action',
        label: 'Generate video',
        intentSummary: 'Generate a video through the control plane.',
        sourceCatalogs: ['dev.commands'],
      },
    }),
  ]
  const proxyEntries = createProxyEntries({
    '/api/link-proxy': {
      surfaceTier: 'private',
    },
    '/api/link-preview': {
      rateLimit: { requests: 21, windowSeconds: 60 },
    },
  })

  const result = validateRegistry(createRegistry([
    ...executionEntries,
    ...proxyEntries,
  ]))

  assert.equal(result.ok, false)
  assert.ok(result.violations.some(violation => (
    violation.code === 'SPEND_ROUTE_VIOLATION'
    && violation.artifactId === 'invalid.spend-target'
    && violation.mandatoryValue === 'control-plane-mcp'
  )))
  assert.ok(result.violations.some(violation => (
    violation.code === 'PUBLIC_READ_MCP_VIOLATION'
    && violation.artifactId === 'invalid.public-read-mcp'
    && violation.mandatoryValue === true
  )))
  assert.ok(result.violations.some(violation => (
    violation.code === 'INVOCATION_ROUTE_VIOLATION'
    && violation.artifactId === 'invalid.invocation-token'
    && violation.mandatoryValue === 'invocation-forwarder'
  )))
  assert.ok(result.violations.some(violation => (
    violation.code === 'FETCH_PROXY_TIER_VIOLATION'
    && violation.artifactId === 'route.fetch-proxy-0'
    && violation.mandatoryValue === 'gated'
  )))
  assert.ok(result.violations.some(violation => (
    violation.code === 'FETCH_PROXY_RATE_LIMIT_VIOLATION'
    && violation.artifactId === 'route.fetch-proxy-1'
    && violation.mandatoryValue.requests === 20
    && violation.mandatoryValue.windowSeconds === 60
  )))
})

test('validateRegistry reports resolved policy violations with stable codes', () => {
  const entries = [
    createEntry({
      artifactId: 'invalid.multi-tier',
      surfaceTier: ['public-discoverable', 'private'],
    }),
    createEntry({
      artifactId: 'invalid.unknown-tier',
      surfaceTier: 'world-readable',
    }),
    createEntry({
      artifactId: 'invalid.private-class',
      artifactClass: 'application-source',
      surfaceTier: 'public-discoverable',
      licenseId: 'Apache-2.0',
      owningRepository: 'dev',
      repositoryVisibility: 'public',
    }),
    createEntry({
      artifactId: 'invalid.unlicensed',
      licenseId: 'NONE-private',
    }),
    createEntry({
      artifactId: '',
    }),
  ]

  const result = validateRegistry(createRegistry(entries))
  const codes = new Set(result.violations.map(violation => violation.code))

  assert.equal(result.ok, false)
  assert.ok(codes.has('MULTI_TIER'))
  assert.ok(codes.has('UNKNOWN_TIER'))
  assert.ok(codes.has('CLASS_TIER_VIOLATION'))
  assert.ok(codes.has('REPO_VISIBILITY'))
  assert.ok(codes.has('UNLICENSED'))
  assert.ok(codes.has('MISSING_FIELD'))
  assert.ok(result.violations.some(violation => (
    violation.artifactId === 'invalid.private-class'
    && violation.mandatoryValue === 'private'
  )))
})

test('readRegistry is total for malformed JSON', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'surface-registry-invalid-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const registryPath = path.join(fixtureRoot, 'surface-registry.json')
  await writeFile(registryPath, '{invalid', 'utf8')

  const result = await readRegistry(registryPath, { schemaPath: null })

  assert.equal(result.ok, false)
  assert.equal(result.registry, null)
  assert.equal(result.violations[0].code, 'INVALID_JSON')
})

test('registry validator CLI reports the required VCC summary', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'surface-registry-cli-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const registryPath = path.join(fixtureRoot, 'surface-registry.json')
  await writeFile(
    registryPath,
    JSON.stringify(createRegistry([createEntry(), ...createProxyEntries()])),
    'utf8',
  )

  const run = spawnSync(process.execPath, [scriptPath, registryPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })

  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.match(run.stdout, /^entries=6 tiers=4\s*$/u)
})
