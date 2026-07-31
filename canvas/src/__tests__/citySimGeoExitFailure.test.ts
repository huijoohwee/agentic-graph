import assert from 'node:assert/strict'
import { controlLocalCitySim } from '@/features/game-city-sim/citySimMcpRuntime'
import {
  exitCitySimSurface,
  openCitySimSurface,
  readCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import { resetCitySimRuntimeForTests } from './citySimAuthoritativeSource'
import {
  captureCitySimPreviousCanvasSurface,
} from '@/features/game-city-sim/citySimSurfaceOwnership'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readGeospatialOverlayEnabledPreference,
  writeGeospatialOverlayEnabledPreference,
} from '@/lib/geospatial/geospatialModePreference'
import {
  isGeospatialModeEnabled,
  setGeospatialModeEnabled,
  useGympgrphStore,
} from 'gympgrph'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  captureStoreState,
  createCityWorkspace,
  prepareCitySurface,
} from './helpers/citySimRuntimeHarness'

export async function testCitySimExitSurfacesGeoRestorationFailure() {
  const { dom, restore } = initJsdomHarness()
  const previousEvent = globalThis.Event
  const previousCustomEvent = globalThis.CustomEvent
  const priorStore = captureStoreState()
  const priorGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  const originalSetGeospatialModeEnabled =
    useGympgrphStore.getState().setGeospatialModeEnabled
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

    useGympgrphStore.setState({
      setGeospatialModeEnabled: () => undefined,
    })
    const [failedExit, duplicateFailedExit] = await Promise.all([
      controlLocalCitySim({ operation: 'exit' }),
      controlLocalCitySim({ operation: 'exit' }),
    ])

    for (const result of [failedExit, duplicateFailedExit]) {
      assert.equal(result.ok, false)
      assert.ok('operation' in result)
      assert.equal(result.operation, 'exit')
      assert.equal(result.code, 'surface-restoration-failed')
      assert.match(result.message, /Geo mode committed true instead of false/)
    }
    assert.equal(readCitySimSnapshot().active, false)
    assert.equal(readCitySimSnapshot().phase, 'error')
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
    assert.equal(isGeospatialModeEnabled(), true)
  } finally {
    useGympgrphStore.setState({
      setGeospatialModeEnabled: originalSetGeospatialModeEnabled,
    })
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
