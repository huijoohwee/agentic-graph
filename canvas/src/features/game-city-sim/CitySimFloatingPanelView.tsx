import React from 'react'
import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  Lightbulb,
  MapPinned,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Square,
  Users,
} from 'lucide-react'
import {
  FloatingPanelCatalogHeader,
  floatingPanelCatalogBodyClassName,
  floatingPanelCatalogSurfaceClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  cityParcelId,
  type CityAdvisorProposal,
  type CityZone,
  type CityZoningType,
} from './citySimModel'
import {
  cityInputSourceFromActivation,
  cityInputSourceFromPointerType,
  describeCityInputSnapshot,
  enqueueCityInput,
  type CityInputSource,
} from './citySimInputRuntime'
import { CityParcelCoordinateControls } from './CityParcelCoordinateControls'
import {
  applyCityAdvice,
  openCitySimSurface,
  readCitySimSnapshot,
  requestCityAdvice,
  resetCitySim,
  restartCitySim,
  saveCitySim,
  startCitySim,
  stopCitySim,
  subscribeCitySimSnapshot,
} from './citySimRuntime'
import { exitCitySimSurfaceAndWait } from './citySimSurfaceExit'

type PendingAction =
  | 'open'
  | 'start'
  | 'stop'
  | 'restart'
  | 'reset'
  | 'exit'
  | 'select'
  | 'zone'
  | 'advise'
  | 'apply'
  | 'save'

const ZONE_LABELS: Readonly<Record<CityZone, string>> = Object.freeze({
  unzoned: 'Unzoned',
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
})

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
})

function formatMetric(value: number): string {
  return Number.isSafeInteger(value) ? value.toLocaleString('en-US') : 'Unavailable'
}

function formatTreasuryCents(value: number): string {
  return Number.isSafeInteger(value)
    ? CURRENCY_FORMATTER.format(value / 100)
    : 'Unavailable'
}

function CityZoneButton({
  disabled,
  onSelect,
  selected,
  zone,
}: {
  disabled: boolean
  onSelect: (zone: CityZoningType, source: CityInputSource) => void
  selected: boolean
  zone: CityZoningType
}) {
  const sourceRef = React.useRef<CityInputSource>('pointer')
  return (
    <button
      type="button"
      className="App-toolbar__btn"
      aria-pressed={selected}
      disabled={disabled}
      onPointerDown={event => {
        sourceRef.current = cityInputSourceFromPointerType(event.pointerType)
      }}
      onTouchStart={() => {
        sourceRef.current = 'touch'
      }}
      onKeyDown={() => {
        sourceRef.current = 'keyboard'
      }}
      onClick={event => {
        const inferred = cityInputSourceFromActivation({
          detail: event.detail,
          pointerType: (event.nativeEvent as MouseEvent & {
            pointerType?: string
          }).pointerType,
        })
        const source = sourceRef.current === 'pointer' ? inferred : sourceRef.current
        sourceRef.current = 'pointer'
        onSelect(zone, source)
      }}
      data-kg-city-sim-zone={zone}
    >
      {ZONE_LABELS[zone]}
    </button>
  )
}

function AdvisorProposal({
  busy,
  onApply,
  proposal,
}: {
  busy: boolean
  onApply: (proposal: CityAdvisorProposal) => void
  proposal: CityAdvisorProposal
}) {
  return (
    <article
      className={cn(
        'grid gap-1 rounded border p-2 text-[10px]',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      )}
      data-kg-city-sim-proposal={proposal.id}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <b className="block truncate">{proposal.parcelId}</b>
          <span className={UI_THEME_TOKENS.text.tertiary}>
            {ZONE_LABELS[proposal.recommendedZone]} · round {proposal.round}
          </span>
        </span>
        <b aria-label={`Score ${proposal.score.toFixed(1)} out of 100`}>
          {proposal.score.toFixed(1)}
        </b>
      </header>
      <p className={cn('break-words', UI_THEME_TOKENS.text.secondary)}>
        {proposal.rationale}
      </p>
      {proposal.clarifyRequired ? (
        <p
          className={cn('flex items-center gap-1', UI_THEME_TOKENS.status.warning)}
          data-kg-city-sim-clarify-required="1"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Clarification required: an operator must confirm this tied proposal.
        </p>
      ) : null}
      <button
        type="button"
        className="App-toolbar__btn justify-self-start"
        disabled={busy}
        onClick={() => onApply(proposal)}
        data-kg-city-sim-apply-proposal={proposal.id}
      >
        {proposal.clarifyRequired ? 'Confirm and apply' : 'Apply proposal'}
      </button>
    </article>
  )
}

