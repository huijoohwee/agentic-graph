import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashSignatureParts32 } from '@/lib/hash/signature'
import { isPlainObject } from '@/lib/graph/value'
import {
  buildSwarmPredictionChartSvg,
  buildSwarmPredictionOutputMarkdown,
} from '@/features/swarm-prediction/swarmPredictionRender'

export const SWARM_PREDICTION_SCHEMA_VERSION = 'agentic-graph-swarm-prediction/v1' as const
export const SWARM_PREDICTION_COPY_POLICY = 'conceptual-inspiration-only-no-code-copy' as const

export type SwarmPredictionSeedSignal = {
  id?: string
  label: string
  valence: number
  weight?: number
  sourceRef?: string
}

export type SwarmPredictionAgentInput = {
  id?: string
  label?: string
  cohort?: string
  initialBelief?: number
  confidence?: number
  influence?: number
  riskTolerance?: number
  memory?: string[]
}

export type SwarmPredictionIntervention = {
  tick: number
  label: string
  effect: number
  targetCohort?: string
}

export type SwarmPredictionBounds = {
  maxAgents: number
  maxTicks: number
  maxSignals: number
  maxInterventions: number
  memoryLimit: number
  convergenceWindow: number
  convergenceEpsilon: number
}

export type SwarmPredictionRequest = {
  scenarioTitle: string
  seedSignals?: SwarmPredictionSeedSignal[]
  seedSignalsJson?: string
  agents?: SwarmPredictionAgentInput[]
  agentPopulationJson?: string
  interventions?: SwarmPredictionIntervention[]
  interventionsJson?: string
  ticks?: number
  randomSeed?: string | number
  createdAtIso?: string
  bounds?: Partial<SwarmPredictionBounds>
}

export type SwarmPredictionAgentState = {
  id: string
  label: string
  cohort: string
  belief: number
  confidence: number
  influence: number
  riskTolerance: number
  memory: string[]
}

export type SwarmPredictionWorldState = {
  tick: number
  meanBelief: number
  consensus: number
  confidence: number
  volatility: number
  predictionScore: number
  activeInterventions: string[]
}

export type SwarmPredictionEvent = {
  id: string
  tick: number
  kind: 'world_initialized' | 'intervention_applied' | 'agent_updated' | 'forecast_recorded' | 'simulation_stopped'
  agentId?: string
  label: string
  beforeBelief?: number
  afterBelief?: number
  delta?: number
  confidence?: number
  effect?: number
}

export type SwarmPredictionMetrics = {
  agentCount: number
  tickCount: number
  eventCount: number
  meanBelief: number
  consensus: number
  confidence: number
  volatility: number
  predictionScore: number
  stopReason: 'converged' | 'tick_limit'
}

export type SwarmPredictionResult = {
  schema_version: typeof SWARM_PREDICTION_SCHEMA_VERSION
  run_id: string
  scenario_id: string
  scenario_title: string
  created_at: string
  copy_policy: typeof SWARM_PREDICTION_COPY_POLICY
  bounds: SwarmPredictionBounds
  seed_signals: Required<SwarmPredictionSeedSignal>[]
  agents: SwarmPredictionAgentState[]
  world_states: SwarmPredictionWorldState[]
  events: SwarmPredictionEvent[]
  metrics: SwarmPredictionMetrics
  prediction: {
    label: string
    score: number
    confidence: number
    interval: [number, number]
    horizon_ticks: number
  }
  output: string
  imageUrl: string
  eventLogJson: string
  metricsJson: string
}

const DEFAULT_SWARM_PREDICTION_BOUNDS: SwarmPredictionBounds = {
  maxAgents: 24,
  maxTicks: 32,
  maxSignals: 32,
  maxInterventions: 16,
  memoryLimit: 8,
  convergenceWindow: 3,
  convergenceEpsilon: 0.006,
}

const cleanString = (value: unknown): string => String(value || '').replace(/\r\n/g, '\n').trim()

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

const round4 = (value: number): number => Math.round(value * 10000) / 10000

const normalizeNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return clamp(n, min, max)
}

const normalizeInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.floor(clamp(n, min, max))
}

const readPlainRecord = (value: unknown): Record<string, unknown> | null => {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null
}

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = readPlainRecord(value)
  if (!record) return JSON.stringify(String(value))
  return `{${Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function buildSwarmPredictionSemanticKey(scope: string, payload: unknown): string {
  const normalizedScope = cleanString(scope) || 'swarm-prediction'
  return buildScopedGraphSemanticKey(normalizedScope, { graphSemanticKey: stableStringify(payload) })
}

const createDeterministicRandom = (seed: unknown): (() => number) => {
  let state = hashSignatureParts32(['agentic-graph-swarm-prediction', stableStringify(seed)]) >>> 0
  if (state === 0) state = 0x6d2b79f5
  return () => {
    state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) >>> 0
    state = Math.imul(state ^ (state >>> 12), 0x297a2d39) >>> 0
    state = (state ^ (state >>> 15)) >>> 0
    return state / 0x100000000
  }
}

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  const text = cleanString(value)
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const mergeBounds = (bounds?: Partial<SwarmPredictionBounds>): SwarmPredictionBounds => ({
  maxAgents: normalizeInt(bounds?.maxAgents, DEFAULT_SWARM_PREDICTION_BOUNDS.maxAgents, 1, 96),
  maxTicks: normalizeInt(bounds?.maxTicks, DEFAULT_SWARM_PREDICTION_BOUNDS.maxTicks, 1, 120),
  maxSignals: normalizeInt(bounds?.maxSignals, DEFAULT_SWARM_PREDICTION_BOUNDS.maxSignals, 1, 128),
  maxInterventions: normalizeInt(bounds?.maxInterventions, DEFAULT_SWARM_PREDICTION_BOUNDS.maxInterventions, 0, 64),
  memoryLimit: normalizeInt(bounds?.memoryLimit, DEFAULT_SWARM_PREDICTION_BOUNDS.memoryLimit, 0, 32),
  convergenceWindow: normalizeInt(bounds?.convergenceWindow, DEFAULT_SWARM_PREDICTION_BOUNDS.convergenceWindow, 1, 20),
  convergenceEpsilon: normalizeNumber(bounds?.convergenceEpsilon, DEFAULT_SWARM_PREDICTION_BOUNDS.convergenceEpsilon, 0.0001, 0.25),
})

const normalizeSeedSignals = (
  request: SwarmPredictionRequest,
  bounds: SwarmPredictionBounds,
): Required<SwarmPredictionSeedSignal>[] => {
  const raw = request.seedSignals && request.seedSignals.length > 0
    ? request.seedSignals
    : parseJsonArray(request.seedSignalsJson)
  const out: Required<SwarmPredictionSeedSignal>[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length && out.length < bounds.maxSignals; i += 1) {
    const record = readPlainRecord(raw[i])
    if (!record) continue
    const label = cleanString(record.label ?? record.name ?? record.id)
    if (!label) continue
    const valence = normalizeNumber(record.valence ?? record.sentiment ?? record.score, 0, -1, 1)
    const weight = normalizeNumber(record.weight, 1, 0, 1)
    const id = cleanString(record.id) || buildSwarmPredictionSemanticKey('swarm-signal', [label, valence, weight]).slice(0, 16)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      label,
      valence: round4(valence),
      weight: round4(weight),
      sourceRef: cleanString(record.sourceRef ?? record.source_ref),
    })
  }
  if (out.length > 0) return out
  const fallbackLabel = cleanString(request.scenarioTitle) || 'Scenario seed'
  return [{
    id: buildSwarmPredictionSemanticKey('swarm-signal', [fallbackLabel, 'neutral']).slice(0, 16),
    label: fallbackLabel,
    valence: 0,
    weight: 1,
    sourceRef: '',
  }]
}

const weightedSignalMean = (signals: Required<SwarmPredictionSeedSignal>[]): number => {
  let totalWeight = 0
  let total = 0
  for (const signal of signals) {
    const weight = clamp(signal.weight, 0, 1)
    totalWeight += weight
    total += signal.valence * weight
  }
  return totalWeight > 0 ? clamp(total / totalWeight, -1, 1) : 0
}

const normalizeInterventions = (
  request: SwarmPredictionRequest,
  bounds: SwarmPredictionBounds,
): SwarmPredictionIntervention[] => {
  const raw = request.interventions && request.interventions.length > 0
    ? request.interventions
    : parseJsonArray(request.interventionsJson)
  const out: SwarmPredictionIntervention[] = []
  for (let i = 0; i < raw.length && out.length < bounds.maxInterventions; i += 1) {
    const record = readPlainRecord(raw[i])
    if (!record) continue
    const label = cleanString(record.label ?? record.name)
    if (!label) continue
    out.push({
      tick: normalizeInt(record.tick, 1, 1, bounds.maxTicks),
      label,
      effect: round4(normalizeNumber(record.effect ?? record.valence, 0, -1, 1)),
      targetCohort: cleanString(record.targetCohort ?? record.target_cohort),
    })
  }
  out.sort((left, right) => left.tick - right.tick || left.label.localeCompare(right.label))
  return out
}

const normalizeAgentInput = (
  raw: unknown,
  index: number,
  baseline: number,
  random: () => number,
): SwarmPredictionAgentState | null => {
  const record = readPlainRecord(raw)
  if (!record) return null
  const label = cleanString(record.label ?? record.name ?? record.id) || `Agent ${index + 1}`
  const cohort = cleanString(record.cohort ?? record.group) || `cohort-${(index % 3) + 1}`
  const id = cleanString(record.id) || buildSwarmPredictionSemanticKey('swarm-agent', [label, cohort, index]).slice(0, 18)
  const memory = Array.isArray(record.memory)
    ? record.memory.map(cleanString).filter(Boolean)
    : []
  return {
    id,
    label,
    cohort,
    belief: round4(normalizeNumber(record.initialBelief ?? record.belief, baseline + ((random() - 0.5) * 0.18), -1, 1)),
    confidence: round4(normalizeNumber(record.confidence, 0.45 + random() * 0.3, 0, 1)),
    influence: round4(normalizeNumber(record.influence, 0.25 + random() * 0.55, 0, 1)),
    riskTolerance: round4(normalizeNumber(record.riskTolerance ?? record.risk_tolerance, 0.25 + random() * 0.5, 0, 1)),
    memory,
  }
}

const buildAgents = (
  request: SwarmPredictionRequest,
  signals: Required<SwarmPredictionSeedSignal>[],
  bounds: SwarmPredictionBounds,
  random: () => number,
): SwarmPredictionAgentState[] => {
  const baseline = weightedSignalMean(signals)
  const raw = request.agents && request.agents.length > 0
    ? request.agents
    : parseJsonArray(request.agentPopulationJson)
  const out: SwarmPredictionAgentState[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length && out.length < bounds.maxAgents; i += 1) {
    const agent = normalizeAgentInput(raw[i], i, baseline, random)
    if (!agent || seen.has(agent.id)) continue
    seen.add(agent.id)
    out.push(agent)
  }
  if (out.length > 0) return out

  const count = clamp(Math.max(3, signals.length * 2 + 2), 1, bounds.maxAgents)
  for (let i = 0; i < count; i += 1) {
    const signal = signals[i % signals.length]
    const cohort = `cohort-${(i % Math.max(1, Math.min(3, signals.length))) + 1}`
    const label = `Agent ${i + 1}`
    out.push({
      id: buildSwarmPredictionSemanticKey('swarm-agent', [request.scenarioTitle, signal.id, i]).slice(0, 18),
      label,
      cohort,
      belief: round4(clamp((signal.valence * 0.6) + (baseline * 0.4) + ((random() - 0.5) * 0.2), -1, 1)),
      confidence: round4(0.45 + random() * 0.3),
      influence: round4(0.25 + random() * 0.55),
      riskTolerance: round4(0.25 + random() * 0.5),
      memory: [`seed:${signal.id}`],
    })
  }
  return out
}

const computeWorldState = (
  tick: number,
  agents: SwarmPredictionAgentState[],
  volatility: number,
  activeInterventions: string[],
): SwarmPredictionWorldState => {
  const agentCount = Math.max(1, agents.length)
  const meanBelief = agents.reduce((sum, agent) => sum + agent.belief, 0) / agentCount
  const confidence = agents.reduce((sum, agent) => sum + agent.confidence, 0) / agentCount
  const meanDeviation = agents.reduce((sum, agent) => sum + Math.abs(agent.belief - meanBelief), 0) / agentCount
  const consensus = clamp(1 - (meanDeviation / 1.4), 0, 1)
  const predictionScore = clamp(((meanBelief + 1) / 2 * 0.72) + (confidence * 0.18) + (consensus * 0.1), 0, 1)
  return {
    tick,
    meanBelief: round4(meanBelief),
    consensus: round4(consensus),
    confidence: round4(confidence),
    volatility: round4(volatility),
    predictionScore: round4(predictionScore),
    activeInterventions,
  }
}

const appendMemory = (agent: SwarmPredictionAgentState, entry: string, limit: number): void => {
  if (limit <= 0) {
    agent.memory = []
    return
  }
  agent.memory = [...agent.memory, entry].slice(-limit)
}

export function runSwarmPredictionEngine(request: SwarmPredictionRequest): SwarmPredictionResult {
  const scenarioTitle = cleanString(request.scenarioTitle) || 'Swarm prediction scenario'
  const bounds = mergeBounds(request.bounds)
  const ticks = normalizeInt(request.ticks, Math.min(12, bounds.maxTicks), 1, bounds.maxTicks)
  const signals = normalizeSeedSignals(request, bounds)
  const seedPayload = {
    scenarioTitle,
    seedSignals: signals,
    randomSeed: request.randomSeed ?? '',
  }
  const random = createDeterministicRandom(seedPayload)
  const agents = buildAgents(request, signals, bounds, random)
  const interventions = normalizeInterventions(request, bounds)
  const createdAt = cleanString(request.createdAtIso) || new Date(0).toISOString()
  const scenarioId = buildSwarmPredictionSemanticKey('swarm-scenario', [scenarioTitle, signals]).slice(0, 20)
  const runId = buildSwarmPredictionSemanticKey('swarm-run', [scenarioId, ticks, request.randomSeed ?? '', agents.map(agent => agent.id)]).slice(0, 20)
  const events: SwarmPredictionEvent[] = []
  const worldStates: SwarmPredictionWorldState[] = []
  const pushEvent = (event: Omit<SwarmPredictionEvent, 'id'>) => {
    events.push({
      ...event,
      id: buildSwarmPredictionSemanticKey('swarm-event', [runId, events.length, event.tick, event.kind, event.agentId || '', event.label]).slice(0, 22),
    })
  }
  pushEvent({ tick: 0, kind: 'world_initialized', label: `${agents.length} agents initialized from ${signals.length} seed signals` })
  worldStates.push(computeWorldState(0, agents, 0, []))

  let stopReason: SwarmPredictionMetrics['stopReason'] = 'tick_limit'
  const recentVolatility: number[] = []
  const baseSignal = weightedSignalMean(signals)
  for (let tick = 1; tick <= ticks; tick += 1) {
    const active = interventions.filter(intervention => intervention.tick === tick)
    for (const intervention of active) {
      pushEvent({
        tick,
        kind: 'intervention_applied',
        label: intervention.label,
        effect: intervention.effect,
      })
    }
    const meanBefore = agents.reduce((sum, agent) => sum + agent.belief, 0) / Math.max(1, agents.length)
    let tickDeltaTotal = 0
    for (const agent of agents) {
      const before = agent.belief
      const peerDelta = meanBefore - agent.belief
      const interventionEffect = active
        .filter(intervention => !intervention.targetCohort || intervention.targetCohort === agent.cohort)
        .reduce((sum, intervention) => sum + intervention.effect, 0)
      const stochasticProbe = (random() - 0.5) * 0.04
      const learningRate = 0.08 + (agent.riskTolerance * 0.06)
      const delta = (
        (baseSignal * agent.confidence)
        + (peerDelta * agent.influence * 0.5)
        + (interventionEffect * 0.6)
        + stochasticProbe
      ) * learningRate
      agent.belief = round4(clamp(agent.belief + delta, -1, 1))
      const realizedDelta = agent.belief - before
      tickDeltaTotal += Math.abs(realizedDelta)
      agent.confidence = round4(clamp(agent.confidence + ((1 - Math.abs(peerDelta)) * 0.012) - (Math.abs(realizedDelta) * 0.05), 0, 1))
      appendMemory(agent, `t${tick}:${realizedDelta >= 0 ? '+' : ''}${round4(realizedDelta)}`, bounds.memoryLimit)
      pushEvent({
        tick,
        kind: 'agent_updated',
        agentId: agent.id,
        label: `${agent.label} updated belief`,
        beforeBelief: round4(before),
        afterBelief: agent.belief,
        delta: round4(realizedDelta),
        confidence: agent.confidence,
      })
    }
    const volatility = tickDeltaTotal / Math.max(1, agents.length)
    const state = computeWorldState(tick, agents, volatility, active.map(intervention => intervention.label))
    worldStates.push(state)
    recentVolatility.push(volatility)
    if (recentVolatility.length > bounds.convergenceWindow) recentVolatility.shift()
    pushEvent({
      tick,
      kind: 'forecast_recorded',
      label: `Prediction score ${state.predictionScore.toFixed(3)} with consensus ${state.consensus.toFixed(3)}`,
      confidence: state.confidence,
    })
    if (
      recentVolatility.length >= bounds.convergenceWindow
      && recentVolatility.every(value => value <= bounds.convergenceEpsilon)
    ) {
      stopReason = 'converged'
      pushEvent({ tick, kind: 'simulation_stopped', label: `Converged after ${tick} ticks` })
      break
    }
  }

  if (stopReason === 'tick_limit') {
    pushEvent({ tick: worldStates[worldStates.length - 1]?.tick || ticks, kind: 'simulation_stopped', label: `Stopped at tick cap ${ticks}` })
  }
  const finalState = worldStates[worldStates.length - 1] || computeWorldState(0, agents, 0, [])
  const intervalWidth = clamp((1 - finalState.confidence) * 0.24 + finalState.volatility * 0.4, 0.03, 0.45)
  const prediction = {
    label: finalState.predictionScore >= 0.66 ? 'favorable' : finalState.predictionScore <= 0.34 ? 'unfavorable' : 'mixed',
    score: finalState.predictionScore,
    confidence: finalState.confidence,
    interval: [
      round4(clamp(finalState.predictionScore - intervalWidth, 0, 1)),
      round4(clamp(finalState.predictionScore + intervalWidth, 0, 1)),
    ] as [number, number],
    horizon_ticks: finalState.tick,
  }
  const metrics: SwarmPredictionMetrics = {
    agentCount: agents.length,
    tickCount: finalState.tick,
    eventCount: events.length,
    meanBelief: finalState.meanBelief,
    consensus: finalState.consensus,
    confidence: finalState.confidence,
    volatility: finalState.volatility,
    predictionScore: finalState.predictionScore,
    stopReason,
  }
  const output = buildSwarmPredictionOutputMarkdown({ title: scenarioTitle, metrics, prediction, states: worldStates, events })
  const chartSvg = buildSwarmPredictionChartSvg(worldStates, scenarioTitle)
  const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg)}`
  return {
    schema_version: SWARM_PREDICTION_SCHEMA_VERSION,
    run_id: runId,
    scenario_id: scenarioId,
    scenario_title: scenarioTitle,
    created_at: createdAt,
    copy_policy: SWARM_PREDICTION_COPY_POLICY,
    bounds,
    seed_signals: signals,
    agents,
    world_states: worldStates,
    events,
    metrics: { ...metrics, eventCount: events.length },
    prediction,
    output,
    imageUrl,
    eventLogJson: JSON.stringify(events, null, 2),
    metricsJson: JSON.stringify(metrics, null, 2),
  }
}
