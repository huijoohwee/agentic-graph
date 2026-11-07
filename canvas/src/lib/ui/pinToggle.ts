import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export function getPinToggleButtonClassName(pinned: boolean | undefined): string {
  if (!pinned) return 'App-toolbar__btn'
  return cn('App-toolbar__btn', UI_THEME_TOKENS.button.selectedIcon)
}
