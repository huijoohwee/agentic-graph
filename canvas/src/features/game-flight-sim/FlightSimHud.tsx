import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { subscribeGlobalCancelEvents } from '@/lib/browser/globalCancelEvents'
import { resolveFloatingPanelRightClearanceCss } from '@/lib/ui/floatingPanelGeometry'
import {
  flightSimInputFromHeldTouches,
  releaseFlightSimHeldTouch,
  requestFlightSimPointerCapture,
  setFlightSimTouchInput,
  type FlightSimTouchControl,
} from './flightSimInput'
import {
  openFlightSimSurface,
  isFlightSimHydrationPending,
  persistFlightSimPendingDecisions,
  readFlightSimSnapshot,
  resetFlightSimLocalPersistence,
  restartFlightSim,
  setFlightSimThrottle,
  startFlightSim,
  stopFlightSim,
  subscribeFlightSimSnapshot,
} from './flightSimRuntime'
import {
  FLIGHT_SIM_SAVE_PATH,
  readFlightSimDecisionStore,
  subscribeFlightSimDecisionStore,
} from './flightSimDecisionStore'
import { projectFlightSimHud } from './flightSimHudProjection'
import { FlightSimNavigationInset } from './FlightSimNavigationInset'
import {
  cycleFlightSimCameraView,
  FLIGHT_SIM_CAMERA_VIEW_OPTIONS,
  readFlightSimCameraSnapshot,
  subscribeFlightSimCamera,
} from './flightSimCameraRuntime'
import {
  completeFlightSimHudUpdate,
  registerFlightSimHudDeadlineOwner,
} from './flightSimDeadlineRuntime'
import {
  readFlightSimTrainingSnapshot,
  subscribeFlightSimTrainingSnapshot,
} from './flightSimTrainingRuntime'

const buttonClass = 'min-h-11 rounded-xl border border-white/25 bg-slate-950/75 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm disabled:opacity-50'

function envelopeClassName(severity: 'nominal' | 'caution' | 'warning'): string {
  if (severity === 'warning') return 'border-rose-300/60 bg-rose-950/85 text-rose-50'
  if (severity === 'caution') return 'border-amber-300/60 bg-amber-950/85 text-amber-50'
  return 'border-cyan-300/50 bg-slate-950/80 text-cyan-50'
}

