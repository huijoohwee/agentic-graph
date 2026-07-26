import React from 'react'
import {
  Gauge,
  Plane,
  RotateCcw,
  Save,
  ShieldAlert,
  Square,
  View,
} from 'lucide-react'
import {
  renderAgenticOsInvocationKeywordChip,
} from '@/features/agentic-os/agenticOsInvocationChips'
import { openMotionControlSurface } from '@/features/three/motionControlSurfaceRuntime'
import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  resolveXrMotionReferenceStage,
} from '@/features/three/xrSceneLibrary'
import {
  readMotionControlSnapshot,
  subscribeMotionControl,
} from '@/features/three/motionControlRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  FloatingPanelCatalogHeader,
  floatingPanelCatalogBodyClassName,
  floatingPanelCatalogSurfaceClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { cn } from '@/lib/utils'
import {
  FLIGHT_SIM_SAVE_PATH,
  readFlightSimDecisionStore,
  subscribeFlightSimDecisionStore,
} from './flightSimDecisionStore'
import {
  buildFlightSimInvocation,
  controlLocalFlightSim,
  type FlightSimOperation,
} from './flightSimMcpRuntime'
import { flightSimHeadingDegrees } from './flightModel'
import { FlightSimNavigationInset } from './FlightSimNavigationInset'
import {
  FLIGHT_SIM_CAMERA_VIEW_OPTIONS,
  readFlightSimCameraSnapshot,
  selectFlightSimCameraView,
  subscribeFlightSimCamera,
} from './flightSimCameraRuntime'
import {
  resetFlightSimLocalPersistence,
  isFlightSimHydrationPending,
  readFlightSimSpatialProfile,
  readFlightSimSnapshot,
  subscribeFlightSimSnapshot,
} from './flightSimRuntime'
import { FlightSimTrainingSurfaceProjection } from './FlightSimTrainingSurfaceProjection'
import {
  readFlightSimTrainingSnapshot,
  subscribeFlightSimTrainingSnapshot,
} from './flightSimTrainingRuntime'

type PendingOperation = FlightSimOperation | 'reset-save'

function Invocation({
  operation,
  throttle,
}: {
  operation: FlightSimOperation
  throttle?: number
}) {
  return (
    <code className={cn(
      UI_INLINE_CHIP_GROUP_CLASSNAME,
      'min-w-0 overflow-hidden font-mono text-[9px]',
      UI_THEME_TOKENS.text.secondary,
    )}>
      {renderMarkdownSigilInlineText(buildFlightSimInvocation(operation, throttle), {
        renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({
          value,
          className,
          sourceLink: false,
        }),
      })}
    </code>
  )
}

function degrees(radians: number): string {
  return `${Math.round((radians * 180) / Math.PI)}°`
}

function heading(radians: number): string {
  return `${Math.round(flightSimHeadingDegrees(radians))}°`
}

function airspeed(velocity: readonly number[]): string {
  return Math.hypot(...velocity).toFixed(1)
}

