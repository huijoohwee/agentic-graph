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
import { readFlightSimSnapshot, resetFlightSimRuntimeForTests, subscribeFlightSimSnapshot } from '@/features/game-flight-sim/flightSimRuntime'
import { activateXrSceneSurface, readXrSceneGameplayModeRegistry, registerXrSceneGameplayMode } from '@/features/three/xrSceneSurfaceRuntime'
import { enqueueWorkspaceSourceTextTransaction } from '@/features/workspace-fs/workspaceSourceTextTransaction'
import { settleWorkspaceSourceTextWrites } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import { readWorkspaceSeedSyncRuntimeSnapshot } from '@/lib/workspace/workspaceSeedSyncRuntime'
import { useMarkdownWorkspaceSave } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceSave'
import { useMarkdownWorkspaceViewShell } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceViewShell'
import { isGeospatialModeEnabled } from '@/lib/gympgrph/api'
import { beginSourceFilesDocumentIntent, clearSourceFilesDocumentIntent, completeSourceFilesBootstrap, failSourceFilesDocumentIntent } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { buildActiveWorkspaceRuntimeSourceFilesSnapshot, isMaterializedWorkspaceSourceProofCurrent, materializeActiveWorkspaceEntryIntoSourceFiles } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { parseAndApplySourceFile } from '@/features/source-files/sourceFilesParseRuntime'
import { ensureBuiltInParsersRegistered } from '@/features/parsers/ensure'
import { listParsers, registerParser } from '@/features/parsers/registry'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useMarkdownWorkspaceDocumentSwitchApply } from '@/lib/markdown-workspace-runtime/markdownWorkspaceDocumentSwitchApply'
import { captureFlightSimTrainingSource } from '@/features/game-flight-sim/flightSimTrainingSource'
import { controlLocalXrScene } from '@/features/three/xrSceneMcpRuntime'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForReactCondition, waitForTasks } from '@/tests/lib/reactRootHarness'
import * as nativeMaterializationRegressions from './sourceFilesRuntimeMaterialization.test'
import { readSourceGeospatialState } from '@/features/evidence-analysis/geospatialSource'

const repoRoot = resolve(process.cwd(), '..')
const seedSource = readFileSync(
  resolve(repoRoot, FLIGHT_SIM_DEMO_REPO_REL_PATH),
  'utf8',
)
// Automatic practice tests explicitly remove Recorded intent; the canonical seed remains unchanged.
const practiceSource = seedSource.replace(/^source_geospatial:\r?\n(?:[ \t]+.*\r?\n)*/m, '')
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
  useGraphStore.setState({ uiToasts: [] })
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
    assert.equal(Object.hasOwn(frontmatter(practiceSource), 'source_geospatial'), false)
    await run({ root, sourceId: setSource(practiceSource), setSource })
  } finally {
    await unmountReactRoot(root)
    await waitForTasks()
    resetFlightSimRuntimeForTests()
    resetGraphStoreForTests()
    restore()
  }
}

test('automatic practice entry waits for the actual native SourceFile parser publication', { timeout: 15_000 }, async () => {
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
    assert.equal(parsedSource?.text, practiceSource)
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
    await act(async () => { useGraphStore.getState().updateSourceFile(sourceId, { enabled: true, text: `${practiceSource}\n# Source drift` }) })
    assert.match(useGraphStore.getState().uiToasts[0]?.message || '', /exact enabled active SourceFile/)
    await act(async () => {
      useGraphStore.getState().updateSourceFile(sourceId, { text: practiceSource })
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
    await act(async () => { replacementId = setSource(`${practiceSource}\n# New exact source generation`) })
    assert.equal(readFlightSimSnapshot().runtimeError, null)
    await act(async () => { await parseAndApplySourceFile(replacementId, { applyComposedGraph: false }) })
    await waitForReactCondition(() => Boolean(readFlightSimSnapshot().runtimeError), { describe: () => 'replacement parsed source to launch' })
    assert.match(readFlightSimSnapshot().runtimeError || '', /WebGL/)
    assert.equal(readFlightSimSnapshot().active, false)
  })
})

