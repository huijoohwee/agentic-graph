import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const read = (...parts) => fs.readFileSync(path.resolve(repoRoot, ...parts), 'utf8')
const rootAgentReadyFunction = read('cloudflare', 'pages', 'root-agent-ready-index.mjs')
const productionFidelityScript = read('scripts', 'verify-production-fidelity.mjs')
const productionMirrorArtifactScript = read('scripts', 'production-mirror-artifact.mjs')
const releaseWorkflow = read('.github', 'workflows', 'release.yml')

test('apex Home has one canonical shell and a real Pages not-found boundary', () => {
  assert.doesNotMatch(rootAgentReadyFunction, /rootHtmlResponse|rootNoscriptFallbackMarkup|loadWebMcpScript/)
  assert.doesNotMatch(rootAgentReadyFunction, /data-kg-live-canvas-launch|<iframe class="live-canvas"/)
  assert.match(rootAgentReadyFunction, /throw new Error\("canonical agentic-graph app shell is invalid"\)/)
  for (const pattern of [
    /missing assets must not resolve through the apex Home app shell/,
    /missingResponse\.status, 404/,
    /'\/index\.html'/,
    /'\/hackamap\/'/,
    /the Pages 404 boundary must preserve the sibling Singabldr app/,
    /\/singabldr\/manifest\.webmanifest/,
    /\/singabldr\/sw\.js/,
  ]) assert.match(productionFidelityScript, pattern)
  for (const pattern of [/'404\.html'/, /productionMirrorArtifactDeletionEntries/, /XR_V2_LEGACY_MIRROR_RELATIVE_PATHS/]) {
    assert.match(productionMirrorArtifactScript, pattern)
  }
  assert.match(releaseWorkflow, /huijoohwee\/404\.html/)
})

test('production fidelity smokes both XR v2 config routes before browser launch', () => {
  for (const fragment of [
    '/xr-v2/models/depth-anything-v2-small/config.json',
    '/agentic-graph/xr-v2/models/depth-anything-v2-small/config.json',
    'XR v2 config route bodies must be byte-identical',
    "model_type, 'depth_anything'",
  ]) assert.ok(productionFidelityScript.includes(fragment))
  assert.ok(productionFidelityScript.indexOf('await verifyXrV2DepthConfigRoutes()') < productionFidelityScript.indexOf('chromium.launch'))
})
