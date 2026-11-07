import React, { useId } from 'react'
import { PanelRangeInput } from '@/lib/ui/panelFormControls'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import { useCanvasKeyTypeValueStaticRowProps } from './canvasKeyTypeValueRuntime'
import { RightAlignedValueCell } from './canvasKeyTypeValueValueCell'
import { MainPanelTypeIcon } from './mainPanelHelpIconLibrary'
import { panelFieldDecorationClassName } from 'grph-shared/ui/keyTypeValueRows'

export type PanelLabeledRangeFieldProps = {
  label: React.ReactNode
  valueLabel: React.ReactNode
  min: number | string
  max: number | string
  step: number | string
  value: number | string
  onChange: (next: number) => void
  className?: string
  labelClassName?: string
  valueClassName?: string
  rangeClassName?: string
  disabled?: boolean
}

export function PanelLabeledRangeField({ label, valueLabel, min, max, step, value, onChange,
  className, labelClassName, valueClassName, rangeClassName, disabled,
}: PanelLabeledRangeFieldProps) {
  const id = useId()
  const row = useCanvasKeyTypeValueStaticRowProps()
  return <KeyTypeValueStaticRow {...row} className={className}
    keyNode={<label htmlFor={id} className={panelFieldDecorationClassName(labelClassName)}>{label}</label>}
    typeNode={<MainPanelTypeIcon iconKey="setting.number" className="h-4 w-4" />}
    valueNode={<RightAlignedValueCell>
      <PanelRangeInput id={id} min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={event => onChange(Number(event.target.value))} className={rangeClassName} />
      <output htmlFor={id} className={panelFieldDecorationClassName(valueClassName)}>{valueLabel}</output>
    </RightAlignedValueCell>}
  />
}
