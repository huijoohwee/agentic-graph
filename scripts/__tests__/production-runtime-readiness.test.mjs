import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  calculateRuntimeArtifactDigest,
  resolveProductionRuntimeReadinessSchemaPath,
  serializeProductionRuntimeReadiness,
  validateProductionRuntimeReadiness,
} from '../production-runtime-readiness.mjs'
import { fetchAgenticGraphStaticAsset } from '../../cloudflare/pages/agentic-graph-agent-ready-app-shell.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

const sha = character => character.repeat(40)
const digest = character => character.repeat(64)
const validReadiness = {
  schema: 'agentic-os-production-runtime-readiness/v2',
  status: 'verified-build',
  source: { repository: 'huijoohwee/agentic-graph', revision: sha('a'), tree: sha('b') },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: sha('c') },
  catalogRevision: sha('c'),
  artifact: { algorithm: 'sha256', digest: digest('d') },
  immutableManifest: { algorithm: 'sha256', digest: digest('e') },
  mirror: { repository: 'huijoohwee/huijoohwee' },
  surfaces: ['/', '/agentic-graph'],
}

test('production readiness validates exact runtime identities and rejects drift', async () => {
  assert.equal(await validateProductionRuntimeReadiness(validReadiness), validReadiness)
  await assert.rejects(
    validateProductionRuntimeReadiness({ ...validReadiness, unexpected: true }),
    /must NOT have additional properties/,
  )
  await assert.rejects(
    validateProductionRuntimeReadiness(validReadiness, { sourceRevision: sha('f') }),
    /source revision mismatch/,
  )
  assert.match(serializeProductionRuntimeReadiness(validReadiness), /"surfaces": \[/)
})

test('production readiness resolves Agentic Canvas OS schemas from a linked agentic-graph worktree', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-readiness-root-'))
  const docsRoot = path.join(root, 'agentic-canvas-os', 'docs')
  const taskRoot = path.join(root, '.worktrees', 'agentic-graph', 'xr-runtime')
  try {
    await fs.mkdir(docsRoot, { recursive: true })
    await fs.mkdir(taskRoot, { recursive: true })
    await fs.writeFile(path.join(docsRoot, 'FACTS.md'), '# Source marker\n', 'utf8')
    assert.equal(
      resolveProductionRuntimeReadinessSchemaPath({ rootDir: taskRoot, env: {} }),
      path.join(docsRoot, 'schemas', 'production-runtime-readiness.v2.schema.json'),
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('browser artifact digest is path-bound, order-independent, and content-sensitive', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-artifact-'))
  const first = path.resolve(root, 'first.js')
  const second = path.resolve(root, 'second.css')
  await fs.writeFile(first, 'alpha', 'utf8')
  await fs.writeFile(second, 'beta', 'utf8')
  const entries = [
    { relativePath: 'assets/first.js', absolutePath: first },
    { relativePath: 'assets/second.css', absolutePath: second },
  ]
  const expected = await calculateRuntimeArtifactDigest(entries)
  assert.equal(await calculateRuntimeArtifactDigest([...entries].reverse()), expected)
  await fs.writeFile(second, 'changed', 'utf8')
  assert.notEqual(await calculateRuntimeArtifactDigest(entries), expected)
})

test('app readiness route serves the apex marker bytes without an SPA fallback', async () => {
  const body = serializeProductionRuntimeReadiness(validReadiness)
  let fetchedUrl = ''
  const response = await fetchAgenticGraphStaticAsset({
    request: new Request('https://airvio.co/agentic-graph/.well-known/runtime-readiness.json?stale=1'),
    env: { ASSETS: { fetch: async () => { throw new Error('readiness must use the route continuation') } } },
    next: async request => {
      fetchedUrl = request.url
      return new Response(body, { headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(fetchedUrl, 'https://airvio.co/.well-known/runtime-readiness.json?stale=1')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), body)
})

test('app readiness route rejects an HTML asset fallback', async () => {
  const response = await fetchAgenticGraphStaticAsset({
    request: new Request('https://airvio.co/agentic-graph/.well-known/runtime-readiness.json'),
    env: {},
    next: async () => new Response('<html>fallback</html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  })
  assert.equal(response.status, 503)
  assert.doesNotMatch(await response.text(), /fallback/)
})

test('static assets preserve conditional cache responses for an iframe reuse', async () => {
  for (const method of ['GET', 'HEAD']) {
    for (const condition of [{ 'if-none-match': 'W/"candidate"' }, { 'if-modified-since': 'Thu, 10 Sep 2026 00:00:00 GMT' }]) {
      const cached = new Response(null, { status: 304, headers: { etag: 'W/"candidate"', 'cache-control': 'public, max-age=0, must-revalidate' } })
      const response = await fetchAgenticGraphStaticAsset({
        request: new Request('https://preview.pages.dev/agentic-graph/assets/candidate/main.js', { method, headers: condition }),
        env: { ASSETS: { fetch: async request => {
          for (const [key, value] of Object.entries(condition)) assert.equal(request.headers.get(key), value)
          return cached
        } } },
      })
      assert.equal(response, cached)
      assert.equal(response.status, 304)
      assert.equal(await response.text(), '')
    }
  }
})

test('static assets still reject HTML fallbacks, HTML revalidation, and missing assets', async () => {
  for (const upstream of [new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }),
    new Response(null, { status: 304, headers: { 'content-type': 'text/html' } }), new Response('missing', { status: 404 })]) {
    const response = await fetchAgenticGraphStaticAsset({
      request: new Request('https://airvio.co/agentic-graph/assets/missing.js', { headers: { 'if-none-match': '"old"' } }),
      env: { ASSETS: { fetch: async () => upstream } },
    })
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0')
  }
})
