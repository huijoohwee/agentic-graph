import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  waitForFlightSimSurfaceRestoration,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  captureFlightSimPreviousCanvasSurface,
  FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS,
  restoreFlightSimPreviousCanvasSurface,
  type FlightSimPreviousCanvasSurface,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipRuntime'
import {
  commitCanvasGeospatialModeEnabled,
} from '@/features/geospatial/geospatialModeCommit'
import {
  commitCanvasGeospatialSurfaceOwnership,
} from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'
import {
  onGeospatialModeChanged,
} from '@/features/geospatial/events'
import {
  readFlightSimSurfaceOwnershipStatus,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipStatus'
import {
  developAndRunXrNativeControllerDemo,
  exitXrNativeControllerDemo,
  readSharedXrNativeControllerDemoFrame,
  readXrNativeControllerDemo,
  stepSharedXrNativeControllerDemo,
} from '@/features/three/xrNativeControllerDemoRuntime'
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
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

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
      const deadline =
        performance.now() + FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS
      while (performance.now() < deadline) {
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
  let nextTimeoutId = 1_000_000
  const timeouts = new Map<number, () => void>()
  window.setTimeout = ((handler: TimerHandler, timeout?: number) => {
    assert.equal(typeof handler, 'function')
    const surfaceDeadlineThreshold =
      FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS * 0.9
    if (typeof timeout === 'number' && timeout < surfaceDeadlineThreshold) {
      return originalSetTimeout(handler, timeout)
    }
    const timeoutId = nextTimeoutId
    nextTimeoutId += 1
    timeouts.set(timeoutId, handler as () => void)
    return timeoutId
  }) as typeof window.setTimeout
  window.clearTimeout = (timeoutId?: number) => {
    if (typeof timeoutId !== 'number') return
    if (timeouts.delete(timeoutId)) return
    originalClearTimeout(timeoutId)
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
    exitXrNativeControllerDemo()
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

function EventDrivenGeoOwner() {
  const [enabled, setEnabled] = React.useState(true)
  React.useEffect(() => {
    return onGeospatialModeChanged(detail => {
      if (typeof detail.enabled === 'boolean') setEnabled(detail.enabled)
    })
  }, [])
  return enabled
    ? React.createElement(
        'section',
        { 'data-kg-geo-xr-layer': 'geo-background' },
        React.createElement('canvas', { className: 'maplibregl-canvas' }),
      )
    : null
}

test('shared Geo commit disconnects the event-driven owner before returning', async () => {
  const { dom, restore } = initJsdomHarness()
  const previousEvent = globalThis.Event
  const previousCustomEvent = globalThis.CustomEvent
  Object.assign(globalThis, {
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
  })
  const container = dom.window.document.createElement('main')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    writeGeospatialOverlayEnabledPreference(true)
    setGympgrphGeospatialModeEnabled(true)
    await act(async () => {
      root.render(React.createElement(EventDrivenGeoOwner))
    })
    const ownedCanvas = dom.window.document.querySelector<HTMLCanvasElement>(
      '[data-kg-geo-xr-layer="geo-background"] canvas.maplibregl-canvas',
    )
    assert.ok(ownedCanvas?.isConnected)

    let committed: Promise<boolean> | null = null
    await act(async () => {
      committed = commitCanvasGeospatialModeEnabled(false)
      assert.equal(
        ownedCanvas.isConnected,
        false,
        'the Geo owner DOM must commit before disposal observation begins',
      )
      assert.equal(await committed, false)
    })
    assert.ok(committed)
  } finally {
    await act(async () => root.unmount())
    writeGeospatialOverlayEnabledPreference(false)
    setGympgrphGeospatialModeEnabled(false)
    Object.assign(globalThis, {
      Event: previousEvent,
      CustomEvent: previousCustomEvent,
    })
    restore()
  }
})

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

test('exclusive Canvas handoff re-clears Flight sources after style settlement', async () => {
  await withSurfaceDom(GEO_CANVAS_MARKUP, async (window, document) => {
    const ownedCanvas = document.querySelector<HTMLCanvasElement>('#owned-geo-map')
    assert.ok(ownedCanvas)
    let styleLoaded = true
    let preparationCount = 0
    let flightSourcesPopulated = true
    const releaseOwnedLease = claimMapLibreMapLease({
      map: {
        getCanvas: () => ownedCanvas,
        isStyleLoaded: () => styleLoaded,
      },
      ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
      prepareForDisposal: () => {
        preparationCount += 1
        flightSourcesPopulated = false
        styleLoaded = false
        return true
      },
      root: ownedCanvas.parentElement,
    })
    const controlledRaf = installControlledRaf(window)
    stageGeoRestorationTarget()
    let settled = false
    const handoff = commitCanvasGeospatialSurfaceOwnership(false).then(() => {
      settled = true
    })

    await controlledRaf.waitForPending()
    assert.equal(preparationCount, 1)
    assert.equal(
      isGeospatialModeEnabled(),
      true,
      'Geo ownership must remain active while cleared sources settle',
    )
    flightSourcesPopulated = true
    styleLoaded = true
    await controlledRaf.flushNext()

    await controlledRaf.waitForPending()
    assert.equal(preparationCount, 2)
    assert.equal(
      flightSourcesPopulated,
      false,
      'a Flight publication during first settlement must be cleared again',
    )
    assert.equal(isGeospatialModeEnabled(), true)
    styleLoaded = true
    await controlledRaf.flushNext()

    await controlledRaf.waitForPending()
    ownedCanvas.remove()
    releaseOwnedLease()
    await controlledRaf.flushNext()
    await controlledRaf.waitForPending()
    await controlledRaf.flushNext()

    await handoff
    assert.equal(settled, true)
    assert.equal(isGeospatialModeEnabled(), false)
  })
})

test('superseded Flight activation retains the original surface until normal Exit', async () => {
  await withSurfaceDom('', async () => {
    const previous = stageGeoRestorationTarget()
    const opened = await openFlightSimSurface({
      previousCanvasSurface: previous,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(opened.active, true, opened.runtimeError || undefined)

    exitFlightSimSurface({ restorePreviousSurface: false })
    assert.equal(readFlightSimSnapshot().active, false)
    assert.equal(isGeospatialModeEnabled(), true)
    useGraphStore.getState().setFloatingPanelView('cityBuilder')
    const citySurface = captureFlightSimPreviousCanvasSurface()

    const reopened = await openFlightSimSurface({
      previousCanvasSurface: citySurface,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(reopened.active, true, reopened.runtimeError || undefined)

    exitFlightSimSurface()
    await waitForFlightSimSurfaceRestoration()
    const restored = useGraphStore.getState()
    assert.equal(isGeospatialModeEnabled(), previous.geospatialModeEnabled)
    assert.equal(
      readGeospatialOverlayEnabledPreference(),
      previous.geospatialModeEnabled,
    )
    assert.equal(restored.canvasRenderMode, previous.canvasRenderMode)
    assert.equal(restored.canvas3dMode, previous.canvas3dMode)
    assert.equal(restored.floatingPanelOpen, previous.floatingPanelOpen)
    assert.equal(restored.floatingPanelView, previous.floatingPanelView)
  })
})

test('native controller resumes after Geo disposal without advancing its Exit frame', async () => {
  await withSurfaceDom(GEO_CANVAS_MARKUP, async (window, document) => {
    const ownedCanvas = document.querySelector<HTMLCanvasElement>('#owned-geo-map')
    assert.ok(ownedCanvas)
    const releaseOwnedLease = claimMapLibreMapLease({
      map: { getCanvas: () => ownedCanvas },
      ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
      root: ownedCanvas.parentElement,
    })
    try {
      const previous = stageGeoRestorationTarget()
      developAndRunXrNativeControllerDemo()
      stepSharedXrNativeControllerDemo(0.05)
      const authoredFrame = readSharedXrNativeControllerDemoFrame()

      const opened = await openFlightSimSurface({
        previousCanvasSurface: previous,
        webglSupported: true,
        workspace: EMPTY_WORKSPACE,
      })
      assert.equal(opened.active, true, opened.runtimeError || undefined)
      assert.equal(readXrNativeControllerDemo().phase, 'paused')
      const pausedFrame = {
        ...authoredFrame,
        phase: 'paused' as const,
      }
      assert.deepEqual(readSharedXrNativeControllerDemoFrame(), pausedFrame)

      const controlledRaf = installControlledRaf(window)
      exitFlightSimSurface()
      const restoration = waitForFlightSimSurfaceRestoration()
      ownedCanvas.remove()
      releaseOwnedLease()
      for (let frame = 0; frame < 2; frame += 1) {
        stepSharedXrNativeControllerDemo(0.05)
        assert.deepEqual(readSharedXrNativeControllerDemoFrame(), pausedFrame)
        await controlledRaf.waitForPending()
        await controlledRaf.flushNext()
      }
      const exited = await restoration

      assert.equal(exited.active, false)
      assert.equal(exited.runtimeError, null)
      assert.equal(readXrNativeControllerDemo().phase, 'running')
      assert.deepEqual(readSharedXrNativeControllerDemoFrame(), authoredFrame)
      stepSharedXrNativeControllerDemo(0.05)
      assert.ok(
        readSharedXrNativeControllerDemoFrame().stepCount > authoredFrame.stepCount,
        'the restored authored controller must advance on its next frame',
      )
    } finally {
      releaseOwnedLease()
    }
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
