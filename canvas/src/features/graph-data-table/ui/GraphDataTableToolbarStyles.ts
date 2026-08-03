import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_GRAPH_DATA_TABLE_TOOLBAR_BUTTON_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_INTENT_TOKENS } from 'grph-shared/ui/intentTokens'

export const UI_COLOR_PRIMARY_BLUE = UI_INTENT_TOKENS.primary.text

export const UI_COLOR_PRIMARY_BLUE_BORDER = UI_INTENT_TOKENS.primary.border

export const UI_COLOR_PRIMARY_BLUE_BG = UI_INTENT_TOKENS.primary.bg

export const UI_COLOR_PRIMARY_BLUE_INDICATOR = UI_INTENT_TOKENS.primary.indicator

export const UI_RING_PRIMARY_BLUE_INDICATOR = UI_INTENT_TOKENS.primary.ringIndicator

export const UI_COLOR_WARNING_AMBER_BORDER = UI_INTENT_TOKENS.warning.border

export const UI_COLOR_WARNING_AMBER_BG = UI_INTENT_TOKENS.warning.bg

export const UI_COLOR_DANGER_RED_BORDER = UI_INTENT_TOKENS.danger.border

export const UI_COLOR_DANGER_RED_BG = UI_INTENT_TOKENS.danger.bg

export const UI_COLOR_DANGER_RED_TEXT = UI_INTENT_TOKENS.danger.text

export const uiDangerButtonClassName =
  `App-toolbar__btn border ${UI_COLOR_DANGER_RED_BORDER} ${UI_COLOR_DANGER_RED_BG} ${UI_COLOR_DANGER_RED_TEXT}`

export const uiToolbarToggleActiveClassName = `${UI_COLOR_PRIMARY_BLUE_BORDER} ${UI_COLOR_PRIMARY_BLUE_BG} ${UI_THEME_TOKENS.button.activeText}`

export const uiDataTableToggleActiveClassName = `${UI_COLOR_PRIMARY_BLUE_BORDER} ${UI_COLOR_PRIMARY_BLUE_BG} ${UI_THEME_TOKENS.button.activeText}`

export const uiPrimaryToggleActiveClassName = uiToolbarToggleActiveClassName

export const uiSecondaryToggleActiveClassName =
  `${UI_COLOR_WARNING_AMBER_BORDER} ${UI_COLOR_WARNING_AMBER_BG} ${UI_INTENT_TOKENS.warning.text}`

export const uiPrimaryPillActiveClassName = `${UI_COLOR_PRIMARY_BLUE_BG} ${UI_THEME_TOKENS.button.activeText}`

export const uiPrimaryIconActiveClassName = `${UI_COLOR_PRIMARY_BLUE} ${UI_COLOR_PRIMARY_BLUE_BG}`

export const uiPrimaryIconInactiveClassName = UI_THEME_TOKENS.icon.color

export const uiPrimaryLinkClassName = `${UI_COLOR_PRIMARY_BLUE} hover:underline`

export const uiPrimaryLinkSmallClassName = `${UI_COLOR_PRIMARY_BLUE} hover:underline`

export const uiPrimaryLinkButtonClassName = `underline ${UI_COLOR_PRIMARY_BLUE} ${UI_THEME_TOKENS.button.primaryLinkHoverText} focus:outline-none`

export const graphDataTableToolbarButtonClassName = (active: boolean) =>
  `inline-flex items-center justify-center whitespace-nowrap font-normal transition-colors focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing} disabled:pointer-events-none disabled:opacity-50 border ${UI_RESPONSIVE_GRAPH_DATA_TABLE_TOOLBAR_BUTTON_CLASSNAME} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.panel.bg} shadow-sm ${UI_THEME_TOKENS.button.hoverBg} rounded-md shrink-0 truncate ${
    active ? `${UI_THEME_TOKENS.button.activeSoft}` : `${UI_THEME_TOKENS.panel.border}`
  }`

export const GRAPH_DATA_TABLE_TOOLBAR_ACTIVE_CLASS = `!${UI_THEME_TOKENS.panel.bg} !${UI_THEME_TOKENS.button.activeText} !${UI_COLOR_PRIMARY_BLUE_BORDER}`
