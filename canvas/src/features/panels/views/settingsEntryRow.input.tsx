import React from 'react'
import Tooltip from 'agentic-design-system/react/hover'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type BuildSettingsEntryInputNodeArgs = {
  hasOptions: boolean
  renderInput: () => React.ReactNode
  settingType: string
  valueTooltip: string
}

const stopSettingsValueEvent = (event: React.SyntheticEvent) => {
  event.stopPropagation()
}

export function buildSettingsEntryInputNode({
  hasOptions,
  renderInput,
  settingType: _settingType,
  valueTooltip,
}: BuildSettingsEntryInputNodeArgs) {
  const valueWrapperClass = UI_RESPONSIVE_SETTINGS_VALUE_WRAPPER_CLASSNAME

  return hasOptions && valueTooltip.trim().length > 0
    ? (
      <Tooltip
        content={valueTooltip}
        maxWidthPx={260}
        contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
        className="w-full min-w-0 max-w-full overflow-hidden"
      >
        <span
          className={valueWrapperClass}
          onPointerDown={stopSettingsValueEvent}
          onMouseDown={stopSettingsValueEvent}
          onClick={stopSettingsValueEvent}
          onKeyDown={stopSettingsValueEvent}
        >
          {renderInput()}
        </span>
      </Tooltip>
    )
    : (
      <span
        className={valueWrapperClass}
        onPointerDown={stopSettingsValueEvent}
        onMouseDown={stopSettingsValueEvent}
        onClick={stopSettingsValueEvent}
        onKeyDown={stopSettingsValueEvent}
      >
        {renderInput()}
      </span>
    )
}
