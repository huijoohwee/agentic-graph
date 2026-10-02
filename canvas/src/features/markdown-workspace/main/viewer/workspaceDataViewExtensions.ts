import type { WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { validateFilterTree, FILTER_LIMITS } from './workspaceDataViewFilterTree'
import { isDataViewTimeZone, parseDataViewDate } from './workspaceDataViewDates'

export function coerceDataViewExtensions(raw: Record<string, unknown>): Partial<WorkspaceDataViewConfig> {
  if (raw.v !== 3) return { sortSemantics: 'legacy' }
  if (raw.layout !== 'kanban' && raw.layout !== 'table' && raw.layout !== 'calendar') throw new Error('Unsupported view layout.')
  if (!Array.isArray(raw.sortRules) || raw.sortRules.length > FILTER_LIMITS.sorts) throw new Error('A view allows up to 16 sort fields.')
  for (const rule of raw.sortRules) {
    if (!rule || typeof rule.id !== 'string' || typeof rule.columnId !== 'string' || !['asc', 'desc'].includes(rule.direction)) throw new Error('Invalid sort rule.')
  }
  const result: Partial<WorkspaceDataViewConfig> = {
    sortSemantics: raw.sortSemantics === 'typed' ? 'typed' : 'legacy',
    filterTree: raw.filterTree === undefined ? undefined : validateFilterTree(raw.filterTree),
    hiddenGroupIds: Array.isArray(raw.hiddenGroupIds) ? raw.hiddenGroupIds.filter((id): id is string => typeof id === 'string') : [],
    hideEmptyGroups: raw.hideEmptyGroups === true,
  }
  if (raw.calendar !== undefined) {
    const c = raw.calendar as WorkspaceDataViewConfig['calendar']
    if (!c || !isDataViewTimeZone(c.timeZone) || !/^\d{4}-\d{2}$/.test(c.month) || !parseDataViewDate(`${c.month}-01`) ||
      (c.startColumnId !== null && typeof c.startColumnId !== 'string') || (c.endColumnId !== null && typeof c.endColumnId !== 'string')) throw new Error('Invalid Calendar settings. Original settings were preserved.')
    result.calendar = { ...c }
  }
  return result
}
