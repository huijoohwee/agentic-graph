import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { uiSelectableRowClassName } from 'grph-shared/ui/selectedRowClasses'

/** One DOM menu surface for toolbar and field dropdowns; options stay hit-testable. */
export function DropdownMenuSurface({ className = '', ...props }: React.HTMLAttributes<HTMLMenuElement>) {
  return <menu {...props} className={`kg-toolbar-dropdown-menu p-1 flex flex-col gap-1 list-none m-0 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.border.outline} rounded shadow-md ${className}`} />
}

export function dropdownMenuOptionClassName(active: boolean): string {
  return `${UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME} disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed ${uiSelectableRowClassName(active)}`
}
