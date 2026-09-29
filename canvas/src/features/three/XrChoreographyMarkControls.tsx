import React from 'react'
import { TriangleAlert } from 'lucide-react'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  XR_CHOREOGRAPHY_EASINGS,
  XR_CHOREOGRAPHY_GAITS,
  XR_MOTION_REFERENCE_MAX_COORDINATE_METERS,
  type XrChoreographyEasing,
  type XrChoreographyGait,
  type XrMotionReferenceCameraMark,
  type XrMotionReferenceMark,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import type { XrChoreographySpeedWarning } from './xrChoreographyDiagnostics'

export type XrChoreographyMarkUpdate =
  | Readonly<{ kind: 'cast'; actorId: string; markId: string; easing?: XrChoreographyEasing; gait?: XrChoreographyGait; position?: XrMotionReferenceVector }>
  | Readonly<{ kind: 'camera'; markId: string; easing?: XrChoreographyEasing }>

type Props = Readonly<{
  target: Readonly<{ kind: 'cast'; actorId: string; mark: XrMotionReferenceMark }>
    | Readonly<{ kind: 'camera'; mark: XrMotionReferenceCameraMark }>
  warning?: XrChoreographySpeedWarning
  compact?: boolean
  showPosition?: boolean
  onChange: (update: XrChoreographyMarkUpdate) => void
}>

export function XrChoreographyMarkControls({ target, warning, compact = false, showPosition = !compact, onChange }: Props) {
  const easing = target.kind === 'cast' ? target.mark.transition : target.mark.easing
  const selectClass = compact ? 'h-5 w-[76px] px-1 py-0 text-xs' : 'h-7 min-w-0 text-xs'
  return (
    <section
      className={cn('flex min-w-0 items-center gap-1', compact ? '' : 'flex-wrap')}
      aria-label={`${target.kind === 'cast' ? 'Cast' : 'Camera'} mark choreography`}
      data-kg-xr-choreography-mark-controls={target.kind}
    >
      <label className="grid min-w-0 gap-0.5 text-xs">
        {!compact ? <span className={UI_THEME_TOKENS.text.tertiary}>Easing</span> : null}
        <PanelSelect
          className={selectClass}
          aria-label={`${target.kind === 'cast' ? 'Cast' : 'Camera'} mark easing`}
          value={easing}
          onChange={event => onChange({
            kind: target.kind,
            ...(target.kind === 'cast' ? { actorId: target.actorId } : {}),
            markId: target.mark.id,
            easing: event.target.value as XrChoreographyEasing,
          } as XrChoreographyMarkUpdate)}
          data-kg-xr-mark-easing={target.mark.id}
        >
          {XR_CHOREOGRAPHY_EASINGS.map(value => <option key={value} value={value}>{value}</option>)}
        </PanelSelect>
      </label>
      {target.kind === 'cast' ? (
        <label className="grid min-w-0 gap-0.5 text-xs">
          {!compact ? <span className={UI_THEME_TOKENS.text.tertiary}>Gait</span> : null}
          <PanelSelect
            className={selectClass}
            aria-label="Cast mark gait"
            value={target.mark.gait}
            onChange={event => onChange({ kind: 'cast', actorId: target.actorId, markId: target.mark.id, gait: event.target.value as XrChoreographyGait })}
            data-kg-xr-mark-gait={target.mark.id}
          >
            {XR_CHOREOGRAPHY_GAITS.map(value => <option key={value} value={value}>{value}</option>)}
          </PanelSelect>
        </label>
      ) : null}
      {showPosition && target.kind === 'cast' ? compact ? (
        <section className="flex min-w-0 items-center gap-1" aria-label="Cast mark position in meters" data-kg-xr-mark-position={target.mark.id} data-kg-xr-mark-position-layout="compact-timeline">
          <span className={cn('whitespace-nowrap text-xs', UI_THEME_TOKENS.text.tertiary)}>XYZ m</span>
          {(['X', 'Y', 'Z'] as const).map((axis, index) => (
            <label key={axis} className="flex min-w-0 items-center gap-0.5 text-xs">
              <span className={UI_THEME_TOKENS.text.tertiary}>{axis}</span>
              <PanelTextInput
                className="h-5 w-11 min-w-0 px-1 py-0 text-xs"
                type="number"
                min={axis === 'Y' ? 0 : -XR_MOTION_REFERENCE_MAX_COORDINATE_METERS}
                max={XR_MOTION_REFERENCE_MAX_COORDINATE_METERS}
                step={0.1}
                value={target.mark.position[index]}
                aria-label={`Cast mark ${axis} position in meters`}
                data-kg-xr-mark-position-axis={axis.toLowerCase()}
                onChange={event => {
                  const value = Number(event.target.value)
                  if (!Number.isFinite(value)) return
                  const position = [...target.mark.position] as [number, number, number]
                  position[index] = value
                  onChange({ kind: 'cast', actorId: target.actorId, markId: target.mark.id, position })
                }}
              />
            </label>
          ))}
        </section>
      ) : (
        <fieldset className="grid min-w-[180px] flex-1 grid-cols-3 gap-1 border-0 p-0" data-kg-xr-mark-position={target.mark.id}>
          <legend className={cn('col-span-3 text-xs', UI_THEME_TOKENS.text.tertiary)}>Mark position · meters</legend>
          {(['X', 'Y', 'Z'] as const).map((axis, index) => (
            <label key={axis} className="grid min-w-0 gap-0.5 text-xs">
              <span className={UI_THEME_TOKENS.text.tertiary}>{axis}</span>
              <PanelTextInput
                className="h-7 min-w-0 px-1 text-xs"
                type="number"
                min={axis === 'Y' ? 0 : -XR_MOTION_REFERENCE_MAX_COORDINATE_METERS}
                max={XR_MOTION_REFERENCE_MAX_COORDINATE_METERS}
                step={0.1}
                value={target.mark.position[index]}
                aria-label={`Cast mark ${axis} position in meters`}
                data-kg-xr-mark-position-axis={axis.toLowerCase()}
                onChange={event => {
                  const value = Number(event.target.value)
                  if (!Number.isFinite(value)) return
                  const position = [...target.mark.position] as [number, number, number]
                  position[index] = value
                  onChange({ kind: 'cast', actorId: target.actorId, markId: target.mark.id, position })
                }}
              />
            </label>
          ))}
        </fieldset>
      ) : null}
      {warning ? (
        <output className="flex min-w-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-300" title={warning.message} data-kg-xr-speed-warning={warning.code}>
          <TriangleAlert className="size-3 shrink-0" aria-hidden />
          {!compact ? <span className="truncate">{warning.message}</span> : null}
        </output>
      ) : null}
    </section>
  )
}
