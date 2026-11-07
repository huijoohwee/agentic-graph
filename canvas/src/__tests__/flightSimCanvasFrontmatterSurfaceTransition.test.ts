import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

import {
  createCanvasFrontmatterSurfaceTransitionQueue,
  requestCanvasFrontmatterGeospatialSurface,
  waitForActiveCanvasFrontmatterSurfaceTransition,
  waitForCanvasFrontmatterSurfaceTransition,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import {
  captureNativeGeospatialMapLibreLease, claimMapLibreMapLease,
  LS_KEYS, NATIVE_GEOSPATIAL_MAPLIBRE_OWNER, setGeospatialModeEnabled, useGympgrphStore,
} from 'gympgrph'

const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve))

function deferred() {
  let resolvePromise: () => void = () => void 0
  const promise = new Promise<void>(resolve => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

test('frontmatter surface requests serialize Geo off before a following Flight Geo enable', async () => {
  const disposal = deferred()
  const commits: boolean[] = []
  let committedMode = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      if (options.isCurrent?.() === false) return
      commits.push(enabled)
      if (!enabled) await disposal.promise
      committedMode = enabled
      if (options.isCurrent?.() === false) return
      await options.afterCommit?.()
    },
    isCommitted: enabled => committedMode === enabled,
  })

  const disable = transitions.request(false)
  const joinedDisable = transitions.request(false)
  const enable = transitions.request(true)
  await flushMicrotasks()

  assert.equal(joinedDisable, disable)
  assert.deepEqual(commits, [false])

  disposal.resolve()
  await disable
  await flushMicrotasks()
  assert.deepEqual(
    commits,
    [false, true],
    'Flight Geo enable must not overtake the exclusive XR disposal',
  )
  await enable
  await transitions.wait()
  assert.equal(committedMode, true)
})

test('a failed frontmatter surface transition fails its queued successor closed', async () => {
  const commits: boolean[] = []
  let failDisable = true
  let committedMode = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      if (options.isCurrent?.() === false) return
      commits.push(enabled)
      if (!enabled && failDisable) throw new Error('disposal failed')
      committedMode = enabled
      if (options.isCurrent?.() === false) return
      await options.afterCommit?.()
    },
    isCommitted: enabled => committedMode === enabled,
  })

  const disable = transitions.request(false)
  const enable = transitions.request(true)
  await assert.rejects(disable, /disposal failed/)
  await assert.rejects(enable, /disposal failed/)
  assert.deepEqual(commits, [false])
  assert.equal(committedMode, true)

  failDisable = false
  await transitions.request(false)
  assert.deepEqual(commits, [false, false])
  assert.equal(committedMode, false)
})

test('a superseded frontmatter request cannot commit Geo ownership or XR presentation', async () => {
  const entry = deferred()
  const commits: boolean[] = []
  const presentations: string[] = []
  let requestCurrent = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      await entry.promise
      if (options.isCurrent?.() === false) return
      commits.push(enabled)
      await options.afterCommit?.()
    },
    isCommitted: () => false,
  })

  const stale = transitions.request(true, {
    afterCommit: () => {
      presentations.push('flight')
    },
    isCurrent: () => requestCurrent,
  })
  requestCurrent = false
  entry.resolve()

  await stale
  assert.deepEqual(commits, [])
  assert.deepEqual(presentations, [])
})

test('same-direction requests with distinct owners do not join a stale transition', async () => {
  const entry = deferred()
  const commits: string[] = []
  let firstCurrent = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      if (commits.length === 0) await entry.promise
      if (options.isCurrent?.() === false) return
      commits.push(`${String(enabled)}:${String(options.isCurrent?.() ?? true)}`)
      await options.afterCommit?.()
    },
    isCommitted: () => false,
  })

  const first = transitions.request(false, {
    isCurrent: () => firstCurrent,
  })
  firstCurrent = false
  const second = transitions.request(false, {
    isCurrent: () => true,
  })
  assert.notEqual(second, first)
  entry.resolve()

  await first
  await second
  assert.deepEqual(commits, ['false:true'])
})

test('a settled failed frontmatter handoff does not poison a later Flight retry', async context => {
  context.after(() => setGeospatialModeEnabled(false))
  setGeospatialModeEnabled(false)

  await assert.rejects(
    requestCanvasFrontmatterGeospatialSurface(false, {
      afterCommit: () => false,
    }),
    /could not claim ownership/,
  )
  await waitForActiveCanvasFrontmatterSurfaceTransition()
})

