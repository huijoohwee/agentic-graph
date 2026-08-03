import { UI_THEME_TOKENS } from './themeTokens.js'

export const UI_SELECTED_ROW_ACTIVE_CLASS_NAME = `border ${UI_THEME_TOKENS.button.activeSoft}`
export const UI_SELECTED_ROW_INACTIVE_CLASS_NAME = `border border-transparent ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`

export const uiSelectedRowStateClassName = (active: boolean): string =>
  active ? UI_SELECTED_ROW_ACTIVE_CLASS_NAME : ''

export const uiSelectableRowClassName = (selected: boolean): string =>
  selected ? UI_SELECTED_ROW_ACTIVE_CLASS_NAME : UI_SELECTED_ROW_INACTIVE_CLASS_NAME

export const uiCurrentChoiceRowIsSelected = (_currentValue: unknown): true => true

export const uiBooleanRowValue = (enabled: boolean): 'On' | 'Off' => enabled ? 'On' : 'Off'

export const uiAutomaticRowValue = (automatic: boolean): 'Auto' | 'Manual' => automatic ? 'Auto' : 'Manual'
