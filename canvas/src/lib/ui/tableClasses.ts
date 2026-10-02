import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export const UI_TABLE = {
  tableBase: cn(UI_THEME_TOKENS.table.text),
  headerRow: cn(UI_THEME_TOKENS.table.textSecondary),
  headerCell: cn('sticky top-0 z-10 px-3 py-2', UI_THEME_TOKENS.table.headerBg, UI_THEME_TOKENS.table.cellBorder),
  rowBase: cn('border-b', UI_THEME_TOKENS.table.cellBorder, UI_THEME_TOKENS.table.rowHover),
  rowComfortable: 'h-10',
  rowDense: 'h-8',
  cell: cn('px-3 py-2', UI_THEME_TOKENS.table.textSecondary),
  rowHover: UI_THEME_TOKENS.table.rowHover,
  rowSelected: UI_THEME_TOKENS.table.rowSelected,
  text: UI_THEME_TOKENS.table.text,
  textSecondary: UI_THEME_TOKENS.table.textSecondary,
} as const
