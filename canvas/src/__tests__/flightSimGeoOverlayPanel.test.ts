import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  waitForFlightSimSurfaceRestoration,
} from '@/features/game-flight-sim/flightSimRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resetFlightSimTrainingScenarioForTests } from '@/features/game-flight-sim/flightSimTrainingScenario'
import {
  isGeospatialModeEnabled,
  setGeospatialModeEnabled,
} from '@/lib/gympgrph/api'

test('Flight Sim headless entry preserves the visible Geo panel', async () => {
  resetFlightSimRuntimeForTests()
  const graphState = useGraphStore.getState()
  graphState.setFloatingPanelView('geo')
  graphState.setFloatingPanelOpen(true)
  try {
    const opened = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
    })
    assert.equal(opened.active, true)
    assert.equal(useGraphStore.getState().floatingPanelView, 'geo')
    assert.equal(useGraphStore.getState().floatingPanelOpen, true)
  } finally {
    if (readFlightSimSnapshot().active) {
      exitFlightSimSurface({ restorePreviousSurface: false })
    }
    resetFlightSimRuntimeForTests()
  }
})

test('Geo+XR entry reasserts and restores the native Geo owner', async () => {
  setGeospatialModeEnabled(false)
  resetFlightSimRuntimeForTests()
  resetFlightSimTrainingScenarioForTests()
  const previous = useGraphStore.getState()
  const documentName = '/imports/panel-geographic-reference.md'
  const documentText = '---\ngeo_flight_overlay:\n  geographic_reference: { "anchor": [0, 0], "presentationBounds": [[-1, -1], [1, 1]] }\n---\n# Panel geographic fixture\n'
  useGraphStore.setState({ markdownDocumentName: documentName, markdownDocumentText: documentText, sourceFiles: [{ id: 'panel-geography', name: documentName, text: documentText, enabled: true, status: 'parsed', parsedGraphRevision: 1, source: { kind: 'local', path: documentName } }] } as never)
  try {
    const opened = await openFlightSimSurface({
      geospatialComposite: true,
      openPanel: false,
      webglSupported: true,
    })
    assert.equal(opened.active, true)
    assert.equal(isGeospatialModeEnabled(), true)
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')

    exitFlightSimSurface()
    await waitForFlightSimSurfaceRestoration()
    assert.equal(isGeospatialModeEnabled(), false)
  } finally {
    if (readFlightSimSnapshot().active) {
      exitFlightSimSurface({ restorePreviousSurface: false })
    }
    setGeospatialModeEnabled(false)
    resetFlightSimRuntimeForTests()
    resetFlightSimTrainingScenarioForTests()
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})
