import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { readExactBrowserSmokeSource } from './lib/exact-browser-smoke-source.mjs'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const baseUrl = String(
  process.env.AG_MOTION_CONTROL_LIVE_CAMERA_BASE_URL || 'http://localhost:4191',
).replace(/\/+$/, '')
const outputDirectory = resolve(process.cwd(), '../data/outputs')
const evidencePath = resolve(outputDirectory, 'motion-control-live-camera-browser-smoke.json')
const proofRoute = `${baseUrl}/__motion-control-live-camera-proof__`

function assertTrackRelease(cameraBeforeStop, cameraAfterStop) {
  assert.equal(cameraBeforeStop.calls, 1, 'production runtime must request one browser camera stream')
  assert.equal(cameraBeforeStop.constraints.audio, false, 'Motion Control camera capture must not request audio')
  assert.ok(cameraBeforeStop.constraints.video, 'Motion Control must request a video capture track')
  assert.equal(cameraBeforeStop.streams.length, 1, 'camera request must resolve to one stream')
  assert.ok(cameraBeforeStop.streams[0].active, 'camera stream must be active during inference')
  assert.ok(cameraBeforeStop.streams[0].tracks.length > 0, 'camera stream must contain a track')
  assert.ok(
    cameraBeforeStop.streams[0].tracks.every(track => track.readyState === 'live'),
    'camera tracks must be live during inference',
  )
  assert.equal(cameraAfterStop.streams[0].active, false, 'camera stream must be inactive after Stop')
  assert.ok(
    cameraAfterStop.streams[0].tracks.every(track => track.readyState === 'ended'),
    'every camera track must be ended after Stop',
  )
}