export function FlightSimFloatingPanelView() {
  const flight = React.useSyncExternalStore(
    subscribeFlightSimSnapshot,
    readFlightSimSnapshot,
    readFlightSimSnapshot,
  )
  const training = React.useSyncExternalStore(
    subscribeFlightSimTrainingSnapshot,
    readFlightSimTrainingSnapshot,
    readFlightSimTrainingSnapshot,
  )
  const decisions = React.useSyncExternalStore(
    subscribeFlightSimDecisionStore,
    readFlightSimDecisionStore,
    readFlightSimDecisionStore,
  )
  const motionControl = React.useSyncExternalStore(
    subscribeMotionControl,
    readMotionControlSnapshot,
    readMotionControlSnapshot,
  )
  const camera = React.useSyncExternalStore(
    subscribeFlightSimCamera,
    readFlightSimCameraSnapshot,
    readFlightSimCameraSnapshot,
  )
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const spatialProfile = readFlightSimSpatialProfile()
  const environment = XR_MOTION_REFERENCE_STAGE_PRESETS.find(stage => spatialProfile.sourceKey.includes(`:${stage.id}:`))
    || resolveXrMotionReferenceStage(XR_MOTION_REFERENCE_DEFAULT_STAGE_ID)
  const [pendingOperation, setPendingOperation] = React.useState<PendingOperation | null>(null)
  const [throttle, setThrottle] = React.useState(flight.aircraft.throttle)

  React.useEffect(() => {
    setThrottle(flight.aircraft.throttle)
  }, [flight.aircraft.throttle])

  const runControl = React.useCallback(async (
    operation: FlightSimOperation,
    requestedThrottle?: number,
  ) => {
    setPendingOperation(operation)
    try {
      const result = await controlLocalFlightSim({
        operation,
        ...(requestedThrottle === undefined ? {} : { throttle: requestedThrottle }),
      })
      pushUiToast({
        id: `flight-sim:${operation}:${result.ok ? 'ok' : 'error'}`,
        kind: result.ok ? 'success' : 'error',
        message: result.message,
      })
    } finally {
      setPendingOperation(null)
    }
  }, [pushUiToast])

  const resetSave = React.useCallback(async () => {
    setPendingOperation('reset-save')
    try {
      const reset = await resetFlightSimLocalPersistence()
      pushUiToast({
        id: `flight-sim:reset-save:${reset.status === 'saved' ? 'ok' : 'error'}`,
        kind: reset.status === 'saved' ? 'success' : 'error',
        message: reset.status === 'saved'
          ? 'Local Flight Sim Decisions reset explicitly.'
          : reset.error || 'Local Flight Sim Decision reset failed.',
      })
    } finally {
      setPendingOperation(null)
    }
  }, [pushUiToast])

  const switchCompanion = React.useCallback((target: 'motion-control' | 'xr-3d') => {
    const opened = openMotionControlSurface(target)
    pushUiToast({
      id: `flight-sim:companion:${target}:${opened ? 'ok' : 'error'}`,
      kind: opened ? 'success' : 'error',
      message: opened
        ? `${target === 'motion-control' ? 'Motion Control' : 'XR Mode'} resumed through the shared XR surface owner.`
        : 'XR Mode is unavailable for this document.',
    })
  }, [pushUiToast])

  const busy = pendingOperation !== null
  const hydrationPending = isFlightSimHydrationPending()
  const missionRunning = flight.phase === 'ready' || flight.phase === 'flying'
  const canStart = flight.active
    && flight.phase === 'stopped'
    && flight.webglSupported
    && !hydrationPending
    && !decisions.hydrationBlocked
  const canSave = flight.phase === 'completed' || flight.phase === 'crashed'

  return (
    <section
      className={floatingPanelCatalogSurfaceClassName()}
      aria-label="Flight Sim"
      data-kg-flight-sim-floating-panel="1"
      data-kg-flight-sim-active={flight.active ? '1' : '0'}
      data-kg-flight-sim-phase={flight.phase}
      data-kg-flight-sim-mcp="knowgrph.control_local_flight_sim"
      data-kg-flight-sim-camera-view={camera.view}
      data-kg-flight-sim-environment={environment.id}
      data-kg-flight-sim-hydration={hydrationPending ? 'loading' : decisions.hydrationBlocked ? 'blocked' : 'ready'}
    >
      <FloatingPanelCatalogHeader
        title="Flight Sim"
        subtitle="Local deterministic XR mission"
        actionsLabel="Flight Sim actions"
        actions={<>
          {!flight.active ? (
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy}
              onClick={() => void runControl('open')}
              data-kg-flight-sim-open="1"
            >
              <Plane className="h-3.5 w-3.5" aria-hidden="true" /> Open
            </button>
          ) : (
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !canStart}
              onClick={() => void runControl('start')}
              data-kg-flight-sim-start="1"
            >
              <Plane className="h-3.5 w-3.5" aria-hidden="true" /> Start
            </button>
          )}
          <button
            type="button"
            className="App-toolbar__btn"
            disabled={busy || !missionRunning}
            onClick={() => void runControl('stop')}
            data-kg-flight-sim-stop="1"
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" /> Stop
          </button>
        </>}
      />

      <section className={floatingPanelCatalogBodyClassName('grid content-start gap-2 px-1 pb-2')}>
        <section
          className={cn(
            'grid grid-cols-3 gap-2 rounded border p-2 text-[10px]',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="Flight Sim telemetry"
        >
          <span><b>Mission</b><br />{flight.phase}</span>
          <span>
            <b>Airspeed</b><br />
            {training.airspeedReliable ? `${airspeed(flight.aircraft.velocity)} m/s` : 'UNRELIABLE'}
          </span>
          <span><b>Throttle</b><br />{Math.round(flight.aircraft.throttle * 100)}%</span>
          <span><b>Heading</b><br />{heading(flight.aircraft.yaw)}</span>
          <span><b>Pitch</b><br />{degrees(flight.aircraft.pitch)}</span>
          <span><b>Roll</b><br />{degrees(flight.aircraft.roll)}</span>
          <span><b>World</b><br />{environment.label}</span>
          <span data-kg-flight-sim-panel-envelope={training.envelope.status}>
            <b>Envelope</b><br />{training.envelope.label}
          </span>
          <span>
            <b>Control</b><br />{Math.round(training.envelope.controlAuthority * 100)}%
          </span>
          <span>
            <b>{flight.waypointIndex >= flight.waypointCount ? 'Landing pad' : 'Waypoint'}</b>
            <br />
            {flight.waypointIndex >= flight.waypointCount
              ? 'Marked'
              : `${flight.waypointIndex + 1}/${flight.waypointCount}`}
          </span>
          <span><b>Tick</b><br />{flight.tick}</span>
          <span><b>Decisions</b><br />{decisions.savedCount} saved</span>
        </section>

        <section
          className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
          aria-label="Flight camera and navigation"
        >
          <p className="flex items-center gap-1 text-[11px] font-semibold">
            <View className="h-3.5 w-3.5" aria-hidden="true" />
            Camera view · {FLIGHT_SIM_CAMERA_VIEW_OPTIONS.find(option => option.id === camera.view)?.label}
          </p>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Flight camera views">
            {FLIGHT_SIM_CAMERA_VIEW_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                className={cn('App-toolbar__btn', option.id === camera.view && 'font-bold')}
                aria-pressed={option.id === camera.view}
                onClick={() => selectFlightSimCameraView(option.id)}
                data-kg-flight-sim-camera-option={option.id}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
          <FlightSimNavigationInset flight={flight} />
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            Press C to cycle views · north-up route is derived from the authored local mission only.
          </p>
        </section>

        <FlightSimTrainingSurfaceProjection surface="flight-sim" />

        <section
          className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
          aria-label="Flight Sim runtime status"
        >
          <p className="flex items-center gap-1 text-[11px] font-semibold">
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            Desktop, pointer, touch, gamepad, Motion Control
          </p>
          <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
            {flight.currentWaypointId
              ? `Proceed to ${flight.currentWaypointId}.`
              : flight.phase === 'completed'
                ? 'Mission complete. Save the validated Decisions locally.'
                : `The ${environment.label} XR terrain remains the only world owner.`}
          </p>
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            One existing R3F Canvas · fixed native ECS ticks · swept AABB collision · zero runtime network or model calls.
          </p>
          <p
            className={cn(
              'text-[10px]',
              motionControl.phase === 'running'
                ? UI_THEME_TOKENS.status.success
                : UI_THEME_TOKENS.text.tertiary,
            )}
            data-kg-flight-sim-motion-control={motionControl.phase}
            data-kg-flight-sim-motion-pose={motionControl.pose ? 'tracked' : 'waiting'}
          >
            Motion Control · {motionControl.phase === 'running'
              ? motionControl.pose
                ? 'connected · pose driving aircraft'
                : 'connected · waiting for a full-body pose'
              : 'off · open Motion Control to connect'}
          </p>
          {flight.runtimeError ? (
            <p
              className={cn('text-[10px]', UI_THEME_TOKENS.status.error)}
              role="alert"
              data-kg-flight-sim-runtime-error="1"
            >
              <ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {flight.runtimeError}
            </p>
          ) : null}
          {decisions.error ? (
            <p
              className={cn('break-words text-[10px]', UI_THEME_TOKENS.status.error)}
              role="alert"
              data-kg-flight-sim-save-error="1"
            >
              {decisions.error}
            </p>
          ) : null}
          <p className={cn('break-all text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            Decision owner · {FLIGHT_SIM_SAVE_PATH}
          </p>
        </section>

        <section
          className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
          aria-label="Flight Sim controls"
        >
          <label className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[10px]">
            <span>Throttle</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={throttle}
              disabled={busy || !missionRunning}
              onChange={event => setThrottle(Number(event.target.value))}
              data-kg-flight-sim-throttle-slider="1"
            />
            <span>{Math.round(throttle * 100)}%</span>
          </label>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !missionRunning}
              onClick={() => void runControl('throttle', throttle)}
              data-kg-flight-sim-action="throttle"
            >
              Set throttle
            </button>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !flight.active || decisions.hydrationBlocked}
              onClick={() => void runControl('restart')}
              data-kg-flight-sim-action="restart"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restart
            </button>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !canSave || decisions.hydrationBlocked}
              onClick={() => void runControl('save')}
              data-kg-flight-sim-action="save"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save
            </button>
            {decisions.status === 'error' && !decisions.hydrationBlocked && decisions.retainedCount > 0 ? (
              <button
                type="button"
                className="App-toolbar__btn"
                disabled={busy}
                onClick={() => void runControl('save')}
                data-kg-flight-sim-action="retry-save"
              >
                Retry save
              </button>
            ) : null}
            {decisions.hydrationBlocked ? (
              <button
                type="button"
                className="App-toolbar__btn"
                disabled={busy}
                onClick={() => void resetSave()}
                data-kg-flight-sim-action="reset-save"
              >
                Reset local save
              </button>
            ) : null}
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={busy || !flight.active}
              onClick={() => void runControl('exit')}
              data-kg-flight-sim-action="exit"
            >
              Exit
            </button>
          </div>
        </section>

        <section
          className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
          aria-label="Flight Sim companions"
        >
          <h3 className="text-[11px] font-semibold">Motion Control · XR Mode</h3>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="App-toolbar__btn"
              onClick={() => switchCompanion('motion-control')}
              data-kg-flight-sim-open-companion="motion-control"
            >
              Motion Control
            </button>
            <button
              type="button"
              className="App-toolbar__btn"
              onClick={() => switchCompanion('xr-3d')}
              data-kg-flight-sim-open-companion="xr"
            >
              <View className="h-3.5 w-3.5" aria-hidden="true" /> XR Mode
            </button>
          </div>
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            Motion Control keeps the aircraft and camera capture live across the panel handoff. XR Mode exits the aircraft overlay and restores the authored scene controller.
          </p>
        </section>

        <section
          className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
          data-kg-flight-sim-invocations="native"
        >
          <h3 className="text-[11px] font-semibold">WebMCP · / · @ · #</h3>
          <Invocation operation="open" />
          <Invocation operation="start" />
          <Invocation operation="throttle" throttle={0.75} />
          <Invocation operation="save" />
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            Browser tools · knowgrph.inspect_local_flight_sim · knowgrph.control_local_flight_sim
          </p>
        </section>
      </section>
    </section>
  )
}

export default FlightSimFloatingPanelView
