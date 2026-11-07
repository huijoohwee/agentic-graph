import type { MarkdownDataView } from '@/features/markdown/ui/markdownDataViewModel'
import type { WorkspaceDataViewConfig, WorkspaceDataViewQueryState } from './workspaceDataViewConfig'
import { applyLegacyWorkspaceDataViewQuery } from './workspaceDataViewLegacyQuery'
import { dataViewColumnType, evaluateFilterTree, typedQueryValue } from './workspaceDataViewFilterTree'

/** One query owner for Table, Kanban and Calendar. Legacy ordering is opt-in to convert. */
export function applyWorkspaceDataViewQuery(args: { view: MarkdownDataView; viewConfig: WorkspaceDataViewConfig | null; state: WorkspaceDataViewQueryState }): MarkdownDataView {
  const config = args.viewConfig
  if (!config) return applyLegacyWorkspaceDataViewQuery(args)
  let result = applyLegacyWorkspaceDataViewQuery({ ...args, viewConfig: { ...config,
    filterGroups: config.filterTree ? [] : config.filterGroups,
    sortRules: config.sortSemantics === 'typed' ? [] : config.sortRules,
  }, state: { ...args.state, sortMode: config.sortSemantics === 'typed' && config.sortRules.length ? 'none' : args.state.sortMode } })
  if (config.filterTree) result = { ...result, rows: result.rows.filter(row => evaluateFilterTree(config.filterTree!, row, args.view, config)) }
  if (config.sortSemantics !== 'typed' || !config.sortRules.length) return result
  const rules = config.sortRules.filter(rule => rule.enabled !== false).map(rule => ({ ...rule, index: result.columns.findIndex(c => c.id === rule.columnId) })).filter(rule => rule.index >= 0)
  if (!rules.length) return result
  const rows = result.rows.map((row, index) => ({ row, index })).sort((a, b) => {
    for (const rule of rules) {
      const type = dataViewColumnType(result.columns[rule.index], config)
      const ar = a.row.cells[rule.index] ?? '', br = b.row.cells[rule.index] ?? ''
      const av = typedQueryValue(ar, type), bv = typedQueryValue(br, type)
      // Valid values, then invalid typed values, then nulls, in either direction.
      const rank = (raw: string, value: unknown): number => !raw.trim() ? 2 : value === null ? 1 : 0
      const rankDiff = rank(ar, av) - rank(br, bv)
      if (rankDiff) return rankDiff
      if (av === null || bv === null) continue
      const compared = av < bv ? -1 : av > bv ? 1 : 0
      if (compared) return (rule.direction === 'desc' ? -1 : 1) * compared
    }
    return a.index - b.index
  }).map(entry => entry.row)
  return { ...result, rows }
}
