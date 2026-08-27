import type { LegChange, RuntimeCascadeOutcome } from '../bundle/bundle-types'

export interface ReplicaStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type ReplanReplicaSnapshot = Readonly<{
  bundleId: string
  observations: readonly RuntimeCascadeOutcome[]
  observedAt: number
  synchronizedAt: number
}>

type PersistedReplica = Readonly<{
  schema: 'agenticgraph-travel-replan-replica/v2'
  bundleId: string
  observations: readonly RuntimeCascadeOutcome[]
  observedAt: number
  synchronizedAt: number
}>

const REPLICA_PREFIX = 'agenticgraph:travel:replan:'
const REPLICA_SCHEMA = 'agenticgraph-travel-replan-replica/v2' as const
const MAX_LOCAL_OBSERVATIONS = 50

/** Local-first projection used by the Canvas surface; the edge is a convergence peer, never a render prerequisite. */
export class ReplanSurface {
  constructor(private readonly storage: ReplicaStorage) {}

  project(outcome: RuntimeCascadeOutcome, observedAt = Date.now()): ReplanReplicaSnapshot {
    const current = this.read(outcome.bundleId)
    const observations = mergeObservations(current?.observations ?? [], [outcome])
    const replica = freezeReplica({
      bundleId: outcome.bundleId,
      observations,
      observedAt,
      synchronizedAt: current?.synchronizedAt ?? observedAt,
    })
    this.persist(replica)
    return replica
  }

  converge(
    bundleId: string,
    edgeObservations: readonly RuntimeCascadeOutcome[],
    synchronizedAt = Date.now(),
  ): ReplanReplicaSnapshot | null {
    const local = this.read(bundleId)
    const applicable = edgeObservations.filter((outcome) => outcome.bundleId === bundleId)
    if (!local && applicable.length === 0) return null
    const observations = mergeObservations(local?.observations ?? [], applicable)
    const replica = freezeReplica({
      bundleId,
      observations,
      observedAt: local?.observedAt ?? synchronizedAt,
      synchronizedAt,
    })
    this.persist(replica)
    return replica
  }

  snapshot(bundleId: string): ReplanReplicaSnapshot | null {
    return this.read(bundleId)
  }

  render(bundleId: string, offline = false, now = Date.now()): string {
    const replica = this.read(bundleId)
    const outcome = replica?.observations.at(-1)
    if (!replica || !outcome) {
      return '<section class="replan-surface" aria-labelledby="replan-title"><h1 id="replan-title">Bundle re-plan</h1><p>No re-plan result is available.</p></section>'
    }
    const freshness = offline
      ? `<p role="status" data-replan-current="false">Not current · last synchronized ${formatElapsed(now - replica.synchronizedAt)} ago.</p>`
      : '<p role="status" data-replan-current="true">Connected · local replica converged with the edge.</p>'
    const changesByLeg = new Map(outcome.changes.map((change) => [change.legId, change]))
    const affected = outcome.affected.map((legId) => renderLeg(legId, changesByLeg.get(legId))).join('')
    const status = statusFor(outcome.kind)
    const settlementCurrency = commonCurrency(outcome.changes)
    return [
      '<section class="replan-surface" aria-labelledby="replan-title" data-replan-surface="v2">',
      '<h1 id="replan-title">Bundle re-plan</h1>',
      freshness,
      `<span class="status-marker" role="img" aria-label="Cascade status: ${escapeHtml(status)}">●</span>`,
      '<dl class="cascade-summary">',
      `<div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>`,
      `<div><dt>Changed leg</dt><dd>${escapeHtml(outcome.changedLegId)}</dd></div>`,
      `<div><dt>Net settlement</dt><dd>${formatMinorAmount(outcome.netAmountMinor, settlementCurrency)}</dd></div>`,
      `<div><dt>Settlement calls</dt><dd>${outcome.settlementCalls}</dd></div>`,
      `<div><dt>Reason</dt><dd>${escapeHtml(outcome.reason ?? 'None')}</dd></div>`,
      '</dl>',
      '<h2>Affected legs</h2>',
      `<ul class="affected-legs">${affected || '<li aria-label="No affected legs">No affected legs</li>'}</ul>`,
      '<style>',
      '.replan-surface,.replan-surface *{box-sizing:border-box}',
      '.replan-surface{inline-size:100%;max-inline-size:42rem;overflow-x:hidden;font:1rem/1.5 system-ui;overflow-wrap:anywhere}',
      '.cascade-summary>div,.leg-change{display:grid;grid-template-columns:minmax(0,1fr);gap:.25rem;margin-block:.75rem}',
      '.affected-legs{display:grid;gap:.75rem;margin:0;padding:0;list-style:none}',
      '.affected-legs>li{min-inline-size:0;padding:.75rem;border:1px solid currentColor;border-radius:.75rem}',
      '.status-marker{display:inline-grid;place-items:center;inline-size:44px;block-size:44px}',
      '.replan-surface button,.replan-surface a{min-block-size:44px;min-inline-size:44px}',
      '</style>',
      '</section>',
    ].join('')
  }

  private persist(replica: ReplanReplicaSnapshot): void {
    const persisted: PersistedReplica = Object.freeze({ schema: REPLICA_SCHEMA, ...replica })
    this.storage.setItem(`${REPLICA_PREFIX}${replica.bundleId}`, JSON.stringify(persisted))
  }

