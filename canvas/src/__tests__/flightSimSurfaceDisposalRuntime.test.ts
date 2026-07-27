import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  waitForFlightSimSurfaceRestoration,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  captureFlightSimPreviousCanvasSurface,
  restoreFlightSimPreviousCanvasSurface,
  type FlightSimPreviousCanvasSurface,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipRuntime'
import {
  readFlightSimSurfaceOwnershipStatus,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipStatus'
import {
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readGeospatialOverlayEnabledPreference,
  writeGeospatialOverlayEnabledPreference,
} from '@/lib/geospatial/geospatialModePreference'
import {
  claimMapLibreMapLease,
  isGeospatialModeEnabled,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
  readActiveMapLibreMap,
  setGeospatialModeEnabled as setGympgrphGeospatialModeEnabled,
} from 'gympgrph'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

const EMPTY_WORKSPACE = {
  readFileText: async () => null,
} as unknown as WorkspaceFs

const GEO_CANVAS_MARKUP = `
  <canvas id="shared-xr-canvas"></canvas>
  <section data-kg-geo-xr-layer="geo-background">
    <canvas id="owned-geo-map" class="maplibregl-canvas"></canvas>
  </section>
`

type TestWindow = Window & typeof globalThis

type ControlledRaf = Readonly<{
  flushNext: () => Promise<void>
  pendingCount: () => number
  waitForPending: () => Promise<void>
}>

type HeldTimeouts = Readonly<{
  fireNext: () => void
  pendingCount: () => number
  restore: () => void
}>

function installControlledRaf(window: TestWindow): ControlledRaf {
  let nextFrameId = 1
  const frames = new Map<number, FrameRequestCallback>()
  window.requestAnimationFrame = callback => {
    const frameId = nextFrameId
    nextFrameId += 1
    frames.set(frameId, callback)
    return frameId
  }
  window.cancelAnimationFrame = frameId => {
    frames.delete(frameId)
  }
  return {
    flushNext: async () => {
      const entry = frames.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined
      assert.ok(entry, 'expected a pending surface-disposal animation frame')
      frames.delete(entry[0])
      entry[1](performance.now())
      await Promise.resolve()
    },
    pendingCount: () => frames.size,
    waitForPending: async () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (frames.size > 0) return
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      assert.fail('surface restoration did not schedule an animation frame')
    },
  }
}

function holdWindowTimeouts(window: TestWindow): HeldTimeouts {
  const originalSetTimeout = window.setTimeout.bind(window)
  const originalClearTimeout = window.clearTimeout.bind(window)
  let nextTimeoutId = 1
  const timeouts = new Map<number, () => void>()
  window.setTimeout = ((handler: TimerHandler, _timeout?: number) => {
    assert.equal(typeof handler, 'function')
    const timeoutId = nextTimeoutId
    nextTimeoutId += 1
    timeouts.set(timeoutId, handler as () => void)
    return timeoutId
  }) as typeof window.setTimeout
  window.clearTimeout = (timeoutId?: number) => {
    if (typeof timeoutId === 'number') timeouts.delete(timeoutId)
  }
  return {
    fireNext: () => {
      const entry = timeouts.entries().next().value as
        | [number, () => void]
        | undefined
      assert.ok(entry, 'expected a pending surface-disposal timeout')
      timeouts.delete(entry[0])
      entry[1]()
    },
    pendingCount: () => timeouts.size,
    restore: () => {
      window.setTimeout = originalSetTimeout
      window.clearTimeout = originalClearTimeout
    },
  }
}

async function withSurfaceDom(
  markup: string,
  run: (window: TestWindow, document: Document) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM(
    `<!doctype html><html><body>${markup}</body></html>`,
    { url: 'http://127.0.0.1/' },
  )
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    localStorage: globalThis.localStorage,
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage,
  })
  try {
    await run(dom.window as unknown as TestWindow, dom.window.document)
  } finally {
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
    writeGeospatialOverlayEnabledPreference(false)
    setGympgrphGeospatialModeEnabled(false)
    useGraphStore.getState().resetAll()
    Object.assign(globalThis, previousGlobals)
    dom.window.close()
  }
}

function stageGeoRestorationTarget(): FlightSimPreviousCanvasSurface {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  useGraphStore.getState().resetAll()
  writeGeospatialOverlayEnabledPreference(false)
  setGympgrphGeospatialModeEnabled(false)
  const previous = captureFlightSimPreviousCanvasSurface()
  useGraphStore.setState({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    canvasRenderModeLastFree: '3d',
    canvasRenderModeIsAuto: false,
    floatingPanelOpen: true,
    floatingPanelView: 'flightSim',
  } as never)
  writeGeospatialOverlayEnabledPreference(true)
  setGympgrphGeospatialModeEnabled(true)
  return previous
}

