import { PANEL_TYPOGRAPHY_DEFAULTS } from './panelTypography.js'
import { UI_THEME_TOKENS } from './themeTokens.js'

export type KtvHeaderLabels = Readonly<{
  keyLabel: string
  typeLabel: string
  valueLabel: string
}>

export const KTV_DEFAULT_HEADER_LABELS: KtvHeaderLabels = {
  keyLabel: 'Key',
  typeLabel: 'Type',
  valueLabel: 'Value',
}

export const KTV_SECTION_STACK_CLASS_NAME = 'space-y-0 py-0'
// Header and row density own vertical rhythm; do not stack additional section gaps.
export const KTV_SECTION_SPACING_CLASS_NAME = 'mt-0 pt-0'
export const KTV_SECTION_CONTENT_CLASS_NAME = 'block mt-0'
export const KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME = PANEL_TYPOGRAPHY_DEFAULTS.textSizeClass
export const KTV_HEADER_LABEL_TEXT_SIZE_CLASS_NAME = 'text-xs'
export const KTV_STATUS_TEXT_SIZE_CLASS_NAME = 'text-xs'
export const KTV_HEADER_LABEL_CLASS_NAME = `${KTV_HEADER_LABEL_TEXT_SIZE_CLASS_NAME} font-semibold ${UI_THEME_TOKENS.text.secondary}`
export const KTV_SECTION_TITLE_CLASS_NAME = `${KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME} font-semibold ${UI_THEME_TOKENS.text.primary}`
export const KTV_STATUS_TEXT_CLASS_NAME = `${KTV_STATUS_TEXT_SIZE_CLASS_NAME} font-normal ${UI_THEME_TOKENS.text.secondary}`
export const KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME = 'kg-row-scroll flex items-center'
export const KTV_VALUE_ROW_SCROLL_CLASS_NAME = `${KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME} w-full min-w-0 max-w-full gap-1 justify-start sm:justify-end`
export const KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME = `${KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME} w-full min-w-0 max-w-full gap-1.5 justify-start sm:justify-end`
export const KTV_VALUE_ROW_STATUS_SHELL_CLASS_NAME = 'min-w-0 max-w-full overflow-hidden'

export const KTV_ROW_TEXT_CELL_CLASS_NAME = 'flex min-w-0 max-w-full overflow-hidden'
export const KTV_ROW_LABEL_CELL_CLASS_NAME = `${KTV_ROW_TEXT_CELL_CLASS_NAME} text-ellipsis whitespace-nowrap`
export const KTV_ROW_VALUE_CELL_CLASS_NAME = `${KTV_ROW_TEXT_CELL_CLASS_NAME} self-stretch px-2 gap-2 justify-start sm:justify-end ${UI_THEME_TOKENS.text.secondary}`

export const KTV_KEY_ICON_SLIDER_INPUT_GRID_CLASS_NAME = 'grid-cols-[minmax(0,0.9fr)_minmax(1rem,1rem)_minmax(0,0.55fr)_minmax(0,1.15fr)] sm:grid-cols-[minmax(0,1fr)_minmax(0,0.05fr)_minmax(0,0.55fr)_minmax(0,1.4fr)]'
export const KTV_KEY_ICON_VALUE_GRID_CLASS_NAME = 'grid-cols-[minmax(0,1fr)_minmax(1.25rem,1.75rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1.1fr)_minmax(1.25rem,1.75rem)_minmax(0,1.2fr)]'
export const KTV_KEY_VALUE_GRID_CLASS_NAME = 'grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'
export const KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME = 'grid-cols-[minmax(0,0.95fr)_minmax(2.75rem,0.42fr)_minmax(0,1.2fr)] sm:grid-cols-[minmax(0,1fr)_minmax(3rem,4.75rem)_minmax(0,1.45fr)]'

export function shouldFlushKeyTypeValueSectionTop(index: number): boolean {
  return index === 0
}
