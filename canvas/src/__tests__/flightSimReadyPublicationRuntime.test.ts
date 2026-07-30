import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginFlightSimReadyFrame,
  cancelCurrentFlightSimReadyFrame,
  cancelFlightSimReadyFrame,
  claimFlightSimReadyPresenter,
  completeFlightSimMapLibreReadyFrame,
  completeFlightSimReadyFrame,
  coordinateFlightSimReadyPublication,
  isFlightSimReadyFramePresentationPending,
  readCurrentFlightSimReadyFrameRequestId,
  readFlightSimDeadlineSnapshot,
  resetFlightSimDeadlineRuntimeForTests,
} from '../features/game-flight-sim/flightSimDeadlineRuntime'
import {
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  type FlightSimSpatialProfile,
} from '../features/game-flight-sim/flightSimModel'
import { createFlightSimRuntime } from '../features/game-flight-sim/flightSimRuntime'

function profile(): FlightSimSpatialProfile {
  const radiusMeters = FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS
  return Object.freeze({
    id: 'flight-sim:ready-publication-test',
    sourceKey: 'authored:ready-publication-test',
    aircraftHalfSize: Object.freeze([0.5, 0.5, 0.5] as const),
    spawn: Object.freeze({
      position: Object.freeze([0, 20, 0] as const),
      velocity: Object.freeze([0, 0, -10] as const),
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.6,
    }),
    blockers: Object.freeze([]),
    waypoints: Object.freeze([
      Object.freeze({ id: 'waypoint-1', position: Object.freeze([0, 20, -200] as const), radiusMeters }),
      Object.freeze({ id: 'waypoint-2', position: Object.freeze([0, 20, -400] as const), radiusMeters }),
      Object.freeze({ id: 'waypoint-3', position: Object.freeze([0, 20, -600] as const), radiusMeters }),
    ]),
    landingPad: Object.freeze({
      id: 'landing-pad',
      position: Object.freeze([0, 0, -800] as const),
      radiusMeters,
    }),
  })
}

function coordinatedRuntime() {
  return createFlightSimRuntime({
    profile: profile(),
    active: true,
    webglSupported: true,
    cancelReadyPublication: cancelCurrentFlightSimReadyFrame,
    coordinateReadyPublication: coordinateFlightSimReadyPublication,
  })
}

test('ready publication arms one native presenter before releasing followers', async () => {
  resetFlightSimDeadlineRuntimeForTests()
  const runtime = coordinatedRuntime()
  const events: string[] = []
  runtime.subscribePresenter('maplibre', () => {
    const snapshot = runtime.read()
    assert.equal(
      isFlightSimReadyFramePresentationPending(snapshot.runId, snapshot.tick),
      true,
    )
    events.push('maplibre')
  })
  runtime.subscribePresenter('surface', () => {
    events.push('surface')
  })
  runtime.subscribeHud(() => {
    events.push('hud')
  })
  runtime.subscribe(() => {
    assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.withinLimit, true)
    events.push('follower')
  })

  const requestId = beginFlightSimReadyFrame(() => 100)
  const ready = runtime.start()
  assert.equal(ready.phase, 'ready')
  assert.deepEqual(events, ['maplibre', 'hud'])
  assert.equal(completeFlightSimReadyFrame(ready.runId, ready.tick, () => 110), null)
  assert.equal(isFlightSimReadyFramePresentationPending(ready.runId, ready.tick), true)

  const observation = completeFlightSimMapLibreReadyFrame(
    requestId,
    ready.runId,
    ready.tick,
    () => 116,
  )
  assert.equal(observation?.elapsedMs, 16)
  assert.deepEqual(events, ['maplibre', 'hud'])
  await Promise.resolve()
  assert.deepEqual(events, ['maplibre', 'hud', 'surface', 'follower'])
})

