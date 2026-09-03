import type { XrAuthoringRenderPlan } from './authoringRenderPlan'
import { Bone, BufferAttribute, Mesh, MeshStandardMaterial, Points, type Group, type Object3D } from 'three'
export const XR_V2_MOUNTED_AUTHORING_EVIDENCE_SCHEMA = 'agentic-graph-xr-v2-mounted-authoring-evidence/v1' as const
export const XR_V2_MOUNTED_EVIDENCE_MAX_ENTITIES = 1_024
export const XR_V2_MOUNTED_EVIDENCE_MAX_RESOURCES = 8_192
type Vector3Tuple = readonly [number, number, number]
type QuaternionTuple = readonly [number, number, number, number]
export type MountedAuthoringMeshEvidence = Readonly<{
  entityId: number
  meshUuid: string
  materialUuid: string
  mapUuid: string | null
  bindingStatus: 'not-requested' | 'pending' | 'ready' | 'invalid'
  visible: boolean
}>
export type MountedAuthoringParticleEvidence = Readonly<{
  entityId: number
  pointsUuid: string
  geometryUuid: string
  capacity: number
  positionCount: number
  liveCount: number
  highWaterCount: number
  drawStart: number
  drawCount: number
  positionAttributeVersion: number
}>
export type MountedAuthoringBoneEvidence = Readonly<{
  entityId: number
  name: string
  boneUuid: string
  isBone: true
  position: Vector3Tuple
  quaternion: QuaternionTuple
  scale: Vector3Tuple
  expectedPosition: Vector3Tuple | null
  expectedQuaternion: QuaternionTuple | null
  expectedScale: Vector3Tuple | null
  appliedPlayheadSeconds: number
  motionRevision: number
}>
export type MountedAuthoringObservation = Readonly<{
  canvas: Readonly<{
    identity: string
    connected: boolean
    width: number
    height: number
  }>
  entityIds: readonly number[]
  meshes: readonly MountedAuthoringMeshEvidence[]
  particles: readonly MountedAuthoringParticleEvidence[]
  bones: readonly MountedAuthoringBoneEvidence[]
  canonicalTimeline: Readonly<{
    playheadSeconds: number
    motionRevision: number
  }>
  behavior: Readonly<{
    revision: number
    effectCount: number
    successfulDispatchCount: number
    lastDispatchEffectCount: number
    lastEventId: string | null
    lastTrigger: string | null
    lastStatus: string | null
    lastInvokedActionIds: readonly string[]
  }>
  renderer: Readonly<{
    compileMethod: 'compileAsync' | 'compile' | 'unavailable'
    compileStatus: 'pending' | 'ready' | 'failed' | 'unavailable'
    compileCallCount: number
    observedFrameCount: number
    renderCallCount: number
  }>
  observedResourceIds: readonly string[]
}>
type ExpectedMountedEvidence = Readonly<{
  entityIds: readonly number[]
  meshEntityIds: readonly number[]
  materialGraphEntityIds: readonly number[]
  mappedMaterialEntityIds: readonly number[]
  particleEntityIds: readonly number[]
  bones: readonly Readonly<{ entityId: number; name: string }>[]
  behaviorEffectRequired: boolean
}>
export type MountedAuthoringEvidenceSnapshot = Readonly<{
  schema: typeof XR_V2_MOUNTED_AUTHORING_EVIDENCE_SCHEMA
  status: 'idle' | 'mounting' | 'ready' | 'invalid'
  reason: string | null
  source: null | Readonly<{
    documentKey: string
    graphDataRevision: number
    sourceDigest: string
    componentQueries: Readonly<{
      transformed: readonly number[]
      renderable: readonly number[]
      particles: readonly number[]
      rigs: readonly number[]
    }>
    expected: ExpectedMountedEvidence
  }>
  observation: MountedAuthoringObservation | null
  resources: Readonly<{
    observedCount: number
    disposeEventCount: number
  }>
  revision: number
}>
export type MountedAuthoringEvidenceLease = Readonly<{
  generation: number
  sourceDigest: string
  canvasIdentity: string
}>
const listeners = new Set<() => void>()
const observedDisposals = new WeakSet<object>()
const reportedDisposals = new WeakSet<object>()
let generation = 0
let disposeEventCount = 0
function mountedEntityId(object: Object3D, root: Group): number | null {
  let cursor: Object3D | null = object
  while (cursor && cursor !== root) {
    const entityId = cursor.userData.entityId
    if (Number.isSafeInteger(entityId) && entityId >= 0) return entityId
    cursor = cursor.parent
  }
  return null
}
function trackResource(resource: { uuid: string; addEventListener(type: 'dispose', listener: () => void): void }, ids: Set<string>) {
  ids.add(resource.uuid)
  if (observedDisposals.has(resource)) return
  observedDisposals.add(resource)
  resource.addEventListener('dispose', () => {
    if (reportedDisposals.has(resource)) return
    reportedDisposals.add(resource)
    recordMountedAuthoringResourceDisposal()
  })
}
export function collectMountedAuthoringObservation(input: Readonly<{
  root: Group
  canvas: HTMLCanvasElement
  canvasIdentity: string
  behavior: MountedAuthoringObservation['behavior']
  renderer: MountedAuthoringObservation['renderer']
  canonicalTimeline: MountedAuthoringObservation['canonicalTimeline']
}>): MountedAuthoringObservation {
  const entityIds: number[] = []
  const meshes: MountedAuthoringMeshEvidence[] = []
  const particles: MountedAuthoringParticleEvidence[] = []
  const bones: MountedAuthoringBoneEvidence[] = []
  const resourceIds = new Set<string>()
  input.root.traverse(object => {
    if (object.userData.schema === 'agentic-graph-xr-v2-mounted-ecs-entity/v1'
      && Number.isSafeInteger(object.userData.entityId)) entityIds.push(object.userData.entityId as number)
    const entityId = mountedEntityId(object, input.root)
    if (object instanceof Mesh || object instanceof Points) {
      trackResource(object.geometry, resourceIds)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        trackResource(material, resourceIds)
      }
    }
    if (entityId === null) return
    if (object instanceof Mesh && object.name.startsWith('agentic_os_xr_v2_mesh:')) {
      const material = object.material instanceof MeshStandardMaterial ? object.material : null
      const bindingStatus = String(object.userData.xrMaterialBinding || 'pending')
      meshes.push({
        entityId, meshUuid: object.uuid, materialUuid: material?.uuid || 'invalid-material',
        mapUuid: material?.map?.uuid ?? null,
        bindingStatus: ['not-requested', 'pending', 'ready', 'invalid'].includes(bindingStatus)
          ? bindingStatus as MountedAuthoringMeshEvidence['bindingStatus'] : 'invalid',
        visible: object.visible,
      })
    }
    if (object instanceof Points && object.name.startsWith('agentic_os_xr_v2_particles:')) {
      const position = object.geometry.getAttribute('position')
      const attribute = position instanceof BufferAttribute ? position : null
      particles.push({
        entityId, pointsUuid: object.uuid, geometryUuid: object.geometry.uuid,
        capacity: Number(object.userData.capacity), positionCount: attribute?.count ?? 0,
        liveCount: Number(object.userData.liveCount), highWaterCount: Number(object.userData.highWaterCount),
        drawStart: object.geometry.drawRange.start, drawCount: object.geometry.drawRange.count,
        positionAttributeVersion: attribute?.version ?? 0,
      })
    }
    if (object instanceof Bone && object.userData.schema === 'agentic-graph-xr-v2-timeline-bone/v1') {
      bones.push({
        entityId, name: object.name, boneUuid: object.uuid, isBone: true,
        position: object.position.toArray() as [number, number, number],
        quaternion: object.quaternion.toArray() as [number, number, number, number],
        scale: object.scale.toArray() as [number, number, number],
        expectedPosition: Array.isArray(object.userData.expectedPosition)
          ? object.userData.expectedPosition as [number, number, number] : null,
        expectedQuaternion: Array.isArray(object.userData.expectedQuaternion)
          ? object.userData.expectedQuaternion as [number, number, number, number] : null,
        expectedScale: Array.isArray(object.userData.expectedScale)
          ? object.userData.expectedScale as [number, number, number] : null,
        appliedPlayheadSeconds: Number.isFinite(Number(object.userData.appliedPlayheadSeconds)) ? Number(object.userData.appliedPlayheadSeconds) : input.canonicalTimeline.playheadSeconds,
        motionRevision: Number.isSafeInteger(Number(object.userData.motionRevision)) ? Number(object.userData.motionRevision) : input.canonicalTimeline.motionRevision,
      })
    }
  })
  return {
    canvas: {
      identity: input.canvasIdentity, connected: input.canvas.isConnected,
      width: input.canvas.width, height: input.canvas.height,
    },
    entityIds, meshes, particles, bones,
    canonicalTimeline: input.canonicalTimeline,
    behavior: input.behavior,
    renderer: input.renderer,
    observedResourceIds: [...resourceIds],
  }
}
function emptySnapshot(revision = 0, reason: string | null = null): MountedAuthoringEvidenceSnapshot {
  return Object.freeze({
    schema: XR_V2_MOUNTED_AUTHORING_EVIDENCE_SCHEMA,
    status: 'idle',
    reason,
    source: null,
    observation: null,
    resources: Object.freeze({ observedCount: 0, disposeEventCount }),
    revision,
  })
}
let snapshot = emptySnapshot()
function publish(next: Omit<MountedAuthoringEvidenceSnapshot, 'schema' | 'revision'>): MountedAuthoringEvidenceSnapshot {
  snapshot = Object.freeze({
    schema: XR_V2_MOUNTED_AUTHORING_EVIDENCE_SCHEMA,
    ...next,
    revision: snapshot.revision + 1,
  })
  for (const listener of [...listeners]) listener()
  return snapshot
}
function boundedString(value: unknown, label: string, nullable = false, maximum = 256): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded string`)
  }
  return value
}
function safeInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new TypeError(`${label} must be a bounded non-negative integer`)
  }
  return value as number
}
function finiteNumber(value: unknown, label: string, maximum = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > maximum) {
    throw new TypeError(`${label} must be a bounded finite number`)
  }
  return value
}
function uniqueIntegers(values: readonly number[], label: string): readonly number[] {
  if (!Array.isArray(values) || values.length > XR_V2_MOUNTED_EVIDENCE_MAX_ENTITIES) {
    throw new TypeError(`${label} exceeds the entity bound`)
  }
  const normalized = values.map((value, index) => safeInteger(value, `${label}[${index}]`)).sort((a, b) => a - b)
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} must be unique`)
  return Object.freeze(normalized)
}
function vector3(value: Vector3Tuple, label: string): Vector3Tuple {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must be a vec3`)
  return Object.freeze(value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`, 1_000_000))) as Vector3Tuple
}
function quaternion(value: QuaternionTuple, label: string): QuaternionTuple {
  if (!Array.isArray(value) || value.length !== 4) throw new TypeError(`${label} must be a quaternion`)
  return Object.freeze(value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`, 1))) as QuaternionTuple
}
function sameIntegers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
function normalizeObservation(value: MountedAuthoringObservation): MountedAuthoringObservation {
  if (!value || typeof value !== 'object') throw new TypeError('mounted observation is required')
  const meshes = value.meshes.map((mesh, index) => Object.freeze({
    entityId: safeInteger(mesh.entityId, `meshes[${index}].entityId`),
    meshUuid: boundedString(mesh.meshUuid, `meshes[${index}].meshUuid`)!,
    materialUuid: boundedString(mesh.materialUuid, `meshes[${index}].materialUuid`)!,
    mapUuid: boundedString(mesh.mapUuid, `meshes[${index}].mapUuid`, true),
    bindingStatus: mesh.bindingStatus,
    visible: mesh.visible,
  })).sort((left, right) => left.entityId - right.entityId)
  if (meshes.length > XR_V2_MOUNTED_EVIDENCE_MAX_ENTITIES
    || new Set(meshes.map(mesh => mesh.entityId)).size !== meshes.length
    || meshes.some(mesh => typeof mesh.visible !== 'boolean')
    || meshes.some(mesh => !['not-requested', 'pending', 'ready', 'invalid'].includes(mesh.bindingStatus))) {
    throw new TypeError('mounted mesh evidence is invalid')
  }
  const particles = value.particles.map((particle, index) => Object.freeze({
    entityId: safeInteger(particle.entityId, `particles[${index}].entityId`),
    pointsUuid: boundedString(particle.pointsUuid, `particles[${index}].pointsUuid`)!,
    geometryUuid: boundedString(particle.geometryUuid, `particles[${index}].geometryUuid`)!,
    capacity: safeInteger(particle.capacity, `particles[${index}].capacity`, 4_096),
    positionCount: safeInteger(particle.positionCount, `particles[${index}].positionCount`, 4_096),
    liveCount: safeInteger(particle.liveCount, `particles[${index}].liveCount`, 4_096),
    highWaterCount: safeInteger(particle.highWaterCount, `particles[${index}].highWaterCount`, 4_096),
    drawStart: safeInteger(particle.drawStart, `particles[${index}].drawStart`, 4_096),
    drawCount: safeInteger(particle.drawCount, `particles[${index}].drawCount`, 4_096),
    positionAttributeVersion: safeInteger(
      particle.positionAttributeVersion,
      `particles[${index}].positionAttributeVersion`,
    ),
  })).sort((left, right) => left.entityId - right.entityId)
  if (particles.length > XR_V2_MOUNTED_EVIDENCE_MAX_ENTITIES
    || new Set(particles.map(particle => particle.entityId)).size !== particles.length) {
    throw new TypeError('mounted particle evidence is invalid')
  }
  const bones = value.bones.map((bone, index) => Object.freeze({
    entityId: safeInteger(bone.entityId, `bones[${index}].entityId`),
    name: boundedString(bone.name, `bones[${index}].name`)!,
    boneUuid: boundedString(bone.boneUuid, `bones[${index}].boneUuid`)!,
    isBone: bone.isBone,
    position: vector3(bone.position, `bones[${index}].position`),
    quaternion: quaternion(bone.quaternion, `bones[${index}].quaternion`),
    scale: vector3(bone.scale, `bones[${index}].scale`),
    expectedPosition: bone.expectedPosition === null ? null : vector3(bone.expectedPosition, `bones[${index}].expectedPosition`),
    expectedQuaternion: bone.expectedQuaternion === null
      ? null : quaternion(bone.expectedQuaternion, `bones[${index}].expectedQuaternion`),
    expectedScale: bone.expectedScale === null ? null : vector3(bone.expectedScale, `bones[${index}].expectedScale`),
    appliedPlayheadSeconds: finiteNumber(bone.appliedPlayheadSeconds, `bones[${index}].appliedPlayheadSeconds`, 86_400),
    motionRevision: safeInteger(bone.motionRevision, `bones[${index}].motionRevision`),
  })).sort((left, right) => left.entityId - right.entityId || left.name.localeCompare(right.name))
  if (bones.length > XR_V2_MOUNTED_EVIDENCE_MAX_ENTITIES
    || bones.some(bone => bone.isBone !== true)
    || new Set(bones.map(bone => `${bone.entityId}:${bone.name}`)).size !== bones.length) {
    throw new TypeError('mounted bone evidence is invalid')
  }
  if (!Array.isArray(value.observedResourceIds)
    || value.observedResourceIds.length > XR_V2_MOUNTED_EVIDENCE_MAX_RESOURCES) {
    throw new TypeError('mounted resource evidence exceeds the bound')
  }
  const observedResourceIds = value.observedResourceIds
    .map((id, index) => boundedString(id, `observedResourceIds[${index}]`)!)
    .sort()
  if (new Set(observedResourceIds).size !== observedResourceIds.length) {
    throw new TypeError('mounted resource ids must be unique')
  }
  if (!Array.isArray(value.behavior.lastInvokedActionIds)
    || value.behavior.lastInvokedActionIds.length > 128) throw new TypeError('behavior action evidence exceeds the bound')
  if (typeof value.canvas.connected !== 'boolean'
    || !['compileAsync', 'compile', 'unavailable'].includes(value.renderer.compileMethod)
    || !['pending', 'ready', 'failed', 'unavailable'].includes(value.renderer.compileStatus)) {
    throw new TypeError('canvas or renderer evidence is invalid')
  }
  return Object.freeze({
    canvas: Object.freeze({
      identity: boundedString(value.canvas.identity, 'canvas.identity')!,
      connected: value.canvas.connected,
      width: safeInteger(value.canvas.width, 'canvas.width', 32_768),
      height: safeInteger(value.canvas.height, 'canvas.height', 32_768),
    }),
    entityIds: uniqueIntegers(value.entityIds, 'entityIds'),
    meshes: Object.freeze(meshes),
    particles: Object.freeze(particles),
    bones: Object.freeze(bones),
    canonicalTimeline: Object.freeze({
      playheadSeconds: finiteNumber(value.canonicalTimeline.playheadSeconds, 'canonicalTimeline.playheadSeconds', 86_400),
      motionRevision: safeInteger(value.canonicalTimeline.motionRevision, 'canonicalTimeline.motionRevision'),
    }),
    behavior: Object.freeze({
      revision: safeInteger(value.behavior.revision, 'behavior.revision'),
      effectCount: safeInteger(value.behavior.effectCount, 'behavior.effectCount'),
      successfulDispatchCount: safeInteger(value.behavior.successfulDispatchCount, 'behavior.successfulDispatchCount'),
      lastDispatchEffectCount: safeInteger(value.behavior.lastDispatchEffectCount, 'behavior.lastDispatchEffectCount', 128),
      lastEventId: boundedString(value.behavior.lastEventId, 'behavior.lastEventId', true),
      lastTrigger: boundedString(value.behavior.lastTrigger, 'behavior.lastTrigger', true),
      lastStatus: boundedString(value.behavior.lastStatus, 'behavior.lastStatus', true),
      lastInvokedActionIds: Object.freeze(value.behavior.lastInvokedActionIds.map((id, index) => (
        boundedString(id, `behavior.lastInvokedActionIds[${index}]`)!))),
    }),
    renderer: Object.freeze({
      compileMethod: value.renderer.compileMethod,
      compileStatus: value.renderer.compileStatus,
      compileCallCount: safeInteger(value.renderer.compileCallCount, 'renderer.compileCallCount'),
      observedFrameCount: safeInteger(value.renderer.observedFrameCount, 'renderer.observedFrameCount'),
      renderCallCount: safeInteger(value.renderer.renderCallCount, 'renderer.renderCallCount'),
    }),
    observedResourceIds: Object.freeze(observedResourceIds),
  })
}
function deriveStatus(
  source: NonNullable<MountedAuthoringEvidenceSnapshot['source']>,
  observation: MountedAuthoringObservation,
): Readonly<{ status: 'mounting' | 'ready' | 'invalid'; reason: string | null }> {
  const expected = source.expected
  const meshIds = observation.meshes.map(mesh => mesh.entityId)
  const particleIds = observation.particles.map(particle => particle.entityId)
  const observedBones = observation.bones.map(bone => `${bone.entityId}:${bone.name}`)
  const expectedBones = expected.bones.map(bone => `${bone.entityId}:${bone.name}`)
  const hasUnexpected = observation.entityIds.some(id => !expected.entityIds.includes(id))
    || meshIds.some(id => !expected.meshEntityIds.includes(id))
    || particleIds.some(id => !expected.particleEntityIds.includes(id))
    || observedBones.some(id => !expectedBones.includes(id))
  if (hasUnexpected) return { status: 'invalid', reason: 'unexpected-mounted-object' }
  if (observation.meshes.some(mesh => {
    const expectsGraph = expected.materialGraphEntityIds.includes(mesh.entityId)
    return mesh.bindingStatus === 'invalid'
      || (expectsGraph && mesh.bindingStatus === 'not-requested')
  })) return { status: 'invalid', reason: 'material-binding-invalid' }
  if (observation.meshes.some(mesh => expected.mappedMaterialEntityIds.includes(mesh.entityId)
    && mesh.bindingStatus === 'ready' && mesh.mapUuid === null)) {
    return { status: 'invalid', reason: 'material-map-binding-missing' }
  }
  if (observation.particles.some(particle => particle.capacity < 1
    || particle.positionCount !== particle.capacity
    || particle.liveCount > particle.capacity
    || particle.highWaterCount < particle.liveCount
    || particle.highWaterCount > particle.capacity
    || particle.drawStart !== 0
    || particle.drawCount !== particle.liveCount)) {
    return { status: 'invalid', reason: 'gpu-particle-surface-invalid' }
  }
  if (observation.bones.some(bone => bone.motionRevision !== observation.canonicalTimeline.motionRevision
    || Math.abs(bone.appliedPlayheadSeconds - observation.canonicalTimeline.playheadSeconds) > 1e-6)) {
    return { status: 'mounting', reason: 'awaiting-canonical-timeline-pose' }
  }
  if (observation.bones.some(bone => bone.expectedPosition === null
    || bone.expectedQuaternion === null || bone.expectedScale === null)) {
    return { status: 'mounting', reason: 'awaiting-expected-bone-pose' }
  }
  const close = (left: readonly number[], right: readonly number[]) => left.every((value, index) => Math.abs(value - right[index]) <= 1e-5)
  if (observation.bones.some(bone => !close(bone.position, bone.expectedPosition!)
    || (!close(bone.quaternion, bone.expectedQuaternion!)
      && !close(bone.quaternion, bone.expectedQuaternion!.map(value => -value)))
    || !close(bone.scale, bone.expectedScale!))) return { status: 'invalid', reason: 'timeline-bone-pose-invalid' }
  const behavior = observation.behavior
  const uniqueActions = new Set(behavior.lastInvokedActionIds).size === behavior.lastInvokedActionIds.length
  if (behavior.successfulDispatchCount > behavior.revision
    || behavior.lastDispatchEffectCount > behavior.effectCount || !uniqueActions
    || (behavior.successfulDispatchCount > 0 && (behavior.lastStatus !== 'dispatched'
      || behavior.lastEventId === null || behavior.lastTrigger === null
      || behavior.lastInvokedActionIds.length < 1
      || behavior.lastDispatchEffectCount !== behavior.lastInvokedActionIds.length))) {
    return { status: 'invalid', reason: 'behavior-exactly-once-proof-invalid' }
  }
  if (observation.renderer.compileStatus === 'failed' || observation.renderer.compileStatus === 'unavailable'
    || observation.renderer.compileMethod === 'unavailable') {
    return { status: 'invalid', reason: 'renderer-compile-unavailable' }
  }
  const complete = observation.canvas.connected
    && observation.canvas.width > 0
    && observation.canvas.height > 0
    && observation.canvas.identity.length > 0
    && sameIntegers(observation.entityIds, expected.entityIds)
    && sameIntegers(meshIds, expected.meshEntityIds)
    && sameIntegers(particleIds, expected.particleEntityIds)
    && observedBones.length === expectedBones.length
    && observedBones.every((value, index) => value === expectedBones[index])
    && observation.meshes.every(mesh => mesh.bindingStatus === 'ready' || mesh.bindingStatus === 'not-requested')
    && expected.mappedMaterialEntityIds.length > 0
    && expected.mappedMaterialEntityIds.every(id => observation.meshes.some(mesh => mesh.entityId === id && mesh.mapUuid !== null))
    && expected.particleEntityIds.length > 0
    && observation.particles.every(particle => particle.liveCount > 0
      && particle.highWaterCount > 0
      && particle.positionAttributeVersion > 0)
    && expectedBones.length > 0
    && expected.behaviorEffectRequired
    && behavior.successfulDispatchCount > 0
    && observation.renderer.compileStatus === 'ready'
    && observation.renderer.compileCallCount > 0
    && observation.renderer.observedFrameCount > 0
    && observation.renderer.renderCallCount > 0
  return complete ? { status: 'ready', reason: null } : { status: 'mounting', reason: 'awaiting-mounted-observation' }
}
export function beginMountedAuthoringEvidence(
  plan: XrAuthoringRenderPlan,
  canvasIdentity: string,
): MountedAuthoringEvidenceLease {
  if (!plan || plan.entities.length > XR_V2_MOUNTED_EVIDENCE_MAX_ENTITIES) {
    throw new TypeError('mounted authoring plan exceeds the evidence bound')
  }
  boundedString(plan.sourceDigest, 'sourceDigest')
  boundedString(plan.documentKey, 'documentKey', false, 4_096)
  boundedString(canvasIdentity, 'canvasIdentity')
  const entityIds = uniqueIntegers(plan.entities.map(entity => entity.entityId), 'plan.entityIds')
  const meshEntityIds = uniqueIntegers(
    plan.entities.filter(entity => entity.renderable !== null).map(entity => entity.entityId),
    'plan.meshEntityIds',
  )
  const materialGraphEntityIds = uniqueIntegers(plan.entities.filter(entity => (
    entity.renderable?.materialGraphId !== null && entity.renderable?.materialGraphId !== undefined
  )).map(entity => entity.entityId), 'plan.materialGraphEntityIds')
  const mappedMaterialEntityIds = uniqueIntegers(plan.entities.filter(entity => {
    const graphId = entity.renderable?.materialGraphId
    const graph = graphId ? plan.materialGraphs[graphId] : null
    return graph?.nodes.some(node => node.type === 'mesh-standard-output' && node.bindings.map !== undefined)
  }).map(entity => entity.entityId), 'plan.mappedMaterialEntityIds')
  const particleEntityIds = uniqueIntegers(
    plan.entities.filter(entity => entity.particleEmitter !== null).map(entity => entity.entityId),
    'plan.particleEntityIds',
  )
  const entityIdByRef = new Map(plan.entities.map(entity => [entity.entityRef, entity.entityId]))
  const boneKeys = new Map<string, Readonly<{ entityId: number; name: string }>>()
  for (const timeline of plan.timelines) {
    const entityId = entityIdByRef.get(timeline.entityRef)
    if (entityId === undefined) continue
    for (const track of timeline.definition.tracks) {
      if (track.kind !== 'bone-pose') continue
      boundedString(track.targetName, 'bone.targetName')
      boneKeys.set(`${entityId}:${track.targetName}`, Object.freeze({ entityId, name: track.targetName }))
    }
  }
  const bones = [...boneKeys.values()].sort((left, right) => left.entityId - right.entityId || left.name.localeCompare(right.name))
  if (bones.length > XR_V2_MOUNTED_EVIDENCE_MAX_ENTITIES) throw new TypeError('mounted bones exceed the evidence bound')
  generation += 1
  const lease = Object.freeze({ generation, sourceDigest: plan.sourceDigest, canvasIdentity })
  const source = Object.freeze({
    documentKey: plan.documentKey,
    graphDataRevision: safeInteger(plan.graphDataRevision, 'graphDataRevision'),
    sourceDigest: plan.sourceDigest,
    componentQueries: Object.freeze({
      transformed: uniqueIntegers(plan.componentQueries.transformed, 'componentQueries.transformed'),
      renderable: uniqueIntegers(plan.componentQueries.renderable, 'componentQueries.renderable'),
      particles: uniqueIntegers(plan.componentQueries.particles, 'componentQueries.particles'),
      rigs: uniqueIntegers(plan.componentQueries.rigs, 'componentQueries.rigs'),
    }),
    expected: Object.freeze({
      entityIds,
      meshEntityIds,
      materialGraphEntityIds,
      mappedMaterialEntityIds,
      particleEntityIds,
      bones: Object.freeze(bones),
      behaviorEffectRequired: plan.behaviorGraph.behaviors.some(behavior => behavior.actionIds.length > 0),
    }),
  })
  publish({
    status: 'mounting',
    reason: 'awaiting-mounted-observation',
    source,
    observation: null,
    resources: Object.freeze({ observedCount: 0, disposeEventCount }),
  })
  return lease
}
export function publishMountedAuthoringObservation(
  lease: MountedAuthoringEvidenceLease,
  value: MountedAuthoringObservation,
): MountedAuthoringEvidenceSnapshot {
  if (lease.generation !== generation || snapshot.source?.sourceDigest !== lease.sourceDigest
    || snapshot.status === 'idle' || snapshot.status === 'invalid') return snapshot
  let observation: MountedAuthoringObservation
  try {
    observation = normalizeObservation(value)
  } catch (error) {
    return publish({
      ...snapshot,
      status: 'invalid',
      reason: `observation-contract-invalid:${error instanceof Error ? error.message : 'unknown'}`,
      resources: Object.freeze({ observedCount: 0, disposeEventCount }),
    })
  }
  if (observation.canvas.identity !== lease.canvasIdentity) {
    return publish({
      ...snapshot,
      status: 'invalid',
      reason: 'canvas-identity-changed',
      observation,
      resources: Object.freeze({ observedCount: observation.observedResourceIds.length, disposeEventCount }),
    })
  }
  const derived = deriveStatus(snapshot.source!, observation)
  return publish({
    status: derived.status,
    reason: derived.reason,
    source: snapshot.source,
    observation,
    resources: Object.freeze({ observedCount: observation.observedResourceIds.length, disposeEventCount }),
  })
}
export function recordMountedAuthoringResourceDisposal(): MountedAuthoringEvidenceSnapshot {
  disposeEventCount = Math.min(Number.MAX_SAFE_INTEGER, disposeEventCount + 1)
  return publish({
    ...snapshot,
    resources: Object.freeze({
      observedCount: snapshot.resources.observedCount,
      disposeEventCount,
    }),
  })
}
export function resetMountedAuthoringEvidence(
  lease?: MountedAuthoringEvidenceLease,
  reason = 'unmounted',
): MountedAuthoringEvidenceSnapshot {
  if (lease && lease.generation !== generation) return snapshot
  generation += 1
  return publish({
    status: 'idle',
    reason: boundedString(reason, 'reset.reason'),
    source: null,
    observation: null,
    resources: Object.freeze({ observedCount: 0, disposeEventCount }),
  })
}
export function readMountedAuthoringEvidence(): MountedAuthoringEvidenceSnapshot {
  return snapshot
}
export function subscribeMountedAuthoringEvidence(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
