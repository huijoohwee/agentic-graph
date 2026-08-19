import type { Edge } from './bundle-types'
import {
  affectedSetFromOutgoing,
  type TopologyResult,
  type TraversalObserver,
} from './topo-order'

export type AdjacencyDiagnostics = Readonly<{
  buildsThisWake: number
  edgeCount: number
}>

export class BundleGraphAdjacency {
  private readonly outgoing = new Map<string, string[]>()
  private edges: Edge[] = []

  constructor(edges: readonly Edge[]) {
    this.replaceAfterInitialization(edges)
  }

  affectedSet(
    changedLegId: string,
    legIds: readonly string[],
    observer?: TraversalObserver,
  ): TopologyResult {
    return affectedSetFromOutgoing(changedLegId, legIds, this.outgoing, observer)
  }

  insert(edge: Edge): void {
    if (this.edges.some((item) => sameEdge(item, edge))) return
    this.edges.push(Object.freeze({ ...edge }))
    this.edges.sort(compareEdges)
    const targets = this.outgoing.get(edge.fromLegId) ?? []
    if (!targets.includes(edge.toLegId)) insertSorted(targets, edge.toLegId)
    this.outgoing.set(edge.fromLegId, targets)
  }

  replaceAfterInitialization(edges: readonly Edge[]): void {
    this.edges = []
    this.outgoing.clear()
    for (const edge of edges) this.insert(edge)
  }

  snapshotEdges(): readonly Edge[] {
    return Object.freeze(this.edges.map((edge) => Object.freeze({ ...edge })))
  }

  diagnostics(): AdjacencyDiagnostics {
    return Object.freeze({ buildsThisWake: 1, edgeCount: this.edges.length })
  }
}

function sameEdge(left: Edge, right: Edge): boolean {
  return left.fromLegId === right.fromLegId && left.toLegId === right.toLegId
}

function compareEdges(left: Edge, right: Edge): number {
  return left.fromLegId.localeCompare(right.fromLegId) || left.toLegId.localeCompare(right.toLegId)
}

function insertSorted(values: string[], value: string): void {
  const index = values.findIndex((candidate) => candidate.localeCompare(value) > 0)
  if (index < 0) values.push(value)
  else values.splice(index, 0, value)
}
