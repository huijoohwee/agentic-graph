import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildPagesMirrorAgentReadyPlan } from '../pages-mirror-agent-ready.mjs'
import { buildAgentReadyHeaders } from '../pages-mirror-headers.mjs'
import { buildAgenticGraphRedirects } from '../production-pages-routing.mjs'
import { productionRuntimeReadinessHeaderLines } from '../production-runtime-readiness-build.mjs'
import {
  XR_V2_LEGACY_MIRROR_RELATIVE_PATHS,
  XR_V2_MIRRORED_IGNORE_RELATIVE_PATH,
  XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS,
} from '../xr-v2/production-publish-contract.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const readScript = filename => fs.readFileSync(path.resolve(repoRoot, 'scripts', filename), 'utf8')
const syncSource = readScript('pages-mirror-sync.mjs')
const cleanupSource = readScript('pages-mirror-legacy-cleanup.mjs')
const inventorySource = readScript('legacy-mirror-inventory.mjs')

const buildPlan = async t => {
  const mirrorRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-pages-plan-'))
  t.after(() => fsPromises.rm(mirrorRoot, { force: true, recursive: true }))
  const plan = await buildPagesMirrorAgentReadyPlan({ agenticGraphRoot: repoRoot, mirrorRoot })
  return { mirrorRoot, plan }
}

const copyTargetPaths = (plan, mirrorRoot) => new Set(plan.agentReadyRuntimeCopies.map(([, target]) => (
  path.relative(mirrorRoot, target).split(path.sep).join('/')
)))

test('publish sync removes stale generated assets through a sealed legacy boundary', () => {
  assert.doesNotMatch(syncSource, /isRetainedAssetRelativePath/)
  assert.match(syncSource, /const isPublicManagedRelativePath = relativePath => Boolean\(relativePath\)/)
  assert.match(syncSource, /filesToRemove\.push\(relativePath\)/)
  assert.match(syncSource, /publicFilesToRemove\.push\(relativePath\)/)
  assert.match(syncSource, /collectLegacyMirrorFilesToRemove/)
  assert.match(cleanupSource, /listSealedLegacyMirrorPaths/)
  assert.match(cleanupSource, /Legacy image migration refuses to overwrite/)
  assert.match(inventorySource, /Legacy mirror root inventory drifted/)
  assert.match(inventorySource, /Legacy named-file inventory contains an unexpected, missing, or partially retired path/)
})

test('published agent-ready dependency plan contains the browser and tool-contract closure', async t => {
  const { mirrorRoot, plan } = await buildPlan(t)
  const targets = copyTargetPaths(plan, mirrorRoot)
  for (const relativePath of [
    'canvas/src/features/agent-ready/browserFunctionSource.mjs',
    'canvas/src/features/agent-ready/publishedToolExecutors.mjs',
    'canvas/src/features/agent-ready/webMcpLifecycle.mjs',
    'canvas/src/features/agent-ready/webMcpLifecycleBrowserSource.mjs',
    'canvas/src/features/agent-ready/agentic-graph-agent-ready-output-schemas.mjs',
    'canvas/src/features/agent-ready/mcpAppsContractText.mjs',
    'canvas/src/features/agent-ready/mcpAppsOnboarding.mjs',
    'canvas/src/features/agent-ready/motionControlAgentReadyContract.mjs',
    'canvas/src/features/agent-ready/flightSimAgentReadyContract.mjs',
    'canvas/src/features/agent-ready/storageSyncAgentReadyContract.mjs',
    'canvas/src/features/agent-ready/probeTreeUserInputRelevance.mjs',
    'canvas/src/features/agent-ready/agentic-graph-vdeoxpln-registry-data.mjs',
    'canvas/src/features/agent-ready/agentic-graph-application-composition-vdeoxpln.mjs',
    'canvas/src/features/group-panel/groupPanelContract.mjs',
    'canvas/src/features/three/xrSceneMcpContract.mjs',
    'canvas/src/features/three/xrAnimationMcpContract.mjs',
    'canvas/src/features/three/motionControlMcpContract.mjs',
    'canvas/src/features/game-flight-sim/flightSimMcpContract.mjs',
    'canvas/src/features/strybldr/cameraMcpContract.mjs',
    'canvas/src/lib/storage/agentic-graph-storage-engine-mcp-contract.mjs',
    'contracts/semantic-key.js',
  ]) {
    assert.ok(targets.has(relativePath), `missing published dependency ${relativePath}`)
  }
})

