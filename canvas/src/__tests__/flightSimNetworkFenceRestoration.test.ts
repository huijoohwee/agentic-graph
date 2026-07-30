import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
} from '@/features/game-flight-sim/flightSimRuntime'

test('Flight entry and exit preserve the browser fetch owner byte-identically', async () => {
  resetFlightSimRuntimeForTests()
  const fetchOwner = globalThis.fetch
  try {
    const opened = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
    })
    assert.equal(opened.active, true)
    assert.equal(globalThis.fetch, fetchOwner)
    exitFlightSimSurface()
    assert.equal(globalThis.fetch, fetchOwner)
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimRuntimeForTests()
    assert.equal(globalThis.fetch, fetchOwner)
  }
})
