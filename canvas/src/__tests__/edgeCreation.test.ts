import { JSDOM } from 'jsdom'
import { select } from 'd3'
import {
  cancelPendingEdge,
  finalizePendingEdge,
  freezePendingEdgeAt,
  movePendingEdgeEnd,
  nudgePendingEdgeEnd,
  resolveEdgeCreationGraphData,
  resumeTemporaryEdge,
} from '@/features/edge-creation'
import type { GraphData, GraphEdge } from '@/lib/graph/types'
import type { PendingLink, TempLinkSelection } from '@/features/edge-creation'

function ensureGraphEdge(edge: GraphEdge | null): GraphEdge {
  if (!edge) throw new Error('edge not created correctly')
  return edge
}

function ensurePartialEdge(edge: Partial<GraphEdge> | null): Partial<GraphEdge> {
  if (!edge) throw new Error('edge is missing')
  return edge
}

export const testFinalizeCreateEdge = () => {
  const data: GraphData = {
    context: '',
    type: 'Graph',
    nodes: [
      { id: 'a', label: 'A', type: 'entity', properties: {} },
      { id: 'b', label: 'B', type: 'entity', properties: {} },
    ],
    edges: [],
  }
  const temp: { current: TempLinkSelection } = { current: null }
  const linkRef: { current: PendingLink | null } = { current: { mode: 'create', fromId: 'a' } }
  let added: GraphEdge | null = null
  let selected: string | null = null
  const ok = finalizePendingEdge(
    'b',
    null,
    data,
    null,
    temp,
    linkRef,
    (e: GraphEdge) => { added = e; data.edges.push(e) },
    (id: string, u: Partial<GraphEdge>) => { void id; void u },
    (id: string) => { selected = id },
    (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => { void src },
  )
  if (!ok) throw new Error('should finalize create')
  const addedEdge = ensureGraphEdge(added)
  if (!addedEdge || addedEdge.source !== 'a' || addedEdge.target !== 'b') {
    throw new Error('edge not created correctly')
  }
  if (!selected || selected !== addedEdge.id) throw new Error('edge not selected after create')
}

export const testFinalizeUseExistingEdge = () => {
  const data: GraphData = {
    context: '',
    type: 'Graph',
    nodes: [
      { id: 'a', label: 'A', type: 'entity', properties: {} },
      { id: 'b', label: 'B', type: 'entity', properties: {} },
    ],
    edges: [ { id: 'e1', source: 'a', target: 'b', label: 'link', properties: {} } ],
  }
  const temp: { current: TempLinkSelection } = { current: null }
  const linkRef: { current: PendingLink | null } = { current: { mode: 'create', fromId: 'a' } }
  let selected: string | null = null
  const ok = finalizePendingEdge(
    'b',
    null,
    data,
    null,
    temp,
    linkRef,
    (e: GraphEdge) => { void e; throw new Error('should not add new edge') },
    (id: string, u: Partial<GraphEdge>) => { void id; void u },
    (id: string) => { selected = id },
    (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => { void src },
  )
  if (!ok) throw new Error('should finalize existing')
  if (selected !== 'e1') throw new Error('should select existing edge')
}

export const testFinalizeUpdateSource = () => {
  const data: GraphData = {
    context: '',
    type: 'Graph',
    nodes: [
      { id: 'a', label: 'A', type: 'entity', properties: {} },
      { id: 'b', label: 'B', type: 'entity', properties: {} },
      { id: 'c', label: 'C', type: 'entity', properties: {} },
    ],
    edges: [ { id: 'e1', source: 'a', target: 'b', label: 'link', properties: {} } ],
  }
  const temp: { current: TempLinkSelection } = { current: null }
  const linkRef: { current: PendingLink | null } = { current: { mode: 'update-source', fromId: 'a' } }
  let updated: Partial<GraphEdge> | null = null
  let selected: string | null = null
  const ok = finalizePendingEdge(
    'c',
    null,
    data,
    'e1',
    temp,
    linkRef,
    (e: GraphEdge) => { void e },
    (id: string, u: Partial<GraphEdge>) => { void id; updated = u },
    (id: string) => { selected = id },
    (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => { void src },
  )
  if (!ok) throw new Error('should finalize update-source')
  const updatedEdge = ensurePartialEdge(updated)
  if (!updatedEdge || updatedEdge.source !== 'c') throw new Error('should update source to c')
  if (selected !== 'e1') throw new Error('should select updated edge')
}

export const testFinalizeUpdateTarget = () => {
  const data: GraphData = {
    context: '',
    type: 'Graph',
    nodes: [
      { id: 'a', label: 'A', type: 'entity', properties: {} },
      { id: 'b', label: 'B', type: 'entity', properties: {} },
      { id: 'c', label: 'C', type: 'entity', properties: {} },
    ],
    edges: [ { id: 'e1', source: 'a', target: 'b', label: 'link', properties: {} } ],
  }
  const temp: { current: TempLinkSelection } = { current: null }
  const linkRef: { current: PendingLink | null } = { current: { mode: 'update-target', fromId: 'b' } }
  let updated: Partial<GraphEdge> | null = null
  let selected: string | null = null
  const ok = finalizePendingEdge(
    'c',
    null,
    data,
    'e1',
    temp,
    linkRef,
    (e: GraphEdge) => { void e },
    (id: string, u: Partial<GraphEdge>) => { void id; updated = u },
    (id: string) => { selected = id },
    (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => { void src },
  )
  if (!ok) throw new Error('should finalize update-target')
  const updatedEdgeTarget = ensurePartialEdge(updated)
  if (!updatedEdgeTarget || updatedEdgeTarget.target !== 'c') {
    throw new Error('should update target to c')
  }
  if (selected !== 'e1') throw new Error('should select updated edge')
}

export const testTemporaryEdgeFreezeResumeLifecycle = () => {
  const dom = new JSDOM('<!doctype html><html><body><svg><g><line></line><circle data-kg-layer="temp-link-endpoint"></circle></g></svg></body></html>')
  const line = dom.window.document.querySelector<SVGLineElement>('line')
  const endpoint = dom.window.document.querySelector<SVGCircleElement>('circle')
  if (!line || !endpoint) throw new Error('expected temporary edge fixtures')
  const temp: { current: TempLinkSelection } = {
    current: select(line) as unknown as NonNullable<TempLinkSelection>,
  }
  const linkRef: { current: PendingLink | null } = {
    current: {
      mode: 'create',
      fromId: 'a',
      start: { x: 10, y: 20 },
      end: { x: 10, y: 20 },
      phase: 'drawing',
    },
  }

  if (!freezePendingEdgeAt(temp, linkRef, { x: 30, y: 40 })) {
    throw new Error('expected a new connection to freeze as a temporary edge')
  }
  if (linkRef.current?.phase !== 'temporary') throw new Error('expected temporary phase')
  if (line.getAttribute('data-kg-temporary-edge') !== 'true') throw new Error('expected temporary edge marker')
  if (line.style.pointerEvents !== 'stroke') throw new Error('expected frozen edge to be resumable')
  if (endpoint.getAttribute('cx') !== '30' || endpoint.getAttribute('cy') !== '40') {
    throw new Error('expected endpoint at the release position')
  }
  if (endpoint.getAttribute('aria-hidden') !== 'false' || endpoint.getAttribute('tabindex') !== '0') {
    throw new Error('expected accessible temporary endpoint')
  }
  if (!nudgePendingEdgeEnd(temp, linkRef, { x: 12, y: -8 })) {
    throw new Error('expected keyboard endpoint nudge')
  }
  if (endpoint.getAttribute('cx') !== '42' || endpoint.getAttribute('cy') !== '32') {
    throw new Error('expected keyboard endpoint nudge position')
  }

  if (!resumeTemporaryEdge(temp, linkRef)) throw new Error('expected temporary edge to resume')
  if (String(linkRef.current?.phase || '') !== 'drawing') throw new Error('expected drawing phase after resume')
  if (!movePendingEdgeEnd(temp, linkRef, { x: 50, y: 60 })) throw new Error('expected resumed endpoint to follow')
  if (endpoint.getAttribute('cx') !== '50' || endpoint.getAttribute('cy') !== '60') {
    throw new Error('expected resumed endpoint position')
  }

  cancelPendingEdge(linkRef, temp)
  if (linkRef.current !== null) throw new Error('expected cancellation to clear pending state')
  if (line.style.display !== 'none' || endpoint.style.display !== 'none') {
    throw new Error('expected cancellation to clear temporary visuals')
  }
}

export const testTemporaryEdgeRejectsEndpointUpdateFreeze = () => {
  const temp: { current: TempLinkSelection } = { current: null }
  const linkRef: { current: PendingLink | null } = {
    current: { mode: 'update-target', fromId: 'b', phase: 'drawing' },
  }
  if (freezePendingEdgeAt(temp, linkRef, { x: 30, y: 40 })) {
    throw new Error('expected endpoint updates to cancel instead of becoming temporary edges')
  }
  if (String(linkRef.current?.phase || '') === 'temporary') throw new Error('unexpected temporary endpoint update')
}

export const testEdgeCreationPrefersRenderedGraphData = () => {
  const rendered: GraphData = {
    context: 'rendered',
    type: 'Graph',
    nodes: [{ id: 'rendered-node', label: 'Rendered', type: 'entity', properties: {} }],
    edges: [],
  }
  const fallback: GraphData = {
    context: 'fallback',
    type: 'Graph',
    nodes: [{ id: 'fallback-node', label: 'Fallback', type: 'entity', properties: {} }],
    edges: [],
  }
  if (resolveEdgeCreationGraphData(rendered, fallback) !== rendered) {
    throw new Error('expected edge creation to resolve nodes from the rendered graph')
  }
  if (resolveEdgeCreationGraphData(null, fallback) !== fallback) {
    throw new Error('expected edge creation to fall back to the store graph')
  }
}
