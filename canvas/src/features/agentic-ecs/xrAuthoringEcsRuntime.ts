import { hydrateKgcDocument } from '../../../../ecs/hydration.js'
import { stableStringifyJson } from '../../../../ecs/kgcNodeContract.js'
import { disposeWorld } from '../../../../ecs/world.js'
import type { GraphData } from '@/lib/graph/types'
import {
  XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_EDGES,
  XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_NODES,
  projectXrAuthoringRenderPlan,
  type XrAuthoringRenderPlan,
} from '@/features/xr-v2/authoringRenderPlan'

export const XR_AUTHORING_ECS_RUNTIME_SCHEMA = 'knowgrph-xr-authoring-ecs-runtime/v1' as const

export type XrAuthoringEcsInput = Readonly<{
  documentName: string | null
  documentSourceUrl: string | null
  graphData: GraphData
  graphDataRevision: number
}>

export type XrAuthoringEcsRuntimeSnapshot = Readonly<{
  schema: typeof XR_AUTHORING_ECS_RUNTIME_SCHEMA
  status: 'idle' | 'ready' | 'invalid'
  documentKey: string
  graphDataRevision: number
  sourceDigest: string
  plan: XrAuthoringRenderPlan | null
  counts: Readonly<{
    entities: number
    materials: number
    behaviors: number
    particles: number
    timelines: number
  }>
  error: null | Readonly<{ errorCode: string; message: string; unreadableRef: string }>
  revision: number
}>

const ZERO_COUNTS = Object.freeze({ entities: 0, materials: 0, behaviors: 0, particles: 0, timelines: 0 })
let currentWorld: object | null = null
let owners = new Set<symbol>()
let snapshot: XrAuthoringEcsRuntimeSnapshot = Object.freeze({
  schema: XR_AUTHORING_ECS_RUNTIME_SCHEMA,
  status: 'idle',
  documentKey: '',
  graphDataRevision: 0,
  sourceDigest: '',
  plan: null,
  counts: ZERO_COUNTS,
  error: null,
  revision: 0,
})
const listeners = new Set<() => void>()

function publish(next: Omit<XrAuthoringEcsRuntimeSnapshot, 'schema' | 'revision'>): XrAuthoringEcsRuntimeSnapshot {
  snapshot = Object.freeze({
    schema: XR_AUTHORING_ECS_RUNTIME_SCHEMA,
    ...next,
    revision: snapshot.revision + 1,
  })
  for (const listener of listeners) listener()
  return snapshot
}

function closeCurrentWorld(): void {
  if (!currentWorld) return
  disposeWorld(currentWorld)
  currentWorld = null
}

function buildDocumentKey(input: XrAuthoringEcsInput): string {
  const name = String(input.documentName || 'untitled').trim() || 'untitled'
  const source = String(input.documentSourceUrl || 'local').trim() || 'local'
  return `${name}::${source}`
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function graphHasXrAuthoringSource(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false
  const graphData = candidate as Partial<GraphData>
  if (!Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)
    || graphData.nodes.length > XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_NODES
    || graphData.edges.length > XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_EDGES) return false
  let hasXrSchema = false
  let hasXrEntity = false
  for (const node of graphData.nodes) {
    if (!node || typeof node !== 'object' || !node.properties || typeof node.properties !== 'object') return false
    if (node.type === 'EcsEntity') {
      const payload = (node.properties as Record<string, unknown>).ecsEntity
      const components = payload && typeof payload === 'object'
        ? (payload as { components?: unknown }).components
        : null
      if (components && typeof components === 'object' && !Array.isArray(components)
        && Object.keys(components).some(name => name.startsWith('Xr'))) hasXrEntity = true
    }
    if (node.type !== 'EcsComponentSchema') continue
    const payload = (node.properties as Record<string, unknown>).ecsComponent
    if (payload && typeof payload === 'object'
      && typeof (payload as { name?: unknown }).name === 'string'
      && String((payload as { name: string }).name).startsWith('Xr')) hasXrSchema = true
  }
  return hasXrSchema && hasXrEntity
}

