import type * as d3 from 'd3'
import type { GraphEdge } from '@/lib/graph/types'
import type { HoverInfo } from '@/components/GraphHoverTooltip'
import { emitPropsPanelOpen } from '@/features/canvas/utils'
import { isTooltipRelatedTarget } from 'agentic-design-system/hover/text'

export const attachEdgeInteractionHandlers = (
  sel: d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>,
  args: {
    hoverEnabled: boolean
    setHoverInfo: (updater: (prev: HoverInfo | null) => HoverInfo | null) => void
    setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void
    selectEdge: (id: string | null) => void
    selectNode?: (id: string | null) => void
    enableContextMenu?: boolean
  },
) => {
  const { hoverEnabled, setHoverInfo, setSelectionSource, selectEdge, selectNode, enableContextMenu } = args

  sel
    .style('cursor', 'pointer')
    .on('click', (event: MouseEvent, d: GraphEdge) => {
      event.stopPropagation()
      setSelectionSource('canvas')
      selectEdge(String(d.id))
    })
    .on('mouseover', (event: MouseEvent, d: GraphEdge) => {
      if (!hoverEnabled) return
      setHoverInfo(() => ({ kind: 'edge', id: String(d.id), clientX: event.clientX, clientY: event.clientY }))
    })
    .on('mousemove', (event: MouseEvent, d: GraphEdge) => {
      if (!hoverEnabled) return
      setHoverInfo(() => ({ kind: 'edge', id: String(d.id), clientX: event.clientX, clientY: event.clientY }))
    })
    .on('mouseout', (event: MouseEvent, d: GraphEdge) => {
      if (!hoverEnabled) return
      const rt = (event as unknown as { relatedTarget?: unknown }).relatedTarget
      if (isTooltipRelatedTarget(rt)) return
      const id = String(d.id)
      setHoverInfo(prev => (prev && prev.kind === 'edge' && prev.id === id ? null : prev))
    })

  if (enableContextMenu) {
    sel.on('contextmenu', (event: MouseEvent, d: GraphEdge) => {
      event.preventDefault()
      event.stopPropagation()
      setSelectionSource('menu')
      if (selectNode) selectNode(null)
      selectEdge(String(d.id))
      emitPropsPanelOpen({ clientX: event.clientX, clientY: event.clientY })
    })
  }
}
