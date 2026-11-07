import type { MarkdownDataView, MarkdownDataViewRow } from '@/features/markdown/ui/markdownDataViewModel'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
export const dataViewGroupId = (value: string): string => value.trim() ? `value:${value.trim()}` : 'empty:'
export const dataViewGroupValue = (id: string): string => id === 'empty:' ? '' : id.slice(6)
export const dataViewGroupLabel = (id: string): string => dataViewGroupValue(id) || MARKDOWN_DATA_VIEW_COPY.ungroupedLabel
export type DataViewGroup = { key: string; value: string; label: string; rows: MarkdownDataViewRow[] }
export function projectDataViewGroups(view: MarkdownDataView, columnId: string | null): DataViewGroup[] {
  const index = view.columns.findIndex(c => c.id === columnId)
  if (index < 0) return []
  const groups = new Map<string, DataViewGroup>()
  const ensure = (value: string) => {
    const key = dataViewGroupId(value)
    if (!groups.has(key)) groups.set(key, { key, value: value.trim(), label: dataViewGroupLabel(key), rows: [] })
    return groups.get(key)!
  }
  for (const option of view.columns[index].options || []) ensure(option)
  for (const row of view.rows) ensure(String(row.cells[index] ?? '')).rows.push(row)
  ensure('')
  return [...groups.values()]
}
