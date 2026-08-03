import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChevronDown, ChevronRight, Search, Target } from 'lucide-react'

import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { dispatchRuntimeFitToViewSoon, dispatchRuntimeZoomActionSoon } from '@/lib/canvas/runtimeZoomDispatch'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { getIconSizeClass } from '@/lib/ui'
import {
  UI_RESPONSIVE_DESIGN_PANEL_CONTENT_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_SEARCH_FIELD_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_TREE_ROW_CLASSNAME,
  UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

import type { GraphNode, JSONValue } from '@/lib/graph/types'

type DomTreeNode = {
  id: string
  pid: string
  label: string
  tag: string
  children: string[]
}

const coerceString = (v: unknown): string => (typeof v === 'string' ? v : String(v || '')).trim()

function readDomParentId(node: GraphNode): string {
  const meta = node.metadata && typeof node.metadata === 'object' ? (node.metadata as Record<string, JSONValue>) : null
  return coerceString(meta?.domParentId)
}

function readPropString(node: GraphNode, key: string): string {
  const props = node.properties && typeof node.properties === 'object' ? (node.properties as Record<string, JSONValue>) : null
  const v = props ? props[key] : null
  return typeof v === 'string' ? v.trim() : ''
}

function buildDomTree(nodesById: Record<string, GraphNode>): { byId: Record<string, DomTreeNode>; rootIds: string[] } {
  const ids = Object.keys(nodesById)
  const byId: Record<string, DomTreeNode> = {}
  const childrenByPid: Record<string, string[]> = {}
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]
    const n = nodesById[id]
    if (!n) continue
    const pid = readDomParentId(n)
    const label = coerceString(n.label) || id
    const tag = readPropString(n, 'dom:tag') || coerceString(n.type)
    byId[id] = { id, pid, label, tag, children: [] }
    const key = pid || '__root__'
    if (!childrenByPid[key]) childrenByPid[key] = []
    childrenByPid[key].push(id)
  }
  for (const pidKey of Object.keys(childrenByPid)) {
    const childIds = childrenByPid[pidKey] || []
    childIds.sort((a, b) => {
      const na = byId[a]
      const nb = byId[b]
      const la = na ? `${na.label} ${na.tag}` : a
      const lb = nb ? `${nb.label} ${nb.tag}` : b
      return la.localeCompare(lb)
    })
    if (pidKey === '__root__') continue
    const pid = pidKey
    const parent = byId[pid]
    if (parent) parent.children = childIds
  }
  const rootIdsRaw = childrenByPid.__root__ || []
  const rootIds: string[] = []
  for (let i = 0; i < rootIdsRaw.length; i += 1) {
    const id = rootIdsRaw[i]
    const n = byId[id]
    if (!n) continue
    const pid = n.pid
    if (pid && byId[pid]) continue
    rootIds.push(id)
  }
  rootIds.sort((a, b) => {
    const na = byId[a]
    const nb = byId[b]
    const la = na ? `${na.tag} ${na.label}` : a
    const lb = nb ? `${nb.tag} ${nb.label}` : b
    return la.localeCompare(lb)
  })
  return { byId, rootIds }
}

