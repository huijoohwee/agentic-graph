import assert from 'node:assert/strict'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  CITY_SIM_DOCUMENT_PATH,
} from '@/features/game-city-sim/citySimModel'
import {
  parseCityGridDocument,
  serializeCityGridDocument,
} from '@/features/game-city-sim/citySimCodec'
import {
  advanceCitySimByFixedStep,
  exitCitySimSurface,
  loadCitySim,
  openCitySimSurface,
  readCitySimSnapshot,
  requestCityAdvice,
  resetCitySim,
  resetCitySimRuntimeForTests as resetCitySimRuntimeWithoutSource,
  restartCitySim,
  saveCitySim,
  startCitySim,
  stopCitySim,
  zoneCityParcel,
} from '@/features/game-city-sim/citySimRuntime'
import { resetCitySimRuntimeForTests } from './citySimAuthoritativeSource'
import {
  exitCitySimSurfaceAndWait,
} from '@/features/game-city-sim/citySimSurfaceExit'
import {
  activateXrSceneSurface,
} from '@/features/three/xrSceneSurfaceRuntime'
import { captureCitySimPreviousCanvasSurface } from '@/features/game-city-sim/citySimSurfaceOwnership'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readGeospatialOverlayEnabledPreference,
  writeGeospatialOverlayEnabledPreference,
} from '@/lib/geospatial/geospatialModePreference'
import {
  isGeospatialModeEnabled,
  setGeospatialModeEnabled,
} from 'gympgrph'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  captureStoreState,
  createCityWorkspace,
  prepareCitySurface,
} from './helpers/citySimRuntimeHarness'

const CITY_PANEL_PROJECTIONS = [
  'media',
  'animation',
  'motionControl',
  'gameMode',
  'flightSim',
  'camera',
] as const

export async function testCitySimRuntimeFailsClosedWithoutSavedOrAuthoredSource() {
  const { restore } = initJsdomHarness()
  const priorStore = captureStoreState()
  try {
    prepareCitySurface()
    const neutral = resetCitySimRuntimeWithoutSource({ webglSupported: true })
    assert.equal(neutral.geographicProfile, null)
    const opened = await openCitySimSurface({
      workspace: createCityWorkspace(),
      webglSupported: true,
    })
    assert.equal(opened.active, false)
    assert.equal(opened.phase, 'error')
    assert.equal(opened.lastResult?.code, 'authored-source-missing')
    assert.equal(opened.geographicProfile, null)
    const loaded = await loadCitySim({ workspace: createCityWorkspace() })
    assert.equal(loaded.lastResult?.code, 'authored-source-missing')
    const saved = await saveCitySim({ workspace: createCityWorkspace() })
    assert.equal(saved.lastResult?.code, 'source-unavailable')
    const reset = resetCitySim()
    assert.equal(reset.lastResult?.code, 'authored-source-missing')
  } finally {
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    useGraphStore.setState(priorStore as never)
    restore()
  }
}

