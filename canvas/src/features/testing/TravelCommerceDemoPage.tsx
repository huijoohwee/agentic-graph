import React from 'react'

type Outcome = 'committed' | 'rolled-back' | 'rejected' | 'observed'
type DemoLeg = Readonly<{
  legId: string
  category: string
  relation: 'changed' | 'affected' | 'unaffected sibling'
  committedOfferId: string
  committedAmountMinor: number
}>
type DemoEdge = Readonly<{ fromLegId: string; toLegId: string }>
type DemoChange = Readonly<{
  legId: string
  priorOfferId: string
  priorAmountMinor: number
  newOfferId: string
  newAmountMinor: number
  currency: 'SGD'
  priceVerification: 'deterministic-demo'
}>
type BeatBase<Id extends number, Result extends Outcome> = Readonly<{
  beat: Id
  status: 'passed'
  title: string
  outcome: Result
  summary: string
}>
type Beat1 = BeatBase<1, 'observed'> & Readonly<{ legs: readonly DemoLeg[]; edges: readonly DemoEdge[]; graphEngines: 0 }>
type Beat2 = BeatBase<2, 'observed'> & Readonly<{
  changedLegId: string
  affectedLegIds: readonly string[]
  changes: readonly DemoChange[]
  unaffectedSibling: Readonly<{
    legId: string
    offerIdBefore: string
    offerIdAfter: string
    amountMinorBefore: number
    amountMinorAfter: number
  }>
  unaffectedSiblingsTouched: 0
}>
type Beat3Outcome = Readonly<{
  kind: 'committed' | 'rolled-back'
  cascadeId: string
  affectedLegIds: readonly string[]
  reason: null | 'requote-rejected'
  mixedStates: 0
  snapshotRestored?: true
  beforeLegs: readonly DemoLeg[]
  afterLegs: readonly DemoLeg[]
}>
type Beat3 = BeatBase<3, 'rolled-back'> & Readonly<{ outcomes: readonly [Beat3Outcome, Beat3Outcome] }>
type Beat4 = BeatBase<4, 'committed'> & Readonly<{
  currency: 'SGD'
  nonZero: Readonly<{
    cascadeId: string; idempotencyKey: string; affectedLegIds: readonly string[]; netAmountMinor: number
    settlementCallsOnFirstExecution: 1; settlementCallsAfterExactReplay: 1; exactReplayOutcome: 'committed'
  }>
  zeroNet: Readonly<{
    cascadeId: string; idempotencyKey: string; affectedLegIds: readonly string[]; netAmountMinor: 0
    settlementCalls: 0; recordedAs: 'zero-net'
  }>
}>
type Beat5Offer = Readonly<{
  agentId: string; offerId: string; amountMinor: number; result: 'reserved' | 'rejected'; reason: null | 'insufficient-envelope'
}>
type Beat5 = BeatBase<5, 'rejected'> & Readonly<{
  envelopeAmountMinor: number; currency: 'SGD'
  initialRace: Readonly<{
    offers: readonly [Beat5Offer, Beat5Offer]
    acceptedOfferId: string; rejectedOfferId: string; rejectedReason: 'insufficient-envelope'
  }>
  release: Readonly<{ cascadeId: string; result: 'released'; releasedHolds: 1 }>
  resubmission: Readonly<{ agentId: string; offerId: string; amountMinor: number; result: 'reserved'; availableWithoutDelay: true }>
}>
type Beat6 = BeatBase<6, 'rejected'> & Readonly<{
  limit: 20; observed: 21; insertLegOperation: 'real-runtime'; insertLegRejected: true
  insertEdgeOperation: 'real-runtime'; cycleRejected: true; rejectedMutationsApplied: 0
}>
type Beat7 = BeatBase<7, 'observed'> & Readonly<{
  orchestrationCost: Readonly<{ component: 'Reopt_Worker'; promptTokens: 0; completionTokens: 0; dollarCost: 0 }>
  cache: Readonly<{
    requests: 2; dispatchesWithoutCache: 2; dispatchesWithCache: 1; dispatchesSaved: 1
    offerId: string; priceVerification: 'deterministic-demo'
  }>
  model: Readonly<{
    id: string; providerId: string; path: 'workers-ai-free'; license: string; metered: true
    freeDailyNeuronLimit: 10000; execution: 'eligible-not-invoked-by-orchestration'
  }>
}>
type Beat8 = BeatBase<8, 'observed'> & Readonly<{
  offline: Readonly<{ rendered: true; current: false; outcome: 'committed'; observationsRetained: 1 }>
  reconnect: Readonly<{ converged: true; outcome: 'rolled-back'; observationsAfterReconnect: 2; lostObservations: 0 }>
  browserSessionRequiredForNetworkProof: true
}>
type ExecutedDemoBeat = Beat1 | Beat2 | Beat3 | Beat4 | Beat5 | Beat6 | Beat7 | Beat8
type ExecutedDemoReport = Readonly<{
  schema: 'agentic-graph-travel-commerce-demo-evidence/v1'
  status: 'passed'
  mode: 'deterministic-local-service-doubles'
  deployLane: 'Dev_Lane'
  beats: readonly [Beat1, Beat2, Beat3, Beat4, Beat5, Beat6, Beat7, Beat8]
  providerRequests: 0
  realPaymentCalls: 0
  productionMutations: 0
}>
type BrowserEvidence = Readonly<{
  offlineTransitions: number
  offlineReloads: number
  reconnects: number
  observationsAtLastOffline: number | null
  observationsAfterLastReconnect: number | null
  lostObservations: number
}>
type PersistedUiState = Readonly<{
  selectedBeat: number
  lastSynchronizedAt: number
  observations: readonly string[]
  browserEvidence: BrowserEvidence
}>
type Detail = Readonly<{ id: string; title: string; rows: readonly Readonly<{ label: string; value: string }>[] }>

