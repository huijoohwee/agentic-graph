import { MainPanelTypeIcon } from './mainPanelHelpIconLibrary'
import React from 'react'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { PanelCheckbox } from '@/lib/ui/panelFormControls'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

type PanelKeyTypeCheckboxValueRowProps = {
  keyNode: React.ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  density?: 'compact' | 'default'
  checkboxClassName?: string
  labelNode?: React.ReactNode
}

export function PanelKeyTypeCheckboxValueRow({
  keyNode,
  checked,
  onChange,
  disabled,
  density,
  checkboxClassName,
  labelNode,
}: PanelKeyTypeCheckboxValueRowProps) {
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps(density)
  const labelId = React.useId()
  return (
    <KeyTypeValueStaticRow
      {...staticRowProps}
      layout="keyValue"
      typeNode={<MainPanelTypeIcon iconKey="setting.boolean" />}
      keyNode={<span id={labelId}>{keyNode}</span>}
      valueNode={(
        <>
          <PanelCheckbox
            aria-labelledby={labelId}
            checked={checked}
            disabled={disabled}
            onChange={event => onChange(event.target.checked)}
            className={checkboxClassName}
          />
          {labelNode}
        </>
      )}
    />
  )
}
