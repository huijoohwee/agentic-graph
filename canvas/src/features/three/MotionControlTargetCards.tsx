import React from 'react'
import { Box, Clapperboard, Gamepad2 } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { requestXrSimulationWorkbenchOpen } from '@/features/command-menu/xrSimulationWorkbenchOpenRequest'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { PanelField, PanelSelect } from '@/lib/ui/panelFormControls'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { cn } from '@/lib/utils'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import {
  readXrNativeControllerDemo,
  subscribeXrNativeControllerDemo,
} from './xrNativeControllerDemoRuntime'
import {
  readXrPhysicsRuntime,
  subscribeXrPhysicsRuntime,
} from './xrPhysicsRuntime'
import { controlXrSharedAssetControls } from './xrSharedAssetControlRuntime'
import { selectBoundXrShotTarget } from './xrSelectedActorBinding'
import { inspectMotionControlTargets } from './motionControlTargetRuntime'
import type { MotionControlCompanionTarget } from './motionControlSurfaceRuntime'
import { XrSharedAssetControls } from './XrSharedAssetControls'
import { readGameModeSnapshot, subscribeGameModeSnapshot } from '@/features/game-fps/gameModeRuntime'
import { readGameFpsSnapshot, subscribeGameFpsSnapshot } from '@/features/game-fps/gameFpsRuntime'

type MotionControlTargetCardsProps = Readonly<{
  livePoseActive: boolean
  onOpenTarget: (target: MotionControlCompanionTarget) => void
}>

const MOTION_TARGET_GRAMMAR_SIGILS = ['/', '#', '@'] as const

function TargetInvocation({ invocation }: { invocation: string }) {
  return (
    <code
      className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'min-w-0 overflow-hidden font-mono text-[9px]', UI_THEME_TOKENS.text.secondary)}
      data-kg-motion-control-target-invocation="shared-canonical"
    >
      {renderMarkdownSigilInlineText(invocation, {
        renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
      })}
    </code>
  )
}

