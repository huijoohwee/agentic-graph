import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { GraphData } from '@/lib/graph/types'
import { createSubgraph, readSubgraphs, removeSubgraph, subgraphGroupId, updateSubgraph, writeSubgraphs, type UserSubgraph } from '@/lib/graph/subgraphs'
import { TwoColumnEditorGrid } from '@/features/panels/ui/TwoColumnEditorGrid'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

const toggleInSet = (set: Set<string>, id: string): Set<string> => {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

const unionIds = (a: string[], b: string[]) => {
  const set = new Set<string>()
  for (let i = 0; i < a.length; i += 1) {
    const id = String(a[i] || '').trim()
    if (id) set.add(id)
  }
  for (let i = 0; i < b.length; i += 1) {
    const id = String(b[i] || '').trim()
    if (id) set.add(id)
  }
  return Array.from(set).sort((x, y) => x.localeCompare(y))
}

const diffIds = (a: string[], remove: string[]) => {
  const rem = new Set<string>(remove.map(x => String(x || '').trim()).filter(Boolean))
  return a.filter(id => !rem.has(String(id || '').trim()))
}

export function GraphEditorOutlineTab() {
  const {
    graphData,
    selectedNodeId,
    selectedGroupId,
    selectNode,
    selectEdge,
    selectGroup,
    setSelectionSource,
    toggleGroupCollapsed,
    setGraphDataPreservingLayout,
    addHistory,
  } = useGraphStore(
    useShallow(s => ({
      graphData: s.graphData as GraphData | null,
      selectedNodeId: (typeof s.selectedNodeId === 'string' ? s.selectedNodeId : null) as string | null,
      selectedGroupId: (typeof s.selectedGroupId === 'string' ? s.selectedGroupId : null) as string | null,
      selectNode: s.selectNode,
      selectEdge: s.selectEdge,
      selectGroup: s.selectGroup,
      setSelectionSource: s.setSelectionSource,
      toggleGroupCollapsed: s.toggleGroupCollapsed,
      setGraphDataPreservingLayout: s.setGraphDataPreservingLayout,
      addHistory: s.addHistory,
    })),
  )

  const [checked, setChecked] = React.useState<Set<string>>(() => new Set())

  const nodes = React.useMemo(() => {
    const list = (graphData?.nodes || []).slice()
    list.sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)))
    return list
  }, [graphData])

  const subgraphs = React.useMemo(() => readSubgraphs(graphData), [graphData])

  const commitGraph = React.useCallback(
    (next: GraphData, label: string) => {
      setGraphDataPreservingLayout(next)
      addHistory(label)
    },
    [addHistory, setGraphDataPreservingLayout],
  )

  const createFromChecked = React.useCallback(() => {
    if (!graphData) return
    const ids = Array.from(checked)
    const nodeIds = ids.length > 0 ? ids : selectedNodeId ? [selectedNodeId] : []
    if (nodeIds.length === 0) return
    const { graphData: next } = createSubgraph(graphData, { nodeIds })
    commitGraph(next, 'Create Subgraph')
    setChecked(new Set())
  }, [checked, commitGraph, graphData, selectedNodeId])

  const updateOne = React.useCallback(
    (id: string, patch: Partial<UserSubgraph>, label: string) => {
      if (!graphData) return
      const next = updateSubgraph(graphData, id, patch)
      commitGraph(next, label)
    },
    [commitGraph, graphData],
  )

  const applyMembership = React.useCallback(
    (id: string, mode: 'add' | 'remove') => {
      if (!graphData) return
      const ids = Array.from(checked)
      if (ids.length === 0) return
      const sgs = readSubgraphs(graphData)
      const nextSgs = sgs.map(sg => {
        if (sg.id !== id) return sg
        const nextMembers = mode === 'add' ? unionIds(sg.memberNodeIds, ids) : diffIds(sg.memberNodeIds, ids)
        return { ...sg, memberNodeIds: nextMembers }
      })
      const next = writeSubgraphs(graphData, nextSgs)
      commitGraph(next, mode === 'add' ? 'Add to Subgraph' : 'Remove from Subgraph')
      setChecked(new Set())
    },
    [checked, commitGraph, graphData],
  )

  if (!graphData) {
    return <p className={`text-sm ${UI_THEME_TOKENS.text.secondary}`}>Load or import a graph to start editing.</p>
  }

  return (
    <section className="space-y-4" aria-label="Graph outline">
      <section>
        <section className="flex items-center justify-between gap-2">
          <section className={`text-xs font-medium ${UI_THEME_TOKENS.text.secondary}`}>Subgraphs</section>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            onClick={createFromChecked}
            aria-label="Create subgraph from checked nodes"
          >
            New
          </button>
        </section>

        {subgraphs.length === 0 ? (
          <p className={`mt-2 text-sm ${UI_THEME_TOKENS.text.secondary}`}>No subgraphs yet.</p>
        ) : (
          <section className="mt-2 space-y-2">
            {subgraphs.map(sg => {
              const gid = subgraphGroupId(sg.id)
              const isSelected = gid && selectedGroupId === gid
              return (
                <section
                  key={sg.id}
                  className={`rounded-lg border px-2 py-2 ${UI_THEME_TOKENS.input.border} ${isSelected ? 'ring-1 ring-blue-500/40' : ''}`}
                >
                  <section className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className={`flex-1 truncate rounded-md px-2 py-1 text-left text-xs ${isSelected ? uiSelectedRowStateClassName(true) : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}`}
                      onClick={() => {
                        setSelectionSource('editor')
                        selectEdge(null)
                        selectNode(null)
                        selectGroup(gid)
                      }}
                      aria-label={`Select subgraph ${sg.label}`}
                    >
                      {sg.label}
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2 py-1 text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                      onClick={() => toggleGroupCollapsed(gid)}
                      aria-label="Toggle subgraph collapse"
                    >
                      Collapse
                    </button>
                  </section>

                  <TwoColumnEditorGrid className="mt-2">
                    <label className="block">
                      <section className={`text-[10px] ${UI_THEME_TOKENS.text.tertiary}`}>Label</section>
                      <input
                        className={`mt-1 w-full rounded-md border px-2 py-1 text-sm ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.text}`}
                        value={sg.label}
                        onChange={e => updateOne(sg.id, { label: e.target.value }, 'Rename Subgraph')}
                        aria-label="Subgraph label"
                      />
                    </label>
                    <label className="block">
                      <section className={`text-[10px] ${UI_THEME_TOKENS.text.tertiary}`}>Parent</section>
                      <select
                        className={`mt-1 w-full rounded-md border px-2 py-1 text-sm ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.text}`}
                        value={sg.parentId || ''}
                        onChange={e => updateOne(sg.id, { parentId: e.target.value || null }, 'Nest Subgraph')}
                        aria-label="Subgraph parent"
                      >
                        <option value="">None</option>
                        {subgraphs
                          .filter(other => other.id !== sg.id)
                          .map(other => (
                            <option key={other.id} value={other.id}>
                              {other.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  </TwoColumnEditorGrid>

                  <section className="mt-2 flex items-center justify-between gap-2">
                    <section className={`text-xs ${UI_THEME_TOKENS.text.tertiary}`}>{sg.memberNodeIds.length} nodes</section>
                    <section className="flex items-center gap-1">
                      <button
                        type="button"
                        className={`rounded-md px-2 py-1 text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                        onClick={() => applyMembership(sg.id, 'add')}
                        aria-label="Add checked nodes to subgraph"
                      >
                        Add checked
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-2 py-1 text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                        onClick={() => applyMembership(sg.id, 'remove')}
                        aria-label="Remove checked nodes from subgraph"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-2 py-1 text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                        onClick={() => {
                          const next = removeSubgraph(graphData, sg.id)
                          commitGraph(next, 'Delete Subgraph')
                        }}
                        aria-label="Delete subgraph"
                      >
                        Delete
                      </button>
                    </section>
                  </section>
                </section>
              )
            })}
          </section>
        )}
      </section>

      <section>
        <section className={`text-xs font-medium ${UI_THEME_TOKENS.text.secondary}`}>Nodes</section>
        <section className="mt-2 space-y-1">
          {nodes.slice(0, 800).map(n => {
            const id = String(n.id || '')
            const isSel = id && id === selectedNodeId
            const isChecked = checked.has(id)
            return (
              <section key={id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${uiSelectedRowStateClassName(Boolean(isSel))}`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => setChecked(prev => toggleInSet(prev, id))}
                  aria-label={`Check node ${String(n.label || id)}`}
                />
                <button
                  type="button"
                  className={`flex-1 truncate text-left text-xs ${isSel ? '' : UI_THEME_TOKENS.button.text}`}
                  onClick={() => {
                    setSelectionSource('editor')
                    selectGroup(null)
                    selectEdge(null)
                    selectNode(id)
                  }}
                  aria-label={`Select node ${String(n.label || id)}`}
                >
                  {String(n.label || id) || id}
                </button>
                <span className={`shrink-0 font-mono text-[10px] ${UI_THEME_TOKENS.text.tertiary}`}>{String(n.type || '')}</span>
              </section>
            )
          })}
        </section>
      </section>
    </section>
  )
}
