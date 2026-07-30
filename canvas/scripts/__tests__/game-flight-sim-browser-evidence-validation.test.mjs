import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasExactCityDisposalEvidence,
} from '../lib/game-flight-sim-browser-evidence-validation.mjs'

test('City disposal accepts settled Flight sources while provider tiles remain active', () => {
  const disposal = {
    environment: {
      features: 0,
      loaded: true,
      present: true,
    },
    flight: {
      features: 0,
      loaded: true,
      present: true,
    },
    styleLoaded: false,
  }

  assert.equal(hasExactCityDisposalEvidence(disposal), true)
  assert.equal(
    hasExactCityDisposalEvidence({
      environment: {
        features: null,
        loaded: false,
        present: false,
      },
      flight: {
        features: null,
        loaded: false,
        present: false,
      },
      styleLoaded: true,
    }),
    true,
    'removed owned sources are settled before MapLibre owner disposal',
  )
  assert.equal(
    hasExactCityDisposalEvidence({
      ...disposal,
      environment: {
        ...disposal.environment,
        loaded: false,
      },
    }),
    false,
    'an unsettled owned source must fail closed',
  )
  assert.equal(
    hasExactCityDisposalEvidence({
      ...disposal,
      flight: {
        features: 0,
        present: true,
      },
    }),
    false,
    'a source without loaded() proof must fail closed',
  )
})
