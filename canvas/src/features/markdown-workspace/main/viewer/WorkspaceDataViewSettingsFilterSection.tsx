import React from 'react'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import type { WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { DataViewAction } from './WorkspaceDataViewSettingsActions'
import { cloneFilterNode, dataViewColumnType, dataViewId, emptyFilterTree, filterOperatorLabels, filterOperators, filterRuleIssue, getFilterTree, updateFilterNode, validateFilterTree, type DataViewFilterNode, type DataViewFilterOperator } from './workspaceDataViewFilterTree'

export function WorkspaceDataViewSettingsFilterSection(props: {
  columns: readonly MarkdownDataViewColumn[]; view: WorkspaceDataViewConfig; onChangeView: (next: WorkspaceDataViewConfig) => void
}) {
  const root = getFilterTree(props.view)
  const [error, setError] = React.useState('')
  const commit = (next: typeof root) => {
    try { validateFilterTree(next); props.onChangeView({ ...props.view, v: 3, filterTree: next, filterGroups: [] }); setError('') }
    catch (reason) { setError(String(reason)) }
  }
  const change = (id: string, update: (node: DataViewFilterNode) => DataViewFilterNode | null) => commit(updateFilterNode(root, id, update))
  const add = (id: string, group: boolean) => change(id, node => node.kind === 'group' ? { ...node, children: [...node.children, group ? emptyFilterTree() : {
    id: dataViewId(), kind: 'rule', columnId: props.columns[0]?.id || '', operator: filterOperators(props.columns[0] ? dataViewColumnType(props.columns[0], props.view) : 'text')[0], operand: '',
  }] } : node)
  const duplicate = (id: string) => {
    function visit(node: DataViewFilterNode): DataViewFilterNode {
      return node.kind === 'rule' ? node : { ...node, children: node.children.flatMap(child => child.id === id ? [child, cloneFilterNode(child)] : [visit(child)]) }
    }
    commit(visit(root) as typeof root)
  }
  const render = (node: DataViewFilterNode, level: number): React.ReactNode => {
    const isRoot = node.id === root.id
    if (node.kind === 'group') return <fieldset key={node.id} className={['min-w-0 rounded border p-2 space-y-2', UI_THEME_TOKENS.panel.border].join(' ')} aria-label={isRoot ? 'Filters' : `Filter group level ${level}`}>
      <legend className="text-xs">{isRoot ? 'Match records' : 'Filter group'}</legend>
      <label className="flex flex-wrap items-center gap-2 text-xs">Match
        <PanelSelect aria-label={`Conjunction level ${level}`} value={node.conjunction} onValueChange={value => change(node.id, () => ({ ...node, conjunction: value === 'or' ? 'or' : 'and' }))}>
          <option value="and">All (And)</option><option value="or">Any (Or)</option>
        </PanelSelect>
      </label>
      {node.children.map(child => render(child, level + 1))}
      <menu className="m-0 p-0 flex flex-wrap gap-1" aria-label="Filter group actions">
        <li className="list-none"><DataViewAction onClick={() => add(node.id, false)} disabled={!props.columns.length}>Add filter</DataViewAction></li>
        <li className="list-none"><DataViewAction onClick={() => add(node.id, true)}>Add filter group</DataViewAction></li>
        {!isRoot && <li className="list-none"><DataViewAction onClick={() => duplicate(node.id)}>Duplicate group</DataViewAction></li>}
        {!isRoot && <li className="list-none"><DataViewAction onClick={() => change(node.id, current => ({ ...emptyFilterTree(), children: [current] }))}>Wrap group</DataViewAction></li>}
        <li className="list-none"><DataViewAction onClick={() => change(node.id, () => null)}>{isRoot ? 'Clear filters' : 'Delete group'}</DataViewAction></li>
      </menu>
    </fieldset>
    const column = props.columns.find(c => c.id === node.columnId)
    const options = filterOperators(column ? dataViewColumnType(column, props.view) : 'text')
    if (!options.includes(node.operator)) options.unshift(node.operator)
    const issue = filterRuleIssue(node, { columns: [...props.columns], rows: [], titleColumnId: '', groupByColumnId: null }, props.view)
    const patch = (value: Partial<typeof node>) => change(node.id, () => ({ ...node, ...value, legacyKind: undefined }))
    return <article key={node.id} className="min-w-0 space-y-2 rounded border p-2" aria-label={`Filter rule ${column?.name || 'Missing property'}`}>
      <label className="block text-xs">Property
        <PanelSelect className="w-full" aria-label="Filter property" value={node.columnId} onValueChange={columnId => {
          const next = props.columns.find(c => c.id === columnId)
          patch({ columnId, operand: '', operator: filterOperators(next ? dataViewColumnType(next, props.view) : 'text')[0] })
        }}>{!column && <option value={node.columnId}>Missing property</option>}{props.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</PanelSelect>
      </label>
      <label className="block text-xs">Condition<PanelSelect className="w-full" aria-label="Filter condition" value={node.operator} onValueChange={operator => patch({ operator: operator as DataViewFilterOperator })}>
        {options.map(op => <option key={op} value={op}>{filterOperatorLabels[op]}</option>)}
      </PanelSelect></label>
      {!['empty', 'nonempty'].includes(node.operator) && <label className="block text-xs">{['one-of', 'not-one-of'].includes(node.operator) ? 'Values (comma separated)' : 'Value'}
        <PanelTextInput aria-label="Filter value" className="w-full" value={node.operand} onChange={event => patch({ operand: event.target.value })} />
      </label>}
      {['one-of', 'not-one-of'].includes(node.operator) && !!column?.options?.length && <fieldset className="max-h-32 overflow-auto"><legend className="text-xs">Choose values</legend>
        {column.options.map(option => { const values = node.operand.split(',').map(s => s.trim()).filter(Boolean); return <label key={option} className="flex gap-2 text-xs p-1"><input type="checkbox" checked={values.includes(option)} onChange={event => patch({ operand: (event.target.checked ? [...values, option] : values.filter(v => v !== option)).join(', ') })} />{option}</label> })}
      </fieldset>}
      {issue && <p role="status" className="text-xs">{issue}</p>}
      <menu className="m-0 p-0 flex flex-wrap gap-1" aria-label="Filter rule actions">
        <li className="list-none"><DataViewAction onClick={() => change(node.id, current => ({ ...emptyFilterTree(), children: [current] }))}>Wrap in group</DataViewAction></li>
        <li className="list-none"><DataViewAction onClick={() => duplicate(node.id)}>Duplicate rule</DataViewAction></li>
        <li className="list-none"><DataViewAction onClick={() => change(node.id, () => null)}>Delete rule</DataViewAction></li>
      </menu>
    </article>
  }
  return <section aria-label="Filter" className="space-y-2">{error && <p role="alert">{error}</p>}{render(root, 1)}</section>
}