export function CitySimFloatingPanelView() {
  const snapshot = React.useSyncExternalStore(
    subscribeCitySimSnapshot,
    readCitySimSnapshot,
    readCitySimSnapshot,
  )
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null)
  const [localError, setLocalError] = React.useState<string | null>(null)
  const city = snapshot.city
  const selectedParcel = React.useMemo(
    () => city.parcels.find(parcel => parcel.id === snapshot.selectedParcelId) ?? null,
    [city.parcels, snapshot.selectedParcelId],
  )
  const proposals = snapshot.advisor?.proposals ?? []
  const busy = pendingAction !== null
    || snapshot.saveStatus === 'saving'
    || snapshot.saveStatus === 'loading'

  const runAction = React.useCallback(async (
    action: PendingAction,
    execute: () => unknown | Promise<unknown>,
  ) => {
    setPendingAction(action)
    setLocalError(null)
    try {
      await execute()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingAction(null)
    }
  }, [])

  const selectZone = React.useCallback((
    zone: CityZoningType,
    source: CityInputSource,
  ) => {
    const parcelId = snapshot.selectedParcelId
    if (!parcelId) return
    void runAction('zone', () => enqueueCityInput({
      source,
      selectParcelId: parcelId,
      requestedZone: zone,
    }))
  }, [runAction, snapshot.selectedParcelId])

  const selectParcelCoordinate = React.useCallback((
    row: number,
    column: number,
    source: CityInputSource,
  ) => {
    void runAction('select', () => enqueueCityInput({
      source,
      selectParcelId: cityParcelId(row, column),
      requestedZone: null,
    }))
  }, [runAction])

  const applyProposal = React.useCallback((proposal: CityAdvisorProposal) => {
    void runAction('apply', () => applyCityAdvice(proposal))
  }, [runAction])

  const runtimeError = localError || snapshot.error
  const politeStatusMessage = (
    runtimeError
    || snapshot.lastResult?.operation === 'tick'
    || snapshot.saveStatus === 'loading'
    || snapshot.saveStatus === 'saving'
  )
    ? ''
    : snapshot.message
  const activeParcelCount = city.parcels.filter(parcel => parcel.zone !== 'unzoned').length
  const clarificationCount = proposals.filter(proposal => proposal.clarifyRequired).length
  const defaultPathIsZeroCost = snapshot.modelCallCount === 0
    && snapshot.estimatedCostUsd === 0

  return (
    <section
      className={floatingPanelCatalogSurfaceClassName()}
      aria-label="City-Building Sim"
      aria-busy={busy}
      data-kg-city-sim-floating-panel="1"
      data-kg-city-sim-active={snapshot.active ? '1' : '0'}
      data-kg-city-sim-phase={snapshot.phase}
      data-kg-city-sim-save-status={snapshot.saveStatus}
    >
      <FloatingPanelCatalogHeader
        title="City-Building Sim"
        subtitle="Deterministic local civic grid"
        actionsLabel="City simulation actions"
        actions={snapshot.active ? (
          <>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || snapshot.phase === 'running' || !snapshot.webglSupported}
              onClick={() => void runAction('start', startCitySim)}
              data-kg-city-sim-start="1"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" /> Start
            </button>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || snapshot.phase !== 'running'}
              onClick={() => void runAction('stop', stopCitySim)}
              data-kg-city-sim-stop="1"
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" /> Stop
            </button>
          </>
        ) : (
          <button
            type="button"
            className="App-toolbar__btn"
            disabled={busy || !snapshot.webglSupported}
            onClick={() => void runAction('open', openCitySimSurface)}
            data-kg-city-sim-open="1"
          >
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> Open
          </button>
        )}
      />

      <section className={floatingPanelCatalogBodyClassName('grid content-start gap-2 px-1 pb-2')}>
        <section
          className={cn(
            'grid grid-cols-3 gap-2 rounded border p-2 text-[10px]',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="City simulation metrics"
        >
          <span><b>Tick</b><br />{formatMetric(city.tick)}</span>
          <span><b>Treasury</b><br />{formatTreasuryCents(city.treasuryCents)}</span>
          <span><b>Population</b><br />{formatMetric(city.population)}</span>
          <span><b>Active parcels</b><br />{activeParcelCount}/{city.parcels.length}</span>
          <span><b>Tax rate</b><br />{(city.taxRateBasisPoints / 100).toFixed(2)}%</span>
          <span><b>Clarify</b><br />{clarificationCount} pending</span>
        </section>

        <section
          className={cn(
            'grid gap-1 rounded border p-2',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="City simulation runtime status"
        >
          <p className="flex items-center gap-1 text-[11px] font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Browser-local · explicit persistence · no deployment
          </p>
          <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
            {snapshot.message}
          </p>
          <span
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-kg-city-sim-operation-status="1"
          >
            {politeStatusMessage}
          </span>
          <p
            className={cn(
              'text-[9px]',
              defaultPathIsZeroCost
                ? UI_THEME_TOKENS.status.success
                : UI_THEME_TOKENS.status.warning,
            )}
            data-kg-city-sim-cost={defaultPathIsZeroCost ? 'zero' : 'nonzero'}
          >
            {defaultPathIsZeroCost
              ? 'Local heuristic · 0 model calls · $0.00 estimated cost'
              : `${snapshot.modelCallCount} model calls · $${snapshot.estimatedCostUsd.toFixed(4)} estimated cost`}
          </p>
          {snapshot.costLog ? (
            <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
              Last cost log · {snapshot.costLog.model} · {snapshot.costLog.prompt_tokens} prompt · {snapshot.costLog.completion_tokens} completion
            </p>
          ) : null}
          {runtimeError ? (
            <p
              className={cn('break-words text-[10px]', UI_THEME_TOKENS.status.error)}
              role="alert"
              data-kg-city-sim-error="1"
            >
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {runtimeError}
            </p>
          ) : null}
        </section>

        <section
          className={cn(
            'grid gap-2 rounded border p-2',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="Selected city parcel"
        >
          <header className="flex items-center justify-between gap-2 text-[11px]">
            <b className="flex items-center gap-1">
              <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
              Selected parcel
            </b>
            <span>{selectedParcel?.id ?? 'None'}</span>
          </header>
          {selectedParcel ? (
            <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
              {ZONE_LABELS[selectedParcel.zone]} · land value {formatTreasuryCents(selectedParcel.landValueCents)}
              {' · '}population {formatMetric(selectedParcel.population)}
              {' · '}pollution {formatMetric(selectedParcel.pollution)}
            </p>
          ) : (
            <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
              Select a parcel in the shared Canvas before assigning a zone.
            </p>
          )}
          {snapshot.lastInput ? (
            <p
              className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}
              data-kg-city-sim-last-input="1"
            >
              {describeCityInputSnapshot(snapshot.lastInput)}
            </p>
          ) : null}
          <CityParcelCoordinateControls
            busy={busy}
            columns={city.columns}
            onSelect={selectParcelCoordinate}
            rows={city.rows}
            selectedColumn={selectedParcel?.column ?? null}
            selectedRow={selectedParcel?.row ?? null}
          />
          <div className="grid grid-cols-3 gap-1" aria-label="Zone selected parcel">
            {(['residential', 'commercial', 'industrial'] as const).map(zone => (
              <CityZoneButton
                key={zone}
                disabled={busy || !selectedParcel}
                onSelect={selectZone}
                selected={selectedParcel?.zone === zone}
                zone={zone}
              />
            ))}
          </div>
        </section>

        <section
          className={cn(
            'grid gap-2 rounded border p-2',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="City zoning advisor"
        >
          <header className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1 text-[11px] font-semibold">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              Zoning advisor
            </h3>
            <span className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
              2 rounds maximum
            </span>
          </header>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !selectedParcel}
              onClick={() => void runAction('advise', () => requestCityAdvice('parcel'))}
              data-kg-city-sim-advise="parcel"
            >
              Advise parcel
            </button>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy}
              onClick={() => void runAction('advise', () => requestCityAdvice('district'))}
              data-kg-city-sim-advise="district"
            >
              Advise district
            </button>
          </div>
          {proposals.length > 0 ? (
            <section className="grid gap-1" aria-label="Advisor proposals">
              {proposals.map(proposal => (
                <AdvisorProposal
                  key={proposal.id}
                  busy={busy}
                  onApply={applyProposal}
                  proposal={proposal}
                />
              ))}
            </section>
          ) : (
            <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
              No proposal is pending. Advice uses the deterministic local heuristic.
            </p>
          )}
        </section>

        <section
          className={cn(
            'grid gap-2 rounded border p-2',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="City lifecycle and persistence"
        >
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !snapshot.active}
              onClick={() => void runAction('restart', restartCitySim)}
              data-kg-city-sim-restart="1"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restart
            </button>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy}
              onClick={() => void runAction('reset', resetCitySim)}
              data-kg-city-sim-reset="1"
            >
              Reset seed
            </button>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !snapshot.active}
              onClick={() => void runAction('exit', exitCitySimSurfaceAndWait)}
              data-kg-city-sim-exit="1"
            >
              Exit
            </button>
          </div>
          <div className="grid gap-1">
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy}
              onClick={() => void runAction('save', saveCitySim)}
              data-kg-city-sim-save="1"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save locally
            </button>
          </div>
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            WorkspaceFs status · {snapshot.saveStatus}. Open reads the one local document;
            Save is explicit, and simulation ticks never auto-save.
          </p>
        </section>

        <section
          className={cn(
            'grid grid-cols-2 gap-2 rounded border p-2 text-[10px]',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="City simulation ownership"
        >
          <span className="flex items-center gap-1">
            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
            Treasury is tick-owned
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Population is derived
          </span>
        </section>
      </section>
    </section>
  )
}

export default CitySimFloatingPanelView
