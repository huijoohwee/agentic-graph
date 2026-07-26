import React from 'react'
import { GitBranch, GitMerge, Plus, Shuffle } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { Z_INDEX_MENU } from '@/lib/ui/zIndex'
import {
  STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT,
  STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import type { GraphData } from '@/lib/graph/types'
import {
  STORYBOARD_EDGE_INSERTION_OPTIONS,
  insertStoryboardWorkflowNodeOnEdge,
  type StoryboardEdgeInsertionKind,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardEdgeNodeInsertion'

type EdgeAnchor = { edgeId: string; left: number; top: number }

const ICON_BY_KIND = {
  transform: Shuffle,
  join: GitMerge,
  branch: GitBranch,
} as const

function readPathMidpoint(path: SVGPathElement, rootRect: DOMRect): EdgeAnchor | null {
  const edgeId = String(path.getAttribute('data-kg-overlay-edge-id') || '').trim()
  if (!edgeId) return null
  try {
    const length = path.getTotalLength()
    const point = path.getPointAtLength(length / 2)
    const matrix = path.getScreenCTM()
    if (!matrix) return null
    const clientX = matrix.a * point.x + matrix.c * point.y + matrix.e
    const clientY = matrix.b * point.x + matrix.d * point.y + matrix.f
    const left = clientX - rootRect.left
    const top = clientY - rootRect.top
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null
    return { edgeId, left, top }
  } catch {
    return null
  }
}

function readOverlayEdgeAnchors(root: HTMLElement): EdgeAnchor[] {
  const rootRect = root.getBoundingClientRect()
  const paths = root.querySelectorAll<SVGPathElement>('path[data-kg-overlay-edge-id]')
  const anchors: EdgeAnchor[] = []
  const seen = new Set<string>()
  paths.forEach(path => {
    const anchor = readPathMidpoint(path, rootRect)
    if (!anchor || seen.has(anchor.edgeId)) return
    seen.add(anchor.edgeId)
    anchors.push(anchor)
  })
  return anchors
}

export function StoryboardEdgeNodeInsertionMenu(props: {
  active: boolean
  canEdit: boolean
  rootRef: React.RefObject<HTMLElement | null>
  graphData: GraphData | null
  commitGraphData: (graphData: GraphData) => void
  readWorldPoint: (clientX: number, clientY: number) => { x: number; y: number } | null
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
}) {
  const selectedEdgeId = useGraphStore(state => state.selectedEdgeId)
  const selectNode = useGraphStore(state => state.selectNode)
  const setSelectionSource = useGraphStore(state => state.setSelectionSource)
  const [anchors, setAnchors] = React.useState<EdgeAnchor[]>([])
  const [activeEdgeId, setActiveEdgeId] = React.useState<string | null>(null)
  const lastPointerRef = React.useRef<{ clientX: number; clientY: number } | null>(null)
  const menuRef = React.useRef<HTMLElement | null>(null)

  const refreshAnchors = React.useCallback(() => {
    const root = props.rootRef.current
    if (!root || !props.active || !props.canEdit) {
      setAnchors([])
      return
    }
    const next = readOverlayEdgeAnchors(root)
    const selectedId = String(selectedEdgeId || '').trim()
    if (selectedId && !next.some(anchor => anchor.edgeId === selectedId)) {
      const pointer = lastPointerRef.current
      const rect = root.getBoundingClientRect()
      if (pointer
        && pointer.clientX >= rect.left
        && pointer.clientX <= rect.right
        && pointer.clientY >= rect.top
        && pointer.clientY <= rect.bottom) {
        next.push({
          edgeId: selectedId,
          left: pointer.clientX - rect.left,
          top: pointer.clientY - rect.top,
        })
      }
    }
    setAnchors(next)
  }, [props.active, props.canEdit, props.rootRef, selectedEdgeId])

  React.useEffect(() => {
    const root = props.rootRef.current
    if (!root || !props.active || !props.canEdit) return
    const recordPointer = (event: PointerEvent) => {
      lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
    }
    root.addEventListener('pointerdown', recordPointer, true)
    return () => root.removeEventListener('pointerdown', recordPointer, true)
  }, [props.active, props.canEdit, props.rootRef])

  React.useEffect(() => {
    if (!props.active || !props.canEdit) return
    let raf: number | null = null
    const schedule = () => {
      if (raf != null) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = null
        refreshAnchors()
      })
    }
    schedule()
    window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, schedule)
    window.addEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      window.removeEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, schedule)
      window.removeEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [props.active, props.canEdit, refreshAnchors])

  React.useEffect(() => {
    if (!activeEdgeId) return
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-kg-edge-node-insert-trigger]')) return
      setActiveEdgeId(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveEdgeId(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', escape, true)
    }
  }, [activeEdgeId])

  const insertNode = React.useCallback((kind: StoryboardEdgeInsertionKind) => {
    const edgeId = String(activeEdgeId || '').trim()
    const graphData = props.graphData
    const anchor = anchors.find(item => item.edgeId === edgeId) || null
    const rootRect = props.rootRef.current?.getBoundingClientRect() || null
    const position = anchor && rootRect
      ? props.readWorldPoint(rootRect.left + anchor.left, rootRect.top + anchor.top)
      : null
    const result = graphData
      ? insertStoryboardWorkflowNodeOnEdge({ graphData, edgeId, kind, position })
      : null
    if (!result) {
      props.upsertUiToast({
        id: 'storyboard-edge-node-insert-unavailable',
        kind: 'warning',
        message: 'This edge is no longer available.',
        ttlMs: 2200,
      })
      setActiveEdgeId(null)
      return
    }
    props.commitGraphData(result.graphData)
    setSelectionSource('canvas')
    selectNode(String(result.insertedNode.id || ''))
    props.upsertUiToast({
      id: 'storyboard-edge-node-inserted',
      kind: 'success',
      message: `Created ${result.insertedNode.label}.`,
      ttlMs: 1800,
    })
    setActiveEdgeId(null)
  }, [activeEdgeId, anchors, props, selectNode, setSelectionSource])

  if (!props.active || !props.canEdit || anchors.length === 0) return null
  const menuAnchor = anchors.find(anchor => anchor.edgeId === activeEdgeId) || null

  return (
    <>
      {anchors.map(anchor => (
        <button
          key={anchor.edgeId}
          type="button"
          data-kg-edge-node-insert-trigger={anchor.edgeId}
          className={`absolute pointer-events-auto grid h-6 w-6 place-items-center rounded-full border shadow-sm ${UI_THEME_TOKENS.panel.overlayBg} ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.button.text}`}
          style={{
            left: anchor.left,
            top: anchor.top,
            transform: 'translate(-50%, -50%)',
            zIndex: Z_INDEX_MENU - 1,
          }}
          aria-label={`Insert node on edge ${anchor.edgeId}`}
          aria-haspopup="menu"
          aria-expanded={activeEdgeId === anchor.edgeId}
          onPointerDown={event => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            setActiveEdgeId(current => current === anchor.edgeId ? null : anchor.edgeId)
          }}
        >
          <Plus size={14} strokeWidth={2.25} />
        </button>
      ))}
      {menuAnchor ? (
        <section
          ref={menuRef}
          role="menu"
          aria-label="Add node"
          data-kg-edge-node-insert-menu={menuAnchor.edgeId}
          className={`absolute pointer-events-auto min-w-44 rounded-lg border p-1 shadow-lg ${UI_THEME_TOKENS.panel.overlayBg} ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.primary}`}
          style={{
            left: menuAnchor.left + 16,
            top: menuAnchor.top + 16,
            zIndex: Z_INDEX_MENU,
          }}
        >
          <header className={`px-2 py-1 text-[11px] font-semibold ${UI_THEME_TOKENS.text.tertiary}`}>Add node</header>
          {STORYBOARD_EDGE_INSERTION_OPTIONS.map(option => {
            const Icon = ICON_BY_KIND[option.kind]
            return (
              <button
                key={option.kind}
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${UI_THEME_TOKENS.button.hoverBg}`}
                onClick={() => insertNode(option.kind)}
              >
                <Icon size={15} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </section>
      ) : null}
    </>
  )
}
