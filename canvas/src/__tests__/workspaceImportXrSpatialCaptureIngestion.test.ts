import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchWorkspaceUrlContent, importWorkspaceLocalFiles } from '@/features/markdown-workspace/workspaceImport'
import { peekPendingWorkspaceLocalImport } from '@/features/markdown-workspace/workspaceImport/pendingLocalImport'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { isStandaloneSpatialCaptureManifestText, parseStandaloneSpatialCaptureManifest } from '@/features/markdown-workspace/workspaceImport/spatialCaptureFileset'
import { hasPendingSpatialCaptureAsset, loadSpatialCapturePointCloud, resetSpatialCaptureAssetRuntimeForTests } from '@/lib/assets/spatialCaptureAssetRuntime'
import { parsePlyPointCloud } from '@/lib/assets/plyPointCloud'
import { resolveXrPanelSourceProfile } from '@/features/three/xrPanelModel'
import { inferCorpusMediaKind } from '@/features/queryable-corpus/corpusGraph'
import { resolveLaunchDropdownVisibleExportItems } from '@/lib/toolbar/LaunchDropdownExportMenu'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
const createBinaryFile = (name: string, bytes: Uint8Array, type = 'application/octet-stream') => {
  const blob = new Blob([bytes], { type })
  return new File([blob], name, { type })
}
function createAsciiPlyBytes(): Uint8Array {
  return new TextEncoder().encode([
    'ply',
    'format ascii 1.0',
    'element vertex 3',
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '0 0 0 255 0 0',
    '2 4 6 0 128 255',
    '-2 -4 -6 64 64 64',
    '',
  ].join('\n'))
}
function createBinaryLittleEndianRgbPlyBytes(): Uint8Array {
  const header = new TextEncoder().encode([
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 2',
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '',
  ].join('\n'))
  const rowBytes = 15
  const out = new Uint8Array(header.length + rowBytes * 2)
  out.set(header, 0)
  const view = new DataView(out.buffer)
  let offset = header.length
  for (const point of [
    { xyz: [1, 2, 3] as const, rgb: [255, 64, 0] as const },
    { xyz: [-1, -2, -3] as const, rgb: [0, 128, 255] as const },
  ]) {
    view.setFloat32(offset, point.xyz[0], true)
    view.setFloat32(offset + 4, point.xyz[1], true)
    view.setFloat32(offset + 8, point.xyz[2], true)
    out[offset + 12] = point.rgb[0]
    out[offset + 13] = point.rgb[1]
    out[offset + 14] = point.rgb[2]
    offset += rowBytes
  }
  return out
}
function assertSpatialManifest(text: string, format: 'ply' | 'spz') {
  for (const expected of [
    `kgAssetFormat: "${format}"`,
    `kgSpatialCaptureFormat: "${format}"`,
    'kgSpatialCaptureFileset: false',
    'kgXrIngestionPipeline: "source-manifest"',
    'kgXrIngestionCacheKey:',
    'kgXrRenderCacheKey:',
    'kgXrIngestionStreaming: true',
    'kgCanvas3dMode: "xr"',
  ]) {
    if (!text.includes(expected)) throw new Error(`expected spatial capture manifest to include ${expected}`)
  }
  if (text.includes('ply\nformat ascii')) throw new Error('expected manifest to avoid embedding point-cloud payload text')
}

