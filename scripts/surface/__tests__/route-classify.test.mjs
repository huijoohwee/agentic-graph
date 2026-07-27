import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  classifyPath,
  classifyRoutes,
  isApprovedFetchProxyRateLimit,
} from '../route-classify.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const scriptPath = path.join(repositoryRoot, 'scripts/surface/route-classify.mjs')
const proxyPaths = [
  '/api/link-proxy',
  '/api/link-preview',
  '/api/oembed',
  '/__youtube_transcript',
  '/__video_frame',
]

function entry(pathValue, surfaceTier, overrides = {}) {
  return {
    artifactId: `route.${pathValue.replace(/[^a-z0-9]+/giu, '.').replace(/^\.+|\.+$/gu, '')}`,
    path: pathValue,
    pathKind: pathValue.includes('*') ? 'glob' : 'exact',
    surfaceTier,
    targetExecutionRoute: surfaceTier === 'gated'
      ? 'control-plane-mcp'
      : 'public-read-mcp',
    readOnly: surfaceTier === 'public-discoverable',
    rateLimit: null,
    ...overrides,
  }
}

test('exact entries override patterns, then most restrictive matching pattern wins', () => {
  const registry = {
    entries: [
      entry('/*', 'public-discoverable'),
      entry('/api/*', 'gated'),
      entry('/api/health', 'public-discoverable'),
      entry('/private/*', 'gated'),
      entry('/private/**', 'private'),
    ],
  }

  assert.equal(classifyPath(registry, '/api/health').tier, 'public-discoverable')
  assert.equal(classifyPath(registry, '/api/other').tier, 'gated')
  assert.equal(classifyPath(registry, '/private/nested/value').tier, 'private')
})

test('unmatched routes fail closed to private and join unclassified', () => {
  const result = classifyRoutes(
    { entries: [entry('/health', 'public-discoverable')] },
    { include: ['/health', '/unknown'] },
  )

  assert.deepEqual(result.unclassified, ['/unknown'])
  assert.deepEqual(result.routes[1], {
    path: '/unknown',
    tier: 'private',
    executionRoute: 'none',
  })
})

test('all five fetch proxies require the approved 20 requests per 60 seconds', () => {
  const entries = proxyPaths.map((routePath, index) => entry(
    routePath,
    'gated',
    {
      rateLimit: index === 0
        ? { requests: 19, windowSeconds: 60 }
        : { requests: 20, windowSeconds: 60 },
    },
  ))
  const registry = { entries }
  const before = JSON.stringify(registry)
  const result = classifyRoutes(registry, { include: proxyPaths })

  assert.deepEqual(result.unclassified, [])
  assert.deepEqual(result.missingRateLimit, ['/api/link-proxy'])
  assert.equal(result.routes.length, 5)
  assert.equal(
    result.routes.slice(1).every(route => isApprovedFetchProxyRateLimit(route.rateLimit)),
    true,
  )
  assert.equal(JSON.stringify(registry), before)
})

test('route classifier CLI covers every manifest include', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'surface-routes-cli-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const registryPath = path.join(fixtureRoot, 'registry.json')
  const routesPath = path.join(fixtureRoot, '_routes.json')
  const registry = {
    entries: proxyPaths.map(routePath => entry(routePath, 'gated', {
      rateLimit: { requests: 20, windowSeconds: 60 },
    })),
  }
  await Promise.all([
    writeFile(registryPath, JSON.stringify(registry), 'utf8'),
    writeFile(routesPath, JSON.stringify({ include: proxyPaths }), 'utf8'),
  ])

  const run = spawnSync(
    process.execPath,
    [scriptPath, registryPath, routesPath],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )

  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.match(
    run.stdout,
    /^routes=5 unclassified=0 missingRateLimit=0\s*$/u,
  )
})
