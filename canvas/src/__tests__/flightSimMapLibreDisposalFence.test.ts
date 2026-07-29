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
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
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
