import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createContext, Script } from 'node:vm'
import ts from 'typescript'
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

function preloadHarness(environment: Record<string, unknown>, preload: () => Promise<void>) {
  const source = readFileSync(resolve(process.cwd(), 'src/features/geospatial/gympgrphBridge.ts'), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} as { preloadGeospatialMapRuntime: () => Promise<void> } }
  let imports = 0
  const context = createContext({
    ...environment, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === 'gympgrph') {
        imports += 1
        return { preloadMapLibreBasemapRuntime: preload }
      }
      assert.ok([
        'grph-shared/geospatial/events',
        '@/lib/geospatial/geospatialModePreference',
      ].includes(specifier), `Unexpected bridge import: ${specifier}`)
      return {}
    },
  })
  new Script(output.outputText, { filename: 'gympgrphBridge.cjs' }).runInContext(context, { timeout: 2_000 })
  return { preload: module.exports.preloadGeospatialMapRuntime, imports: () => imports }
}

test('native map preload skips browser dependencies without presentation capability', async () => {
  for (const environment of [
    { document: {} },
    { window: { requestAnimationFrame: () => 1 } },
    { window: {}, document: {} },
  ]) {
    const harness = preloadHarness(environment, async () => {
      assert.fail('Headless presentation must not preload a browser worker')
    })
    await harness.preload()
    assert.equal(harness.imports(), 0)
  }
})

test('native map browser preload awaits the worker runtime', { timeout: 5_000 }, async () => {
  let release!: () => void
  let started!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  const called = new Promise<void>(resolve => { started = resolve })
  const harness = preloadHarness({ window: { requestAnimationFrame: () => 1 }, document: {} }, () => {
    started()
    return barrier
  })
  let settled = false
  const pending = harness.preload().then(() => { settled = true })
  await called
  assert.equal(harness.imports(), 1)
  assert.equal(settled, false)
  release()
  await pending
  assert.equal(settled, true)
})

test('native map browser preload propagates worker failure', async () => {
  const failure = new Error('worker preload failed')
  const harness = preloadHarness({ window: { requestAnimationFrame: () => 1 }, document: {} }, async () => {
    throw failure
  })
  await assert.rejects(harness.preload(), error => error === failure)
  assert.equal(harness.imports(), 1)
})

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
