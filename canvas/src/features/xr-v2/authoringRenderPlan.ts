import { snapshotWorld } from '../../../../ecs/world.js'
import { query } from '../../../../ecs/index.js'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'

import {
  BEHAVIOR_GRAPH_SCHEMA,
  createExactOnceBehaviorDispatcher,
  type AuthoringBehaviorAction,
  type AuthoringBehaviorGraph,
  type BehaviorTrigger,
} from './behaviorDispatcher'
import {
  compileMeshStandardMaterialGraph,
  type MaterialGraph,
} from './materialGraph'
import { createParticleEmitter, type ParticleEmitterConfig } from './particleEmitter'
import {
  createXrV2TimelineSequence,
  type XrV2TimelineSequenceDefinition,
} from './timelineSequencer'

export const XR_AUTHORING_RENDER_PLAN_SCHEMA = 'knowgrph-xr-authoring-render-plan/v1' as const
export const XR_AUTHORING_RENDER_PLAN_MAX_ENTITIES = 1_024
export const XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_NODES = 4_096
export const XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_EDGES = 8_192

export type XrAuthoringTransform = Readonly<{
  position: readonly [number, number, number]
  quaternion: readonly [number, number, number, number]
  scale: readonly [number, number, number]
}>

export type XrAuthoringRenderEntity = Readonly<{
  entityId: number
  entityRef: string
  componentNames: readonly string[]
  transform: XrAuthoringTransform
  renderable: null | Readonly<{
    geometry: 'box' | 'sphere' | 'plane'
    visible: boolean
    materialGraphId: string | null
  }>
  particleEmitter: null | Readonly<ParticleEmitterConfig & { size: number; color: number }>
  timelineIds: readonly string[]
}>

export type XrAuthoringTimelinePlan = Readonly<{
  id: string
  entityRef: string
  definition: XrV2TimelineSequenceDefinition
}>

export type XrAuthoringRenderPlan = Readonly<{
  schema: typeof XR_AUTHORING_RENDER_PLAN_SCHEMA
  documentKey: string
  graphDataRevision: number
  sourceDigest: string
  componentQueries: Readonly<{
    transformed: readonly number[]
    renderable: readonly number[]
    particles: readonly number[]
    rigs: readonly number[]
  }>
  entities: readonly XrAuthoringRenderEntity[]
  materialGraphs: Readonly<Record<string, MaterialGraph>>
  behaviorGraph: AuthoringBehaviorGraph
  timelines: readonly XrAuthoringTimelinePlan[]
}>

export type XrAuthoringRenderPlanResult =
  | Readonly<{ status: 'ready'; plan: XrAuthoringRenderPlan }>
  | Readonly<{ status: 'invalid'; reason: string; unreadableRef: string }>

