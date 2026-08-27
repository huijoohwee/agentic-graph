import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const baseUrl = String(
  process.env.AG_XR_SPATIAL_CAPTURE_SMOKE_BASE_URL || 'http://localhost:4192',
).replace(/\/+$/, '')
const smokeUrl = `${baseUrl}/__smoke__/xr-spatial-capture-fallback`
const outputDirectory = resolve(process.cwd(), '../data/outputs')
const evidencePath = resolve(outputDirectory, 'xr-spatial-capture-fallback-browser-smoke.json')

function readSourceEvidence() {
  return {
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceBranch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() || null,
    mainRevision: execFileSync('git', ['rev-parse', 'refs/remotes/origin/main'], { encoding: 'utf8' }).trim(),
  }
}

async function main() {
  const executablePath = findLocalChromiumExecutable(
    process.env.AG_XR_SPATIAL_CAPTURE_CHROMIUM_EXECUTABLE,
  )
  const browser = await chromium.launch({
    headless: process.env.AG_XR_SPATIAL_CAPTURE_HEADLESS !== '0',
    ...(executablePath ? { executablePath } : {}),
  })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    const globalNavigator = globalThis.navigator
    if (globalNavigator?.mediaDevices) {
      Object.defineProperty(globalNavigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => ({ getTracks: () => [], getVideoTracks: () => [], getAudioTracks: () => [] }),
      })
    } else if (globalNavigator) {
      Object.defineProperty(globalNavigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [], getAudioTracks: () => [] }),
        },
      })
    }
    Object.defineProperty(globalNavigator, 'xr', {
      configurable: true,
      value: undefined,
    })
  })
  const page = await context.newPage()
  try {
    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-kg-xr-spatial-capture-smoke-page="1"]').first().waitFor({
      state: 'attached',
      timeout: 60_000,
    })
    const spatialCaptureChrome = page.locator('[data-kg-canvas-xr-surface-kind="spatial-capture"]').first()
    await spatialCaptureChrome.waitFor({ state: 'attached', timeout: 30_000 })
    const fallbackAction = page.locator('[data-kg-canvas-xr-fallback-action="open-motion-control"]').first()
    await fallbackAction.waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(
      () => {
        const node = document.querySelector('[data-kg-canvas-xr-surface-kind="spatial-capture"]')
        return node?.getAttribute('data-kg-canvas-xr-entry-mode') === 'monocular-capture'
      },
      { timeout: 30_000 },
    )
    const evidence = await spatialCaptureChrome.evaluate(node => ({
      status: node.getAttribute('data-kg-canvas-xr-status'),
      entryMode: node.getAttribute('data-kg-canvas-xr-entry-mode'),
      recommendedEntryMode: node.getAttribute('data-kg-canvas-xr-recommended-entry-mode'),
      immersiveViewer: node.getAttribute('data-kg-canvas-xr-immersive-viewer'),
      inlineViewer: node.getAttribute('data-kg-canvas-xr-inline-viewer'),
      monocularCapture: node.getAttribute('data-kg-canvas-xr-monocular-capture'),
      captureMotion: node.getAttribute('data-kg-canvas-xr-capture-motion'),
      nativeHandoff: node.getAttribute('data-kg-canvas-xr-native-handoff'),
      reasonCodes: node.getAttribute('data-kg-canvas-xr-capability-reasons'),
      surfaceKind: node.getAttribute('data-kg-canvas-xr-surface-kind'),
    }))
    const fallbackEvidence = await fallbackAction.evaluate(node => ({
      fallbackAction: node.getAttribute('data-kg-canvas-xr-fallback-action'),
      fallbackLabel: node.textContent?.trim() || '',
    }))
    assert.equal(evidence.surfaceKind, 'spatial-capture')
    assert.equal(evidence.entryMode, 'monocular-capture')
    assert.equal(evidence.recommendedEntryMode, 'monocular-capture')
    assert.equal(evidence.immersiveViewer, '0')
    assert.equal(evidence.inlineViewer, '1')
    assert.equal(evidence.monocularCapture, '1')
    assert.match(String(evidence.reasonCodes || ''), /\bimmersive_viewer_unavailable\b/)
    assert.equal(fallbackEvidence.fallbackAction, 'open-motion-control')
    assert.equal(fallbackEvidence.fallbackLabel, 'Open camera capture')
    await fallbackAction.click()
    const routedOwnerEvidence = await page.evaluate(async () => {
      const [{ readSpatialCapturePrimaryMode }, { motionControlCaptureSurfaceCurrentlyOpen }] = await Promise.all([
        import('/src/features/three/xrSpatialCaptureTools.ts'),
        import('/src/features/three/motionControlSurfaceRuntime.ts'),
      ])
      return {
        primaryModeAfterAction: readSpatialCapturePrimaryMode(),
        motionControlSurfaceOpen: motionControlCaptureSurfaceCurrentlyOpen(),
      }
    })
    assert.equal(routedOwnerEvidence.primaryModeAfterAction, 'capture')
    assert.equal(routedOwnerEvidence.motionControlSurfaceOpen, true)
    const fullEvidence = {
      schema: 'agenticgraph-xr-spatial-capture-browser-smoke/v1',
      route: smokeUrl,
      ...readSourceEvidence(),
      ...evidence,
      ...fallbackEvidence,
      ...routedOwnerEvidence,
    }
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(evidencePath, `${JSON.stringify(fullEvidence, null, 2)}\n`, 'utf8')
    console.log(`[xr-spatial-capture-fallback-browser-smoke] PASS ${evidencePath}`)
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
