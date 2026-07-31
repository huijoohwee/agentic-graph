import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cityInputSourceFromActivation,
  cityInputSourceFromPointerType,
  describeCityInputSnapshot,
  enqueueCityInput,
  resetCityInputQueueForTests,
  type CityInputSnapshot,
  type CityInputSource,
} from '@/features/game-city-sim/citySimInputRuntime'
import type { CityZoningType } from '@/features/game-city-sim/citySimModel'
import {
  readCitySimSnapshot,
  subscribeCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import { resetCitySimRuntimeForTests } from './citySimAuthoritativeSource'

function readCanvasSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8')
}

export function testCitySimInputQueueCopiesFrozenSnapshotsInFifoOrder() {
  resetCitySimRuntimeForTests({ webglSupported: true })
  resetCityInputQueueForTests()
  const firstInput: {
    source: CityInputSource
    selectParcelId: string | null
    requestedZone: CityZoningType | null
  } = {
    source: 'pointer',
    selectParcelId: 'r00c02',
    requestedZone: 'residential',
  }
  const observedSequences: number[] = []
  let observedSequence = 0
  let secondSnapshot: CityInputSnapshot | null = null
  let queuedReentrantInput = false
  const unsubscribe = subscribeCitySimSnapshot(() => {
    const lastInput = readCitySimSnapshot().lastInput
    if (lastInput && lastInput.sequence !== observedSequence) {
      observedSequence = lastInput.sequence
      observedSequences.push(lastInput.sequence)
    }
    if (lastInput?.sequence === 1 && !queuedReentrantInput) {
      queuedReentrantInput = true
      firstInput.selectParcelId = 'r03c03'
      firstInput.requestedZone = 'industrial'
      secondSnapshot = enqueueCityInput({
        source: 'touch',
        selectParcelId: 'r00c03',
        requestedZone: 'commercial',
      })
    }
  })
  const revisionBefore = readCitySimSnapshot().revision
  try {
    const firstSnapshot = enqueueCityInput(firstInput)
    assert.notEqual(firstSnapshot, firstInput)
    assert.equal(Object.isFrozen(firstSnapshot), true)
    assert.deepEqual(firstSnapshot, {
      source: 'pointer',
      selectParcelId: 'r00c02',
      requestedZone: 'residential',
      sequence: 1,
    })
    assert.ok(secondSnapshot)
    assert.equal(Object.isFrozen(secondSnapshot), true)
    assert.deepEqual(secondSnapshot, {
      source: 'touch',
      selectParcelId: 'r00c03',
      requestedZone: 'commercial',
      sequence: 2,
    })
    assert.deepEqual(observedSequences, [1, 2])
    assert.equal(readCitySimSnapshot().revision, revisionBefore + 2)
    assert.equal(
      readCitySimSnapshot().city.parcels.find(parcel => parcel.id === 'r00c02')?.zone,
      'residential',
    )
    assert.equal(
      readCitySimSnapshot().city.parcels.find(parcel => parcel.id === 'r00c03')?.zone,
      'commercial',
    )
    assert.equal(
      readCitySimSnapshot().city.parcels.find(parcel => parcel.id === 'r03c03')?.zone,
      'unzoned',
    )

    const beforeNoop = JSON.stringify(readCitySimSnapshot())
    assert.throws(
      () => enqueueCityInput({
        source: 'keyboard',
        selectParcelId: null,
        requestedZone: null,
      }),
      /must select a parcel or request a zone/,
    )
    assert.equal(JSON.stringify(readCitySimSnapshot()), beforeNoop)
    const next = enqueueCityInput({
      source: 'keyboard',
      selectParcelId: 'r01c01',
      requestedZone: null,
    })
    assert.equal(next.sequence, 3, 'rejected no-op input must not consume a sequence')
  } finally {
    unsubscribe()
  }
}

export function testCitySimInputSourceAndSequenceProjectThroughSharedSnapshot() {
  resetCitySimRuntimeForTests({ webglSupported: true })
  resetCityInputQueueForTests()
  assert.equal(cityInputSourceFromPointerType('touch'), 'touch')
  assert.equal(cityInputSourceFromPointerType('mouse'), 'pointer')
  assert.equal(cityInputSourceFromActivation({ detail: 0 }), 'keyboard')
  assert.equal(
    cityInputSourceFromActivation({ detail: 1, pointerType: 'touch' }),
    'touch',
  )
  const pointer = enqueueCityInput({
    source: 'pointer',
    selectParcelId: 'r00c00',
    requestedZone: null,
  })
  const keyboard = enqueueCityInput({
    source: 'keyboard',
    selectParcelId: null,
    requestedZone: 'commercial',
  })
  const touch = enqueueCityInput({
    source: 'touch',
    selectParcelId: 'r00c01',
    requestedZone: null,
  })
  assert.deepEqual(
    [pointer, keyboard, touch].map(input => [input.source, input.sequence]),
    [['pointer', 1], ['keyboard', 2], ['touch', 3]],
  )
  assert.equal(keyboard.selectParcelId, 'r00c00')
  assert.equal(
    readCitySimSnapshot().city.parcels.find(parcel => parcel.id === 'r00c00')?.zone,
    'commercial',
  )
  assert.equal(readCitySimSnapshot().lastInput, touch)
  assert.equal(
    describeCityInputSnapshot(touch),
    'Input #3 · touch · r00c01',
  )

  const inputRuntime = readCanvasSource(
    'features/game-city-sim/citySimInputRuntime.ts',
  )
  const panel = readCanvasSource(
    'features/game-city-sim/CitySimFloatingPanelView.tsx',
  )
  const coordinateControls = readCanvasSource(
    'features/game-city-sim/CityParcelCoordinateControls.tsx',
  )
  const projection = readCanvasSource(
    'features/game-city-sim/CitySimPanelProjection.tsx',
  )
  assert.equal(inputRuntime.match(/const cityInputQueue\b/g)?.length, 1)
  assert.equal(inputRuntime.includes('const listeners'), false)
  assert.equal(inputRuntime.includes('subscribeCityInput'), false)
  assert.ok(inputRuntime.includes('stageCitySimInputForNextPublish(snapshot)'))
  assert.ok(panel.includes('<CityParcelCoordinateControls'))
  assert.ok(coordinateControls.includes("inputSourceRef.current = 'keyboard'"))
  assert.ok(coordinateControls.includes('cityInputSourceFromPointerType(event.pointerType)'))
  assert.ok(projection.includes('snapshot.lastInput?.source'))
  assert.ok(projection.includes('snapshot.lastInput?.sequence'))
}
