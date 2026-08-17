import React from 'react'
import { Clapperboard, Eraser, Hand, MapPin, Pause, Play, Trash2 } from 'lucide-react'
import { TimelineTransportTimeAxisMark } from '@/components/timeline/TimelineTransportControls'
import { resolveVideoSequenceRulerInsetLeft, resolveVideoSequenceRulerInsetPixelMetrics } from '@/components/timeline/videoSequenceTimelineRulerGeometry'
import { resolveVideoSequenceTimelineScaleDurationSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XR_MOTION_REFERENCE_SELECTION_COLOR } from './xrMotionReferenceModel'
import { XR_ANIMATION_PRESETS, xrAnimationPresetCompatible, type XrAnimationPreset } from './xrAnimationCatalog'
import { resolveXrCameraMoveLabel } from './xrCameraMoveCatalog'
import {
  readXrMotionReferenceRuntime,
  removeXrMotionReferenceCameraMark,
  removeXrMotionReferenceCastMark,
  retimeXrMotionReferenceCameraMark,
  retimeXrMotionReferenceCastMark,
  selectXrMotionReferenceCameraMark,
  selectXrMotionReferenceCastMark,
  setXrMotionReferenceCameraMarkChoreography,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import { readBoundXrSelectedActorId } from './xrSelectedActorBinding'
import { resolveXrChoreographySpeedWarnings } from './xrChoreographyDiagnostics'
import { XrChoreographyMarkControls } from './XrChoreographyMarkControls'
import { applyXrConstrainedCastMarkChoreography } from './xrConstrainedCastMarkRuntime'
import { controlXrSharedAssetControls, type XrSharedAssetControlOperation } from './xrSharedAssetControlRuntime'
import { buildXrShotTargets } from './xrShotTargets'
import { readMotionControlSnapshot, subscribeMotionControl } from './motionControlRuntime'
import { xrMotionReferenceTimelineDocumentKey } from './xrMotionReferenceTimeline'
import { formatCameraOptics } from '@/features/strybldr/cameraOptics'
import './CameraMotionMarkRetime.css'

function TimeEditor({
  label,
  value,
  max,
  onChange,
  compact = false,
}: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
  compact?: boolean
}) {
  return (
    <PanelTextInput
      className={compact ? 'h-5 w-12 px-1 py-0 text-[9px]' : 'h-6 w-16 px-1 text-[10px]'}
      aria-label={label}
      type="number"
      min={0}
      max={max}
      step={0.05}
      value={value}
      onKeyDown={event => event.stopPropagation()}
      onChange={event => onChange(Number(event.target.value))}
    />
  )
}

function selectMarkOnKeyDown(event: React.KeyboardEvent<HTMLElement>, selectMark: () => void): void {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  selectMark()
}

function markAxisStyle(timeSeconds: number, scaleDurationSeconds: number): React.CSSProperties {
  const percent = scaleDurationSeconds > 0
    ? Math.min(100, Math.max(0, (timeSeconds / scaleDurationSeconds) * 100))
    : 0
  return { '--kg-xr-retime-mark-left': resolveVideoSequenceRulerInsetLeft(percent) } as React.CSSProperties
}

function markEditorAxisStyle(timeSeconds: number, scaleDurationSeconds: number): React.CSSProperties {
  const placeBeforeMark = scaleDurationSeconds > 0 && timeSeconds / scaleDurationSeconds > 0.58
  return {
    ...markAxisStyle(timeSeconds, scaleDurationSeconds),
    '--kg-xr-mark-editor-translate-x': placeBeforeMark ? 'calc(-100% - 12px)' : '12px',
  } as React.CSSProperties
}

function beginRulerMarkDrag(
  event: React.PointerEvent<HTMLElement>,
  scaleDurationSeconds: number,
  selectMark: () => void,
  retimeMark: (value: number) => void,
): void {
  const axis = event.currentTarget.closest<HTMLElement>('[data-kg-xr-choreography-lane-axis="1"]')
    || document.querySelector<HTMLElement>('[data-kg-video-sequence-ruler-axis="1"]')
  if (!axis) return
  event.preventDefault()
  event.stopPropagation()
  selectMark()
  const update = (clientX: number) => {
    const rect = axis.getBoundingClientRect()
    const metrics = resolveVideoSequenceRulerInsetPixelMetrics(rect.width)
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - metrics.insetLeftPx) / metrics.widthPx))
    retimeMark(Math.round(ratio * scaleDurationSeconds * 20) / 20)
  }
  const move = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault()
    update(moveEvent.clientX)
  }
  const finish = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}

