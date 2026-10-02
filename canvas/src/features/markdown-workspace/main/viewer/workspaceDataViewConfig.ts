import { normalizeComposedSourcePath } from '@/features/source-files/composedSourceSelection'
import { notifyDataViewState } from './workspaceDataViewStateEvents'
import { coerceDataViewExtensions } from './workspaceDataViewExtensions'
import { removeFilterColumn } from './workspaceDataViewFilterTree'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { getMarkdownDataViewConfigStorageKey } from '@/lib/config'
import { getLocalStorage, writeJsonToStorage } from '@/lib/persistence'
import type { MarkdownDataViewColumnKind } from '@/features/markdown/ui/markdownDataViewModel'
import type { MarkdownDataViewColumnType } from '@/features/markdown/ui/markdownDataViewColumnType'
import { coerceMarkdownDataViewColumnType } from '@/features/markdown/ui/markdownDataViewColumnType'
import {
  coerceDataViewFieldLineMode,
  coerceDataViewRowHeightPreset,
  type DataViewFieldLineMode,
  type DataViewRowHeightPreset,
} from '@/lib/ui/dataViewDensity'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

export type WorkspaceDataViewLayout = 'kanban' | 'table' | 'calendar'
export type WorkspaceDataViewOrientation = 'rows' | 'columns'
export type WorkspaceStructuredSourceValueColumnMode = 'type-specific' | 'type-generic'

export type WorkspaceDataViewFilterOp = 'contains' | 'equals' | 'includes'

export type WorkspaceDataViewFilterRule = { id: string; columnId: string; columnKind: MarkdownDataViewColumnKind; op: WorkspaceDataViewFilterOp; value: string }
export type WorkspaceDataViewFilterGroup = { id: string; rules: WorkspaceDataViewFilterRule[] }

export type WorkspaceDataViewSortDirection = 'asc' | 'desc'

export type WorkspaceDataViewSortRule = { id: string; columnId: string; direction: WorkspaceDataViewSortDirection; enabled?: boolean }

export type WorkspaceDataViewGraphColumnRole =
  | 'none'
  | 'node'
  | 'color'
  | 'group'
  | 'dependsOn'
  | 'predecessor'
  | 'successor'

export type WorkspaceDataViewViewV2 = {
  v: 2 | 3
  id: string
  name: string
  layout: WorkspaceDataViewLayout
  groupByColumnId: string | null
  visibleColumnIds: string[] | null
  columnTypesById: Record<string, MarkdownDataViewColumnType> | null
  filterGroups: WorkspaceDataViewFilterGroup[]
  sortRules: WorkspaceDataViewSortRule[]
  filterTree?: import('./workspaceDataViewFilterTree').DataViewFilterGroup
  sortSemantics?: 'legacy' | 'typed'
  hiddenGroupIds?: string[]
  hideEmptyGroups?: boolean
  calendar?: { startColumnId: string | null; endColumnId: string | null; timeZone: string; month: string }
  /** Read failures block persistence so unsupported or malformed bytes remain recoverable. */
  recoveryError?: string
  orientation?: WorkspaceDataViewOrientation
  structuredSourceValueColumnMode?: WorkspaceStructuredSourceValueColumnMode
  rowHeightPreset?: DataViewRowHeightPreset
  fieldLineMode?: DataViewFieldLineMode
  graphEnabled?: boolean
  geospatialViewEnabled?: boolean
  graphRolesByColumnId?: Record<string, WorkspaceDataViewGraphColumnRole> | null
}

export type WorkspaceDataViewStateV1 = {
  sv: 1
  activeViewId: string
  views: WorkspaceDataViewViewV2[]
}

export type WorkspaceDataViewState = WorkspaceDataViewStateV1

export type WorkspaceDataViewConfig = WorkspaceDataViewViewV2

export type WorkspaceDataViewQueryState = {
  searchQuery: string
  visibleGroups: readonly string[] | null
  sortMode: 'none' | 'title_asc' | 'title_desc'
}

