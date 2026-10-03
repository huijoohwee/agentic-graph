import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { load as loadYaml } from 'js-yaml'
import { FLIGHT_SIM_CAMERA_VIEW_OPTIONS } from '@/features/game-flight-sim/flightSimCameraRuntime'
import {
  XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
  XR_NATIVE_CONTROLLER_CAMERA_OPTIONS,
} from '@/features/three/xrNativeControllerCameraCatalog'
import {
  FLIGHT_SIM_DEMO_REPO_REL_PATH,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { getWorkspaceSeedFiles } from '@/features/workspace-fs/workspaceFs'
import { FlightSimRunReadyDemoRuntime } from '@/features/canvas/FlightSimRunReadyDemoRuntime'
import { readFlightSimSnapshot, resetFlightSimRuntimeForTests } from '@/features/game-flight-sim/flightSimRuntime'
import { beginSourceFilesDocumentIntent, clearSourceFilesDocumentIntent, completeSourceFilesBootstrap, failSourceFilesDocumentIntent } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { buildActiveWorkspaceRuntimeSourceFilesSnapshot } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { parseAndApplySourceFile } from '@/features/source-files/sourceFilesParseRuntime'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForReactCondition, waitForTasks } from '@/tests/lib/reactRootHarness'
import * as nativeMaterializationRegressions from './sourceFilesRuntimeMaterialization.test'

const repoRoot = resolve(process.cwd(), '..')
const seedSource = readFileSync(
  resolve(repoRoot, FLIGHT_SIM_DEMO_REPO_REL_PATH),
  'utf8',
)
const physicsSeedSource = readFileSync(
  resolve(repoRoot, XR_PHYSICS_DEMO_REPO_REL_PATH),
  'utf8',
)

for (const [name, regression] of Object.entries(nativeMaterializationRegressions)) {
  if (name.startsWith('test') && typeof regression === 'function') {
    test(`native SourceFile producer: ${name}`, async () => { await regression() })
  }
}