test('non-Geo restoration requires two consecutive released animation frames', async () => {
  await withSurfaceDom(GEO_CANVAS_MARKUP, async (window, document) => {
    const ownedCanvas = document.querySelector<HTMLCanvasElement>('#owned-geo-map')
    assert.ok(ownedCanvas)
    const releaseOwnedLease = claimMapLibreMapLease({
      map: { getCanvas: () => ownedCanvas },
      ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
      root: ownedCanvas.parentElement,
    })
    assert.ok(readActiveMapLibreMap())
    const controlledRaf = installControlledRaf(window)
    const previous = stageGeoRestorationTarget()
    let settled = false
    const restoration = restoreFlightSimPreviousCanvasSurface(previous)
      .then(result => {
        settled = true
        return result
      })

    await controlledRaf.waitForPending()
    ownedCanvas.remove()
    releaseOwnedLease()
    await controlledRaf.flushNext()
    assert.equal(settled, false, 'one released frame must not finish disposal')
    await controlledRaf.waitForPending()
    await controlledRaf.flushNext()

    assert.equal(await restoration, null)
    assert.equal(settled, true)
    assert.equal(isGeospatialModeEnabled(), false)
    assert.equal(readActiveMapLibreMap(), null)
  })
})

test('non-Geo restoration fails on its wall-clock deadline when rAF stalls', async () => {
  await withSurfaceDom(GEO_CANVAS_MARKUP, async window => {
    const controlledRaf = installControlledRaf(window)
    const previous = stageGeoRestorationTarget()
    const startedAt = performance.now()

    const failure = await restoreFlightSimPreviousCanvasSurface(previous)
    const elapsedMs = performance.now() - startedAt

    assert.match(
      failure || '',
      /MapLibre did not release the restored non-Geo Canvas surface/,
    )
    assert.ok(
      elapsedMs >= 900,
      `surface deadline returned before wall-clock expiry (${elapsedMs} ms)`,
    )
    assert.equal(controlledRaf.pendingCount(), 0)
  })
})

test('a stale restoration failure cannot poison a newer active Flight lifecycle', async () => {
  await withSurfaceDom(GEO_CANVAS_MARKUP, async (window, document) => {
    const previous = stageGeoRestorationTarget()
    const opened = await openFlightSimSurface({
      previousCanvasSurface: previous,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(opened.active, true, opened.runtimeError || undefined)

    const controlledRaf = installControlledRaf(window)
    const heldTimeouts = holdWindowTimeouts(window)
    exitFlightSimSurface()
    const staleRestoration = waitForFlightSimSurfaceRestoration()
    await controlledRaf.waitForPending()
    assert.equal(heldTimeouts.pendingCount(), 1)

    resetFlightSimRuntimeForTests()
    heldTimeouts.restore()
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: undefined,
      writable: true,
    })
    writeGeospatialOverlayEnabledPreference(true)
    setGympgrphGeospatialModeEnabled(true)
    const currentPrevious = captureFlightSimPreviousCanvasSurface()
    useGraphStore.setState({
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      canvasRenderModeLastFree: '3d',
      canvasRenderModeIsAuto: false,
      floatingPanelOpen: true,
      floatingPanelView: 'flightSim',
    } as never)
    const current = await openFlightSimSurface({
      previousCanvasSurface: currentPrevious,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(current.active, true, current.runtimeError || undefined)

    heldTimeouts.fireNext()
    const staleResult = await staleRestoration
    assert.equal(staleResult.active, true)
    assert.equal(staleResult.runtimeError, null)
    assert.equal(readFlightSimSnapshot().active, true)
    assert.equal(readFlightSimSnapshot().runtimeError, null)
    assert.equal(readFlightSimSurfaceOwnershipStatus().failure, null)
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
    assert.equal(isGeospatialModeEnabled(), true)
    assert.ok(document.querySelector('#owned-geo-map')?.isConnected)

    exitFlightSimSurface({ restorePreviousSurface: false })
  })
})

test('an unrelated inline MapLibre canvas does not block owned Geo disposal', async () => {
  await withSurfaceDom(
    `${GEO_CANVAS_MARKUP}
      <section data-kg-inline-map="markdown">
        <canvas id="unrelated-inline-map" class="maplibregl-canvas"></canvas>
      </section>
    `,
    async (window, document) => {
      const ownedCanvas = document.querySelector<HTMLCanvasElement>('#owned-geo-map')
      const inlineCanvas = document.querySelector<HTMLCanvasElement>('#unrelated-inline-map')
      assert.ok(ownedCanvas)
      assert.ok(inlineCanvas)
      const releaseOwnedLease = claimMapLibreMapLease({
        map: { getCanvas: () => ownedCanvas },
        ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
        root: ownedCanvas.parentElement,
      })
      const releaseInlineLease = claimMapLibreMapLease({
        map: { getCanvas: () => inlineCanvas },
        ownerScope: 'embedded-preview',
        root: inlineCanvas.parentElement,
      })
      assert.ok(readActiveMapLibreMap())
      const controlledRaf = installControlledRaf(window)
      const previous = stageGeoRestorationTarget()
      const restoration = restoreFlightSimPreviousCanvasSurface(previous)

      await controlledRaf.waitForPending()
      ownedCanvas.remove()
      releaseOwnedLease()
      await controlledRaf.flushNext()
      await controlledRaf.waitForPending()
      await controlledRaf.flushNext()

      assert.equal(await restoration, null)
      assert.ok(inlineCanvas.isConnected)
      assert.equal(readActiveMapLibreMap(), null)
      releaseInlineLease()
    },
  )
})