function hasAbsoluteLocalPlyPath(source: string): boolean {
  return /(?:\/Users\/|\/home\/|[A-Za-z]:\\)[^'"\s]+\.ply/i.test(source)
}

export async function testWorkspaceImportXrStandalonePlyLocalUsesSourceManifestCache() {
  const { restore } = initJsdomHarness()
  try {
    resetSpatialCaptureAssetRuntimeForTests()
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const file = createBinaryFile('scan-neutral.ply', new Uint8Array([112, 108, 121, 10, 102, 111, 114, 109, 97, 116]))
    const res = await importWorkspaceLocalFiles({ fs, files: [file] })
    const path = '/scan-neutral.spatial-capture.md'
    if (res.failed.length || res.skipped.length) throw new Error(`expected clean local PLY import, got ${JSON.stringify({ failed: res.failed, skipped: res.skipped })}`)
    if (res.createdPaths.join('|') !== path) throw new Error(`expected standalone spatial manifest path, got ${res.createdPaths.join(', ')}`)
    const text = String((await fs.readFileText(path)) || '')
    assertSpatialManifest(text, 'ply')
    if (!text.includes('kgSpatialCapturePendingLocalImport: true')) throw new Error('expected local PLY manifest to mark pending payload ownership')
    if (!text.includes('kgSpatialCapturePendingLocalPath: "/scan-neutral.spatial-capture.md"')) throw new Error('expected local PLY manifest to store the neutral pending payload path')
    if (!isStandaloneSpatialCaptureManifestText(text)) throw new Error('expected local PLY manifest to classify as standalone spatial capture')
    const manifest = parseStandaloneSpatialCaptureManifest(text)
    if (!manifest || manifest.format !== 'ply' || !manifest.renderCacheKey || manifest.pendingLocalPath !== path) throw new Error(`expected parsed standalone PLY manifest, got ${JSON.stringify(manifest)}`)
    const pending = peekPendingWorkspaceLocalImport(path)
    if (!pending || pending.kind !== 'ply') throw new Error(`expected local PLY import to retain a pending source file, got ${JSON.stringify(pending)}`)
    if (!hasPendingSpatialCaptureAsset(path)) throw new Error('expected local PLY import to register the spatial capture runtime payload')
    const profile = resolveXrPanelSourceProfile(text)
    if (profile.kind !== 'spatial-capture' || profile.format !== 'ply' || !profile.renderCacheKey) {
      throw new Error(`expected XR source profile with render cache key, got ${JSON.stringify(profile)}`)
    }
    if (res.corpusManifest?.sourceUnits[0]?.status !== 'pending') throw new Error(`expected pending source unit, got ${JSON.stringify(res.corpusManifest)}`)
    if (inferCorpusMediaKind('scan-neutral.ply') !== 'model') throw new Error('expected PLY to classify as model corpus media')
  } finally {
    resetSpatialCaptureAssetRuntimeForTests()
    restore()
  }
}

export async function testWorkspaceImportXrStandalonePlyLocalRuntimeLoadsPendingPayload() {
  const { restore } = initJsdomHarness()
  try {
    resetSpatialCaptureAssetRuntimeForTests()
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const file = createBinaryFile('scan-neutral.ply', createAsciiPlyBytes(), 'model/ply')
    const res = await importWorkspaceLocalFiles({ fs, files: [file] })
    const path = '/scan-neutral.spatial-capture.md'
    if (res.createdPaths.join('|') !== path) throw new Error(`expected standalone spatial manifest path, got ${res.createdPaths.join(', ')}`)
    const manifest = parseStandaloneSpatialCaptureManifest(String((await fs.readFileText(path)) || ''))
    if (!manifest) throw new Error('expected parsed standalone PLY manifest')
    const loaded = await loadSpatialCapturePointCloud(manifest, 10)
    if (!loaded || loaded.source !== 'pending-local' || loaded.pointCloud.pointCount !== 3) {
      throw new Error(`expected runtime to decode pending local PLY payload, got ${JSON.stringify(loaded && { source: loaded.source, points: loaded.pointCloud.pointCount })}`)
    }
  } finally {
    resetSpatialCaptureAssetRuntimeForTests()
    restore()
  }
}

export async function testWorkspaceImportXrStandalonePlyLocalRuntimeLoadsBrowserCacheFallback() {
  const { restore } = initJsdomHarness()
  const globalWithCaches = globalThis as typeof globalThis & { caches?: unknown }
  const originalCaches = globalWithCaches.caches
  const entries = new Map<string, Response>()
  globalWithCaches.caches = {
    open: async () => ({
      put: async (key: string, response: Response) => {
        entries.set(key, response.clone())
      },
      match: async (key: string) => entries.get(key)?.clone(),
      delete: async (key: string) => entries.delete(key),
    } as Partial<Cache> as Cache),
  } as Partial<CacheStorage> as CacheStorage
  try {
    resetSpatialCaptureAssetRuntimeForTests()
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const file = createBinaryFile('scan-neutral.ply', createAsciiPlyBytes(), 'model/ply')
    await importWorkspaceLocalFiles({ fs, files: [file] })
    await new Promise(resolve => setTimeout(resolve, 0))
    resetSpatialCaptureAssetRuntimeForTests()
    const manifest = parseStandaloneSpatialCaptureManifest(String((await fs.readFileText('/scan-neutral.spatial-capture.md')) || ''))
    if (!manifest) throw new Error('expected parsed standalone PLY manifest')
    const loaded = await loadSpatialCapturePointCloud(manifest, 10)
    if (!loaded || loaded.source !== 'browser-cache' || loaded.pointCloud.pointCount !== 3) {
      throw new Error(`expected runtime to decode browser-cached PLY payload, got ${JSON.stringify(loaded && { source: loaded.source, points: loaded.pointCloud.pointCount })}`)
    }
  } finally {
    globalWithCaches.caches = originalCaches
    resetSpatialCaptureAssetRuntimeForTests()
    restore()
  }
}

export async function testWorkspaceImportXrStandalonePlyLocalRuntimeLoadsOperatorSourceRoot() {
  const { dom, restore } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  let fetchedPath = ''
  try {
    resetSpatialCaptureAssetRuntimeForTests()
    dom.window.localStorage.setItem('kgSpatialCaptureSourceRoots', JSON.stringify(['/tmp/kg-spatial-capture-root']))
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedPath = String(input)
      if (!fetchedPath.startsWith('/__kg_local_file?path=') || new URL(fetchedPath, 'http://local.test').searchParams.get('path') !== '/tmp/kg-spatial-capture-root/scan-neutral.ply') {
        return new Response('', { status: 404 })
      }
      return new Response(createAsciiPlyBytes(), { status: 200, headers: { 'content-type': 'model/ply' } })
    }) as typeof fetch
    const manifest = parseStandaloneSpatialCaptureManifest([
      '---',
      'kgAssetType: "model"',
      'kgAssetFormat: "ply"',
      'kgAssetName: "scan-neutral.ply"',
      'kgAssetSource: "local"',
      'kgSpatialCaptureFileset: false',
      'kgSpatialCaptureFormat: "ply"',
      'kgSpatialCaptureSourceKind: "local"',
      'kgSpatialCaptureSourceName: "scan-neutral.ply"',
      'kgSpatialCaptureSourceIdentity: "scan-neutral.ply"',
      'kgSpatialCapturePendingLocalImport: true',
      'kgSpatialCapturePendingLocalPath: "/scan-neutral.spatial-capture.md"',
      'kgXrIngestionCacheKey: "neutral-cache"',
      'kgXrRenderCacheKey: "neutral-cache"',
      'kgCanvas3dMode: "xr"',
      '---',
      '',
    ].join('\n'))
    if (!manifest) throw new Error('expected parsed standalone PLY manifest')
    const loaded = await loadSpatialCapturePointCloud(manifest, 10)
    if (!loaded || loaded.source !== 'local-source' || loaded.pointCloud.pointCount !== 3) {
      throw new Error(`expected operator source root to decode relative local PLY payload, got ${JSON.stringify(loaded && { source: loaded.source, points: loaded.pointCloud.pointCount, fetchedPath })}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    resetSpatialCaptureAssetRuntimeForTests()
    restore()
  }
}

export async function testWorkspaceImportXrStandalonePlyUrlUsesCachedManifestWithoutPayloadFetch() {
  resetWorkspaceUrlContentCacheForTests()
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  globalThis.fetch = (async () => {
    fetchCount += 1
    throw new Error('PLY URL import should not fetch source payload')
  }) as typeof fetch
  try {
    const url = 'https://assets.example.test/scan-neutral.ply'
    const first = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    const second = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    if (fetchCount !== 0) throw new Error(`expected no payload fetch for PLY manifest import, got ${fetchCount}`)
    if (first.name !== 'scan-neutral.spatial-capture.md') throw new Error(`expected manifest name, got ${first.name}`)
    if (first.text !== second.text) throw new Error('expected URL content cache to reuse standalone PLY manifest text')
    assertSpatialManifest(first.text, 'ply')
    if (!isStandaloneSpatialCaptureManifestText(first.text)) throw new Error('expected URL PLY manifest to classify as standalone spatial capture')
    const profile = resolveXrPanelSourceProfile(first.text)
    if (profile.kind !== 'spatial-capture' || profile.format !== 'ply' || !profile.ingestionCacheKey) {
      throw new Error(`expected URL XR source profile with ingestion cache key, got ${JSON.stringify(profile)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export function testWorkspaceImportXrStandalonePlyDoesNotAdvertiseGltfGlbExports() {
  const visible = resolveLaunchDropdownVisibleExportItems({
    markdown: () => void 0,
    png: () => void 0,
    htmlViewer: () => void 0,
  }).map(item => item.id)
  if (visible.includes('gltf') || visible.includes('glb')) {
    throw new Error(`expected PLY manifest export menu to omit GLTF/GLB actions, got ${visible.join(', ')}`)
  }
  const modelVisible = resolveLaunchDropdownVisibleExportItems({
    markdown: () => void 0,
    gltf: () => void 0,
    glb: () => void 0,
  }).map(item => item.id)
  if (!modelVisible.includes('gltf') || !modelVisible.includes('glb')) {
    throw new Error(`expected real model export actions to stay visible, got ${modelVisible.join(', ')}`)
  }
}

export function testWorkspaceImportXrStandalonePlyUsesSpatialRendererInsteadOfGraphFallback() {
  const threeGraph = readFileSync(resolve(process.cwd(), 'src', 'lib', 'three', 'ThreeGraph.impl.tsx'), 'utf8')
  const threeGraphXr = readFileSync(resolve(process.cwd(), 'src', 'lib', 'three', 'ThreeGraphXr.tsx'), 'utf8')
  const minimapSpatialViewCube = readFileSync(resolve(process.cwd(), 'src', 'features', 'minimap', 'MinimapSpatialViewCube.tsx'), 'utf8')
  const controls = ['Controls.tsx', 'cameraFramingControlsRuntime.ts']
    .map(file => readFileSync(resolve(process.cwd(), 'src', 'features', 'three', file), 'utf8')).join('\n')
  const modelAssetCameraPose = readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'modelAssetCameraPose.ts'), 'utf8')
  const stage = [readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'SpatialCaptureManifestStage.tsx'), 'utf8'), readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'spatialCaptureGeometryRuntime.ts'), 'utf8')].join('\n')
  const gaussianMaterial = readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'spatialCaptureGaussianMaterial.ts'), 'utf8')
  const sceneAdmission = threeGraph.match(/const hasRenderableScene = ([^\n]+)/u)?.[1]
  const sceneAdmissionTerms = sceneAdmission?.split('||').map(term => term.trim()) || []
  if (!sceneAdmissionTerms.includes('hasSpatialCaptureManifest')) {
    throw new Error(`expected standalone spatial capture to remain a semantic scene-admission term, got ${sceneAdmission || 'missing admission owner'}`)
  }
  for (const marker of [
    'parseStandaloneSpatialCaptureManifest(canvasMarkdownDocument.text)',
    'if (spatialCaptureManifest) return null',
    '<SpatialCaptureManifestStage',
    "surfaceKind={spatialCaptureManifest ? 'spatial-capture' : 'graph'}",
    'spatialRuntimeStatus={spatialRuntimeStatus}',
    'spatialRuntimeFidelity={spatialRuntimeFidelity}',
    'const spatialCaptureRenderKey = useMemo',
    'handleSpatialCaptureFitChange',
    'modelAssetRenderKey={spatialCaptureRenderKey || glbAssetRenderKey}',
    'modelAssetFit={spatialCaptureRenderKey ? spatialCaptureFit : glbAssetFit}',
  ]) {
    if (!threeGraph.includes(marker)) throw new Error(`expected ThreeGraph to route standalone PLY manifests through spatial stage marker ${marker}`)
  }
  for (const marker of [
    "surfaceKind === 'spatial-capture'", 'data-kg-canvas-xr-surface-kind="spatial-capture"',
    'data-kg-canvas-xr-spatial-runtime={spatialRuntimeStatus}', 'data-kg-canvas-xr-spatial-fidelity={spatialRuntimeFidelity}',
    'XR spatial capture orientation', 'readSpatialCaptureToolLabel(spatialTool)', 'const [spatialTool, setSpatialToolState]',
    'subscribeSpatialCaptureTool(setSpatialToolState)', 'data-kg-canvas-xr-minimap-overlay="1"', '<MinimapSpatialViewCube />',
    "const spatialChrome = surfaceKind === 'spatial-capture'", "if (status === 'checking' || status === 'unsupported') return spatialChrome",
    '{spatialChrome}', 'data-kg-canvas-xr-enter="1"',
  ]) {
    if (!threeGraphXr.includes(marker)) throw new Error(`expected XR entry panel to expose spatial-capture HUD marker ${marker}`)
  }
  for (const staleMarker of ['{mode.slice(0, 1)}', '{tool.slice(0, 1)}', 'data-kg-canvas-xr-center-controls="1"', 'data-kg-canvas-xr-bottom-toolbar="1"', 'data-kg-canvas-xr-left-rail="1"', 'data-kg-canvas-xr-spatial-tool-rail="1"', 'data-kg-canvas-xr-axis-widget="1"', 'data-kg-canvas-xr-axis-gizmo="1"', 'data-kg-canvas-xr-view-cube="1"', 'data-kg-canvas-xr-view-cube-guide="1"']) {
    if (threeGraphXr.includes(staleMarker)) throw new Error(`expected XR spatial chrome to avoid placeholder letter marker ${staleMarker}`)
  }
  for (const marker of [
    'data-kg-minimap-xr-view-cube="1"',
    'data-kg-minimap-xr-view-cube-axis={spatialAxis}',
    'data-kg-minimap-xr-view-cube-guide="1"',
    'kg-minimap-root kg-minimap-xr-view-cube',
    'setSpatialCaptureAxis(axis)',
    'subscribeSpatialCaptureAxis(setSpatialAxisState)',
  ]) {
    if (!minimapSpatialViewCube.includes(marker)) throw new Error(`expected minimap-owned XR view cube marker ${marker}`)
  }
  for (const marker of [
    'applyModelAssetCameraPose({ camera: perspectiveCamera, controls, fit: modelAssetFit, perspectiveCamera })',
    'readModelAssetCameraPose(fit)',
    'viewPinned && !modelAssetMode',
    "req.type === 'fit' || req.type === 'reset'",
    'easeOutCubic01',
    '!key || !modelAssetFit',
  ]) {
    if (!controls.includes(marker)) throw new Error(`expected controls to delegate spatial capture camera marker ${marker}`)
  }
  for (const marker of [
    "'cameraProfile' | 'cameraTarget' | 'floorY'",
    "fit?.cameraProfile === 'spatial-capture'",
    'readCameraTarget(fit.cameraTarget)',
    'fit.floorY',
    'eyeY',
    'targetX + span * 2.2',
    'eyeY + span * 0.9',
    'targetZ + span * 2.65',
  ]) {
    if (!modelAssetCameraPose.includes(marker)) throw new Error(`expected spatial capture camera pose marker ${marker}`)
  }
  for (const marker of [
    'loadSpatialCapturePointCloud(manifest)',
    'await waitForSpatialCapturePreviewFirstPaint()',
    'kg_spatial_capture_gaussian_splats',
    'kg_spatial_capture_manifest_',
    '<mesh',
    'buildGaussianSplatGeometry',
    'resolveWritableReorderAttribute',
    'sliceSpatialCaptureFloatAttribute', 'syncSpatialCaptureGeometryAttributeViews(geometry, load, boundedCount)', 'geometry.userData.kgSpatialCaptureAttributeCount',
    'gaussianSortScratchByGeometry',
    'THREE.InstancedBufferGeometry',
    'THREE.InstancedBufferAttribute',
    'const initialCount = resolveSpatialCaptureInitialInstanceCount(load)', 'geometry.instanceCount = initialCount',
    'advanceSpatialCaptureProgressiveCount(geometry, state.load)',
    'readSpatialCaptureGeometryCount(geometry, state.load) < state.load.pointCloud.pointCount',
    'THREE.NormalBlending',
    'SPATIAL_CAPTURE_BACKGROUND',
    'SPATIAL_CAPTURE_GRID_MAJOR',
    'sourceAnchored',
    'position: sourceAnchored',
    'sourceAnchored ? bounds.min[1] * scale : (bounds.min[1] - bounds.center[1]) * scale',
    'gridPosition',
    "state.load.pointCloud.kind === 'gaussian-splat'",
    'splatScale',
    'splatRotation',
    'SPATIAL_CAPTURE_SORT_BUCKETS',
    'SPATIAL_CAPTURE_SORT_DIRECTION_DOT_MIN',
    'SPATIAL_CAPTURE_SORT_INTERVAL_MS',
    'buildDepthSortedIndex',
    'dotSortDirection',
    'resolveCameraSortDirection',
    'updateGaussianSplatGeometrySort',
    "state.load.pointCloud.kind !== 'gaussian-splat'\n      || paused\n      || !(geometry instanceof THREE.InstancedBufferGeometry)",
    'writeReorderedFloatAttribute',
    'attribute.needsUpdate = true',
    'useFrame(({ clock }) =>',
    'normalizeSortDirection',
    'useThree',
    'buildGaussianSplatMaterial',
    'buildSpatialCaptureFit',
    "cameraProfile: 'spatial-capture'",
    'onFitChange?.(fit)',
    'fit.stageSpan / fit.scale',
    'subscribeSpatialCaptureTool(setSpatialTool)',
    'subscribeSpatialCaptureCenterAction(setSpatialCenterAction)',
    'kg_spatial_capture_sphere_select_volume',
    'ringGeometry args={[radius * 0.994, radius, 144]}',
    'kg_spatial_capture_box_select_volume',
    'hydrateGaussianSplatEditorRuntime',
    'updateGaussianSplatEditorVisibility',
  ]) {
    if (!stage.includes(marker)) throw new Error(`expected parsed spatial capture stage marker ${marker}`)
  }
  for (const forbidden of ['buildSpatialCapturePreviewGeometry', '<pointsMaterial', 'wireframe transparent opacity={0.72}']) {
    if (stage.includes(forbidden)) {
      throw new Error(`expected spatial capture stage to avoid low-fidelity fallback marker ${forbidden}`)
    }
  }
  const legacyStageMarker = (...parts: string[]) => parts.join('')
  for (const forbidden of [
    legacyStageMarker('build', 'Bounds', 'Line', 'Geometry'),
    legacyStageMarker('build', 'Axis', 'Line', 'Geometry'),
    legacyStageMarker('Spatial', 'Capture', 'Center', 'Gizmo'),
    legacyStageMarker('Spatial', 'Capture', 'Axis', 'Arrow'),
    legacyStageMarker('<', 'cone', 'Geometry'),
    legacyStageMarker('<', 'cylinder', 'Geometry'),
    legacyStageMarker('<', 'torus', 'Geometry'),
    legacyStageMarker('Spatial', 'Capture', 'Depth', 'Sort', 'Sync'),
    legacyStageMarker('SPATIAL_CAPTURE_', 'CAMERA_', 'DIRECTION'),
    legacyStageMarker('camera', '.getWorldDirection'),
    legacyStageMarker('geometry.index', '.needsUpdate = true'),
  ]) {
    if (stage.includes(forbidden)) {
      throw new Error(`expected spatial capture stage to remove stale local overlay marker ${forbidden}`)
    }
  }
  for (const marker of [
    'attribute vec3 splatScale',
    'attribute vec4 splatRotation',
    'attribute vec3 splatCenter',
    'depthTest: true',
    'premultipliedAlpha: true',
    'toneMapped: false',
    'splatAlphaPower',
    'splatRadiusScale',
    'uniform vec2 viewportSize',
    'quatToMatrix',
    'projectAxisPixels',
    'vSplatConic',
    'covA * covC - covB * covB',
    'float splatExtent = clamp(sqrt(lambda) * splatRadiusScale',
    'vSplatPixel = corner * splatExtent',
    'gl_Position = centerClip + vec4(clipOffset, 0.0, 0.0)',
    'const float EXP4 = exp(-4.0)',
    'const float INV_EXP4 = 1.0 / (1.0 - EXP4)',
    'power > 4.0',
    'pow(max(0.0, (exp(-power) - EXP4) * INV_EXP4), splatAlphaPower)',
    'alpha < 0.003921569',
    'norm * vSplatAlpha * opacityScale',
    'gl_FragColor = vec4(color * alpha, alpha)',
  ]) {
    if (!gaussianMaterial.includes(marker)) throw new Error(`expected covariance Gaussian material marker ${marker}`)
  }
  const legacyShaderMarker = (...parts: string[]) => parts.join('')
  for (const forbidden of [
    legacyShaderMarker('gl_', 'Point', 'Size'),
    legacyShaderMarker('gl_', 'Point', 'Coord'),
    legacyShaderMarker('dot', '(unit, unit) > 1.0'),
    legacyShaderMarker('power', ' > ', '5.12'),
    legacyShaderMarker('exp(-power)', ' * ', 'vSplatAlpha', ' * ', 'opacityScale'),
  ]) {
    if (gaussianMaterial.includes(forbidden)) {
      throw new Error(`expected Gaussian material to avoid hard-edged circular splat marker ${forbidden}`)
    }
  }
}