export { applyWorkspaceDataViewQuery } from './workspaceDataViewQuery'
export { computeWorkspaceDataViewGroupOptions } from './workspaceDataViewLegacyQuery'

export function defaultWorkspaceDataViewConfig(args: {
  title: string
  layout: WorkspaceDataViewLayout
  groupByColumnId: string | null
}): WorkspaceDataViewConfig {
  return {
    ...DEFAULT_VIEW,
    id: 'v0',
    v: 3,
    sortSemantics: 'typed',
    name: String(args.title || '').trim() || DEFAULT_VIEW.name,
    layout: args.layout,
    groupByColumnId: args.groupByColumnId ? String(args.groupByColumnId).trim() || null : null,
  }
}

export function duplicateWorkspaceDataViewConfigColumn(args: {
  viewConfig: WorkspaceDataViewConfig
  sourceColumnId: string
  nextColumnId: string
}): WorkspaceDataViewConfig {
  const sourceColumnId = String(args.sourceColumnId || '').trim()
  const nextColumnId = String(args.nextColumnId || '').trim()
  if (!sourceColumnId || !nextColumnId) return args.viewConfig

  const nextVisibleColumnIds = (() => {
    const current = args.viewConfig.visibleColumnIds
    if (!current) return current
    const sourceIndex = current.indexOf(sourceColumnId)
    if (sourceIndex < 0) return current
    const next = current.slice()
    next.splice(sourceIndex + 1, 0, nextColumnId)
    return next
  })()

  const nextColumnTypesById = (() => {
    const current = args.viewConfig.columnTypesById
    if (!current || !current[sourceColumnId]) return current
    return { ...current, [nextColumnId]: current[sourceColumnId] }
  })()

  const nextGraphRolesByColumnId = (() => {
    const current = args.viewConfig.graphRolesByColumnId
    if (!current || !current[sourceColumnId]) return current
    return { ...current, [nextColumnId]: current[sourceColumnId] }
  })()

  return {
    ...args.viewConfig,
    visibleColumnIds: nextVisibleColumnIds,
    columnTypesById: nextColumnTypesById,
    graphRolesByColumnId: nextGraphRolesByColumnId,
  }
}

export function removeWorkspaceDataViewConfigColumn(args: {
  viewConfig: WorkspaceDataViewConfig
  columnId: string
  nextGroupByColumnId: string | null
}): WorkspaceDataViewConfig {
  const columnId = String(args.columnId || '').trim()
  if (!columnId) return args.viewConfig

  const visibleColumnIds = args.viewConfig.visibleColumnIds
    ? args.viewConfig.visibleColumnIds.filter(id => id !== columnId)
    : null

  const columnTypesById = (() => {
    if (!args.viewConfig.columnTypesById || !(columnId in args.viewConfig.columnTypesById)) {
      return args.viewConfig.columnTypesById
    }
    const next = { ...args.viewConfig.columnTypesById }
    delete next[columnId]
    return Object.keys(next).length ? next : null
  })()

  const graphRolesByColumnId = (() => {
    if (!args.viewConfig.graphRolesByColumnId || !(columnId in args.viewConfig.graphRolesByColumnId)) {
      return args.viewConfig.graphRolesByColumnId
    }
    const next = { ...args.viewConfig.graphRolesByColumnId }
    delete next[columnId]
    return Object.keys(next).length ? next : null
  })()

  const filterGroups = args.viewConfig.filterGroups.map(group => ({
    ...group,
    rules: group.rules.filter(rule => rule.columnId !== columnId),
  }))

  const sortRules = args.viewConfig.sortRules.filter(rule => rule.columnId !== columnId)

  return {
    ...args.viewConfig,
    groupByColumnId: args.viewConfig.groupByColumnId === columnId ? args.nextGroupByColumnId : args.viewConfig.groupByColumnId,
    visibleColumnIds,
    columnTypesById,
    filterGroups,
    filterTree: args.viewConfig.filterTree ? removeFilterColumn(args.viewConfig.filterTree, columnId) : undefined,
    calendar: args.viewConfig.calendar ? { ...args.viewConfig.calendar, startColumnId: args.viewConfig.calendar.startColumnId === columnId ? null : args.viewConfig.calendar.startColumnId, endColumnId: args.viewConfig.calendar.endColumnId === columnId ? null : args.viewConfig.calendar.endColumnId } : undefined,
    sortRules,
    graphRolesByColumnId,
  }
}

