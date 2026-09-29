import React from 'react'
import {
  queueGameFpsFire,
  readGameFpsSnapshot,
  reloadGameFpsWeapon,
  setGameFpsInput,
  subscribeGameFpsSnapshot,
} from './gameFpsRuntime'
import {
  armGameModeSimulation,
  persistGameModePendingDecisions,
  readGameModeSnapshot,
  restartGameMode,
  subscribeGameModeSnapshot,
} from './gameModeRuntime'
import {
  gameFpsInputPatchFromHeldTouches,
  releaseGameFpsHeldTouch,
  type GameFpsTouchAction,
} from './gameFpsInput'
import {
  readGameFpsDecisionStore,
  resetGameFpsLocalSave,
  subscribeGameFpsDecisionStore,
} from './gameFpsDecisionStore'
import { subscribeGlobalCancelEvents } from '@/lib/browser/globalCancelEvents'

const actionButtonClass = 'min-h-11 min-w-11 rounded-xl border border-white/25 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm active:bg-cyan-700/80'

export function GameFpsHud() {
  const gameMode = React.useSyncExternalStore(
    subscribeGameModeSnapshot,
    readGameModeSnapshot,
    readGameModeSnapshot,
  )
  const mission = React.useSyncExternalStore(
    subscribeGameFpsSnapshot,
    readGameFpsSnapshot,
    readGameFpsSnapshot,
  )
  const save = React.useSyncExternalStore(
    subscribeGameFpsDecisionStore,
    readGameFpsDecisionStore,
    readGameFpsDecisionStore,
  )
  const heldTouchesRef = React.useRef(new Map<number, GameFpsTouchAction>())

  const publishHeldMovement = React.useCallback(() => {
    setGameFpsInput(gameFpsInputPatchFromHeldTouches(heldTouchesRef.current))
  }, [])
  const beginTouch = React.useCallback((action: GameFpsTouchAction) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    armGameModeSimulation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic and partially supported touch implementations may not expose an active capture target.
    }
    heldTouchesRef.current.set(event.pointerId, action)
    if (action === 'look-left' || action === 'look-right') {
      setGameFpsInput({ lookYawDelta: action === 'look-left' ? 0.12 : -0.12 })
      return
    }
    publishHeldMovement()
  }, [publishHeldMovement])
  const endTouch = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    heldTouchesRef.current.delete(event.pointerId)
    publishHeldMovement()
  }, [publishHeldMovement])

  const cancelHeldTouches = React.useCallback((event?: Event) => {
    releaseGameFpsHeldTouch(heldTouchesRef.current, event)
    publishHeldMovement()
  }, [publishHeldMovement])

  React.useEffect(() => subscribeGlobalCancelEvents({
    listener: cancelHeldTouches,
    capture: true,
    includeLostPointerCapture: true,
    visibilityBehavior: 'hidden-only',
  }), [cancelHeldTouches])

  const fire = React.useCallback(() => {
    armGameModeSimulation()
    queueGameFpsFire()
  }, [])
  const reload = React.useCallback(() => {
    armGameModeSimulation()
    reloadGameFpsWeapon()
  }, [])

  const gameModeError = gameMode.launchStatus === 'error' ? gameMode.message : null
  const phaseLabel = mission.runtimeError || gameModeError
    ? 'Mission runtime blocked'
    : mission.phase === 'won'
    ? 'Mission complete'
    : mission.phase === 'lost'
      ? 'Mission failed'
      : mission.phase === 'playing'
        ? gameMode.simulationStatus === 'running'
          ? 'Resolve all four encounters'
          : 'Ready · move, aim, or fire to engage'
        : 'Preparing mission'
  const saveLabel = save.status === 'saving'
    ? 'Saving Decisions…'
    : save.status === 'saved'
      ? 'Decisions saved locally'
      : save.status === 'error'
        ? 'Local save needs attention'
        : mission.pendingDecisions.length > 0
          ? 'Decision pending'
          : 'Local save ready'
  const terminal = mission.phase === 'won' || mission.phase === 'lost'

  return (
    <section
      className="pointer-events-none absolute inset-0 z-[230] select-none overflow-hidden text-white"
      aria-label="Game FPS mission HUD"
      data-kg-game-fps-hud="1"
      data-kg-game-fps-phase={mission.phase}
      data-kg-game-fps-simulation={gameMode.simulationStatus}
      data-kg-game-mode-launch-status={gameMode.launchStatus}
      data-kg-game-fps-health={String(mission.player.health)}
      data-kg-game-fps-ammo={String(mission.ammo)}
      data-kg-game-fps-enemies-alive={String(mission.enemiesAlive)}
      data-kg-game-fps-fire-result={mission.fireResult}
      data-kg-game-fps-player-x={mission.player.x.toFixed(4)}
      data-kg-game-fps-player-z={mission.player.z.toFixed(4)}
      data-kg-game-fps-tick={String(mission.tick)}
      data-kg-game-fps-pending-decisions={String(mission.pendingDecisions.length)}
      data-kg-game-fps-save-status={save.status}
      data-kg-game-fps-save-error={save.error || undefined}
      data-kg-game-fps-runtime-error={mission.runtimeError || undefined}
      data-kg-game-mode-error={gameModeError || undefined}
    >
      <header className="absolute left-3 right-3 top-3 flex items-start justify-between gap-3 pt-[env(safe-area-inset-top)]">
        <section className="min-w-0 max-w-[58vw] rounded-xl border border-white/20 bg-slate-950/75 px-3 py-2 shadow-lg backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-normal text-cyan-200">Mission 1 · Local deterministic ECS</p>
          <p className="mt-1 text-sm font-semibold" data-kg-game-fps-objective>{phaseLabel}</p>
          <p className="mt-1 text-xs text-slate-300">{saveLabel}</p>
          {save.error ? (
            <p className="mt-1 max-w-[70vw] break-words text-xs text-rose-200" role="alert">
              {save.error}
            </p>
          ) : null}
          {mission.runtimeError ? (
            <p className="mt-1 max-w-[70vw] break-words text-xs text-rose-200" role="alert">
              {mission.runtimeError}
            </p>
          ) : null}
          {gameModeError && gameModeError !== mission.runtimeError && gameModeError !== save.error ? (
            <p className="mt-1 max-w-[70vw] break-words text-xs text-rose-200" role="alert">
              {gameModeError}
            </p>
          ) : null}
        </section>
        <section className="grid min-w-[7.25rem] shrink-0 grid-cols-3 gap-2 rounded-xl border border-white/20 bg-slate-950/75 px-2 py-2 text-center shadow-lg backdrop-blur-sm">
          <span className="text-xs text-slate-300">HEALTH<strong className="block text-sm text-white">{mission.player.health}</strong></span>
          <span className="text-xs text-slate-300">AMMO<strong className="block text-sm text-white">{mission.ammo}/{mission.reserve}</strong></span>
          <span className="text-xs text-slate-300">NPC<strong className="block text-sm text-white">{mission.enemiesAlive}</strong></span>
        </section>
      </header>

      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <span className="absolute left-[7px] top-0 h-4 w-px bg-white/90" />
        <span className="absolute left-0 top-[7px] h-px w-4 bg-white/90" />
      </span>

      <section className="pointer-events-auto absolute bottom-3 left-3 grid grid-cols-3 gap-1 pb-[env(safe-area-inset-bottom)]" aria-label="Touch movement controls">
        <span />
        <button className={actionButtonClass} type="button" data-kg-game-fps-touch="forward" aria-label="Move forward" onPointerDown={beginTouch('forward')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>▲</button>
        <span />
        <button className={actionButtonClass} type="button" data-kg-game-fps-touch="left" aria-label="Move left" onPointerDown={beginTouch('left')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>◀</button>
        <button className={actionButtonClass} type="button" data-kg-game-fps-touch="back" aria-label="Move back" onPointerDown={beginTouch('back')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>▼</button>
        <button className={actionButtonClass} type="button" data-kg-game-fps-touch="right" aria-label="Move right" onPointerDown={beginTouch('right')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>▶</button>
      </section>

      <section className="pointer-events-auto absolute bottom-3 right-3 flex max-w-[52vw] flex-wrap items-end justify-end gap-1 pb-[env(safe-area-inset-bottom)]" aria-label="Aim and weapon controls">
        <button className={actionButtonClass} type="button" data-kg-game-fps-touch="look-left" aria-label="Aim left" onPointerDown={beginTouch('look-left')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>Aim ◀</button>
        <button className={actionButtonClass} type="button" data-kg-game-fps-touch="look-right" aria-label="Aim right" onPointerDown={beginTouch('look-right')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>Aim ▶</button>
        <button className={`${actionButtonClass} bg-rose-800/80`} type="button" data-kg-game-fps-action="fire" onClick={fire}>Fire</button>
        <button className={actionButtonClass} type="button" data-kg-game-fps-action="reload" onClick={reload}>Reload</button>
        <button className={actionButtonClass} type="button" data-kg-game-fps-action="restart" disabled={save.hydrationBlocked} onClick={() => void restartGameMode()}>Restart</button>
        {terminal && !save.hydrationBlocked ? (
          <button className={actionButtonClass} type="button" data-kg-game-fps-action="save" disabled={save.status === 'saving'} onClick={() => void persistGameModePendingDecisions()}>Save Decisions</button>
        ) : null}
        {save.status === 'error' && !save.hydrationBlocked && save.retainedCount > 0 ? (
          <button className={actionButtonClass} type="button" data-kg-game-fps-action="retry-save" onClick={() => void persistGameModePendingDecisions()}>Retry save</button>
        ) : null}
        {save.hydrationBlocked ? (
          <button className={actionButtonClass} type="button" data-kg-game-fps-action="reset-save" onClick={() => void resetGameFpsLocalSave().then(result => {
            if (result.status === 'saved') void restartGameMode()
          })}>Reset local save</button>
        ) : null}
      </section>
    </section>
  )
}
