import React from 'react'
import {
  Crosshair,
  Gamepad2,
  MonitorSmartphone,
  RotateCcw,
  Save,
  ShieldAlert,
  Square,
  Target,
  View,
} from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  renderAgenticOsInvocationKeywordChip,
} from '@/features/agentic-os/agenticOsInvocationChips'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { openMotionControlSurface } from '@/features/three/motionControlSurfaceRuntime'
import { XrSharedAssetControls } from '@/features/three/XrSharedAssetControls'
import {
  controlXrSharedAssetControls,
  inspectXrSharedAssetControls,
  readXrSharedAssetControlRevision,
  subscribeXrSharedAssetControlRuntime,
} from '@/features/three/xrSharedAssetControlRuntime'
import { FlightSimTrainingSurfaceProjection } from '@/features/game-flight-sim/FlightSimTrainingSurfaceProjection'
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
  GAME_MODE_INVOCATION_BINDINGS,
  GAME_MODE_INVOCATION_COMMANDS,
  GAME_MODE_INVOCATION_SEMANTICS,
} from './gameModeMcpContract.mjs'
import {
  buildGameModeInvocation,
  controlLocalGameMode,
  type GameModeOperation,
} from './gameModeMcpRuntime'
import {
  readGameModeSnapshot,
  restartGameMode,
  subscribeGameModeSnapshot,
} from './gameModeRuntime'
import {
  readGameFpsSpatialProfile,
  readGameFpsSnapshot,
  subscribeGameFpsSnapshot,
} from './gameFpsRuntime'
import {
  GAME_FPS_SAVE_PATH,
  readGameFpsDecisionStore,
  resetGameFpsLocalSave,
  subscribeGameFpsDecisionStore,
} from './gameFpsDecisionStore'
import { gameFpsHorizontalDistance, hasGameFpsLineOfSight } from './gameFpsGeometry'
import { scoreGameFpsNpcActions } from './gameFpsNpcPolicy'

const GAME_MODE_GRAMMAR_SIGILS = ['/', '@', '#'] as const
const GAME_MODE_REQUIRED_TOKENS = Object.freeze([
  { token: GAME_MODE_INVOCATION_COMMANDS.control, kind: 'command' },
  { token: GAME_MODE_INVOCATION_BINDINGS.canvas, kind: 'binding' },
  { token: GAME_MODE_INVOCATION_SEMANTICS.gameplay, kind: 'semantic' },
])

function Invocation({ operation }: { operation: GameModeOperation }) {
  return (
    <code className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'min-w-0 overflow-hidden font-mono text-[9px]', UI_THEME_TOKENS.text.secondary)}>
      {renderMarkdownSigilInlineText(buildGameModeInvocation(operation), {
        renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
      })}
    </code>
  )
}