test('authored Physics releases Geo while passive replays retain the pending owner and shared XR', async () => {
  const { restore } = initJsdomHarness()
  let releaseLease: (() => void) | null = null
  const xrCanvas = document.createElement('canvas'), mapCanvas = document.createElement('canvas')
  document.body.append(xrCanvas, mapCanvas)
  try {
    assert.equal(captureNativeGeospatialMapLibreLease(), null)
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setCanvas3dMode('xr')
    useGraphStore.getState().setCanvasRenderMode('3d')
    setGeospatialModeEnabled(true)
    let disposed = 0
    releaseLease = claimMapLibreMapLease({ map: { getCanvas: () => mapCanvas }, root: null,
      ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER, prepareForDisposal: () => true,
      isPreparedForDisposal: () => true, dispose: () => { disposed += 1; mapCanvas.remove(); releaseLease?.() } })
    const rawText = readFileSync(resolve(process.cwd(), '..', 'docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'), 'utf8')
    applyCanvasFrontmatterPreset({ rawText })
    // Native compose/default and same-document replays can publish before the
    // authored request has begun its asynchronous lease preparation.
    applyCanvasFrontmatterPreset({ defaultCanvasRenderMode: '3d', defaultCanvas3dMode: '3d', preserveLiveSharedXrSurface: true })
    applyCanvasFrontmatterPreset({ rawText, preserveLiveSharedXrSurface: true })
    await waitForCanvasFrontmatterSurfaceTransition()
    assert.equal(useGympgrphStore.getState().geospatialModeEnabled, false)
    assert.equal(window.localStorage.getItem(LS_KEYS.geospatialOverlayEnabled), 'false')
    assert.equal(disposed, 1)
    assert.equal(captureNativeGeospatialMapLibreLease(), null)
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(xrCanvas.isConnected, true, 'the native Geo owner must release only its own Canvas')
  } finally {
    try { await waitForCanvasFrontmatterSurfaceTransition() } finally {
      releaseLease?.(); setGeospatialModeEnabled(false); useGraphStore.getState().resetAll()
      xrCanvas.remove(); mapCanvas.remove(); restore()
    }
  }
})

test('later explicit XR, Geo+XR and 2D requests still supersede retained passive replays', async () => {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setCanvas3dMode('xr')
    useGraphStore.getState().setCanvasRenderMode('3d')
    setGeospatialModeEnabled(true)
    for (const canvasSurfaceMode of ['xr', 'geo-xr', '2d'] as const) {
      applyCanvasFrontmatterPreset({ preset: { canvasSurfaceMode }, preserveLiveSharedXrSurface: true })
    }
    await waitForCanvasFrontmatterSurfaceTransition()
    assert.equal(useGympgrphStore.getState().geospatialModeEnabled, false)
    assert.equal(window.localStorage.getItem(LS_KEYS.geospatialOverlayEnabled), 'false')
    assert.equal(useGraphStore.getState().canvasRenderMode, '2d')
    assert.notEqual(useGraphStore.getState().canvas3dMode, 'xr', 'stale XR callbacks must not reactivate the later explicit 2D owner')
  } finally {
    try { await waitForCanvasFrontmatterSurfaceTransition() } finally {
      setGeospatialModeEnabled(false); useGraphStore.getState().resetAll(); restore()
    }
  }
})


test('native document selection applies authored Geo ownership after exact editor publication', async () => {
  const { restore } = initJsdomHarness()
  const stateBefore = useGraphStore.getState()
  const name = 'docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'
  const rawText = readFileSync(resolve(process.cwd(), '..', name), 'utf8')
  try {
    for (const publishedFirst of [false, true]) {
      useGraphStore.getState().resetAll()
      const store = useGraphStore.getState()
      store.setMarkdownDocument('previous-flight.md', '# Previous Flight')
      store.setCanvas3dMode('xr'); store.setCanvasRenderMode('3d')
      setGeospatialModeEnabled(true)
      if (publishedFirst) {
        assert.equal(await store.setActiveMarkdownDocument({ name, text: rawText,
          autoEnableFrontmatter: false, applyViewPreset: false }), true)
        assert.equal(useGympgrphStore.getState().geospatialModeEnabled, true)
      }
      const applied = await store.setActiveMarkdownDocument({ name, text: rawText,
        expectedCurrentDocumentName: 'previous-flight.md', expectedCurrentDocumentText: '# Previous Flight',
        applyViewPreset: true, applyToGraph: true, forceApplyToGraph: true })
      assert.equal(applied, true)
      assert.equal(useGympgrphStore.getState().geospatialModeEnabled, false,
        `authored selection must release Geo even when the editor published first: ${publishedFirst}`)
      assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
      assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
      setGeospatialModeEnabled(true)
      assert.equal(await store.setActiveMarkdownDocument({ name, text: rawText,
        applyViewPreset: true, applyToGraph: true, forceApplyToGraph: true }), true)
      assert.equal(useGympgrphStore.getState().geospatialModeEnabled, true,
        'a later same-document refresh must preserve the manually selected Geo+XR surface')
    }
  } finally {
    try { await waitForCanvasFrontmatterSurfaceTransition() } finally {
      setGeospatialModeEnabled(false); useGraphStore.setState(stateBefore, true); restore()
    }
  }
})