async function prepareHeadlessFlightSource(sourceId: string) {
  Object.defineProperty(window, 'requestAnimationFrame', { value: undefined, configurable: true })
  const renderer = document.createElement('canvas')
  renderer.dataset.engine = 'three.js r170'
  renderer.getContext = (() => ({ isContextLost: () => false })) as never
  document.body.append(renderer)
  await parseAndApplySourceFile(sourceId, { applyComposedGraph: false })
  await useGraphStore.getState().setActiveMarkdownDocument({ name: `/${FLIGHT_SIM_DEMO_REPO_REL_PATH}`, text: practiceSource, applyToGraph: true, forceApplyToGraph: true, applyViewPreset: false })
}

test('Recorded source intent blocks automatic practice before pending or invalid evidence can settle', { timeout: 15_000 }, async () => {
  await withAutomaticFlightSource(async ({ root, setSource }) => {
    const previousFetch = globalThis.fetch
    let finishScene: (() => void) | undefined, sceneRequests = 0
    globalThis.fetch = (async (input, options) => {
      if (!String(input).includes('/evidence-analysis/fixtures/')) return previousFetch(input, options)
      sceneRequests++
      return new Promise<Response>(resolve => {
        finishScene = () => resolve(new Response('', { status: 503 }))
        options?.signal?.addEventListener('abort', finishScene, { once: true })
      })
    }) as typeof fetch
    const assertNoPractice = (scene: ReturnType<typeof readXrMotionReferenceRuntime>, quiet = false) => {
      assert.equal(readFlightSimSnapshot().active, false)
      assert.equal(readFlightSimSnapshot().runtimeError, null)
      const toasts = useGraphStore.getState().uiToasts
      assert.equal(toasts.some(toast => toast.id === 'flight-sim:run-ready-launch:error'), false, JSON.stringify(toasts))
      if (quiet) assert.equal(toasts.length, 0)
      assert.equal(readXrMotionReferenceRuntime(), scene, 'Recorded entry must not hydrate the practice XR scene')
    }
    try {
      const recordedId = setSource(seedSource)
      await parseAndApplySourceFile(recordedId, { applyComposedGraph: false })
      const scene = readXrMotionReferenceRuntime()
      await mountReactRoot(root, React.createElement(FlightSimRunReadyDemoRuntime))
      await waitForReactCondition(() => sceneRequests > 0, { describe: () => 'authored scene fetch pending' })
      assert.equal(readSourceGeospatialState().loading, true); assertNoPractice(scene, true)
      await act(async () => { finishScene?.(); await waitForTasks(2) })
      assert.match(readSourceGeospatialState().error, /503/); assertNoPractice(scene)
      for (const text of [seedSource.replace('source_geospatial:\n  schema: "source-geospatial-config/v1"\n  scenePath: "/evidence-analysis/fixtures/scene-wsss-v1.json"', 'source_geospatial: null'), practiceSource.replace('---\n', '---\ninvalid: [\n')]) {
        await act(async () => {
          const id = setSource(text)
          await parseAndApplySourceFile(id, { applyComposedGraph: false })
          await waitForTasks(2)
        })
        assertNoPractice(scene)
      }
      globalThis.fetch = previousFetch
      await act(async () => { const id = setSource(practiceSource); await parseAndApplySourceFile(id, { applyComposedGraph: false }) })
      await waitForReactCondition(() => Boolean(readFlightSimSnapshot().runtimeError), { describe: () => 'explicit practice source to reach WebGL admission' })
      assert.match(readFlightSimSnapshot().runtimeError || '', /WebGL/)
    } finally { finishScene?.(); globalThis.fetch = previousFetch }
  })
})