test('shared XR remains the ready presenter when no native MapLibre owner exists', async () => {
  resetFlightSimDeadlineRuntimeForTests()
  const runtime = coordinatedRuntime()
  const events: string[] = []
  runtime.subscribePresenter('surface', () => {
    events.push('surface')
  })
  runtime.subscribe(() => {
    events.push('follower')
  })

  const requestId = beginFlightSimReadyFrame(() => 200)
  const ready = runtime.start()
  assert.deepEqual(events, ['surface'])
  assert.equal(
    completeFlightSimMapLibreReadyFrame(
      requestId,
      ready.runId,
      ready.tick,
      () => 210,
    ),
    null,
  )
  assert.equal(isFlightSimReadyFramePresentationPending(ready.runId, ready.tick), true)
  const observation = completeFlightSimReadyFrame(
    ready.runId,
    ready.tick,
    () => 216,
  )
  assert.equal(observation?.source, 'shared-flight-surface-ready-frame')
  assert.equal(observation?.elapsedMs, 16)
  await Promise.resolve()
  assert.deepEqual(events, ['surface', 'follower'])
})

test('Geo+XR reserves MapLibre while its asynchronous presenter registers', async context => {
  resetFlightSimDeadlineRuntimeForTests()
  const releaseClaim = claimFlightSimReadyPresenter('maplibre')
  context.after(releaseClaim)
  const runtime = coordinatedRuntime()
  const events: string[] = []
  runtime.subscribePresenter('surface', () => {
    events.push('surface')
  })
  runtime.subscribe(() => {
    events.push('follower')
  })
  const requestId = beginFlightSimReadyFrame(() => 300)
  const ready = runtime.start()
  assert.deepEqual(events, [])
  assert.equal(isFlightSimReadyFramePresentationPending(ready.runId, ready.tick), true)

  runtime.subscribePresenter('maplibre', () => {
    events.push('maplibre')
  })
  runtime.acknowledgeDecisions([])
  assert.deepEqual(events, ['maplibre'])
  const observation = completeFlightSimMapLibreReadyFrame(
    requestId,
    ready.runId,
    ready.tick,
    () => 316,
  )
  assert.equal(observation?.elapsedMs, 16)
  await Promise.resolve()
  assert.deepEqual(events, ['maplibre', 'surface', 'follower'])
})

test('ready followers release once on cancel, supersession, and timeout', () => {
  resetFlightSimDeadlineRuntimeForTests()
  const runtime = coordinatedRuntime()
  runtime.subscribePresenter('maplibre', () => undefined)
  let followerCount = 0
  runtime.subscribe(() => {
    followerCount += 1
  })

  const cancelledRequest = beginFlightSimReadyFrame()
  runtime.start()
  cancelFlightSimReadyFrame(cancelledRequest)
  assert.equal(followerCount, 1)
  cancelFlightSimReadyFrame(cancelledRequest)
  assert.equal(followerCount, 1)

  runtime.stop()
  const supersededRequest = beginFlightSimReadyFrame()
  runtime.start()
  const countBeforeSupersession = followerCount
  const currentRequest = beginFlightSimReadyFrame()
  assert.equal(followerCount, countBeforeSupersession + 1)
  assert.notEqual(currentRequest, supersededRequest)
  cancelFlightSimReadyFrame(currentRequest)

  runtime.stop()
  let expireReadyFrame: () => void = () => {
    assert.fail('ready timeout was not scheduled')
  }
  beginFlightSimReadyFrame(
    () => 500,
    expire => {
      expireReadyFrame = expire
      return () => undefined
    },
  )
  runtime.start()
  const countBeforeTimeout = followerCount
  expireReadyFrame()
  assert.equal(followerCount, countBeforeTimeout + 1)
  assert.equal(
    readFlightSimDeadlineSnapshot().readyFrame?.source,
    'ready-frame-deadline-timeout',
  )
  assert.equal(readFlightSimDeadlineSnapshot().readyFrame?.withinLimit, false)
})

test('superseding begin preserves a reentrant ready request without orphaning followers', () => {
  resetFlightSimDeadlineRuntimeForTests()
  const runtime = coordinatedRuntime()
  runtime.subscribePresenter('maplibre', () => undefined)
  let reentrantRequestId: number | null = null
  let reentrantFollowerCount = 0
  let reentered = false
  runtime.subscribe(() => {
    if (reentered) return
    reentered = true
    reentrantRequestId = beginFlightSimReadyFrame(
      () => 600,
      () => () => undefined,
    )
    assert.equal(coordinateFlightSimReadyPublication({
      snapshot: runtime.read(),
      hasPresenter: kind => kind === 'maplibre',
      notifyPresenter: () => undefined,
      notifyFollowers: () => {
        reentrantFollowerCount += 1
      },
    }), true)
  })

  beginFlightSimReadyFrame(() => 550)
  runtime.start()
  const returnedRequestId = beginFlightSimReadyFrame(
    () => 650,
    () => () => undefined,
  )
  assert.equal(returnedRequestId, reentrantRequestId)
  assert.equal(readCurrentFlightSimReadyFrameRequestId(), reentrantRequestId)
  cancelFlightSimReadyFrame(returnedRequestId)
  assert.equal(reentrantFollowerCount, 1)
  assert.equal(readCurrentFlightSimReadyFrameRequestId(), null)
})