export default function DesignDomTreePanel({ active }: { active: boolean }) {
  const panelTypography = usePanelTypography()
  const {
    uiIconScale,
    uiIconStrokeWidth,
    workspaceViewMode,
    canvasRenderMode,
    canvas2dRenderer,
    designRendererWebpageLayoutKey,
    designRendererGraphNodesById,
    selectedNodeId,
    setSelectionSource,
    selectNode,
    requestZoom,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      workspaceViewMode: s.workspaceViewMode,
      canvasRenderMode: s.canvasRenderMode,
      canvas2dRenderer: s.canvas2dRenderer,
      designRendererWebpageLayoutKey: s.designRendererWebpageLayoutKey,
      designRendererGraphNodesById: s.designRendererGraphNodesById,
      selectedNodeId: s.selectedNodeId,
      setSelectionSource: s.setSelectionSource,
      selectNode: s.selectNode,
      requestZoom: s.requestZoom,
    })),
  )

  const isDesignMode = workspaceViewMode === 'canvas' && canvasRenderMode === '2d' && canvas2dRenderer === 'design'
  const hasLayout = isDesignMode && !!designRendererWebpageLayoutKey && Object.keys(designRendererGraphNodesById || {}).length > 0

  const iconSizeClass = getIconSizeClass(uiIconScale)
  const [query, setQuery] = React.useState('')
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const [collapsedById, setCollapsedById] = React.useState<Record<string, boolean>>({})

  const tree = React.useMemo(() => {
    if (!hasLayout) return null
    return buildDomTree(designRendererGraphNodesById || {})
  }, [designRendererGraphNodesById, hasLayout])

  const visibleIds = React.useMemo(() => {
    if (!tree) return []
    const byId = tree.byId
    const out: Array<{ id: string; depth: number }> = []
    const matches = (id: string) => {
      if (!normalizedQuery) return true
      const n = byId[id]
      if (!n) return false
      return `${n.tag} ${n.label} ${n.id}`.toLowerCase().includes(normalizedQuery)
    }
    const anyMatchInSubtree = (id: string): boolean => {
      if (matches(id)) return true
      const n = byId[id]
      if (!n) return false
      for (let i = 0; i < n.children.length; i += 1) {
        if (anyMatchInSubtree(n.children[i]!)) return true
      }
      return false
    }
    const walk = (id: string, depth: number) => {
      const n = byId[id]
      if (!n) return
      if (!anyMatchInSubtree(id)) return
      out.push({ id, depth })
      const collapsed = collapsedById[id] === true
      if (collapsed) return
      for (let i = 0; i < n.children.length; i += 1) {
        walk(n.children[i]!, depth + 1)
      }
    }
    for (let i = 0; i < tree.rootIds.length; i += 1) {
      walk(tree.rootIds[i]!, 0)
    }
    return out
  }, [collapsedById, normalizedQuery, tree])

  const handleSelect = React.useCallback(
    (id: string) => {
      if (!active) return
      setSelectionSource('canvas')
      selectNode(id)
      dispatchRuntimeZoomActionSoon('selection')
    },
    [active, selectNode, setSelectionSource],
  )

  const toggleCollapsed = React.useCallback((id: string) => {
    setCollapsedById(prev => ({ ...prev, [id]: prev[id] !== true }))
  }, [])

  return (
    <section className={cn(UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME, UI_THEME_TOKENS.panel.bg)} aria-label="DOM Tree" data-main-panel-no-drag="true">
      <section className={cn(UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME, UI_THEME_TOKENS.panel.border)} aria-label="DOM Tree header">
        <span className={cn('min-w-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>DOM Tree</span>
        <span className={cn('text-[10px] font-mono', UI_THEME_TOKENS.text.tertiary)}>
          {hasLayout ? Object.keys(designRendererGraphNodesById || {}).length : 0}
        </span>
        <button
          type="button"
          className={cn('App-toolbar__btn ml-auto', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          onClick={() => dispatchRuntimeFitToViewSoon()}
          title="Fit"
          aria-label="Fit"
          disabled={!active}
        >
          <Target className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
      </section>

      {!hasLayout ? (
        <p className={cn('p-3 text-sm', UI_THEME_TOKENS.text.secondary)}>
          Switch to Design renderer on a webpage-backed document to populate the DOM tree.
        </p>
      ) : (
        <>
          <label className={UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME} aria-label="DOM search">
            <span className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>Search</span>
            <span className={cn(UI_RESPONSIVE_DESIGN_PANEL_SEARCH_FIELD_CLASSNAME, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border)}>
              <Search className={cn(iconSizeClass, UI_THEME_TOKENS.text.tertiary)} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={UI_COPY.searchNodesPlaceholder}
                className={cn('w-full bg-transparent outline-none text-xs', UI_THEME_TOKENS.input.text)}
              />
            </span>
          </label>

          <section className={cn(UI_RESPONSIVE_DESIGN_PANEL_CONTENT_CLASSNAME, panelTypography.fontClass)} aria-label="DOM tree content">
            {visibleIds.length === 0 ? (
              <span className={cn(UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME, 'text-[10px]', UI_THEME_TOKENS.text.tertiary)}>No matches.</span>
            ) : (
              <ul className="m-0 p-0 list-none" aria-label="DOM nodes">
                {visibleIds.map(({ id, depth }) => {
                  const n = tree?.byId[id]
                  if (!n) return null
                  const selected = selectedNodeId === id
                  const hasChildren = n.children.length > 0
                  const collapsed = collapsedById[id] === true
                  return (
                    <li key={id} className={cn('border-b last:border-b-0', UI_THEME_TOKENS.panel.border)}>
                      <section
                        className={cn(UI_RESPONSIVE_DESIGN_PANEL_TREE_ROW_CLASSNAME, uiSelectedRowStateClassName(selected))}
                        style={{ paddingLeft: 8 + depth * 12 }}
                      >
                        <button
                          type="button"
                          className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, 'p-1')}
                          onClick={() => toggleCollapsed(id)}
                          aria-label={collapsed ? 'Expand' : 'Collapse'}
                          disabled={!active || !hasChildren}
                        >
                          {hasChildren ? (
                            collapsed ? (
                              <ChevronRight className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                            ) : (
                              <ChevronDown className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                            )
                          ) : (
                            <span className={cn('inline-block', iconSizeClass)} aria-hidden={true} />
                          )}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME,
                            UI_THEME_TOKENS.button.hoverBg,
                            selected ? cn(UI_THEME_TOKENS.button.activeText) : cn(UI_THEME_TOKENS.text.primary),
                          )}
                          onClick={() => handleSelect(id)}
                          aria-label={n.label}
                          disabled={!active}
                        >
                          <span className={cn('block min-w-0 truncate text-xs font-semibold')}>{n.label}</span>
                          <span className={cn('block min-w-0 truncate text-[10px] font-mono', UI_THEME_TOKENS.text.tertiary)}>
                            {n.tag ? `${n.tag} · ${n.id}` : n.id}
                          </span>
                        </button>
                      </section>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}
