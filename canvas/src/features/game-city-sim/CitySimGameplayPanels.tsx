import { AlertTriangle, ShieldCheck, Users } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { type CityZone } from './citySimModel'
import { readCityCoopSnapshot } from './cityCoopState'
import { readCitySimSnapshot } from './citySimRuntime'

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
  return Number.isSafeInteger(value) ? CURRENCY_FORMATTER.format(value / 100) : 'Unavailable'
}

export function CitySimGeoXrGameplayPanels({
  activeParcelCount,
  busy,
  clarificationCount,
  coop,
  defaultPathIsZeroCost,
  guestReadOnly,
  nextGoal,
  onDecision,
  onTravel,
  pendingAction,
  playerLocation,
  politeStatusMessage,
  runtimeError,
  selectedDestination,
  snapshot,
}: {
  activeParcelCount: number
  busy: boolean
  clarificationCount: number
  coop: ReturnType<typeof readCityCoopSnapshot>
  defaultPathIsZeroCost: boolean
  guestReadOnly: boolean
  nextGoal: string
  onDecision: (proposalId: string, accepted: boolean) => void
  onTravel: (poiId: string) => void
  pendingAction: string | null
  playerLocation: string
  politeStatusMessage: string
  runtimeError?: string | null
  selectedDestination: Readonly<{ id: string; label: string }> | undefined
  snapshot: ReturnType<typeof readCitySimSnapshot>
}) {
  const city = snapshot.city
  return <>
        <section
          className={cn(
            'grid grid-cols-3 gap-2 rounded border p-2 text-xs',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="City simulation metrics"
        >
          <span><b>Tick</b><br />{formatMetric(city.tick)}</span>
          <span><b>Treasury</b><br />{formatTreasuryCents(city.treasuryCents)}</span>
          <span><b>Population</b><br />{formatMetric(city.population)}</span>
          <span><b>Zoned POIs</b><br />{activeParcelCount}/{city.parcels.length}</span>
          <span><b>Tax rate</b><br />{(city.taxRateBasisPoints / 100).toFixed(2)}%</span>
          <span><b>Clarify</b><br />{clarificationCount} pending</span>
        </section>

        <section
          className={cn('grid gap-2 rounded border p-2 text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
          aria-label="City activity on Geo+XR"
          data-kg-city-gameplay-overlay="1"
          data-kg-city-gameplay-player={snapshot.gameplay?.playerPoiId ?? ''}
          data-kg-city-gameplay-player-selected={snapshot.gameplay?.playerSelected ? '1' : '0'}
          data-kg-city-gameplay-goal={snapshot.gameplay?.taskPoiId ?? ''}
        >
          <header className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Neighborhood activity</h3>
            <span data-kg-city-gameplay-score="1">
              {snapshot.gameplay?.completedTasks ?? 0} goals reached
            </span>
          </header>
          <p className={UI_THEME_TOKENS.text.secondary}>
            Player near <b>{playerLocation}</b> · Goal at <b>{nextGoal}</b>. Select the player on the map to move them.
          </p>
          <div className="grid gap-1" role="group" aria-label="Neighborhood travel">
            <button
              type="button"
              className={cn(
                'App-toolbar__btn inline-flex min-h-10 w-full justify-start rounded border px-3 py-2 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                UI_THEME_TOKENS.button.activeBorder,
                UI_THEME_TOKENS.button.activeBg,
                UI_THEME_TOKENS.button.activeText,
                UI_THEME_TOKENS.button.hoverBg,
                UI_THEME_TOKENS.focus.primaryRing,
              )}
              disabled={busy || guestReadOnly || !snapshot.gameplay}
              onClick={() => {
                const destination = snapshot.gameplay?.taskPoiId
                if (!destination) return
                onTravel(destination)
              }}
              data-kg-city-gameplay-goal-action="1"
              aria-label={`Travel to the next goal at ${nextGoal}`}
            >
              {pendingAction === 'travel' ? 'Traveling…' : `Go to ${nextGoal}`}
            </button>
            {selectedDestination
              && selectedDestination.id !== snapshot.gameplay?.playerPoiId
              && selectedDestination.id !== snapshot.gameplay?.taskPoiId ? (
                <button
                  type="button"
                  className={cn(
                    'App-toolbar__btn inline-flex min-h-10 w-full justify-start rounded border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    UI_THEME_TOKENS.panel.border,
                    UI_THEME_TOKENS.panel.bg,
                    UI_THEME_TOKENS.text.primary,
                    UI_THEME_TOKENS.button.hoverBg,
                    UI_THEME_TOKENS.focus.primaryRing,
                  )}
                  disabled={busy || guestReadOnly || !snapshot.gameplay}
                  onClick={() => {
                    const destination = selectedDestination.id
                    onTravel(destination)
                  }}
                  data-kg-city-gameplay-travel="1"
                >
                  Visit {selectedDestination.label}
                </button>
              ) : null}
          </div>
          <p className={UI_THEME_TOKENS.text.tertiary}>
            Take the marked trip, or choose another POI for a detour.
          </p>
          <details
            className={cn(
              'rounded border p-2 text-xs',
              UI_THEME_TOKENS.panel.border,
              UI_THEME_TOKENS.panel.bg,
            )}
            data-kg-city-gameplay-controls="1"
          >
            <summary className="cursor-pointer font-medium">How to travel</summary>
            <ul className={cn('mt-2 grid list-disc gap-1 pl-4', UI_THEME_TOKENS.text.secondary)}>
              <li>Choose a destination by selecting a POI on the map or from Regional POI.</li>
              <li>Choose Go to {nextGoal} to reach the marked goal and reveal the next one.</li>
              <li>Select a different POI to reveal a Visit action for an optional detour.</li>
              {snapshot.gameplay?.playerSelected ? (
                <li>The player is selected: focus the map and use WASD or arrow keys to walk along mapped streets and paths. Movement stops where no walkable line is mapped; click elsewhere to deselect and pan the map.</li>
              ) : (
                <li>Select the player marker, then use WASD or arrow keys to walk along mapped streets and paths; when unselected, those keys pan the map.</li>
              )}
              <li>Drag to pan and scroll to zoom.</li>
              <li>Use Tab, then Enter or Space, to operate panel actions.</li>
            </ul>
          </details>
          {guestReadOnly ? (
            <p className={UI_THEME_TOKENS.text.tertiary}>
              Player movement is host-owned in a cooperative session.
            </p>
          ) : null}
        </section>

        <section
          className={cn('grid gap-2 rounded border p-2 text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
          aria-label="Cooperative City planning"
          data-kg-city-coop-role={coop.role}
        >
          <header className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1 font-semibold"><Users className="h-3.5 w-3.5" aria-hidden="true" /> Cooperative planning</h3>
            <span>{coop.role === 'guest' ? 'Guest' : coop.role === 'host' ? 'Host' : 'Solo'}</span>
          </header>
          <p role="status" aria-live="polite" data-kg-city-coop-status="1" className={UI_THEME_TOKENS.text.secondary}>
            {coop.message}
          </p>
          {coop.role === 'host' && coop.pendingProposal ? (
            <section className="grid gap-1 rounded border p-2" aria-label="Pending co-planner proposal" data-kg-city-coop-pending-proposal={coop.pendingProposal.proposalId}>
              <p><b>{coop.pendingProposal.parcelId}</b> · suggested {ZONE_LABELS[coop.pendingProposal.zone]}</p>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="App-toolbar__btn" disabled={busy || !coop.connected} onClick={() => onDecision(coop.pendingProposal!.proposalId, true)} data-kg-city-coop-decision="accept">Accept proposal</button>
                <button type="button" className="App-toolbar__btn" disabled={busy || !coop.connected} onClick={() => onDecision(coop.pendingProposal!.proposalId, false)} data-kg-city-coop-decision="decline">Decline</button>
              </div>
            </section>
          ) : null}
          {coop.role === 'guest' && coop.pendingProposal ? (
            <p data-kg-city-coop-pending="1">Suggested {ZONE_LABELS[coop.pendingProposal.zone]} zoning for {coop.pendingProposal.parcelId}; waiting for the host.</p>
          ) : null}
          <p className={UI_THEME_TOKENS.text.tertiary}>
            {coop.connectedPeerCount} connected co-planner{coop.connectedPeerCount === 1 ? '' : 's'} · host owns ticks, accepted zoning, and local saves.
          </p>
        </section>

        <section
          className={cn(
            'grid gap-1 rounded border p-2',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="City simulation runtime status"
        >
          <p className="flex items-center gap-1 text-xs font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Browser-local · explicit persistence · no deployment
          </p>
          <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>
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
              'text-xs',
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
            <p className={cn('text-xs', UI_THEME_TOKENS.text.tertiary)}>
              Last cost log · {snapshot.costLog.model} · {snapshot.costLog.prompt_tokens} prompt · {snapshot.costLog.completion_tokens} completion
            </p>
          ) : null}
          {runtimeError ? (
            <p
              className={cn('break-words text-xs', UI_THEME_TOKENS.status.error)}
              role="alert"
              data-kg-city-sim-error="1"
            >
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {runtimeError}
            </p>
          ) : null}
        </section>

  </>
}