export function GameModeFloatingPanelView() {
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
  const decisions = React.useSyncExternalStore(
    subscribeGameFpsDecisionStore,
    readGameFpsDecisionStore,
    readGameFpsDecisionStore,
  )
  const sharedAssetControlRevision = React.useSyncExternalStore(
    subscribeXrSharedAssetControlRuntime,
    readXrSharedAssetControlRevision,
    readXrSharedAssetControlRevision,
  )
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: GAME_MODE_GRAMMAR_SIGILS })
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const [pendingOperation, setPendingOperation] = React.useState<GameModeOperation | 'reset-save' | null>(null)
  const sourceMetadataReady = grammarCatalog.hydration.status === 'fresh'
    && GAME_MODE_REQUIRED_TOKENS.every(required => grammarCatalog.entries.some(entry => entry.token === required.token && entry.kind === required.kind))

  const runControl = React.useCallback(async (operation: GameModeOperation) => {
    setPendingOperation(operation)
    try {
      const result = await controlLocalGameMode({ operation })
      pushUiToast({
        id: `game-mode:${operation}:${result.ok ? 'ok' : 'error'}`,
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
      const result = await resetGameFpsLocalSave()
      if (result.status === 'saved') {
        await restartGameMode()
        pushUiToast({ id: 'game-mode:reset-save:ok', kind: 'success', message: 'Local Game Mode Decisions reset explicitly.' })
      } else {
        pushUiToast({ id: 'game-mode:reset-save:error', kind: 'error', message: result.error || 'Local Decision reset failed.' })
      }
    } finally {
      setPendingOperation(null)
    }
  }, [pushUiToast])

  const switchCompanion = React.useCallback((target: 'motion-control' | 'xr-3d') => {
    const opened = openMotionControlSurface(target)
    pushUiToast({
      id: `game-mode:companion:${target}:${opened ? 'ok' : 'error'}`,
      kind: opened ? 'success' : 'error',
      message: opened
        ? `${target === 'motion-control' ? 'Motion Control' : 'XR Mode'} resumed through the shared XR surface owner.`
        : 'XR Mode is unavailable for this document.',
    })
  }, [pushUiToast])

  const sharedAssetControls = React.useMemo(
    () => inspectXrSharedAssetControls(),
    [mission.revision, sharedAssetControlRevision],
  )

  const selectNpcTarget = React.useCallback((npcId: string) => {
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })
    pushUiToast({
      id: `game-mode:npc-target:${npcId}:${result.ok ? 'ok' : 'error'}`,
      kind: result.ok ? 'success' : 'error',
      message: result.message,
    })
  }, [pushUiToast])

  const spatialProfile = readGameFpsSpatialProfile()
  const npcRows = mission.npcs.map(npc => {
    const playerDistance = gameFpsHorizontalDistance(mission.player, npc)
    const lineOfSight = hasGameFpsLineOfSight(mission.player, npc, spatialProfile.map)
    return {
      ...npc,
      playerDistance,
      lineOfSight,
      scores: scoreGameFpsNpcActions({ health: npc.health, playerDistance, lineOfSight }),
    }
  })
  const canUseWeapon = mission.phase === 'playing' && !mission.runtimeError
  const canSave = mission.phase === 'won' || mission.phase === 'lost'

  return (
    <section
      className={floatingPanelCatalogSurfaceClassName()}
      aria-label="Game Mode"
      data-kg-game-mode-floating-panel="1"
      data-kg-game-mode-active={gameMode.active ? '1' : '0'}
      data-kg-game-mode-phase={mission.phase}
      data-kg-game-mode-simulation={gameMode.simulationStatus}
      data-kg-game-mode-mcp="agenticgraph.control_local_game_mode"
    >
      <FloatingPanelCatalogHeader
        title="Game Mode"
        subtitle="Deterministic ECS gameplay"
        actionsLabel="Game Mode actions"
        actions={<>
          <button type="button" className="App-toolbar__btn" disabled={pendingOperation !== null || mission.phase !== 'stopped' || decisions.hydrationBlocked} onClick={() => void runControl('start')} data-kg-game-mode-start="1">
            <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" /> Start
          </button>
          <button type="button" className="App-toolbar__btn" disabled={pendingOperation !== null || !gameMode.active} onClick={() => void runControl('stop')} data-kg-game-mode-stop="1">
            <Square className="h-3.5 w-3.5" aria-hidden="true" /> Stop
          </button>
        </>}
      />
      <section className={floatingPanelCatalogBodyClassName('grid content-start gap-2 px-1 pb-2')}>
        <section className={cn('grid grid-cols-3 gap-2 rounded border p-2 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Game Mode telemetry">
          <span><b>Status</b><br />{gameMode.launchStatus} · {gameMode.simulationStatus}</span>
          <span><b>Mission</b><br />{mission.phase}</span>
          <span><b>Surface</b><br />{gameMode.surfaceMode}</span>
          <span><b>Health</b><br />{mission.player.health}</span>
          <span><b>Ammo</b><br />{mission.ammo}/{mission.reserve}</span>
          <span><b>NPC alive</b><br />{mission.enemiesAlive}</span>
          <span><b>Tick</b><br />{mission.tick}</span>
          <span><b>Fire</b><br />{mission.fireResult}</span>
          <span><b>Decisions</b><br />{decisions.savedCount} saved</span>
        </section>

        <section className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Game Mode runtime status">
          <p className="flex items-center gap-1 text-[11px] font-semibold"><MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" /> Desktop, pointer, touch, Motion Control</p>
          <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>{gameMode.message}</p>
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>One existing R3F Canvas · synchronous WebGL guard · fixed native Agentic ECS ticks · normalized slab AABB hitscan.</p>
          {mission.runtimeError ? <p className={cn('text-[10px]', UI_THEME_TOKENS.status.error)} role="alert" data-kg-game-mode-runtime-error="1"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{mission.runtimeError}</p> : null}
          {decisions.error ? <p className={cn('break-words text-[10px]', UI_THEME_TOKENS.status.error)} role="alert" data-kg-game-mode-save-error="1">{decisions.error}</p> : null}
          <p className={cn('break-all text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Decision owner · {GAME_FPS_SAVE_PATH}</p>
        </section>

        <section className={cn('grid grid-cols-3 gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Game Mode controls">
          <button type="button" className="App-toolbar__btn" disabled={!canUseWeapon} onClick={() => void runControl('fire')} data-kg-game-mode-action="fire"><Crosshair className="h-3.5 w-3.5" aria-hidden="true" /> Fire</button>
          <button type="button" className="App-toolbar__btn" disabled={!canUseWeapon} onClick={() => void runControl('reload')} data-kg-game-mode-action="reload">Reload</button>
          <button type="button" className="App-toolbar__btn" disabled={pendingOperation !== null || decisions.hydrationBlocked} onClick={() => void runControl('restart')} data-kg-game-mode-action="restart"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restart</button>
          <button type="button" className="App-toolbar__btn" disabled={!canSave || pendingOperation !== null || decisions.hydrationBlocked} onClick={() => void runControl('save')} data-kg-game-mode-action="save"><Save className="h-3.5 w-3.5" aria-hidden="true" /> Save</button>
          {decisions.status === 'error' && !decisions.hydrationBlocked && decisions.retainedCount > 0 ? <button type="button" className="App-toolbar__btn" onClick={() => void runControl('save')} data-kg-game-mode-action="retry-save">Retry save</button> : null}
          {decisions.hydrationBlocked ? <button type="button" className="App-toolbar__btn" onClick={() => void resetSave()} data-kg-game-mode-action="reset-save">Reset local save</button> : null}
          <button type="button" className="App-toolbar__btn" disabled={!gameMode.active} onClick={() => void runControl('exit')} data-kg-game-mode-action="exit">Exit</button>
        </section>

        <section className="grid gap-1" aria-label="Scored four-action NPC decisions" data-kg-game-mode-npc-scores="1">
          {npcRows.map(npc => (
            <article
              key={npc.id}
              className={cn(
                'grid gap-1 rounded border p-2 text-[9px]',
                UI_THEME_TOKENS.panel.border,
                UI_THEME_TOKENS.panel.bg,
                sharedAssetControls.selectedKind === 'npc' && sharedAssetControls.selectedTargetId === npc.id ? UI_THEME_TOKENS.button.activeBg : '',
              )}
              data-kg-game-mode-npc-row={npc.id}
              data-kg-xr-shared-asset-target={npc.id}
              data-kg-xr-shared-gameplay-npc-selected={sharedAssetControls.selectedKind === 'npc' && sharedAssetControls.selectedTargetId === npc.id ? '1' : undefined}
            >
              <header className="flex items-center justify-between gap-2 text-[10px]">
                <b>{npc.id}</b>
                <span>{npc.action} · {npc.health} HP</span>
                <button
                  type="button"
                  className="App-toolbar__btn size-6 justify-center p-0"
                  aria-label={`Select ${npc.id} for shared 3D for XR controls`}
                  aria-pressed={sharedAssetControls.selectedKind === 'npc' && sharedAssetControls.selectedTargetId === npc.id}
                  title={`Select ${npc.id}`}
                  onClick={() => selectNpcTarget(npc.id)}
                  data-kg-game-mode-npc-shared-target={npc.id}
                >
                  <Target className="size-3.5" aria-hidden />
                </button>
              </header>
              <p className={UI_THEME_TOKENS.text.tertiary}>{npc.playerDistance.toFixed(1)} m · {npc.lineOfSight ? 'line of sight' : 'occluded'}</p>
              <p className={UI_THEME_TOKENS.text.secondary}>hold {npc.scores.hold} · alert {npc.scores.alert} · engage {npc.scores.engage} · flee {npc.scores.flee}</p>
            </article>
          ))}
        </section>

        <section className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Game Mode companions">
          <h3 className="text-[11px] font-semibold">Motion Control · XR Mode</h3>
          <div className="flex flex-wrap gap-1">
            <button type="button" className="App-toolbar__btn" onClick={() => switchCompanion('motion-control')} data-kg-game-mode-open-companion="motion-control">Motion Control</button>
            <button type="button" className="App-toolbar__btn" onClick={() => switchCompanion('xr-3d')} data-kg-game-mode-open-companion="xr"><View className="h-3.5 w-3.5" aria-hidden="true" /> XR Mode</button>
          </div>
          <XrSharedAssetControls surface="game-mode" embedded />
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>On XR, Game Mode retains the paused authored scene while its first-person overlay owns camera and gameplay; exit resumes the shared controller owner.</p>
        </section>

        <FlightSimTrainingSurfaceProjection surface="game-mode" />

        <section className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-game-mode-invocations="shared-catalog">
          <h3 className="text-[11px] font-semibold">MCP · / · @ · #</h3>
          {!sourceMetadataReady ? <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Agentic OS Game Mode metadata is {grammarCatalog.hydration.status}; native invocation remains ready.</p> : null}
          <Invocation operation="open" />
          <Invocation operation="start" />
          <Invocation operation="fire" />
          <Invocation operation="save" />
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>WebMCP · agenticgraph.control_local_game_mode</p>
        </section>
      </section>
    </section>
  )
}

export default GameModeFloatingPanelView
