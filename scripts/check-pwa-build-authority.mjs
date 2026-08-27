import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const serviceWorker = fs.readFileSync(path.resolve(repoRoot, 'canvas', 'dist', 'sw.js'), 'utf8')
const importedChatWorker = fs.readFileSync(
  path.resolve(repoRoot, 'canvas', 'public', 'agenticgraph-chat-stream-sw.js'),
  'utf8',
)
const revisionAuthority = fs.readFileSync(
  path.resolve(repoRoot, 'canvas', 'dist', 'agenticgraph-service-worker-revision.js'),
  'utf8',
)

assert.doesNotMatch(
  serviceWorker,
  /\{url:["']index\.html["']/,
  'generated service worker must not precache a mutable HTML shell',
)
assert.doesNotMatch(
  serviceWorker,
  /NavigationRoute\([^)]*createHandlerBoundToURL\(["']index\.html["']\)/,
  'generated service worker must not own production navigations through an HTML fallback',
)
for (const cacheName of ['kg-assets', 'kg-static', 'kg-data']) {
  const cacheNameMatch = new RegExp(`cacheName:(["'])${cacheName}\\1`).exec(serviceWorker)
  assert.ok(cacheNameMatch?.index !== undefined, `generated service worker must define ${cacheName}`)
  const routeStart = serviceWorker.lastIndexOf('registerRoute(', cacheNameMatch.index)
  const nextRouteStart = serviceWorker.indexOf('registerRoute(', cacheNameMatch.index + 1)
  assert.notEqual(routeStart, -1, `${cacheName} must belong to one generated runtime route`)
  const routeSource = serviceWorker.slice(
    routeStart,
    nextRouteStart === -1 ? serviceWorker.length : nextRouteStart,
  )
  const readPolicyStart = routeSource.indexOf('cachedResponseWillBeUsed:')
  const writePolicyStart = routeSource.indexOf('cacheWillUpdate:')
  assert.ok(
    readPolicyStart >= 0 && writePolicyStart > readPolicyStart,
    `${cacheName} must reject HTML on both cache reads and writes`,
  )
  const readPolicy = routeSource.slice(readPolicyStart, writePolicyStart)
  const writePolicy = routeSource.slice(writePolicyStart)
  for (const [label, policy] of [['read', readPolicy], ['write', writePolicy]]) {
    assert.match(policy, /["']text\/html["']/, `${cacheName} ${label} policy must reject HTML`)
    assert.match(
      policy,
      /["']application\/xhtml\+xml["']/,
      `${cacheName} ${label} policy must reject XHTML`,
    )
    assert.match(policy, /null/, `${cacheName} ${label} policy must reject invalid responses`)
  }
  assert.match(
    writePolicy,
    /(?:200\s*!==?\s*[\w$.]+\.status|[\w$.]+\.status\s*!==?\s*200)/,
    `${cacheName} write policy must preserve Workbox status-200 admission`,
  )
}
assert.match(serviceWorker, /\.skipWaiting\(\)/, 'generated service worker must activate the canonical revision')
assert.match(serviceWorker, /\.clientsClaim\(\)/, 'generated service worker must claim clients from one lifecycle owner')
assert.doesNotMatch(
  importedChatWorker,
  /addEventListener\(["'](?:install|activate)["']/,
  'imported chat worker must not duplicate generated service-worker lifecycle ownership',
)
assert.doesNotMatch(
  revisionAuthority,
  /addEventListener\(["']install["']/,
  'revision authority must not duplicate generated service-worker install ownership',
)
assert.match(
  revisionAuthority,
  /addEventListener\(["']activate["']/,
  'revision authority must converge runtime caches during worker activation',
)
assert.match(
  revisionAuthority,
  /Refusing cache cleanup before the current precache is ready/,
  'revision authority must fail closed before deleting stale cache entries',
)
const attestedRevision = revisionAuthority.match(/const sourceRevision = ["']([0-9a-f]{40})["']/)?.[1] || ''
assert.match(attestedRevision, /^[0-9a-f]{40}$/, 'revision authority must attest one exact source revision')
assert.match(
  serviceWorker,
  new RegExp(`importScripts\\(["']agenticgraph-service-worker-revision\\.js\\?revision=${attestedRevision}["'],["']agenticgraph-chat-stream-sw\\.js\\?revision=${attestedRevision}["']\\)`),
  'generated service worker must revision-bind both imported worker scripts',
)
assert.match(
  serviceWorker,
  new RegExp(`assets/${attestedRevision}/`),
  'service-worker precache and attested active revision must share one source namespace',
)
assert.match(
  importedChatWorker,
  /RUNTIME_SCHEMA = ["']agenticgraph-chat-stream-worker\/v2["']/,
  'imported chat worker must expose the lifecycle-clean runtime attestation',
)

process.stdout.write('[agenticgraph] generated PWA keeps HTTP as the sole HTML owner\n')