test('publish sync retains the canonical root shell and one managed 404 boundary', () => {
  assert.match(syncSource, /'agentic-graph-live-canvas-hero\.md'/)
  assert.match(syncSource, /rel: '404\.html'/)
  assert.match(syncSource, /cloudflare', 'pages', '404\.html'/)
  assert.match(syncSource, /'index\.html', \.\.\.XR_V2_LEGACY_MIRROR_RELATIVE_PATHS/)
})

test('generated headers cover mutable service-worker paths without retaining legacy product routes', () => {
  const headers = buildAgentReadyHeaders({
    existing: [
      '/agenticgraph/*',
      '  Cache-Control: public, max-age=31536000',
      '',
      '# BEGIN knowgrph generated old headers',
      '/knowgrph/*',
      '  Cache-Control: public, max-age=31536000',
      '# END knowgrph generated old headers',
      '',
    ].join('\n'),
    artifacts: { '.well-known/agent-ready.json': { body: '{}', contentType: 'application/json' } },
    agentReadyHomepageLinkHeaderValue: '<https://airvio.co/.well-known/agent-ready.json>; rel="agent-ready"',
    productionRuntimeReadinessHeaderLines,
  })
  assert.doesNotMatch(headers, /\/(?:agenticgraph|knowgrph)(?:\/|\*)/)
  for (const route of [
    '/content/agentic-graph/sw.js',
    '/agentic-graph/sw.js',
    '/content/agentic-graph/agentic-graph-chat-stream-sw.js',
    '/agentic-graph/agentic-graph-chat-stream-sw.js',
    '/content/agentic-graph/agentic-graph-service-worker-revision.js',
    '/agentic-graph/agentic-graph-service-worker-revision.js',
  ]) assert.match(headers, new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n  Cache-Control: no-store`))
})

test('runtime readiness includes generated service-worker executables and exact XR v2 assets', () => {
  assert.match(syncSource, /agentic-graph-chat-stream-sw\.js/)
  assert.match(syncSource, /agentic-graph-service-worker-revision\.js/)
  assert.match(syncSource, /isBrowserRuntimeArtifactRelativePath/)
  assert.match(syncSource, /XR_V2_MIRRORED_IGNORE_RELATIVE_PATH/)
  assert.match(syncSource, /XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS/)
  const expectedRuntimePaths = [
    'xr-v2/models/depth-anything-v2-small/config.json',
    'xr-v2/models/depth-anything-v2-small/preprocessor_config.json',
    'xr-v2/models/depth-anything-v2-small/onnx/model_q4f16.onnx',
    'xr-v2/wasm/ort-wasm-simd-threaded.mjs',
    'xr-v2/wasm/ort-wasm-simd-threaded.wasm',
  ]
  assert.deepEqual(XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS, expectedRuntimePaths)
  assert.deepEqual(XR_V2_LEGACY_MIRROR_RELATIVE_PATHS, expectedRuntimePaths.map(relativePath => `content/knowgrph/${relativePath}`))
  assert.equal(XR_V2_MIRRORED_IGNORE_RELATIVE_PATH, 'xr-v2/.gitignore')
})

test('XR v2 root and canonical routes precede the agentic-graph SPA fallback', () => {
  const rootRoute = '/xr-v2/* /content/agentic-graph/xr-v2/:splat 200'
  const canonicalRoute = '/agentic-graph/xr-v2/* /content/agentic-graph/xr-v2/:splat 200'
  const fallback = '/agentic-graph/* /content/agentic-graph/index.html 200'
  const redirects = buildAgenticGraphRedirects({
    existing: ['/agentic-graph/imports/* /content/agentic-graph/imports/:splat 200', fallback, ''].join('\n'),
    rootFiles: [],
  })
  assert.ok(redirects.includes(rootRoute))
  assert.ok(redirects.includes(canonicalRoute))
  assert.ok(redirects.indexOf(rootRoute) < redirects.indexOf(fallback))
  assert.ok(redirects.indexOf(canonicalRoute) < redirects.indexOf(fallback))
})

test('legacy routes bootstrap into a finite canonical compatibility boundary', () => {
  const legacyRedirects = [
    '# Legacy knowgrph -> agenticgraph rebrand redirects',
    '/knowgrph /agenticgraph 301',
    '/knowgrph/* /agenticgraph/:splat 301',
    '/agenticgraph /content/agenticgraph/index.html 200',
    '/agenticgraph/assets/* /content/agenticgraph/assets/:splat 200',
    '/agenticgraph/imports/* /content/agenticgraph/imports/:splat 200',
    '# BEGIN agenticgraph generated top-level file routes',
    '/agenticgraph/share/* /agenticgraph/share/:splat 200',
    '# END agenticgraph generated top-level file routes',
    '/agenticgraph/* /content/agenticgraph/index.html 200',
    '',
  ].join('\n')
  const rootFiles = ['agentic-graph-chat-stream-sw.js', 'manifest.webmanifest']
  const redirects = buildAgenticGraphRedirects({ existing: legacyRedirects, rootFiles })
  assert.match(redirects, /# BEGIN agentic-graph generated namespace routes/)
  assert.match(redirects, /\/agenticgraph \/agentic-graph 301/)
  assert.match(redirects, /\/knowgrph \/agentic-graph 301/)
  assert.match(redirects, /\/agenticgraph\/agenticgraph-chat-stream-sw\.js \/agentic-graph\/agentic-graph-chat-stream-sw\.js 301/)
  assert.match(redirects, /\/image\/agenticgraph\/video-frame\/\* \/image\/agentic-graph\/video-frame\/:splat 301/)
  assert.match(redirects, /\/agentic-graph \/content\/agentic-graph\/index\.html 200/)
  assert.doesNotMatch(redirects, /\/agenticgraph\/assets\/\* .* 200/)
  assert.doesNotMatch(redirects, /# BEGIN agenticgraph generated/)
  assert.equal(buildAgenticGraphRedirects({ existing: redirects, rootFiles }), redirects)
})