function invalidSnapshot(input: Readonly<{
  documentKey: string
  graphDataRevision: number
  sourceDigest: string
  errorCode: string
  message: string
  unreadableRef: string
}>): XrAuthoringEcsRuntimeSnapshot {
  closeCurrentWorld()
  return publish({
    status: 'invalid',
    documentKey: input.documentKey,
    graphDataRevision: input.graphDataRevision,
    sourceDigest: input.sourceDigest,
    plan: null,
    counts: ZERO_COUNTS,
    error: Object.freeze({
      errorCode: input.errorCode,
      message: input.message,
      unreadableRef: input.unreadableRef,
    }),
  })
}

export function reconcileXrAuthoringEcs(input: XrAuthoringEcsInput): XrAuthoringEcsRuntimeSnapshot {
  if (!input?.graphData || !Array.isArray(input.graphData.nodes) || !Array.isArray(input.graphData.edges)
    || !Number.isSafeInteger(input.graphDataRevision) || input.graphDataRevision < 0) {
    return invalidSnapshot({
      documentKey: '', graphDataRevision: 0, sourceDigest: '',
      errorCode: 'XR_AUTHORING_INPUT_INVALID', message: 'XR authoring input is invalid', unreadableRef: 'graphData',
    })
  }
  const documentKey = buildDocumentKey(input)
  let sourceDigest = ''
  try {
    sourceDigest = fnv1a32(stableStringifyJson(input.graphData))
  } catch {
    return invalidSnapshot({
      documentKey, graphDataRevision: input.graphDataRevision, sourceDigest,
      errorCode: 'XR_AUTHORING_SOURCE_INVALID', message: 'XR authoring source is not canonical JSON', unreadableRef: 'graphData',
    })
  }
  if (snapshot.documentKey === documentKey
    && snapshot.graphDataRevision === input.graphDataRevision
    && snapshot.sourceDigest === sourceDigest) return snapshot

  if (!graphHasXrAuthoringSource(input.graphData)) {
    closeCurrentWorld()
    return publish({
      status: 'idle', documentKey, graphDataRevision: input.graphDataRevision, sourceDigest,
      plan: null, counts: ZERO_COUNTS, error: null,
    })
  }

  const hydrated = hydrateKgcDocument(input.graphData)
  if (!hydrated.ok) {
    return invalidSnapshot({
      documentKey, graphDataRevision: input.graphDataRevision, sourceDigest,
      errorCode: hydrated.errorCode,
      message: hydrated.message,
      unreadableRef: hydrated.unreadableRef,
    })
  }
  const candidateWorld = hydrated.world as object
  const projected = projectXrAuthoringRenderPlan(candidateWorld, input.graphData, {
    documentKey,
    graphDataRevision: input.graphDataRevision,
    sourceDigest,
  })
  if (projected.status !== 'ready') {
    disposeWorld(candidateWorld)
    return invalidSnapshot({
      documentKey, graphDataRevision: input.graphDataRevision, sourceDigest,
      errorCode: 'XR_AUTHORING_PROJECTION_INVALID',
      message: projected.reason,
      unreadableRef: projected.unreadableRef,
    })
  }

  const previousWorld = currentWorld
  currentWorld = candidateWorld
  if (previousWorld) disposeWorld(previousWorld)
  const plan = projected.plan
  return publish({
    status: 'ready',
    documentKey,
    graphDataRevision: input.graphDataRevision,
    sourceDigest,
    plan,
    counts: Object.freeze({
      entities: plan.entities.length,
      materials: Object.keys(plan.materialGraphs).length,
      behaviors: plan.behaviorGraph.behaviors.length,
      particles: plan.entities.filter(entity => entity.particleEmitter !== null).length,
      timelines: plan.timelines.length,
    }),
    error: null,
  })
}

export function acquireXrAuthoringEcsRuntimeOwner(): symbol {
  const token = Symbol('xr-authoring-ecs-owner')
  owners.add(token)
  return token
}

export function releaseXrAuthoringEcsRuntime(ownerToken: symbol): void {
  if (!owners.delete(ownerToken) || owners.size > 0) return
  closeCurrentWorld()
  publish({
    status: 'idle', documentKey: '', graphDataRevision: 0, sourceDigest: '',
    plan: null, counts: ZERO_COUNTS, error: null,
  })
}

export function readXrAuthoringEcsRuntime(): XrAuthoringEcsRuntimeSnapshot {
  return snapshot
}

export function subscribeXrAuthoringEcsRuntime(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
