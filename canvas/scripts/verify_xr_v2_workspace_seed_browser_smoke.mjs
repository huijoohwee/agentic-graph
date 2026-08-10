import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const storageApiVersion = '2026-05-04'
const storageFixture = {
  blobs: new Map(),
  documents: new Map(),
  events: [],
}
const storageKey = (workspaceId, canonicalPath) => `${workspaceId}:${canonicalPath}`
const readFrozenSourceEvidence = () => Object.freeze({
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  status: execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { encoding: 'utf8' }),
})
const jsonBody = value => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})

async function installExistingStorageFixture(scope) {
  await scope.route('**/__kg_fs_write', async route => {
    storageFixture.events.push('workspace-file-write')
    await route.fulfill(jsonBody({ ok: true }))
  })
  await scope.route('**/api/storage/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const blobPrefix = '/api/storage/blob/'
    const documentPrefix = '/api/storage/doc/'
    const exportPrefix = '/api/storage/export/'
    if (url.pathname.startsWith(blobPrefix)) {
      const [workspaceIdPart = '', canonicalPathPart = ''] = url.pathname.slice(blobPrefix.length).split('/')
      const workspaceId = decodeURIComponent(workspaceIdPart)
      const canonicalPath = decodeURIComponent(canonicalPathPart)
      const key = storageKey(workspaceId, canonicalPath)
      if (method === 'POST') {
        const bytes = request.postDataBuffer() || Buffer.alloc(0)
        const contentType = request.headers()['content-type'] || 'application/octet-stream'
        const contentHash = request.headers()['x-knowgrph-content-hash']
          || `sha256:${createHash('sha256').update(bytes).digest('hex')}`
        const publicPath = `${blobPrefix}${encodeURIComponent(workspaceId)}/${encodeURIComponent(canonicalPath)}`
        storageFixture.blobs.set(key, { bytes, contentType, contentHash, publicPath })
        storageFixture.events.push(`blob-upload:${canonicalPath}`)
        await route.fulfill(jsonBody({
          ok: true,
          apiVersion: storageApiVersion,
          workspaceId,
          canonicalPath,
          objectKey: `workspaces/${encodeURIComponent(workspaceId)}/${canonicalPath}`,
          publicPath,
          contentType,
          contentHash,
          sizeBytes: bytes.byteLength,
          etag: `fixture-${bytes.byteLength}`,
          uploadedAtMs: Date.now(),
        }))
        return
      }
      const stored = storageFixture.blobs.get(key)
      if (!stored) {
        await route.fulfill({ status: 404, body: 'not found' })
        return
      }
      storageFixture.events.push(`blob-read:${canonicalPath}`)
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': stored.contentType,
          'content-length': String(stored.bytes.byteLength),
        },
        body: method === 'HEAD' ? '' : stored.bytes,
      })
      return
    }
    if (url.pathname.startsWith(documentPrefix) && method === 'GET') {
      const [workspaceIdPart = '', canonicalPathPart = ''] = url.pathname.slice(documentPrefix.length).split('/')
      const workspaceId = decodeURIComponent(workspaceIdPart)
      const canonicalPath = decodeURIComponent(canonicalPathPart)
      const document = storageFixture.documents.get(storageKey(workspaceId, canonicalPath))
      storageFixture.events.push(`manifest-read:${canonicalPath}`)
      await route.fulfill(document
        ? { status: 200, headers: { 'content-type': 'text/markdown' }, body: document.contentMd }
        : { status: 404, body: 'not found' })
      return
    }
    if (url.pathname === '/api/storage/push' && method === 'POST') {
      const payload = request.postDataJSON()
      const acknowledgements = []
      for (const mutation of payload.mutations || []) {
        if (mutation.entity === 'document' && mutation.record?.canonicalPath) {
          const record = { ...mutation.record, deleted: mutation.op === 'delete' || Boolean(mutation.record.deleted) }
          storageFixture.documents.set(storageKey(payload.workspaceId, record.canonicalPath), record)
        }
        acknowledgements.push({
          mutationId: mutation.mutationId,
          recordId: mutation.recordId,
          entity: mutation.entity,
          status: 'applied',
          serverRevision: Number(mutation.record?.revision || 1),
          message: null,
        })
      }
      storageFixture.events.push('manifest-push')
      await route.fulfill(jsonBody({
        ok: true,
        apiVersion: storageApiVersion,
        workspaceId: payload.workspaceId,
        ackCursor: `fixture-push-${Date.now()}`,
        serverTimeMs: Date.now(),
        acknowledgements,
      }))
      return
    }
    if (url.pathname === '/api/storage/pull' && method === 'POST') {
      const payload = request.postDataJSON()
      await route.fulfill(jsonBody({
        ok: true,
        apiVersion: storageApiVersion,
        workspaceId: payload.workspaceId,
        nextCursor: `fixture-pull-${Date.now()}`,
        serverTimeMs: Date.now(),
        changes: { documents: [], documentChunks: [], graphSnapshots: [] },
      }))
      return
    }
    if (url.pathname.startsWith(exportPrefix) && method === 'GET') {
      const workspaceId = decodeURIComponent(url.pathname.slice(exportPrefix.length))
      storageFixture.events.push('manifest-list')
      await route.fulfill(jsonBody({
        ok: true,
        apiVersion: storageApiVersion,
        workspaceId,
        exportedAtMs: Date.now(),
        documents: [...storageFixture.documents.values()],
        documentChunks: [],
        graphSnapshots: [],
      }))
      return
    }
    await route.fulfill({ status: 404, body: 'not found' })
  })
}

