import React from 'react'

type DemoBeat = Readonly<{
  id: number
  title: string
  outcome: 'committed' | 'rolled-back' | 'rejected' | 'observed'
  summary: string
  metrics: readonly Readonly<{ label: string; value: string }>[]
}>

type PersistedUiState = Readonly<{
  selectedBeat: number
  lastSynchronizedAt: number
  observations: readonly string[]
}>

type ExecutedDemoBeat = Readonly<Record<string, string | number | boolean>> & Readonly<{
  beat: number
  status: 'passed'
}>

type ExecutedDemoReport = Readonly<{
  schema: 'knowgrph-travel-commerce-demo-evidence/v1'
  status: 'passed'
  mode: 'deterministic-local-service-doubles'
  beats: readonly ExecutedDemoBeat[]
  providerRequests: 0
  realPaymentCalls: 0
  productionMutations: 0
}>

const STORAGE_KEY = 'knowgrph:travel-commerce:demo-ui:v1'
const DEMO_MODE = 'deterministic-local-service-doubles'
const BEATS: readonly DemoBeat[] = Object.freeze([
  beat(1, 'Dependency structure', 'observed', 'The edge from the delayed flight reaches only the experience and transfer.', [
    ['Flat tables', 'legs + edges'], ['Graph engines', '0'], ['Viewport target', '320 CSS px'],
  ]),
  beat(2, 'Downstream-only re-plan', 'observed', 'The changed flight is excluded; the unrelated hotel stays untouched.', [
    ['Changed leg', 'flight-sin-nrt'], ['Affected set', 'experience-tsukiji, transfer-ginza'], ['Unaffected sibling', 'hotel-shinjuku'],
  ]),
  beat(3, 'All or none', 'rolled-back', 'A rejected transfer quote restores both downstream legs.', [
    ['Outcome', 'rolled back'], ['Reason', 'requote-rejected'], ['Mixed states observed', '0'],
  ]),
  beat(4, 'One net settlement', 'committed', 'Two changed downstream legs settle as one signed net delta.', [
    ['Affected-set size', '2'], ['Net amount', '+75 SGD minor units'], ['Settlement calls', '1'],
  ]),
  beat(5, 'Concurrent budget', 'rejected', 'Two 600-SGD-minor-unit offers race for a 1,000-SGD-minor-unit envelope; only one reserves.', [
    ['Concurrent offers', '2'], ['Reserved', '1'], ['Rejected', '1 · insufficient-envelope'],
  ]),
  beat(6, 'Explicit scale boundary', 'rejected', 'A real 21st insertLeg and a cycle-forming insertEdge are both rejected without changing the bundle.', [
    ['Leg limit', '20'], ['21st insertLeg', 'scale-boundary-legs · observed 21'], ['Cyclic insertEdge', 'cyclic-dependency'],
  ]),
  beat(7, 'Cost and cache', 'observed', 'The cascade is model-free; a repeated re-quote is served from the local edge cache.', [
    ['Orchestration tokens', '0 prompt · 0 completion'], ['Repeated dispatches', '1 instead of 2'], ['Inference', 'metered; never labeled free'],
  ]),
  beat(8, 'Offline and reconnect', 'observed', 'The last local projection remains visible offline and merges with the edge on reconnect.', [
    ['Local observations retained', '2'], ['Lost observations', '0'], ['Transport', 'hibernatable WebSocket'],
  ]),
])

const LEGS = Object.freeze([
  { id: 'flight-sin-nrt', relation: 'changed', prior: '1,200', next: '1,200' },
  { id: 'experience-tsukiji', relation: 'affected', prior: '300', next: '350' },
  { id: 'transfer-ginza', relation: 'affected', prior: '200', next: '225' },
  { id: 'hotel-shinjuku', relation: 'unaffected sibling', prior: '800', next: '800' },
])

