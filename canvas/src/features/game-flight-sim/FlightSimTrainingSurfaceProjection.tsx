import React from 'react'
import { Headphones, Plane, Volume2 } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import { openFlightSimSurface } from './flightSimRuntime'
import {
  enableFlightSimVoiceInstructor,
  readFlightSimTrainingSnapshot,
  speakFlightSimTrainingCue,
  subscribeFlightSimTrainingSnapshot,
} from './flightSimTrainingRuntime'
import {
  FLIGHT_SIM_TRAINING_FAILURES,
  FLIGHT_SIM_TRAINING_MISSIONS,
  selectFlightSimTrainingFailure,
  selectFlightSimTrainingMission,
  type FlightSimTrainingFailureId,
  type FlightSimTrainingMissionId,
} from './flightSimTrainingScenario'

export type FlightSimTrainingSurface =
  | 'media'
  | 'animation'
  | 'motion-control'
  | 'game-mode'
  | 'flight-sim'
  | 'camera'

const SURFACE_ROLE: Record<FlightSimTrainingSurface, string> = {
  media: 'Mission brief, voice cue, and debrief evidence',
  animation: 'Aircraft, route, failure, and night cue choreography',
  'motion-control': 'Optional pose input and instructor interaction',
  'game-mode': 'Mission selection, practice failures, and measured scoring',
  'flight-sim': 'Live trainer controls, systems workflow, and outcomes',
  camera: 'Fixed-follow and free-orbit circuit observation',
}

