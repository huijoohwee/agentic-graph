import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_INTENT_TOKENS } from 'grph-shared/ui/intentTokens'

export const UI_COLOR_PRIMARY_BLUE = UI_INTENT_TOKENS.primary.text

export const UI_COLOR_PRIMARY_BLUE_BORDER = UI_INTENT_TOKENS.primary.border

export const UI_COLOR_PRIMARY_BLUE_BG = UI_INTENT_TOKENS.primary.bg

export const UI_COLOR_PRIMARY_BLUE_INDICATOR = UI_INTENT_TOKENS.primary.indicator

export const UI_RING_PRIMARY_BLUE_INDICATOR = UI_INTENT_TOKENS.primary.ringIndicator

export const UI_COLOR_DANGER_RED_BORDER = UI_INTENT_TOKENS.danger.border

export const UI_COLOR_DANGER_RED_BG = UI_INTENT_TOKENS.danger.bg

export const UI_COLOR_DANGER_RED_TEXT = UI_INTENT_TOKENS.danger.text

export const uiPrimaryIconActiveClassName = `${UI_COLOR_PRIMARY_BLUE} ${UI_COLOR_PRIMARY_BLUE_BG}`

export const uiPrimaryIconInactiveClassName = UI_THEME_TOKENS.icon.color

export const uiPrimaryToggleActiveClassName = `${UI_COLOR_PRIMARY_BLUE_BORDER} ${UI_COLOR_PRIMARY_BLUE_BG} ${UI_THEME_TOKENS.button.activeText}`

export const uiToolbarToggleActiveClassName = uiPrimaryToggleActiveClassName

export const uiDangerButtonClassName = `App-toolbar__btn border ${UI_COLOR_DANGER_RED_BORDER} ${UI_COLOR_DANGER_RED_BG} ${UI_COLOR_DANGER_RED_TEXT}`

export const uiPrimaryPillActiveClassName = `${UI_COLOR_PRIMARY_BLUE_BG} ${UI_THEME_TOKENS.button.activeText}`

export const uiToolbarButtonNeutralClassName = `${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg}`

export const uiToolbarButtonMutedClassName = `${UI_THEME_TOKENS.button.neutralMuted} ${UI_THEME_TOKENS.button.hoverBg}`

export const uiToolbarButtonPrimarySolidClassName = UI_THEME_TOKENS.button.primarySolid

export const uiToolbarRowScrollClassName = 'kg-row-scroll flex items-center'

export const uiToolbarRowScrollInlineClassName = 'kg-row-scroll inline-flex items-center'

export const uiToolbarRowScrollJustifyEndClassName = `${uiToolbarRowScrollClassName} justify-end`

export const uiToolbarRowScrollJustifyBetweenClassName = `${uiToolbarRowScrollClassName} justify-between`

export const uiToolbarRowScrollListClassName = `${uiToolbarRowScrollClassName} list-none m-0 p-0`

export const uiToolbarColumnMenuListClassName = 'm-0 p-0 list-none flex flex-col gap-1'

export const uiToolbarResponsiveRowScrollClassName = 'kg-responsive-row-scroll'

export const uiToolbarTouchRowScrollClassName = 'App-toolbar--touch-scroll App-toolbar--touch-row-scroll'

export const uiToolbarAreaStackClassName = 'kg-toolbar-area-stack flex flex-col'

export const uiToolbarAreaInsetStackClassName = 'kg-toolbar-area-stack kg-toolbar-area-stack--inset flex flex-col'

export const uiToolbarAreaActionRowClassName = 'kg-toolbar-area-action-row flex items-center justify-end'

export const uiToolbarAreaCompactActionRowClassName = 'kg-toolbar-area-action-row kg-toolbar-area-action-row--compact flex items-center justify-end'

export const uiToolbarAreaWrapActionRowClassName = 'kg-toolbar-area-action-row kg-toolbar-area-action-row--wrap flex flex-wrap items-center justify-end'

export const uiToolbarAreaLabelClassName = 'kg-toolbar-area-label flex items-center text-xs cursor-pointer select-none'

export const uiToolbarSettingsPanelBodyClassName = 'kg-toolbar-settings-panel-body'

export const uiToolbarSettingsPanelSubsectionClassName = 'kg-toolbar-settings-panel-subsection'

export const uiToolbarSettingsPanelFooterClassName = 'kg-toolbar-settings-panel-footer flex items-center justify-between'

export const uiToolbarSettingsPanelActionGroupClassName = 'kg-toolbar-settings-panel-action-group flex items-center justify-end'

export const uiToolbarSettingsPanelTextActionClassName = 'App-toolbar__btn kg-toolbar-settings-panel-text-action rounded'

export const uiPrimaryLinkClassName = `${UI_COLOR_PRIMARY_BLUE} hover:underline`

export const uiPrimaryLinkSmallClassName = `${UI_COLOR_PRIMARY_BLUE} hover:underline`

export const uiPrimaryLinkButtonClassName = `underline ${UI_COLOR_PRIMARY_BLUE} ${UI_THEME_TOKENS.button.primaryLinkHoverText} focus:outline-none`