test('automatic Flight source refresh preserves the selected or closed panel', { timeout: 15_000 }, async () => {
  await withAutomaticFlightSource(async ({ root, sourceId }) => {
    await prepareHeadlessFlightSource(sourceId)
    await mountReactRoot(root, React.createElement(FlightSimRunReadyDemoRuntime))
    await waitForReactCondition(() => readFlightSimSnapshot().active, { describe: () => 'initial native Flight launch' })
    assert.equal(useGraphStore.getState().floatingPanelView, 'flightSim')
    assert.equal(useGraphStore.getState().floatingPanelOpen, true)
    const originalStage = readXrMotionReferenceRuntime().plan.stageId
    for (const open of [true, false]) {
      let exited = false
      const unsubscribe = subscribeFlightSimSnapshot(() => { if (!readFlightSimSnapshot().active) exited = true })
      const sourceText = useGraphStore.getState().markdownDocumentText
      try {
        await act(async () => {
          assert.equal(controlLocalXrScene({ action: 'stage', stageId: open ? 'singapore' : originalStage }).ok, true)
          useGraphStore.getState().setFloatingPanelView('geo')
          useGraphStore.getState().setFloatingPanelOpen(open)
        })
        assert.notEqual(useGraphStore.getState().markdownDocumentText, sourceText)
        await waitForReactCondition(() => exited && readFlightSimSnapshot().active, { describe: () => 'native Flight source readmission' })
      } finally { unsubscribe() }
      assert.equal(useGraphStore.getState().floatingPanelView, 'geo')
      assert.equal(useGraphStore.getState().floatingPanelOpen, open)
    }
  })
})

test('explicit document departure releases Flight before its source commit and retains the shared Geo surface', { timeout: 15_000 }, async () => {
  await withAutomaticFlightSource(async ({ root, sourceId }) => {
    await prepareHeadlessFlightSource(sourceId)
    const noop = () => {}
    const path = `/${FLIGHT_SIM_DEMO_REPO_REL_PATH}`
    let storedText = '# Before authored scene edit', activePath = path, selectedPath = path, status = ''
    let selectFile!: (path: string) => void, selectFolder!: (path: string) => void
    let selection: Promise<boolean> | undefined
    const fs: WorkspaceFs = { ensureSeed: async () => false, listEntries: async () => [],
      readFileText: async () => storedText, writeFileText: async (_path, text) => { storedText = text },
      createFile: async () => '/unused.md', createFolder: async () => '/', deleteEntry: async () => {} }
    const lastLoadedRef = { current: { path, text: storedText, observedWorkspaceText: storedText, observedWorkspaceFs: fs } }
    const setStatusError = (message: string) => { status = message }
    function Editor() {
      const text = useGraphStore(state => state.markdownDocumentText)
      const [currentPath, setCurrentPath] = React.useState(path)
      const save = useMarkdownWorkspaceSave({ active: true, viewerInlineEditActive: false,
        activePath: currentPath, activeEntryKind: 'file', activeText: text, activeTextRef: { current: text },
        debouncedText: text, activeDocumentKey: currentPath, activeDocumentSourceUrl: null,
        getFs: async () => fs, lastLoadedRef, patchWorkspaceEntryInlineText: noop,
        setActiveMarkdownDocument: useGraphStore.getState().setActiveMarkdownDocument,
        setGraphRagWorkflowJsonText: noop, setActiveTextProgrammatic: noop, refresh: async () => {},
        setActivePathSafe: noop, setSelectionPathSafe: noop, userEditedActiveTextRef: { current: false },
        setStatusError, setStatusProgress: noop, setStatusWithAutoClear: noop })
      const shell = useMarkdownWorkspaceViewShell({ entries: [], sourcesByPath: {}, folderModeContract: 'sitemap',
        setFolderModeContract: noop, activePath: currentPath, selectionPath: selectedPath, selectionEntryKind: 'file',
        setActivePathSafe: next => { activePath = next; setCurrentPath(next) },
        setSelectionPathSafe: next => {
          if (next === selectedPath) return
          selection = (async () => {
            if (!await save.commitActiveTextBeforeSelection()) return false
            await settleWorkspaceSourceTextWrites()
            selectedPath = next
            return true
          })()
          return selection
        },
        setSelectionSource: noop, setExpandedPaths: noop, resolveFolderContractDocPath: value => value,
        pickFolderContractTargetPath: () => null, revealLineInEditor: noop, setStatusError, setStatusWithAutoClear: noop })
      selectFile = shell.onSelectFile
      selectFolder = shell.onSelectFolder
      return React.createElement(FlightSimRunReadyDemoRuntime)
    }
    await mountReactRoot(root, React.createElement(Editor))
    await waitForReactCondition(() => readFlightSimSnapshot().active, { describe: () => 'native Flight owner before source switch' })
    const text = useGraphStore.getState().markdownDocumentText
    const revision = () => useGraphStore.getState().sourceFiles.find(file => file.id === sourceId)?.parsedGraphRevision
    const parsedRevision = revision()
    lastLoadedRef.current.text = text
    await act(async () => { selectFile(path); selectFolder('/empty'); await selection })
    assert.equal(readFlightSimSnapshot().active, true, 'same document and folder-only selection retain gameplay')
    assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().suspensionCount, 1)
    lastLoadedRef.current.text = storedText
    let releaseWrite!: () => void, writeEntered = false
    const barrier = new Promise<void>(resolve => { releaseWrite = resolve })
    const queued = enqueueWorkspaceSourceTextTransaction({ path, text, write: async () => {
      writeEntered = true
      await barrier
      await fs.writeFileText(path, text)
    } })
    let unregister: (() => void) | undefined, rejectExit = true
    try {
      await act(async () => { selectFile('/destination.md'); await waitForTasks(2) })
      assert.equal(readFlightSimSnapshot().active, false, 'release Flight before its save')
      assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().suspensionCount, 0)
      assert.equal(writeEntered, true)
      assert.equal(activePath, path, 'commit still fences selection')
      releaseWrite()
      await act(async () => { assert.equal(await selection, true); await waitForTasks(2) })
      assert.equal((await queued).accepted, true)
      assert.equal(activePath, '/destination.md')
      assert.equal(storedText, text)
      assert.equal(lastLoadedRef.current.text, text)
      assert.equal(revision(), parsedRevision)
      assert.equal(readFlightSimSnapshot().active, false, 'save must not relaunch gameplay')
      assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().suspensionCount, 0)
      const state = useGraphStore.getState()
      assert.deepEqual([isGeospatialModeEnabled(), state.canvasRenderMode, state.canvas3dMode], [true, '3d', 'xr'])
      assert.equal(status, '')
      unregister = registerXrSceneGameplayMode('cityBuilder', { identity: 'departure-test', worldSchema: 'test.departure/v1',
        persistence: { continuity: 'none', lease: 'none' }, surface: { overlayKind: 'xr-scene-gameplay' },
        adaptInput: () => ({}), createOverlay: () => ({ overlayId: 'departure-test', overlayKind: 'xr-scene-gameplay' }),
        exit: () => { if (rejectExit) throw new Error('injected departure failure') } })
      assert.equal(activateXrSceneSurface({ gameplaySurface: 'cityBuilder' }), true)
      const previousSelection = selection
      await act(async () => { selectFile('/another.md'); await waitForTasks() })
      assert.equal(selection, previousSelection, 'failed departure cannot commit')
      assert.equal(activePath, '/destination.md')
      assert.equal(readXrSceneGameplayModeRegistry().activeIdentity, 'departure-test')
      assert.equal(status, 'Source switch failed: The active mode did not release the scene surface.')
    } finally {
      rejectExit = false
      unregister?.()
      releaseWrite()
      resetFlightSimRuntimeForTests()
      await queued
      await selection
    }
  })
})