export function TravelCommerceDemoPage() {
  const [state, setState] = React.useState<PersistedUiState>(readInitialState)
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [now, setNow] = React.useState(Date.now())
  const [offlineReady, setOfflineReady] = React.useState(false)
  const [execution, setExecution] = React.useState<ExecutedDemoReport | null>(null)
  const [executionError, setExecutionError] = React.useState<string | null>(null)
  const selected = BEATS.find((item) => item.id === state.selectedBeat) ?? BEATS[0]
  const executedBeat = execution?.beats.find(item => item.beat === selected.id) ?? null

  React.useEffect(() => {
    persist(state)
  }, [state])

  React.useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1_000)
    const offline = () => setOnline(false)
    const onlineAgain = () => {
      const synchronizedAt = Date.now()
      setOnline(true)
      setState(previous => ({
        ...previous,
        lastSynchronizedAt: synchronizedAt,
        observations: mergeObservation(previous.observations, `edge-reconnect:${synchronizedAt}`),
      }))
    }
    window.addEventListener('offline', offline)
    window.addEventListener('online', onlineAgain)
    void warmOfflineRoute().then(setOfflineReady)
    void loadExecutedDemoReport().then(setExecution, error => {
      setExecutionError(error instanceof Error ? error.message : 'demo-evidence-unavailable')
    })
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', onlineAgain)
    }
  }, [])

  const selectBeat = (id: number) => {
    setState(previous => ({
      ...previous,
      selectedBeat: id,
      observations: mergeObservation(previous.observations, `beat:${id}`),
    }))
  }

  return (
    <main
      aria-label="Travel commerce deterministic local demo"
      className="min-h-screen overflow-x-hidden bg-[var(--kg-canvas-bg)] px-3 py-5 text-[var(--kg-text)]"
      data-kg-travel-commerce-demo="v1"
      data-kg-travel-commerce-demo-mode={DEMO_MODE}
      data-kg-travel-commerce-offline-ready={String(offlineReady)}
      data-kg-travel-commerce-execution={execution ? 'passed' : executionError ? 'failed' : 'loading'}
    >
      <section className="mx-auto grid w-full max-w-[720px] min-w-0 gap-4">
        <header className="grid min-w-0 gap-2 rounded-3xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--kg-text-secondary)]">Dev-only · local service doubles</p>
          <h1 className="break-words text-2xl font-semibold">Agentic Travel Commerce</h1>
          <p className="text-sm text-[var(--kg-text-secondary)]">
            Executable deterministic fixture results drive this presenter surface. It issues no provider, payment, deployment, or production request.
          </p>
          <output
            className="rounded-2xl border border-[var(--kg-border)] px-3 py-3 text-sm"
            data-kg-travel-commerce-runtime-evidence={execution ? 'passed' : executionError ? 'failed' : 'loading'}
            role="status"
          >
            {execution
              ? `Executable fixture passed ${execution.beats.length}/8 beats · external effects 0.`
              : executionError
                ? `Executable fixture evidence unavailable: ${executionError}`
                : 'Loading executable fixture evidence…'}
          </output>
          <output
            className="rounded-2xl border border-[var(--kg-border)] px-3 py-3 text-sm"
            data-kg-travel-commerce-connectivity={online ? 'online' : 'offline'}
            role="status"
          >
            {online
              ? `Connected · ${state.observations.length} local observations converged.`
              : `Not current · last synchronized ${formatElapsed(now - state.lastSynchronizedAt)} ago · local projection retained.`}
          </output>
        </header>

        <nav aria-label="Demo beats" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BEATS.map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected.id === item.id}
              onClick={() => selectBeat(item.id)}
              className="min-h-11 min-w-11 rounded-2xl border border-[var(--kg-border)] px-3 py-2 text-left text-sm font-medium"
              data-kg-travel-commerce-beat={item.id}
            >
              {item.id}. {item.title}
            </button>
          ))}
        </nav>

        <article
          aria-labelledby="travel-demo-beat-title"
          className="grid min-w-0 gap-4 rounded-3xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4"
          data-kg-travel-commerce-active-beat={selected.id}
          data-kg-travel-commerce-outcome={selected.outcome}
        >
          <header className="grid gap-2">
            <span
              role="img"
              aria-label={`Beat outcome: ${selected.outcome}`}
              className="grid size-11 place-items-center rounded-full border border-[var(--kg-border)]"
            >
              ●
            </span>
            <h2 id="travel-demo-beat-title" className="break-words text-xl font-semibold">Beat {selected.id}: {selected.title}</h2>
            <p className="text-sm text-[var(--kg-text-secondary)]">{selected.summary}</p>
          </header>
          <dl className="grid min-w-0 gap-2">
            {selected.metrics.map(metric => (
              <div key={metric.label} className="grid min-w-0 gap-1 rounded-2xl border border-[var(--kg-border)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--kg-text-secondary)]">{metric.label}</dt>
                <dd className="m-0 break-words text-sm">{metric.value}</dd>
              </div>
            ))}
          </dl>
          <section
            aria-label={`Executable evidence for beat ${selected.id}`}
            className="min-w-0 rounded-2xl border border-[var(--kg-border)] p-3 text-xs"
            data-kg-travel-commerce-executed-beat={executedBeat?.beat ?? 'unavailable'}
            data-kg-travel-commerce-executed-status={executedBeat?.status ?? 'unavailable'}
          >
            <strong>Fixture result</strong>
            <pre className="mt-2 whitespace-pre-wrap break-words">{executedBeat ? JSON.stringify(executedBeat, null, 2) : 'Unavailable'}</pre>
          </section>
        </article>

        <section aria-labelledby="travel-demo-legs" className="grid min-w-0 gap-3">
          <h2 id="travel-demo-legs" className="text-lg font-semibold">Bundle legs</h2>
          <ul className="grid min-w-0 list-none gap-3 p-0" data-kg-travel-commerce-leg-list="semantic">
            {LEGS.map(item => (
              <li
                key={item.id}
                aria-label={`Leg ${item.id}`}
                className="grid min-w-0 gap-2 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-3"
              >
                <strong className="break-words">{item.id}</strong>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-[var(--kg-text-secondary)]">Relation</dt><dd className="m-0 break-words">{item.relation}</dd></div>
                  <div><dt className="text-[var(--kg-text-secondary)]">Amount (SGD minor units)</dt><dd className="m-0">{item.prior} → {item.next}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  )
}

function beat(
  id: number,
  title: string,
  outcome: DemoBeat['outcome'],
  summary: string,
  metrics: readonly (readonly [string, string])[],
): DemoBeat {
  return Object.freeze({
    id,
    title,
    outcome,
    summary,
    metrics: Object.freeze(metrics.map(([label, value]) => Object.freeze({ label, value }))),
  })
}

function readInitialState(): PersistedUiState {
  const fallback = Object.freeze({ selectedBeat: 1, lastSynchronizedAt: Date.now(), observations: Object.freeze(['seed:v1']) })
  if (typeof localStorage === 'undefined') return fallback
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
    const candidate = value as Partial<PersistedUiState>
    if (!BEATS.some(item => item.id === candidate.selectedBeat) || !Number.isFinite(candidate.lastSynchronizedAt) || !Array.isArray(candidate.observations)) return fallback
    return Object.freeze({
      selectedBeat: candidate.selectedBeat as number,
      lastSynchronizedAt: Number(candidate.lastSynchronizedAt),
      observations: Object.freeze(candidate.observations.filter(item => typeof item === 'string').slice(-50)),
    })
  } catch {
    return fallback
  }
}

