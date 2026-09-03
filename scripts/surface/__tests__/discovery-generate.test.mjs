import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  DISCOVERY_SURFACE_FILES,
  generateDiscoverySurfaces,
  writeDiscoverySurfaces,
} from '../discovery-generate.mjs'
import { assembleCatalog } from '../invocation-assemble.mjs'

const publicEntry = overrides => ({
  artifactId: 'public.example',
  path: '/example',
  artifactClass: 'capability-description',
  surfaceTier: 'public-discoverable',
  licenseId: 'Apache-2.0',
  canonicalUrl: 'https://airvio.co/example',
  representingPage: null,
  title: 'Example surface',
  summary: 'A deterministic public example.',
  readOnly: true,
  ingressRoute: 'static-edge',
  targetExecutionRoute: 'none',
  spendBearing: false,
  lastModified: '2026-07-27',
  service: { method: 'GET', transport: 'http', trustBoundary: 'public' },
  ...overrides,
})

const registry = entries => ({
  schema: 'agentic-graph-surface-registry/v1',
  version: '1.0.0',
  publicOrigin: 'https://airvio.co',
  policy: { contentSignals: 'ai-train=no, search=yes, ai-input=yes' },
  catalogDigest: '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
  invocationRegistry: { catalogId: 'mcp', entries: [] },
  entries,
})

