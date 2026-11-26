import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { productionMirrorArtifactEntries } from '../production-mirror-artifact-entries.mjs'
import { MIAOXYZ_SOURCE_PIN } from '../pages-mirror-sync.mjs'

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
  assert.ok(productionMirrorArtifactEntries.includes('404.html'))
  for (const pattern of [/productionMirrorArtifactDeletionEntries/, /XR_V2_LEGACY_MIRROR_RELATIVE_PATHS/]) {
    assert.match(productionMirrorArtifactScript, pattern)
  }
  assert.match(releaseWorkflow, /production-mirror-artifact-entries\.mjs stage/)
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

test('MiaoXYZ Pages output is generated from an exact, pinned source repository revision', () => {
  assert.deepEqual(MIAOXYZ_SOURCE_PIN, {
    repository: 'huijoohwee/MiaoXYZ',
    revision: '58ce56416688594b252b43b376c49b5aa33dc3a3',
  })
  assert.ok(productionMirrorArtifactEntries.includes('content/MiaoXYZ'))
  for (const pattern of [
    /Resolve pinned MiaoXYZ source/,
    /Check out pinned MiaoXYZ source/,
    /repository: huijoohwee\/MiaoXYZ/,
    /ref: '?\$\{\{ steps\.miaoxyz_source\.outputs\.revision \}\}'?/,
    /MIAOXYZ_SOURCE_ROOT:/,
    /MIAOXYZ_SOURCE_REVISION:/,
    /MiaoXYZ source commit:/,
  ]) assert.match(releaseWorkflow, pattern)
})
