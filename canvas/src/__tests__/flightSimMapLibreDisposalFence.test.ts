import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commitCanvasGeospatialSurfaceOwnership,
} from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'
import {
  acquireMapLibreMapDisposalPreparation,
  isMapLibreMapPreparingForDisposal,
  subscribeMapLibreMapDisposalPreparation,
} from '../../../gympgrph/src/features/geospatial/mapLibreHostLease.js'
import {
  claimMapLibreMapLease,
  isGeospatialModeEnabled,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
  setGeospatialModeEnabled,
} from 'gympgrph'

test('MapLibre disposal preparation remains fenced until every holder releases', context => {
  const map = {}
  const transitions: boolean[] = []
  const unsubscribe = subscribeMapLibreMapDisposalPreparation(map, () => {
    transitions.push(isMapLibreMapPreparingForDisposal(map))
  })
  const releaseFirst = acquireMapLibreMapDisposalPreparation(map)
  const releaseSecond = acquireMapLibreMapDisposalPreparation(map)
  context.after(() => {
    releaseFirst()
    releaseSecond()
    unsubscribe()
  })

  assert.equal(isMapLibreMapPreparingForDisposal(map), true)
  assert.deepEqual(transitions, [true])

  releaseFirst()
  releaseFirst()
  assert.equal(isMapLibreMapPreparingForDisposal(map), true)
  assert.deepEqual(
    transitions,
    [true],
    'partial and duplicate release must not reopen Flight publication',
  )

  releaseSecond()
  assert.equal(isMapLibreMapPreparingForDisposal(map), false)
  assert.deepEqual(transitions, [true, false])
})

test('MapLibre disposal release resumes a fenced presentation subscriber', context => {
  const map = {}
  let presentationAttempts = 0
  const applyWhenAvailable = () => {
    if (!isMapLibreMapPreparingForDisposal(map)) {
      presentationAttempts += 1
    }
  }
  const unsubscribe = subscribeMapLibreMapDisposalPreparation(
    map,
    applyWhenAvailable,
  )
  const release = acquireMapLibreMapDisposalPreparation(map)
  context.after(() => {
    release()
    unsubscribe()
  })

  assert.equal(presentationAttempts, 0)
  applyWhenAvailable()
  assert.equal(
    presentationAttempts,
    0,
    'a preparation fence must suppress Flight publication',
  )

  release()
  assert.equal(
    presentationAttempts,
    1,
    'the final release must notify the presentation owner to retry',
  )
})

test('exclusive Canvas handoff directly disposes the canonical MapLibre lease', async context => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const ownedCanvas = { isConnected: true } as HTMLCanvasElement
  let frameSequence = 0
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      cancelAnimationFrame: () => void 0,
      clearTimeout,
      dispatchEvent: () => true,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const frameId = ++frameSequence
        setImmediate(() => callback(Date.now()))
        return frameId
      },
      setTimeout,
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector: () => ownedCanvas.isConnected ? ownedCanvas : null,
    },
  })
  let disposalCount = 0
  let releaseLease = () => void 0
  releaseLease = claimMapLibreMapLease({
    dispose: () => {
      disposalCount += 1
      Object.assign(ownedCanvas, { isConnected: false })
      releaseLease()
    },
    isPreparedForDisposal: () => true,
    map: { getCanvas: () => ownedCanvas },
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    prepareForDisposal: () => true,
    root: null,
  })
  context.after(() => {
    releaseLease()
    setGeospatialModeEnabled(false)
    if (windowDescriptor) {
      Object.defineProperty(globalThis, 'window', windowDescriptor)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
    if (documentDescriptor) {
      Object.defineProperty(globalThis, 'document', documentDescriptor)
    } else {
      delete (globalThis as { document?: unknown }).document
    }
  })
  setGeospatialModeEnabled(true)

  await commitCanvasGeospatialSurfaceOwnership(false)

  assert.equal(disposalCount, 1)
  assert.equal(isGeospatialModeEnabled(), false)
})

test('failed exclusive preparation cancels the claimed MapLibre fence', async context => {
  const map = {}
  let cancellationCount = 0
  let preparationCount = 0
  const releaseLease = claimMapLibreMapLease({
    cancelDisposalPreparation: () => {
      cancellationCount += 1
    },
    map,
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    prepareForDisposal: () => {
      preparationCount += 1
      return false
    },
    root: null,
  })
  context.after(releaseLease)

  await assert.rejects(
    commitCanvasGeospatialSurfaceOwnership(false),
    /MapLibre Flight sources could not be cleared/,
  )
  assert.equal(preparationCount, 1)
  assert.equal(
    cancellationCount,
    1,
    'a failed handoff must reopen the current map to Flight publication',
  )
})

