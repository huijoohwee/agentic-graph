import { MainPanelTypeIcon } from './mainPanelHelpIconLibrary'
import React from 'react'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { PanelRangeInput } from '@/lib/ui/panelFormControls'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

type PanelKeyTypeRangeValueRowProps = {
  keyNode: React.ReactNode
  min: number
  max: number
  step: number
  value: number
  onChange: (next: number) => void
  density?: 'compact' | 'default'
  rangeClassName?: string
  valueNode: React.ReactNode
  disabled?: boolean
}

export function PanelKeyTypeRangeValueRow({
  keyNode,
  min,
  max,
  step,
  value,
  onChange,
  density,
  rangeClassName,
  valueNode,
  disabled,
}: PanelKeyTypeRangeValueRowProps) {
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps(density)
  const labelId = React.useId()
  return (
    <KeyTypeValueStaticRow
      {...staticRowProps}
      layout="keyTypeValue"
      typeNode={<MainPanelTypeIcon iconKey="setting.number" />}
      keyNode={<span id={labelId}>{keyNode}</span>}
      valueNode={(
        <>
          <PanelRangeInput
            aria-labelledby={labelId}
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={event => onChange(Number(event.target.value))}
            className={rangeClassName}
          />
          {valueNode}
        </>
      )}
    />
  )
}
