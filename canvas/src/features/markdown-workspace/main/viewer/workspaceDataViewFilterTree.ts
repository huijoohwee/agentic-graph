import type { MarkdownDataView, MarkdownDataViewColumn, MarkdownDataViewRow } from '@/features/markdown/ui/markdownDataViewModel'
import type { MarkdownDataViewColumnType } from '@/features/markdown/ui/markdownDataViewColumnType'
import type { WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { parseDataViewDate } from './workspaceDataViewDates'

export type DataViewFilterOperator = 'contains' | 'equals' | 'not-equals' | 'includes' | 'one-of' | 'not-one-of' | 'empty' | 'nonempty' | 'gt' | 'gte' | 'lt' | 'lte'
export type DataViewFilterRule = { id: string; kind: 'rule'; columnId: string; operator: DataViewFilterOperator; operand: string; legacyKind?: 'text' | 'select' | 'multi-select' }
export type DataViewFilterGroup = { id: string; kind: 'group'; conjunction: 'and' | 'or'; children: DataViewFilterNode[] }
export type DataViewFilterNode = DataViewFilterRule | DataViewFilterGroup
export const FILTER_LIMITS = { depth: 8, nodes: 128, sorts: 16 } as const
export const dataViewId = (): string => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `view_${Date.now()}_${Math.random().toString(16).slice(2)}`
export const emptyFilterTree = (): DataViewFilterGroup => ({ id: dataViewId(), kind: 'group', conjunction: 'and', children: [] })
const operators: DataViewFilterOperator[] = ['contains', 'equals', 'not-equals', 'includes', 'one-of', 'not-one-of', 'empty', 'nonempty', 'gt', 'gte', 'lt', 'lte']
export const filterOperatorLabels: Record<DataViewFilterOperator, string> = { contains: 'Contains', equals: 'Equals', 'not-equals': 'Does not equal', includes: 'Includes (legacy)', 'one-of': 'Is one of', 'not-one-of': 'Is not one of', empty: 'Is empty', nonempty: 'Is not empty', gt: 'Greater than / after', gte: 'At least / on or after', lt: 'Less than / before', lte: 'At most / on or before' }
export function filterOperators(type: MarkdownDataViewColumnType): DataViewFilterOperator[] {
  if (type === 'select' || type === 'multi-select' || type === 'checkbox') return ['one-of', 'not-one-of', 'empty', 'nonempty']
  if (['number', 'progress', 'date', 'created-time'].includes(type)) return ['equals', 'not-equals', 'gt', 'gte', 'lt', 'lte', 'empty', 'nonempty']
  return ['contains', 'equals', 'not-equals', 'empty', 'nonempty']
}
export function validateFilterTree(raw: unknown): DataViewFilterGroup {
  let count = 0
  const ids = new Set<string>()
  function visit(input: unknown, depth: number): DataViewFilterNode {
    if (++count > FILTER_LIMITS.nodes || depth > FILTER_LIMITS.depth) throw new Error('Filters allow up to 128 nodes and 8 levels.')
    if (!input || typeof input !== 'object') throw new Error('Invalid filter node.')
    const node = input as DataViewFilterNode
    if (!node.id || typeof node.id !== 'string' || ids.has(node.id)) throw new Error('Filter IDs must be unique.')
    ids.add(node.id)
    if (node.kind === 'group') {
      if (!['and', 'or'].includes(node.conjunction) || !Array.isArray(node.children)) throw new Error('Invalid filter group.')
      return { id: node.id, kind: 'group', conjunction: node.conjunction, children: node.children.map(child => visit(child, depth + 1)) }
    }
    if (node.kind !== 'rule' || typeof node.columnId !== 'string' || !operators.includes(node.operator) || typeof node.operand !== 'string') throw new Error('Invalid filter rule.')
    if (node.legacyKind !== undefined && !['text', 'select', 'multi-select'].includes(node.legacyKind)) throw new Error('Invalid legacy rule.')
    return { ...node }
  }
  const result = visit(raw, 1)
  if (result.kind !== 'group') throw new Error('Filter root must be a group.')
  return result
}
export function getFilterTree(config: WorkspaceDataViewConfig): DataViewFilterGroup {
  if (config.filterTree) return config.filterTree
  return { id: 'legacy-root', kind: 'group', conjunction: 'or', children: config.filterGroups.filter(g => g.rules.length).map(g => ({
    id: `group:${g.id}`, kind: 'group', conjunction: 'and', children: g.rules.map(rule => ({ id: rule.id, kind: 'rule', columnId: rule.columnId, operator: rule.op, operand: rule.value, legacyKind: rule.columnKind })),
  })) }
}
export function updateFilterNode(root: DataViewFilterGroup, id: string, change: (node: DataViewFilterNode) => DataViewFilterNode | null): DataViewFilterGroup {
  function visit(node: DataViewFilterNode): DataViewFilterNode | null {
    if (node.id === id) return change(node)
    return node.kind === 'group' ? { ...node, children: node.children.map(visit).filter((child): child is DataViewFilterNode => !!child) } : node
  }
  const result = visit(root)
  return result?.kind === 'group' ? result : emptyFilterTree()
}
export function cloneFilterNode(node: DataViewFilterNode): DataViewFilterNode {
  return node.kind === 'rule' ? { ...node, id: dataViewId() } : { ...node, id: dataViewId(), children: node.children.map(cloneFilterNode) }
}
export function removeFilterColumn(root: DataViewFilterGroup, columnId: string): DataViewFilterGroup {
  return { ...root, children: root.children.flatMap<DataViewFilterNode>(node => node.kind === 'group' ? [removeFilterColumn(node, columnId)] : node.columnId === columnId ? [] : [node]) }
}
export function filterRuleCount(config: WorkspaceDataViewConfig, view?: MarkdownDataView): number {
  const count = (node: DataViewFilterNode): number => node.kind === 'rule' ? (view && !node.legacyKind && filterRuleIssue(node, view, config) ? 0 : 1) : node.children.reduce((n, child) => n + count(child), 0)
  return count(getFilterTree(config))
}
export function dataViewColumnType(column: MarkdownDataViewColumn, config: WorkspaceDataViewConfig): MarkdownDataViewColumnType { return config.columnTypesById?.[column.id] || column.kind }
export function typedQueryValue(value: string, type: MarkdownDataViewColumnType): string | number | null {
  if (!value.trim()) return null
  if (type === 'number' || type === 'progress') { const n = Number(value); return Number.isFinite(n) ? n : null }
  if (type === 'date' || type === 'created-time') return parseDataViewDate(value)?.value ?? null
  return value.trim().toLowerCase()
}
const normalized = (value: string): string => value.trim().toLowerCase()
const setValues = (value: string): string[] => value.split(',').map(normalized).filter(Boolean)
export function filterRuleIssue(rule: DataViewFilterRule, view: MarkdownDataView, config: WorkspaceDataViewConfig): string | null {
  const column = view.columns.find(c => c.id === rule.columnId)
  if (rule.legacyKind) return !column || !rule.operand.trim() ? 'Legacy pass-through: all records match this rule until edited or removed.' : null
  if (!column) return 'Missing property: this rule is inactive.'
  if (rule.operator === 'empty' || rule.operator === 'nonempty') return null
  if (!rule.operand.trim()) return 'Draft: choose a value to activate this rule.'
  const type = dataViewColumnType(column, config)
  if (!filterOperators(type).includes(rule.operator)) return 'Operator does not support this property type; rule is inactive.'
  if (typedQueryValue(rule.operand, type) === null) return 'Invalid typed value: this rule is inactive.'
  return null
}
export function evaluateFilterTree(root: DataViewFilterGroup, row: MarkdownDataViewRow, view: MarkdownDataView, config: WorkspaceDataViewConfig): boolean {
  function evaluate(node: DataViewFilterNode): boolean | null {
    if (node.kind === 'group') {
      const values = node.children.map(evaluate).filter((value): value is boolean => value !== null)
      return !values.length ? null : node.conjunction === 'and' ? values.every(Boolean) : values.some(Boolean)
    }
    const index = view.columns.findIndex(c => c.id === node.columnId)
    const raw = String(row.cells[index] ?? ''), cell = normalized(raw), operand = normalized(node.operand)
    if (node.legacyKind) {
      if (index < 0 || !operand) return true
      if (node.operator === 'equals') return cell === operand
      if (node.operator === 'includes' && node.legacyKind === 'multi-select') return setValues(raw).includes(operand)
      return cell.includes(operand)
    }
    if (filterRuleIssue(node, view, config)) return null
    if (node.operator === 'empty') return !cell
    if (node.operator === 'nonempty') return !!cell
    if (node.operator === 'one-of' || node.operator === 'not-one-of') {
      const values = dataViewColumnType(view.columns[index], config) === 'multi-select' ? setValues(raw) : [cell]
      const has = setValues(node.operand).some(value => values.includes(value))
      return node.operator === 'one-of' ? has : !has
    }
    if (node.operator === 'contains') return cell.includes(operand)
    const type = dataViewColumnType(view.columns[index], config), a = typedQueryValue(raw, type), b = typedQueryValue(node.operand, type)
    if (a === null || b === null) return false
    switch (node.operator) {
      case 'equals': return a === b
      case 'not-equals': return a !== b
      case 'gt': return a > b
      case 'gte': return a >= b
      case 'lt': return a < b
      case 'lte': return a <= b
      default: return false
    }
  }
  return evaluate(root) ?? true
}

/** Column-header quick filters enter the same expression owner as the settings editor. */
export function upsertDataViewColumnFilter(config: WorkspaceDataViewConfig, args: { columnId: string; columnKind: 'text' | 'select' | 'multi-select'; op: 'contains' | 'equals' | 'includes'; value: string }): WorkspaceDataViewConfig {
  const value = args.value.trim(), root = removeFilterColumn(getFilterTree(config), args.columnId)
  const rule: DataViewFilterRule = { id: dataViewId(), kind: 'rule', columnId: args.columnId, operator: args.columnKind !== 'text' ? 'one-of' : args.op, operand: value }
  const filterTree: DataViewFilterGroup = value ? { ...emptyFilterTree(), children: [...(root.children.length ? [root] : []), rule] } : root
  validateFilterTree(filterTree)
  return { ...config, v: 3, filterTree, filterGroups: [] }
}
