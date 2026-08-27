import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { readExactBrowserSmokeSource } from './lib/exact-browser-smoke-source.mjs'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const baseUrl = String(
  process.env.AG_MOTION_CONTROL_LITERT_SMOKE_BASE_URL || 'http://localhost:4189',
).replace(/\/+$/, '')
const outputDirectory = resolve(process.cwd(), '../data/outputs')
const evidencePath = resolve(outputDirectory, 'motion-control-litert-browser-smoke.json')

async function main() {
  const source = readExactBrowserSmokeSource('AG_MOTION_CONTROL_LITERT')
  const executablePath = findLocalChromiumExecutable(
    process.env.AG_MOTION_CONTROL_LITERT_CHROMIUM_EXECUTABLE,
  )
  const browser = await chromium.launch({
    headless: process.env.AG_MOTION_CONTROL_LITERT_HEADLESS !== '0',
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
    assert.equal(evidence.schema, 'agenticgraph-motion-control-litert-readiness/v1')
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
      schema: 'agenticgraph-motion-control-litert-browser-smoke/v1',
      sourceRevision: source.sourceRevision,
      sourceBranch: source.sourceBranch,
      sourceState: source.sourceState,
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