async function main() {
  const source = readExactBrowserSmokeSource('AG_MOTION_CONTROL_LIVE_CAMERA')
  const executablePath = findLocalChromiumExecutable(
    process.env.AG_MOTION_CONTROL_LIVE_CAMERA_CHROMIUM_EXECUTABLE,
  )
  const browser = await chromium.launch({
    headless: process.env.AG_MOTION_CONTROL_LIVE_CAMERA_HEADLESS !== '0',
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  })
  const context = await browser.newContext()
  await context.grantPermissions(['camera'], { origin: baseUrl })
  await context.route(proofRoute, route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <main id="proof">Motion Control camera proof</main>
      <script type="module">
        import RefreshRuntime from '/@react-refresh'
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => type => type
        window.__vite_plugin_react_preamble_installed__ = true
      </script>
    </body></html>`,
  }))
  await context.addInitScript(() => {
    const streams = []
    let calls = 0
    let constraints = null
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices) return
    const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices)
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async requestedConstraints => {
        calls += 1
        constraints = requestedConstraints
        const stream = await getUserMedia(requestedConstraints)
        streams.push(stream)
        return stream
      },
    })
    Object.defineProperty(globalThis, '__kgReadLiveCameraProof', {
      configurable: false,
      value: () => ({
        calls,
        constraints,
        streams: streams.map(stream => ({
          active: stream.active,
          tracks: stream.getTracks().map(track => {
            const settings = track.getSettings()
            return {
              enabled: track.enabled,
              kind: track.kind,
              muted: track.muted,
              readyState: track.readyState,
              settings: {
                aspectRatio: settings.aspectRatio,
                frameRate: settings.frameRate,
                height: settings.height,
                width: settings.width,
              },
            }
          }),
        })),
      }),
    })
  })
  const page = await context.newPage()
  const captureRequests = []
  let capturePhase = false
  page.on('request', request => {
    if (!capturePhase) return
    captureRequests.push({ method: request.method(), url: request.url() })
  })
  const assetResponses = []
  page.on('response', response => {
    if (!response.url().includes('/litert/')) return
    assetResponses.push({ status: response.status(), url: response.url() })
  })
  try {
    await page.goto(proofRoute, { waitUntil: 'domcontentloaded' })
    capturePhase = true
    const result = await page.evaluate(async () => {
      const runtime = await import('/src/features/three/motionControlRuntime.ts')
      const platform = await import('/src/features/three/motionControlCapturePlatformBridge.ts')
      const motionControl = await import('/src/features/three/motionControlMcpRuntime.ts')
      const surfaces = await import('/src/features/three/motionControlSurfaceRuntime.ts')
      const permissionBeforeStart = await navigator.permissions.query({ name: 'camera' }).then(value => value.state)
      const startInvocation = motionControl.buildMotionControlInvocation('start', 'wasm')
      const stopInvocation = motionControl.buildMotionControlInvocation('stop')
      let beforeStop
      let captureBeforeStop
      let cameraBeforeStop
      let surfaceOpened = false
      try {
        const startResult = await motionControl.controlLocalMotionControl({ invocation: startInvocation })
        if (!startResult.ok) throw new Error(startResult.message)
        surfaceOpened = surfaces.motionControlCaptureSurfaceCurrentlyOpen()
        if (!surfaceOpened) throw new Error('Canonical XR Motion Control surface did not open.')
        const deadline = performance.now() + 90_000
        while (performance.now() < deadline) {
          const current = runtime.readMotionControlSnapshot()
          if (current.phase === 'error') throw new Error(current.message)
          if (current.phase === 'running' && current.latencyMs > 0) break
          await new Promise(resolvePromise => setTimeout(resolvePromise, 50))
        }
        beforeStop = runtime.readMotionControlSnapshot()
        captureBeforeStop = platform.inspectMotionControlCapturePlatform()
        cameraBeforeStop = globalThis.__kgReadLiveCameraProof?.()
        if (beforeStop.phase !== 'running' || beforeStop.latencyMs <= 0) {
          throw new Error('Timed out before the production camera frame completed LiteRT inference.')
        }
      } finally {
        await motionControl.controlLocalMotionControl({ invocation: stopInvocation })
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
      const afterStop = runtime.readMotionControlSnapshot()
      const captureAfterStop = platform.inspectMotionControlCapturePlatform()
      const invocationContract = motionControl.inspectLocalMotionControl()
      const permissionAfterStop = await navigator.permissions.query({ name: 'camera' }).then(value => value.state)
      return {
        afterStop,
        beforeStop,
        cameraAfterStop: globalThis.__kgReadLiveCameraProof?.(),
        cameraBeforeStop,
        captureAfterStop: {
          builtInSourceActive: captureAfterStop.bridge.builtInSourceActive,
          sourceCount: captureAfterStop.sources.length,
        },
        captureBeforeStop: {
          builtInSourceActive: captureBeforeStop.bridge.builtInSourceActive,
          captureTimestampMs: captureBeforeStop.sources[0]?.latestObservation?.captureTimestampMs ?? null,
          missing: captureBeforeStop.sources[0]?.latestObservation?.missing ?? null,
          sourceCount: captureBeforeStop.sources.length,
        },
        permissionAfterStop,
        permissionBeforeStart,
        startInvocation,
        stopInvocation,
        surfaceOpened,
        webMcpTools: invocationContract.webMcpTools,
      }
    })
    assert.equal(result.surfaceOpened, true)
    assert.equal(result.startInvocation, '/motion.control @canvas #pose operation=start backend=wasm')
    assert.equal(result.stopInvocation, '/motion.control @canvas #pose operation=stop')
    assert.equal(result.webMcpTools.inspect, 'agenticgraph.inspect_local_motion_control')
    assert.equal(result.webMcpTools.control, 'agenticgraph.control_local_motion_control')
    assert.equal(result.permissionBeforeStart, 'granted')
    assert.equal(result.permissionAfterStop, 'granted')
    assert.equal(result.beforeStop.phase, 'running')
    assert.equal(result.beforeStop.permission, 'granted')
    assert.equal(result.beforeStop.cameraActive, true)
    assert.equal(result.beforeStop.modelId, 'google-blazepose-ghum-full-float16')
    assert.equal(result.beforeStop.effectiveBackend, 'wasm')
    assert.ok(result.beforeStop.latencyMs > 0, 'a real camera frame must complete LiteRT inference')
    assert.equal(result.captureBeforeStop.builtInSourceActive, true)
    assert.equal(result.captureBeforeStop.sourceCount, 1)
    assert.ok(Number.isFinite(result.captureBeforeStop.captureTimestampMs))
    assert.equal(result.afterStop.phase, 'off')
    assert.equal(result.afterStop.cameraActive, false)
    assert.equal(result.afterStop.effectiveBackend, 'none')
    assert.equal(result.afterStop.pose, null)
    assert.equal(result.captureAfterStop.builtInSourceActive, false)
    assert.equal(result.captureAfterStop.sourceCount, 0)
    assertTrackRelease(result.cameraBeforeStop, result.cameraAfterStop)
    assert.ok(assetResponses.some(response => response.url.endsWith('/litert/pose_landmarks_detector.tflite') && response.status === 200))
    assert.ok(assetResponses.some(response => response.url.endsWith('.wasm') && response.status === 200))
    const stateChangingRequests = captureRequests.filter(request => !['GET', 'HEAD'].includes(request.method))
    const nonLocalRequests = captureRequests.filter(request => new URL(request.url).origin !== new URL(baseUrl).origin)
    assert.deepEqual(stateChangingRequests, [], 'capture must not make state-changing network requests')
    assert.deepEqual(nonLocalRequests, [], 'capture assets and modules must stay on the local proof origin')
    const evidence = {
      schema: 'agenticgraph-motion-control-live-camera-browser-smoke/v1',
      sourceRevision: source.sourceRevision,
      sourceBranch: source.sourceBranch,
      sourceState: source.sourceState,
      route: proofRoute,
      captureDevice: 'chromium-virtual-camera',
      physicalCameraExercised: false,
      permissionAutomation: 'browser-context-grant-and-chromium-fake-ui',
      nativeInvocations: {
        start: result.startInvocation,
        stop: result.stopInvocation,
      },
      webMcpTools: result.webMcpTools,
      fullBodyModelPathExercised: true,
      modelId: result.beforeStop.modelId,
      personDetected: result.beforeStop.pose !== null,
      inference: {
        effectiveBackend: result.beforeStop.effectiveBackend,
        latencyMs: result.beforeStop.latencyMs,
        confidence: result.beforeStop.confidence,
        missing: result.captureBeforeStop.missing,
      },
      captureBeforeStop: result.captureBeforeStop,
      captureAfterStop: result.captureAfterStop,
      mediaBeforeStop: result.cameraBeforeStop,
      mediaAfterStop: result.cameraAfterStop,
      stateChangingNetworkRequestCount: stateChangingRequests.length,
      nonLocalNetworkRequestCount: nonLocalRequests.length,
      assetResponses,
    }
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    console.log(`[motion-control-live-camera-browser-smoke] PASS ${evidencePath}`)
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
