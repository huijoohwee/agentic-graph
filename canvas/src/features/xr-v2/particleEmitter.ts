export const PARTICLE_EMITTER_HARD_CEILING = 4_096
export const PARTICLE_EMITTER_MAX_RATE_PER_SECOND = 2_000
export const PARTICLE_EMITTER_MAX_STEP_SECONDS = 60

export type ParticleEmitterConfig = Readonly<{
  ratePerSecond: number
  lifetimeSeconds: number
  ceiling: number
}>

export type AuthoringParticle = Readonly<{
  id: number
  ageSeconds: number
  lifetimeSeconds: number
}>

export type ParticleEmitterState = Readonly<{
  config: ParticleEmitterConfig
  particles: readonly AuthoringParticle[]
  emissionCarry: number
  nextParticleId: number
  totalEmitted: number
  totalDropped: number
}>

export type ParticleEmitterStep = Readonly<{
  state: ParticleEmitterState
  emitted: number
  expired: number
  dropped: number
  saturated: boolean
}>

function freezeState(state: ParticleEmitterState): ParticleEmitterState {
  return Object.freeze({
    ...state,
    config: Object.freeze({ ...state.config }),
    particles: Object.freeze(state.particles.map(particle => Object.freeze({ ...particle }))),
  })
}

function validateConfig(config: ParticleEmitterConfig): void {
  if (!Number.isFinite(config.ratePerSecond) || config.ratePerSecond < 0
    || config.ratePerSecond > PARTICLE_EMITTER_MAX_RATE_PER_SECOND) {
    throw new TypeError('particle rate is outside the supported range')
  }
  if (!Number.isFinite(config.lifetimeSeconds) || config.lifetimeSeconds <= 0 || config.lifetimeSeconds > 3_600) {
    throw new TypeError('particle lifetime is outside the supported range')
  }
  if (!Number.isSafeInteger(config.ceiling) || config.ceiling < 1 || config.ceiling > PARTICLE_EMITTER_HARD_CEILING) {
    throw new TypeError('particle ceiling exceeds the hard limit')
  }
}

export function createParticleEmitter(config: ParticleEmitterConfig): ParticleEmitterState {
  validateConfig(config)
  return freezeState({
    config,
    particles: [],
    emissionCarry: 0,
    nextParticleId: 1,
    totalEmitted: 0,
    totalDropped: 0,
  })
}

function emitIntoState(state: ParticleEmitterState, requested: number, emissionCarry: number): ParticleEmitterStep {
  const available = Math.max(0, state.config.ceiling - state.particles.length)
  const emitted = Math.min(requested, available)
  const dropped = requested - emitted
  const particles = [...state.particles]
  for (let index = 0; index < emitted; index += 1) {
    particles.push({
      id: state.nextParticleId + index,
      ageSeconds: 0,
      lifetimeSeconds: state.config.lifetimeSeconds,
    })
  }
  const next = freezeState({
    ...state,
    particles,
    emissionCarry,
    nextParticleId: state.nextParticleId + emitted,
    totalEmitted: state.totalEmitted + emitted,
    totalDropped: state.totalDropped + dropped,
  })
  return Object.freeze({
    state: next,
    emitted,
    expired: 0,
    dropped,
    saturated: next.particles.length === next.config.ceiling,
  })
}

export function emitParticleBurst(state: ParticleEmitterState, count: number): ParticleEmitterStep {
  if (!Number.isSafeInteger(count) || count < 0 || count > PARTICLE_EMITTER_HARD_CEILING) {
    throw new TypeError('particle burst count is outside the supported range')
  }
  return emitIntoState(state, count, state.emissionCarry)
}

export function advanceParticleEmitter(state: ParticleEmitterState, deltaSeconds: number): ParticleEmitterStep {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > PARTICLE_EMITTER_MAX_STEP_SECONDS) {
    throw new TypeError('particle step is outside the supported range')
  }

  const survivors: AuthoringParticle[] = []
  let expired = 0
  for (const particle of state.particles) {
    const ageSeconds = particle.ageSeconds + deltaSeconds
    if (ageSeconds >= particle.lifetimeSeconds) expired += 1
    else survivors.push({ ...particle, ageSeconds })
  }

  const rawEmission = state.emissionCarry + state.config.ratePerSecond * deltaSeconds
  const requested = Math.floor(rawEmission)
  const agedState = freezeState({ ...state, particles: survivors })
  const emission = emitIntoState(agedState, requested, rawEmission - requested)
  return Object.freeze({ ...emission, expired })
}
