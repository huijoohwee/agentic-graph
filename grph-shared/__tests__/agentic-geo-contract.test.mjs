import test from 'node:test'
import assert from 'node:assert/strict'
import * as core from 'agentic-geo/core'
import { longitudeCases, observeLongitudeCase } from 'agentic-geo/testing/longitude-cases'

for (const [label, name, args, expected] of longitudeCases) {
  test(`installed geo core: ${label}`, () => {
    const input = args(), before = structuredClone(input)
    assert.deepEqual(observeLongitudeCase(core, name, input), expected?.error ? expected : { value: expected })
    assert.deepEqual(input, before)
  })
}