  private read(bundleId: string): ReplanReplicaSnapshot | null {
    try {
      const raw = this.storage.getItem(`${REPLICA_PREFIX}${bundleId}`)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed)) return null
      if (parsed.schema === REPLICA_SCHEMA) return readV2Replica(parsed, bundleId)
      // One-way compatibility with the initial single-observation replica.
      if (isCascadeOutcome(parsed.outcome) && Number.isFinite(parsed.observedAt)) {
        return freezeReplica({
          bundleId,
          observations: [parsed.outcome],
          observedAt: Number(parsed.observedAt),
          synchronizedAt: Number(parsed.observedAt),
        })
      }
      return null
    } catch {
      return null
    }
  }
}

function renderLeg(legId: string, change: LegChange | undefined): string {
  return [
    `<li aria-label="Leg ${escapeHtml(legId)}">`,
    `<strong>${escapeHtml(legId)}</strong>`,
    '<dl class="leg-change">',
    `<div><dt>Prior offer</dt><dd>${escapeHtml(change?.priorOfferId ?? 'Not available')}</dd></div>`,
    `<div><dt>Prior amount</dt><dd>${formatMinorAmount(change?.priorAmountMinor ?? null, change?.currency)}</dd></div>`,
    `<div><dt>New offer</dt><dd>${escapeHtml(change?.newOfferId ?? 'Not available')}</dd></div>`,
    `<div><dt>New amount</dt><dd>${formatMinorAmount(change?.newAmountMinor ?? null, change?.currency)}</dd></div>`,
    '</dl>',
    '</li>',
  ].join('')
}

function readV2Replica(record: Record<string, unknown>, bundleId: string): ReplanReplicaSnapshot | null {
  if (
    record.bundleId !== bundleId
    || !Array.isArray(record.observations)
    || record.observations.some((outcome) => !isCascadeOutcome(outcome) || outcome.bundleId !== bundleId)
    || !Number.isFinite(record.observedAt)
    || !Number.isFinite(record.synchronizedAt)
  ) return null
  return freezeReplica({
    bundleId,
    observations: record.observations as RuntimeCascadeOutcome[],
    observedAt: Number(record.observedAt),
    synchronizedAt: Number(record.synchronizedAt),
  })
}

function mergeObservations(
  local: readonly RuntimeCascadeOutcome[],
  edge: readonly RuntimeCascadeOutcome[],
): readonly RuntimeCascadeOutcome[] {
  const byCascade = new Map<string, RuntimeCascadeOutcome>()
  for (const outcome of [...local, ...edge]) byCascade.set(outcome.cascadeId, outcome)
  return Object.freeze([...byCascade.values()].slice(-MAX_LOCAL_OBSERVATIONS))
}

function freezeReplica(value: ReplanReplicaSnapshot): ReplanReplicaSnapshot {
  return Object.freeze({ ...value, observations: Object.freeze([...value.observations]) })
}

function isCascadeOutcome(value: unknown): value is RuntimeCascadeOutcome {
  if (!isRecord(value)) return false
  return (
    ['committed', 'rolled-back', 'no-op', 'rejected', 'reconciliation-required'].includes(String(value.kind))
    && typeof value.cascadeId === 'string'
    && typeof value.bundleId === 'string'
    && typeof value.changedLegId === 'string'
    && Array.isArray(value.affected)
    && value.affected.every((legId) => typeof legId === 'string')
    && Array.isArray(value.changes)
    && value.changes.every(isLegChange)
    && Number.isFinite(value.netAmountMinor)
    && Number.isFinite(value.settlementCalls)
    && (value.reason === null || typeof value.reason === 'string')
    && typeof value.archiveDeferred === 'boolean'
    && Number.isFinite(value.elapsedMs)
  )
}

function isLegChange(value: unknown): value is LegChange {
  if (!isRecord(value)) return false
  return (
    typeof value.legId === 'string'
    && (value.priorOfferId === null || typeof value.priorOfferId === 'string')
    && (value.priorAmountMinor === null || Number.isFinite(value.priorAmountMinor))
    && typeof value.newOfferId === 'string'
    && Number.isFinite(value.newAmountMinor)
    && (value.currency === undefined || typeof value.currency === 'string')
    && (value.agentId === undefined || typeof value.agentId === 'string')
    && (
      value.priceVerification === undefined
      || value.priceVerification === 'verified'
      || value.priceVerification === 'deterministic-demo'
    )
    && (value.provenance === undefined || isStringRecord(value.provenance))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function statusFor(kind: RuntimeCascadeOutcome['kind']): string {
  if (kind === 'committed') return 'Committed'
  if (kind === 'rolled-back') return 'Rolled back'
  if (kind === 'no-op') return 'No operation'
  if (kind === 'reconciliation-required') return 'Reconciliation required'
  return 'Rejected'
}

function commonCurrency(changes: readonly LegChange[]): string | undefined {
  if (changes.length === 0 || changes.some((change) => !change.currency)) return undefined
  const currencies = [...new Set(changes.map((change) => change.currency as string))]
  return currencies.length === 1 ? currencies[0] : undefined
}

function formatMinorAmount(value: number | null, currency?: string): string {
  return `${formatMinor(value)}${currency ? ` ${escapeHtml(currency)}` : ''} minor units`
}

function formatMinor(value: number | null): string {
  return value === null ? 'Not available' : String(value)
}

function formatElapsed(value: number): string {
  const seconds = Math.max(0, Math.floor(value / 1_000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}