export function testWorkspaceImportXrStandalonePlyRuntimeCachesBudgetedLoads() {
  const runtime = [readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'spatialCaptureAssetRuntime.ts'), 'utf8'), readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'spatialCapturePreviewRange.ts'), 'utf8')].join('\n')
  for (const marker of [
    'resolveSpatialCapturePointBudget',
    'DEFAULT_SPATIAL_CAPTURE_POINT_BUDGET',
    'DEFAULT_SPATIAL_CAPTURE_PARSE_POINT_LIMIT',
    'LOW_MEMORY_SPATIAL_CAPTURE_POINT_BUDGET',
    'HIGH_MEMORY_SPATIAL_CAPTURE_POINT_BUDGET',
    'resolveSpatialCaptureParsePointLimit',
    'DEFAULT_SPATIAL_CAPTURE_LOAD_CACHE_ENTRIES',
    'resolveSpatialCaptureLoadCacheEntries',
    'readCachedSpatialCaptureLoad', 'sourceBuffersByKey',
    'loadSpatialCapturePointCloudPreview', 'resolveSpatialCapturePreviewPointBudget',
    'SPATIAL_CAPTURE_PREVIEW_HEADER_BYTES', 'SPATIAL_CAPTURE_PREVIEW_RANGE_CHUNKS',
    'readSpatialCapturePreviewBuffer(manifest, maxPoints)', 'fetchByteRange(target.path, 0, SPATIAL_CAPTURE_PREVIEW_HEADER_BYTES - 1)',
    'buildPreviewRowRanges(layout, maxPoints)', 'readBinaryLayoutOrNull(header.buffer)',
    'parsePlyPointCloud(sourceBuffer.buffer, maxPoints)', 'pruneSpatialCaptureLoadCache', 'pruneSpatialCaptureSourceBufferCache',
    'yieldBeforeHeavyPointCloudParse',
    'pointBudget,',
    'task.catch(() =>',
    'pointCloudLoadsByKey.delete(cacheKey)',
    'SPATIAL_CAPTURE_BROWSER_CACHE_NAME',
    'persistBrowserPayloadCache',
    'readBrowserPayloadCache',
    'resolveBrowserPayloadCacheIdentities',
    'resolveOperatorSourceRootFetchTargets',
    'SPATIAL_CAPTURE_SOURCE_ROOT_STORAGE_KEYS',
    'buildBrowserPayloadCachePath',
  ]) {
    if (!runtime.includes(marker)) throw new Error(`expected spatial capture runtime cache/budget marker ${marker}`)
  }
  if (hasAbsoluteLocalPlyPath(runtime)) {
    throw new Error('expected spatial capture runtime to avoid hardcoded validation asset paths')
  }
}
export function testWorkspaceImportXrStandalonePlyManifestForbidsValidationAssetHardcodes() {
  const sourceFiles = [
    readFileSync(resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'workspaceImport', 'spatialCaptureFileset.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'workspaceImport', 'urlSpatialCaptureContent.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'workspaceImport', 'localImport.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'SpatialCaptureManifestStage.tsx'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'spatialCaptureGaussianMaterial.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'spatialCaptureAssetRuntime.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'plyPointCloud.ts'), 'utf8'),
  ].join('\n')
  if (hasAbsoluteLocalPlyPath(sourceFiles)) {
    throw new Error('expected spatial capture import/render source to avoid hardcoded local PLY validation paths')
  }
  const forbiddenReferenceUrl = ['superspl', 'at/editor'].join('.')
  if (sourceFiles.includes(forbiddenReferenceUrl)) {
    throw new Error(`expected spatial capture import/render source to avoid hardcoded runtime validation token ${forbiddenReferenceUrl}`)
  }
  if (!sourceFiles.includes('kgXrRenderCacheKey') || !sourceFiles.includes('kgXrIngestionCacheKey')) {
    throw new Error('expected spatial capture flow to stay manifest/cache-key owned')
  }
}
export function testWorkspaceImportXrStandalonePlyParserPreservesGeometryAndColor() {
  const ply = [
    'ply',
    'format ascii 1.0',
    'element vertex 3',
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '0 0 0 255 0 0',
    '2 4 6 0 128 255',
    '-2 -4 -6 64 64 64',
    '',
  ].join('\n')
  const cloud = parsePlyPointCloud(new TextEncoder().encode(ply), 10)
  if (cloud.sourcePointCount !== 3 || cloud.pointCount !== 3) throw new Error(`expected all neutral fixture points, got ${JSON.stringify({ source: cloud.sourcePointCount, parsed: cloud.pointCount })}`)
  if (cloud.bounds.maxExtent !== 12 || cloud.bounds.center.join(',') !== '0,0,0') throw new Error(`expected parsed PLY bounds, got ${JSON.stringify(cloud.bounds)}`)
  if (!cloud.colors || cloud.colors[0] !== 1 || cloud.colors[4] < 0.5 || cloud.colors[5] !== 1) {
    throw new Error(`expected parsed PLY colors, got ${cloud.colors ? Array.from(cloud.colors).join(',') : 'none'}`)
  }
  const gaussianSplatPly = [
    'ply',
    'format ascii 1.0',
    'element vertex 1',
    'property float x',
    'property float y',
    'property float z',
    'property float f_dc_0',
    'property float f_dc_1',
    'property float f_dc_2',
    'property float opacity',
    'property float scale_0',
    'property float scale_1',
    'property float scale_2',
    'property float rot_0',
    'property float rot_1',
    'property float rot_2',
    'property float rot_3',
    'end_header',
    '1 2 3 0 1 -1 0 -2 -4 -4 1 0 0 0',
    '',
  ].join('\n')
  const splatCloud = parsePlyPointCloud(new TextEncoder().encode(gaussianSplatPly), 10)
  if (!splatCloud.colors || splatCloud.colors[0] !== 0.5 || splatCloud.colors[1] <= 0.78 || splatCloud.colors[2] >= 0.22) {
    throw new Error(`expected Gaussian splat PLY f_dc colors, got ${splatCloud.colors ? Array.from(splatCloud.colors).join(',') : 'none'}`)
  }
  if (splatCloud.kind !== 'gaussian-splat' || splatCloud.positions[0] !== -1 || splatCloud.positions[1] !== -2 || splatCloud.positions[2] !== 3 || !splatCloud.opacities || !splatCloud.splatScales || !splatCloud.splatRotations) {
    throw new Error(`expected Gaussian splat PLY display attributes, got ${JSON.stringify({ kind: splatCloud.kind, position: Array.from(splatCloud.positions), opacity: splatCloud.opacities?.[0], scales: splatCloud.splatScales ? Array.from(splatCloud.splatScales) : null })}`)
  }
  if (Math.abs(splatCloud.opacities[0] - 0.5) > 1e-6) {
    throw new Error(`expected Gaussian splat opacity to preserve source sigmoid alpha, got ${splatCloud.opacities[0]}`)
  }
  const projectedRotation = Array.from(splatCloud.splatRotations)
  const plyProjectionRotation = [0, 0, 1, 0]
  if (
    Math.abs(splatCloud.splatScales[0] - Math.exp(-2)) > 1e-6
    || Math.abs(splatCloud.splatScales[1] - Math.exp(-4)) > 1e-6
    || projectedRotation.some((value, index) => Math.abs(value - plyProjectionRotation[index]) > 1e-6)
  ) {
    throw new Error(`expected Gaussian splat covariance payload, got ${JSON.stringify({ scales: Array.from(splatCloud.splatScales), rotations: Array.from(splatCloud.splatRotations) })}`)
  }
  const binaryCloud = parsePlyPointCloud(createBinaryLittleEndianRgbPlyBytes(), 10)
  if (binaryCloud.kind !== 'point-cloud' || binaryCloud.sourcePointCount !== 2 || binaryCloud.pointCount !== 2) {
    throw new Error(`expected binary RGB PLY to parse as a regular point cloud, got ${JSON.stringify({ kind: binaryCloud.kind, source: binaryCloud.sourcePointCount, parsed: binaryCloud.pointCount })}`)
  }
  if (!binaryCloud.colors || binaryCloud.colors[0] !== 1 || binaryCloud.colors[5] !== 1 || binaryCloud.opacities || binaryCloud.splatScales || binaryCloud.splatRotations) {
    throw new Error(`expected binary RGB PLY to avoid Gaussian-only attributes, got ${JSON.stringify({ colors: binaryCloud.colors ? Array.from(binaryCloud.colors) : null, scales: !!binaryCloud.splatScales, opacities: !!binaryCloud.opacities })}`)
  }
  const source = readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'plyPointCloud.ts'), 'utf8')
  for (const marker of ['normalizeGaussianSplatScale', 'splatScales', 'splatRotations', 'writeProjectedPlyPosition', 'writeProjectedPlyQuaternion', 'positionOffset']) {
    if (!source.includes(marker)) throw new Error(`expected Gaussian splat PLY parser footprint marker ${marker}`)
  }
  const staleMarker = (...parts: string[]) => parts.join('')
  for (const staleMarkerText of [
    staleMarker('splat', 'Radii'),
    staleMarker('splat', 'Major', 'Axes'),
    staleMarker('splat', 'Minor', 'Ratios'),
    staleMarker('resolve', 'Gaussian', 'Splat', 'Shape'),
    staleMarker('project', 'Gaussian', 'Basis', 'Vector'),
    staleMarker('project', 'Gaussian', 'Quaternion'),
    staleMarker('project', 'Position', '(is', 'Gaussian', 'Splat'),
  ]) {
    if (source.includes(staleMarkerText)) throw new Error(`expected parser to avoid stale Gaussian fallback marker ${staleMarkerText}`)
  }
}
