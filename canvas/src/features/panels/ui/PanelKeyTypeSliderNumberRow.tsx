import React, { useId } from 'react'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import Tooltip from '@/features/panels/ui/Tooltip'
import { PanelRangeInput, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

type PanelKeyTypeSliderNumberRowProps = {
  keyNode: React.ReactNode
  controlTooltip?: React.ReactNode
  min: number
  max: number
  step: number
  value: number
  onChange: (next: number) => void
  uiPanelKeyValueInputClass: string
  density?: 'compact' | 'default'
  rangeClassName?: string
  valueInputClassName?: string
  normalizeValue?: (raw: number) => number
  fallbackValue?: number
  displayValue?: number | string
}

const readFiniteValue = (
  raw: number,
  fallbackValue: number,
  normalizeValue?: (raw: number) => number,
): number => {
  if (!Number.isFinite(raw)) return fallbackValue
  return typeof normalizeValue === 'function' ? normalizeValue(raw) : raw
}

export function PanelKeyTypeSliderNumberRow({
  keyNode,
  controlTooltip,
  min,
  max,
  step,
  value,
  onChange,
  uiPanelKeyValueInputClass,
  density,
  rangeClassName,
  valueInputClassName,
  normalizeValue,
  fallbackValue = value,
  displayValue,
}: PanelKeyTypeSliderNumberRowProps) {
  const labelId = useId()
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps(density)
  const resolvedDisplayValue = displayValue ?? value

  const sliderNode = (
    <PanelRangeInput
      aria-labelledby={labelId}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(readFiniteValue(Number(event.target.value), fallbackValue, normalizeValue))}
      className={rangeClassName}
    />
  )

  const valueNode = (
    <PanelTextInput
      aria-labelledby={labelId}
      type="number"
      min={min}
      max={max}
      step={step}
      value={resolvedDisplayValue}
      onChange={event => onChange(readFiniteValue(Number(event.target.value), fallbackValue, normalizeValue))}
      className={[uiPanelKeyValueInputClass, valueInputClassName].filter(Boolean).join(' ')}
    />
  )

  const maybeWrapWithTooltip = (node: React.ReactNode) => {
    if (!controlTooltip) return node
    return (
      <Tooltip
        content={controlTooltip}
        maxWidthPx={260}
        contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
        className="w-full h-full"
      >
        {node}
      </Tooltip>
    )
  }

  return (
    <KeyTypeValueStaticRow
      layout="keyIconSliderInput"
      {...staticRowProps}
      keyNode={<span id={labelId}>{keyNode}</span>}
      typeNode={maybeWrapWithTooltip(sliderNode)}
      valueNode={maybeWrapWithTooltip(valueNode)}
    />
  )
}