export async function testCitySimRuntimeFencesStoppedTicksAndRestartsSession() {
  const { restore } = initJsdomHarness()
  const priorStore = captureStoreState()
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const queuedTimerCallbacks: Array<() => void> = []
  try {
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    const workspace = createCityWorkspace()
    const opened = await openCitySimSurface({ workspace, webglSupported: true })
    assert.equal(opened.active, true)
    assert.equal(opened.phase, 'stopped')
    assert.equal(opened.geographicProfile?.id, 'city-sim:civic-seed:geo/v1')
    assert.equal(useGraphStore.getState().floatingPanelView, 'cityBuilder')

    globalThis.setTimeout = ((callback: TimerHandler) => {
      assert.equal(typeof callback, 'function')
      queuedTimerCallbacks.push(callback as () => void)
      return queuedTimerCallbacks.length as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout

    const started = await startCitySim({ workspace, webglSupported: true })
    assert.equal(started.phase, 'running')
    assert.equal(queuedTimerCallbacks.length, 1)
    const alreadyRunning = await startCitySim({ workspace, webglSupported: true })
    assert.equal(alreadyRunning.lastResult?.operation, 'start')
    assert.match(alreadyRunning.message, /already running/)
    assert.equal(queuedTimerCallbacks.length, 1)
    assert.ok(requestCityAdvice('district').advisor)
    const advanced = advanceCitySimByFixedStep()
    assert.equal(advanced.city.tick, 1)
    assert.equal(advanced.advisor, null)
    const stopped = stopCitySim()
    assert.equal(stopped.phase, 'stopped')
    const stoppedBytes = serializeCityGridDocument(stopped.city)
    queuedTimerCallbacks[0]()
    assert.equal(
      serializeCityGridDocument(readCitySimSnapshot().city),
      stoppedBytes,
      'a queued callback from the prior generation must not commit after Stop',
    )

    const restarted = restartCitySim()
    assert.equal(restarted.phase, 'stopped')
    assert.equal(restarted.city.tick, 0)
    assert.equal(restarted.city.treasuryCents, 100_000)
    assert.equal(restarted.city.population, 15)
    const reset = resetCitySim()
    assert.equal(reset.active, true)
    assert.equal(reset.phase, 'stopped')
    assert.equal(reset.city.tick, 0)

    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    exitCitySimSurface()
    const restored = useGraphStore.getState()
    assert.equal(restored.canvasRenderMode, '2d')
    assert.equal(restored.canvas3dMode, '3d')
    assert.equal(restored.floatingPanelView, 'media')
    assert.equal(restored.floatingPanelOpen, true)
    restored.setFloatingPanelView('camera')
    exitCitySimSurface()
    assert.equal(
      useGraphStore.getState().floatingPanelView,
      'camera',
      'surface restoration must consume the captured owner exactly once',
    )
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    useGraphStore.setState(priorStore as never)
    restore()
  }
}

export async function testCitySimWorkspaceSaveReadBackAndMalformedBlock() {
  const { restore } = initJsdomHarness()
  const priorStore = captureStoreState()
  try {
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    const workspace = createCityWorkspace()
    await openCitySimSurface({ workspace, webglSupported: true })
    const zoned = zoneCityParcel('r00c02', 'residential')
    assert.equal(zoned.lastResult?.ok, true)
    const expectedDocument = serializeCityGridDocument(zoned.city)
    const saved = await saveCitySim({ workspace })
    assert.equal(saved.saveStatus, 'saved')
    assert.equal(await workspace.readFileText(CITY_SIM_DOCUMENT_PATH), expectedDocument)
    const parsed = parseCityGridDocument(expectedDocument)
    assert.equal(parsed.ok, true)

    resetCitySim()
    assert.equal(
      await workspace.readFileText(CITY_SIM_DOCUMENT_PATH),
      expectedDocument,
      'Reset must restore the source-authored grid only in memory',
    )
    const loaded = await loadCitySim({ workspace })
    assert.equal(loaded.saveStatus, 'loaded')
    assert.equal(serializeCityGridDocument(loaded.city), expectedDocument)
    exitCitySimSurface({ restorePreviousSurface: false })

    const malformedBytes = '---\nschema_id: knowgrph-city-grid/v1\ninvalid\n'
    const malformedWorkspace = createCityWorkspace(malformedBytes)
    resetCitySimRuntimeForTests({ webglSupported: true })
    const blockedOpen = await openCitySimSurface({
      workspace: malformedWorkspace,
      webglSupported: true,
    })
    assert.equal(blockedOpen.active, false)
    assert.equal(blockedOpen.phase, 'error')
    assert.equal(blockedOpen.saveStatus, 'malformed')
    const blockedStart = await startCitySim({
      workspace: malformedWorkspace,
      webglSupported: true,
    })
    const blockedRestart = restartCitySim()
    const blockedSave = await saveCitySim({ workspace: malformedWorkspace })
    for (const blocked of [blockedStart, blockedRestart, blockedSave]) {
      assert.equal(blocked.lastResult?.ok, false)
      assert.equal(blocked.lastResult?.code, 'malformed-document')
    }
    assert.equal(await malformedWorkspace.readFileText(CITY_SIM_DOCUMENT_PATH), malformedBytes)
    resetCitySim()
    assert.equal(
      await malformedWorkspace.readFileText(CITY_SIM_DOCUMENT_PATH),
      malformedBytes,
      'Reset must not silently repair malformed workspace bytes',
    )
  } finally {
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    useGraphStore.setState(priorStore as never)
    restore()
  }
}

export async function testCitySimPersistenceFencesStaleSaveAndLoadCompletions() {
  const { restore } = initJsdomHarness()
  const priorStore = captureStoreState()
  try {
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    const baseWorkspace = createCityWorkspace(
      serializeCityGridDocument(readCitySimSnapshot().city),
    )
    let releaseWrite = () => undefined
    let markWriteStarted = () => undefined
    const writeGate = new Promise<void>(resolve => {
      releaseWrite = resolve
    })
    const writeStarted = new Promise<void>(resolve => {
      markWriteStarted = resolve
    })
    const writeWorkspace: WorkspaceFs = {
      ...baseWorkspace,
      writeFileText: async (path, text) => {
        markWriteStarted()
        await writeGate
        await baseWorkspace.writeFileText(path, text)
      },
    }

    await openCitySimSurface({ workspace: writeWorkspace, webglSupported: true })
    const firstCity = zoneCityParcel('r00c02', 'residential').city
    assert.equal(readCitySimSnapshot().saveStatus, 'dirty')
    const pendingSave = saveCitySim({ workspace: writeWorkspace })
    await writeStarted
    const currentCity = zoneCityParcel('r00c03', 'commercial').city
    releaseWrite()
    const staleSave = await pendingSave
    assert.equal(staleSave.lastResult?.code, 'stale-save')
    assert.equal(staleSave.saveStatus, 'dirty')
    assert.equal(
      await baseWorkspace.readFileText(CITY_SIM_DOCUMENT_PATH),
      serializeCityGridDocument(firstCity),
    )
    assert.notEqual(
      serializeCityGridDocument(currentCity),
      serializeCityGridDocument(firstCity),
    )

    const savedCurrent = await saveCitySim({ workspace: writeWorkspace })
    assert.equal(savedCurrent.saveStatus, 'saved')
    const sameZone = zoneCityParcel('r00c03', 'commercial')
    assert.equal(sameZone.saveStatus, 'saved')

    let releaseRead = () => undefined
    let markReadStarted = () => undefined
    const readGate = new Promise<void>(resolve => {
      releaseRead = resolve
    })
    const readStarted = new Promise<void>(resolve => {
      markReadStarted = resolve
    })
    const delayedReadWorkspace: WorkspaceFs = {
      ...baseWorkspace,
      readFileText: async path => {
        markReadStarted()
        await readGate
        return baseWorkspace.readFileText(path)
      },
    }
    const pendingLoad = loadCitySim({ workspace: delayedReadWorkspace })
    await readStarted
    const reset = resetCitySim()
    releaseRead()
    const fencedLoad = await pendingLoad
    assert.equal(fencedLoad.lastResult?.operation, 'reset')
    assert.equal(fencedLoad.city, reset.city)
    assert.equal(fencedLoad.saveStatus, 'not-loaded')
  } finally {
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    useGraphStore.setState(priorStore as never)
    restore()
  }
}

export async function testCitySimPanelProjectionPreservationAndGameplayExclusivity() {
  const { restore } = initJsdomHarness()
  const priorStore = captureStoreState()
  try {
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    const workspace = createCityWorkspace()
    useGraphStore.setState({
      canvasRenderModeLastFree: '2d',
      canvasRenderModeIsAuto: true,
    })
    const neutralSurface = captureCitySimPreviousCanvasSurface()
    useGraphStore.setState({
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      canvasRenderModeLastFree: '3d',
      canvasRenderModeIsAuto: false,
      floatingPanelOpen: true,
      floatingPanelView: 'cityBuilder',
    } as never)
    await openCitySimSurface({
      workspace,
      webglSupported: true,
      previousCanvasSurface: neutralSurface,
    })
    exitCitySimSurface()
    assert.equal(useGraphStore.getState().canvasRenderMode, '2d')
    assert.equal(useGraphStore.getState().floatingPanelView, 'media')
    assert.equal(useGraphStore.getState().canvasRenderModeLastFree, '2d')
    assert.equal(useGraphStore.getState().canvasRenderModeIsAuto, true)

    await openCitySimSurface({ workspace, webglSupported: true })
    const failedReopen = await openCitySimSurface({
      workspace,
      webglSupported: false,
    })
    assert.equal(failedReopen.active, false)
    assert.equal(failedReopen.lastResult?.code, 'webgl-unavailable')
    assert.equal(useGraphStore.getState().canvasRenderMode, '2d')
    assert.equal(useGraphStore.getState().floatingPanelView, 'media')
    assert.equal(useGraphStore.getState().canvasRenderModeIsAuto, true)

    await openCitySimSurface({ workspace, webglSupported: true })
    for (const panelView of CITY_PANEL_PROJECTIONS) {
      assert.equal(
        activateXrSceneSurface({ panelView, openPanel: true }),
        true,
      )
      assert.equal(readCitySimSnapshot().active, true)
      assert.equal(useGraphStore.getState().floatingPanelView, panelView)
    }

    assert.equal(activateXrSceneSurface({
      panelView: 'gameMode',
      gameplaySurface: 'gameMode',
      openPanel: true,
    }), true)
    assert.equal(readCitySimSnapshot().active, false)

    await openCitySimSurface({ workspace, webglSupported: true })
    assert.equal(readCitySimSnapshot().active, true)
    assert.equal(activateXrSceneSurface({
      panelView: 'flightSim',
      gameplaySurface: 'flightSim',
      openPanel: true,
    }), true)
    assert.equal(readCitySimSnapshot().active, false)
  } finally {
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    useGraphStore.setState(priorStore as never)
    restore()
  }
}

export async function testCitySimClaimsAndRestoresTheNativeGeoOwner() {
  const { dom, restore } = initJsdomHarness()
  const previousEvent = globalThis.Event
  const previousCustomEvent = globalThis.CustomEvent
  const priorStore = captureStoreState()
  const priorGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  try {
    Object.assign(globalThis, {
      Event: dom.window.Event,
      CustomEvent: dom.window.CustomEvent,
    })
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(false)
    setGeospatialModeEnabled(false)
    useGraphStore.setState({
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      canvasRenderModeLastFree: '3d',
      canvasRenderModeIsAuto: false,
      floatingPanelOpen: true,
      floatingPanelView: 'flightSim',
    } as never)
    const previous = captureCitySimPreviousCanvasSurface()
    const opened = await openCitySimSurface({
      workspace: createCityWorkspace(),
      webglSupported: true,
      previousCanvasSurface: previous,
    })

    assert.equal(opened.active, true)
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
    assert.equal(isGeospatialModeEnabled(), true)
    assert.equal(useGraphStore.getState().floatingPanelView, 'cityBuilder')
    assert.equal(readCitySimSnapshot().active, true)

    const restored = await exitCitySimSurfaceAndWait()
    assert.equal(restored.active, false)
    assert.equal(readGeospatialOverlayEnabledPreference(), false)
    assert.equal(isGeospatialModeEnabled(), false)
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(useGraphStore.getState().floatingPanelView, 'flightSim')

    useGraphStore.getState().setFloatingPanelView('camera')
    await exitCitySimSurfaceAndWait()
    assert.equal(
      useGraphStore.getState().floatingPanelView,
      'camera',
      'the consumed City surface snapshot must not clobber a later panel choice',
    )
  } finally {
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(priorGeospatialEnabled)
    setGeospatialModeEnabled(priorGeospatialEnabled)
    useGraphStore.setState(priorStore as never)
    Object.assign(globalThis, {
      Event: previousEvent,
      CustomEvent: previousCustomEvent,
    })
    restore()
  }
}

export async function testCitySimFailedEntryRestoresTheCapturedGeoOwner() {
  const { dom, restore } = initJsdomHarness()
  const previousEvent = globalThis.Event
  const previousCustomEvent = globalThis.CustomEvent
  const priorStore = captureStoreState()
  const priorGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  try {
    Object.assign(globalThis, {
      Event: dom.window.Event,
      CustomEvent: dom.window.CustomEvent,
    })
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(false)
    setGeospatialModeEnabled(false)
    useGraphStore.setState({
      schema: {
        layout: { mode: 'radial' },
        behavior: { allowEdgeCreation: true, allowNodeDrag: true },
        nodeStyles: {},
        edgeStyles: {},
        rules: [],
      },
    } as never)

    const failed = await openCitySimSurface({
      workspace: createCityWorkspace(),
      webglSupported: true,
    })
    assert.equal(failed.active, false)
    assert.equal(failed.lastResult?.code, 'surface-unavailable')
    assert.equal(readGeospatialOverlayEnabledPreference(), false)
    assert.equal(isGeospatialModeEnabled(), false)
    assert.equal(readCitySimSnapshot().active, false)
  } finally {
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(priorGeospatialEnabled)
    setGeospatialModeEnabled(priorGeospatialEnabled)
    useGraphStore.setState(priorStore as never)
    Object.assign(globalThis, {
      Event: previousEvent,
      CustomEvent: previousCustomEvent,
    })
    restore()
  }
}
