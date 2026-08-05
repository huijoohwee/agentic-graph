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
    nextParticleId: state.nextParticleId + requested,
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

  const rawEmission = state.emissionCarry + state.config.ratePerSecond * deltaSeconds
  const requested = Math.floor(rawEmission)
  const emissionCarry = rawEmission - requested
  type ActiveParticle = Readonly<{ id: number; birthSeconds: number; lifetimeSeconds: number; expiresAt: number }>
  const active = new Map<number, ActiveParticle>()
  const expiryHeap: ActiveParticle[] = []
  const swap = (left: number, right: number) => {
    const value = expiryHeap[left]
    expiryHeap[left] = expiryHeap[right]
    expiryHeap[right] = value
  }
  const pushExpiry = (particle: ActiveParticle) => {
    expiryHeap.push(particle)
    let index = expiryHeap.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (expiryHeap[parent].expiresAt < particle.expiresAt
        || (expiryHeap[parent].expiresAt === particle.expiresAt && expiryHeap[parent].id < particle.id)) break
      swap(parent, index)
      index = parent
    }
  }
  const popExpiry = (): ActiveParticle | undefined => {
    const first = expiryHeap[0]
    const last = expiryHeap.pop()
    if (!first || !last || expiryHeap.length === 0) return first
    expiryHeap[0] = last
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      for (const child of [left, right]) {
        if (child >= expiryHeap.length) continue
        const candidate = expiryHeap[child]
        const current = expiryHeap[smallest]
        if (candidate.expiresAt < current.expiresAt
          || (candidate.expiresAt === current.expiresAt && candidate.id < current.id)) smallest = child
      }
      if (smallest === index) break
      swap(index, smallest)
      index = smallest
    }
    return first
  }
  for (const particle of state.particles) {
    const activeParticle = {
      id: particle.id,
      birthSeconds: -particle.ageSeconds,
      lifetimeSeconds: particle.lifetimeSeconds,
      expiresAt: particle.lifetimeSeconds - particle.ageSeconds,
    }
    active.set(particle.id, activeParticle)
    pushExpiry(activeParticle)
  }
  let expired = 0
  let emitted = 0
  let dropped = 0
  const expireThrough = (timeSeconds: number) => {
    while (expiryHeap[0]?.expiresAt <= timeSeconds) {
      const particle = popExpiry()!
      if (active.delete(particle.id)) expired += 1
    }
  }
  if (requested > 0 && state.config.ratePerSecond > 0) {
    const firstBirthSeconds = (1 - state.emissionCarry) / state.config.ratePerSecond
    for (let index = 0; index < requested; index += 1) {
      const birthSeconds = Math.min(deltaSeconds, firstBirthSeconds + index / state.config.ratePerSecond)
      expireThrough(birthSeconds)
      const id = state.nextParticleId + index
      if (active.size >= state.config.ceiling) {
        dropped += 1
        continue
      }
      const particle = {
        id,
        birthSeconds,
        lifetimeSeconds: state.config.lifetimeSeconds,
        expiresAt: birthSeconds + state.config.lifetimeSeconds,
      }
      active.set(id, particle)
      pushExpiry(particle)
      emitted += 1
    }
  }
  expireThrough(deltaSeconds)
  const particles = [...active.values()]
    .sort((left, right) => left.id - right.id)
    .map(particle => ({
      id: particle.id,
      ageSeconds: Math.max(0, deltaSeconds - particle.birthSeconds),
      lifetimeSeconds: particle.lifetimeSeconds,
    }))
  const next = freezeState({
    ...state,
    particles,
    emissionCarry,
    nextParticleId: state.nextParticleId + requested,
    totalEmitted: state.totalEmitted + emitted,
    totalDropped: state.totalDropped + dropped,
  })
  return Object.freeze({
    state: next,
    emitted,
    expired,
    dropped,
    saturated: next.particles.length === next.config.ceiling,
  })
}
