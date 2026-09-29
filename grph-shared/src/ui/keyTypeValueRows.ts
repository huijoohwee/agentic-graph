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
export const KTV_HEADER_LABEL_TEXT_SIZE_CLASS_NAME = 'text-inherit'
export const KTV_STATUS_TEXT_SIZE_CLASS_NAME = 'text-xs'
export const KTV_HEADER_LABEL_CLASS_NAME = `${KTV_HEADER_LABEL_TEXT_SIZE_CLASS_NAME} font-semibold ${UI_THEME_TOKENS.text.secondary}`
export const KTV_SECTION_TITLE_CLASS_NAME = `${KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME} font-semibold ${UI_THEME_TOKENS.text.primary}`
export const KTV_STATUS_TEXT_CLASS_NAME = `${KTV_STATUS_TEXT_SIZE_CLASS_NAME} font-normal ${UI_THEME_TOKENS.text.secondary}`
export const KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME = 'kg-row-scroll flex items-center'
export const KTV_VALUE_ROW_SCROLL_CLASS_NAME = `${KTV_VALUE_CELL_ROW_SCROLL_CLASS_NAME} w-full min-w-0 max-w-full gap-1 justify-start sm:justify-end`
// Compatibility name only: all value controls use the same gap.
export const KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME = KTV_VALUE_ROW_SCROLL_CLASS_NAME
export const KTV_VALUE_ROW_STATUS_SHELL_CLASS_NAME = 'min-w-0 max-w-full overflow-hidden'

export const KTV_ROW_TEXT_CELL_CLASS_NAME = 'flex min-w-0 max-w-full overflow-hidden'
export const KTV_ROW_LABEL_CELL_CLASS_NAME = `${KTV_ROW_TEXT_CELL_CLASS_NAME} text-ellipsis whitespace-nowrap`
export const KTV_ROW_VALUE_CELL_CLASS_NAME = `${KTV_ROW_TEXT_CELL_CLASS_NAME} self-stretch px-2 gap-2 justify-start sm:justify-end ${UI_THEME_TOKENS.text.secondary}`

export const KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME = 'grid-cols-[minmax(0,0.95fr)_minmax(2.75rem,0.42fr)_minmax(0,1.2fr)] sm:grid-cols-[minmax(0,1fr)_minmax(3rem,4.75rem)_minmax(0,1.45fr)]'

export function shouldFlushKeyTypeValueSectionTop(index: number): boolean {
  return index === 0
}

// Shared by labeled forms, inspectors, headers, and all panel surfaces.
export const KTV_FIELD_GRID_CLASS_NAME = `grid w-full min-w-0 max-w-full ${KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME} gap-x-2 gap-y-0`
export const KTV_FIELD_CONTROL_GROUP_CLASS_NAME = 'flex w-full min-w-0 items-center gap-1'

// Presentation belongs to the shared owner. Callers may add color, borders,
// visibility, and placement, but cannot introduce another field grid or font.
export function panelFieldDecorationClassName(className = ''): string {
  return className.split(/\s+/).filter(token => {
    const utility = token.replace(/^(?:[\w-]+:)+/, '').replace(/^!/, '')
    return !/^(?:grid|flex|block|inline|inline-flex|inline-grid)$/.test(utility)
      && !/^(?:grid-cols-|gap(?:-[xy])?-|space-[xy]-|[mp][trblxyse]?-|font-(?:sans|serif|mono)|text-(?:xs|sm|base|lg|xl|[2-9]xl|\[(?:[\d.]|length:)))/.test(utility)
  }).join(' ')
}
