import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { MainPanelIconButton } from '../ui/MainPanelIconButton'
import { MainPanelField } from '../ui/MainPanelField'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  commerceTransferRehearsalStore,
  type RehearsalStore,
} from './commerceTransferModel'

const formatTime = (value: number): string => new Date(value).toLocaleString()

export function CommerceTransferRehearsal({
  store = commerceTransferRehearsalStore,
}: Readonly<{ store?: RehearsalStore }>) {
  const typography = usePanelTypography()
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const { draft, reviewed, activity } = snapshot
  const queued = activity.some(item => item.state === 'queued_offline')
  const fieldClass = `w-full min-w-0 rounded border px-2 py-1 ${typography.panelTextClass} ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`

  return (
    <>
      <section id="commerce-transfer" aria-label="Pay and transfer rehearsal" className={`mb-3 min-w-0 border-t py-2 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
        <h2 className={`text-inherit font-semibold ${UI_THEME_TOKENS.text.primary}`}>Pay / transfer rehearsal</h2>
        <p className={`mt-1 text-inherit ${UI_THEME_TOKENS.text.secondary}`}>
          Simulation only. Demo units and recipients have no monetary value. This view never contacts a provider or moves money.
        </p>
        <h3 className={`mt-3 text-inherit font-semibold ${UI_THEME_TOKENS.text.primary}`}>Availability</h3>
        <dl className="mt-1 grid min-w-0 grid-cols-1 gap-2 text-inherit sm:grid-cols-3">
          <section>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Source configuration</dt>
            <dd className={UI_THEME_TOKENS.text.secondary}>Built-in local demo fixture · this browser session</dd>
          </section>
          <section>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Provider readiness</dt>
            <dd className={UI_THEME_TOKENS.text.secondary}>Real transfer unavailable · no provider capability admitted</dd>
          </section>
          <section>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Observed result</dt>
            <dd className={UI_THEME_TOKENS.text.secondary}>
              Local simulation {snapshot.disconnected ? 'disconnected' : 'ready'} · {formatTime(snapshot.observedAtMs)}
            </dd>
          </section>
        </dl>
        <section className="mt-2 min-w-0">
          <MainPanelField label="Demo recipient" type="list" help={{ role: 'Commerce operator', actions: ['Choose the fixture recipient'], outcome: 'review local simulation terms without moving money', value: { key: 'Demo recipient', type: 'list', defaultValue: 'demo-merchant', impact: 'Affects local simulation only.' } }}><PanelSelect aria-label="Demo recipient" className={fieldClass} value={draft.recipient} onValueChange={selectedValueInput => store.edit({ recipient: selectedValueInput as typeof draft.recipient })}>
              <option value="demo-merchant">Demo merchant</option>
              <option value="demo-partner">Demo partner</option>
              <option value="unsupported">Unsupported recipient (blocked case)</option>
            </PanelSelect>
          </MainPanelField>
          <MainPanelField label="Demo amount (minor units)" type="number" help={{ role: 'Commerce operator', actions: ['Set the fixture amount in minor units'], outcome: 'review local simulation terms without moving money', value: { key: 'Demo amount (minor units)', type: 'number', defaultValue: '1000', min: 1, max: 999999999, interval: 1, expansionNote: 'More increases the simulated amount', contractionNote: 'Fewer reduces it', impact: 'Affects local simulation only.' } }}><input aria-label="Demo amount (minor units)" className={fieldClass} type="text" inputMode="numeric" maxLength={9} value={draft.amountMinor} onChange={event => store.edit({ amountMinor: event.target.value })} />
          </MainPanelField>
          <MainPanelField label="Demo asset" type="list" help={{ role: 'Commerce operator', actions: ['Choose the fixture asset'], outcome: 'review local simulation terms without moving money', value: { key: 'Demo asset', type: 'list', defaultValue: 'DEMO-SGD', impact: 'Affects local simulation only.' } }}><PanelSelect aria-label="Demo asset" className={fieldClass} value={draft.asset} onValueChange={selectedValueInput => store.edit({ asset: selectedValueInput as typeof draft.asset })}>
              <option value="DEMO-SGD">DEMO-SGD (not a token)</option>
              <option value="DEMO-USD">DEMO-USD (not a token)</option>
            </PanelSelect>
          </MainPanelField>
          <MainPanelField label="Demo network" type="list" help={{ role: 'Commerce operator', actions: ['Choose the local fixture network'], outcome: 'review local simulation terms without moving money', value: { key: 'Demo network', type: 'list', defaultValue: 'local-a', impact: 'Affects local simulation only.' } }}><PanelSelect aria-label="Demo network" className={fieldClass} value={draft.network} onValueChange={selectedValueInput => store.edit({ network: selectedValueInput as typeof draft.network })}>
              <option value="local-a">Local fixture A</option>
              <option value="local-b">Local fixture B</option>
            </PanelSelect>
          </MainPanelField>
        </section>
        <section className="mt-3 flex flex-wrap gap-2">
          <MainPanelIconButton iconKey="action.review" label="Review demo terms" onClick={store.review} />
          <label className={`inline-flex items-center gap-2 text-inherit ${UI_THEME_TOKENS.text.secondary}`}>
            <input type="checkbox" checked={snapshot.disconnected} onChange={event => store.setDisconnected(event.target.checked)} />
            Simulate disconnect
          </label>
        </section>
        {reviewed ? (
          <section aria-label="Simulation review" className={`mt-3 rounded border p-2 text-inherit ${UI_THEME_TOKENS.panel.border}`}>
            <h3 className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>Review exact simulation</h3>
            <p className={UI_THEME_TOKENS.text.secondary}>
              {draft.recipient} · {draft.amountMinor} minor units of {draft.asset} · {draft.network} · demo fee 0 minor units
            </p>
            <p className={UI_THEME_TOKENS.text.secondary}>Mode: simulation · expires {formatTime(reviewed.expiresAtMs)} · operation {snapshot.operationId}</p>
            <button type="button" className="App-toolbar__btn mt-2 text-inherit" onClick={store.confirm}>Confirm simulation only</button>
          </section>
        ) : null}
        <p role="status" aria-live="polite" className={`mt-2 text-inherit ${UI_THEME_TOKENS.text.secondary}`}>{snapshot.message}</p>
      </section>
      <section id="commerce-activity" aria-label="Commerce activity" className={`mb-3 min-w-0 border-t py-2 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
        <h2 className={`text-inherit font-semibold ${UI_THEME_TOKENS.text.primary}`}>Activity</h2>
        <p className={`mt-1 text-inherit ${UI_THEME_TOKENS.text.secondary}`}>
          Session-local demo records only. No payment receipt, provider event, or settlement evidence is represented here.
        </p>
        {activity.length === 0 ? <p className={`mt-2 text-inherit ${UI_THEME_TOKENS.text.secondary}`}>No simulation recorded yet.</p> : (
          <ol className="mt-2 space-y-2">
            {activity.map(item => (
              <li key={item.operationId} className={`min-w-0 rounded border p-2 text-inherit ${UI_THEME_TOKENS.panel.border}`}>
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
        <section className="mt-2 flex flex-wrap gap-2">
          <MainPanelIconButton iconKey="action.run" label="Retry queued simulation" disabled={!queued || snapshot.disconnected} onClick={store.retry} />
          <MainPanelIconButton iconKey="action.clear" label="Clear demo activity" onClick={store.clear} />
        </section>
      </section>
    </>
  )
}
