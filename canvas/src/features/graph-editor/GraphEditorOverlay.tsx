import React from 'react'
import { pointer, zoomTransform } from 'd3'
import { canvasTools, type CanvasToolId } from 'agentic-design-system/react/panels'
import { useGraphStore } from '@/hooks/useGraphStore'
import { GraphEditorToolRail } from './GraphEditorToolRail'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME, UI_RESPONSIVE_SIDE_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

const Inspector = React.lazy(() => import('./GraphEditorRightPanel').then(module => ({ default: module.GraphEditorRightPanel })))
const authorTools = new Set<CanvasToolId>(['node', 'edge', 'subgraph'])

export function GraphEditorOverlay({ active, svgRef }: { active: boolean; svgRef: React.RefObject<SVGSVGElement | null> }) {
  const toolId = useGraphStore(state => state.graphEditorToolId)
  const setToolId = useGraphStore(state => state.setGraphEditorToolId)
  const [workspace, setWorkspace] = React.useState(false)
  React.useLayoutEffect(() => {
    setWorkspace(active && !!svgRef.current?.closest('[data-kg-graph-authoring-surface="workspace"]'))
  }, [active, svgRef])
  const [freehand, setFreehand] = React.useState(false)
  const strokeActive = toolId === 'node' && freehand
  const [inspecting, setInspecting] = React.useState(false)
  const documentKey = useGraphStore(state => state.markdownDocumentName)
  const [status, setStatus] = React.useState('')
  React.useEffect(() => {
    setStatus('')
    const svg = svgRef.current
    const surface = svg?.parentElement
    if (!active || !workspace || !surface || !svg) return
    let first: string | null = null
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
          (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable=true],[role=textbox]'))) return
      const key = event.key.toUpperCase()
      const match = (Object.keys(canvasTools) as CanvasToolId[]).find(id => canvasTools[id].hotkey === key)
      if (event.key === 'Escape' || match) {
        first = null
        setStatus('')
        setToolId(match ?? 'select')
        event.preventDefault()
      }
    }
    surface.addEventListener('keydown', keydown)
    const onClick = (event: MouseEvent) => {
      if (strokeActive || !authorTools.has(toolId) || event.defaultPrevented || event.button !== 0 || isSpacePanHeld()) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const state = useGraphStore.getState()
      const nodeId = event.target instanceof Element ? event.target.closest('[data-node-id]')?.getAttribute('data-node-id') : null
      if (toolId === 'edge' && !nodeId) { setStatus('Choose a node at each end of the edge.'); return }
      if (toolId === 'edge' && !first) { first = nodeId; setStatus('Choose the destination node.'); return }
      const [x, y] = zoomTransform(svg).invert(pointer(event, svg))
      const intent = toolId === 'node' ? { tool: 'node' as const, x, y }
        : toolId === 'edge' ? { tool: 'edge' as const, source: first!, target: nodeId! }
        : { tool: 'subgraph' as const, members: [...new Set([...state.selectedNodeIds, ...(nodeId ? [nodeId] : [])])] }
      first = null
      void import('./authorCanvasTool').then(module => {
        const current = useGraphStore.getState()
        if (current.markdownDocumentName !== documentKey || current.graphDataRevision !== state.graphDataRevision) throw new Error('The canvas changed. Choose the tool target again.')
        return module.authorCanvasTool(intent)
      }).then(() => setStatus('Added ' + intent.tool + '.')).catch(error => setStatus(error instanceof Error ? error.message : 'Unable to edit canvas.'))
    }
    const previous = svg.style.pointerEvents
    if (authorTools.has(toolId)) svg.style.pointerEvents = 'all'
    let disposed = false
    let unbindStroke: (() => void) | undefined
    if (strokeActive) void import('./canvasFreehandGesture').then(({ bindCanvasFreehand }) => {
      if (!disposed) unbindStroke = bindCanvasFreehand(svg, setStatus)
    }).catch(() => setStatus('The freehand tool could not be loaded.'))
    svg.addEventListener('click', onClick, true)
    return () => {
      disposed = true
      unbindStroke?.()
      surface.removeEventListener('keydown', keydown)
      svg.removeEventListener('click', onClick, true)
      svg.style.pointerEvents = previous
    }
  }, [active, documentKey, setToolId, svgRef, strokeActive, toolId, workspace])
  if (!active || !workspace) return null
  return (
    <section className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME} aria-label="Graph editor overlay">
      <section className="absolute left-3 top-3 z-[260] max-w-full pointer-events-auto">
        <details>
          <summary className="agentic-toolbar-item">Graph tools · {canvasTools[toolId]?.label}</summary>
          <GraphEditorToolRail activeToolId={toolId} onSelectTool={setToolId} />
          {toolId === 'node' && <label className="agentic-toolbar-item">
            <input type="checkbox" checked={freehand} onChange={event => setFreehand(event.target.checked)} /> Freehand stroke
          </label>}
          <button type="button" className="agentic-toolbar-item" aria-expanded={inspecting} onClick={() => setInspecting(!inspecting)}>Inspector</button>
        </details>
        {status && <p role="status">{status}</p>}
      </section>
      {inspecting && <section className={`absolute bottom-3 right-3 z-[260] pointer-events-auto ${UI_RESPONSIVE_SIDE_PANEL_CLASSNAME}`}>
        <React.Suspense fallback={null}><Inspector /></React.Suspense>
      </section>}
    </section>
  )
}
