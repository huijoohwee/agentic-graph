import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const baseUrl = String(process.env.KG_XR_V2_WORKSPACE_SMOKE_BASE_URL || 'http://localhost:4194').replace(/\/+$/u, '')
const executablePath = findLocalChromiumExecutable()
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
})
const context = await browser.newContext({ permissions: [] })
const page = await context.newPage()
const browserErrors = []
const coldStartTimeoutMs = 90_000
page.on('pageerror', error => browserErrors.push(error.message))
try {
  await page.goto(`${baseUrl}/knowgrph/`, { waitUntil: 'domcontentloaded' })
  const sourceFiles = page.getByRole('navigation', { name: 'Source files' })
  await sourceFiles.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const docsFolder = sourceFiles.getByRole('button', { name: 'Folder docs', exact: true })
  await docsFolder.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const workspaceSeedsFolder = sourceFiles.getByRole('button', {
    name: 'Folder workspace-seeds',
    exact: true,
  })
  if (!await workspaceSeedsFolder.isVisible()) await docsFolder.click()
  await workspaceSeedsFolder.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const seedRow = sourceFiles.getByRole('button', {
    name: 'File knowgrph-ar-vr-xr-runtime-readiness-demo.md',
    exact: true,
  })
  if (!await seedRow.isVisible()) await workspaceSeedsFolder.click()
  await seedRow.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  assert.equal(
    await page.locator('[data-kg-xr-v2-authoring-runtime="1"]').count(),
    0,
    'XR v2 must remain inactive until the actual Explorer seed row is selected',
  )
  await seedRow.click()

  const panel = page.locator('[data-kg-motion-control-floating-panel="1"]')
  await panel.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const runtime = page.locator('[data-kg-xr-v2-authoring-runtime="1"]')
  await runtime.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const readiness = page.locator('[data-kg-xr-v2-workspace-readiness="1"]')
  await readiness.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const threeCanvas = page.locator('[data-kg-three-canvas-owner="1"]')
  await threeCanvas.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const xrStage = page.locator('[data-kg-xr-document-loaded="1"]')
  await xrStage.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-kg-xr-v2-authoring-runtime="1"]')
    const readinessNode = document.querySelector('[data-kg-xr-v2-workspace-readiness="1"]')
    const tier = readinessNode?.getAttribute('data-kg-xr-v2-capability-tier') || ''
    return node?.getAttribute('data-kg-xr-v2-ecs-status') === 'ready'
      && Number(node?.getAttribute('data-kg-xr-v2-ecs-entity-count') || 0) >= 2
      && readinessNode?.getAttribute('data-kg-xr-v2-probe-status') === 'ready'
      && ['webxr-ar', 'webxr-vr', 'pseudo-ar-depth-parallax', 'flat-fallback'].includes(tier)
  }, undefined, { timeout: coldStartTimeoutMs })
  assert.equal(await runtime.getAttribute('data-kg-xr-v2-scene-ready'), 'true')
  assert.ok(await runtime.getAttribute('data-kg-xr-v2-readiness'))
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-camera-auto-request'), 'false')
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-sensor-auto-request'), 'false')
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-immersive-auto-request'), 'false')
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-physical-certification'), 'external-required')
  const startCamera = page.locator('[data-kg-motion-control-start="1"]')
  const stopCamera = page.locator('[data-kg-motion-control-stop="1"]')
  const enableSensors = page.locator('[data-kg-motion-control-enable-sensors="1"]')
  const disableSensors = page.locator('[data-kg-motion-control-disable-sensors="1"]')
  const spatialCapture = page.locator('[data-kg-xr-v2-spatial-capture="1"]')
  const startSpatialCapture = page.locator('[data-kg-xr-v2-spatial-capture-start="1"]')
  const stopSpatialCapture = page.locator('[data-kg-xr-v2-spatial-capture-stop="1"]')
  for (const control of [startCamera, stopCamera, enableSensors, disableSensors]) {
    assert.equal(await control.count(), 1, 'camera and sensor actions must be separate controls')
  }
  assert.equal(await startSpatialCapture.count(), 1, 'missing explicit spatial capture action')
  assert.equal(await stopSpatialCapture.count(), 1, 'missing explicit spatial save action')
  assert.equal(await panel.getAttribute('data-kg-motion-control-runtime'), 'off')
  assert.equal(await panel.getAttribute('data-kg-motion-control-device-sensors'), 'off')
  assert.equal(await spatialCapture.getAttribute('data-kg-xr-v2-spatial-capture-phase'), 'idle')
  assert.equal(await spatialCapture.getAttribute('data-kg-xr-v2-spatial-camera-requested'), 'false')
  assert.equal(await spatialCapture.getAttribute('data-kg-xr-v2-spatial-sensors-requested'), 'false')
  assert.equal(await startCamera.isDisabled(), false)
  assert.equal(await stopCamera.isDisabled(), true)
  assert.equal(await enableSensors.isDisabled(), false)
  assert.equal(await disableSensors.isDisabled(), true)
  assert.equal(await startSpatialCapture.isDisabled(), true)
  assert.equal(await stopSpatialCapture.isDisabled(), true)
  assert.deepEqual(browserErrors, [])
  console.log('XR v2 Explorer-selected source-authored workspace seed browser smoke passed')
} finally {
  await context.close()
  await browser.close()
}
