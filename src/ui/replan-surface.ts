import type { CascadeOutcome } from '../bundle/bundle-types'

export interface ReplicaStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

type Replica = Readonly<{ outcome: CascadeOutcome; observedAt: number }>

const REPLICA_PREFIX = 'knowgrph:travel:replan:'

export class ReplanSurface {
  constructor(private readonly storage: ReplicaStorage) {}

  project(outcome: CascadeOutcome, observedAt = Date.now()): void {
    this.storage.setItem(
      `${REPLICA_PREFIX}${outcome.bundleId}`,
      JSON.stringify({ outcome, observedAt } satisfies Replica),
    )
  }

  render(bundleId: string, offline = false, now = Date.now()): string {
    const replica = this.read(bundleId)
    if (!replica) {
      return '<section aria-labelledby="replan-title"><h1 id="replan-title">Bundle replan</h1><p>No replan result is available.</p></section>'
    }
    const { outcome, observedAt } = replica
    const status = outcome.kind === 'committed' ? 'Committed' : 'Rolled back'
    const currency = 'minor units'
    const affected = outcome.affected.map((legId) => `<li>${escapeHtml(legId)}</li>`).join('')
    const changes = outcome.changes.map((change) => [
      '<li>',
      `<strong>${escapeHtml(change.legId)}</strong>`,
      `<span>Prior: ${formatMinor(change.priorAmountMinor)} ${currency}</span>`,
      `<span>New: ${formatMinor(change.newAmountMinor)} ${currency}</span>`,
      '</li>',
    ].join('')).join('')
    const freshness = offline
      ? `<p role="status">Offline replica from ${formatElapsed(now - observedAt)} ago.</p>`
      : '<p role="status">Connected. Durable result is shown.</p>'
    return [
      '<section class="replan-surface" aria-labelledby="replan-title">',
      '<h1 id="replan-title">Bundle replan</h1>',
      freshness,
      '<dl>',
      `<div><dt>Status</dt><dd>${status}</dd></div>`,
      `<div><dt>Changed leg</dt><dd>${escapeHtml(outcome.changedLegId)}</dd></div>`,
      `<div><dt>Net settlement</dt><dd>${outcome.netAmountMinor} ${currency}</dd></div>`,
      `<div><dt>Reason</dt><dd>${escapeHtml(outcome.reason ?? 'None')}</dd></div>`,
      '</dl>',
      '<h2>Affected legs</h2>',
      `<ul>${affected}</ul>`,
      '<h2>Price changes</h2>',
      `<ul class="price-changes">${changes || '<li>No price changes</li>'}</ul>`,
      '<style>.replan-surface{max-width:42rem;font:1rem/1.5 system-ui}.replan-surface dl>div,.price-changes li{display:grid;gap:.25rem;margin-block:.75rem}.replan-surface button,.replan-surface a{min-height:44px;min-width:44px}</style>',
      '</section>',
    ].join('')
  }

  private read(bundleId: string): Replica | null {
    try {
      const raw = this.storage.getItem(`${REPLICA_PREFIX}${bundleId}`)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      const candidate = parsed as Record<string, unknown>
      if (!Number.isFinite(candidate.observedAt) || !candidate.outcome || typeof candidate.outcome !== 'object') return null
      return parsed as Replica
    } catch {
      return null
    }
  }
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