function persist(value: PersistedUiState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* Local rendering remains available in memory. */ }
}

function mergeObservation(current: readonly string[], value: string): readonly string[] {
  return Object.freeze([...new Set([...current, value])].slice(-50))
}

function formatElapsed(value: number): string {
  const seconds = Math.max(0, Math.floor(value / 1_000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`
}

async function warmOfflineRoute(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    const registration = await navigator.serviceWorker.register('/travel-commerce-demo-sw.js', {
      scope: '/__demo__/travel-commerce',
    })
    await navigator.serviceWorker.ready
    const worker = registration.active ?? registration.waiting ?? registration.installing
    if (!navigator.serviceWorker.controller) await waitForServiceWorkerControl()
    const urls = performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(value => value.startsWith(window.location.origin))
    await warmServiceWorker(worker, [...urls, window.location.href])
    return true
  } catch {
    return false
  }
}

async function loadExecutedDemoReport(): Promise<ExecutedDemoReport> {
  const evidenceUrl = new URLSearchParams(window.location.search).get('evidence') ?? ''
  if (!/^\/travel-commerce-demo-evidence-[0-9]+\.json$/.test(evidenceUrl)) {
    throw new Error('bounded-evidence-url-required')
  }
  const response = await fetch(evidenceUrl, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`evidence-http-${response.status}`)
  const value: unknown = await response.json()
  if (!isExecutedDemoReport(value)) throw new Error('evidence-contract-invalid')
  return value
}

function isExecutedDemoReport(value: unknown): value is ExecutedDemoReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const report = value as Partial<ExecutedDemoReport>
  return report.schema === 'knowgrph-travel-commerce-demo-evidence/v1'
    && report.status === 'passed'
    && report.mode === DEMO_MODE
    && Array.isArray(report.beats)
    && report.beats.length === 8
    && report.beats.every((item, index) => item?.beat === index + 1 && item.status === 'passed')
    && report.providerRequests === 0
    && report.realPaymentCalls === 0
    && report.productionMutations === 0
}

function waitForServiceWorkerControl(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('service-worker-control-timeout')), 10_000)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

function warmServiceWorker(worker: ServiceWorker | null, urls: readonly string[]): Promise<void> {
  if (!worker) return Promise.reject(new Error('service-worker-unavailable'))
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => reject(new Error('service-worker-warm-timeout')), 10_000)
    channel.port1.onmessage = event => {
      window.clearTimeout(timeout)
      if (event.data?.ok === true) resolve()
      else reject(new Error('service-worker-warm-failed'))
    }
    worker.postMessage({ type: 'warm', urls }, [channel.port2])
  })
}
