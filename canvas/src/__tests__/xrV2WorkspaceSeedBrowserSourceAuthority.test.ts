import { AGENTIC_OS_STORAGE_SYNC_API_VERSION as apiVersion } from '@/lib/storage/agentic-graph-storage-sync-records'
import { validateAgenticGraphStoragePullResponse } from '@/lib/storage/agentic-graph-storage-client-apply'
import { requestAgenticGraphStoragePushWithRetry } from '@/lib/storage/agentic-graph-storage-client-push'
import { exportAgenticGraphStorageWorkspace } from '@/lib/storage/agentic-graph-storage-client-export'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (relativePath: string): string => readFileSync(resolve(REPOSITORY_ROOT, relativePath), 'utf8')
const yamlScalar = (key: string, value: string): RegExp => {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`^${key}: "?${escapedValue}"?$`, 'mu')
}
const indentedYamlScalar = (key: string, value: string): RegExp => {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`^ {2}${key}: "?${escapedValue}"?$`, 'mu')
}

test('XR v2 workspace seed is the mandatory browser-local mount authority', () => {
  const seed = read('docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md')
  assert.match(seed, yamlScalar('runtime_status', 'browser-local-runtime-ready'))
  assert.match(seed, yamlScalar('pinned_contract_status', 'partial'))
  assert.match(seed, yamlScalar('browser_local_mount_status', 'mounted-after-explorer-selection'))
  assert.match(seed, yamlScalar('kgCanvasSurfaceMode', '3d'))
  assert.match(seed, yamlScalar('kgCanvasRenderMode', '3d'))
  assert.match(seed, yamlScalar('kgCanvas3dMode', '3d'))
  assert.match(seed, /^shared_xr_scene:\n {2}source_authority: "?\/docs\/workspace-seeds\/agentic-graph-physics-playground-demo\.md"?$/mu)
  assert.match(seed, indentedYamlScalar('world_ownership', 'overlay-only'))
  assert.match(seed, indentedYamlScalar('renderer_owner', 'canvas/src/lib/three/ThreeGraph.impl.tsx'))
  assert.match(seed, /^ {2}second_r3f_canvas_forbidden: true$/mu)
  assert.match(
    seed,
    /^ {2}validation_seed_path: "?\/docs\/workspace-seeds\/agentic-graph-ar-vr-xr-runtime-readiness-demo\.md"?$/mu,
  )
  assert.doesNotMatch(seed, /^ {2}env_selector:/mu)
  assert.match(seed, indentedYamlScalar('physical_device_certification', 'external-required'))
  assert.match(seed, indentedYamlScalar('camera', 'user-enable-disable'))
  assert.match(seed, indentedYamlScalar('sensors', 'user-enable-disable'))

  const activationRuntime = read('canvas/src/features/canvas/XrV2RunReadyDemoRuntime.tsx')
  assert.match(activationRuntime, /useSourceFilesBootstrapReady/u)
  assert.match(activationRuntime, /if \(!sourceFilesBootstrapReady\) return/u)
  assert.match(
    activationRuntime,
    /if \(store\.canvasRenderMode !== '3d' \|\| store\.canvas3dMode !== 'xr'\) \{\s*activateXrSceneSurface\(\{ preserveGameplay: false \}\)\s*\/\/ Let the shared Canvas finish its mode transition before readiness\s*\/\/ subscribes to mounted evidence from that exact surface\.\s*return\s*\}/u,
  )

  const pinned = readFileSync(
    resolve(REPOSITORY_ROOT, 'docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr-mvp-gtm.md'),
  )
  assert.equal(
    createHash('sha256').update(pinned).digest('hex'),
    '5067f019a099a94ec02d3f7581963cf2c514ab46bf5a853020df8dfe85d5ef45',
  )
})

test('XR v2 workspace smoke activates only through the actual Explorer row', () => {
  const runner = read('canvas/scripts/run_xr_v2_workspace_seed_browser_smoke.mjs')
  const verifier = read('canvas/scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs')
  assert.doesNotMatch(runner, /VITE_AGENTIC_OS_RUN_READY_DEMO/u)
  assert.match(verifier, /openEditorWorkspace=1/u)
  assert.match(verifier, /getByRole\('navigation', \{ name: 'Source files', exact: true \}\)/u)
  assert.match(verifier, /name: 'Folder docs'/u)
  assert.match(verifier, /name: 'Folder workspace-seeds'/u)
  assert.match(verifier, /name: 'File agentic-graph-ar-vr-xr-runtime-readiness-demo\.md'/u)
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
  assert.match(verifier, /data-kg-xr-camera-aspect-mask/u)
  assert.match(verifier, /data-kg-camera-optics-source="camera-canvas"/u)
})

