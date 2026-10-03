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

test('automatic Flight source refresh preserves the selected or closed panel', { timeout: 15_000 }, async () => {
  await withAutomaticFlightSource(async ({ root, sourceId }) => {
    // This ownership test uses the headless entry contract, without presenters.
    Object.defineProperty(window, 'requestAnimationFrame', { value: undefined, configurable: true })
    const renderer = document.createElement('canvas')
    renderer.dataset.engine = 'three.js r170'
    renderer.getContext = (() => ({ isContextLost: () => false })) as never
    document.body.append(renderer)
    await parseAndApplySourceFile(sourceId, { applyComposedGraph: false })
    await useGraphStore.getState().setActiveMarkdownDocument({ name: `/${FLIGHT_SIM_DEMO_REPO_REL_PATH}`, text: seedSource, applyToGraph: true, forceApplyToGraph: true, applyViewPreset: false })
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
