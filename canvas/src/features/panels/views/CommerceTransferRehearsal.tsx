import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  commerceTransferRehearsalStore,
  type RehearsalStore,
} from './commerceTransferModel'

const formatTime = (value: number): string => new Date(value).toLocaleString()

export function CommerceTransferRehearsal({
  store = commerceTransferRehearsalStore,
}: Readonly<{ store?: RehearsalStore }>) {
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const { draft, reviewed, activity } = snapshot
  const queued = activity.some(item => item.state === 'queued_offline')
  const fieldClass = `w-full min-w-0 rounded border p-2 text-sm ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`

  return (
    <>
      <section id="commerce-transfer" aria-label="Pay and transfer rehearsal" className={`mb-3 min-w-0 rounded border p-3 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
        <h2 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>Pay / transfer rehearsal</h2>
        <p className={`mt-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
          Simulation only. Demo units and recipients have no monetary value. This view never contacts a provider or moves money.
        </p>
        <h3 className={`mt-3 text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>Availability</h3>
        <dl className="mt-1 grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Source configuration</dt>
            <dd className={UI_THEME_TOKENS.text.secondary}>Built-in local demo fixture · this browser session</dd>
          </div>
          <div>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Provider readiness</dt>
            <dd className={UI_THEME_TOKENS.text.secondary}>Real transfer unavailable · no provider capability admitted</dd>
          </div>
          <div>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Observed result</dt>
            <dd className={UI_THEME_TOKENS.text.secondary}>
              Local simulation {snapshot.disconnected ? 'disconnected' : 'ready'} · {formatTime(snapshot.observedAtMs)}
            </dd>
          </div>
        </dl>
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={`min-w-0 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            Demo recipient
            <select className={fieldClass} value={draft.recipient} onChange={event => store.edit({ recipient: event.target.value as typeof draft.recipient })}>
              <option value="demo-merchant">Demo merchant</option>
              <option value="demo-partner">Demo partner</option>
              <option value="unsupported">Unsupported recipient (blocked case)</option>
            </select>
          </label>
          <label className={`min-w-0 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            Demo amount (minor units)
            <input className={fieldClass} type="text" inputMode="numeric" maxLength={9} value={draft.amountMinor} onChange={event => store.edit({ amountMinor: event.target.value })} />
          </label>
          <label className={`min-w-0 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            Demo asset
            <select className={fieldClass} value={draft.asset} onChange={event => store.edit({ asset: event.target.value as typeof draft.asset })}>
              <option value="DEMO-SGD">DEMO-SGD (not a token)</option>
              <option value="DEMO-USD">DEMO-USD (not a token)</option>
            </select>
          </label>
          <label className={`min-w-0 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            Demo network
            <select className={fieldClass} value={draft.network} onChange={event => store.edit({ network: event.target.value as typeof draft.network })}>
              <option value="local-a">Local fixture A</option>
              <option value="local-b">Local fixture B</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="App-toolbar__btn text-xs" onClick={store.review}>Review demo terms</button>
          <label className={`inline-flex items-center gap-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            <input type="checkbox" checked={snapshot.disconnected} onChange={event => store.setDisconnected(event.target.checked)} />
            Simulate disconnect
          </label>
        </div>
        {reviewed ? (
          <section aria-label="Simulation review" className={`mt-3 rounded border p-2 text-xs ${UI_THEME_TOKENS.panel.border}`}>
            <h3 className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>Review exact simulation</h3>
            <p className={UI_THEME_TOKENS.text.secondary}>
              {draft.recipient} · {draft.amountMinor} minor units of {draft.asset} · {draft.network} · demo fee 0 minor units
            </p>
            <p className={UI_THEME_TOKENS.text.secondary}>Mode: simulation · expires {formatTime(reviewed.expiresAtMs)} · operation {snapshot.operationId}</p>
            <button type="button" className="App-toolbar__btn mt-2 text-xs" onClick={store.confirm}>Confirm simulation only</button>
          </section>
        ) : null}
        <p role="status" aria-live="polite" className={`mt-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>{snapshot.message}</p>
      </section>
      <section id="commerce-activity" aria-label="Commerce activity" className={`mb-3 min-w-0 rounded border p-3 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
        <h2 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>Activity</h2>
        <p className={`mt-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
          Session-local demo records only. No payment receipt, provider event, or settlement evidence is represented here.
        </p>
        {activity.length === 0 ? <p className={`mt-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>No simulation recorded yet.</p> : (
          <ol className="mt-2 space-y-2">
            {activity.map(item => (
              <li key={item.operationId} className={`min-w-0 rounded border p-2 text-xs ${UI_THEME_TOKENS.panel.border}`}>
                <strong className={UI_THEME_TOKENS.text.primary}>Simulation {item.state === 'queued_offline' ? 'queued offline' : 'recorded'}</strong>
                <p className={`break-all ${UI_THEME_TOKENS.text.secondary}`}>Operation {item.operationId}</p>
                <p className={UI_THEME_TOKENS.text.secondary}>
                  {item.terms.recipient} · {item.terms.amountMinor} minor units of {item.terms.asset} · {item.terms.network} · demo fee {item.feeMinor}
                </p>
                <p className={UI_THEME_TOKENS.text.secondary}>Observed {formatTime(item.observedAtMs)} · no money moved</p>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="App-toolbar__btn text-xs" disabled={!queued || snapshot.disconnected} onClick={store.retry}>Retry queued simulation</button>
          <button type="button" className="App-toolbar__btn text-xs" onClick={store.clear}>Clear demo activity</button>
        </div>
      </section>
    </>
  )
}
