import { UI_THEME_TOKENS } from './themeTokens.js'

export const UI_SELECTED_ROW_ACTIVE_CLASS_NAME = `border border-transparent ${UI_THEME_TOKENS.table.rowSelected}`
export const UI_SELECTED_ROW_INACTIVE_CLASS_NAME = `border border-transparent ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`

// Current-file navigation and settings choices retain their established soft border treatment.
const selectedChoiceClassName = `border ${UI_THEME_TOKENS.button.activeSoft}`
export const uiSelectedRowStateClassName = (active: boolean, kind: 'record' | 'choice' = 'record'): string =>
  active ? kind === 'choice' ? selectedChoiceClassName : UI_SELECTED_ROW_ACTIVE_CLASS_NAME : ''

export const uiSelectableRowClassName = (selected: boolean): string =>
  selected ? uiSelectedRowStateClassName(true, 'choice') : UI_SELECTED_ROW_INACTIVE_CLASS_NAME

export const uiCurrentChoiceRowIsSelected = (_currentValue: unknown): true => true

export const uiBooleanRowValue = (enabled: boolean): 'On' | 'Off' => enabled ? 'On' : 'Off'

export const uiAutomaticRowValue = (automatic: boolean): 'Auto' | 'Manual' => automatic ? 'Auto' : 'Manual'