test('native editor publication converges with pending source reads and canonical parsing only for the exact selected source', { timeout: 30_000 }, async () => {
  const { dom, restore } = initJsdomHarness()
  const previous = useGraphStore.getState(), previousExplorer = useMarkdownExplorerStore.getState()
  ensureBuiltInParsersRegistered()
  const original = listParsers().find(parser => String(parser.id) === 'markdown')!
  const path = `/${FLIGHT_SIM_DEMO_REPO_REL_PATH}`
  const entry = { path: path as never, parentPath: '/docs/workspace-seeds' as never, kind: 'file' as const,
    name: path.split('/').pop()!, text: seedSource, updatedAtMs: 1 }
  try {
    for (const stage of ['source-read', 'parser'] as const) for (const change of ['exact', 'text', 'selection'] as const) {
      resetGraphStoreForTests()
      const snapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({ activePath: path as never,
        existingSourceFiles: [], workspaceEntries: [entry], sourcesByPath: {} })
      let release!: () => void, started!: () => void, count = 0, firstRead = true
      const delay = new Promise<void>(resolve => { release = resolve })
      const entered = new Promise<void>(resolve => { started = resolve })
      registerParser({ ...original, parseAsync: async (name, text) => {
        count += 1
        if (stage === 'parser') { started(); await delay }
        return original.parseAsync ? original.parseAsync(name, text) : original.parse(name, text)
      } })
      const fs: WorkspaceFs = { ensureSeed: async () => false, listEntries: async () => [],
        readFileText: async () => { if (stage === 'source-read' && firstRead) { firstRead = false; started(); await delay }; return seedSource },
        writeFileText: async () => undefined, createFile: async () => '/docs/tmp.md',
        createFolder: async () => '/docs', deleteEntry: async () => undefined }
      // Native editor and materializer share this publication action. Graph and
      // renderer effects are outside this document/source ordering regression.
      useGraphStore.setState({ sourceFiles: snapshot.runtimeSourceFiles, markdownDocumentName: 'before.md', markdownDocumentText: '# Before',
        setActiveMarkdownDocument: async payload => {
          useGraphStore.getState().setMarkdownDocument(payload.name, payload.text, { applyViewPreset: payload.applyViewPreset,
            autoEnableFrontmatter: payload.autoEnableFrontmatter, forceRevision: payload.applyToGraph === true })
          return true
        } })
      useMarkdownExplorerStore.getState().setActivePath(path as never)
      let publish!: ReturnType<typeof useMarkdownWorkspaceDocumentSwitchApply>['applySelectedWorkspaceDocumentToCanvas']
      function NativeDocumentSwitchOwner() {
        publish = useMarkdownWorkspaceDocumentSwitchApply({ activePath: path as never, readPendingSwitchNextPath: () => path as never,
          setActiveMarkdownDocument: useGraphStore.getState().setActiveMarkdownDocument }).applySelectedWorkspaceDocumentToCanvas
        return null
      }
      const container = dom.window.document.createElement('main'); dom.window.document.body.append(container)
      const root = createRoot(container)
      let applying: ReturnType<typeof materializeActiveWorkspaceEntryIntoSourceFiles> | undefined
      try {
        await mountReactRoot(root, React.createElement(NativeDocumentSwitchOwner))
        applying = materializeActiveWorkspaceEntryIntoSourceFiles({ activePathOverride: path as never, fs,
          sourceFilesSnapshot: snapshot.runtimeSourceFiles, refreshActiveText: stage === 'source-read' })
        // Attach a rejection observer before the deliberate asynchronous drift.
        void applying.catch(() => undefined)
        await entered
        assert.equal(useGraphStore.getState().sourceFiles[0].status, stage === 'parser' ? 'loading' : 'idle')
        const publishedText = change === 'text' ? `${seedSource}\n# Concurrent document edit` : seedSource
        await act(async () => { assert.equal(await publish({ activeDocumentKey: path.slice(1), text: publishedText,
          sourceUrl: null, updatedAtMs: 1, markdownDocumentName: 'before.md', markdownDocumentText: '# Before',
          graphDataSource: null, canvas2dRenderer: 'flow' }), 'applied') })
        if (change === 'selection') useMarkdownExplorerStore.getState().setActivePath('/docs/new-selection.md')
        release()
        if (change === 'exact') {
          const proof = await applying
          assert.ok(proof && isMaterializedWorkspaceSourceProofCurrent(proof))
          assert.equal(count, 1)
          assert.equal(useGraphStore.getState().sourceFiles[0].status, 'parsed')
          assert.equal(useGraphStore.getState().markdownDocumentName, path.slice(1))
          assert.equal(useGraphStore.getState().markdownDocumentText, seedSource)
          const captured = captureFlightSimTrainingSource()
          assert.equal(captured.sourceText, seedSource); assert.ok(captured.profile && captured.geographicReference)
        } else {
          await assert.rejects(applying, error => (error as { code?: string }).code === 'SOURCE_FILES_MATERIALIZATION_STALE')
          assert.equal(useGraphStore.getState().markdownDocumentText, publishedText)
          assert.equal(useMarkdownExplorerStore.getState().activePath, change === 'selection' ? '/docs/new-selection.md' : path)
          assert.equal(useGraphStore.getState().sourceFiles[0].text, seedSource)
          assert.equal(count, stage === 'parser' ? 1 : 0)
        }
      } finally { release(); await applying?.catch(() => undefined); await unmountReactRoot(root); container.remove() }
    }
  } finally { registerParser(original); useGraphStore.setState(previous, true); useMarkdownExplorerStore.setState(previousExplorer, true); restore() }
})