type WorldSnapshot = Readonly<{
  components: readonly Readonly<{ name: string }>[]
  entities: readonly Readonly<{
    entityId: number
    entityRef: string
    components: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  }>[]
}>

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const ACTION_KINDS = new Set(['set-visible', 'apply-material', 'emit-particle-burst', 'play-timeline'])
const BEHAVIOR_TRIGGERS = new Set<BehaviorTrigger>([
  'select', 'hover-enter', 'hover-exit', 'proximity-enter', 'proximity-exit', 'timeline-marker',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function finiteField(fields: Readonly<Record<string, unknown>>, key: string): number {
  const value = fields[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`invalid numeric field ${key}`)
  return value
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readProperty(node: GraphNode, key: string): unknown {
  return (node.properties as Record<string, JSONValue | undefined>)[key]
}

function edgeKind(edge: GraphEdge): string {
  return String(edge.type || edge.label || '')
}

function entityRefFromNode(node: GraphNode): string | null {
  const payload = readProperty(node, 'ecsEntity')
  if (!isRecord(payload) || typeof payload.entityRef !== 'string' || !SAFE_ID.test(payload.entityRef)) return null
  return payload.entityRef
}

function projectTransform(fields: Readonly<Record<string, unknown>>): XrAuthoringTransform {
  if (!exactKeys(fields, ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'sx', 'sy', 'sz'])) {
    throw new TypeError('XrTransform fields must be exact')
  }
  const position = [finiteField(fields, 'px'), finiteField(fields, 'py'), finiteField(fields, 'pz')] as const
  const quaternionValues = [
    finiteField(fields, 'qx'), finiteField(fields, 'qy'), finiteField(fields, 'qz'), finiteField(fields, 'qw'),
  ] as const
  const scale = [finiteField(fields, 'sx'), finiteField(fields, 'sy'), finiteField(fields, 'sz')] as const
  if (position.some(value => Math.abs(value) > 1_000_000)
    || scale.some(value => value <= 0 || value > 1_000)
    || quaternionValues.some(value => Math.abs(value) > 1)) throw new TypeError('unsafe XrTransform value')
  const length = Math.hypot(...quaternionValues)
  if (length <= Number.EPSILON) throw new TypeError('zero XrTransform quaternion')
  return Object.freeze({
    position: Object.freeze([...position]) as XrAuthoringTransform['position'],
    quaternion: Object.freeze(quaternionValues.map(value => value / length)) as unknown as XrAuthoringTransform['quaternion'],
    scale: Object.freeze([...scale]) as XrAuthoringTransform['scale'],
  })
}

function projectRenderable(fields: Readonly<Record<string, unknown>>): NonNullable<XrAuthoringRenderEntity['renderable']> {
  if (!exactKeys(fields, ['geometryKind', 'visible'])) throw new TypeError('XrRenderable fields must be exact')
  const geometryKind = finiteField(fields, 'geometryKind')
  const visible = finiteField(fields, 'visible')
  if (!Number.isInteger(geometryKind) || geometryKind < 0 || geometryKind > 2
    || !Number.isInteger(visible) || (visible !== 0 && visible !== 1)) {
    throw new TypeError('invalid XrRenderable value')
  }
  return Object.freeze({
    geometry: (['box', 'sphere', 'plane'] as const)[geometryKind],
    visible: visible === 1,
    materialGraphId: null,
  })
}

function projectParticle(fields: Readonly<Record<string, unknown>>): NonNullable<XrAuthoringRenderEntity['particleEmitter']> {
  if (!exactKeys(fields, ['rate', 'lifetime', 'ceiling', 'size', 'color'])) {
    throw new TypeError('XrParticleEmitter fields must be exact')
  }
  const config = {
    ratePerSecond: finiteField(fields, 'rate'),
    lifetimeSeconds: finiteField(fields, 'lifetime'),
    ceiling: finiteField(fields, 'ceiling'),
  }
  createParticleEmitter(config)
  const size = finiteField(fields, 'size')
  const color = finiteField(fields, 'color')
  if (size <= 0 || size > 1 || !Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new TypeError('invalid XrParticleEmitter render value')
  }
  return Object.freeze({ ...config, size, color })
}

function projectBehaviorGraph(
  graphData: GraphData,
  entityIdByRef: ReadonlyMap<string, number>,
): AuthoringBehaviorGraph {
  const actionNodes = graphData.nodes.filter(node => node.type === 'XrBehaviorAction')
  const triggerNodes = graphData.nodes.filter(node => node.type === 'XrBehaviorTrigger')
  const actions: AuthoringBehaviorAction[] = actionNodes.map((node): AuthoringBehaviorAction => {
    const payload = readProperty(node, 'xrBehaviorAction')
    if (!isRecord(payload) || typeof payload.actionId !== 'string' || !SAFE_ID.test(payload.actionId)
      || typeof payload.kind !== 'string' || !ACTION_KINDS.has(payload.kind)
      || typeof payload.targetEntityRef !== 'string' || !entityIdByRef.has(payload.targetEntityRef)) {
      throw new TypeError(`invalid behavior action ${node.id}`)
    }
    const parameters = payload.parameters
    if (parameters !== undefined && !isRecord(parameters)) throw new TypeError(`invalid behavior action parameters ${node.id}`)
    return Object.freeze({
      id: payload.actionId,
      kind: payload.kind,
      targetEntityId: entityIdByRef.get(payload.targetEntityRef)!,
      ...(parameters !== undefined ? { parameters: cloneJson(parameters) as Readonly<Record<string, unknown>> } : {}),
    })
  }).sort((left, right) => left.id.localeCompare(right.id))
  const actionIdByNodeId = new Map(actionNodes.map((node, index) => [node.id, actions.find(action => {
    const payload = readProperty(node, 'xrBehaviorAction') as Record<string, unknown>
    return action.id === payload.actionId
  })?.id ?? `missing:${index}`]))
  const behaviors = triggerNodes.map(node => {
    const payload = readProperty(node, 'xrBehaviorTrigger')
    if (!isRecord(payload) || typeof payload.behaviorId !== 'string' || !SAFE_ID.test(payload.behaviorId)
      || typeof payload.trigger !== 'string' || !BEHAVIOR_TRIGGERS.has(payload.trigger as BehaviorTrigger)
      || typeof payload.sourceEntityRef !== 'string' || !entityIdByRef.has(payload.sourceEntityRef)) {
      throw new TypeError(`invalid behavior trigger ${node.id}`)
    }
    const actionIds = graphData.edges
      .filter(edge => edgeKind(edge) === 'xr-behavior-wire' && edge.source === node.id)
      .map(edge => actionIdByNodeId.get(edge.target))
      .filter((value): value is string => Boolean(value) && !value.startsWith('missing:'))
      .sort()
    return Object.freeze({
      id: payload.behaviorId,
      trigger: payload.trigger as BehaviorTrigger,
      sourceEntityId: entityIdByRef.get(payload.sourceEntityRef)!,
      actionIds: Object.freeze(actionIds),
    })
  }).sort((left, right) => left.id.localeCompare(right.id))
  const behaviorGraph: AuthoringBehaviorGraph = Object.freeze({
    schema: BEHAVIOR_GRAPH_SCHEMA,
    actions: Object.freeze(actions),
    behaviors: Object.freeze(behaviors),
  })
  createExactOnceBehaviorDispatcher(behaviorGraph, () => undefined)
  return behaviorGraph
}

export function projectXrAuthoringRenderPlan(
  world: object,
  graphData: GraphData,
  context: Readonly<{ documentKey: string; graphDataRevision: number; sourceDigest: string }>,
): XrAuthoringRenderPlanResult {
  try {
    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)
      || graphData.nodes.length > XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_NODES
      || graphData.edges.length > XR_AUTHORING_RENDER_PLAN_MAX_GRAPH_EDGES) {
      throw new TypeError('graph exceeds XR authoring bounds')
    }
    const snapshot = snapshotWorld(world) as WorldSnapshot
    if (snapshot.entities.length > XR_AUTHORING_RENDER_PLAN_MAX_ENTITIES) {
      throw new TypeError('world exceeds XR authoring entity bound')
    }
    const nodeById = new Map(graphData.nodes.map(node => [node.id, node]))
    const registeredComponents = new Set(snapshot.components.map(component => component.name))
    const queryIfRegistered = (components: readonly string[]): readonly number[] => (
      components.every(component => registeredComponents.has(component))
        ? Object.freeze(query(world, [...components]))
        : Object.freeze([])
    )
    const componentQueries = Object.freeze({
      transformed: queryIfRegistered(['XrTransform']),
      renderable: queryIfRegistered(['XrTransform', 'XrRenderable']),
      particles: queryIfRegistered(['XrTransform', 'XrParticleEmitter']),
      rigs: queryIfRegistered(['XrTransform', 'XrRig']),
    })
    const transformedEntityIds = new Set(componentQueries.transformed)
    const entityNodeByRef = new Map<string, GraphNode>()
    for (const node of graphData.nodes) {
      if (node.type !== 'EcsEntity') continue
      const entityRef = entityRefFromNode(node)
      if (!entityRef || entityNodeByRef.has(entityRef)) throw new TypeError(`invalid ECS entity node ${node.id}`)
      entityNodeByRef.set(entityRef, node)
    }
    const entityIdByRef = new Map(snapshot.entities.map(entity => [entity.entityRef, entity.entityId]))

    const materialGraphs: Record<string, MaterialGraph> = Object.create(null)
    const materialGraphIdByEntityRef = new Map<string, string>()
    for (const edge of graphData.edges.filter(edge => edgeKind(edge) === 'xr-material-target')) {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      const targetRef = target ? entityRefFromNode(target) : null
      const payload = source ? readProperty(source, 'xrMaterialGraph') : null
      if (!source || !targetRef || !isRecord(payload) || materialGraphIdByEntityRef.has(targetRef)) {
        throw new TypeError(`invalid material target edge ${edge.id}`)
      }
      const graph = cloneJson(payload) as unknown as MaterialGraph
      if (compileMeshStandardMaterialGraph(graph).status !== 'ready') throw new TypeError(`invalid material graph ${source.id}`)
      materialGraphs[source.id] = graph
      materialGraphIdByEntityRef.set(targetRef, source.id)
    }

    const timelines: XrAuthoringTimelinePlan[] = []
    const timelineIdsByEntityRef = new Map<string, string[]>()
    for (const edge of graphData.edges.filter(edge => edgeKind(edge) === 'xr-timeline-target')) {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      const targetRef = target ? entityRefFromNode(target) : null
      const payload = source ? readProperty(source, 'xrTimelineSequence') : null
      if (!source || !targetRef || !isRecord(payload)) throw new TypeError(`invalid timeline target edge ${edge.id}`)
      const definition = cloneJson(payload) as unknown as XrV2TimelineSequenceDefinition
      createXrV2TimelineSequence(definition)
      timelines.push(Object.freeze({ id: source.id, entityRef: targetRef, definition }))
      const ids = timelineIdsByEntityRef.get(targetRef) ?? []
      ids.push(source.id)
      timelineIdsByEntityRef.set(targetRef, ids)
    }

    const entities = snapshot.entities.map(entity => {
      const components = entity.components
      const componentNames = Object.keys(components).sort()
      const hasXrComponent = componentNames.some(name => name.startsWith('Xr'))
      if (!hasXrComponent) return null
      if (!transformedEntityIds.has(entity.entityId)) throw new TypeError(`XR entity is absent from XrTransform query ${entity.entityRef}`)
      if (!components.XrTransform) throw new TypeError(`missing XrTransform ${entity.entityRef}`)
      if (!entityNodeByRef.has(entity.entityRef)) throw new TypeError(`missing ECS entity node ${entity.entityRef}`)
      const renderable = components.XrRenderable ? projectRenderable(components.XrRenderable) : null
      const particleEmitter = components.XrParticleEmitter ? projectParticle(components.XrParticleEmitter) : null
      const timelineIds = Object.freeze([...(timelineIdsByEntityRef.get(entity.entityRef) ?? [])].sort())
      if (timelineIds.length > 0 && finiteField(components.XrRig ?? {}, 'enabled') !== 1) {
        throw new TypeError(`timeline target lacks enabled XrRig ${entity.entityRef}`)
      }
      return Object.freeze({
        entityId: entity.entityId,
        entityRef: entity.entityRef,
        componentNames: Object.freeze(componentNames),
        transform: projectTransform(components.XrTransform),
        renderable: renderable ? Object.freeze({
          ...renderable,
          materialGraphId: materialGraphIdByEntityRef.get(entity.entityRef) ?? null,
        }) : null,
        particleEmitter,
        timelineIds,
      })
    }).filter((entity): entity is XrAuthoringRenderEntity => entity !== null)

    const behaviorGraph = projectBehaviorGraph(graphData, entityIdByRef)
    timelines.sort((left, right) => left.id.localeCompare(right.id))
    return Object.freeze({
      status: 'ready',
      plan: Object.freeze({
        schema: XR_AUTHORING_RENDER_PLAN_SCHEMA,
        documentKey: context.documentKey,
        graphDataRevision: context.graphDataRevision,
        sourceDigest: context.sourceDigest,
        componentQueries,
        entities: Object.freeze(entities),
        materialGraphs: Object.freeze(materialGraphs),
        behaviorGraph,
        timelines: Object.freeze(timelines),
      }),
    })
  } catch (error) {
    return Object.freeze({
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'invalid XR authoring graph',
      unreadableRef: 'graphData',
    })
  }
}
