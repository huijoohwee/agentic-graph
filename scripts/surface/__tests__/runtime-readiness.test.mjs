import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  APPROVED_FETCH_PROXY_RATE_LIMIT,
  FETCH_PROXY_ROUTES,
  GATED_EXECUTION_ROUTES,
} from '../constants.mjs'
import { generateDiscoverySurfaces } from '../discovery-generate.mjs'
import {
  renderDeclaration,
  validateLicenseRegistry,
} from '../license-registry.mjs'
import { validateRegistry } from '../registry-validate.mjs'
import { classifyPath } from '../route-classify.mjs'

const registryUrl = new URL('../../../config/surface-registry.json', import.meta.url)
const licensesUrl = new URL('../../../config/license-registry.json', import.meta.url)

async function readSeed(url) {
  return JSON.parse(await readFile(url, 'utf8'))
}

test('seeded policy fixes both operator decisions and validates every license mapping', async () => {
  const [registry, licenses] = await Promise.all([
    readSeed(registryUrl),
    readSeed(licensesUrl),
  ])

  assert.equal(validateRegistry(registry).ok, true)
  assert.equal(validateLicenseRegistry(licenses, registry).ok, true)
  assert.deepEqual(registry.policy.fetchProxyRateLimit, APPROVED_FETCH_PROXY_RATE_LIMIT)
  assert.equal(registry.policy.noReuseLicenseId, 'LicenseRef-airvio-no-reuse-1.0')

  for (const route of FETCH_PROXY_ROUTES) {
    const classification = classifyPath(registry, route)
    assert.equal(classification.classified, true, route)
    assert.equal(classification.tier, 'gated', route)
    assert.deepEqual(classification.rateLimit, APPROVED_FETCH_PROXY_RATE_LIMIT, route)
  }

  const declaration = renderDeclaration(licenses)
  assert.match(declaration, /LicenseRef-airvio-no-reuse-1\.0/)
  assert.match(declaration, /bundled-build-output/)
  assert.match(declaration, /dist-module/)
})

test('seeded generation closes known route leaks without exposing protected paths', async () => {
  const registry = await readSeed(registryUrl)
  const generated = generateDiscoverySurfaces(registry)
  const robots = generated.files.get('robots.txt').toString('utf8')
  const sitemap = generated.files.get('sitemap.xml').toString('utf8')
  const llms = generated.files.get('llms.txt').toString('utf8')

  assert.deepEqual(generated.generationErrors, [])
  for (const route of [...FETCH_PROXY_ROUTES, ...GATED_EXECUTION_ROUTES]) {
    assert.match(robots, new RegExp(`^Disallow: ${escapeRegExp(route)}$`, 'mu'), route)
    assert.equal(sitemap.includes(route), false, route)
    assert.equal(llms.includes(route), false, route)
  }
  for (const stalePath of [
    '/api/storage/source-files',
    '/api/storage/llms.txt',
    '/api/storage/content-manifest.json',
  ]) {
    assert.equal(sitemap.includes(stalePath), false, stalePath)
    assert.equal(llms.includes(stalePath), false, stalePath)
  }
  assert.match(robots, /Content-Signal: ai-train=no, search=yes, ai-input=yes/)
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