export function FlightSimTrainingSurfaceProjection({
  surface,
}: {
  surface: FlightSimTrainingSurface
}) {
  const training = React.useSyncExternalStore(
    subscribeFlightSimTrainingSnapshot,
    readFlightSimTrainingSnapshot,
    readFlightSimTrainingSnapshot,
  )
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const [opening, setOpening] = React.useState(false)
  const selectionLocked = training.phase === 'ready' || training.phase === 'flying'

  const openTrainer = React.useCallback(async () => {
    if (training.flightActive) {
      activateXrSceneSurface({ panelView: 'flightSim', openPanel: true, timeline: true })
      return
    }
    setOpening(true)
    try {
      const opened = await openFlightSimSurface({ openPanel: true })
      pushUiToast({
        id: `flight-training:open:${opened.active ? 'ok' : 'error'}`,
        kind: opened.active ? 'success' : 'error',
        message: opened.active
          ? 'Flight training opened on the shared authored XR world.'
          : opened.runtimeError || 'Flight training could not open.',
      })
    } finally {
      setOpening(false)
    }
  }, [pushUiToast, training.flightActive])

  const setVoice = React.useCallback((enabled: boolean) => {
    const available = enableFlightSimVoiceInstructor(enabled)
    if (enabled && !available) {
      pushUiToast({
        id: 'flight-training:voice:unavailable',
        kind: 'error',
        message: 'The browser voice surface is unavailable; text coaching remains active.',
      })
    }
  }, [pushUiToast])

  return (
    <section
      className={cn(
        'grid gap-2 rounded border p-2',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      )}
      aria-label={`Flight training in ${surface}`}
      data-kg-flight-training-surface={surface}
      data-kg-flight-training-mission={training.missionId}
      data-kg-flight-training-score={training.score}
      data-kg-flight-training-night={training.night ? '1' : '0'}
      data-kg-flight-training-failure={training.failureId}
      data-kg-flight-training-voice={training.voiceEnabled ? 'enabled' : 'text'}
      data-kg-flight-training-envelope={training.envelope.status}
      data-kg-flight-training-control-authority={training.envelope.controlAuthority.toFixed(4)}
    >
      <header className="flex items-start justify-between gap-2">
        <section className="min-w-0">
          <h3 className="flex items-center gap-1 text-[11px] font-semibold">
            <Plane className="h-3.5 w-3.5" aria-hidden="true" />
            Flight Training · {training.missionTitle}
          </h3>
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            {SURFACE_ROLE[surface]}
          </p>
        </section>
        <output className="shrink-0 text-right text-[10px] font-semibold">
          {training.score}/100 · {training.grade}
        </output>
      </header>

      <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
        {training.coachingCue}
      </p>

      {surface === 'motion-control' ? (
        <p
          className={cn('text-[9px]', UI_THEME_TOKENS.text.secondary)}
          data-kg-flight-training-motion-controls="connected-handoff"
        >
          Start Motion Control, then return to Flight Sim: lean forward/back for pitch,
          lean side-to-side for roll, raise both hands for power, and hold hands wide
          while leaning to yaw. Camera tracking remains live across the handoff.
        </p>
      ) : null}

      <section className="grid grid-cols-3 gap-1 text-[9px]" aria-label="Flight training outcomes">
        <span><b>Route</b><br />{training.routeProgress}%</span>
        <span><b>Stable</b><br />{training.stabilityPercent}%</span>
        <span><b>Energy</b><br />{training.energyPercent}%</span>
      </section>

      <output
        className={cn(
          'rounded border px-2 py-1 text-[9px] font-semibold',
          training.envelope.severity === 'warning'
            ? 'border-rose-400/40 text-rose-300'
            : training.envelope.severity === 'caution'
              ? 'border-amber-400/40 text-amber-300'
              : 'border-cyan-400/40 text-cyan-300',
        )}
        aria-label="Flight envelope status"
      >
        {training.envelope.label} · target {training.envelope.targetSpeedMetersPerSecond[0]}–{training.envelope.targetSpeedMetersPerSecond[1]} m/s
        {' · '}control {Math.round(training.envelope.controlAuthority * 100)}%
      </output>

      <label className="grid gap-1 text-[9px]">
        <span>Training mission</span>
        <select
          className="min-w-0 rounded border bg-transparent px-1 py-1 text-[10px]"
          value={training.missionId}
          disabled={selectionLocked}
          onChange={event => selectFlightSimTrainingMission(
            event.currentTarget.value as FlightSimTrainingMissionId,
          )}
          data-kg-flight-training-mission-select="1"
        >
          {FLIGHT_SIM_TRAINING_MISSIONS.map(mission => (
            <option key={mission.id} value={mission.id}>{mission.label}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-[9px]">
        <span>Practice failure</span>
        <select
          className="min-w-0 rounded border bg-transparent px-1 py-1 text-[10px]"
          value={training.failureId}
          disabled={selectionLocked}
          onChange={event => selectFlightSimTrainingFailure(
            event.currentTarget.value as FlightSimTrainingFailureId,
          )}
          data-kg-flight-training-failure-select="1"
        >
          {FLIGHT_SIM_TRAINING_FAILURES.map(failure => (
            <option key={failure.id} value={failure.id}>{failure.label}</option>
          ))}
        </select>
      </label>

      <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
        {training.terrain} · {training.night ? 'night lighting' : 'day lighting'} ·
        {' '}{training.airspeedReliable ? 'airspeed reliable' : 'airspeed unreliable'}
      </p>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="App-toolbar__btn"
          disabled={opening}
          onClick={() => void openTrainer()}
          data-kg-flight-training-open="1"
        >
          <Plane className="h-3.5 w-3.5" aria-hidden="true" />
          {training.flightActive ? 'Flight Sim' : 'Open trainer'}
        </button>
        <button
          type="button"
          className="App-toolbar__btn"
          disabled={!training.voiceAvailable}
          aria-pressed={training.voiceEnabled}
          onClick={() => setVoice(!training.voiceEnabled)}
          data-kg-flight-training-voice-toggle="1"
        >
          <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
          Voice {training.voiceEnabled ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className="App-toolbar__btn"
          disabled={!training.voiceAvailable}
          onClick={() => speakFlightSimTrainingCue()}
          data-kg-flight-training-hear-cue="1"
        >
          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Hear cue
        </button>
      </div>

      <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
        Systems: {training.systemsChecklist.join(' · ')}
      </p>
    </section>
  )
}