const DEFAULT_VIEW: WorkspaceDataViewViewV2 = {
  v: 2,
  id: 'v0',
  name: MARKDOWN_DATA_VIEW_COPY.kanbanViewLabel,
  layout: 'kanban',
  groupByColumnId: null,
  visibleColumnIds: null,
  columnTypesById: null,
  filterGroups: [{ id: 'g0', rules: [] }],
  sortRules: [],
  orientation: 'rows',
  structuredSourceValueColumnMode: 'type-specific',
  rowHeightPreset: 'comfortable',
  fieldLineMode: 'single',
}

const DEFAULT_STATE: WorkspaceDataViewStateV1 = {
  sv: 1,
  activeViewId: 'v0',
  views: [DEFAULT_VIEW],
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function normalizeWorkspaceDataViewLayout(v: unknown): WorkspaceDataViewLayout {
  const s = String(v || '').trim()
  return s === 'calendar' ? 'calendar' : s === 'table' ? 'table' : 'kanban'
}

function normalizeWorkspaceDataViewOrientation(v: unknown): WorkspaceDataViewOrientation {
  return String(v || '').trim() === 'columns' ? 'columns' : 'rows'
}

export function coerceStructuredSourceValueColumnMode(v: unknown): WorkspaceStructuredSourceValueColumnMode {
  return String(v || '').trim() === 'type-generic' ? 'type-generic' : 'type-specific'
}

function normalizeFilterOp(v: unknown): WorkspaceDataViewFilterOp {
  const s = String(v || '').trim()
  if (s === 'equals') return 'equals'
  if (s === 'includes') return 'includes'
  return 'contains'
}

function normalizeSortDirection(v: unknown): WorkspaceDataViewSortDirection {
  return String(v || '').trim() === 'desc' ? 'desc' : 'asc'
}

function coerceRule(raw: unknown): WorkspaceDataViewFilterRule | null {
  if (!isRecord(raw)) return null
  const id = String(raw.id || '').trim()
  const columnId = String(raw.columnId || '').trim()
  const columnKind = String(raw.columnKind || '').trim() as MarkdownDataViewColumnKind
  const op = normalizeFilterOp(raw.op)
  const value = String(raw.value || '')
  if (!id || !columnId) return null
  if (!columnKind) return null
  return { id, columnId, columnKind, op, value }
}

function coerceGroup(raw: unknown): WorkspaceDataViewFilterGroup | null {
  if (!isRecord(raw)) return null
  const id = String(raw.id || '').trim()
  if (!id) return null
  const rulesRaw = Array.isArray(raw.rules) ? raw.rules : []
  const rules = rulesRaw.map(coerceRule).filter((x): x is WorkspaceDataViewFilterRule => !!x)
  return { id, rules }
}

function coerceSortRule(raw: unknown): WorkspaceDataViewSortRule | null {
  if (!isRecord(raw)) return null
  const id = String(raw.id || '').trim()
  const columnId = String(raw.columnId || '').trim()
  if (!id || !columnId) return null
  const direction = normalizeSortDirection(raw.direction)
  return { id, columnId, direction, ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}) }
}

function coerceGraphRolesByColumnId(raw: unknown): Record<string, WorkspaceDataViewGraphColumnRole> {
  if (!isRecord(raw)) return {}
  const out: Record<string, WorkspaceDataViewGraphColumnRole> = {}
  for (const [k, v] of Object.entries(raw)) {
    const id = String(k || '').trim()
    if (!id) continue
    const role = String(v || '').trim()
    if (
      role === 'none' ||
      role === 'node' ||
      role === 'color' ||
      role === 'group' ||
      role === 'dependsOn' ||
      role === 'predecessor' ||
      role === 'successor'
    ) {
      out[id] = role
    }
  }
  return out
}

