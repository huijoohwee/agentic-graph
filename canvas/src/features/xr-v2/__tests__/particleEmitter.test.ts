import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PARTICLE_EMITTER_HARD_CEILING,
  advanceParticleEmitter,
  createParticleEmitter,
  emitParticleBurst,
} from '../particleEmitter'

test('particle emission is deterministic and preserves fractional carry', () => {
  const initial = createParticleEmitter({ ratePerSecond: 2.5, lifetimeSeconds: 1, ceiling: 10 })
  const first = advanceParticleEmitter(initial, 0.2)
  const second = advanceParticleEmitter(first.state, 0.2)

  assert.equal(first.emitted, 0)
  assert.equal(first.state.emissionCarry, 0.5)
  assert.equal(second.emitted, 1)
  assert.equal(second.state.emissionCarry, 0)
  assert.deepEqual(second.state.particles.map(particle => particle.id), [1])
})

test('particle emitter enforces the configured and global ceilings and expires old particles', () => {
  const emitter = createParticleEmitter({ ratePerSecond: 0, lifetimeSeconds: 0.5, ceiling: 3 })
  const burst = emitParticleBurst(emitter, PARTICLE_EMITTER_HARD_CEILING)
  assert.equal(burst.emitted, 3)
  assert.equal(burst.dropped, PARTICLE_EMITTER_HARD_CEILING - 3)
  assert.equal(burst.state.particles.length, 3)
  assert.equal(burst.saturated, true)

  const expired = advanceParticleEmitter(burst.state, 0.5)
  assert.equal(expired.expired, 3)
  assert.equal(expired.state.particles.length, 0)
  assert.throws(() => createParticleEmitter({ ratePerSecond: 1, lifetimeSeconds: 1, ceiling: PARTICLE_EMITTER_HARD_CEILING + 1 }))
  assert.throws(() => emitParticleBurst(emitter, PARTICLE_EMITTER_HARD_CEILING + 1), /outside the supported range/)
})