test('XR v2 workspace seed keeps only the native XR camera composition', () => {
  const aspectMask = read('canvas/src/features/three/XrCameraAspectMask.tsx')
  const controls = read('canvas/src/features/three/Controls.tsx')
  const framing = read('canvas/src/features/three/cameraFramingControlsRuntime.ts')
  const playback = read('canvas/src/features/three/xrCameraPlaybackControlsRuntime.ts')

  assert.match(aspectMask, /isXrV2RunReadyDemoActive/u)
  assert.match(aspectMask, /if \(!settings \|\| xrV2NativeCompositionOnly\) return null/u)
  assert.match(controls, /isXrV2RunReadyDemoActive\(markdownDocumentName, markdownDocumentText\)/u)
  assert.match(controls, /baseEnabled: !paused && !choreographyOwnsCamera && !immersiveMediaActive && !xrV2NativeCompositionOnly/u)
  assert.match(controls, /nativeCompositionOnly: xrV2NativeCompositionOnly/u)
  assert.match(framing, /sharedCameraFramingEnabled = isSharedCameraFramingSurfaceMode\(mode\) && !nativeCompositionOnly/u)
  assert.match(framing, /!sharedCameraFramingEnabled/u)
  assert.match(playback, /!nativeCompositionOnly && xrChoreographyCanDriveCamera/u)
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
    'npm run prepare:litert-assets && npm run prepare:xr-v2-depth-assets && node ./scripts/run_xr_v2_workspace_seed_browser_smoke.mjs',
  )
  assert.match(
    canvasPackage.scripts['test:smoke:xr-v2:browser'],
    /browser:workspace-seed && npm run test:smoke:xr-v2:browser:comprehensive/u,
  )
})

test('XR storage fixture replies satisfy the owning sync and export clients before browser launch', async () => {
  const { createXrV2ExistingStorageFixture } = await import('../../scripts/lib/xr-v2-existing-storage-fixture.mjs')
  const { storageFixture, installExistingStorageFixture } = createXrV2ExistingStorageFixture()
  const routes = new Map<string, (route: unknown) => Promise<void>>()
  await installExistingStorageFixture({ route: async (pattern: string, handler: (route: unknown) => Promise<void>) => {
    routes.set(pattern, handler)
  } })
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let reply: { status: number; headers?: Record<string, string>; body: string } | undefined
    const request = new Request(url, init)
    const bytes = Buffer.from(await request.arrayBuffer())
    await routes.get('**/api/storage/**')!({
      request: () => ({ url: () => request.url, method: () => request.method,
        postDataJSON: () => JSON.parse(bytes.toString()), postDataBuffer: () => bytes,
        headers: () => Object.fromEntries(request.headers.entries()) }),
      fulfill: async (value: typeof reply) => { reply = value },
    })
    assert.ok(reply, 'fixture must produce one explicit response')
    return new Response(reply.body, { status: reply.status, headers: reply.headers })
  }
  const workspaceId = 'xr-fixture-contract', now = Date.now(), baseUrl = 'http://localhost'
  const record = { id: 'manifest', workspaceId, canonicalPath: 'xr-assets/capture.md',
    title: null, docType: null, lang: null, graphId: null, sourceKind: 'markdown' as const,
    contentHash: 'fixture-hash', parserVersion: 'source-files',
    contentMd: '# Recorded fixture', revision: 1, updatedAtMs: now, deleted: false }
  const mutation = { mutationId: 'publish', workspaceId, recordId: record.id, entity: 'document' as const,
    op: 'upsert' as const, baseRevision: null, record }
  const pushed = await requestAgenticGraphStoragePushWithRetry({ workspaceId, deviceId: 'fixture',
    mutations: [mutation], baseUrl, fetchImpl, maxRetryCount: 1, requestTimeoutMs: 1000 })
  assert.equal(pushed.apiVersion, apiVersion)
  assert.ok(Number.isFinite(Date.parse(pushed.ackCursor)))
  assert.deepEqual(pushed.acknowledgements.map(ack => [ack.mutationId, ack.status, ack.serverRevision]), [['publish', 'applied', 1]])
  const pulled = await (await fetchImpl(`${baseUrl}/api/storage/pull`, { method: 'POST',
    body: JSON.stringify({ apiVersion, workspaceId, deviceId: 'fixture', since: null, knownChunks: [] }) })).json()
  validateAgenticGraphStoragePullResponse(pulled, workspaceId)
  assert.throws(() => validateAgenticGraphStoragePullResponse({ ...pulled, nextCursor: 'fixture-pull-1788880000000' }, workspaceId), /cursor/)
  const exported = await exportAgenticGraphStorageWorkspace({ workspaceId, baseUrl, fetchImpl })
  assert.deepEqual(exported.documents, [record])
  assert.deepEqual(storageFixture.events, ['manifest-push', 'manifest-list'])
  await assert.rejects(() => fetchImpl(`${baseUrl}/api/storage/pull`, { method: 'POST',
    body: JSON.stringify({ apiVersion: 'unsupported', workspaceId }) }))
  const fresh = createXrV2ExistingStorageFixture()
  assert.equal(fresh.storageFixture.documents.size, 0, 'separate fixture instances must not share records')
})
