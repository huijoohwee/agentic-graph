export class ReplanSurface {
  constructor() { this.last = null; this.lastSyncAt = null; }
  project(outcome, now = Date.now()) { this.last = outcome; this.lastSyncAt = now; return this.render(false, now); }
  render(offline = false, now = Date.now()) { if (!this.last) return '<section aria-live="polite">No cascade recorded</section>'; const sync = offline ? `<p role="status">Not current: ${now - this.lastSyncAt}ms since sync</p>` : ""; const legs = (this.last.affected ?? []).map(leg => `<li aria-label="Leg ${leg}"><dl><dt>Leg</dt><dd>${leg}</dd></dl></li>`).join(""); return `<section aria-label="Re-plan result" style="max-width:320px;overflow-wrap:anywhere"><h2>${this.last.kind}</h2>${sync}<ul>${legs}</ul><button style="min-width:44px;min-height:44px" aria-label="Refresh re-plan">Refresh</button></section>`; }
}
