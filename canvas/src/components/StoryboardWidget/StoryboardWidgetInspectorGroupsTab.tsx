import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import type { UserSubgraph } from '@/lib/graph/subgraphs'
import { subgraphGroupId } from '@/lib/graph/subgraphs'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'

export function StoryboardWidgetInspectorGroupsTab(props: {
  active: boolean
  subgraphs: UserSubgraph[]
  selectedNodeIds: string[]
  collapsedGroupIds: string[]
  newSubgraphLabel: string
  setNewSubgraphLabel: (value: string) => void
  newSubgraphKind: 'subgraph' | 'cluster'
  setNewSubgraphKind: (value: 'subgraph' | 'cluster') => void
  onCreateSubgraphFromSelection: (args: { label?: string; kind?: 'subgraph' | 'cluster' }) => void
  onSetSubgraphKind: (id: string, kind: 'subgraph' | 'cluster') => void
  onRenameSubgraph: (id: string, label: string) => void
  onDeleteSubgraph: (id: string) => void
  onSetSubgraphParent: (id: string, parentId: string | null) => void
  onAddSelectionToSubgraph: (id: string) => void
  onRemoveSelectionFromSubgraph: (id: string) => void
  onToggleSubgraphCollapsed: (id: string) => void
  onSelectSubgraph: (id: string) => void
  microLabelClass: string
  keyValueInputClass: string
  textSizeClass: string
  keyLabelClass: string
}) {
  const {
    active,
    subgraphs,
    selectedNodeIds,
    collapsedGroupIds,
    newSubgraphLabel,
    setNewSubgraphLabel,
    newSubgraphKind,
    setNewSubgraphKind,
    onCreateSubgraphFromSelection,
    onSetSubgraphKind,
    onRenameSubgraph,
    onDeleteSubgraph,
    onSetSubgraphParent,
    onAddSelectionToSubgraph,
    onRemoveSelectionFromSubgraph,
    onToggleSubgraphCollapsed,
    onSelectSubgraph,
    microLabelClass,
    keyValueInputClass,
    textSizeClass,
    keyLabelClass,
  } = props

  return (
    <section aria-label="Groups editor">
      <p className={cn('mt-2', microLabelClass, UI_THEME_TOKENS.text.secondary)}>
        Selection: {selectedNodeIds.length} node{selectedNodeIds.length === 1 ? '' : 's'}
      </p>
      <label className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor="storyboard-widget-new-subgraph-label">
        New group label
      </label>
      <PlainTextInputEditor
        id="storyboard-widget-new-subgraph-label"
        className={cn('mt-1 w-full rounded-md', keyValueInputClass, textSizeClass, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
        value={newSubgraphLabel}
        onChange={setNewSubgraphLabel}
        disabled={!active}
        placeholder="Subgraph label"
      />
      <label className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor="storyboard-widget-new-subgraph-kind">
        Kind
      </label>
      <PanelSelect
        id="storyboard-widget-new-subgraph-kind"
        className={cn('mt-1 w-full rounded-md', keyValueInputClass, textSizeClass, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
        value={newSubgraphKind}
        onValueChange={selectedValueInput => setNewSubgraphKind(selectedValueInput === 'cluster' ? 'cluster' : 'subgraph')}
        disabled={!active}
      >
        <option value="subgraph">Subgraph</option>
        <option value="cluster">Cluster</option>
      </PanelSelect>
      <button
        type="button"
        className={`mt-2 App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
        onClick={() => {
          const label = String(newSubgraphLabel || '').trim()
          onCreateSubgraphFromSelection({ label: label ? label : undefined, kind: newSubgraphKind })
          setNewSubgraphLabel('')
        }}
        disabled={!active || selectedNodeIds.length === 0}
      >
        Create group from selection
      </button>

      {subgraphs.length === 0 ? (
        <p className={cn('mt-3', microLabelClass, UI_THEME_TOKENS.text.secondary)}>No groups yet.</p>
      ) : (
        <nav className="mt-3" aria-label="Groups list">
          <ul className="flex flex-col gap-2">
            {subgraphs.map(sg => {
              const gid = subgraphGroupId(sg.id)
              const isCollapsed = gid ? collapsedGroupIds.includes(gid) : false
              return (
                <li key={sg.id}>
                  <article className={`w-full rounded-lg border px-2 py-2 ${UI_THEME_TOKENS.input.border}`}>
                    <header className="flex items-start justify-between gap-2">
                      <section className="min-w-0 flex-1">
                        <p className={cn(microLabelClass, UI_THEME_TOKENS.text.tertiary)}>{sg.id}</p>
                        <PlainTextInputEditor
                          className={cn('mt-1 w-full rounded-md', keyValueInputClass, textSizeClass, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
                          defaultValue={sg.label}
                          onBlur={e => onRenameSubgraph(sg.id, e.target.value)}
                          disabled={!active}
                        />
                        <p className={cn('mt-1', microLabelClass, UI_THEME_TOKENS.text.secondary)}>
                          Members: {(sg.memberNodeIds || []).length}
                        </p>
                      </section>
                      <menu className="flex flex-col items-end gap-1" aria-label={`Group actions ${sg.id}`}>
                        <button type="button" className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`} onClick={() => onSelectSubgraph(sg.id)} disabled={!active}>Select</button>
                        <button type="button" className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`} onClick={() => onToggleSubgraphCollapsed(sg.id)} disabled={!active || !gid}>{isCollapsed ? 'Expand' : 'Collapse'}</button>
                        <button type="button" className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`} onClick={() => onAddSelectionToSubgraph(sg.id)} disabled={!active || selectedNodeIds.length === 0}>Add selection</button>
                        <button type="button" className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`} onClick={() => onRemoveSelectionFromSubgraph(sg.id)} disabled={!active || selectedNodeIds.length === 0}>Remove selection</button>
                        <button type="button" className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`} onClick={() => onDeleteSubgraph(sg.id)} disabled={!active}>Delete</button>
                      </menu>
                    </header>

                    <label className={cn('mt-2 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor={`storyboard-widget-subgraph-kind-${sg.id}`}>
                      Kind
                    </label>
                    <PanelSelect
                      id={`storyboard-widget-subgraph-kind-${sg.id}`}
                      className={cn('mt-1 w-full rounded-md', keyValueInputClass, textSizeClass, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
                      value={sg.kind === 'cluster' ? 'cluster' : 'subgraph'}
                      onValueChange={selectedValueInput => onSetSubgraphKind(sg.id, selectedValueInput === 'cluster' ? 'cluster' : 'subgraph')}
                      disabled={!active}
                    >
                      <option value="subgraph">Subgraph</option>
                      <option value="cluster">Cluster</option>
                    </PanelSelect>
                    <label className={cn('mt-2 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor={`storyboard-widget-subgraph-parent-${sg.id}`}>
                      Parent
                    </label>
                    <PanelSelect
                      id={`storyboard-widget-subgraph-parent-${sg.id}`}
                      className={cn('mt-1 w-full rounded-md', keyValueInputClass, textSizeClass, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
                      value={sg.parentId == null ? '' : String(sg.parentId)}
                      onValueChange={selectedValueInput => onSetSubgraphParent(sg.id, selectedValueInput ? selectedValueInput : null)}
                      disabled={!active}
                    >
                      <option value="">(none)</option>
                      {subgraphs.filter(parent => parent.id !== sg.id).map(parent => (
                        <option key={parent.id} value={parent.id}>{parent.label}</option>
                      ))}
                    </PanelSelect>
                  </article>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </section>
  )
}
