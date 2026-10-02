import type { MarkdownDataView, MarkdownDataViewColumnKind } from '@/features/markdown/ui/markdownDataViewModel'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import type { WorkspaceDataViewConfig, WorkspaceDataViewQueryState, WorkspaceDataViewFilterOp, WorkspaceDataViewFilterGroup, WorkspaceDataViewSortRule } from './workspaceDataViewConfig'

const normalizeSearch = (v: string): string => String(v || '').trim().toLowerCase()

const splitMultiValues = (raw: string): string[] => {
  return String(raw ?? '')
    .split(',')
    .map(x => String(x ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const matchRule = (cell: string, kind: MarkdownDataViewColumnKind, op: WorkspaceDataViewFilterOp, needle: string): boolean => {
  const n = normalizeSearch(needle)
  if (!n) return true
  const v = String(cell ?? '').trim()
  const lower = v.toLowerCase()

  if (op === 'equals') return lower === n
  if (op === 'includes') {
    if (kind !== 'multi-select') return lower.includes(n)
    return splitMultiValues(v).some(x => x.toLowerCase() === n)
  }
  return lower.includes(n)
}

export function computeWorkspaceDataViewGroupOptions(args: { view: MarkdownDataView; groupByColumnId: string | null }): string[] {
  const groupById = args.groupByColumnId ? String(args.groupByColumnId).trim() : ''
  if (!groupById) return []
  const groupIndex = args.view.columns.findIndex(c => c.id === groupById)
  if (groupIndex < 0) return []
  const col = args.view.columns[groupIndex]
  const opts = Array.isArray(col.options) ? col.options.map(x => String(x || '').trim()).filter(Boolean) : []
  const set = new Set<string>(opts)
  for (const r of args.view.rows) {
    const g = String(r.cells[groupIndex] ?? '').trim() || MARKDOWN_DATA_VIEW_COPY.ungroupedLabel
    set.add(g)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export function applyLegacyWorkspaceDataViewQuery(args: {
  view: MarkdownDataView
  viewConfig: WorkspaceDataViewConfig | null
  state: WorkspaceDataViewQueryState
}): MarkdownDataView {
  const baseView = args.view
  const q = normalizeSearch(args.state.searchQuery)
  const filterGroups = args.state.visibleGroups
  const sortMode = args.state.sortMode
  const dataFilters: WorkspaceDataViewFilterGroup[] = args.viewConfig?.filterGroups || []
  const configSortRule: WorkspaceDataViewSortRule | null = args.viewConfig?.sortRules?.[0] || null

  const needsFilter = Boolean(q || filterGroups || dataFilters.some(g => g.rules.length))
  const needsSort = !!configSortRule || sortMode !== 'none'
  if (!needsFilter && !needsSort) return baseView

  const titleIndex = baseView.columns.findIndex(c => c.id === baseView.titleColumnId)
  const groupIndex = baseView.groupByColumnId ? baseView.columns.findIndex(c => c.id === baseView.groupByColumnId) : -1
  const allowedGroups = filterGroups ? new Set(filterGroups.map(x => String(x || '').trim()).filter(Boolean)) : null

  const columnIndexById = new Map<string, number>()
  for (let i = 0; i < baseView.columns.length; i += 1) {
    columnIndexById.set(baseView.columns[i].id, i)
  }

  const rowPassesDataFilters = (row: (typeof baseView.rows)[number]): boolean => {
    if (!dataFilters.length) return true
    let hasAnyRules = false
    for (const g of dataFilters) {
      if (!g.rules.length) continue
      hasAnyRules = true
      let ok = true
      for (const r of g.rules) {
        const idx = columnIndexById.get(r.columnId) ?? -1
        if (idx < 0) continue
        if (!matchRule(String(row.cells[idx] ?? ''), r.columnKind, r.op, r.value)) {
          ok = false
          break
        }
      }
      if (ok) return true
    }
    return !hasAnyRules
  }

  let rows = baseView.rows
  if (needsFilter) {
    rows = rows.filter(r => {
      if (allowedGroups && groupIndex >= 0) {
        const g = String(r.cells[groupIndex] ?? '').trim() || MARKDOWN_DATA_VIEW_COPY.ungroupedLabel
        if (!allowedGroups.has(g)) return false
      }
      if (!rowPassesDataFilters(r)) return false
      if (!q) return true
      if (titleIndex >= 0) {
        const title = String(r.cells[titleIndex] ?? '')
        if (title.toLowerCase().includes(q)) return true
      }
      for (let i = 0; i < baseView.columns.length; i += 1) {
        if (i === titleIndex) continue
        const v = String(r.cells[i] ?? '')
        if (v && v.toLowerCase().includes(q)) return true
      }
      return false
    })
  }

  if (needsSort) {
    const sortColumnIndex = configSortRule ? (columnIndexById.get(configSortRule.columnId) ?? -1) : titleIndex
    if (sortColumnIndex < 0) {
      return rows === baseView.rows ? baseView : { ...baseView, rows }
    }
    const dir = configSortRule ? (configSortRule.direction === 'desc' ? -1 : 1) : (sortMode === 'title_desc' ? -1 : 1)
    rows = [...rows].sort((a, b) => {
      const ta = String(a.cells[sortColumnIndex] ?? '')
      const tb = String(b.cells[sortColumnIndex] ?? '')
      return dir * ta.localeCompare(tb)
    })
  }

  return rows === baseView.rows ? baseView : { ...baseView, rows }
}