export const MotionControlTargetCards = React.memo(function MotionControlTargetCards({
  livePoseActive,
  onOpenTarget,
}: MotionControlTargetCardsProps) {
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: MOTION_TARGET_GRAMMAR_SIGILS })
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const controller = React.useSyncExternalStore(
    subscribeXrNativeControllerDemo,
    readXrNativeControllerDemo,
    readXrNativeControllerDemo,
  )
  const physics = React.useSyncExternalStore(
    subscribeXrPhysicsRuntime,
    readXrPhysicsRuntime,
    readXrPhysicsRuntime,
  )
  const gameModeRuntime = React.useSyncExternalStore(
    subscribeGameModeSnapshot,
    readGameModeSnapshot,
    readGameModeSnapshot,
  )
  const gameMission = React.useSyncExternalStore(
    subscribeGameFpsSnapshot,
    readGameFpsSnapshot,
    readGameFpsSnapshot,
  )
  const selectedNodeId = useGraphStore(state => state.selectedNodeId)
  const targets = React.useMemo(inspectMotionControlTargets, [controller.revision, gameMission.revision, gameModeRuntime.revision, grammarCatalog.version, physics.revision, runtime.revision, selectedNodeId])
  const xr3d = targets.surfaces.xr3d
  const objectIdentification = xr3d.objectIdentification
  const selectedObject = objectIdentification.records.find(record => record.selected) || null
  const animation = targets.surfaces.animation
  const gameMode = targets.surfaces.gameMode
  const animationTarget = animation.selectedTarget
  const animationStatus = !animation.sceneReady
    ? 'Open or create a graph document to control XR animation.'
    : animationTarget.compatible
      ? `${animationTarget.label || animationTarget.actorId} · ${animationTarget.assignedPresetId
        ? (animationTarget.livePoseCompatible ? (livePoseActive ? 'live pose override' : 'authored animation + live pose ready') : 'authored animation ready · live pose unavailable')
        : `animation compatible · assign ${animationTarget.recommendedPresetId}${animationTarget.livePoseCompatible ? ' · live pose ready' : ' · live pose unavailable'}`}`
      : 'Select an animation-compatible cast target in 3D for XR or Animation.'
  const fineTunePhysics = React.useCallback(() => {
    onOpenTarget('xr-3d')
    requestXrSimulationWorkbenchOpen()
  }, [onOpenTarget])

  return (
    <section
      className="grid gap-2"
      aria-label="Motion Control XR targets"
      data-kg-motion-control-targets="shared-xr-owners"
      data-kg-motion-control-target-metadata-status={grammarCatalog.hydration.status}
      data-kg-motion-control-target-metadata-version={String(grammarCatalog.version)}
    >
      <article className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-motion-control-target="xr-3d">
        <header className="flex items-center gap-2">
          <Box className="size-4" aria-hidden="true" />
          <h3 className="text-[11px] font-semibold">3D for XR</h3>
          <button type="button" className="App-toolbar__btn ml-auto" onClick={() => onOpenTarget('xr-3d')} data-kg-motion-control-open-target="xr-3d">Open</button>
        </header>
        <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
          {xr3d.sceneReady
            ? `${objectIdentification.counts.total} identified · ${objectIdentification.counts.physicsAttached} physics bodies · controller ${xr3d.controllerPhase} (${xr3d.controllerMode})`
            : 'Open or create a graph document to control the XR scene.'}
        </p>
        <section className="grid gap-1" aria-label="Authored XR object identification" data-kg-motion-control-object-identification="scene-owned">
          <PanelField label="Placed object">
            <PanelSelect
              value={selectedObject?.id || ''}
              disabled={!objectIdentification.records.length}
              onChange={event => {
                const targetId = event.currentTarget.value
                const result = controlXrSharedAssetControls({ operation: 'select-target', targetId })
                if (!result.ok) selectBoundXrShotTarget(targetId)
              }}
              data-kg-motion-control-object-selector="1"
            >
              {!selectedObject ? <option value="">Select an authored XR object</option> : null}
              {objectIdentification.records.map(record => (
                <option key={record.id} value={record.id}>
                  {record.label} · {record.assetLabel} · {record.physicsBodyAttached ? record.physicsBodyMode : 'no physics body'}
                </option>
              ))}
            </PanelSelect>
          </PanelField>
          {selectedObject ? (
            <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)} data-kg-motion-control-selected-object={selectedObject.id}>
              {selectedObject.category} · catalog size {selectedObject.catalogDimensionsMeters.join(' × ')} m · {selectedObject.physicsBodyAttached ? `${selectedObject.physicsBodyMode} body` : 'physics not attached'}
            </p>
          ) : null}
          <button
            type="button"
            className="App-toolbar__btn justify-self-start"
            disabled={!xr3d.sceneReady || !selectedObject}
            onClick={fineTunePhysics}
            data-kg-motion-control-fine-tune-physics="canonical-workbench"
          >
            Fine-tune physics
          </button>
        </section>
        <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Live pose feeds the selected XR humanoid and the native physics controller without writing camera frames or pose history.</p>
        <TargetInvocation invocation={xr3d.invocation} />
        <p className={cn('truncate text-[9px]', UI_THEME_TOKENS.text.tertiary)}>WebMCP · {xr3d.webMcpTool}</p>
      </article>

      <article className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-motion-control-target="animation">
        <header className="flex items-center gap-2">
          <Clapperboard className="size-4" aria-hidden="true" />
          <h3 className="text-[11px] font-semibold">Animation</h3>
          <button type="button" className="App-toolbar__btn ml-auto" onClick={() => onOpenTarget('animation')} data-kg-motion-control-open-target="animation">Open</button>
        </header>
        <p className={cn('text-[10px]', animation.sceneReady && animationTarget.compatible ? UI_THEME_TOKENS.text.secondary : UI_THEME_TOKENS.status.warning)}>{animationStatus}</p>
        <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Vehicles, props, and other compatible assets retain authored motion. Live pose overrides only a selected compatible humanoid; assigned presets and path marks resume after Stop.</p>
        <TargetInvocation invocation={animation.invocation} />
        <p className={cn('truncate text-[9px]', UI_THEME_TOKENS.text.tertiary)}>WebMCP · {animation.webMcpTool}</p>
      </article>

      <XrSharedAssetControls surface="motion-control" />

      <article className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-motion-control-target="game-mode">
        <header className="flex items-center gap-2">
          <Gamepad2 className="size-4" aria-hidden="true" />
          <h3 className="text-[11px] font-semibold">Game Mode</h3>
          <button type="button" className="App-toolbar__btn ml-auto" onClick={() => onOpenTarget('game-mode')} data-kg-motion-control-open-target="game-mode">Open</button>
        </header>
        <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
          {gameMode.active
            ? `${gameMode.phase} · ${gameMode.simulationStatus} · ${gameMode.enemiesAlive} NPC remaining · ${gameMode.surfaceMode}`
            : 'Open the deterministic ECS mission inside the shared XR Canvas.'}
        </p>
        <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>The authored XR scene stays visible and paused under gameplay. The existing pose adapter arms movement, sprint, and rising-edge fire without adding another camera or inference pipeline.</p>
        <TargetInvocation invocation={gameMode.invocation} />
        <p className={cn('truncate text-[9px]', UI_THEME_TOKENS.text.tertiary)}>WebMCP · {gameMode.webMcpTool}</p>
      </article>
    </section>
  )
})
