import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { uiSelectableRowClassName } from 'grph-shared/ui/selectedRowClasses'

export type UiMenuButtonVariant = 'default' | 'selected'

export function uiMenuContainerClassName(extra?: string): string {
  return cn('rounded border shadow-sm p-2 z-10', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border, extra)
}

export function uiMenuDividerClassName(extra?: string): string {
  return cn('my-2 h-px', UI_THEME_TOKENS.panel.divider, extra)
}

export function uiMenuItemButtonClassName(variant: UiMenuButtonVariant, extra?: string): string {
  const base = 'w-full text-left px-2 py-1.5 rounded text-xs'
  return cn(base, uiSelectableRowClassName(variant === 'selected'), extra)
}

export function uiMenuPillButtonClassName(selected: boolean, extra?: string): string {
  const base = 'text-[10px] px-2 py-1 rounded border'
  if (selected) {
    return cn(base, UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeBorder, UI_THEME_TOKENS.button.activeText, extra)
  }
  return cn(base, UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary, UI_THEME_TOKENS.button.hoverBg, extra)
}