function source(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function frontmatter(value: string): Record<string, unknown> {
  const match = value.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(match)
  const parsed = loadYaml(match[1])
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  return parsed as Record<string, unknown>
}

test('Flight production bootstrap preserves exact authored Physics seed bytes', async () => {
  const previousRepoLocal = process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL
  process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL = '1'
  try {
    const physicsSeed = (await getWorkspaceSeedFiles()).find(
      seed => seed.path.endsWith(XR_PHYSICS_DEMO_REPO_REL_PATH),
    )
    assert.equal(physicsSeed?.text, physicsSeedSource)
  } finally {
    if (previousRepoLocal === undefined) {
      delete process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL
    } else {
      process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL = previousRepoLocal
    }
  }
})

test('Flight preloads one visual-free mission follower and one native MapLibre presentation', () => {
  const loader = source('canvas/src/lib/three/flightSimMissionStageLoader.ts')
  const gameplayOverlay = source('canvas/src/lib/three/ThreeGameplayOverlay.tsx')
  const runtime = source('canvas/src/features/game-flight-sim/flightSimRuntime.ts')
  const missionStage = source('canvas/src/features/game-flight-sim/FlightSimMissionStage.tsx')
  const viewport = source('canvas/src/components/CanvasViewport.tsx')
  const bridge = source('canvas/src/components/CanvasViewportGeospatialOverlay.tsx')
  const mapPresentation = source(
    'gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.ts',
  )
  const mapGate = source(
    'gympgrph/src/features/geospatial/flightGeoOverlayPresentationGate.ts',
  )
  const mapLayers = source('gympgrph/src/flightGeoOverlayMapLibreLayers.ts')

  assert.match(
    loader,
    /import\('@\/features\/game-flight-sim\/FlightSimMissionStage'\)/,
  )
  assert.match(loader, /module\.createFlightSimMissionStage\(runtimeController\)/)
  assert.match(
    gameplayOverlay,
    /const FlightSimMissionStageLazy = React\.lazy\(loadFlightSimMissionStage\)/,
  )
  assert.match(
    runtime,
    /preloadFlightSimMissionStage\(flightSimStageRuntimeController\)/,
  )
  assert.match(missionStage, /useFlightSimSurfaceControls\(\{/)
  assert.match(missionStage, /runtimeController\.subscribe\(syncRuntimeSnapshot\)/)
  assert.match(missionStage, /completeFlightSimReadyFrame\(presentation\.runId, presentation\.tick\)/)
  assert.match(missionStage, /return null/)
  assert.doesNotMatch(
    missionStage,
    /XrSceneLibraryAssetGeometry|XrProceduralVehicleGeometry|assetSpec|<mesh\b|<group\b|<primitive\b/,
  )
  assert.match(viewport, /<CanvasViewportGeospatialOverlayLazy/)
  assert.match(viewport, /<FlightSimHud \/>/)
  assert.doesNotMatch(viewport, /FlightSimGeoSurfaceOverlay/)
  assert.match(bridge, /onFlightOverlayPresented=\{handleFlightOverlayPresented\}/)
  assert.match(mapPresentation, /applyFlightGeoOverlayToMap\(map, overlay\)/)
  assert.match(mapGate, /canvas\.dataset\.kgFlightSimFirstFrameSurface = 'maplibre'/)
  for (const layer of ['route', 'routePoints', 'aircraft', 'aircraftOutline']) {
    assert.match(mapLayers, new RegExp(`${layer}:`))
  }
})

test('Flight Sim reuses shared fixed-follow and free-orbit camera ownership', () => {
  const meta = frontmatter(seedSource)
  const physicsMeta = frontmatter(physicsSeedSource)
  const flightCamera = (
    meta.native_flight_demo as { camera?: Record<string, unknown> }
  ).camera!
  const physicsCamera = (
    physicsMeta.native_controller_demo as { camera?: Record<string, unknown> }
  ).camera!
  for (const key of [
    'default',
    'selector',
    'available',
    'invocation',
    'timeline_override',
  ]) {
    assert.deepEqual(flightCamera[key], physicsCamera[key])
  }
  assert.equal(
    flightCamera.catalog_owner,
    'canvas/src/features/three/xrNativeControllerCameraCatalog.ts',
  )
  assert.equal(
    flightCamera.selection_owner,
    'canvas/src/features/three/xrNativeControllerCameraRuntime.ts',
  )
  assert.equal(
    flightCamera.driver_owner,
    'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
  )
  assert.deepEqual(
    XR_NATIVE_CONTROLLER_CAMERA_OPTIONS.map(option => option.id),
    flightCamera.available,
  )
  assert.equal(XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE, flightCamera.default)
  assert.deepEqual(
    FLIGHT_SIM_CAMERA_VIEW_OPTIONS.map(option => option.id),
    flightCamera.flight_views,
  )
})

async function withAutomaticFlightSource(run: (args: {
  root: ReturnType<typeof createRoot>
  sourceId: string
  setSource: (text: string) => string
}) => Promise<void>): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as never
  const container = dom.window.document.createElement('main')
  dom.window.document.body.append(container)
  const root = createRoot(container)
  resetGraphStoreForTests()
  resetFlightSimRuntimeForTests()
  completeSourceFilesBootstrap()
  const activePath = `/${FLIGHT_SIM_DEMO_REPO_REL_PATH}`
  const setSource = (text: string): string => {
    const snapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({
      activePath: activePath as never,
      existingSourceFiles: [],
      workspaceEntries: [{ path: activePath as never, parentPath: '/docs/workspace-seeds' as never, kind: 'file', name: activePath.split('/').pop()!, text, updatedAtMs: 1 }],
    })
    useGraphStore.setState({ markdownDocumentName: activePath, markdownDocumentText: text, markdownDocumentApplyViewPreset: false, sourceFiles: snapshot.runtimeSourceFiles })
    const nativeSource = snapshot.runtimeSourceFiles.find(file => file.source?.path === `workspace:${activePath}`)
    assert.ok(nativeSource)
    assert.equal(nativeSource.status, 'idle')
    assert.equal(nativeSource.enabled, true)
    return nativeSource.id
  }
  try {
    await run({ root, sourceId: setSource(seedSource), setSource })
  } finally {
    await unmountReactRoot(root)
    await waitForTasks()
    resetFlightSimRuntimeForTests()
    resetGraphStoreForTests()
    restore()
  }
}

test('automatic Flight entry waits for the actual native SourceFile parser publication', { timeout: 15_000 }, async () => {
  await withAutomaticFlightSource(async ({ root, sourceId }) => {
    await mountReactRoot(root, React.createElement(FlightSimRunReadyDemoRuntime))
    assert.equal(readFlightSimSnapshot().runtimeError, null)
    assert.equal(readFlightSimSnapshot().active, false)
    assert.equal(useGraphStore.getState().uiToasts.length, 0)
    let sawLoading = false
    const unsubscribe = useGraphStore.subscribe(state => { if (state.sourceFiles.find(file => file.id === sourceId)?.status === 'loading') sawLoading = true })
    try {
      await act(async () => { await parseAndApplySourceFile(sourceId, { applyComposedGraph: false }) })
    } finally { unsubscribe() }
    const parsedSource = useGraphStore.getState().sourceFiles.find(file => file.id === sourceId)
    assert.ok(sawLoading)
    assert.equal(parsedSource?.status, 'parsed')
    assert.equal(parsedSource?.text, seedSource)
    assert.ok(parsedSource?.parsedGraphData?.nodes.length)
    await waitForReactCondition(() => Boolean(readFlightSimSnapshot().runtimeError), { describe: () => 'parsed source to reach native WebGL admission' })
    assert.match(readFlightSimSnapshot().runtimeError || '', /WebGL/)
    assert.doesNotMatch(readFlightSimSnapshot().runtimeError || '', /enabled, parsed active SourceFile/)
  })
})

test('automatic Flight entry reports parse and exact-source errors and recovers after native reparse', { timeout: 15_000 }, async () => {
  await withAutomaticFlightSource(async ({ root, sourceId }) => {
    const intentKey = 'flight-source-authority-parse-error'
    beginSourceFilesDocumentIntent(intentKey)
    failSourceFilesDocumentIntent(intentKey, 'Native document parse failed')
    try {
      useGraphStore.getState().updateSourceFile(sourceId, { status: 'error', error: 'Native source parser rejected this document' })
      await mountReactRoot(root, React.createElement(FlightSimRunReadyDemoRuntime))
      assert.equal(readFlightSimSnapshot().runtimeError, null)
      assert.match(useGraphStore.getState().uiToasts[0]?.message || '', /Native source parser rejected/)
    } finally { await act(async () => { clearSourceFilesDocumentIntent(intentKey) }) }
    await act(async () => { useGraphStore.getState().updateSourceFile(sourceId, { enabled: false, status: 'idle' }) })
    assert.match(useGraphStore.getState().uiToasts[0]?.message || '', /exact enabled active SourceFile/)
    await act(async () => { useGraphStore.getState().updateSourceFile(sourceId, { enabled: true, text: `${seedSource}\n# Source drift` }) })
    assert.match(useGraphStore.getState().uiToasts[0]?.message || '', /exact enabled active SourceFile/)
    await act(async () => {
      useGraphStore.getState().updateSourceFile(sourceId, { text: seedSource })
      await parseAndApplySourceFile(sourceId, { applyComposedGraph: false })
    })
    await waitForReactCondition(() => Boolean(readFlightSimSnapshot().runtimeError), { describe: () => 'repaired exact source to launch' })
    assert.match(readFlightSimSnapshot().runtimeError || '', /WebGL/)
  })
})

test('automatic Flight entry cancels a pending launch on source lifecycle or text changes', { timeout: 15_000 }, async () => {
  await withAutomaticFlightSource(async ({ root, sourceId, setSource }) => {
    await parseAndApplySourceFile(sourceId, { applyComposedGraph: false })
    await act(async () => {
      flushSync(() => root.render(React.createElement(FlightSimRunReadyDemoRuntime)))
      useGraphStore.getState().updateSourceFile(sourceId, { status: 'loading', enabled: false })
      await waitForTasks(2)
    })
    assert.equal(readFlightSimSnapshot().runtimeError, null)
    assert.equal(readFlightSimSnapshot().active, false)
    await act(async () => {
      useGraphStore.getState().updateSourceFile(sourceId, { status: 'loading', enabled: true })
      await waitForTasks(2)
    })
    assert.equal(readFlightSimSnapshot().runtimeError, null)
    let replacementId = ''
    await act(async () => { replacementId = setSource(`${seedSource}\n# New exact source generation`) })
    assert.equal(readFlightSimSnapshot().runtimeError, null)
    await act(async () => { await parseAndApplySourceFile(replacementId, { applyComposedGraph: false }) })
    await waitForReactCondition(() => Boolean(readFlightSimSnapshot().runtimeError), { describe: () => 'replacement parsed source to launch' })
    assert.match(readFlightSimSnapshot().runtimeError || '', /WebGL/)
    assert.equal(readFlightSimSnapshot().active, false)
  })
})