test('generator projects public metadata and keeps protected details out of descriptive files', () => {
  const generated = generateDiscoverySurfaces(registry([
    publicEntry({}),
    {
      artifactId: 'gated.model',
      path: '/api/model',
      artifactClass: 'routed-path',
      surfaceTier: 'gated',
      notes: 'PRIVATE_PROMPT_BODY',
    },
    {
      artifactId: 'private.module',
      path: 'src/private-module.mjs',
      artifactClass: 'application-source',
      surfaceTier: 'private',
      notes: 'PRIVATE_BINDING_NAME',
    },
    {
      artifactId: 'asset.bundle',
      path: 'assets/app.js',
      artifactClass: 'bundled-build-output',
      surfaceTier: 'public-artifact',
      representingPage: '/product/',
      lastModified: null,
    },
  ]))

  assert.deepEqual(generated.generationErrors, [])
  for (const file of DISCOVERY_SURFACE_FILES) assert.equal(generated.files.has(file), true)
  for (const [name, bytes] of generated.files) {
    const source = bytes.toString('utf8')
    assert.equal(source.includes('PRIVATE_PROMPT_BODY'), false, name)
    assert.equal(source.includes('PRIVATE_BINDING_NAME'), false, name)
    assert.equal(source.includes('private.module'), false, name)
    if (name !== 'robots.txt') {
      assert.equal(source.includes('/api/model'), false, name)
      assert.equal(source.includes('gated.model'), false, name)
    }
  }

  const robots = generated.files.get('robots.txt').toString('utf8')
  assert.match(robots, /Disallow: \/api\/model/u)
  assert.doesNotMatch(robots, /gated\.model/u)
  assert.match(robots, /Content-Signal: ai-train=no, search=yes, ai-input=yes/u)
  const sitemap = generated.files.get('sitemap.xml').toString('utf8')
  assert.match(sitemap, /https:\/\/airvio\.co\/product\//u)
  assert.doesNotMatch(sitemap, /assets\/app\.js/u)
  assert.doesNotMatch(sitemap, /asset\.bundle/u)
})

test('service descriptions enumerate public services with resolvable emitted schema references', () => {
  const generated = generateDiscoverySurfaces(registry([
    publicEntry({
      artifactId: 'public.post',
      path: '/public-post',
      service: { method: 'POST', transport: 'http', trustBoundary: 'public' },
    }),
    {
      artifactId: 'gated.post',
      path: '/gated-post',
      artifactClass: 'routed-path',
      surfaceTier: 'gated',
      service: { method: 'POST', transport: 'http', trustBoundary: 'credentialed' },
    },
  ]))
  const openapi = JSON.parse(generated.files.get('openapi.json'))
  assert.deepEqual(Object.keys(openapi.paths), ['/public-post'])
  assert.equal(openapi.paths['/public-post'].post['x-surface-tier'], 'public-discoverable')
  for (const ref of [
    openapi.paths['/public-post'].post['x-request-schema'],
    openapi.paths['/public-post'].post['x-response-schema'],
  ]) {
    const url = new URL(ref)
    assert.equal(url.origin, 'https://airvio.co')
    assert.equal(url.pathname, '/openapi.json')
    const component = decodeURIComponent(url.hash.replace('#/components/schemas/', ''))
    assert.equal(Object.hasOwn(openapi.components.schemas, component), true)
  }
  assert.equal(
    openapi.paths['/public-post'].post.requestBody.content['application/json'].schema.$ref,
    openapi.paths['/public-post'].post['x-request-schema'],
  )
  assert.equal(
    openapi.paths['/public-post'].post.responses['200'].content['application/json'].schema.$ref,
    openapi.paths['/public-post'].post['x-response-schema'],
  )
})

test('OpenAPI component identifiers stay distinct for punctuation-aliasing artifact ids', () => {
  const generated = generateDiscoverySurfaces(registry([
    publicEntry({
      artifactId: 'public.a-b',
      path: '/a',
      canonicalUrl: 'https://airvio.co/a',
    }),
    publicEntry({
      artifactId: 'public.a.b',
      path: '/b',
      canonicalUrl: 'https://airvio.co/b',
    }),
  ]))
  const openapi = JSON.parse(generated.files.get('openapi.json'))
  const refs = ['/a', '/b'].map(route => openapi.paths[route].get['x-response-schema'])
  assert.equal(new Set(refs).size, 2)
  assert.equal(Object.keys(openapi.components.schemas).length, 4)
})

test('authorization metadata is an explicit governed registry relation, never a fallback', () => {
  const authEntry = publicEntry({
    artifactId: 'discovery.auth',
    path: 'auth.md',
    canonicalUrl: 'https://airvio.co/auth.md',
    service: { method: 'GET', transport: 'static', trustBoundary: 'public' },
  })
  const mcpEntry = publicEntry({
    artifactId: 'endpoint.mcp',
    path: '/agentic-graph/mcp',
    canonicalUrl: 'https://airvio.co/agentic-graph/mcp',
    ingressRoute: 'public-read-mcp',
    targetExecutionRoute: 'public-read-mcp',
    service: {
      method: 'POST',
      transport: 'mcp',
      trustBoundary: 'public',
      authorizationMetadataUrl: 'https://airvio.co/auth.md',
    },
  })
  const generated = generateDiscoverySurfaces(registry([authEntry, mcpEntry]))
  assert.deepEqual(generated.generationErrors, [])
  for (const file of ['.well-known/agent-card.json', '.well-known/mcp.json']) {
    assert.equal(
      JSON.parse(generated.files.get(file)).authorizationMetadata,
      'https://airvio.co/auth.md',
    )
  }

  const missing = generateDiscoverySurfaces(registry([
    { ...mcpEntry, service: { ...mcpEntry.service, authorizationMetadataUrl: undefined } },
  ]))
  assert.deepEqual(
    missing.generationErrors.map(error => ({
      code: error.code,
      artifactId: error.artifactId,
      field: error.field,
    })),
    [{
      code: 'AUTHORIZATION_METADATA_MISSING',
      artifactId: 'endpoint.mcp',
      field: 'service.authorizationMetadataUrl',
    }],
  )
  assert.equal(
    JSON.parse(missing.files.get('.well-known/mcp.json')).authorizationMetadata,
    null,
  )
})

test('API and MCP discovery materialize the registry invocation catalog and exact digest', () => {
  const invocationRegistry = {
    catalogId: 'mcp',
    entries: [{
      token: 'search',
      prefixRole: 'mcp-tool-id',
      label: 'Search agentic-graph',
      intentSummary: 'Search published agentic-graph documents without mutating them.',
      executionRouteTier: 'public-discoverable',
      ingressRoute: 'public-read-mcp',
      targetExecutionRoute: 'public-read-mcp',
      spendBearing: false,
      readOnly: true,
    }],
  }
  const invocationCatalog = assembleCatalog([invocationRegistry])
  const input = {
    ...registry([publicEntry({})]),
    catalogDigest: invocationCatalog.digest,
    invocationRegistry,
  }
  const generated = generateDiscoverySurfaces(input)

  assert.deepEqual(generated.generationErrors, [])
  const apiCatalog = JSON.parse(generated.files.get('.well-known/api-catalog'))
  assert.deepEqual(apiCatalog.invocationCatalog, invocationCatalog)
  const mcp = JSON.parse(generated.files.get('.well-known/mcp.json'))
  assert.equal(mcp.catalogDigest, invocationCatalog.digest)
  assert.deepEqual(mcp.capabilities.tools.map(tool => tool.name), ['search'])
})

test('generator materializes an approved full catalog without publishing source documents', () => {
  const invocationRegistry = {
    catalogId: 'mcp',
    entries: [{
      token: 'search',
      prefixRole: 'mcp-tool-id',
      label: 'Search agentic-graph',
      intentSummary: 'Search published documents without mutation.',
      executionRouteTier: 'public-discoverable',
      ingressRoute: 'public-read-mcp',
      targetExecutionRoute: 'public-read-mcp',
      spendBearing: false,
      readOnly: true,
    }],
  }
  const approvedActions = {
    catalogId: 'action',
    publishPolicy: 'dev-only',
    entries: [{
      token: '/compose',
      prefixRole: 'action',
      label: 'Compose',
      intentSummary: 'Request an approval-gated composition workflow.',
      executionRouteTier: 'gated',
      ingressRoute: 'invocation-forwarder',
      targetExecutionRoute: 'control-plane-mcp',
      spendBearing: true,
      readOnly: false,
    }],
  }
  const fullCatalog = assembleCatalog(
    [invocationRegistry, approvedActions],
    { approvedCatalogIds: ['action'] },
  )
  const input = {
    ...registry([publicEntry({})]),
    catalogDigest: fullCatalog.digest,
    invocationRegistry,
  }
  const generated = generateDiscoverySurfaces(input, {
    invocationCatalog: {
      ...fullCatalog,
      sourceDocuments: [{ internalPrompt: 'DO_NOT_PUBLISH' }],
    },
  })

  assert.deepEqual(generated.generationErrors, [])
  const apiCatalog = JSON.parse(generated.files.get('.well-known/api-catalog'))
  assert.deepEqual(apiCatalog.invocationCatalog, fullCatalog)
  assert.equal(JSON.stringify(apiCatalog).includes('DO_NOT_PUBLISH'), false)
  assert.deepEqual(
    apiCatalog.invocationCatalog.entries.map(entry => entry.token),
    ['/compose', 'search'],
  )
  const mcp = JSON.parse(generated.files.get('.well-known/mcp.json'))
  assert.deepEqual(mcp.capabilities.tools.map(tool => tool.name), ['search'])
  assert.equal(mcp.catalogDigest, fullCatalog.digest)
})

test('generator rejects a malformed or digest-divergent supplied catalog', () => {
  const fullCatalog = assembleCatalog([{
    catalogId: 'mcp',
    entries: [{
      token: 'search',
      prefixRole: 'mcp-tool-id',
      label: 'Search agentic-graph',
      intentSummary: 'Search published documents without mutation.',
      executionRouteTier: 'public-discoverable',
      ingressRoute: 'public-read-mcp',
      targetExecutionRoute: 'public-read-mcp',
      spendBearing: false,
      readOnly: true,
    }],
  }])
  const input = {
    ...registry([publicEntry({})]),
    catalogDigest: fullCatalog.digest,
  }
  const generated = generateDiscoverySurfaces(input, {
    invocationCatalog: {
      ...fullCatalog,
      digest: '0'.repeat(64),
      entries: [{
        ...fullCatalog.entries[0],
        endpointUrl: 'https://private.example.invalid/',
      }],
    },
  })

  assert.equal(
    generated.generationErrors.some(error => error.code === 'INVALID_INVOCATION_ENTRY'),
    true,
  )
  assert.equal(
    generated.generationErrors.some(error => error.code === 'INVOCATION_CATALOG_DIGEST_MISMATCH'),
    true,
  )
  assert.equal(
    generated.files.get('.well-known/api-catalog').includes('private.example.invalid'),
    false,
  )
})

test('invalid public metadata is omitted and reported without sinking valid entries', () => {
  const generated = generateDiscoverySurfaces(registry([
    publicEntry({ artifactId: 'public.valid' }),
    publicEntry({ artifactId: 'public.invalid', title: '', canonicalUrl: null }),
  ]))
  assert.deepEqual(
    generated.generationErrors
      .filter(error => error.artifactId === 'public.invalid')
      .map(error => error.field),
    ['canonicalUrl', 'title'],
  )
  const llms = generated.files.get('llms.txt').toString('utf8')
  assert.match(llms, /public\.valid/u)
  assert.doesNotMatch(llms, /public\.invalid/u)
})

test('generation is byte deterministic across registry insertion order', () => {
  const entries = [
    publicEntry({ artifactId: 'public.b', canonicalUrl: 'https://airvio.co/b', path: '/b' }),
    publicEntry({ artifactId: 'public.a', canonicalUrl: 'https://airvio.co/a', path: '/a' }),
  ]
  const forward = generateDiscoverySurfaces(registry(entries))
  const reverse = generateDiscoverySurfaces(registry([...entries].reverse()))
  assert.deepEqual([...forward.files.keys()], [...reverse.files.keys()])
  for (const [name, bytes] of forward.files) assert.equal(bytes.equals(reverse.files.get(name)), true, name)
})

test('filesystem wrapper atomically replaces disposable staging and never touches a tracked root', async t => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-graph-discovery-'))
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))
  const staging = path.join(temporaryRoot, '.tmp', 'surface-staging')
  const tracked = path.join(temporaryRoot, 'public')
  await mkdir(staging, { recursive: true })
  await mkdir(tracked, { recursive: true })
  await writeFile(path.join(staging, 'stale.txt'), 'stale\n')
  await writeFile(path.join(tracked, 'robots.txt'), 'tracked sentinel\n')

  const result = await writeDiscoverySurfaces(registry([publicEntry({})]), staging)
  assert.equal(result.written, true)
  assert.equal(await readFile(path.join(tracked, 'robots.txt'), 'utf8'), 'tracked sentinel\n')
  await assert.rejects(
    writeDiscoverySurfaces(registry([publicEntry({})]), tracked),
    /disposable \.tmp\/surface-staging/u,
  )
})

test('filesystem wrapper rejects a symlinked disposable staging parent', async t => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-graph-discovery-link-'))
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))
  const outside = path.join(temporaryRoot, 'outside')
  await mkdir(outside)
  await symlink(outside, path.join(temporaryRoot, '.tmp'))

  await assert.rejects(
    writeDiscoverySurfaces(
      registry([publicEntry({})]),
      path.join(temporaryRoot, '.tmp', 'surface-staging'),
    ),
    /staging parent must be a real directory/u,
  )
  await assert.rejects(readFile(path.join(outside, 'surface-staging', 'robots.txt')), /ENOENT/u)
})
