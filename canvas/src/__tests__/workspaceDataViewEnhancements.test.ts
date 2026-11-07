import assert from 'node:assert/strict'
import { buildSavedDocumentUiPresentationPlan } from '@/features/canvas/graphStoreDocumentUiRestorePlan'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import type { MarkdownDataView } from '@/features/markdown/ui/markdownDataViewModel'
import { applyWorkspaceDataViewQuery, coerceWorkspaceDataViewConfig, defaultWorkspaceDataViewConfig, duplicateWorkspaceDataViewInState, deleteWorkspaceDataViewFromState, removeWorkspaceDataViewConfigColumn, readWorkspaceDataViewStateWithMeta, writeWorkspaceDataViewState, writeWorkspaceDataViewConfig, buildWorkspaceDataViewScopeKey, type WorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { cloneFilterNode, getFilterTree, upsertDataViewColumnFilter, filterRuleCount, removeFilterColumn, validateFilterTree, type DataViewFilterGroup } from '@/features/markdown-workspace/main/viewer/workspaceDataViewFilterTree'
import { projectDataViewGroups } from '@/features/markdown-workspace/main/viewer/workspaceDataViewGroups'
import { getMarkdownDataViewConfigStorageKey } from '@/lib/config'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { getCanvas2dSurfaceId, isTableGraphCanvas2dRenderer, resolveCanvas2dRendererId, supportsCanvas2dMinimap } from '@/lib/config.render'
import { coerceCanvas2dRendererForSchema } from '@/lib/canvas/renderModeConstraints'

const source: MarkdownDataView = { titleColumnId: 'title', groupByColumnId: 'status', columns: [
  { id: 'title', name: 'Title', kind: 'text' }, { id: 'status', name: 'Status', kind: 'select', options: ['Todo', 'Done', 'Empty lane'] },
  { id: 'score', name: 'Score', kind: 'text' }, { id: 'tags', name: 'Tags', kind: 'multi-select' },
], rows: [
  { id: 'a', cells: ['Alpha', 'Todo', '10', 'red, blue'] }, { id: 'b', cells: ['Beta', 'Done', '2', 'blue'] },
  { id: 'c', cells: ['Gamma', 'Todo', '', ''] }, { id: 'd', cells: ['Delta', 'Done', '2', 'red'] },
  { id: 'e', cells: ['Epsilon', '', 'invalid', ''] },
] }
const base = (): WorkspaceDataViewConfig => ({ ...defaultWorkspaceDataViewConfig({ title: 'Records', layout: 'table', groupByColumnId: 'status' }), columnTypesById: { score: 'number' } })
const ids = (config: WorkspaceDataViewConfig, view = source) => applyWorkspaceDataViewQuery({ view, viewConfig: config, state: { searchQuery: '', visibleGroups: null, sortMode: 'none' } }).rows.map(row => row.id)
export function testDataViewNestedQueriesAndLegacyMigration() {
  const legacy = { ...base(), v: 2 as const, sortSemantics: 'legacy' as const, filterGroups: [
    { id: 'g1', rules: [{ id: 'r1', columnId: 'status', columnKind: 'select' as const, op: 'equals' as const, value: 'done' }] },
    { id: 'g2', rules: [{ id: 'r2', columnId: 'title', columnKind: 'text' as const, op: 'contains' as const, value: '' }] },
  ], sortRules: [{ id: 's1', columnId: 'score', direction: 'asc' as const }, { id: 's2', columnId: 'title', direction: 'desc' as const }] }
  const migrated = { ...legacy, v: 3 as const, filterTree: getFilterTree(legacy), filterGroups: [] }
  assert.deepEqual(ids(migrated), ids(legacy), 'blank legacy OR branches and raw sorting retain result identity')
  legacy.filterGroups[1].rules[0].columnId = 'missing'; legacy.filterGroups[1].rules[0].value = 'x'
  assert.deepEqual(ids({ ...legacy, filterTree: getFilterTree(legacy), filterGroups: [] }), ids(legacy), 'missing legacy fields stay pass-through')
  const tree: DataViewFilterGroup = { id: 'root', kind: 'group', conjunction: 'and', children: [
    { id: 'or', kind: 'group', conjunction: 'or', children: [
      { id: 'done', kind: 'rule', columnId: 'status', operator: 'one-of', operand: 'done' },
      { id: 'red', kind: 'rule', columnId: 'tags', operator: 'one-of', operand: 'red' },
    ] }, { id: 'n', kind: 'rule', columnId: 'score', operator: 'lt', operand: '5' },
  ] }
  assert.deepEqual(ids({ ...base(), filterTree: tree }), ['b', 'd'])
  assert.deepEqual(ids(upsertDataViewColumnFilter(base(), { columnId: 'status', columnKind: 'select', op: 'equals', value: 'Done' })), ['b', 'd'])
  assert.equal(filterRuleCount({ ...base(), filterTree: { ...tree, children: [{ id: 'draft', kind: 'rule', columnId: 'title', operator: 'contains', operand: '' }] } }, source), 0)
  assert.deepEqual(ids({ ...base(), filterTree: { ...tree, children: [{ id: 'x', kind: 'rule', columnId: 'tags', operator: 'not-one-of', operand: 'blue' }] } }), ['c', 'd', 'e'])
  assert.deepEqual(ids({ ...base(), filterTree: { ...tree, children: [{ id: 'x', kind: 'rule', columnId: 'tags', operator: 'empty', operand: '' }] } }), ['c', 'e'])
  const copy = cloneFilterNode(tree) as DataViewFilterGroup
  assert.notEqual(copy.id, tree.id); assert.notEqual(copy.children[0].id, tree.children[0].id)
  assert.deepEqual(ids({ ...base(), filterTree: copy }), ['b', 'd'])
  assert.equal(JSON.stringify(removeFilterColumn(tree, 'score')).includes('"columnId":"score"'), false)
  assert.throws(() => validateFilterTree({ ...tree, children: Array.from({ length: 128 }, (_, i) => ({ id: `r${i}`, kind: 'rule', columnId: 'title', operator: 'equals', operand: 'x' })) }))
  let deep = tree; for (let i = 0; i < 8; i++) deep = { id: `depth${i}`, kind: 'group', conjunction: 'and', children: [deep] }
  assert.throws(() => validateFilterTree(deep))
  assert.deepEqual(ids({ ...base(), filterTree: { ...tree, children: [{ id: 'missing', kind: 'rule', columnId: 'missing', operator: 'equals', operand: 'x' }, { id: 'n', kind: 'rule', columnId: 'score', operator: 'lt', operand: '5' }] } }), ['b', 'd'])
}
export function testDataViewTypedSortGroupsAndLifecycle() {
  const sorted = { ...base(), sortRules: [{ id: 'n', columnId: 'score', direction: 'asc' as const }, { id: 't', columnId: 'title', direction: 'desc' as const }] }
  assert.deepEqual(ids(sorted), ['d', 'b', 'a', 'e', 'c'])
  assert.deepEqual(ids({ ...sorted, sortRules: [{ ...sorted.sortRules[0], direction: 'desc' }, sorted.sortRules[1]] }), ['a', 'd', 'b', 'e', 'c'])
  assert.deepEqual(ids({ ...sorted, sortRules: [sorted.sortRules[0], { ...sorted.sortRules[1], enabled: false }] }), ['b', 'd', 'a', 'e', 'c'])
  const grouped = projectDataViewGroups({ ...source, rows: [...source.rows, { id: 'literal', cells: ['Literal', 'Ungrouped', '1', ''] }, { id: 'multiple', cells: ['Multiple', 'Todo, Done', '1', ''] }] }, 'status')
  assert.equal(grouped.find(group => group.key === 'empty:')?.rows.length, 1)
  assert.equal(grouped.find(group => group.key === 'value:Ungrouped')?.rows[0].id, 'literal')
  assert.equal(grouped.find(group => group.value === 'Empty lane')?.rows.length, 0)
  assert.equal(grouped.find(group => group.value === 'Todo, Done')?.rows.length, 1)
  const cfg = { ...base(), filterTree: getFilterTree(base()), calendar: { startColumnId: 'score', endColumnId: 'score', timeZone: 'UTC', month: '2026-10' } }
  const state = { sv: 1 as const, activeViewId: cfg.id, views: [cfg] }
  const copied = duplicateWorkspaceDataViewInState({ state, viewId: cfg.id })
  assert.notEqual(copied.views[1].filterTree, cfg.filterTree)
  const cleaned = removeWorkspaceDataViewConfigColumn({ viewConfig: cfg, columnId: 'score', nextGroupByColumnId: null })
  assert.equal(cleaned.calendar?.startColumnId, null); assert.equal(cleaned.calendar?.endColumnId, null)
  assert.equal(deleteWorkspaceDataViewFromState({ state, viewId: cfg.id }), state)
  assert.equal(deleteWorkspaceDataViewFromState({ state: { ...copied, activeViewId: copied.views[1].id }, viewId: cfg.id }).activeViewId, copied.views[1].id)
  for (const id of ['kanban', 'calendar'] as const) {
    assert.equal(buildSavedDocumentUiPresentationPlan({ graphData: { type: 'Graph', context: 'frontmatter-flow', metadata: { kind: 'frontmatter-flow' }, nodes: [], edges: [] } as never, saved: { canvasRenderMode: '2d', canvas2dRenderer: id } as never }).shouldPreferFrontmatterFlowLanding, false, 'saved record views survive default graph landing during reload')
    assert.equal(resolveCanvas2dRendererId(id), id); assert.equal(getCanvas2dSurfaceId(id), 'multiDimTable')
    assert.equal(isTableGraphCanvas2dRenderer(id), false); assert.equal(supportsCanvas2dMinimap(id), false)
    assert.equal(coerceCanvas2dRendererForSchema({ requested: id, canvas3dMode: '3d', schema: { layout: { mode: 'radial' } } as never }), id)
  }
}
export function testDataViewVersionedStorageRecovery() {
  const { restore } = initJsdomHarness()
  try {
    const growing = { activeDocumentPath: '/growing.md', tableId: 'md-block:8-12' }
    writeWorkspaceDataViewState({ ...growing, value: { sv: 1, activeViewId: base().id, views: [{ ...base(), name: 'Retained settings' }] } })
    assert.equal(readWorkspaceDataViewStateWithMeta({ ...growing, tableId: 'md-block:8-13' }).state.views[0].name, 'Retained settings')
    const legacyKey = getMarkdownDataViewConfigStorageKey(hashStringToHex('mdDataView:/legacy-lines.md::md-block:4-9'))
    window.localStorage.setItem(legacyKey, JSON.stringify({ sv: 1, activeViewId: base().id, views: [{ ...base(), v: 2, name: 'Legacy table' }] }))
    assert.equal(readWorkspaceDataViewStateWithMeta({ activeDocumentPath: '/legacy-lines.md', tableId: 'md-block:4-9' }).state.views[0].name, 'Legacy table')
    assert.equal(readWorkspaceDataViewStateWithMeta({ activeDocumentPath: '/legacy-lines.md', tableId: 'md-block:4-10' }).state.views[0].name, 'Legacy table', 'first source append retains migrated range-key settings')
    assert.equal(buildWorkspaceDataViewScopeKey({ ...growing, activeDocumentPath: 'growing.md' }), buildWorkspaceDataViewScopeKey(growing), 'editor and source writer paths share one identity')
    assert.equal(readWorkspaceDataViewStateWithMeta({ activeDocumentPath: 'workspace:/legacy-lines.md', tableId: 'md-block:4-11' }).state.views[0].name, 'Legacy table', 'path spelling and row append retain settings together')
    const slashKey = getMarkdownDataViewConfigStorageKey(hashStringToHex('mdDataView:/notes/path-alias.md::md-block:3')) + ':v3'
    const saved = JSON.stringify({ sv: 1, activeViewId: base().id, views: [{ ...base(), name: 'Calendar settings', calendar: { startColumnId: 'date', endColumnId: null, timeZone: 'UTC', month: '2026-10' } }] })
    window.localStorage.setItem(slashKey, saved)
    assert.equal(readWorkspaceDataViewStateWithMeta({ activeDocumentPath: 'notes/path-alias.md', tableId: 'md-block:3-8' }).state.views[0].calendar?.startColumnId, 'date')
    assert.equal(readWorkspaceDataViewStateWithMeta({ activeDocumentPath: '/notes/path-alias.md', tableId: 'md-block:3-9' }).state.views[0].name, 'Calendar settings')
    assert.equal(window.localStorage.getItem(slashKey), saved, 'migration preserves legacy alias bytes')
    const scope = { activeDocumentPath: '/view-test.md', tableId: 'records' }
    const key = getMarkdownDataViewConfigStorageKey(hashStringToHex(buildWorkspaceDataViewScopeKey(scope)))
    const cfg = { ...base(), v: 2 as const, sortSemantics: undefined }
    const old = JSON.stringify({ sv: 1, activeViewId: cfg.id, views: [cfg] })
    window.localStorage.setItem(key, old)
    const legacy = readWorkspaceDataViewStateWithMeta(scope).state
    assert.equal(legacy.views[0].sortSemantics, 'legacy')
    writeWorkspaceDataViewState({ ...scope, value: legacy })
    assert.equal(window.localStorage.getItem(key), old, 'rollback retains old namespace')
    assert.equal(readWorkspaceDataViewStateWithMeta(scope).state.views[0].v, 3)
    const duplicated = duplicateWorkspaceDataViewInState({ state: legacy, viewId: cfg.id })
    writeWorkspaceDataViewState({ ...scope, value: duplicated })
    writeWorkspaceDataViewConfig({ ...scope, value: { ...cfg, name: 'Old view delayed save' } })
    assert.equal(readWorkspaceDataViewStateWithMeta(scope).state.activeViewId, duplicated.activeViewId, 'delayed writes cannot replace another active view')
    const corrupt = '{"sv":99,"views":"unsupported"}'
    window.localStorage.setItem(`${key}:v3`, corrupt)
    const recovered = readWorkspaceDataViewStateWithMeta(scope)
    assert.ok(recovered.state.views[0].recoveryError)
    writeWorkspaceDataViewState({ ...scope, value: recovered.state })
    assert.equal(window.localStorage.getItem(`${key}:v3`), corrupt)
    assert.throws(() => coerceWorkspaceDataViewConfig({ ...base(), filterTree: { kind: 'bad' } }))
  } finally { restore() }
}

export async function testDataViewSettingsMountedInteractions() {
  const { dom, restore } = initJsdomHarness()
  const React = await import('react'), { createRoot } = await import('react-dom/client'), { flushSync } = await import('react-dom')
  const { WorkspaceDataViewSettingsFilterSection: Filters } = await import('@/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsFilterSection')
  const { WorkspaceDataViewSettingsSortSection: Sorts } = await import('@/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsSortSection')
  const { WorkspaceDataViewSettingsPropertiesSection: Properties } = await import('@/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsPropertiesSection')
  const host = dom.window.document.createElement('section') as HTMLElement; dom.window.document.body.append(host)
  const root = createRoot(host as unknown as HTMLElement)
  let config = base(), kind: 'filter' | 'sort' | 'properties' = 'filter'
  const changed = (next: WorkspaceDataViewConfig) => { config = next; render() }
  function render() {
    const props = { columns: source.columns, view: config, onChangeView: changed }
    root.render(kind === 'filter' ? React.createElement(Filters, props) : kind === 'sort' ? React.createElement(Sorts, { ...props, sourceView: source }) : React.createElement(Properties, { ...props, canMutate: false, titleColumnId: source.titleColumnId }))
  }
  const click = (label: string, index = 0) => {
    const matches = Array.from(host.querySelectorAll('button')).filter(button => button.getAttribute('aria-label') === label || button.textContent?.trim() === label)
    assert.ok(matches[index], `Missing control: ${label}`)
    flushSync(() => matches[index].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  }
  try {
    flushSync(render); click('Add filter'); assert.equal(getFilterTree(config).children.length, 1)
    click('Wrap in group'); assert.equal(getFilterTree(config).children[0].kind, 'group')
    click('Duplicate rule'); assert.equal((getFilterTree(config).children[0] as DataViewFilterGroup).children.length, 2)
    click('Delete rule'); assert.equal((getFilterTree(config).children[0] as DataViewFilterGroup).children.length, 1)
    click('Delete group'); assert.equal(getFilterTree(config).children.length, 0)
    kind = 'sort'; flushSync(render); click('Add sort'); click('Add sort')
    const first = config.sortRules[0].id; click('Move down'); assert.equal(config.sortRules[1].id, first)
    click('Remove sort'); assert.equal(config.sortRules.length, 1); click('Clear sorting'); assert.equal(config.sortRules.length, 0)
    kind = 'properties'; flushSync(render); click('Hide all properties'); assert.deepEqual(config.visibleColumnIds, ['title'])
    click('Show all properties'); assert.equal(config.visibleColumnIds?.length ?? source.columns.length, source.columns.length)
    const selector = host.querySelector('select[aria-label="Property type: Score"]') as HTMLSelectElement
    assert.ok(selector); flushSync(() => { selector.value = 'date'; selector.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    assert.equal(config.columnTypesById?.score, 'date', 'view types remain configurable when source mutation is disabled')
    assert.equal(host.querySelectorAll('div').length, 0, 'settings use semantic wrappers')
  } finally { flushSync(() => root.unmount()); restore() }
}

export async function testDataViewRendererRestoration() {
  const { restore } = initJsdomHarness()
  const { useGraphStore } = await import('@/hooks/useGraphStore')
  const { applyFrontmatterFlowImportModes } = await import('@/features/parsers/frontmatterFlowImportMode')
  const { applyInteractiveImportModes } = await import('@/features/workspace-fs/applyWorkspaceImportToCanvas')
  const previous = useGraphStore.getState()
  const graph = { type: 'Graph', context: 'frontmatter-flow', metadata: { kind: 'frontmatter-flow' }, nodes: [], edges: [] } as never
  try {
    for (const renderer of ['kanban', 'calendar'] as const) {
      useGraphStore.setState({ canvasRenderMode: '2d', canvas2dRenderer: renderer })
      applyFrontmatterFlowImportModes(graph, { resetWidgetLayout: false })
      assert.equal(useGraphStore.getState().canvas2dRenderer, renderer, 'default graph bootstrap preserves chosen record renderer')
      applyInteractiveImportModes({ rawText: '# Records\n\n| Title |\n| --- |\n| Work |' })
      assert.equal(useGraphStore.getState().canvas2dRenderer, renderer, 'plain source materialization preserves the saved renderer')
    }
    applyFrontmatterFlowImportModes(graph, { resetWidgetLayout: false, preset: { canvasRenderMode: '2d', canvas2dRenderer: 'storyboard' } })
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'storyboard', 'explicit document renderer still owns its landing')
  } finally { useGraphStore.setState(previous); restore() }
}
