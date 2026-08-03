import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChevronDown, ChevronUp, Eye, EyeOff, Focus, Layers, Search, Target } from 'lucide-react'

import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { dispatchRuntimeFitToViewSoon, dispatchRuntimeZoomActionSoon } from '@/lib/canvas/runtimeZoomDispatch'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { getIconSizeClass } from '@/lib/ui'
import {
  UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_LIST_ROW_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_REORDER_ROW_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME,
  UI_RESPONSIVE_DESIGN_PANEL_SEARCH_FIELD_CLASSNAME,
  UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'

import type { DesignLayerNode } from '@/features/design/designLayersState'

export default function DesignLayersPanel({ active }: { active: boolean }) {
  const panelTypography = usePanelTypography()

  const {
    uiIconScale,
    uiIconStrokeWidth,
    designRendererNodes,
    selectedNodeId,
    setSelectionSource,
    selectNode,
    requestZoom,
    designLayerState,
    normalizeDesignLayerStateFromNodes,
    commitDesignLayerStateHistory,
    commitToggleDesignLayerHiddenHistory,
    commitMoveDesignLayerHistory,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      designRendererNodes: s.designRendererNodes,
      selectedNodeId: s.selectedNodeId,
      setSelectionSource: s.setSelectionSource,
      selectNode: s.selectNode,
      requestZoom: s.requestZoom,
      designLayerState: s.designLayerState,
      normalizeDesignLayerStateFromNodes: s.normalizeDesignLayerStateFromNodes,
      commitDesignLayerStateHistory: s.commitDesignLayerStateHistory,
      commitToggleDesignLayerHiddenHistory: s.commitToggleDesignLayerHiddenHistory,
      commitMoveDesignLayerHistory: s.commitMoveDesignLayerHistory,
    })),
  )

  const iconSizeClass = getIconSizeClass(uiIconScale)
  const [query, setQuery] = React.useState('')
  const normalizedQuery = String(query || '').trim().toLowerCase()

  const nodes = React.useMemo(() => {
    return Array.isArray(designRendererNodes) ? designRendererNodes : []
  }, [designRendererNodes])

  React.useEffect(() => {
    if (!active) return
    normalizeDesignLayerStateFromNodes(nodes)
  }, [active, nodes, normalizeDesignLayerStateFromNodes])

  const visibleCount = React.useMemo(() => {
    const hidden = designLayerState?.hiddenById || {}
    let count = 0
    for (let i = 0; i < nodes.length; i += 1) {
      const id = nodes[i].id
      if (hidden[id] === true) continue
      count += 1
    }
    return count
  }, [designLayerState?.hiddenById, nodes])

  const ordered = React.useMemo(() => {
    const order = Array.isArray(designLayerState?.order) ? designLayerState.order : []
    if (order.length === 0) return nodes
    const byId = new Map(nodes.map(n => [n.id, n] as const))
    const out: DesignLayerNode[] = []
    for (let i = 0; i < order.length; i += 1) {
      const n = byId.get(order[i])
      if (n) out.push(n)
    }
    return out
  }, [designLayerState?.order, nodes])

  const filtered = React.useMemo(() => {
    if (!normalizedQuery) return ordered
    return ordered.filter(n => `${n.label} ${n.id} ${n.type || ''}`.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery, ordered])

  const toggleHidden = React.useCallback((id: string) => commitToggleDesignLayerHiddenHistory(id), [commitToggleDesignLayerHiddenHistory])

  const applyBulkVisibility = React.useCallback(
    (hidden: boolean, opts?: { onlyFiltered?: boolean }) => {
      if (!active) return
      const prev = designLayerState || { order: [], hiddenById: {} }
      const prevHidden = prev.hiddenById || {}
      const targetNodes = opts?.onlyFiltered ? filtered : nodes
      if (targetNodes.length === 0) return
      const nextHiddenById: Record<string, boolean> = { ...prevHidden }
      for (let i = 0; i < targetNodes.length; i += 1) {
        const id = String(targetNodes[i]?.id || '').trim()
        if (!id) continue
        nextHiddenById[id] = hidden
      }
      commitDesignLayerStateHistory({ label: 'Layer visibility', next: { ...prev, hiddenById: nextHiddenById } })
    },
    [active, commitDesignLayerStateHistory, designLayerState, filtered, nodes],
  )

  const handleShowAll = React.useCallback(() => {
    applyBulkVisibility(false, { onlyFiltered: !!normalizedQuery })
  }, [applyBulkVisibility, normalizedQuery])

  const handleHideAll = React.useCallback(() => {
    applyBulkVisibility(true, { onlyFiltered: !!normalizedQuery })
  }, [applyBulkVisibility, normalizedQuery])

  const handleSoloSelected = React.useCallback(() => {
    if (!active) return
    const sel = String(selectedNodeId || '').trim()
    if (!sel) return
    const prev = designLayerState || { order: [], hiddenById: {} }
    const nextHiddenById: Record<string, boolean> = {}
    for (let i = 0; i < nodes.length; i += 1) {
      const id = String(nodes[i]?.id || '').trim()
      if (!id) continue
      nextHiddenById[id] = id !== sel
    }
    commitDesignLayerStateHistory({ label: 'Layer visibility', next: { ...prev, hiddenById: nextHiddenById } })
  }, [active, commitDesignLayerStateHistory, designLayerState, nodes, selectedNodeId])

  const move = React.useCallback((id: string, dir: 'up' | 'down') => commitMoveDesignLayerHistory({ id, dir }), [commitMoveDesignLayerHistory])

  const handleSelect = React.useCallback(
    (id: string) => {
      if (!active) return
      setSelectionSource('canvas')
      selectNode(id)
      dispatchRuntimeZoomActionSoon('selection')
    },
    [active, selectNode, setSelectionSource],
  )

  if (!active) {
    return (
      <section className={cn(UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME, UI_THEME_TOKENS.panel.bg)} aria-label="Design Layers" data-main-panel-no-drag="true">
        <section className={cn(UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME, UI_THEME_TOKENS.panel.border)} aria-label="Design Layers header">
          <Layers className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          <span className={cn('min-w-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{UI_LABELS.layerMode}</span>
        </section>
        <p className={cn('p-3 text-sm', UI_THEME_TOKENS.text.secondary)}>Switch to Design renderer to view layers.</p>
      </section>
    )
  }

  return (
    <section className={cn(UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME, UI_THEME_TOKENS.panel.bg)} aria-label="Design Layers" data-main-panel-no-drag="true">
      <section className={cn(UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME, UI_THEME_TOKENS.panel.border)} aria-label="Design Layers header">
        <Layers className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        <span className={cn('min-w-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{UI_LABELS.layerMode}</span>
        <span className={cn('text-[10px] font-mono', UI_THEME_TOKENS.text.tertiary)}>
          {visibleCount}/{nodes.length}
        </span>
        <button
          type="button"
          className={cn('App-toolbar__btn ml-auto', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          onClick={() => dispatchRuntimeFitToViewSoon()}
          title={UI_LABELS.fitToView}
          aria-label={UI_LABELS.fitToView}
          disabled={!active}
        >
          <Target className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          onClick={handleShowAll}
          title={normalizedQuery ? `${UI_LABELS.showAll} (filtered)` : UI_LABELS.showAll}
          aria-label={normalizedQuery ? `${UI_LABELS.showAll} (filtered)` : UI_LABELS.showAll}
          disabled={!active}
        >
          <Eye className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          onClick={handleHideAll}
          title={normalizedQuery ? `${UI_LABELS.hideAll} (filtered)` : UI_LABELS.hideAll}
          aria-label={normalizedQuery ? `${UI_LABELS.hideAll} (filtered)` : UI_LABELS.hideAll}
          disabled={!active}
        >
          <EyeOff className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          onClick={handleSoloSelected}
          title="Solo selected"
          aria-label="Solo selected"
          disabled={!active || !selectedNodeId}
        >
          <Focus className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
      </section>

      <label className={UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME} aria-label="Layers search">
        <span className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>{UI_LABELS.search}</span>
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

      <section aria-label="Layers list">
        {filtered.length === 0 ? (
          <span className={cn(UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME, 'text-[10px]', UI_THEME_TOKENS.text.tertiary)}>No layers match.</span>
        ) : (
          <ul className="m-0 p-0 list-none" aria-label="Layers">
            {filtered.map(n => {
              const hidden = designLayerState?.hiddenById?.[n.id] === true
              const selected = selectedNodeId === n.id
              const label = readMarkdownSigilDisplayText(n.label)
              return (
                <li key={n.id} className={cn('border-b last:border-b-0', UI_THEME_TOKENS.panel.border)}>
                  <section className={cn(UI_RESPONSIVE_DESIGN_PANEL_LIST_ROW_CLASSNAME, uiSelectedRowStateClassName(selected))}>
                    <button
                      type="button"
                      className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, 'p-1.5')}
                      onClick={() => toggleHidden(n.id)}
                      aria-label={hidden ? UI_LABELS.showAll : UI_LABELS.hideAll}
                      title={hidden ? UI_LABELS.showAll : UI_LABELS.hideAll}
                      disabled={!active}
                    >
                      {hidden ? (
                        <EyeOff className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                      ) : (
                        <Eye className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                      )}
                    </button>

                    <button
                      type="button"
                      className={cn(
                        UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME,
                        UI_THEME_TOKENS.button.hoverBg,
                        selected ? cn(UI_THEME_TOKENS.button.activeText) : cn(UI_THEME_TOKENS.text.primary),
                      )}
                      onClick={() => handleSelect(n.id)}
                      aria-label={label}
                      title={label}
                      disabled={!active}
                    >
                      <span className={cn('block min-w-0 truncate text-xs font-semibold', hidden ? 'opacity-50' : '')}>
                        {renderMarkdownSigilInlineText(n.label)}
                      </span>
                      <span className={cn('block min-w-0 truncate text-[10px] font-mono', UI_THEME_TOKENS.text.tertiary, hidden ? 'opacity-50' : '')}>
                        {n.type ? `${n.type} · ${n.id}` : n.id}
                      </span>
                    </button>

                    <span className={UI_RESPONSIVE_DESIGN_PANEL_REORDER_ROW_CLASSNAME} aria-label="Reorder">
                      <button
                        type="button"
                        className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, 'p-1.5')}
                        onClick={() => move(n.id, 'up')}
                        aria-label={UI_LABELS.undo}
                        title="Move up"
                        disabled={!active}
                      >
                        <ChevronUp className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                      </button>
                      <button
                        type="button"
                        className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, 'p-1.5')}
                        onClick={() => move(n.id, 'down')}
                        aria-label={UI_LABELS.redo}
                        title="Move down"
                        disabled={!active}
                      >
                        <ChevronDown className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                      </button>
                    </span>
                  </section>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}
