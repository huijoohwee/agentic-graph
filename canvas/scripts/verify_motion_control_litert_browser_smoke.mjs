import assert from 'node:assert/strict'
import { accessSync, constants as fsConstants } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = String(
  process.env.KG_MOTION_CONTROL_LITERT_SMOKE_BASE_URL || 'http://localhost:4189',
).replace(/\/+$/, '')
const expectedHead = String(process.env.KG_MOTION_CONTROL_LITERT_EXPECTED_HEAD || '').trim()
const expectedBranch = String(process.env.KG_MOTION_CONTROL_LITERT_EXPECTED_BRANCH || '').trim()
const expectedMain = String(process.env.KG_MOTION_CONTROL_LITERT_EXPECTED_MAIN || '').trim()
const outputDirectory = resolve(process.cwd(), '../data/outputs')
const evidencePath = resolve(outputDirectory, 'motion-control-litert-browser-smoke.json')

function findLocalChromiumExecutable() {
  const explicit = String(process.env.KG_MOTION_CONTROL_LITERT_CHROMIUM_EXECUTABLE || '').trim()
  const candidates = [
    explicit,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // Playwright may still have a compatible bundled browser.
    }
  }
  return null
}

async function main() {
  assert.match(expectedHead, /^[0-9a-f]{40}$/, 'smoke requires the runner-owned exact source revision')
  assert.match(expectedMain, /^[0-9a-f]{40}$/, 'smoke requires the exact origin/main revision')
  const sourceState = expectedBranch ? 'task-branch' : 'detached-main'
  if (expectedBranch) {
    assert.match(expectedBranch, /^agent\/[^/]+\/[^/]+$/, 'smoke task branch must be runner-owned')
  } else {
    assert.equal(expectedHead, expectedMain, 'detached smoke must run from exact origin/main')
  }
  const executablePath = findLocalChromiumExecutable()
  const browser = await chromium.launch({
    headless: process.env.KG_MOTION_CONTROL_LITERT_HEADLESS !== '0',
    ...(executablePath ? { executablePath } : {}),
  })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    let cameraRequests = 0
    Object.defineProperty(globalThis, '__kgReadMotionControlCameraRequests', {
      configurable: false,
      value: () => cameraRequests,
    })
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices) return
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        cameraRequests += 1
        throw new DOMException('Camera access is forbidden in the LiteRT readiness smoke.', 'NotAllowedError')
      },
    })
  })
  const page = await context.newPage()
  const assetResponses = []
  page.on('response', response => {
    if (!response.url().includes('/litert/')) return
    assetResponses.push({ url: response.url(), status: response.status() })
  })
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
    const result = await page.evaluate(async () => {
      const readiness = await import('/src/features/three/motionControlLiteRtReadiness.ts')
      const evidence = await readiness.runMotionControlLiteRtReadinessProbe('wasm')
      const cameraRequests = globalThis.__kgReadMotionControlCameraRequests?.() ?? -1
      return { evidence, cameraRequests }
    })
    const evidence = result.evidence
    assert.equal(evidence.schema, 'knowgrph-motion-control-litert-readiness/v1')
    assert.equal(evidence.modelId, 'google-blazepose-ghum-full-float16')
    assert.equal(evidence.requestedBackend, 'wasm')
    assert.equal(evidence.effectiveBackend, 'wasm')
    assert.equal(evidence.fullyAccelerated, false)
    assert.equal(evidence.inferenceCount, 1)
    assert.equal(evidence.finiteOutputValues, true)
    assert.equal(evidence.cameraCaptureRequested, false)
    assert.deepEqual(evidence.inputShape, [1, 256, 256, 3])
    for (const shape of [[1, 195], [1, 117], [1, 1]]) {
      assert.ok(
        evidence.outputShapes.some(outputShape => JSON.stringify(outputShape) === JSON.stringify(shape)),
        `real pose model must expose output shape ${shape.join('x')}`,
      )
    }
    assert.ok(evidence.outputElementCounts.every(count => count > 0))
    assert.equal(result.cameraRequests, 0, 'camera-free readiness smoke must never request getUserMedia')
    assert.ok(assetResponses.some(response => response.url.endsWith('/litert/pose_landmarks_detector.tflite') && response.status === 200))
    assert.ok(assetResponses.some(response => response.url.endsWith('.wasm') && response.status === 200))
    const fullEvidence = {
      ...evidence,
      schema: 'knowgrph-motion-control-litert-browser-smoke/v1',
      sourceRevision: expectedHead,
      sourceBranch: expectedBranch || null,
      sourceState,
      route: `${baseUrl}/`,
      cameraRequests: result.cameraRequests,
      assetResponses,
    }
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(evidencePath, `${JSON.stringify(fullEvidence, null, 2)}\n`, 'utf8')
    console.log(`[motion-control-litert-browser-smoke] PASS ${evidencePath}`)
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
