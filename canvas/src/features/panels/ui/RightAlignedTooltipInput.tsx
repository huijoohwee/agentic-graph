import { usePanelTypography } from '@/lib/ui/panelTypography'
import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import Tooltip from 'agentic-design-system/react/hover'
import { RightAlignedValueCell } from 'grph-shared/react/keyTypeValueRow'
import { PanelTextInput } from '@/lib/ui/panelFormControls'

export interface RightAlignedTooltipInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  tooltip: React.ReactNode
  maxWidthPx?: number
  contentClassName?: string
  containerClassName?: string
  className?: string
  type?: string
}

export function RightAlignedTooltipInput({
  tooltip,
  maxWidthPx = 260,
  contentClassName = '',
  className,
  containerClassName,
  ...inputProps
}: RightAlignedTooltipInputProps) {
  const {
    fontClass: uiPanelTextFontClass,
    textSizeClass: uiPanelKeyValueTextSizeClass,
    keyValueInputClass: uiPanelKeyValueInputClass,
  } = usePanelTypography()
  const mergedClassName = [
    uiPanelTextFontClass,
    uiPanelKeyValueTextSizeClass,
    uiPanelKeyValueInputClass,
    className || '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <RightAlignedValueCell className={containerClassName}>
      <Tooltip
        content={tooltip}
        maxWidthPx={maxWidthPx}
        contentClassName={contentClassName}
        className="w-full h-full"
      >
        <PanelTextInput
          {...inputProps}
          type={String(inputProps.type || 'text').toLowerCase()}
          value={typeof inputProps.value === 'string' ? inputProps.value : String(inputProps.value ?? '')}
          defaultValue={
            typeof inputProps.defaultValue === 'string'
              ? inputProps.defaultValue
              : typeof inputProps.defaultValue === 'number'
                ? String(inputProps.defaultValue)
                : undefined
          }
          spellCheck={typeof inputProps.spellCheck === 'boolean' ? inputProps.spellCheck : undefined}
          autoCorrect="off"
          autoCapitalize="off"
          className={mergedClassName}
        />
      </Tooltip>
    </RightAlignedValueCell>
  )
}
