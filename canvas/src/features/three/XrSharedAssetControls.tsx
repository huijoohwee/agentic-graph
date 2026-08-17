import React from 'react'
import { Clapperboard, Eraser, Hand, MapPin, Pause, Play, Target } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { XR_ANIMATION_PRESETS, type XrAnimationPresetId } from './xrAnimationCatalog'
import {
  controlXrSharedAssetControls,
  inspectXrSharedAssetControls,
  type XrSharedAssetControlOperation,
  type XrSharedAssetControlSurface,
} from './xrSharedAssetControlRuntime'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import {
  readMotionControlSnapshot,
  subscribeMotionControl,
} from './motionControlRuntime'

type XrSharedAssetControlsProps = Readonly<{
  embedded?: boolean
  surface: XrSharedAssetControlSurface
}>

function presetLabel(presetId: string): string {
  return XR_ANIMATION_PRESETS.find(preset => preset.id === presetId)?.label || presetId || 'Animation'
}

export function XrSharedAssetControls({ embedded = false, surface }: XrSharedAssetControlsProps) {
  React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const motionControl = React.useSyncExternalStore(
    subscribeMotionControl,
    readMotionControlSnapshot,
    readMotionControlSnapshot,
  )
  useGraphStore(state => state.timelineTransportPlaying)
  useGraphStore(state => state.timelineTransportDocumentKey)
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const snapshot = inspectXrSharedAssetControls()
  const [presetId, setPresetId] = React.useState<XrAnimationPresetId | ''>(
    snapshot.assignedPresetId || snapshot.recommendedPresetId,
  )

  React.useEffect(() => {
    const nextPresetId = snapshot.assignedPresetId || snapshot.recommendedPresetId
    if (nextPresetId) setPresetId(nextPresetId)
  }, [snapshot.assignedPresetId, snapshot.recommendedPresetId])

  const run = React.useCallback((operation: XrSharedAssetControlOperation, options: { presetId?: string; targetId?: string; timeSeconds?: number } = {}) => {
    const result = controlXrSharedAssetControls({ operation, ...options })
    pushUiToast({
      id: `xr:shared-asset:${surface}:${operation}:${result.ok ? 'ok' : 'error'}`,
      kind: result.ok ? 'success' : snapshot.sceneReady ? 'error' : 'warning',
      message: result.message,
    })
    return result
  }, [pushUiToast, snapshot.sceneReady, surface])

  const compatiblePresets = XR_ANIMATION_PRESETS.filter(preset => snapshot.compatiblePresetIds.includes(preset.id))
  const targetOptions = snapshot.targets.filter(target => target.kind === 'object' && target.castActorId)
  const selectedPreset = presetId || snapshot.assignedPresetId || snapshot.recommendedPresetId
  const targetReady = Boolean(snapshot.sceneReady && snapshot.selectedActorId)
  const canApply = Boolean(targetReady && selectedPreset)
  const canClear = Boolean(targetReady && snapshot.assignedPresetId)
  const canCaptureHandPose = Boolean(targetReady && snapshot.selectedMarkId && motionControl.pose)
  const gameModeOwnsPlayback = surface === 'game-mode'
  const status = snapshot.assignedPresetId
    ? `${snapshot.selectedLabel} · ${presetLabel(snapshot.assignedPresetId)}`
    : targetReady
      ? `${snapshot.selectedLabel} · ${snapshot.livePoseActive ? 'live hand pose' : snapshot.livePoseEligible ? 'hand pose ready' : 'animation ready'}`
      : 'Select a 3D for XR object'

  return (
    <section
      className={cn(
        embedded ? 'grid gap-2' : 'grid gap-2 rounded border p-2',
        !embedded ? `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}` : '',
      )}
      aria-label="Shared 3D for XR asset controls"
      data-kg-xr-shared-asset-controls={surface}
      data-kg-xr-shared-asset-schema={snapshot.schema}
      data-kg-xr-shared-asset-scene-ready={snapshot.sceneReady ? '1' : '0'}
      data-kg-xr-shared-asset-target={snapshot.selectedActorId || snapshot.selectedTargetId}
      data-kg-xr-shared-asset-hand-pose={snapshot.livePoseActive ? 'live' : snapshot.livePoseEligible ? 'eligible' : 'unavailable'}
      data-kg-xr-shared-asset-gesture-armed={snapshot.castMarkArmed ? '1' : '0'}
      data-kg-xr-shared-asset-timeline-playing={snapshot.timelinePlaying ? '1' : '0'}
    >
      <header className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1 text-[11px] font-semibold">
          <Target className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">XR Asset Control</span>
        </h3>
        <output className={cn('truncate text-[9px]', UI_THEME_TOKENS.text.tertiary)}>{status}</output>
      </header>
      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1">
        <label className="grid min-w-0 gap-0.5 text-[9px]">
          <span className={UI_THEME_TOKENS.text.tertiary}>3D target</span>
          <PanelSelect
            value={snapshot.selectedActorId || snapshot.selectedTargetId}
            disabled={!targetOptions.length}
            onChange={event => run('select-target', { targetId: event.currentTarget.value })}
            aria-label="Shared 3D for XR object target"
            data-kg-xr-shared-asset-target-selector={surface}
          >
            {!targetOptions.length ? <option value="">No 3D targets</option> : null}
            {targetOptions.map(target => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
          </PanelSelect>
        </label>
        <label className="grid min-w-0 gap-0.5 text-[9px]">
          <span className={UI_THEME_TOKENS.text.tertiary}>Motion</span>
          <PanelSelect
            value={selectedPreset}
            disabled={!compatiblePresets.length}
            onChange={event => setPresetId(event.currentTarget.value as XrAnimationPresetId)}
            aria-label="Shared 3D for XR animation preset"
            data-kg-xr-shared-asset-preset-selector={surface}
          >
            {!compatiblePresets.length ? <option value="">No compatible motion</option> : null}
            {compatiblePresets.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </PanelSelect>
        </label>
      </section>
      <section className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Shared XR asset actions">
        <button
          type="button"
          className="App-toolbar__btn"
          disabled={!canApply}
          onClick={() => run('apply-animation', { presetId: selectedPreset })}
          title="Apply animation to the selected 3D for XR target"
          data-kg-xr-shared-asset-animate={surface}
        >
          <Clapperboard className="size-3.5" aria-hidden /> Animate
        </button>
        <button
          type="button"
          className="App-toolbar__btn"
          disabled={!canClear}
          onClick={() => run('clear-animation')}
          title="Clear animation from the selected 3D for XR target"
          data-kg-xr-shared-asset-clear-animation={surface}
        >
          <Eraser className="size-3.5" aria-hidden /> Clear
        </button>
        <button
          type="button"
          className={cn('App-toolbar__btn', snapshot.castMarkArmed ? UI_THEME_TOKENS.button.activeBg : '')}
          disabled={!targetReady}
          aria-pressed={snapshot.castMarkArmed}
          onClick={() => run(snapshot.castMarkArmed ? 'disarm-gesture-mark' : 'arm-gesture-mark')}
          title="Arm the selected target for gesture or canvas mark capture"
          data-kg-xr-shared-asset-gesture-mark={surface}
        >
          <MapPin className="size-3.5" aria-hidden /> Mark
        </button>
        <button
          type="button"
          className="App-toolbar__btn"
          disabled={!canCaptureHandPose}
          onClick={() => run('capture-hand-pose')}
          title="Write the current hand pose into the selected cast mark"
          data-kg-xr-shared-asset-hand-keyframe={surface}
        >
          <Hand className="size-3.5" aria-hidden /> Hand
        </button>
        <button
          type="button"
          className="App-toolbar__btn ml-auto"
          disabled={!snapshot.sceneReady || gameModeOwnsPlayback}
          onClick={() => run(snapshot.timelinePlaying ? 'pause-timeline' : 'play-timeline')}
          title={gameModeOwnsPlayback ? 'Use the BottomPanel Timeline while Game Mode owns gameplay playback.' : snapshot.timelinePlaying ? 'Pause the XR timeline' : 'Play the XR timeline'}
          data-kg-xr-shared-asset-playback={surface}
          data-kg-xr-shared-asset-playback-owner={gameModeOwnsPlayback ? 'bottom-panel-timeline' : surface}
        >
          {snapshot.timelinePlaying ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {snapshot.timelinePlaying ? 'Pause' : 'Play'}
        </button>
      </section>
    </section>
  )
}