const STORAGE_KEY = 'agentic-graph:travel-commerce:demo-ui:v1'
const DEMO_MODE = 'deterministic-local-service-doubles'
const EMPTY_BROWSER_EVIDENCE: BrowserEvidence = Object.freeze({
  offlineTransitions: 0, offlineReloads: 0, reconnects: 0,
  observationsAtLastOffline: null, observationsAfterLastReconnect: null, lostObservations: 0,
})

export function TravelCommerceDemoPage() {
  const [state, setState] = React.useState<PersistedUiState>(readInitialState)
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [now, setNow] = React.useState(Date.now())
  const [offlineReady, setOfflineReady] = React.useState(false)
  const [execution, setExecution] = React.useState<ExecutedDemoReport | null>(null)
  const [executionError, setExecutionError] = React.useState<string | null>(null)
  const offlineLoadRecorded = React.useRef(false)
  const selected = execution?.beats.find(item => item.beat === state.selectedBeat) ?? execution?.beats[0] ?? null
  const bundle = execution?.beats[0] ?? null

  React.useEffect(() => { persist(state) }, [state])
  React.useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1_000)
    const offline = () => {
      setOnline(false)
      setState(previous => recordOffline(previous, false))
    }
    const onlineAgain = () => {
      setOnline(true)
      setState(recordReconnect)
    }
    if (!navigator.onLine && !offlineLoadRecorded.current) {
      offlineLoadRecorded.current = true
      setState(previous => recordOffline(previous, true))
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

  const selectBeat = (id: number) => setState(previous => ({
    ...previous,
    selectedBeat: id,
    observations: mergeObservation(previous.observations, `beat:${id}`),
  }))

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
            Every presenter claim below is rendered from the validated executable record. This surface issues no provider, payment, deployment, or production request.
          </p>
          <output className="rounded-2xl border border-[var(--kg-border)] px-3 py-3 text-sm" data-kg-travel-commerce-runtime-evidence={execution ? 'passed' : executionError ? 'failed' : 'loading'} role="status">
            {execution ? `Strict executable fixture passed ${execution.beats.length}/8 beats · external effects 0.` : executionError ? `Executable fixture evidence unavailable: ${executionError}` : 'Loading executable fixture evidence…'}
          </output>
          <output className="rounded-2xl border border-[var(--kg-border)] px-3 py-3 text-sm" data-kg-travel-commerce-connectivity={online ? 'online' : 'offline'} role="status">
            {online ? `Connected · ${state.observations.length} local observations converged.` : `Not current · last synchronized ${formatElapsed(now - state.lastSynchronizedAt)} ago · local projection retained.`}
          </output>
        </header>

        <nav aria-label="Demo beats" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {execution?.beats.map(item => (
            <button key={item.beat} type="button" aria-pressed={selected?.beat === item.beat} onClick={() => selectBeat(item.beat)} className="min-h-11 min-w-11 rounded-2xl border border-[var(--kg-border)] px-3 py-2 text-left text-sm font-medium" data-kg-travel-commerce-beat={item.beat}>
              {item.beat}. {item.title}
            </button>
          ))}
        </nav>

        {selected ? (
          <article
            aria-labelledby="travel-demo-beat-title"
            className="grid min-w-0 gap-4 rounded-3xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4"
            data-kg-travel-commerce-active-beat={selected.beat}
            data-kg-travel-commerce-outcome={selected.outcome}
            data-kg-travel-commerce-rendered-beat-json={JSON.stringify(selected)}
          >
            <header className="grid gap-2">
              <span role="img" aria-label={`Beat outcome: ${selected.outcome}`} className="grid size-11 place-items-center rounded-full border border-[var(--kg-border)]">●</span>
              <h2 id="travel-demo-beat-title" className="break-words text-xl font-semibold">Beat {selected.beat}: {selected.title}</h2>
              <p className="text-sm text-[var(--kg-text-secondary)]">{selected.summary}</p>
            </header>
            {detailsForBeat(selected, state.browserEvidence).map(detail => (
              <section key={detail.id} aria-label={detail.title} className="grid min-w-0 gap-2 rounded-2xl border border-[var(--kg-border)] p-3" data-kg-travel-commerce-detail={detail.id}>
                <h3 className="font-semibold">{detail.title}</h3>
                <dl className="grid min-w-0 gap-2">
                  {detail.rows.map(row => (
                    <div key={row.label} className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--kg-text-secondary)]">{row.label}</dt>
                      <dd className="m-0 break-words text-sm">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <section aria-label={`Exact executable evidence for beat ${selected.beat}`} className="min-w-0 rounded-2xl border border-[var(--kg-border)] p-3 text-xs" data-kg-travel-commerce-executed-beat={selected.beat} data-kg-travel-commerce-executed-status={selected.status}>
              <strong>Exact fixture record</strong>
              <pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(selected, null, 2)}</pre>
            </section>
          </article>
        ) : null}

        {bundle ? (
          <section aria-labelledby="travel-demo-bundle" className="grid min-w-0 gap-3">
            <h2 id="travel-demo-bundle" className="text-lg font-semibold">Executed bundle snapshot</h2>
            <ul className="grid min-w-0 list-none gap-3 p-0" data-kg-travel-commerce-leg-list="semantic">
              {bundle.legs.map(item => (
                <li key={item.legId} aria-label={`Leg ${item.legId}`} className="grid min-w-0 gap-2 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-3" data-kg-travel-commerce-leg={item.legId} data-kg-travel-commerce-offer={item.committedOfferId} data-kg-travel-commerce-amount={item.committedAmountMinor}>
                  <strong className="break-words">{item.legId}</strong>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-[var(--kg-text-secondary)]">Relation</dt><dd className="m-0 break-words">{item.relation}</dd></div>
                    <div><dt className="text-[var(--kg-text-secondary)]">Committed offer</dt><dd className="m-0 break-words">{item.committedOfferId}</dd></div>
                    <div><dt className="text-[var(--kg-text-secondary)]">Amount (SGD minor units)</dt><dd className="m-0">{item.committedAmountMinor}</dd></div>
                    <div><dt className="text-[var(--kg-text-secondary)]">Category</dt><dd className="m-0 break-words">{item.category}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            <ol className="grid min-w-0 list-none gap-2 p-0" data-kg-travel-commerce-edge-list="semantic">
              {bundle.edges.map(edge => (
                <li key={`${edge.fromLegId}:${edge.toLegId}`} className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-3 text-sm" data-kg-travel-commerce-edge-from={edge.fromLegId} data-kg-travel-commerce-edge-to={edge.toLegId}>
                  <strong>{edge.fromLegId}</strong> → <strong>{edge.toLegId}</strong>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </section>
    </main>
  )
}

function detailsForBeat(beat: ExecutedDemoBeat, browser: BrowserEvidence): readonly Detail[] {
  const detail = (id: string, title: string, rows: readonly (readonly [string, unknown])[]): Detail => ({
    id, title, rows: rows.map(([label, value]) => ({ label, value: display(value) })),
  })
  switch (beat.beat) {
    case 1: return [detail('beat1-graph', 'Stored dependency structure', [['Leg rows', beat.legs.length], ['Edge rows', beat.edges.length], ['Graph engines', beat.graphEngines], ['Endpoints', beat.edges.map(edge => `${edge.fromLegId} → ${edge.toLegId}`)]])]
    case 2: return [
      detail('beat2-affected', 'Reachability result', [['Changed leg', beat.changedLegId], ['Affected legs', beat.affectedLegIds], ['Changed offers', beat.changes.map(change => `${change.legId}: ${change.priorOfferId}@${change.priorAmountMinor} → ${change.newOfferId}@${change.newAmountMinor}`)]]),
      detail('beat2-unaffected', 'Untouched sibling', [['Leg', beat.unaffectedSibling.legId], ['Offer snapshot', `${beat.unaffectedSibling.offerIdBefore} → ${beat.unaffectedSibling.offerIdAfter}`], ['Amount snapshot', `${beat.unaffectedSibling.amountMinorBefore} → ${beat.unaffectedSibling.amountMinorAfter}`], ['Touched', beat.unaffectedSiblingsTouched]]),
    ]
    case 3: return beat.outcomes.map(outcome => detail(`beat3-${outcome.kind}`, outcome.kind === 'committed' ? 'Clean committed outcome' : 'Rejected rollback outcome', [['Cascade', outcome.cascadeId], ['Affected legs', outcome.affectedLegIds], ['Reason', outcome.reason], ['Mixed states', outcome.mixedStates], ['Snapshot restored', outcome.snapshotRestored ?? false], ['Before offers', snapshot(outcome.beforeLegs)], ['After offers', snapshot(outcome.afterLegs)]]))
    case 4: return [
      detail('beat4-nonzero', 'Non-zero net scenario', [['Cascade / idempotency key', `${beat.nonZero.cascadeId} / ${beat.nonZero.idempotencyKey}`], ['Affected legs', beat.nonZero.affectedLegIds], ['Net amount (SGD minor units)', beat.nonZero.netAmountMinor], ['Calls on first execution', beat.nonZero.settlementCallsOnFirstExecution], ['Calls after exact replay', beat.nonZero.settlementCallsAfterExactReplay], ['Replay outcome', beat.nonZero.exactReplayOutcome]]),
      detail('beat4-zero-net', 'Zero-net companion', [['Cascade / idempotency key', `${beat.zeroNet.cascadeId} / ${beat.zeroNet.idempotencyKey}`], ['Affected legs', beat.zeroNet.affectedLegIds], ['Net amount (SGD minor units)', beat.zeroNet.netAmountMinor], ['Settlement calls', beat.zeroNet.settlementCalls], ['Record', beat.zeroNet.recordedAs]]),
    ]
    case 5: return [
      detail('beat5-initial-race', 'Initial concurrent race', [['Envelope (SGD minor units)', beat.envelopeAmountMinor], ['Offers', beat.initialRace.offers.map(offer => `${offer.agentId} · ${offer.offerId} · ${offer.amountMinor} · ${offer.result}${offer.reason ? ` (${offer.reason})` : ''}`)], ['Accepted offer', beat.initialRace.acceptedOfferId], ['Rejected offer', beat.initialRace.rejectedOfferId], ['Reason', beat.initialRace.rejectedReason]]),
      detail('beat5-release', 'Release', [['Cascade', beat.release.cascadeId], ['Result', beat.release.result], ['Released holds', beat.release.releasedHolds]]),
      detail('beat5-resubmission', 'Immediate resubmission', [['Agent', beat.resubmission.agentId], ['Offer', beat.resubmission.offerId], ['Amount', beat.resubmission.amountMinor], ['Result', beat.resubmission.result], ['Available without delay', beat.resubmission.availableWithoutDelay]]),
    ]
    case 6: return [detail('beat6-boundaries', 'Rejected runtime mutations', [['Declared leg limit', beat.limit], ['Observed insert count', beat.observed], ['21st insertLeg', `${beat.insertLegOperation} · rejected ${beat.insertLegRejected}`], ['Cycle-forming insertEdge', `${beat.insertEdgeOperation} · rejected ${beat.cycleRejected}`], ['Rejected mutations applied', beat.rejectedMutationsApplied]])]
    case 7: return [
      detail('beat7-cost', 'Orchestration Cost_Log', [['Component', beat.orchestrationCost.component], ['Prompt tokens', beat.orchestrationCost.promptTokens], ['Completion tokens', beat.orchestrationCost.completionTokens], ['Dollar cost', beat.orchestrationCost.dollarCost]]),
      detail('beat7-cache', 'Offer-cache observation', [['Requests', beat.cache.requests], ['Dispatches without cache', beat.cache.dispatchesWithoutCache], ['Dispatches with cache', beat.cache.dispatchesWithCache], ['Dispatches saved', beat.cache.dispatchesSaved], ['Offer / verification', `${beat.cache.offerId} / ${beat.cache.priceVerification}`]]),
      detail('beat7-model', 'Eligible model declaration', [['Model', beat.model.id], ['Provider model', beat.model.providerId], ['Path', beat.model.path], ['License', beat.model.license], ['Quota metered', beat.model.metered], ['Free neurons / day', beat.model.freeDailyNeuronLimit], ['Execution', beat.model.execution]]),
    ]
    case 8: return [
      detail('beat8-fixture-offline', 'Executed local-projection offline evidence', [['Rendered', beat.offline.rendered], ['Current', beat.offline.current], ['Outcome retained', beat.offline.outcome], ['Observations retained', beat.offline.observationsRetained]]),
      detail('beat8-fixture-reconnect', 'Executed convergence evidence', [['Converged', beat.reconnect.converged], ['Outcome after reconnect', beat.reconnect.outcome], ['Observations after reconnect', beat.reconnect.observationsAfterReconnect], ['Lost observations', beat.reconnect.lostObservations]]),
      detail('beat8-browser-session', 'Current browser network-proof session', [['Offline transitions', browser.offlineTransitions], ['Offline reloads', browser.offlineReloads], ['Reconnects', browser.reconnects], ['Observations at last offline', browser.observationsAtLastOffline], ['Observations after last reconnect', browser.observationsAfterLastReconnect], ['Lost observations', browser.lostObservations]]),
    ]
  }
}

function snapshot(legs: readonly DemoLeg[]): string[] { return legs.map(leg => `${leg.legId}: ${leg.committedOfferId}@${leg.committedAmountMinor}`) }
function display(value: unknown): string {
  if (Array.isArray(value)) return value.join(' · ')
  if (value === null) return 'none'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

function readInitialState(): PersistedUiState {
  const fallback = fallbackState()
  if (typeof localStorage === 'undefined') return fallback
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!isRecord(value) || !integerBetween(value.selectedBeat, 1, 8) || !Number.isFinite(value.lastSynchronizedAt) || !Array.isArray(value.observations)) return fallback
    const browser = isRecord(value.browserEvidence) ? value.browserEvidence : EMPTY_BROWSER_EVIDENCE
    return Object.freeze({
      selectedBeat: value.selectedBeat,
      lastSynchronizedAt: Number(value.lastSynchronizedAt),
      observations: Object.freeze(value.observations.filter(item => typeof item === 'string').slice(-50)),
      browserEvidence: validBrowserEvidence(browser) ? Object.freeze({ ...browser }) as BrowserEvidence : EMPTY_BROWSER_EVIDENCE,
    })
  } catch { return fallback }
}
function fallbackState(): PersistedUiState { return Object.freeze({ selectedBeat: 1, lastSynchronizedAt: Date.now(), observations: Object.freeze(['seed:v1']), browserEvidence: EMPTY_BROWSER_EVIDENCE }) }
function persist(value: PersistedUiState) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* Local rendering remains available in memory. */ } }
function mergeObservation(current: readonly string[], value: string): readonly string[] { return Object.freeze([...new Set([...current, value])].slice(-50)) }
function recordOffline(previous: PersistedUiState, reload: boolean): PersistedUiState {
  const at = Date.now()
  const observations = mergeObservation(previous.observations, `${reload ? 'browser-offline-reload' : 'browser-offline'}:${at}`)
  return { ...previous, observations, browserEvidence: { ...previous.browserEvidence, offlineTransitions: previous.browserEvidence.offlineTransitions + (reload ? 0 : 1), offlineReloads: previous.browserEvidence.offlineReloads + (reload ? 1 : 0), observationsAtLastOffline: observations.length } }
}
function recordReconnect(previous: PersistedUiState): PersistedUiState {
  const synchronizedAt = Date.now()
  const observations = mergeObservation(previous.observations, `edge-reconnect:${synchronizedAt}`)
  const offlineCount = previous.browserEvidence.observationsAtLastOffline ?? observations.length
  return { ...previous, lastSynchronizedAt: synchronizedAt, observations, browserEvidence: { ...previous.browserEvidence, reconnects: previous.browserEvidence.reconnects + 1, observationsAfterLastReconnect: observations.length, lostObservations: Math.max(0, offlineCount - observations.length) } }
}
function formatElapsed(value: number): string { const seconds = Math.max(0, Math.floor(value / 1_000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m` }

async function warmOfflineRoute(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    const registration = await navigator.serviceWorker.register('/travel-commerce-demo-sw.js', { scope: '/__demo__/travel-commerce' })
    await navigator.serviceWorker.ready
    const worker = registration.active ?? registration.waiting ?? registration.installing
    if (!navigator.serviceWorker.controller) await waitForServiceWorkerControl()
    const evidencePath = new URLSearchParams(window.location.search).get('evidence') ?? ''
    if (!/^\/travel-commerce-demo-evidence-[0-9]+-[0-9]+\.json$/.test(evidencePath)) return false
    const requiredUrls = [window.location.href, new URL(evidencePath, window.location.origin).href]
    const urls = performance.getEntriesByType('resource').map(entry => entry.name).filter(value => value.startsWith(window.location.origin))
    await warmServiceWorker(worker, [...new Set([...urls, ...requiredUrls])])
    return (await Promise.all(requiredUrls.map(url => caches.match(url)))).every(Boolean)
  } catch { return false }
}

async function loadExecutedDemoReport(): Promise<ExecutedDemoReport> {
  const evidenceUrl = new URLSearchParams(window.location.search).get('evidence') ?? ''
  if (!/^\/travel-commerce-demo-evidence-[0-9]+-[0-9]+\.json$/.test(evidenceUrl)) throw new Error('bounded-evidence-url-required')
  const response = await fetch(evidenceUrl, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`evidence-http-${response.status}`)
  const value: unknown = await response.json()
  if (!isExecutedDemoReport(value)) throw new Error('evidence-contract-invalid')
  return value
}

function isExecutedDemoReport(value: unknown): value is ExecutedDemoReport {
  try {
    if (!isRecord(value) || value.schema !== 'agentic-graph-travel-commerce-demo-evidence/v1' || value.status !== 'passed' || value.mode !== DEMO_MODE || value.deployLane !== 'Dev_Lane' || value.providerRequests !== 0 || value.realPaymentCalls !== 0 || value.productionMutations !== 0 || !Array.isArray(value.beats) || value.beats.length !== 8) return false
    const beats = value.beats as unknown as ExecutedDemoReport['beats']
    if (!beats.every((beat, index) => isRecord(beat) && beat.beat === index + 1 && beat.status === 'passed' && nonEmpty(beat.title) && nonEmpty(beat.summary))) return false
    const [one, two, three, four, five, six, seven, eight] = beats
    const ids = new Set(one.legs.map(leg => leg.legId))
    const reached = reachable(one.edges, two.changedLegId)
    const [clean, rollback] = three.outcomes
    const accepted = five.initialRace.offers.find(offer => offer.result === 'reserved')
    const rejected = five.initialRace.offers.find(offer => offer.result === 'rejected')
    return one.outcome === 'observed' && one.graphEngines === 0 && validLegs(one.legs, 4) && ids.size === 4 && validEdges(one.edges, ids)
      && two.outcome === 'observed' && stringArray(two.affectedLegIds, 2) && sameStrings(two.affectedLegIds, reached) && !two.affectedLegIds.includes(two.changedLegId) && validChanges(two.changes, two.affectedLegIds) && two.unaffectedSibling.offerIdBefore === two.unaffectedSibling.offerIdAfter && two.unaffectedSibling.amountMinorBefore === two.unaffectedSibling.amountMinorAfter && two.unaffectedSiblingsTouched === 0
      && three.outcome === 'rolled-back' && three.outcomes.length === 2 && clean.kind === 'committed' && clean.reason === null && rollback.kind === 'rolled-back' && rollback.reason === 'requote-rejected' && clean.mixedStates === 0 && rollback.mixedStates === 0 && validLegs(clean.beforeLegs, 4) && validLegs(clean.afterLegs, 4) && rollback.snapshotRestored === true && JSON.stringify(rollback.beforeLegs) === JSON.stringify(rollback.afterLegs)
      && four.outcome === 'committed' && four.currency === 'SGD' && four.nonZero.idempotencyKey === four.nonZero.cascadeId && four.nonZero.netAmountMinor !== 0 && four.nonZero.settlementCallsOnFirstExecution === 1 && four.nonZero.settlementCallsAfterExactReplay === 1 && four.nonZero.exactReplayOutcome === 'committed' && four.zeroNet.idempotencyKey === four.zeroNet.cascadeId && four.zeroNet.netAmountMinor === 0 && four.zeroNet.settlementCalls === 0 && four.zeroNet.recordedAs === 'zero-net'
      && five.outcome === 'rejected' && five.currency === 'SGD' && five.initialRace.offers.length === 2 && accepted?.offerId === five.initialRace.acceptedOfferId && rejected?.offerId === five.initialRace.rejectedOfferId && rejected?.reason === 'insufficient-envelope' && five.release.result === 'released' && five.release.releasedHolds === 1 && five.resubmission.result === 'reserved' && five.resubmission.availableWithoutDelay === true && five.resubmission.offerId === rejected.offerId && five.resubmission.agentId === rejected.agentId
      && six.outcome === 'rejected' && six.limit === 20 && six.observed === 21 && six.insertLegOperation === 'real-runtime' && six.insertLegRejected === true && six.insertEdgeOperation === 'real-runtime' && six.cycleRejected === true && six.rejectedMutationsApplied === 0
      && seven.outcome === 'observed' && seven.orchestrationCost.component === 'Reopt_Worker' && seven.orchestrationCost.promptTokens === 0 && seven.orchestrationCost.completionTokens === 0 && seven.orchestrationCost.dollarCost === 0 && seven.cache.requests === 2 && seven.cache.dispatchesWithoutCache === 2 && seven.cache.dispatchesWithCache === 1 && seven.cache.dispatchesSaved === 1 && seven.model.path === 'workers-ai-free' && seven.model.metered === true && seven.model.freeDailyNeuronLimit === 10_000
      && eight.outcome === 'observed' && eight.offline.rendered === true && eight.offline.current === false && eight.offline.observationsRetained === 1 && eight.reconnect.converged === true && eight.reconnect.outcome === 'rolled-back' && eight.reconnect.observationsAfterReconnect === 2 && eight.reconnect.lostObservations === 0 && eight.browserSessionRequiredForNetworkProof === true
  } catch { return false }
}

function validLegs(value: readonly DemoLeg[], length: number): boolean { return Array.isArray(value) && value.length === length && value.every(leg => isRecord(leg) && nonEmpty(leg.legId) && nonEmpty(leg.category) && ['changed', 'affected', 'unaffected sibling'].includes(leg.relation) && nonEmpty(leg.committedOfferId) && minorUnits(leg.committedAmountMinor)) }
function validEdges(value: readonly DemoEdge[], ids: Set<string>): boolean { return Array.isArray(value) && value.length === 2 && value.every(edge => isRecord(edge) && ids.has(edge.fromLegId) && ids.has(edge.toLegId) && edge.fromLegId !== edge.toLegId) && new Set(value.map(edge => `${edge.fromLegId}->${edge.toLegId}`)).size === 2 }
function validChanges(value: readonly DemoChange[], affected: readonly string[]): boolean { return Array.isArray(value) && value.length === affected.length && value.every(change => isRecord(change) && affected.includes(change.legId) && nonEmpty(change.priorOfferId) && nonEmpty(change.newOfferId) && change.priorOfferId !== change.newOfferId && minorUnits(change.priorAmountMinor) && minorUnits(change.newAmountMinor) && change.currency === 'SGD' && change.priceVerification === 'deterministic-demo') }
function reachable(edges: readonly DemoEdge[], start: string): string[] {
  const visited = new Set<string>(); const queue = [start]
  while (queue.length) { const current = queue.shift(); for (const edge of edges) { if (edge.fromLegId === current && !visited.has(edge.toLegId)) { visited.add(edge.toLegId); queue.push(edge.toLegId) } } }
  return [...visited]
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean { return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort()) }
function stringArray(value: unknown, length: number): value is string[] { return Array.isArray(value) && value.length === length && value.every(nonEmpty) && new Set(value).size === value.length }
function validBrowserEvidence(value: Record<string, unknown>): boolean { return ['offlineTransitions', 'offlineReloads', 'reconnects', 'lostObservations'].every(key => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0) && ['observationsAtLastOffline', 'observationsAfterLastReconnect'].every(key => value[key] === null || (Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)) }
function isRecord(value: unknown): value is Record<string, any> { return value != null && typeof value === 'object' && !Array.isArray(value) }
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }
function minorUnits(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 }
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0 }
function integerBetween(value: unknown, minimum: number, maximum: number): value is number { return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum }

function waitForServiceWorkerControl(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('service-worker-control-timeout')), 10_000)
    navigator.serviceWorker.addEventListener('controllerchange', () => { window.clearTimeout(timeout); resolve() }, { once: true })
  })
}
function warmServiceWorker(worker: ServiceWorker | null, urls: readonly string[]): Promise<void> {
  if (!worker) return Promise.reject(new Error('service-worker-unavailable'))
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => reject(new Error('service-worker-warm-timeout')), 10_000)
    channel.port1.onmessage = event => { window.clearTimeout(timeout); event.data?.ok === true ? resolve() : reject(new Error('service-worker-warm-failed')) }
    worker.postMessage({ type: 'warm', urls }, [channel.port2])
  })
}
