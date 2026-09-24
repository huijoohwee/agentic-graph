import React from 'react'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { XR_MOTION_REFERENCE_STAGE_PRESETS } from './xrMotionReferenceModel'
import { XrSceneAppearanceControls } from './XrSceneAppearanceControls'

export function XrTimelineSceneStageControls({
  beatLabel,
  documentLoaded,
  edges,
  exportPackage,
  fps,
  graphReady,
  objectCount,
  playheadSeconds,
  saveDisabled,
  savePlan,
  savingScene,
  sceneEditorStyle,
  scrubPlayhead,
  speedWarningCount,
  stageId,
  applyStage,
  cameraMarkCount,
  durationSeconds,
}: {
  beatLabel: string
  documentLoaded: boolean
  edges: number
  exportPackage: () => void
  fps: number
  graphReady: boolean
  objectCount: number
  playheadSeconds: number
  saveDisabled: boolean
  savePlan: () => void
  savingScene: boolean
  sceneEditorStyle: React.CSSProperties
  scrubPlayhead: (seconds: number) => void
  speedWarningCount: number
  stageId: string
  applyStage: (stageId: string) => void
  cameraMarkCount: number
  durationSeconds: number
}) {
  return (
    <section
      className="xr-camera-motion-mark-selection-controls xr-camera-motion-mark-selection-controls--lane xr-timeline-scene-stage-control xr-timeline-scene-stage-control--selected"
      style={sceneEditorStyle}
      aria-label="XR scene stage selector"
      data-kg-xr-motion-stage-field="scene-clip"
      data-kg-xr-motion-scene-controls="click-appear"
      data-kg-xr-motion-scene-control-strip="click-appear"
      data-kg-xr-timeline-control-bar="scene-clip"
      data-kg-xr-timeline-control-lane="scene-clip"
      data-kg-xr-timeline-player-controls="1"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <output
        className="xr-camera-motion-mark-selection-label xr-timeline-scene-selection-label"
        aria-label="XR timeline scene or 3D object shot target"
        data-kg-camera-target="scene-or-object"
        data-kg-xr-timeline-shot-target="scene-clip"
      >
        {beatLabel}
      </output>
      <button type="button" className="App-toolbar__btn min-h-11 px-2 text-xs" style={{ minWidth: 44, flexShrink: 0 }} disabled={saveDisabled} aria-busy={savingScene} onClick={savePlan} data-kg-xr-motion-save="1">
        {savingScene ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="App-toolbar__btn min-h-11 px-2 text-xs" style={{ minWidth: 44, flexShrink: 0 }} disabled={!graphReady} onClick={exportPackage} data-kg-xr-motion-export="1">
        Export
      </button>
      <label className="xr-timeline-control-field" data-kg-xr-timeline-playhead-control="scene-clip">
        <PanelTextInput
          className="min-h-11 w-16 px-1 py-0 text-xs"
          type="number"
          min={0}
          max={durationSeconds}
          step={1 / fps}
          value={playheadSeconds}
          onChange={event => scrubPlayhead(Number(event.target.value))}
          aria-label="XR timeline playhead seconds"
          data-kg-xr-timeline-playhead-input="scene-clip"
        />
      </label>
      <PanelSelect
        className="xr-timeline-scene-stage-select"
        style={{ minHeight: 44 }}
        aria-label="XR scene stage"
        value={stageId}
        onChange={event => applyStage(event.target.value)}
        data-kg-xr-motion-stage-select="scene-clip"
        data-kg-xr-motion-stage-select-lane="scene"
      >
        {XR_MOTION_REFERENCE_STAGE_PRESETS.map(preset => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </PanelSelect>
      <XrSceneAppearanceControls compact disabled={!documentLoaded} />
      <span className={cn('xr-timeline-control-status xr-timeline-scene-stage-summary-chip', UI_THEME_TOKENS.text.tertiary)} data-kg-xr-motion-stage-summary="scene-clip">
        {documentLoaded ? `${objectCount} objects · ${edges} links` : 'World ready'} · {cameraMarkCount} camera marks · {speedWarningCount ? `${speedWarningCount} speed warnings` : 'speed sane'}
      </span>
    </section>
  )
}
