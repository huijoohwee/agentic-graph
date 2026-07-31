import assert from 'node:assert/strict'
import {
  exitCitySimSurface,
  openCitySimSurface,
  readCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import { resetCitySimRuntimeForTests } from './citySimAuthoritativeSource'
import { exitCitySimSurfaceAndWait } from '@/features/game-city-sim/citySimSurfaceExit'
import { captureCitySimPreviousCanvasSurface } from '@/features/game-city-sim/citySimSurfaceOwnership'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readGeospatialOverlayEnabledPreference,
  writeGeospatialOverlayEnabledPreference,
} from '@/lib/geospatial/geospatialModePreference'
import {
  claimMapLibreMapLease,
  isGeospatialModeEnabled,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
  setGeospatialModeEnabled,
  useGympgrphStore,
} from 'gympgrph'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  captureStoreState,
  createCityWorkspace,
  prepareCitySurface,
} from './helpers/citySimRuntimeHarness'

export async function testCitySimRetainedGeoClaimDoesNotDisposeNativeMap() {
  const { dom, restore } = initJsdomHarness(`
    <!doctype html><html><body>
      <section data-kg-geo-xr-layer="geo-background">
        <canvas class="maplibregl-canvas"></canvas>
      </section>
    </body></html>
  `)
  const previousEvent = globalThis.Event
  const previousCustomEvent = globalThis.CustomEvent
  const priorStore = captureStoreState()
  const priorGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  const ownedCanvas = dom.window.document.querySelector<HTMLCanvasElement>(
    '[data-kg-geo-xr-layer="geo-background"] canvas.maplibregl-canvas',
  )
  assert.ok(ownedCanvas)
  let releaseMapLease: (() => void) | null = null
  let cancelDisposalCalls = 0
  let prepareForDisposalCalls = 0
  try {
    Object.assign(globalThis, {
      Event: dom.window.Event,
      CustomEvent: dom.window.CustomEvent,
    })
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(true)
    setGeospatialModeEnabled(true)
    useGraphStore.setState({
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      canvasRenderModeLastFree: '3d',
      canvasRenderModeIsAuto: false,
      floatingPanelOpen: true,
      floatingPanelView: 'flightSim',
    } as never)
    const previous = captureCitySimPreviousCanvasSurface()
    releaseMapLease = claimMapLibreMapLease({
      cancelDisposalPreparation: () => {
        cancelDisposalCalls += 1
      },
      isPreparedForDisposal: () => false,
      map: { getCanvas: () => ownedCanvas },
      ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
      prepareForDisposal: () => {
        prepareForDisposalCalls += 1
        return false
      },
      root: ownedCanvas.parentElement,
    })

    const opened = await openCitySimSurface({
      workspace: createCityWorkspace(),
      webglSupported: true,
      previousCanvasSurface: previous,
    })
    assert.equal(opened.active, true)
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
    assert.equal(isGeospatialModeEnabled(), true)
    assert.equal(prepareForDisposalCalls, 0)
    assert.equal(cancelDisposalCalls, 0)
    assert.equal(ownedCanvas.isConnected, true)

    const restored = await exitCitySimSurfaceAndWait()
    assert.equal(restored.active, false)
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
    assert.equal(isGeospatialModeEnabled(), true)
    assert.equal(prepareForDisposalCalls, 0)
    assert.equal(cancelDisposalCalls, 0)
    assert.equal(
      ownedCanvas.isConnected,
      true,
      'City Geo+XR entry and restoration must retain the native MapLibre owner',
    )
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(useGraphStore.getState().floatingPanelView, 'flightSim')

    useGraphStore.getState().setFloatingPanelView('camera')
    await exitCitySimSurfaceAndWait()
    assert.equal(
      useGraphStore.getState().floatingPanelView,
      'camera',
      'a second Exit must not replay the consumed pre-City panel snapshot',
    )
  } finally {
    releaseMapLease?.()
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

export async function testCitySimSupersededGeoClaimCannotClobberNewerEntry() {
  const { restore } = initJsdomHarness()
  const priorStore = captureStoreState()
  const priorGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  const originalSetGeospatialModeEnabled =
    useGympgrphStore.getState().setGeospatialModeEnabled
  let newerOpen: ReturnType<typeof openCitySimSurface> | null = null
  let newerEntryStarted = false
  try {
    prepareCitySurface()
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(false)
    setGeospatialModeEnabled(false)
    const previous = captureCitySimPreviousCanvasSurface()
    useGympgrphStore.setState({
      setGeospatialModeEnabled: enabled => {
        originalSetGeospatialModeEnabled(enabled)
        if (!enabled || newerEntryStarted) return
        newerEntryStarted = true
        newerOpen = openCitySimSurface({
          previousCanvasSurface: previous,
          webglSupported: true,
          workspace: createCityWorkspace(),
        })
      },
    })

    await openCitySimSurface({
      previousCanvasSurface: previous,
      webglSupported: true,
      workspace: createCityWorkspace(),
    })
    assert.ok(newerOpen, 'the first Geo commit must trigger the newer City entry')
    const activeNewerOpen = newerOpen
    const opened = await activeNewerOpen
    assert.equal(opened.active, true)
    assert.equal(readCitySimSnapshot().active, true)
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
    assert.equal(isGeospatialModeEnabled(), true)

    useGympgrphStore.setState({
      setGeospatialModeEnabled: originalSetGeospatialModeEnabled,
    })
    const restored = await exitCitySimSurfaceAndWait()
    assert.equal(restored.active, false)
    assert.equal(readGeospatialOverlayEnabledPreference(), false)
    assert.equal(isGeospatialModeEnabled(), false)
  } finally {
    useGympgrphStore.setState({
      setGeospatialModeEnabled: originalSetGeospatialModeEnabled,
    })
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(priorGeospatialEnabled)
    setGeospatialModeEnabled(priorGeospatialEnabled)
    useGraphStore.setState(priorStore as never)
    restore()
  }
}

export async function testCitySimExitWaitsForPendingGeoClaimRollback() {
  const { dom, restore } = initJsdomHarness()
  const previousEvent = globalThis.Event
  const previousCustomEvent = globalThis.CustomEvent
  const priorStore = captureStoreState()
  const priorGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  let exitSettled = false
  let exitWasPendingAfterClaim = false
  let geoPreferenceDuringClaim = false
  let pendingExit: ReturnType<typeof exitCitySimSurfaceAndWait> | null = null
  let resolveClaimObservation = () => void 0
  const claimObserved = new Promise<void>(resolve => {
    resolveClaimObservation = resolve
  })
  let sawGeoClaim = false
  let unsubscribe = () => void 0
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
    unsubscribe = onGeospatialModeChanged(detail => {
      if (detail.enabled !== true || sawGeoClaim) return
      sawGeoClaim = true
      pendingExit = exitCitySimSurfaceAndWait().then(result => {
        exitSettled = true
        return result
      })
      queueMicrotask(() => {
        geoPreferenceDuringClaim = readGeospatialOverlayEnabledPreference()
        exitWasPendingAfterClaim = !exitSettled
        resolveClaimObservation()
      })
    })

    const opening = openCitySimSurface({
      previousCanvasSurface: previous,
      webglSupported: true,
      workspace: createCityWorkspace(),
    })
    const observationTimeout = setTimeout(
      resolveClaimObservation,
      1_000,
    )
    await claimObserved
    clearTimeout(observationTimeout)
    assert.equal(sawGeoClaim, true)
    assert.equal(
      geoPreferenceDuringClaim,
      true,
      'the controlled Exit must supersede City after its Geo=true commit begins',
    )
    assert.equal(
      exitWasPendingAfterClaim,
      true,
      'Exit must wait for the superseded opening to roll Geo ownership back',
    )

    await opening
    assert.ok(pendingExit)
    const activePendingExit = pendingExit
    const restored = await activePendingExit
    assert.equal(restored.active, false)
    assert.equal(exitSettled, true)
    assert.equal(readGeospatialOverlayEnabledPreference(), false)
    assert.equal(isGeospatialModeEnabled(), false)
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(useGraphStore.getState().floatingPanelView, 'flightSim')
  } finally {
    unsubscribe()
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

export async function testCitySimSurfacesSupersededGeoRollbackFailure() {
  const { dom, restore } = initJsdomHarness()
  const previousEvent = globalThis.Event
  const previousCustomEvent = globalThis.CustomEvent
  const priorStore = captureStoreState()
  const priorGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  const originalSetGeospatialModeEnabled =
    useGympgrphStore.getState().setGeospatialModeEnabled
  let blockRollback = false
  let pendingExit: ReturnType<typeof exitCitySimSurfaceAndWait> | null = null
  let sawGeoClaim = false
  let unsubscribe = () => void 0
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
    useGympgrphStore.setState({
      setGeospatialModeEnabled: enabled => {
        if (!enabled && blockRollback) return
        originalSetGeospatialModeEnabled(enabled)
      },
    })
    unsubscribe = onGeospatialModeChanged(detail => {
      if (detail.enabled !== true || sawGeoClaim) return
      sawGeoClaim = true
      blockRollback = true
      pendingExit = exitCitySimSurfaceAndWait()
    })

    const opening = openCitySimSurface({
      previousCanvasSurface: previous,
      webglSupported: true,
      workspace: createCityWorkspace(),
    })
    const opened = await opening
    assert.ok(pendingExit)
    const activePendingExit = pendingExit
    const restored = await activePendingExit
    assert.equal(sawGeoClaim, true)
    assert.equal(opened.active, false)
    assert.equal(restored.active, false)
    assert.equal(restored.phase, 'error')
    assert.equal(restored.lastResult?.code, 'surface-restoration-failed')
    assert.match(
      restored.message,
      /Prior Geo ownership could not be restored/,
    )
    assert.equal(
      isGeospatialModeEnabled(),
      true,
      'the injected rollback refusal must leave the ownership mismatch visible',
    )
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
  } finally {
    unsubscribe()
    useGympgrphStore.setState({
      setGeospatialModeEnabled: originalSetGeospatialModeEnabled,
    })
    blockRollback = false
    originalSetGeospatialModeEnabled(priorGeospatialEnabled)
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    writeGeospatialOverlayEnabledPreference(priorGeospatialEnabled)
    useGraphStore.setState(priorStore as never)
    Object.assign(globalThis, {
      Event: previousEvent,
      CustomEvent: previousCustomEvent,
    })
    restore()
  }
}