test('exclusive preparation retries a pending style source on the next frame', async context => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let frameSequence = 0
  const pendingFrames = new Map<number, ReturnType<typeof setImmediate>>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      cancelAnimationFrame: (frameId: number) => {
        const handle = pendingFrames.get(frameId)
        if (handle) clearImmediate(handle)
        pendingFrames.delete(frameId)
      },
      clearTimeout,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const frameId = ++frameSequence
        const handle = setImmediate(() => {
          pendingFrames.delete(frameId)
          callback(Date.now())
        })
        pendingFrames.set(frameId, handle)
        return frameId
      },
      setTimeout,
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector: () => null,
    },
  })
  context.after(() => {
    for (const handle of pendingFrames.values()) clearImmediate(handle)
    if (windowDescriptor) {
      Object.defineProperty(globalThis, 'window', windowDescriptor)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
    if (documentDescriptor) {
      Object.defineProperty(globalThis, 'document', documentDescriptor)
    } else {
      delete (globalThis as { document?: unknown }).document
    }
  })

  let prepared = false
  let preparationCount = 0
  let cancellationCount = 0
  let releaseLease = () => void 0
  releaseLease = claimMapLibreMapLease({
    cancelDisposalPreparation: () => {
      cancellationCount += 1
    },
    isPreparedForDisposal: () => prepared,
    map: {},
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    prepareForDisposal: () => {
      preparationCount += 1
      if (preparationCount === 1) return true
      prepared = true
      releaseLease()
      return true
    },
    root: null,
  })
  context.after(releaseLease)

  await commitCanvasGeospatialSurfaceOwnership(false)
  assert.equal(preparationCount, 2)
  assert.equal(cancellationCount, 0)
})

test('a post-commit disposal failure restores Geo ownership and releases the fence', async context => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const ownedCanvas = { isConnected: true } as HTMLCanvasElement
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      cancelAnimationFrame: () => void 0,
      clearTimeout,
      dispatchEvent: () => true,
      requestAnimationFrame: () => 1,
      setTimeout: (callback: () => void) => {
        queueMicrotask(callback)
        return 1
      },
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector: () => ownedCanvas,
    },
  })

  let cancellationCount = 0
  const map = { getCanvas: () => ownedCanvas }
  let releasePreparation: (() => void) | null = null
  const releaseLease = claimMapLibreMapLease({
    cancelDisposalPreparation: () => {
      cancellationCount += 1
      releasePreparation?.()
      releasePreparation = null
    },
    isPreparedForDisposal: () => true,
    map,
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    prepareForDisposal: () => {
      releasePreparation ??= acquireMapLibreMapDisposalPreparation(map)
      return true
    },
    root: null,
  })
  context.after(() => {
    releasePreparation?.()
    releaseLease()
    setGeospatialModeEnabled(false)
    if (windowDescriptor) {
      Object.defineProperty(globalThis, 'window', windowDescriptor)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
    if (documentDescriptor) {
      Object.defineProperty(globalThis, 'document', documentDescriptor)
    } else {
      delete (globalThis as { document?: unknown }).document
    }
  })
  setGeospatialModeEnabled(true)

  await assert.rejects(
    commitCanvasGeospatialSurfaceOwnership(false),
    /MapLibre did not release/,
  )
  assert.equal(
    isGeospatialModeEnabled(),
    true,
    'the prior Geo owner must be restored after post-commit disposal failure',
  )
  assert.equal(
    cancellationCount,
    1,
    'rollback must release the MapLibre preparation fence',
  )
  assert.equal(isMapLibreMapPreparingForDisposal(map), false)
})

test('a failed exclusive XR presentation restores the prior Geo owner', async context => {
  context.after(() => setGeospatialModeEnabled(false))
  setGeospatialModeEnabled(true)
  let modeDuringPresentation: boolean | null = null

  await assert.rejects(
    commitCanvasGeospatialSurfaceOwnership(false, {
      afterCommit: () => {
        modeDuringPresentation = isGeospatialModeEnabled()
        return false
      },
    }),
    /could not claim ownership/,
  )
  assert.equal(modeDuringPresentation, false)
  assert.equal(
    isGeospatialModeEnabled(),
    true,
    'an unavailable XR owner must not strand the previous Geo surface off',
  )
})
