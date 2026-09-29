import React from 'react'
import { Aperture } from 'lucide-react'
import { PanelField, PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  CAMERA_ASPECT_RATIOS,
  CAMERA_MAX_FOCUS_DISTANCE_METERS,
  CAMERA_MIN_FOCUS_DISTANCE_METERS,
  CAMERA_SENSOR_FORMATS,
  formatCameraOptics,
  resolveCameraHorizontalFovDegreesForOptics,
  resolveCameraSensorFormat,
  resolveCameraVerticalFovDegreesForOptics,
  resolveFullFrameEquivalentFocalLengthMm,
  type CameraAspectRatioId,
  type CameraSensorFormatId,
} from './cameraOptics'
import {
  STRYBLDR_CAMERA_MAX_FOCAL_LENGTH_MM,
  STRYBLDR_CAMERA_MIN_FOCAL_LENGTH_MM,
  readStrybldrCameraSettings,
  type StrybldrCameraSettings,
} from './strybldrCamera'

const CAMERA_PRIME_FOCAL_LENGTHS_MM = [8, 12, 16, 18, 21, 24, 25, 28, 32, 35, 40, 50, 65, 75, 85, 100, 135, 200, 300] as const

type StrybldrCameraOpticsSectionProps = Readonly<{
  settings: StrybldrCameraSettings
  onSettingsChange: (settings: StrybldrCameraSettings) => void
}>

export function StrybldrCameraOpticsSection({ settings, onSettingsChange }: StrybldrCameraOpticsSectionProps) {
  const lensListId = React.useId()
  const sensor = resolveCameraSensorFormat(settings.sensorId)
  const verticalFov = resolveCameraVerticalFovDegreesForOptics(settings.sensorId, settings.focalLengthMm)
  const horizontalFov = resolveCameraHorizontalFovDegreesForOptics(settings.sensorId, settings.focalLengthMm)
  const equivalentFocalLength = resolveFullFrameEquivalentFocalLengthMm(settings.sensorId, settings.focalLengthMm)
  const update = (patch: Partial<StrybldrCameraSettings>) => onSettingsChange(readStrybldrCameraSettings({ ...settings, ...patch }))

  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border)}
      aria-label="Real camera optics"
      data-kg-camera-optics-owner="floating-panel-camera"
      data-kg-camera-optics={formatCameraOptics(settings)}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-black uppercase tracking-normal">
          <Aperture className="size-3.5" aria-hidden /> Real optics
        </span>
        <span className={cn('text-xs', UI_THEME_TOKENS.text.tertiary)}>Camera-owned · keyframable</span>
      </header>

      <section className="grid grid-cols-2 gap-2">
        <PanelField label="Sensor">
          <PanelSelect
            className="mt-1"
            aria-label="Camera sensor format"
            value={settings.sensorId}
            onValueChange={selectedValueInput => update({ sensorId: selectedValueInput as CameraSensorFormatId })}
            data-kg-camera-sensor="1"
          >
            {CAMERA_SENSOR_FORMATS.map(format => <option key={format.id} value={format.id}>{format.label}</option>)}
          </PanelSelect>
        </PanelField>
        <PanelField label="Aspect mask">
          <PanelSelect
            className="mt-1"
            aria-label="Camera aspect mask"
            value={settings.aspectRatio}
            onValueChange={selectedValueInput => update({ aspectRatio: selectedValueInput as CameraAspectRatioId })}
            data-kg-camera-aspect-mask-control="1"
          >
            {CAMERA_ASPECT_RATIOS.map(aspect => <option key={aspect.id} value={aspect.id}>{aspect.label}</option>)}
          </PanelSelect>
        </PanelField>
        <PanelField label="Focal length">
          <section className="mt-1 flex items-center gap-1">
            <PanelTextInput
              type="number"
              min={STRYBLDR_CAMERA_MIN_FOCAL_LENGTH_MM}
              max={STRYBLDR_CAMERA_MAX_FOCAL_LENGTH_MM}
              step={0.1}
              list={lensListId}
              value={settings.focalLengthMm}
              aria-label="Camera focal length in millimeters"
              onChange={event => update({ focalLengthMm: Number(event.target.value) })}
              data-kg-strybldr-camera-lens="1"
            />
            <span className={cn('text-xs font-semibold', UI_THEME_TOKENS.text.tertiary)}>mm</span>
            <datalist id={lensListId}>{CAMERA_PRIME_FOCAL_LENGTHS_MM.map(value => <option key={value} value={value} />)}</datalist>
          </section>
        </PanelField>
        <PanelField label="Focus distance">
          <section className="mt-1 flex items-center gap-1">
            <PanelTextInput
              type="number"
              min={CAMERA_MIN_FOCUS_DISTANCE_METERS}
              max={CAMERA_MAX_FOCUS_DISTANCE_METERS}
              step={0.1}
              value={settings.focusDistanceMeters}
              aria-label="Camera focus distance in meters"
              onChange={event => update({ focusDistanceMeters: Number(event.target.value) })}
              data-kg-camera-focus-distance="1"
            />
            <span className={cn('text-xs font-semibold', UI_THEME_TOKENS.text.tertiary)}>m</span>
          </section>
        </PanelField>
      </section>

      <output className={cn('grid gap-0.5 text-xs', UI_THEME_TOKENS.text.tertiary)} data-kg-camera-optics-readout="1">
        <span>{sensor.widthMm} × {sensor.heightMm}mm · {horizontalFov.toFixed(1)}° H × {verticalFov.toFixed(1)}° V</span>
        <span>{equivalentFocalLength}mm horizontal Full Frame equivalent</span>
        <span>Lens zoom and rack focus interpolate between Camera marks; aspect cuts at the mark.</span>
      </output>
    </section>
  )
}