test('test reset discards held ready followers and timers without invoking runtime work', () => {
  resetFlightSimDeadlineRuntimeForTests()
  const runtime = coordinatedRuntime()
  runtime.subscribePresenter('maplibre', () => undefined)
  let followerCount = 0
  runtime.subscribe(() => {
    followerCount += 1
  })
  beginFlightSimReadyFrame(
    () => 700,
    () => () => undefined,
  )
  runtime.start()
  resetFlightSimDeadlineRuntimeForTests()
  assert.equal(followerCount, 0)
  assert.equal(readCurrentFlightSimReadyFrameRequestId(), null)
})

test('queued completion cannot release a reused request id after test reset', async () => {
  resetFlightSimDeadlineRuntimeForTests()
  const firstRuntime = coordinatedRuntime()
  firstRuntime.subscribePresenter('maplibre', () => undefined)
  let firstFollowerCount = 0
  firstRuntime.subscribe(() => {
    firstFollowerCount += 1
  })
  const firstRequestId = beginFlightSimReadyFrame(
    () => 750,
    () => () => undefined,
  )
  const firstReady = firstRuntime.start()
  completeFlightSimMapLibreReadyFrame(
    firstRequestId,
    firstReady.runId,
    firstReady.tick,
    () => 766,
  )
  assert.equal(firstFollowerCount, 0)

  resetFlightSimDeadlineRuntimeForTests()
  const secondRuntime = coordinatedRuntime()
  secondRuntime.subscribePresenter('maplibre', () => undefined)
  let secondFollowerCount = 0
  secondRuntime.subscribe(() => {
    secondFollowerCount += 1
  })
  const secondRequestId = beginFlightSimReadyFrame(
    () => 800,
    () => () => undefined,
  )
  secondRuntime.start()
  assert.equal(secondRequestId, firstRequestId)

  await Promise.resolve()
  assert.equal(firstFollowerCount, 0)
  assert.equal(secondFollowerCount, 0)
  assert.equal(readCurrentFlightSimReadyFrameRequestId(), secondRequestId)
  cancelFlightSimReadyFrame(secondRequestId)
  assert.equal(secondFollowerCount, 1)
})

test('ready scheduling failure rolls back the pending request', () => {
  resetFlightSimDeadlineRuntimeForTests()
  assert.throws(
    () => beginFlightSimReadyFrame(
      () => 850,
      () => {
        throw new Error('ready scheduler failed')
      },
    ),
    /ready scheduler failed/,
  )
  assert.equal(readCurrentFlightSimReadyFrameRequestId(), null)
})

test('throwing ready followers cannot interrupt healthy follower release', async () => {
  resetFlightSimDeadlineRuntimeForTests()
  const runtime = coordinatedRuntime()
  runtime.subscribePresenter('maplibre', () => undefined)
  let healthyFollowerCount = 0
  runtime.subscribe(() => {
    throw new Error('follower exploded')
  })
  runtime.subscribe(() => {
    healthyFollowerCount += 1
  })
  const requestId = beginFlightSimReadyFrame(() => 800)
  const ready = runtime.start()
  const originalConsoleError = console.error
  const reported: unknown[][] = []
  console.error = (...args: unknown[]) => {
    reported.push(args)
  }
  try {
    const observation = completeFlightSimMapLibreReadyFrame(
      requestId,
      ready.runId,
      ready.tick,
      () => 816,
    )
    assert.equal(observation?.withinLimit, true)
    assert.equal(healthyFollowerCount, 0)
    await Promise.resolve()
  } finally {
    console.error = originalConsoleError
  }
  assert.equal(healthyFollowerCount, 1)
  assert.equal(reported.length, 1)
  assert.match(String(reported[0]?.[0]), /ready follower failed/)
})