export function coerceWorkspaceDataViewConfig(raw: unknown): WorkspaceDataViewConfig | null {
  if (!isRecord(raw)) return null

  if (raw.v === 2 || raw.v === 3) {
    const id = String(raw.id || '').trim()
    const name = String(raw.name || '').trim() || DEFAULT_VIEW.name
    const layout = normalizeWorkspaceDataViewLayout(raw.layout)
    const groupByColumnId = typeof raw.groupByColumnId === 'string' ? (raw.groupByColumnId.trim() || null) : null

    const visibleColumnIds = Array.isArray(raw.visibleColumnIds)
      ? raw.visibleColumnIds.map(String).map(s => s.trim()).filter(Boolean)
      : null

    const columnTypesById = (() => {
      if (!isRecord(raw.columnTypesById)) return null
      const out: Record<string, MarkdownDataViewColumnType> = {}
      for (const [k, v] of Object.entries(raw.columnTypesById)) {
        const colId = String(k || '').trim()
        if (!colId) continue
        const t = coerceMarkdownDataViewColumnType(v)
        if (!t) continue
        out[colId] = t
      }
      return Object.keys(out).length ? out : null
    })()

    const groupsRaw = Array.isArray(raw.filterGroups) ? raw.filterGroups : []
    const filterGroups = groupsRaw.map(coerceGroup).filter((x): x is WorkspaceDataViewFilterGroup => !!x)
    const normalizedGroups = filterGroups.length ? filterGroups : DEFAULT_VIEW.filterGroups

    const sortRulesRaw = Array.isArray(raw.sortRules) ? raw.sortRules : []
    const sortRules = sortRulesRaw.map(coerceSortRule).filter((x): x is WorkspaceDataViewSortRule => !!x)
    const orientation = normalizeWorkspaceDataViewOrientation(raw.orientation)
    const structuredSourceValueColumnMode = coerceStructuredSourceValueColumnMode(raw.structuredSourceValueColumnMode)
    const rowHeightPreset = coerceDataViewRowHeightPreset(raw.rowHeightPreset)
    const fieldLineMode = coerceDataViewFieldLineMode(raw.fieldLineMode)

    const graphEnabled = typeof raw.graphEnabled === 'boolean' ? raw.graphEnabled : undefined
    const geospatialViewEnabled = typeof raw.geospatialViewEnabled === 'boolean' ? raw.geospatialViewEnabled : undefined
    const graphRolesByColumnId = (() => {
      if (!isRecord(raw.graphRolesByColumnId)) return null
      const m = coerceGraphRolesByColumnId(raw.graphRolesByColumnId)
      return Object.keys(m).length ? m : null
    })()

    if (!id) return null
    return {
      v: raw.v,
      ...coerceDataViewExtensions(raw),
      id,
      name,
      layout,
      groupByColumnId,
      visibleColumnIds,
      columnTypesById,
      filterGroups: normalizedGroups,
      sortRules,
      orientation,
      structuredSourceValueColumnMode,
      rowHeightPreset,
      fieldLineMode,
      graphEnabled,
      geospatialViewEnabled,
      graphRolesByColumnId,
    }
  }

  return null
}

function coerceWorkspaceDataViewState(raw: unknown, fallback: WorkspaceDataViewStateV1): WorkspaceDataViewStateV1 {
  if (isRecord(raw) && raw.sv === 1) {
    const activeViewId = String(raw.activeViewId || '').trim()
    const viewsRaw = Array.isArray(raw.views) ? raw.views : []
    const parsed = viewsRaw.map(coerceWorkspaceDataViewConfig)
    if (parsed.some(view => !view)) throw new Error('Unsupported saved view. Original settings were preserved.')
    const views = parsed as WorkspaceDataViewViewV2[]
    if (views.length > 0) {
      const resolvedActive = activeViewId && views.some(v => v.id === activeViewId) ? activeViewId : views[0]!.id
      return { sv: 1, activeViewId: resolvedActive, views }
    }
  }

  if (raw != null) throw new Error('Invalid saved view state. Original settings were preserved.')
  return fallback
}

