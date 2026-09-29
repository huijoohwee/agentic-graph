import React from 'react'
import { Orbit } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  XR_CAMERA_MOVE_PRESETS,
  resolveXrCameraMovePreset,
  type XrCameraMovePresetId,
} from '@/features/three/xrCameraMoveCatalog'
import { applyXrCameraMove } from '@/features/three/xrCameraMoveRuntime'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  readCameraFramingRuntime,
  subscribeCameraFramingRuntime,
} from './cameraFramingRuntime'

export function XrCameraMovePresetControl({
  anchorId,
  anchorLabel,
  disabled,
}: {
  anchorId: string
  anchorLabel: string
  disabled: boolean
}) {
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const [moveId, setMoveId] = React.useState<XrCameraMovePresetId>('orbit-clockwise')
  const [moveDurationSeconds, setMoveDurationSeconds] = React.useState(3)
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const framing = React.useSyncExternalStore(
    subscribeCameraFramingRuntime,
    readCameraFramingRuntime,
    readCameraFramingRuntime,
  )
  const preset = resolveXrCameraMovePreset(moveId)

  const applyMove = React.useCallback(() => {
    const result = applyXrCameraMove({
      moveId,
      anchorId,
      playheadSeconds: runtime.playheadSeconds,
      moveDurationSeconds,
      settings: framing.settings,
    })
    if (!result.applied) {
      pushUiToast({ id: 'xr:camera-move:blocked', kind: 'error', message: result.message })
      return
    }
    const state = useGraphStore.getState()
    state.setBottomSurfaceTab('timeline')
    state.setBottomSurfaceCollapsed(false)
    pushUiToast({
      id: 'xr:camera-move:applied',
      kind: 'success',
      message: `${preset.label} follows ${anchorLabel}; BottomPanel Timeline owns the new marks.`,
    })
  }, [anchorId, anchorLabel, framing.settings, moveDurationSeconds, moveId, preset.label, pushUiToast, runtime.playheadSeconds])

  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="Scene or object-bound Camera moves"
      data-kg-xr-camera-move-controls="floating-camera-only"
      data-kg-xr-camera-move-timeline-owner="bottom-panel"
    >
      <header className="flex items-start gap-2">
        <Orbit className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden />
        <section className="min-w-0">
          <h4 className="text-xs font-bold uppercase tracking-normal">Camera moves</h4>
          <p className={cn('m-0 text-xs', UI_THEME_TOKENS.text.tertiary)}>Target-bound presets author linked marks in the shared Camera lane.</p>
        </section>
      </header>
      <section className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
        <label className="grid gap-1 text-xs">
          <span className={UI_THEME_TOKENS.text.tertiary}>Move</span>
          <PanelSelect
            aria-label="Camera move preset"
            value={moveId}
            disabled={disabled}
            onValueChange={selectedValueInput => {
              const nextMoveId = selectedValueInput as XrCameraMovePresetId
              setMoveId(nextMoveId)
              setMoveDurationSeconds(resolveXrCameraMovePreset(nextMoveId).defaultDurationSeconds)
            }}
            data-kg-xr-camera-move-select="1"
          >
            {XR_CAMERA_MOVE_PRESETS.map(move => <option key={move.id} value={move.id}>{move.label}</option>)}
          </PanelSelect>
        </label>
        <label className="grid gap-1 text-xs">
          <span className={UI_THEME_TOKENS.text.tertiary}>Seconds</span>
          <PanelTextInput
            aria-label="Camera move duration seconds"
            type="number"
            min={0.25}
            max={runtime.plan.durationSeconds}
            step={0.25}
            value={moveDurationSeconds}
            disabled={disabled}
            onChange={event => setMoveDurationSeconds(Number(event.target.value))}
            data-kg-xr-camera-move-duration="1"
          />
        </label>
      </section>
      <p className={cn('m-0 text-xs', UI_THEME_TOKENS.text.secondary)}>{preset.description}</p>
      <button
        type="button"
        className="App-toolbar__btn font-bold"
        disabled={disabled || !anchorId}
        onClick={applyMove}
        data-kg-xr-camera-move-apply="1"
      >
        Apply to {anchorLabel || 'selected subject'}
      </button>
    </section>
  )
}