const baseUrl = String(process.env.KG_XR_V2_WORKSPACE_SMOKE_BASE_URL || 'http://localhost:4194').replace(/\/+$/u, '')
const sourceEvidenceBefore = readFrozenSourceEvidence()
assert.equal(sourceEvidenceBefore.status, '', 'workspace browser proof requires a clean frozen source commit')
const executablePath = findLocalChromiumExecutable(process.env.KG_XR_V2_CHROMIUM_EXECUTABLE, chromium.executablePath())
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-gpu-vsync',
  ],
})
const context = await browser.newContext({ permissions: [] })
await installExistingStorageFixture(context)
const page = await context.newPage()
const browserErrors = []
let secondContext = null
const coldStartTimeoutMs = 90_000
page.on('pageerror', error => browserErrors.push(error.message))
try {
  await page.goto(`${baseUrl}/knowgrph/?openEditorWorkspace=1`, {
    waitUntil: 'domcontentloaded',
    timeout: coldStartTimeoutMs,
  })
  const sourceFiles = page.getByRole('navigation', { name: 'Source files', exact: true })
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
  try {
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-kg-xr-v2-authoring-runtime="1"]')
      const readinessNode = document.querySelector('[data-kg-xr-v2-workspace-readiness="1"]')
      const tier = readinessNode?.getAttribute('data-kg-xr-v2-capability-tier') || ''
      const ecsEvidence = readinessNode?.querySelector('[data-kg-xr-v2-ac="AC-6"]')
        ?.getAttribute('data-kg-xr-v2-ac-local-evidence')
      const materialEvidence = readinessNode?.querySelector('[data-kg-xr-v2-ac="AC-7"]')
        ?.getAttribute('data-kg-xr-v2-ac-local-evidence')
      const ready = node?.getAttribute('data-kg-xr-v2-ecs-status') === 'ready'
        && Number(node?.getAttribute('data-kg-xr-v2-ecs-entity-count') || 0) >= 2
        && readinessNode?.getAttribute('data-kg-xr-v2-probe-status') === 'ready'
        && ['webxr-ar', 'webxr-vr', 'pseudo-ar-depth-parallax', 'flat-fallback'].includes(tier)
        && ecsEvidence === 'browser-observed'
        && materialEvidence === 'browser-observed'
      globalThis.__kgXrV2StableReadinessFrames = ready
        ? Number(globalThis.__kgXrV2StableReadinessFrames || 0) + 1
        : 0
      return globalThis.__kgXrV2StableReadinessFrames >= 12
    }, undefined, { timeout: coldStartTimeoutMs })
  } catch (error) {
    const state = await page.evaluate(() => {
      const node = document.querySelector('[data-kg-xr-v2-authoring-runtime="1"]')
      const readinessNode = document.querySelector('[data-kg-xr-v2-workspace-readiness="1"]')
      return {
        ecsStatus: node?.getAttribute('data-kg-xr-v2-ecs-status') ?? null,
        ecsEntityCount: node?.getAttribute('data-kg-xr-v2-ecs-entity-count') ?? null,
        probeStatus: readinessNode?.getAttribute('data-kg-xr-v2-probe-status') ?? null,
        tier: readinessNode?.getAttribute('data-kg-xr-v2-capability-tier') ?? null,
        ac6: readinessNode?.querySelector('[data-kg-xr-v2-ac="AC-6"]')?.getAttribute('data-kg-xr-v2-ac-local-evidence') ?? null,
        ac7: readinessNode?.querySelector('[data-kg-xr-v2-ac="AC-7"]')?.getAttribute('data-kg-xr-v2-ac-local-evidence') ?? null,
      }
    })
    const mountedEvidence = await page.evaluate(async () => (
      await import('/src/features/xr-v2/mountedAuthoringEvidence.ts')
    ).readMountedAuthoringEvidence())
    throw new Error(`XR v2 cold readiness timeout: ${JSON.stringify({ state, mountedEvidence, browserErrors, sourceEvidenceBefore, sourceEvidenceNow: readFrozenSourceEvidence() })}`, { cause: error })
  }
  assert.equal(await runtime.getAttribute('data-kg-xr-v2-scene-ready'), 'true')
  assert.ok(await runtime.getAttribute('data-kg-xr-v2-readiness'))
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-camera-auto-request'), 'false')
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-sensor-auto-request'), 'false')
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-immersive-auto-request'), 'false')
  assert.equal(await readiness.getAttribute('data-kg-xr-v2-physical-certification'), 'external-required')
  const indexedDbProbe = readiness.locator('[data-kg-xr-v2-browser-api="indexedDb"]')
  assert.equal(await indexedDbProbe.count(), 1, 'missing real IndexedDB readiness preflight')
  assert.equal(await indexedDbProbe.getAttribute('data-kg-xr-v2-browser-api-available'), 'true')
  assert.equal(
    await readiness.locator('[data-kg-xr-v2-ac="AC-4"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),
    'not-observed',
    'saved-asset viewer evidence must stay closed before user capture/playback',
  )
  assert.equal(
    await readiness.locator('[data-kg-xr-v2-ac="AC-6"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),
    'browser-observed',
  )
  assert.equal(
    await readiness.locator('[data-kg-xr-v2-ac="AC-7"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),
    'browser-observed',
  )
  const startCamera = page.locator('[data-kg-motion-control-start="1"]')
  const stopCamera = page.locator('[data-kg-motion-control-stop="1"]')
  const enableSensors = page.locator('[data-kg-motion-control-enable-sensors="1"]')
  const disableSensors = page.locator('[data-kg-motion-control-disable-sensors="1"]')
  const spatialCapture = page.locator('[data-kg-xr-v2-spatial-capture="1"]')
  const startSpatialCapture = page.locator('[data-kg-xr-v2-spatial-capture-start="1"]')
  const stopSpatialCapture = page.locator('[data-kg-xr-v2-spatial-capture-stop="1"]')
  const immersiveSession = page.locator('[data-kg-xr-v2-immersive-session]')
  const enterImmersive = page.locator('[data-kg-xr-v2-immersive-enter="1"]')
  const deliveryValidation = page.locator('[data-kg-xr-v2-delivery-validation="1"]')
  const crossDevicePanel = page.locator('[data-kg-xr-v2-cross-device-panel="1"]')
  const publishCrossDevice = page.locator('[data-kg-xr-v2-cross-device-publish="1"]')
  const listCrossDevice = page.locator('[data-kg-xr-v2-cross-device-list="1"]')
  const readCrossDevice = page.locator('[data-kg-xr-v2-cross-device-read="1"]')
  const runPackaging = page.locator('[data-kg-xr-v2-ac-11-run="1"]')
  const runConnectedPreview = page.locator('[data-kg-xr-v2-ac-12-run="1"]')
  for (const control of [startCamera, stopCamera, enableSensors, disableSensors]) {
    assert.equal(await control.count(), 1, 'camera and sensor actions must be separate controls')
  }
  assert.equal(await startSpatialCapture.count(), 1, 'missing explicit spatial capture action')
  assert.equal(await stopSpatialCapture.count(), 1, 'missing explicit spatial save action')
  assert.equal(await immersiveSession.count(), 1, 'missing tier-gated immersive session action')
  assert.equal(await enterImmersive.count(), 1, 'missing explicit immersive entry action')
  assert.equal(await deliveryValidation.count(), 1, 'missing explicit browser delivery validation actions')
  assert.equal(await crossDevicePanel.count(), 1, 'missing existing Asset Contract Writer preview')
  assert.equal(await publishCrossDevice.count(), 1, 'missing explicit cross-device publish action')
  assert.equal(await listCrossDevice.count(), 1, 'missing explicit shared catalog action')
  assert.equal(await readCrossDevice.count(), 1, 'missing explicit verified reopen action')
  assert.equal(await runPackaging.count(), 1, 'missing explicit AC-11 package/play action')
  assert.equal(await runConnectedPreview.count(), 1, 'missing explicit AC-12 connected-preview action')
  assert.equal(await deliveryValidation.getAttribute('data-kg-xr-v2-saved-asset-scope'), 'local-first-explicit-existing-storage')
  assert.equal(
    await deliveryValidation.getAttribute('data-kg-xr-v2-cross-device-blocker'),
    'shared-storage-auth-and-server-digest-not-enforced',
  )
  assert.equal(await crossDevicePanel.getAttribute('data-kg-xr-v2-cross-device-network-on-mount'), 'false')
  assert.equal(await crossDevicePanel.getAttribute('data-kg-xr-v2-cross-device-production-ready'), 'false')
  assert.equal(
    await crossDevicePanel.getAttribute('data-kg-xr-v2-cross-device-blocker'),
    'shared-storage-auth-and-server-digest-not-enforced',
  )
  assert.equal(await deliveryValidation.getAttribute('data-kg-xr-v2-ac-11-evidence'), 'not-observed')
  assert.equal(await deliveryValidation.getAttribute('data-kg-xr-v2-ac-12-evidence'), 'not-observed')
  assert.equal(
    await page.locator('[data-kg-canvas-xr-mode="1"]').count(),
    0,
    'generic XR session controls must stay unmounted while the pinned XR v2 owner is active',
  )
  assert.equal(await panel.getAttribute('data-kg-motion-control-runtime'), 'off')
  assert.equal(await panel.getAttribute('data-kg-motion-control-device-sensors'), 'off')
  assert.equal(await spatialCapture.getAttribute('data-kg-xr-v2-spatial-capture-phase'), 'idle')
  assert.equal(await spatialCapture.getAttribute('data-kg-xr-v2-spatial-camera-requested'), 'false')
  assert.equal(await spatialCapture.getAttribute('data-kg-xr-v2-spatial-sensors-requested'), 'false')
  assert.equal(await immersiveSession.getAttribute('data-kg-xr-v2-immersive-permission-requested'), 'false')
  assert.equal(await startCamera.isDisabled(), false)
  assert.equal(await stopCamera.isDisabled(), true)
  assert.equal(await enableSensors.isDisabled(), false)
  assert.equal(await disableSensors.isDisabled(), true)
  assert.equal(await startSpatialCapture.isDisabled(), true)
  assert.equal(await stopSpatialCapture.isDisabled(), true)
  const capabilityTier = await readiness.getAttribute('data-kg-xr-v2-capability-tier')
  if (capabilityTier === 'webxr-ar' || capabilityTier === 'webxr-vr') {
    assert.equal(await immersiveSession.getAttribute('data-kg-xr-v2-immersive-tier-admitted'), 'true')
  } else {
    assert.equal(await immersiveSession.getAttribute('data-kg-xr-v2-immersive-tier-admitted'), 'false')
    assert.equal(await enterImmersive.isDisabled(), true)
  }
  assert.equal(await runPackaging.isDisabled(), true, 'AC-11 must require an opened persisted capture')
  assert.equal(await publishCrossDevice.isDisabled(), true, 'shared publish must require an explicitly opened asset')
  assert.equal(await listCrossDevice.isDisabled(), false, 'shared listing is an explicit available action')
  assert.equal(await readCrossDevice.isDisabled(), true, 'shared reopen must require an explicitly selected manifest')

  await startCamera.click()
  await page.waitForFunction(() => {
    const spatialStart = document.querySelector('[data-kg-xr-v2-spatial-capture-start="1"]')
    const panelNode = document.querySelector('[data-kg-motion-control-floating-panel="1"]')
    return spatialStart instanceof HTMLButtonElement
      && !spatialStart.disabled
      && ['loading-model', 'running'].includes(panelNode?.getAttribute('data-kg-motion-control-runtime') || '')
  }, undefined, { timeout: coldStartTimeoutMs })
  assert.equal(await panel.getAttribute('data-kg-motion-control-device-sensors'), 'off')
  await page.evaluate(async () => {
    const runtime = await import('/src/features/xr-v2/xrV2SpatialCaptureRuntime.ts')
    const transitions = [runtime.readXrV2SpatialCapture()]
    globalThis.__kgXrV2SpatialCaptureTransitions = transitions
    globalThis.__kgXrV2SpatialCaptureUnsubscribe?.()
    globalThis.__kgXrV2SpatialCaptureUnsubscribe = runtime.subscribeXrV2SpatialCapture(() => {
      transitions.push(runtime.readXrV2SpatialCapture())
      if (transitions.length > 64) transitions.shift()
    })
  })
  await startSpatialCapture.click()
  try {
    await page.waitForFunction(() => (
      document.querySelector('[data-kg-xr-v2-spatial-capture="1"]')
        ?.getAttribute('data-kg-xr-v2-spatial-capture-phase') === 'saved'
    ), undefined, { timeout: coldStartTimeoutMs })
  } catch (error) {
    const state = await spatialCapture.evaluate(node => {
      const video = node.querySelector('video')
      const stream = video instanceof HTMLVideoElement && video.srcObject instanceof MediaStream
        ? video.srcObject
        : null
      return {
        phase: node.getAttribute('data-kg-xr-v2-spatial-capture-phase'),
        message: node.querySelector('[role="status"]')?.textContent?.trim() || null,
        rawFrameCount: node.querySelector('[data-kg-xr-v2-spatial-raw-frame-count]')?.textContent || null,
        cameraSourceAvailable: !node.querySelector('[data-kg-xr-v2-spatial-capture-camera-gate="start-camera-first"]'),
        cameraTrackStates: stream?.getVideoTracks().map(track => track.readyState) || [],
        transitions: globalThis.__kgXrV2SpatialCaptureTransitions || [],
      }
    })
    throw new Error(`XR v2 spatial capture did not save: ${JSON.stringify(state)}`, { cause: error })
  }
  assert.equal(await stopCamera.isDisabled(), false)
  await stopCamera.click()
  await page.waitForFunction(() => (
    document.querySelector('[data-kg-motion-control-floating-panel="1"]')
      ?.getAttribute('data-kg-motion-control-runtime') === 'off'
  ), undefined, { timeout: coldStartTimeoutMs })
  assert.equal(await panel.getAttribute('data-kg-motion-control-device-sensors'), 'off')

  await page.reload({ waitUntil: 'domcontentloaded' })
  const reloadedSourceFiles = page.getByRole('navigation', { name: 'Source files', exact: true })
  await reloadedSourceFiles.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const reloadedDocs = reloadedSourceFiles.getByRole('button', { name: 'Folder docs', exact: true })
  const reloadedSeeds = reloadedSourceFiles.getByRole('button', { name: 'Folder workspace-seeds', exact: true })
  if (!await reloadedSeeds.isVisible()) await reloadedDocs.click()
  const reloadedSeedRow = reloadedSourceFiles.getByRole('button', {
    name: 'File knowgrph-ar-vr-xr-runtime-readiness-demo.md',
    exact: true,
  })
  if (!await reloadedSeedRow.isVisible()) await reloadedSeeds.click()
  await reloadedSeedRow.click()
  const reloadedReadiness = page.locator('[data-kg-xr-v2-workspace-readiness="1"]')
  await reloadedReadiness.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const savedAsset = page.locator('[data-kg-xr-v2-saved-asset]').first()
  await savedAsset.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const savedAssetId = await savedAsset.getAttribute('data-kg-xr-v2-saved-asset')
  assert.ok(savedAssetId, 'fresh reload must list the persisted capture')
  await savedAsset.locator('[data-kg-xr-v2-saved-asset-open="1"]').click()
  await page.waitForFunction(() => {
    const viewer = document.querySelector('[data-kg-xr-v2-saved-asset-viewer]')
    const ac4 = document.querySelector('[data-kg-xr-v2-ac="AC-4"]')
    return viewer?.getAttribute('data-kg-xr-v2-saved-asset-observed') === 'true'
      && ac4?.getAttribute('data-kg-xr-v2-ac-local-evidence') === 'browser-observed'
  }, undefined, { timeout: coldStartTimeoutMs })
  const savedMetadata = JSON.parse(await page.locator('[data-kg-xr-v2-saved-asset-metadata="1"]').textContent())
  assert.deepEqual(Object.keys(savedMetadata).sort(), [
    'depth_metadata_ref', 'fallback_triggered', 'synthesis_mode', 'xr_capability_tier',
  ])
  const reloadedDelivery = page.locator('[data-kg-xr-v2-delivery-validation="1"]')
  assert.equal(await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-11-source-asset'), savedAssetId)
  assert.equal(await runPackaging.isDisabled(), false, 'AC-11 requires persisted captured frames after reload')
  assert.equal(await publishCrossDevice.isDisabled(), false, 'explicit existing-storage publish requires the opened capture')
  const publishEventStart = storageFixture.events.length
  await publishCrossDevice.click()
  await page.waitForFunction(() => (
    document.querySelector('[data-kg-xr-v2-cross-device-panel="1"]')
      ?.getAttribute('data-kg-xr-v2-cross-device-phase') !== 'publishing'
  ), undefined, { timeout: coldStartTimeoutMs })
  const publishState = await page.locator('[data-kg-xr-v2-cross-device-panel="1"]').evaluate(node => ({
    phase: node.getAttribute('data-kg-xr-v2-cross-device-phase'),
    message: node.querySelector('[role="status"]')?.textContent?.trim() || null,
  }))
  assert.equal(publishState.phase, 'ready', `explicit publish failed closed: ${JSON.stringify({
    publishState,
    events: storageFixture.events.slice(publishEventStart),
    browserErrors,
  })}`)
  const publishEvents = storageFixture.events.slice(publishEventStart)
  const blobUploads = publishEvents
    .map((event, index) => event.startsWith('blob-upload:') ? index : -1)
    .filter(index => index >= 0)
  const manifestPush = publishEvents.lastIndexOf('manifest-push')
  assert.equal(blobUploads.length, 2, 'explicit publish must upload raw and frame-bundle parts')
  assert.ok(manifestPush > Math.max(...blobUploads), 'deterministic manifest must publish after all blob parts')
  assert.ok([...storageFixture.documents.values()].some(document => (
    document.contentMd.includes(String(savedAssetId))
  )), 'existing storage fixture must contain the pushed deterministic manifest')
  await runPackaging.click()
  await page.waitForFunction(() => (
    document.querySelector('[data-kg-xr-v2-delivery-validation="1"]')
      ?.getAttribute('data-kg-xr-v2-ac-11-evidence') === 'browser-observed'
  ), undefined, { timeout: coldStartTimeoutMs })
  assert.equal(
    await readiness.locator('[data-kg-xr-v2-ac="AC-11"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),
    'browser-observed',
  )
  assert.equal(
    await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-11-source-track-producer'),
    'captured-frame-bundle-webcodecs',
  )
  assert.match(
    await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-11-raw-clip-sha256') || '',
    /^sha256:[0-9a-f]{64}$/u,
  )
  assert.equal(await runConnectedPreview.isDisabled(), false, 'AC-12 action must be available after authored scene readiness')
  await runConnectedPreview.click()
  await page.waitForFunction(() => (
    document.querySelector('[data-kg-xr-v2-delivery-validation="1"]')
      ?.getAttribute('data-kg-xr-v2-ac-12-evidence') === 'browser-observed'
      || document.querySelector('[data-kg-xr-v2-delivery-validation="1"]')
        ?.getAttribute('data-kg-xr-v2-ac-12-evidence') === 'failed'
  ), undefined, { timeout: coldStartTimeoutMs })
  assert.equal(
    await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-12-evidence'),
    'browser-observed',
    await page.locator('[aria-label="AC-12 connected preview action"] [role="status"]').textContent(),
  )
  assert.equal(
    await readiness.locator('[data-kg-xr-v2-ac="AC-12"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),
    'browser-observed',
  )
  assert.equal(await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-12-authoring-edit-revision'), '1')
  assert.ok(
    Number(await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-12-author-rendered-at-ms')) > 0,
    'AC-12 must originate from a rendered mounted-authoring edit',
  )
  assert.equal(await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-12-viewer-render-revision'), '1')
  const connectedViewer = page.locator('[data-kg-xr-v2-connected-viewer-surface="1"]')
  assert.equal(await connectedViewer.getAttribute('data-kg-xr-v2-preview-revision'), '1')

  secondContext = await browser.newContext({ permissions: [] })
  await installExistingStorageFixture(secondContext)
  const secondPage = await secondContext.newPage()
  const secondBrowserErrors = []
  secondPage.on('pageerror', error => secondBrowserErrors.push(error.message))
  await secondPage.goto(`${baseUrl}/knowgrph/?openEditorWorkspace=1`, {
    waitUntil: 'domcontentloaded',
    timeout: coldStartTimeoutMs,
  })
  const secondSourceFiles = secondPage.getByRole('navigation', { name: 'Source files', exact: true })
  await secondSourceFiles.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const secondDocs = secondSourceFiles.getByRole('button', { name: 'Folder docs', exact: true })
  const secondSeeds = secondSourceFiles.getByRole('button', { name: 'Folder workspace-seeds', exact: true })
  if (!await secondSeeds.isVisible()) await secondDocs.click()
  const secondSeedRow = secondSourceFiles.getByRole('button', {
    name: 'File knowgrph-ar-vr-xr-runtime-readiness-demo.md', exact: true,
  })
  if (!await secondSeedRow.isVisible()) await secondSeeds.click()
  await secondSeedRow.click()
  const secondCrossPanel = secondPage.locator('[data-kg-xr-v2-cross-device-panel="1"]')
  await secondCrossPanel.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const secondPublish = secondPage.locator('[data-kg-xr-v2-cross-device-publish="1"]')
  const secondList = secondPage.locator('[data-kg-xr-v2-cross-device-list="1"]')
  const secondRead = secondPage.locator('[data-kg-xr-v2-cross-device-read="1"]')
  assert.equal(await secondPublish.isDisabled(), true, 'fresh client has no local asset to publish')
  assert.equal(await secondList.isDisabled(), false, 'fresh client may explicitly refresh shared manifests')
  assert.equal(await secondRead.isDisabled(), true, 'fresh client must select a verified manifest before reopen')
  await secondList.click()
  await secondPage.waitForFunction(() => (
    document.querySelector('[data-kg-xr-v2-cross-device-panel="1"]')
      ?.getAttribute('data-kg-xr-v2-cross-device-phase') === 'ready'
      && document.querySelectorAll('select[aria-label="Shared XR asset manifest"] option').length > 0
  ), undefined, { timeout: coldStartTimeoutMs })
  assert.equal(await secondRead.isDisabled(), false, 'verified shared manifest must enable explicit reopen')
  await secondRead.click()
  await secondPage.waitForFunction(assetId => {
    const panel = document.querySelector('[data-kg-xr-v2-cross-device-panel="1"]')
    const asset = document.querySelector(`[data-kg-xr-v2-saved-asset="${CSS.escape(String(assetId))}"]`)
    return panel?.getAttribute('data-kg-xr-v2-cross-device-phase') === 'ready' && Boolean(asset)
  }, savedAssetId, { timeout: coldStartTimeoutMs })
  await secondPage.waitForFunction(() => (
    document.querySelector('[data-kg-xr-v2-saved-asset-viewer]')
      ?.getAttribute('data-kg-xr-v2-saved-asset-observed') === 'true'
  ), undefined, { timeout: coldStartTimeoutMs })
  const secondMotion = secondPage.locator('[data-kg-motion-control-floating-panel="1"]')
  const secondImmersive = secondPage.locator('[data-kg-xr-v2-immersive-session]')
  assert.equal(await secondMotion.getAttribute('data-kg-motion-control-runtime'), 'off')
  assert.equal(await secondMotion.getAttribute('data-kg-motion-control-device-sensors'), 'off')
  assert.equal(await secondImmersive.getAttribute('data-kg-xr-v2-immersive-permission-requested'), 'false')
  assert.ok(storageFixture.events.includes('manifest-list'))
  assert.equal(storageFixture.events.filter(event => event.startsWith('blob-read:')).length, 2)
  assert.deepEqual(secondBrowserErrors, [])
  await secondContext.close()
  secondContext = null
  const reloadedPanel = page.locator('[data-kg-motion-control-floating-panel="1"]')
  const reloadedImmersive = page.locator('[data-kg-xr-v2-immersive-session]')
  assert.equal(await reloadedPanel.getAttribute('data-kg-motion-control-runtime'), 'off')
  assert.equal(await reloadedPanel.getAttribute('data-kg-motion-control-device-sensors'), 'off')
  assert.equal(await reloadedImmersive.getAttribute('data-kg-xr-v2-immersive-permission-requested'), 'false')
  assert.deepEqual(browserErrors, [])
  assert.deepEqual(readFrozenSourceEvidence(), sourceEvidenceBefore, 'source commit changed during browser proof')
  console.log('XR v2 Explorer-selected source-authored workspace seed browser smoke passed')
} finally {
  if (secondContext) await secondContext.close()
  await context.close()
  await browser.close()
}
