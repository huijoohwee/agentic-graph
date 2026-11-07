import React from 'react'
import {
  LayoutChoice as BaseLayoutChoice,
  SettingsHostProvider,
  SettingsRow as BaseSettingsRow,
  WorkspaceDataViewCompactCheckbox as BaseCompactCheckbox,
  WorkspaceDataViewComfortableTextInput as BaseComfortableTextInput,
  WorkspaceDataViewFieldSelect as BaseFieldSelect,
  WorkspaceDataViewSearchInput as BaseSearchInput,
  type SettingsHostAdapter,
} from '@agentic-base/views-react/settings'
import { PanelCheckbox, PanelSelect, PanelTextInput, type PanelSelectProps } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

const graphSettingsHost = {
  contract: 'agentic-base/settings-host/v1',
  theme: {
    button: {
      hoverBg: UI_THEME_TOKENS.button.hoverBg,
      activeBorder: UI_THEME_TOKENS.button.activeBorder,
      activeBg: UI_THEME_TOKENS.button.activeBg,
      activeText: UI_THEME_TOKENS.button.activeText,
    },
    icon: { color: UI_THEME_TOKENS.icon.color },
    input: {
      bg: UI_THEME_TOKENS.input.bg,
      border: UI_THEME_TOKENS.input.border,
      text: UI_THEME_TOKENS.input.text,
    },
    panel: { border: UI_THEME_TOKENS.panel.border },
    text: {
      primary: UI_THEME_TOKENS.text.primary,
      secondary: UI_THEME_TOKENS.text.secondary,
    },
  },
  classes: {
    compactGlyph: UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
    compactSelection: UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
    dataViewFieldInput: UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME,
    layoutChoice: UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME,
    menuRow: UI_RESPONSIVE_MENU_ROW_CLASSNAME,
    settingsRowValue: UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME,
    textTruncate: UI_TEXT_TRUNCATE,
  },
  components: { PanelTextInput, PanelSelect, PanelCheckbox },
} satisfies SettingsHostAdapter

export type SettingsRowProps = {
  icon: React.ReactNode
  label: string
  value?: string
  onClick?: () => void
}

function withGraphSettingsHost(children: React.ReactNode) {
  return <SettingsHostProvider value={graphSettingsHost}>{children}</SettingsHostProvider>
}

/** Graph provides theme and control adapters; Base owns the shared row presentation. */
export function SettingsRow(props: SettingsRowProps) {
  return withGraphSettingsHost(<BaseSettingsRow {...props} />)
}

/** Graph supplies layout state; Base owns the shared layout choice. */
export function LayoutChoice(props: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return withGraphSettingsHost(<BaseLayoutChoice {...props} />)
}

type WorkspaceDataViewComfortableTextInputProps = React.InputHTMLAttributes<HTMLInputElement>

export const WorkspaceDataViewComfortableTextInput = React.forwardRef<HTMLInputElement, WorkspaceDataViewComfortableTextInputProps>(
  function WorkspaceDataViewComfortableTextInput(props, ref) {
    return withGraphSettingsHost(<BaseComfortableTextInput {...props} ref={ref} />)
  },
)

type WorkspaceDataViewSearchInputProps = React.InputHTMLAttributes<HTMLInputElement>

export const WorkspaceDataViewSearchInput = React.forwardRef<HTMLInputElement, WorkspaceDataViewSearchInputProps>(
  function WorkspaceDataViewSearchInput(props, ref) {
    return withGraphSettingsHost(<BaseSearchInput {...props} ref={ref} />)
  },
)

type WorkspaceDataViewFieldSelectProps = PanelSelectProps

export const WorkspaceDataViewFieldSelect = React.forwardRef<HTMLButtonElement, WorkspaceDataViewFieldSelectProps>(
  function WorkspaceDataViewFieldSelect({ className, ...props }, ref) {
    return withGraphSettingsHost(<BaseFieldSelect {...props} ref={ref} className={className} />)
  },
)

type WorkspaceDataViewCompactCheckboxProps = React.InputHTMLAttributes<HTMLInputElement>

export const WorkspaceDataViewCompactCheckbox = React.forwardRef<HTMLInputElement, WorkspaceDataViewCompactCheckboxProps>(
  function WorkspaceDataViewCompactCheckbox(props, ref) {
    return withGraphSettingsHost(<BaseCompactCheckbox {...props} ref={ref} />)
  },
)
