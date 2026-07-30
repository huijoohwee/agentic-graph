import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'

export const FLOATING_MENU_CLASSNAME = ['absolute mt-2 rounded border shadow-sm p-2 z-40', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')
export const FLOATING_MENU_RIGHT_CLASSNAME = [FLOATING_MENU_CLASSNAME, 'kg-data-view-floating-menu right-0'].join(' ')
export const FLOATING_MENU_RIGHT_W220_CLASSNAME = [FLOATING_MENU_CLASSNAME, 'kg-data-view-floating-menu right-0', UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME].join(' ')
export const FLOATING_MENU_LEFT_W220_CLASSNAME = [FLOATING_MENU_CLASSNAME, 'kg-data-view-floating-menu left-0', UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME].join(' ')
export const FLOATING_MENU_BUTTON_CLASSNAME = [UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'text-left px-2 py-1.5 rounded text-xs cursor-pointer', UI_THEME_TOKENS.button.hoverBg].join(' ')
export const FLOATING_MENU_BUTTON_DISABLED_CLASSNAME = [UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'text-left px-2 py-1.5 rounded text-xs cursor-not-allowed border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.tertiary].join(' ')
export const FLOATING_MENU_BUTTON_DANGER_CLASSNAME = [UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'text-left px-2 py-1.5 rounded text-xs cursor-pointer border border-red-200 text-red-600', UI_THEME_TOKENS.button.dangerHoverBg].join(' ')
export const FLOATING_MENU_DIVIDER_CLASSNAME = ['list-none my-2 h-px', UI_THEME_TOKENS.panel.divider].join(' ')
export const FLOATING_MENU_TRIGGER_CLASSNAME = [UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'h-6 rounded border px-2 list-none cursor-pointer text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')
export const FLOATING_OVERLAY_TOOLBAR_CLASSNAME = [FLOATING_MENU_RIGHT_CLASSNAME, 'top-0 z-20 m-0 p-1', uiToolbarRowScrollClassName, 'gap-1 text-[10px]'].join(' ')
export const FLOATING_POPOVER_ACTION_BUTTON_CLASSNAME = ['kg-toolbar-btn rounded cursor-pointer', UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'justify-center', UI_THEME_TOKENS.button.square, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg].join(' ')
export const FLOATING_POPOVER_PANEL_CLASSNAME = ['kg-data-view-floating-menu absolute rounded border shadow-sm z-20 m-0 p-2', UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME, UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')
export const FLOATING_POPOVER_INPUT_CLASSNAME = ['w-full rounded border px-2 py-1.5 text-xs outline-none', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.text.primary].join(' ')