export type CameraMotionTimelineLaneTarget = { actorId: string; kind: 'cast' } | { kind: 'camera' }

export function CameraMotionMarkRetime({
  laneTarget,
  layout = 'panel',
}: {
  laneTarget?: CameraMotionTimelineLaneTarget
  layout?: 'lane' | 'panel'
}) {
  useGraphStore(state => state.selectedNodeId)
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const timelineTransportDocumentKey = useGraphStore(state => state.timelineTransportDocumentKey)
  const timelineTransportPlaying = useGraphStore(state => state.timelineTransportPlaying)
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const motionControl = React.useSyncExternalStore(
    subscribeMotionControl,
    readMotionControlSnapshot,
    readMotionControlSnapshot,
  )
  const selectedActorId = readBoundXrSelectedActorId()
  const shotTargetLabelById = React.useMemo(
    () => new Map(buildXrShotTargets(runtime.plan).map(target => [target.id, target.label])),
    [runtime.plan],
  )
  const selectedTrack = runtime.plan.cast.find(track => track.actorId === selectedActorId)
    || runtime.plan.cast[0]
    || null
  const scaleDurationSeconds = resolveVideoSequenceTimelineScaleDurationSeconds(runtime.plan.durationSeconds)
  const warnings = React.useMemo(() => resolveXrChoreographySpeedWarnings(runtime.plan), [runtime.plan])
  const selectedRuntimeMark = runtime.selectedMark
  const selectedCameraMark = selectedRuntimeMark?.kind === 'camera' ? runtime.plan.camera.find(mark => selectedRuntimeMark.markId === mark.id) : undefined
  const selectedCastTrack = selectedRuntimeMark?.kind === 'cast'
    ? runtime.plan.cast.find(track => track.actorId === selectedRuntimeMark.actorId) || null
    : null
  const selectedCastMark = selectedCastTrack?.marks.find(mark => selectedRuntimeMark?.kind === 'cast' && selectedRuntimeMark.markId === mark.id) || null
  const selectedCastMarkIndex = selectedCastMark ? selectedCastTrack!.marks.findIndex(mark => mark.id === selectedCastMark.id) : -1
  const selectedCameraMarkIndex = selectedCameraMark ? runtime.plan.camera.findIndex(mark => mark.id === selectedCameraMark.id) : -1
  const selectedCastSubject = selectedCastTrack
    ? runtime.plan.subjects.find(subject => subject.id === selectedCastTrack.actorId) || null
    : null
  const selectedCastAnimationPresets = selectedCastTrack
    ? XR_ANIMATION_PRESETS.filter(preset => xrAnimationPresetCompatible({
      preset,
      assetId: selectedCastSubject?.assetId,
      category: selectedCastSubject?.category,
      graphActor: !selectedCastSubject,
    }))
    : []
  const applySelectedCastAnimationPreset = React.useCallback((preset: XrAnimationPreset) => {
    if (!selectedCastTrack) return
    const result = controlXrSharedAssetControls({
      operation: 'apply-animation',
      presetId: preset.id,
      targetId: selectedCastTrack.actorId,
    })
    pushUiToast({
      id: `xr:mark-animation:${selectedCastTrack.actorId}:${preset.id}:${result.ok ? 'ok' : 'error'}`,
      kind: result.ok ? 'success' : 'error',
      message: result.message,
    })
  }, [pushUiToast, selectedCastTrack])
  const selectedCastTimelinePlaying = timelineTransportDocumentKey === xrMotionReferenceTimelineDocumentKey(markdownDocumentName)
    && timelineTransportPlaying === true
  const runSelectedCastSharedAssetAction = React.useCallback((operation: XrSharedAssetControlOperation, options: { presetId?: string } = {}) => {
    if (!selectedCastTrack) return
    const result = controlXrSharedAssetControls({
      operation,
      targetId: selectedCastTrack.actorId,
      ...options,
    })
    pushUiToast({
      id: `xr:individual-asset:${selectedCastTrack.actorId}:${operation}:${result.ok ? 'ok' : 'error'}`,
      kind: result.ok ? 'success' : 'error',
      message: result.message,
    })
  }, [pushUiToast, selectedCastTrack])
  const renderSelectedCastAnimationPresets = () => {
    if (!selectedCastTrack || !selectedCastMark) return null
    const activePresetId = selectedCastTrack.animation?.presetId || ''
    const selectedPresetId = selectedCastAnimationPresets.some(preset => preset.id === activePresetId)
      ? activePresetId
      : ''
    return (
      <label
        className="xr-camera-motion-mark-animation-presets"
        aria-label="XR animation presets for selected choreography mark"
        data-kg-xr-mark-animation-presets="click-appear"
        data-kg-xr-mark-animation-mark={selectedCastMark.id}
        data-kg-xr-mark-animation-target={selectedCastTrack.actorId}
      >
        <PanelSelect
          className="h-5 w-[118px] px-1 py-0 text-[9px]"
          aria-label="XR animation preset"
          title={`Apply an XR animation preset to ${selectedCastTrack.label}`}
          value={selectedPresetId}
          disabled={!selectedCastAnimationPresets.length}
          onKeyDown={event => event.stopPropagation()}
          onChange={event => {
            const preset = selectedCastAnimationPresets.find(candidate => candidate.id === event.target.value)
            if (preset) applySelectedCastAnimationPreset(preset)
          }}
          data-kg-xr-mark-animation-preset-select={selectedCastMark.id}
        >
          <option value="">{selectedCastAnimationPresets.length ? 'Animation' : 'No presets'}</option>
          {selectedCastAnimationPresets.map(preset => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </PanelSelect>
      </label>
    )
  }
  const renderSelectedCastAssetActions = () => {
    if (!selectedCastTrack || !selectedCastMark) return null
    const activeAnimationPresetId = selectedCastTrack.animation?.presetId || ''
    const actionPresetId = selectedCastAnimationPresets.some(preset => preset.id === activeAnimationPresetId)
      ? activeAnimationPresetId
      : selectedCastAnimationPresets[0]?.id || ''
    const canApply = Boolean(actionPresetId)
    const canClear = Boolean(selectedCastTrack.animation)
    const canCaptureHandPose = Boolean(motionControl.pose)
    const actionButtonClass = 'App-toolbar__btn size-5 justify-center p-0'
    const actionIconClass = 'size-3'
    return (
      <section
        className="xr-camera-motion-mark-asset-actions"
        aria-label="Individual XR asset lane actions"
        data-kg-xr-shared-asset-actions="individual-lane"
        data-kg-xr-shared-asset-action-cluster="individual-lane"
        data-kg-xr-shared-asset-target={selectedCastTrack.actorId}
      >
        <button type="button" className={actionButtonClass} disabled={!canApply} aria-label="Apply selected XR animation" onClick={() => runSelectedCastSharedAssetAction('apply-animation', { presetId: actionPresetId })} title="Apply animation to this 3D for XR lane" data-kg-xr-shared-asset-animate="individual-lane">
          <Clapperboard className={actionIconClass} aria-hidden />
        </button>
        <button type="button" className={actionButtonClass} disabled={!canClear} aria-label="Clear selected XR animation" onClick={() => runSelectedCastSharedAssetAction('clear-animation')} title="Clear animation from this 3D for XR lane" data-kg-xr-shared-asset-clear-animation="individual-lane">
          <Eraser className={actionIconClass} aria-hidden />
        </button>
        <button type="button" className={cn(actionButtonClass, runtime.castMarkArmed ? UI_THEME_TOKENS.button.activeBg : '')} aria-label={runtime.castMarkArmed ? 'Disarm gesture mark' : 'Arm gesture mark'} aria-pressed={runtime.castMarkArmed} onClick={() => runSelectedCastSharedAssetAction(runtime.castMarkArmed ? 'disarm-gesture-mark' : 'arm-gesture-mark')} title="Arm this lane for gesture or canvas mark capture" data-kg-xr-shared-asset-gesture-mark="individual-lane">
          <MapPin className={actionIconClass} aria-hidden />
        </button>
        <button type="button" className={actionButtonClass} disabled={!canCaptureHandPose} aria-label="Capture hand pose" onClick={() => runSelectedCastSharedAssetAction('capture-hand-pose')} title="Write the current hand pose into this selected mark" data-kg-xr-shared-asset-hand-keyframe="individual-lane">
          <Hand className={actionIconClass} aria-hidden />
        </button>
        <button type="button" className={actionButtonClass} aria-label={selectedCastTimelinePlaying ? 'Pause XR timeline' : 'Play XR timeline'} onClick={() => runSelectedCastSharedAssetAction(selectedCastTimelinePlaying ? 'pause-timeline' : 'play-timeline')} title={selectedCastTimelinePlaying ? 'Pause the XR timeline' : 'Play the XR timeline'} data-kg-xr-shared-asset-playback="individual-lane" data-kg-xr-shared-asset-playback-owner="individual-lane">
          {selectedCastTimelinePlaying ? <Pause className={actionIconClass} aria-hidden /> : <Play className={actionIconClass} aria-hidden />}
        </button>
      </section>
    )
  }
  const renderSelectedMarkControls = (timeSeconds: number) => (
    <section
      className="xr-camera-motion-mark-selection-controls xr-camera-motion-mark-selection-controls--lane"
      style={markEditorAxisStyle(timeSeconds, scaleDurationSeconds)}
      aria-label="Selected choreography mark controls"
      data-kg-xr-ruler-mark-editor={selectedCastMark ? 'cast' : 'camera'}
      data-kg-xr-lane-mark-editor="anchored"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <span className="xr-camera-motion-mark-selection-label">
        {selectedCastMark
          ? `${selectedCastTrack!.label} · ${selectedCastMarkIndex + 1}`
          : `Camera · C${selectedCameraMarkIndex + 1} · ${shotTargetLabelById.get(selectedCameraMark?.anchorId || '') || 'Unbound'} · ${selectedCameraMark ? formatCameraOptics(selectedCameraMark.settings) : ''}`}
      </span>
      {selectedCastMark ? (
        <>
          <TimeEditor compact label={`${selectedCastTrack!.label} mark ${selectedCastMarkIndex + 1} time`} value={selectedCastMark.timeSeconds} max={runtime.plan.durationSeconds} onChange={value => retimeXrMotionReferenceCastMark(selectedCastTrack!.actorId, selectedCastMark.id, value)} />
          <XrChoreographyMarkControls compact showPosition target={{ kind: 'cast', actorId: selectedCastTrack!.actorId, mark: selectedCastMark }} warning={warnings.find(warning => warning.targetKind === 'cast' && warning.fromMarkId === selectedCastMark.id)} onChange={update => update.kind === 'cast' && applyXrConstrainedCastMarkChoreography(update)} />
          {renderSelectedCastAnimationPresets()}
          {renderSelectedCastAssetActions()}
          <button type="button" className="App-toolbar__btn p-0.5" disabled={selectedCastTrack!.marks.length <= 1} aria-label={`Remove ${selectedCastTrack!.label} mark ${selectedCastMarkIndex + 1}`} onClick={() => removeXrMotionReferenceCastMark(selectedCastTrack!.actorId, selectedCastMark.id)}><Trash2 className="size-3" aria-hidden /></button>
        </>
      ) : selectedCameraMark ? (
        <>
          <TimeEditor compact label={`Camera mark ${selectedCameraMarkIndex + 1} time`} value={selectedCameraMark.timeSeconds} max={runtime.plan.durationSeconds} onChange={value => retimeXrMotionReferenceCameraMark(selectedCameraMark.id, value)} />
          <XrChoreographyMarkControls compact target={{ kind: 'camera', mark: selectedCameraMark }} warning={warnings.find(warning => warning.targetKind === 'camera' && warning.fromMarkId === selectedCameraMark.id)} onChange={update => update.easing && setXrMotionReferenceCameraMarkChoreography({ markId: update.markId, easing: update.easing })} />
          <button type="button" className="App-toolbar__btn p-0.5" aria-label={`Remove camera mark ${selectedCameraMarkIndex + 1}`} onClick={() => removeXrMotionReferenceCameraMark(selectedCameraMark.id)}><Trash2 className="size-3" aria-hidden /></button>
        </>
      ) : null}
    </section>
  )

  if (layout === 'lane' && laneTarget?.kind === 'cast') {
    const track = runtime.plan.cast.find(candidate => candidate.actorId === laneTarget.actorId)
    if (!track) return null
    return (
      <section
        className="xr-camera-motion-retime-lane xr-camera-motion-retime-lane--cast"
        aria-label={`${track.label} choreography lane`}
        data-kg-xr-timeline-retime="1"
        data-kg-xr-timeline-retime-layout={layout}
        data-kg-xr-timeline-retime-scale-seconds={scaleDurationSeconds}
        data-kg-xr-speed-warning-count={warnings.length}
        data-kg-xr-choreography-lane-axis="1"
        data-kg-xr-choreography-cast-lane={track.actorId}
      >
        {track.marks.map((mark, index) => {
          const selected = runtime.selectedMark?.kind === 'cast'
            && runtime.selectedMark.actorId === track.actorId
            && runtime.selectedMark.markId === mark.id
          const selectMark = () => selectXrMotionReferenceCastMark(track.actorId, mark.id)
          return (
            <TimelineTransportTimeAxisMark
              key={`${track.actorId}:${mark.id}`}
              laneStyle="video"
              className="xr-camera-motion-retime-lane-mark"
              style={{ ...markAxisStyle(mark.timeSeconds, scaleDurationSeconds), '--kg-xr-ruler-mark-color': track.color } as React.CSSProperties}
              title={`${track.label} · ${mark.timeSeconds}s · drag to retime`}
              aria-label={`${track.label} mark ${index + 1} at ${mark.timeSeconds} seconds`}
              aria-pressed={selected}
              role="button"
              tabIndex={0}
              onClick={event => { event.stopPropagation(); selectMark() }}
              onKeyDown={event => selectMarkOnKeyDown(event, selectMark)}
              onPointerDown={event => beginRulerMarkDrag(event, scaleDurationSeconds, selectMark, value => {
                const selection = readXrMotionReferenceRuntime().selectedMark
                const activeMarkId = selection?.kind === 'cast' && selection.actorId === track.actorId ? selection.markId : mark.id
                retimeXrMotionReferenceCastMark(track.actorId, activeMarkId, value)
              })}
              data-kg-xr-lane-cast-mark={index + 1}
              data-kg-xr-lane-mark-shape="circle-only"
              data-kg-xr-stage-highlight-target={selected ? 'cast-mark' : undefined}
            >
              <span style={{ backgroundColor: selected ? XR_MOTION_REFERENCE_SELECTION_COLOR : track.color }}>{index + 1}</span>
            </TimelineTransportTimeAxisMark>
          )
        })}
        {selectedCastTrack?.actorId === track.actorId && selectedCastMark ? renderSelectedMarkControls(selectedCastMark.timeSeconds) : null}
      </section>
    )
  }

  if (layout === 'lane' && laneTarget?.kind === 'camera') {
    return (
      <section
        className="xr-camera-motion-retime-lane xr-camera-motion-retime-lane--camera"
        aria-label="Camera choreography lane"
        data-kg-xr-timeline-retime="1"
        data-kg-xr-timeline-retime-layout={layout}
        data-kg-xr-timeline-retime-scale-seconds={scaleDurationSeconds}
        data-kg-xr-speed-warning-count={warnings.length}
        data-kg-xr-choreography-lane-axis="1"
        data-kg-xr-choreography-camera-lane="1"
      >
        {runtime.plan.camera.map((mark, index) => {
          const selected = runtime.selectedMark?.kind === 'camera' && runtime.selectedMark.markId === mark.id
          const targetLabel = shotTargetLabelById.get(mark.anchorId) || 'Unbound target'
          const selectMark = () => selectXrMotionReferenceCameraMark(mark.id)
          return (
            <TimelineTransportTimeAxisMark
              key={mark.id}
              laneStyle="audio"
              className="xr-camera-motion-retime-lane-mark xr-camera-motion-retime-lane-mark--camera"
              style={markAxisStyle(mark.timeSeconds, scaleDurationSeconds)}
              title={`${targetLabel} · ${resolveXrCameraMoveLabel(mark.moveId)} · ${mark.rig} · ${formatCameraOptics(mark.settings)} · ${mark.timeSeconds}s · drag to retime`}
              aria-label={`Camera mark ${index + 1} linked to ${targetLabel} at ${mark.timeSeconds} seconds · ${resolveXrCameraMoveLabel(mark.moveId)} · ${mark.rig} · ${formatCameraOptics(mark.settings)}`}
              aria-pressed={selected}
              role="button"
              tabIndex={0}
              onClick={event => { event.stopPropagation(); selectMark() }}
              onKeyDown={event => selectMarkOnKeyDown(event, selectMark)}
              onPointerDown={event => beginRulerMarkDrag(event, scaleDurationSeconds, selectMark, value => {
                const selection = readXrMotionReferenceRuntime().selectedMark
                retimeXrMotionReferenceCameraMark(selection?.kind === 'camera' ? selection.markId : mark.id, value)
              })}
              data-kg-xr-lane-camera-mark={index + 1}
              data-kg-xr-camera-mark-target={mark.anchorId}
              data-kg-camera-optics-projection="timeline-mark"
              data-kg-camera-sensor={mark.settings.sensorId}
              data-kg-camera-focal-length-mm={mark.settings.focalLengthMm}
              data-kg-camera-focus-distance-m={mark.settings.focusDistanceMeters}
              data-kg-camera-aspect-ratio={mark.settings.aspectRatio}
              data-kg-xr-lane-mark-shape="circle-only"
              data-kg-xr-stage-highlight-target={selected ? 'camera-mark' : undefined}
            >
              <span style={selected ? { backgroundColor: XR_MOTION_REFERENCE_SELECTION_COLOR } : undefined}>C{index + 1}</span>
            </TimelineTransportTimeAxisMark>
          )
        })}
        {selectedCameraMark ? renderSelectedMarkControls(selectedCameraMark.timeSeconds) : null}
        {runtime.plan.camera.length === 0 ? <span className="xr-camera-motion-retime-lane-empty">Camera → SHOOT adds marks</span> : null}
      </section>
    )
  }

  return (
    <section
      className={cn('grid min-w-0 gap-1 rounded border p-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="XR mark retiming"
      data-kg-xr-timeline-retime="1"
      data-kg-xr-timeline-retime-layout={layout}
    >
      <header className="flex items-center justify-between gap-2 px-0.5">
        <h4 className="text-[10px] font-semibold uppercase">Retime marks</h4>
        <p className={cn('m-0 text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Seconds · actor + camera</p>
      </header>
      <section className="flex min-w-0 flex-wrap gap-1" aria-label="Cast mark times">
        {selectedTrack?.marks.map((mark, index) => (
          <article key={mark.id} className={cn('flex items-center gap-1 rounded border px-1 py-0.5', UI_THEME_TOKENS.panel.border)} data-kg-xr-retime-cast-mark={index + 1}>
            <span className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: selectedTrack.color }}>{index + 1}</span>
            <TimeEditor label={`${selectedTrack.label} mark ${index + 1} time`} value={mark.timeSeconds} max={runtime.plan.durationSeconds} onChange={value => retimeXrMotionReferenceCastMark(selectedTrack.actorId, mark.id, value)} />
            <button type="button" className="App-toolbar__btn p-1" disabled={selectedTrack.marks.length <= 1} aria-label={`Remove ${selectedTrack.label} mark ${index + 1}`} onClick={() => removeXrMotionReferenceCastMark(selectedTrack.actorId, mark.id)}>
              <Trash2 className="size-3" aria-hidden />
            </button>
          </article>
        ))}
        {!selectedTrack ? <p className={cn('m-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>No cast track.</p> : null}
      </section>
      <section className="flex min-w-0 flex-wrap gap-1" aria-label="Camera mark times">
        {runtime.plan.camera.map((mark, index) => (
          <article key={mark.id} className={cn('flex items-center gap-1 rounded border px-1 py-0.5', UI_THEME_TOKENS.panel.border)} data-kg-xr-retime-camera-mark={index + 1}>
            <span className="text-[9px] font-bold">C{index + 1}</span>
            <TimeEditor label={`Camera mark ${index + 1} time`} value={mark.timeSeconds} max={runtime.plan.durationSeconds} onChange={value => retimeXrMotionReferenceCameraMark(mark.id, value)} />
            <span className={cn('max-w-40 truncate text-[9px]', UI_THEME_TOKENS.text.tertiary)} title={`${resolveXrCameraMoveLabel(mark.moveId)} · ${mark.rig} · ${formatCameraOptics(mark.settings)}`} data-kg-camera-optics-projection="timeline-mark">{resolveXrCameraMoveLabel(mark.moveId)} · {mark.settings.focalLengthMm}mm · {mark.settings.focusDistanceMeters}m</span>
            <button type="button" className="App-toolbar__btn p-1" aria-label={`Remove camera mark ${index + 1}`} onClick={() => removeXrMotionReferenceCameraMark(mark.id)}>
              <Trash2 className="size-3" aria-hidden />
            </button>
          </article>
        ))}
        {runtime.plan.camera.length === 0 ? <p className={cn('m-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Drop camera marks from FloatingPanel → Camera → SHOOT.</p> : null}
      </section>
    </section>
  )
}
