import React from 'react'
import { Clapperboard, MapPin, Video } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { readStrybldrCameraSettings } from './strybldrCamera'
import { formatCameraOptics } from './cameraOptics'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
  subscribeCameraFramingRuntime,
} from './cameraFramingRuntime'
import {
  XR_MOTION_REFERENCE_CAMERA_RIGS,
  type XrMotionReferenceCameraRig,
} from '@/features/three/xrMotionReferenceModel'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'
import {
  readXrMotionReferenceRuntime,
  setXrMotionReferenceCameraMark,
  setXrMotionReferenceCameraRig,
  setXrMotionReferenceCastMarkArmed,
  subscribeXrMotionReferenceRuntime,
  toggleXrMotionReferenceCastMarkArmed,
} from '@/features/three/xrMotionReferenceRuntime'
import { selectBoundXrShotTarget } from '@/features/three/xrSelectedActorBinding'
import { buildXrShotTargets } from '@/features/three/xrShotTargets'
import { XrCameraMovePresetControl } from './XrCameraMovePresetControl'
import {
  XR_NATIVE_CONTROLLER_CAMERA_MODES,
  resolveXrNativeControllerCameraOption,
  type XrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraCatalog'
import {
  readXrNativeControllerCamera,
  selectXrNativeControllerCameraMode,
  subscribeXrNativeControllerCamera,
} from '@/features/three/xrNativeControllerCameraRuntime'

const RIG_LABELS: Readonly<Record<XrMotionReferenceCameraRig, string>> = {
  dolly: 'Dolly',
  steadicam: 'Steadicam',
  handheld: 'Handheld',
  crane: 'Crane',
  drone: 'Drone',
  'car-mount': 'Car-mount',
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export function XrShootCameraSection() {
  const { xrActive, pushUiToast, timelinePlaying } = useGraphStore(useShallow(state => ({
    xrActive: state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr',
    pushUiToast: state.pushUiToast,
    timelinePlaying: state.timelineTransportPlaying,
  })))
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const nativeController = React.useSyncExternalStore(
    subscribeXrNativeControllerCamera,
    readXrNativeControllerCamera,
    readXrNativeControllerCamera,
  )
  const shotTargets = React.useMemo(() => buildXrShotTargets(runtime.plan), [runtime.plan])
  const selectedShotTarget = shotTargets.find(target => target.id === runtime.selectedShotTargetId)
    || shotTargets[0]
    || null
  const selectedTrack = selectedShotTarget?.castActorId
    ? runtime.plan.cast.find(track => track.actorId === selectedShotTarget.castActorId) || null
    : null
  const cameraPlaybackActive = xrActive && timelinePlaying && runtime.plan.camera.length > 0
  const framing = React.useSyncExternalStore(
    subscribeCameraFramingRuntime,
    readCameraFramingRuntime,
    readCameraFramingRuntime,
  )

  React.useEffect(() => {
    if (!xrActive) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return
      if (event.key.toLowerCase() === 'm' && selectedTrack) {
        event.preventDefault()
        toggleXrMotionReferenceCastMarkArmed()
      } else if (event.key === 'Escape' && runtime.castMarkArmed) {
        setXrMotionReferenceCastMarkArmed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runtime.castMarkArmed, selectedTrack, xrActive])

  const publishShotFraming = React.useCallback((settingsValue: unknown) => {
    if (!selectedShotTarget || cameraPlaybackActive) return
    publishCameraFramingRuntime({
      anchorId: selectedShotTarget.id,
      settings: readStrybldrCameraSettings(settingsValue),
      source: 'panel',
    })
  }, [cameraPlaybackActive, selectedShotTarget])

  const autoFrameMedium = React.useCallback(() => {
    if (!selectedShotTarget) return
    const current = readCameraFramingRuntime()
    publishShotFraming({ ...current.settings, shot: 'medium' })
    pushUiToast({
      id: 'xr:shoot:medium-shot',
      kind: 'success',
      message: `MS framed ${selectedShotTarget.label} at ${current.settings.focalLengthMm}mm.`,
    })
  }, [publishShotFraming, pushUiToast, selectedShotTarget])

  const dropCameraMark = React.useCallback(() => {
    if (!selectedShotTarget) return
    const current = readCameraFramingRuntime()
    setXrMotionReferenceCameraMark({
      timeSeconds: runtime.playheadSeconds,
      anchorId: selectedShotTarget.id,
      rig: runtime.selectedCameraRig,
      settings: { ...current.settings },
    })
    pushUiToast({
      id: 'xr:shoot:camera-mark',
      kind: 'success',
      message: `Camera mark ${readXrMotionReferenceRuntime().plan.camera.length} linked to ${selectedShotTarget.label} at ${runtime.playheadSeconds.toFixed(2)}s.`,
    })
  }, [pushUiToast, runtime.playheadSeconds, runtime.selectedCameraRig, selectedShotTarget])

  const selectCameraSource = React.useCallback((mode: XrNativeControllerCameraMode) => {
    selectXrNativeControllerCameraMode(mode)
    pushUiToast({
      id: 'xr:shoot:camera-source',
      kind: 'success',
      message: `XR camera source: ${resolveXrNativeControllerCameraOption(mode).label}.`,
    })
  }, [pushUiToast])

  if (!xrActive) return null

  return (
    <section
      className={cn('mb-2 grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.headerBg)}
      aria-label="XR SHOOT"
      data-kg-xr-shoot-panel="1"
      data-kg-xr-shoot-mark-armed={runtime.castMarkArmed ? '1' : '0'}
    >
      <header className="flex items-start justify-between gap-2">
        <section className="flex min-w-0 items-center gap-2">
          <Clapperboard className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
          <section>
            <h3 className="text-xs font-black tracking-[0.16em]">SHOOT</h3>
            <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Scene/object links, cast marks, rig, camera track.</p>
          </section>
        </section>
        <output className={cn('text-right text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
          {runtime.playheadSeconds.toFixed(2)}s<br />{runtime.plan.camera.length} camera marks
        </output>
      </header>

      <label className="grid gap-1 text-[10px]">
        <span className={UI_THEME_TOKENS.text.tertiary}>Camera source</span>
        <PanelSelect
          aria-label="XR camera source"
          value={nativeController.mode}
          onChange={event => selectCameraSource(event.target.value as XrNativeControllerCameraMode)}
          data-kg-xr-camera-source="1"
        >
          {XR_NATIVE_CONTROLLER_CAMERA_MODES.map(mode => (
            <option key={mode} value={mode}>{resolveXrNativeControllerCameraOption(mode).label}</option>
          ))}
        </PanelSelect>
        <span className={UI_THEME_TOKENS.text.tertiary} data-kg-xr-camera-source-status={nativeController.mode}>
          {resolveXrNativeControllerCameraOption(nativeController.mode).description}
        </span>
      </label>

      <label className="grid gap-1 text-[10px]">
        <span className={UI_THEME_TOKENS.text.tertiary}>Shot target</span>
        <PanelSelect
          aria-label="SHOOT scene or 3D object target"
          value={selectedShotTarget?.id || ''}
          disabled={!selectedShotTarget}
          onChange={event => selectBoundXrShotTarget(event.target.value)}
          data-kg-xr-shoot-target="scene-or-object"
        >
          {shotTargets.map(target => (
            <option key={target.id} value={target.id}>
              {target.kind === 'scene' ? 'SCENE' : '3D OBJECT'} · {target.label}
            </option>
          ))}
        </PanelSelect>
      </label>

      <button
        type="button"
        className={cn('App-toolbar__btn flex w-full items-center justify-center gap-2', uiSelectedRowStateClassName(runtime.castMarkArmed))}
        aria-pressed={runtime.castMarkArmed}
        disabled={!selectedTrack}
        onClick={() => toggleXrMotionReferenceCastMarkArmed()}
        data-kg-xr-shoot-cast-mark="1"
      >
        <MapPin className="size-3.5" aria-hidden />
        <kbd className="rounded border px-1 text-[9px]">M</kbd>
        {runtime.castMarkArmed ? 'Click the XR floor' : 'Place cast marks'}
      </button>
      <p className={cn('m-0 text-[10px]', runtime.castMarkArmed ? 'text-emerald-600 dark:text-emerald-300' : UI_THEME_TOKENS.text.tertiary)} aria-live="polite">
        {selectedTrack
          ? `${selectedTrack.label} · ${selectedTrack.marks.length} numbered mark${selectedTrack.marks.length === 1 ? '' : 's'}${runtime.castMarkArmed ? ' · placement armed; Esc cancels' : ''}`
          : `${selectedShotTarget?.label || 'Scene'} · camera target only; select a mobile 3D Object to place cast marks.`}
      </p>

      <section className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-2">
        <label className="grid gap-1 text-[10px]">
          <span className={UI_THEME_TOKENS.text.tertiary}>Rig</span>
          <PanelSelect
            aria-label="SHOOT camera rig"
            value={runtime.selectedCameraRig}
            onChange={event => setXrMotionReferenceCameraRig(event.target.value as XrMotionReferenceCameraRig)}
            data-kg-xr-shoot-rig="1"
          >
            {XR_MOTION_REFERENCE_CAMERA_RIGS.map(rig => <option key={rig} value={rig}>{RIG_LABELS[rig]}</option>)}
          </PanelSelect>
        </label>
        <section className="grid gap-1 text-[10px]" aria-label="SHOOT camera optics projection" data-kg-camera-optics-projection="xr-shoot">
          <span className={UI_THEME_TOKENS.text.tertiary}>Optics · edit in Camera</span>
          <output className={cn('min-w-0 rounded border px-2 py-1.5 font-semibold', UI_THEME_TOKENS.panel.border)}>
            {formatCameraOptics(framing.settings)}
          </output>
        </section>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button type="button" className="App-toolbar__btn font-bold" disabled={!selectedShotTarget || cameraPlaybackActive || nativeController.mode === 'fixed-follow'} onClick={autoFrameMedium} data-kg-xr-shoot-medium-shot="1">
          MS · Medium shot
        </button>
        <button type="button" className="App-toolbar__btn flex items-center justify-center gap-1 font-bold" disabled={!selectedShotTarget || cameraPlaybackActive} onClick={dropCameraMark} data-kg-xr-shoot-camera-mark="1">
          <Video className="size-3.5" aria-hidden />
          Drop camera mark
        </button>
      </section>

      <XrCameraMovePresetControl
        anchorId={selectedShotTarget?.id || ''}
        anchorLabel={selectedShotTarget?.label || ''}
        disabled={!selectedShotTarget || cameraPlaybackActive}
      />
    </section>
  )
}