export function ensureWorkspaceDataViewState(raw: unknown, fallbackView: WorkspaceDataViewConfig): WorkspaceDataViewState {
  const fallback: WorkspaceDataViewState = {
    sv: 1,
    activeViewId: fallbackView.id || 'v0',
    views: [{ ...fallbackView, id: fallbackView.id || 'v0' }],
  }
  return coerceWorkspaceDataViewState(raw, fallback)
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export function getWorkspaceDataViewActiveView(args: {
  state: WorkspaceDataViewState
}): { viewId: string; view: WorkspaceDataViewConfig } {
  const id = String(args.state.activeViewId || '').trim()
  const view = args.state.views.find(v => v.id === id) || args.state.views[0]
  const resolved = view?.id || id || 'v0'
  return { viewId: resolved, view: (view as WorkspaceDataViewConfig) || DEFAULT_VIEW }
}

export function duplicateWorkspaceDataViewInState(args: {
  state: WorkspaceDataViewState
  viewId: string
}): WorkspaceDataViewState {
  const sourceId = String(args.viewId || '').trim()
  const source = args.state.views.find(v => v.id === sourceId) || args.state.views[0]
  if (!source) return args.state

  const nextId = makeId()
  const nextName = `${String(source.name || 'View')} Copy`
  const copy: WorkspaceDataViewViewV2 = { ...JSON.parse(JSON.stringify(source)), id: nextId, name: nextName }
  return { sv: 1, activeViewId: nextId, views: [...args.state.views, copy] }
}

export function deleteWorkspaceDataViewFromState(args: {
  state: WorkspaceDataViewState
  viewId: string
}): WorkspaceDataViewState {
  if (args.state.views.length <= 1) return args.state
  const id = String(args.viewId || '').trim()
  const remaining = args.state.views.filter(v => v.id !== id)
  if (remaining.length === args.state.views.length) return args.state
  const nextActive = remaining.some(view => view.id === args.state.activeViewId) ? args.state.activeViewId : remaining[0]!.id
  return { sv: 1, activeViewId: nextActive, views: remaining }
}

export function buildWorkspaceDataViewScopeKey(args: { activeDocumentPath: string | null; tableId: string }): string {
  const doc = normalizeComposedSourcePath(args.activeDocumentPath).replace(/^\//, '') || 'unknown-doc'
  // End lines change when records are appended; the table start owns saved settings.
  const tid = (String(args.tableId || '').trim() || 'unknown-table').replace(/^(md-block:\d+)-\d+$/, '$1')
  return `mdDataView:${doc}::${tid}`
}

export function buildWorkspaceDataViewSourceTableId(rowCountRaw: number): string {
  const rowCount = Number.isFinite(rowCountRaw) ? Math.max(0, Math.floor(rowCountRaw)) : 0
  return `md-block:1-${Math.max(1, rowCount + 2)}`
}

export function readWorkspaceDataViewStateWithMeta(args: {
  activeDocumentPath: string | null
  tableId: string
  fallback?: WorkspaceDataViewStateV1
}): { state: WorkspaceDataViewStateV1; hasStoredValue: boolean } {
  const scopeKey = buildWorkspaceDataViewScopeKey({ activeDocumentPath: args.activeDocumentPath, tableId: args.tableId })
  const hashed = hashStringToHex(scopeKey)
  const storageKey = getMarkdownDataViewConfigStorageKey(hashed)
  const storage = getLocalStorage()
  const doc = normalizeComposedSourcePath(args.activeDocumentPath) || 'unknown-doc'
  const documents = [...new Set([doc.replace(/^\//, ''), doc, String(args.activeDocumentPath || '').trim() || 'unknown-doc', `workspace:${doc}`])]
  const table = String(args.tableId || '').trim() || 'unknown-table'
  const tables = [...new Set([table.replace(/^(md-block:\d+)-\d+$/, '$1'), table])]
  const keys = [...new Set([storageKey, ...documents.flatMap(path => tables.map(id => getMarkdownDataViewConfigStorageKey(hashStringToHex(`mdDataView:${path}::${id}`))))])]
  let hasStoredValue = false
  const fallback = args.fallback ?? DEFAULT_STATE
  try {
    // A corrupt canonical value must fail closed, never fall through to an older alias.
    const raw = [...keys.map(key => `${key}:v3`), ...keys].map(key => storage?.getItem(key)).find(value => value != null)
    hasStoredValue = raw != null
    const state = raw == null ? fallback : coerceWorkspaceDataViewState(JSON.parse(raw), fallback)
    // Promote a validated path/range alias before source edits change the end line.
    // Retain the legacy bytes so the previous build can still read its own namespace.
    if (raw != null && storage && storage.getItem(`${storageKey}:v3`) == null) {
      storage.setItem(`${storageKey}:v3`, raw)
    }
    return { state, hasStoredValue }
  } catch (error) {
    let safe = fallback
    try { const backup = storage.getItem(`${storageKey}:v3:last-valid`); if (backup) safe = coerceWorkspaceDataViewState(JSON.parse(backup), fallback) } catch { /* Keep caller fallback; original bytes are untouched. */ }
    return { state: { ...safe, views: safe.views.map(view => ({ ...view, recoveryError: String(error) })) }, hasStoredValue }
  }
}

export function writeWorkspaceDataViewState(args: {
  activeDocumentPath: string | null
  tableId: string
  value: WorkspaceDataViewStateV1
}): void {
  const scopeKey = buildWorkspaceDataViewScopeKey({ activeDocumentPath: args.activeDocumentPath, tableId: args.tableId })
  const hashed = hashStringToHex(scopeKey)
  const storageKey = getMarkdownDataViewConfigStorageKey(hashed)
  const storage = getLocalStorage()
  if (!storage) throw new Error('Saved view storage is unavailable.')
  if (args.value.views.some(view => view.recoveryError)) return
  const value = { ...args.value, views: args.value.views.map(view => ({ ...view, v: 3 as const, sortSemantics: view.sortSemantics ?? 'legacy' as const })) }
  coerceWorkspaceDataViewState(value, DEFAULT_STATE)
  const key = `${storageKey}:v3`
  const previous = storage.getItem(key)
  if (previous) {
    try { coerceWorkspaceDataViewState(JSON.parse(previous), DEFAULT_STATE) } catch { throw new Error('Stored settings changed or became invalid; reload to recover without overwriting them.') }
    storage.setItem(`${key}:last-valid`, previous)
  }
  storage.setItem(key, JSON.stringify(value))
  notifyDataViewState(scopeKey)
}

export function readWorkspaceDataViewConfig(args: {
  activeDocumentPath: string | null
  tableId: string
  fallback?: WorkspaceDataViewConfig
}): WorkspaceDataViewConfig {
  const { state } = readWorkspaceDataViewStateWithMeta({ activeDocumentPath: args.activeDocumentPath, tableId: args.tableId, fallback: args.fallback ? { sv: 1, activeViewId: args.fallback.id, views: [args.fallback] } : undefined })
  const active = state.views.find(v => v.id === state.activeViewId) || state.views[0]
  return active || (args.fallback ?? DEFAULT_VIEW)
}

export function writeWorkspaceDataViewConfig(args: {
  activeDocumentPath: string | null
  tableId: string
  value: WorkspaceDataViewConfig
}): void {
  const { state } = readWorkspaceDataViewStateWithMeta({ activeDocumentPath: args.activeDocumentPath, tableId: args.tableId })
  if (state.views.some(view => view.recoveryError) || args.value.recoveryError) return
  const id = String(args.value.id || state.activeViewId || 'v0')
  const nextViews = state.views.map(v => (v.id === id ? { ...args.value, id } : v))
  const hasMatch = nextViews.some(v => v.id === id)
  const normalized = hasMatch ? nextViews : [{ ...args.value, id }, ...nextViews]
  writeWorkspaceDataViewState({
    activeDocumentPath: args.activeDocumentPath,
    tableId: args.tableId,
    value: { sv: 1, activeViewId: state.activeViewId || id, views: normalized },
  })
}
