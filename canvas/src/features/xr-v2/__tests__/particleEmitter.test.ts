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

test('coarse steps distribute births across time and preserve the rate by lifetime bound', () => {
  const emitter = createParticleEmitter({ ratePerSecond: 20, lifetimeSeconds: 0.5, ceiling: 100 })
  const coarse = advanceParticleEmitter(emitter, 1)

  assert.equal(coarse.state.nextParticleId, 21)
  assert.equal(coarse.state.particles.length, 10)
  assert.equal(coarse.emitted, 20)
  assert.equal(coarse.state.totalEmitted, 20)
  assert.equal(coarse.expired, 10)
  assert.ok(coarse.state.particles.every(particle => particle.ageSeconds >= 0 && particle.ageSeconds < 0.5))
})

test('coarse and fine steps preserve admissions, expiry, capacity, and particle identity', () => {
  const config = { ratePerSecond: 20, lifetimeSeconds: 0.5, ceiling: 100 }
  const coarse = advanceParticleEmitter(createParticleEmitter(config), 1).state
  let fine = createParticleEmitter(config)
  for (let index = 0; index < 10; index += 1) fine = advanceParticleEmitter(fine, 0.1).state
  assert.equal(coarse.totalEmitted, fine.totalEmitted)
  assert.equal(coarse.totalDropped, fine.totalDropped)
  assert.deepEqual(coarse.particles.map(particle => particle.id), fine.particles.map(particle => particle.id))
  coarse.particles.forEach((particle, index) => {
    assert.ok(Math.abs(particle.ageSeconds - fine.particles[index].ageSeconds) < 1e-9)
  })

  const saturated = emitParticleBurst(createParticleEmitter({
    ratePerSecond: 4, lifetimeSeconds: 10, ceiling: 1,
  }), 1).state
  const aged = advanceParticleEmitter(saturated, 9).state
  const oneStep = advanceParticleEmitter(aged, 2).state
  let partitions = aged
  for (let index = 0; index < 8; index += 1) partitions = advanceParticleEmitter(partitions, 0.25).state
  assert.deepEqual(oneStep.particles.map(particle => particle.id), partitions.particles.map(particle => particle.id))
  assert.equal(oneStep.totalEmitted, partitions.totalEmitted)
  assert.equal(oneStep.totalDropped, partitions.totalDropped)
})