export function FlightSimHud() {
  const floatingPanelOpen = useGraphStore(state => state.floatingPanelOpen === true)
  const floatingPanelWidthRatio = useGraphStore(state => state.floatingPanelWidthRatio)
  const flight = React.useSyncExternalStore(
    subscribeFlightSimSnapshot,
    readFlightSimSnapshot,
    readFlightSimSnapshot,
  )
  const save = React.useSyncExternalStore(
    subscribeFlightSimDecisionStore,
    readFlightSimDecisionStore,
    readFlightSimDecisionStore,
  )
  const training = React.useSyncExternalStore(
    subscribeFlightSimTrainingSnapshot,
    readFlightSimTrainingSnapshot,
    readFlightSimTrainingSnapshot,
  )
  const camera = React.useSyncExternalStore(
    subscribeFlightSimCamera,
    readFlightSimCameraSnapshot,
    readFlightSimCameraSnapshot,
  )
  const heldTouches = React.useRef(new Map<number, FlightSimTouchControl>())
  const mountedRevision = React.useRef(flight.revision)
  const publishTouches = React.useCallback(() => {
    setFlightSimTouchInput(flightSimInputFromHeldTouches(heldTouches.current))
  }, [])
  const beginTouch = React.useCallback((control: FlightSimTouchControl) => (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Partial touch implementations may not expose an active capture target.
    }
    heldTouches.current.set(event.pointerId, control)
    publishTouches()
  }, [publishTouches])
  const endTouch = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    releaseFlightSimHeldTouch(heldTouches.current, event.nativeEvent)
    publishTouches()
  }, [publishTouches])
  const touchHandlers = React.useCallback((control: FlightSimTouchControl) => ({
    onPointerDown: beginTouch(control),
    onPointerUp: endTouch,
    onPointerCancel: endTouch,
    onLostPointerCapture: endTouch,
  }), [beginTouch, endTouch])
  const cancelHeldTouches = React.useCallback((event?: Event) => {
    releaseFlightSimHeldTouch(
      heldTouches.current,
      event && 'pointerId' in event ? event as PointerEvent : undefined,
    )
    publishTouches()
  }, [publishTouches])
  React.useEffect(() => subscribeGlobalCancelEvents({
    listener: cancelHeldTouches,
    capture: true,
    includeLostPointerCapture: true,
    visibilityBehavior: 'hidden-only',
  }), [cancelHeldTouches])
  React.useEffect(() => () => {
    heldTouches.current.clear()
    setFlightSimTouchInput({})
  }, [])

  const terminal = flight.phase === 'completed' || flight.phase === 'crashed'
  const flightControlsEnabled = flight.active
    && (flight.phase === 'ready' || flight.phase === 'flying')
  const hydrationPending = isFlightSimHydrationPending()
  const projection = projectFlightSimHud({
    flight,
    save,
    savePath: FLIGHT_SIM_SAVE_PATH,
    hydrationPending,
  })
  const floatingPanelRightClearance = floatingPanelOpen
    ? resolveFloatingPanelRightClearanceCss(floatingPanelWidthRatio)
    : undefined
  const floatingPanelClearanceVariables = floatingPanelRightClearance
    ? { '--kg-flight-sim-panel-clearance': floatingPanelRightClearance } as React.CSSProperties
    : undefined
  const hudPanelClassName = training.night
    ? 'border-violet-300/35 bg-indigo-950/80'
    : 'border-white/20 bg-slate-950/75'
  React.useLayoutEffect(
    () => registerFlightSimHudDeadlineOwner(mountedRevision.current),
    [],
  )
  React.useLayoutEffect(() => {
    completeFlightSimHudUpdate(flight.revision)
  }, [flight.revision])

  return (
    <section
      className="pointer-events-none absolute inset-0 z-[230] select-none overflow-hidden text-white"
      aria-label="Flight Sim HUD"
      data-kg-flight-sim-hud="1"
      data-kg-flight-sim-phase={flight.phase}
      data-kg-flight-sim-tick={String(flight.tick)}
      data-kg-flight-sim-revision={String(flight.revision)}
      data-kg-flight-sim-airspeed={projection.airspeed.toFixed(4)}
      data-kg-flight-sim-altitude={projection.altitude.toFixed(4)}
      data-kg-flight-sim-heading={projection.headingDegrees.toFixed(4)}
      data-kg-flight-sim-pitch={flight.aircraft.pitch.toFixed(4)}
      data-kg-flight-sim-roll={flight.aircraft.roll.toFixed(4)}
      data-kg-flight-sim-throttle={flight.aircraft.throttle.toFixed(4)}
      data-kg-flight-sim-waypoint-index={String(flight.waypointIndex)}
      data-kg-flight-sim-runtime-error={flight.runtimeError || undefined}
      data-kg-flight-sim-hydration={hydrationPending ? 'loading' : save.hydrationBlocked ? 'blocked' : 'ready'}
      data-kg-flight-sim-pending-decisions={String(flight.pendingDecisions.length)}
      data-kg-flight-sim-save-status={save.status}
      data-kg-flight-sim-effective-save-status={projection.save.effectiveStatus}
      data-kg-flight-sim-save-error={save.error || undefined}
      data-kg-flight-sim-envelope={training.envelope.status}
      data-kg-flight-sim-envelope-severity={training.envelope.severity}
      data-kg-flight-sim-control-authority={training.envelope.controlAuthority.toFixed(4)}
      data-kg-flight-sim-airspeed-reliable={training.airspeedReliable ? '1' : '0'}
      data-kg-flight-sim-target-speed={training.envelope.targetSpeedMetersPerSecond.join(':')}
      data-kg-flight-sim-night={training.night ? '1' : '0'}
      data-kg-flight-sim-camera-view={camera.view}
      data-kg-flight-sim-panel-clearance={floatingPanelOpen ? 'reserved' : 'none'}
      style={floatingPanelClearanceVariables}
    >
      <header
        className={`absolute left-3 right-3 top-3 grid grid-cols-1 gap-2 pt-[env(safe-area-inset-top)] ${floatingPanelOpen ? 'sm:right-[var(--kg-flight-sim-panel-clearance)]' : 'sm:flex sm:items-start sm:justify-between sm:gap-3'}`}
      >
        <section className={`max-w-none rounded-xl border px-3 py-2 shadow-lg backdrop-blur-sm sm:max-w-[58vw] ${hudPanelClassName}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Local deterministic flight mission</p>
          <p className="mt-1 text-sm font-semibold">{projection.objective}</p>
          <p className="mt-1 text-[11px] text-slate-300">{projection.save.label}</p>
          {flight.runtimeError ? <p className="mt-1 text-[11px] text-rose-200" role="alert">{flight.runtimeError}</p> : null}
          {save.error ? <p className="mt-1 text-[11px] text-rose-200" role="alert">{save.error}</p> : null}
        </section>
        <section className={`grid min-w-0 grid-cols-3 gap-2 rounded-xl border px-2 py-2 text-center shadow-lg backdrop-blur-sm sm:grid-cols-6 ${hudPanelClassName} ${floatingPanelOpen ? '' : 'sm:min-w-[22rem]'}`}>
          <span className="text-[10px] text-slate-300">KTS<strong className="block text-sm text-white">{training.airspeedReliable ? (projection.airspeed * 1.94384).toFixed(0) : '---'}</strong></span>
          <span className="text-[10px] text-slate-300">ALT<strong className="block text-sm text-white">{flight.aircraft.position[1].toFixed(1)}</strong></span>
          <span className="text-[10px] text-slate-300">HDG<strong className="block text-sm text-white">{projection.headingDegrees.toFixed(0)}°</strong></span>
          <span className="text-[10px] text-slate-300">PIT<strong className="block text-sm text-white">{(flight.aircraft.pitch * 180 / Math.PI).toFixed(1)}°</strong></span>
          <span className="text-[10px] text-slate-300">ROL<strong className="block text-sm text-white">{(flight.aircraft.roll * 180 / Math.PI).toFixed(1)}°</strong></span>
          <span className="text-[10px] text-slate-300">THR<strong className="block text-sm text-white">{Math.round(flight.aircraft.throttle * 100)}%</strong></span>
        </section>
      </header>

      {flight.active && (flight.phase === 'ready' || flight.phase === 'flying') ? (
        <section
          className={`absolute left-1/2 top-32 w-[min(24rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl border px-3 py-2 text-center shadow-lg backdrop-blur-sm sm:top-20 ${envelopeClassName(training.envelope.severity)}`}
          aria-label="Flight envelope director"
          role={training.envelope.severity === 'warning' ? 'alert' : 'status'}
        >
          <p className="text-xs font-bold uppercase tracking-[0.14em]">{training.envelope.label}</p>
          <p className="mt-0.5 text-[10px] opacity-90">{training.envelope.recoveryCue}</p>
          <p className="mt-1 text-[9px] font-semibold opacity-80">
            Target {training.envelope.targetSpeedMetersPerSecond[0]}–{training.envelope.targetSpeedMetersPerSecond[1]} m/s
            {' · '}Control {Math.round(training.envelope.controlAuthority * 100)}%
          </p>
        </section>
      ) : null}

      {flight.active ? (
        <aside
          className={`pointer-events-auto absolute bottom-32 right-3 grid w-32 gap-1 sm:bottom-auto sm:top-36 sm:w-40 ${floatingPanelOpen ? 'sm:right-[var(--kg-flight-sim-panel-clearance)]' : ''}`}
          aria-label="Flight navigation HUD"
        >
          <FlightSimNavigationInset className="hidden sm:grid" flight={flight} />
          <button
            className={buttonClass}
            type="button"
            onClick={cycleFlightSimCameraView}
            data-kg-flight-sim-cycle-camera="1"
          >
            Camera · {FLIGHT_SIM_CAMERA_VIEW_OPTIONS.find(option => option.id === camera.view)?.label}
          </button>
        </aside>
      ) : null}

      <section className="pointer-events-auto absolute bottom-32 left-3 grid grid-cols-3 gap-1 pb-[env(safe-area-inset-bottom)] sm:bottom-3" aria-label="Touch flight controls">
        <span />
        <button className={buttonClass} type="button" disabled={!flightControlsEnabled} {...touchHandlers('pitch-up')}>Pitch ▲</button>
        <span />
        <button className={buttonClass} type="button" disabled={!flightControlsEnabled} {...touchHandlers('roll-left')}>Roll ◀</button>
        <button className={buttonClass} type="button" disabled={!flightControlsEnabled} {...touchHandlers('pitch-down')}>Pitch ▼</button>
        <button className={buttonClass} type="button" disabled={!flightControlsEnabled} {...touchHandlers('roll-right')}>Roll ▶</button>
      </section>

      <section
        className={`pointer-events-auto absolute bottom-3 left-3 right-3 flex max-w-none flex-wrap items-center justify-end gap-1 pb-[env(safe-area-inset-bottom)] sm:left-auto sm:max-w-[56vw] ${floatingPanelOpen ? 'sm:right-[var(--kg-flight-sim-panel-clearance)]' : ''}`}
      >
        <button
          aria-label="Capture flight pointer"
          className={buttonClass}
          type="button"
          disabled={!flightControlsEnabled}
          onClick={requestFlightSimPointerCapture}
        >
          Fly pointer
        </button>
        <button className={buttonClass} type="button" disabled={!flightControlsEnabled} {...touchHandlers('yaw-left')}>Yaw ◀</button>
        <button className={buttonClass} type="button" disabled={!flightControlsEnabled} {...touchHandlers('yaw-right')}>Yaw ▶</button>
        <label className="rounded-xl border border-white/25 bg-slate-950/75 px-2 py-1 text-[10px] font-semibold">
          THROTTLE
          <input
            className="block w-28"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={flight.aircraft.throttle}
            disabled={!flightControlsEnabled}
            onChange={event => setFlightSimThrottle(Number(event.currentTarget.value))}
          />
        </label>
        {!flight.active ? <button className={buttonClass} type="button" onClick={() => void openFlightSimSurface()}>Open</button> : null}
        {flight.active && flight.phase === 'stopped' ? <button className={buttonClass} type="button" disabled={hydrationPending || save.hydrationBlocked} onClick={() => startFlightSim()}>Start</button> : null}
        {flight.phase === 'ready' || flight.phase === 'flying' ? <button className={buttonClass} type="button" onClick={stopFlightSim}>Stop</button> : null}
        <button className={buttonClass} type="button" disabled={!flight.active || hydrationPending || save.hydrationBlocked} onClick={restartFlightSim}>Restart</button>
        {terminal ? <button className={buttonClass} type="button" disabled={save.status === 'saving'} onClick={() => void persistFlightSimPendingDecisions()}>{save.status === 'error' && save.retainedCount > 0 ? 'Retry save' : 'Save Decisions'}</button> : null}
        {save.hydrationBlocked ? <button className={buttonClass} type="button" onClick={() => void resetFlightSimLocalPersistence()}>Reset local save</button> : null}
      </section>
    </section>
  )
}
