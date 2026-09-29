import { UI_THEME_TOKENS } from './theme-tokens'

export type DataViewRowHeightPreset = 'compact' | 'comfortable'
export type DataViewFieldLineMode = 'single' | 'double' | 'flex'

export const DATA_VIEW_ROW_HEIGHT_OPTIONS = [
  { value: 'compact', label: 'Compact', description: 'Show denser rows.' },
  { value: 'comfortable', label: 'Comfortable', description: 'Show more breathing room.' },
] as const satisfies readonly {
  value: DataViewRowHeightPreset
  label: string
  description: string
}[]

export const DATA_VIEW_FIELD_LINE_OPTIONS = [
  { value: 'single', label: 'Single line', description: 'Keep fields to one preview line.' },
  { value: 'double', label: 'Two lines', description: 'Allow one extra preview line.' },
  { value: 'flex', label: 'Flex', description: 'Auto-size fields from the active layout.' },
] as const satisfies readonly {
  value: DataViewFieldLineMode
  label: string
  description: string
}[]

export function parseDataViewRowHeightPreset(raw: unknown): DataViewRowHeightPreset | null {
  if (raw === 'compact') return 'compact'
  if (raw === 'comfortable') return 'comfortable'
  return null
}

export function coerceDataViewRowHeightPreset(raw: unknown): DataViewRowHeightPreset {
  return parseDataViewRowHeightPreset(raw) || 'comfortable'
}

export function parseDataViewFieldLineMode(raw: unknown): DataViewFieldLineMode | null {
  if (raw === 'single') return 'single'
  if (raw === 'double') return 'double'
  if (raw === 'flex') return 'flex'
  return null
}

export function coerceDataViewFieldLineMode(raw: unknown): DataViewFieldLineMode {
  return parseDataViewFieldLineMode(raw) || 'single'
}

export function readDataViewRowHeightLabel(preset: DataViewRowHeightPreset): string {
  return preset === 'compact' ? 'Compact' : 'Comfortable'
}

export function readDataViewFieldLineLabel(mode: DataViewFieldLineMode): string {
  if (mode === 'flex') return 'Flex'
  return mode === 'double' ? 'Two lines' : 'Single line'
}

export function readDataViewRowPixelHeight(preset: DataViewRowHeightPreset): number {
  return preset === 'compact' ? 22 : 28
}

export function readDataViewHeaderPixelHeight(preset: DataViewRowHeightPreset): number {
  return readDataViewRowPixelHeight(preset)
}

export function readDataViewTablePaddingClassName(preset: DataViewRowHeightPreset): string {
  return preset === 'compact' ? 'px-3 py-1.5' : 'px-3 py-2'
}

export function readDataViewHeaderPaddingClassName(preset: DataViewRowHeightPreset): string {
  return preset === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'
}

export function readDataViewFieldLineClassName(mode: DataViewFieldLineMode): string {
  if (mode === 'flex') return 'whitespace-pre-wrap break-words'
  return mode === 'double'
    ? 'overflow-hidden whitespace-pre-wrap break-words line-clamp-2'
    : 'block truncate'
}

export function readDataViewSingleLineControlClassName(_preset: DataViewRowHeightPreset): string {
  return `${UI_THEME_TOKENS.control.singleLine} text-xs`
}

export function readDataViewControlPaddingClassName(preset: DataViewRowHeightPreset): string {
  return preset === 'compact' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'
}

export function readDataViewMultiLineControlClassName(options: {
  rowHeightPreset: DataViewRowHeightPreset
  fieldLineMode: DataViewFieldLineMode
}): string {
  const rowClassName = readDataViewControlPaddingClassName(options.rowHeightPreset)
  if (options.fieldLineMode === 'flex') return `${rowClassName} min-h-8`
  return options.fieldLineMode === 'double'
    ? `${rowClassName} min-h-12`
    : `${rowClassName} min-h-8`
}

export function readDataViewMultiLineControlRows(mode: DataViewFieldLineMode): number {
  if (mode === 'flex') return 0
  return mode === 'double' ? 2 : 1
}
