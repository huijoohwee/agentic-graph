import { PanelColorPicker } from '@/lib/ui/PanelColorPicker'
import React from 'react'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

type PanelKeyTypeColorTextValueRowProps = {
  keyNode: React.ReactNode
  value: string
  onChange: (next: string) => void
  placeholder?: string
  textInputClassName?: string
  colorInputClassName?: string
  density?: 'compact' | 'default'
}

export function PanelKeyTypeColorTextValueRow({
  keyNode,
  value,
  onChange,
  placeholder,
  textInputClassName,
  colorInputClassName,
  density = 'compact',
}: PanelKeyTypeColorTextValueRowProps) {
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps(density)
  return (
    <KeyTypeValueStaticRow
      {...staticRowProps}
      layout="keyValue"
      keyNode={keyNode}
      valueNode={(
        <section className="flex items-center gap-2">
          <PanelColorPicker

            className={colorInputClassName}
            value={value || placeholder || '#000000'}
            onValueChange={nextColor => onChange(nextColor)}
          />
          <PanelTextInput
            className={textInputClassName}
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
          />
        </section>
      )}
    />
  )
}
