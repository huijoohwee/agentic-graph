import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (relativePath: string): string => readFileSync(resolve(REPOSITORY_ROOT, relativePath), 'utf8')

test('XR v2 workspace seed is the mandatory browser-local mount authority', () => {
  const seed = read('docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md')
  assert.match(seed, /^runtime_status: "browser-local-runtime-ready"$/mu)
  assert.match(seed, /^pinned_contract_status: "partial"$/mu)
  assert.match(seed, /^browser_local_mount_status: "mounted-after-explorer-selection"$/mu)
  assert.match(seed, /^kgCanvasSurfaceMode: "3d"$/mu)
  assert.match(seed, /^kgCanvasRenderMode: "3d"$/mu)
  assert.match(seed, /^kgCanvas3dMode: "3d"$/mu)
  assert.match(seed, /^shared_xr_scene:\n {2}source_authority: "\/docs\/workspace-seeds\/knowgrph-physics-playground-demo\.md"$/mu)
  assert.match(seed, /^ {2}world_ownership: "overlay-only"$/mu)
  assert.match(seed, /^ {2}renderer_owner: "canvas\/src\/lib\/three\/ThreeGraph\.impl\.tsx"$/mu)
  assert.match(seed, /^ {2}second_r3f_canvas_forbidden: true$/mu)
  assert.match(
    seed,
    /^ {2}validation_seed_path: "\/docs\/workspace-seeds\/knowgrph-ar-vr-xr-runtime-readiness-demo\.md"$/mu,
  )
  assert.doesNotMatch(seed, /^ {2}env_selector:/mu)
  assert.match(seed, /^ {2}physical_device_certification: "external-required"$/mu)
  assert.match(seed, /^ {2}camera: "user-enable-disable"$/mu)
  assert.match(seed, /^ {2}sensors: "user-enable-disable"$/mu)

  const activationRuntime = read('canvas/src/features/canvas/XrV2RunReadyDemoRuntime.tsx')
  assert.match(activationRuntime, /useSourceFilesBootstrapReady/u)
  assert.match(activationRuntime, /if \(!sourceFilesBootstrapReady\) return/u)
  assert.match(
    activationRuntime,
    /if \(store\.canvasRenderMode !== '3d' \|\| store\.canvas3dMode !== 'xr'\) \{\s*activateXrSceneSurface\(\{ preserveGameplay: false \}\)\s*\/\/ Let the shared Canvas finish its mode transition before readiness\s*\/\/ subscribes to mounted evidence from that exact surface\.\s*return\s*\}/u,
  )

  const pinned = readFileSync(
    resolve(REPOSITORY_ROOT, 'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md'),
  )
  assert.equal(
    createHash('sha256').update(pinned).digest('hex'),
    '9dfcb6b55a5cb510177f0108ebccedace5d640390dbeef4d69a63f1e89edb6ea',
  )
})

test('XR v2 workspace smoke activates only through the actual Explorer row', () => {
  const runner = read('canvas/scripts/run_xr_v2_workspace_seed_browser_smoke.mjs')
  const verifier = read('canvas/scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs')
  assert.doesNotMatch(runner, /VITE_KNOWGRPH_RUN_READY_DEMO/u)
  assert.match(verifier, /openEditorWorkspace=1/u)
  assert.match(verifier, /getByRole\('navigation', \{ name: 'Source files', exact: true \}\)/u)
  assert.match(verifier, /name: 'Folder docs'/u)
  assert.match(verifier, /name: 'Folder workspace-seeds'/u)
  assert.match(verifier, /name: 'File knowgrph-ar-vr-xr-runtime-readiness-demo\.md'/u)
  const selection = verifier.indexOf('await seedRow.click()')
  const runtimeObservation = verifier.indexOf("const panel = page.locator('[data-kg-motion-control-floating-panel=\"1\"]')")
  assert.ok(selection >= 0, 'workspace smoke must click the Explorer seed row')
  assert.ok(runtimeObservation > selection, 'workspace runtime observation must follow Explorer selection')
  for (const marker of [
    'data-kg-three-canvas-owner',
    'data-kg-xr-document-loaded',
    'data-kg-xr-v2-authoring-runtime',
    'data-kg-motion-control-runtime',
    'data-kg-motion-control-device-sensors',
    'data-kg-motion-control-start',
    'data-kg-motion-control-enable-sensors',
    'data-kg-xr-v2-immersive-enter',
  ]) assert.match(verifier, new RegExp(marker, 'u'))
})

test('XR v2 review browser gate retains comprehensive and Explorer evidence', () => {
  const canvasPackage = JSON.parse(read('canvas/package.json')) as {
    scripts: Record<string, string>
  }
  assert.equal(
    canvasPackage.scripts['test:smoke:xr-v2:browser:comprehensive'],
    'node ./scripts/run_xr_v2_browser_smoke.mjs',
  )
  assert.equal(
    canvasPackage.scripts['test:smoke:xr-v2:browser:workspace-seed'],
    'node ./scripts/run_xr_v2_workspace_seed_browser_smoke.mjs',
  )
  assert.match(
    canvasPackage.scripts['test:smoke:xr-v2:browser'],
    /browser:comprehensive && npm run test:smoke:xr-v2:browser:workspace-seed/u,
  )
})
