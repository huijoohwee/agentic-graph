import type { GraphData } from '@/lib/graph/types'

/** Name existing hit surfaces; keyboard activation reuses their pointer action. */
export function bindGraphSemanticTargets2d(root: SVGGElement | null, graph: GraphData): void {
  if (!root) return
  const background = root.parentElement?.querySelector<SVGElement>('[data-kg-layer="interaction-background"]')
  if (background) bindKeyboardActivation(background)
  const nodes = new Map(graph.nodes.map(node => [String(node.id), String(node.label || node.id)]))
  const edges = new Map(graph.edges.map(edge => [String(edge.id), edge]))
  const covered = new Set(Array.from(root.querySelectorAll('[data-kg-covered-by-media="1"]'))
    .map(element => element.getAttribute('data-node-id')))
  const groupNames = new Map(Array.from(root.querySelectorAll('[data-kg-group-label]'))
    .map(element => [element.getAttribute('data-kg-group-id'), element.getAttribute('data-label-full') || element.textContent]))
  const selectors = [
    '[data-kg-layer="nodes"] > [data-node-id]',
    '[data-kg-layer="labels"] > [data-node-id]',
    '[data-kg-layer="links-hit"] > [data-edge-id]',
    '[data-kg-layer="edge-labels"] > [data-edge-id]',
    '[data-kg-layer="groups-hit"] > [data-kg-group-id]',
    '[data-kg-group-label]',
  ]
  for (const element of root.querySelectorAll<SVGElement>(selectors.join(','))) {
    const nodeId = element.getAttribute('data-node-id')
    if (nodeId && covered.has(nodeId)) {
      element.style.pointerEvents = 'none'
      element.removeAttribute('role')
      element.removeAttribute('tabindex')
      element.removeAttribute('aria-label')
      element.onkeydown = null
      continue
    }
    const edgeId = element.getAttribute('data-edge-id')
    const groupId = element.getAttribute('data-kg-group-id')
    const edge = edgeId ? edges.get(edgeId) : null
    const endpointLabel = (value: unknown) => {
      const id = typeof value === 'object' && value !== null && 'id' in value ? String(value.id) : String(value || '')
      return nodes.get(id) || id
    }
    const label = nodeId ? `Node ${nodes.get(nodeId) || nodeId}`
      : groupId ? `Cluster ${groupNames.get(groupId) || groupId}`
      : edge ? `${edge.label || 'Edge'}: ${endpointLabel(edge.source)} → ${endpointLabel(edge.target)}`
      : `Edge ${edgeId}`
    element.setAttribute('role', 'button')
    element.setAttribute('aria-label', label)
    // Labels remain individual pointer targets without adding a second tab stop.
    element.setAttribute('tabindex', element.tagName.toLowerCase() === 'text' ? '-1' : '0')
    bindKeyboardActivation(element)
  }
}

function bindKeyboardActivation(element: SVGElement): void {
  element.onkeydown = event => {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return
    event.preventDefault()
    event.stopPropagation()
    const MouseEventCtor = element.ownerDocument.defaultView?.MouseEvent
    if (MouseEventCtor) element.dispatchEvent(new MouseEventCtor('click', {
      bubbles: true, cancelable: true, button: 0,
      shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
    }))
  }
}
