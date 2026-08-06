import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DynamicDrawUsage,
  MeshStandardMaterial,
  NearestFilter,
  PointsMaterial,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  SphereGeometry,
  Mesh,
  Points,
  type Group,
} from 'three'

import {
  acquireXrAuthoringEcsRuntimeOwner,
  readXrAuthoringEcsRuntime,
  reconcileXrAuthoringEcs,
  releaseXrAuthoringEcsRuntime,
  subscribeXrAuthoringEcsRuntime,
} from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import {
  readXrMotionReferenceRuntime,
  setXrMotionReferencePlayhead,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'

import {
  createExactOnceBehaviorDispatcher,
  createKgcBehaviorGraphBrowserStorage,
  publishKgcBehaviorGraphContract,
  type BehaviorTrigger,
} from './behaviorDispatcher'
import { bindMaterialGraphToTargetMesh } from './materialGraphThreeAdapter'
import {
  beginMountedAuthoringEvidence,
  collectMountedAuthoringObservation,
  publishMountedAuthoringObservation,
  resetMountedAuthoringEvidence,
  type MountedAuthoringEvidenceLease,
  type MountedAuthoringObservation,
} from './mountedAuthoringEvidence'
import {
  advanceParticleEmitter,
  createParticleEmitter,
  emitParticleBurst,
  type ParticleEmitterState,
} from './particleEmitter'
import { createXrV2TimelineSequence } from './timelineSequencer'
import { resolveXrV2RendererCompileMethod } from './xrV2RendererCompile'
import type {
  XrAuthoringRenderEntity,
  XrAuthoringRenderPlan,
  XrAuthoringTimelinePlan,
} from './authoringRenderPlan'
import { registerXrV2ImmersiveRenderer } from './xrV2ImmersiveSessionRuntime'

const EMPTY_GRAPH: GraphData = Object.freeze({ type: 'application/json', nodes: [], edges: [] }) as GraphData
const DISPOSED_RESOURCES = new WeakSet<object>()
const CANVAS_IDENTITIES = new WeakMap<HTMLCanvasElement, string>()
let nextCanvasIdentity = 1

function ensureMountedAuthoringCanvasIdentity(canvas: HTMLCanvasElement): string {
  const identity = CANVAS_IDENTITIES.get(canvas) || canvas.dataset.kgXrV2CanvasId || `kg-xr-v2-canvas-${nextCanvasIdentity++}`
  CANVAS_IDENTITIES.set(canvas, identity)
  canvas.dataset.kgXrV2CanvasId = identity
  return identity
}

function disposeResourceOnce(resource: { dispose(): void }): void {
  if (DISPOSED_RESOURCES.has(resource)) return
  DISPOSED_RESOURCES.add(resource)
  resource.dispose()
}
const BUILTIN_CHECKER_TEXTURE = (() => {
  const texture = new DataTexture(new Uint8Array([
    255, 255, 255, 255, 36, 64, 96, 255,
    36, 64, 96, 255, 255, 255, 255, 255,
  ]), 2, 2, RGBAFormat)
  texture.name = 'knowgrph-xr-builtin-checker-v1'
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
})()

function resolveBuiltinTexture(assetId: string): DataTexture | null {
  return assetId === 'builtin:checker-v1' ? BUILTIN_CHECKER_TEXTURE : null
}

function XrV2ParticleSurface({
  entity,
  paused,
  registerBurst,
}: Readonly<{
  entity: XrAuthoringRenderEntity
  paused: boolean
  registerBurst: (entityId: number, burst: ((count: number) => void) | null) => void
}>) {
  const config = entity.particleEmitter!
  const stateRef = React.useRef<ParticleEmitterState>(createParticleEmitter(config))
  const pointsRef = React.useRef<Points | null>(null)
  const highWaterRef = React.useRef(0)
  const geometry = React.useMemo(() => {
    const next = new BufferGeometry()
    const attribute = new BufferAttribute(new Float32Array(config.ceiling * 3), 3)
    attribute.setUsage(DynamicDrawUsage)
    attribute.needsUpdate = true
    next.setAttribute('position', attribute)
    next.setDrawRange(0, 0)
    return next
  }, [config.ceiling])
  const material = React.useMemo(() => new PointsMaterial({
    color: config.color,
    opacity: 0.9,
    size: config.size,
    sizeAttenuation: true,
    transparent: true,
  }), [config.color, config.size])
  React.useEffect(() => () => {
    disposeResourceOnce(geometry)
    disposeResourceOnce(material)
  }, [geometry, material])

  const writeGeometry = React.useCallback((state: ParticleEmitterState) => {
    const attribute = geometry.getAttribute('position') as BufferAttribute
    const array = attribute.array as Float32Array
    for (let index = 0; index < state.particles.length; index += 1) {
      const particle = state.particles[index]
      const progress = particle.ageSeconds / particle.lifetimeSeconds
      const angle = particle.id * 2.399963229728653
      const radius = 0.08 + progress * 0.42
      array[index * 3] = Math.cos(angle) * radius
      array[index * 3 + 1] = progress * 0.85
      array[index * 3 + 2] = Math.sin(angle) * radius
    }
    geometry.setDrawRange(0, state.particles.length)
    attribute.needsUpdate = true
    highWaterRef.current = Math.max(highWaterRef.current, state.particles.length)
    if (pointsRef.current) {
      pointsRef.current.userData.liveCount = state.particles.length
      pointsRef.current.userData.highWaterCount = highWaterRef.current
      pointsRef.current.userData.totalEmitted = state.totalEmitted
      pointsRef.current.userData.totalDropped = state.totalDropped
    }
  }, [geometry])

  React.useLayoutEffect(() => {
    stateRef.current = createParticleEmitter(config)
    highWaterRef.current = 0
    writeGeometry(stateRef.current)
    registerBurst(entity.entityId, count => {
      stateRef.current = emitParticleBurst(stateRef.current, count).state
      writeGeometry(stateRef.current)
    })
    return () => registerBurst(entity.entityId, null)
  }, [config, entity.entityId, registerBurst, writeGeometry])

  useFrame((_frame, deltaSeconds) => {
    if (paused) return
    stateRef.current = advanceParticleEmitter(stateRef.current, Math.min(deltaSeconds, 0.25)).state
    writeGeometry(stateRef.current)
  })

  return (
    <points
      ref={pointsRef}
      name={`kg_xr_v2_particles:${entity.entityRef}`}
      geometry={geometry}
      material={material}
      dispose={null}
      userData={{
        schema: 'knowgrph-xr-v2-gpu-particle-surface/v1',
        entityId: entity.entityId,
        entityRef: entity.entityRef,
        capacity: config.ceiling,
        liveCount: 0,
        highWaterCount: 0,
        totalEmitted: 0,
        totalDropped: 0,
      }}
    />
  )
}

function XrV2TimelineBinding({
  entityId,
  rootRef,
  timelines,
}: Readonly<{
  entityId: number
  rootRef: React.RefObject<Group | null>
  timelines: readonly XrAuthoringTimelinePlan[]
}>) {
  const motion = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const sequences = React.useMemo(() => timelines.map(timeline => Object.freeze({
    id: timeline.id,
    tracks: timeline.definition.tracks,
    sequence: createXrV2TimelineSequence(timeline.definition),
  })), [timelines])
  const boneNames = React.useMemo(() => {
    const names = new Set<string>()
    for (const timeline of timelines) {
      for (const track of timeline.definition.tracks) if (track.kind === 'bone-pose') names.add(track.targetName)
    }
    return [...names].sort()
  }, [timelines])
  const boneRefs = React.useRef(new Map<string, Bone>())

  React.useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const expectedByName = new Map<string, Readonly<{
      translation: readonly [number, number, number]
      rotation: readonly [number, number, number, number]
      scale: readonly [number, number, number]
    }>>()
    for (const entry of sequences) {
      entry.sequence.apply(root, motion.playheadSeconds)
      const samples = new Map(entry.sequence.sample(motion.playheadSeconds).map(sample => [sample.trackId, sample.value]))
      for (const track of entry.tracks) if (track.kind === 'bone-pose') {
        expectedByName.set(track.targetName, samples.get(track.id) as NonNullable<ReturnType<typeof expectedByName.get>>)
      }
    }
    for (const [name, bone] of boneRefs.current) {
      const expected = expectedByName.get(name)
      bone.userData.appliedPlayheadSeconds = motion.playheadSeconds
      bone.userData.motionRevision = motion.revision
      bone.userData.expectedPosition = expected?.translation ?? null
      bone.userData.expectedQuaternion = expected?.rotation ?? null
      bone.userData.expectedScale = expected?.scale ?? null
    }
  }, [motion.playheadSeconds, motion.revision, rootRef, sequences])
  return (
    <>
      {boneNames.map(name => (
        <bone
          key={name}
          ref={bone => { if (bone) boneRefs.current.set(name, bone); else boneRefs.current.delete(name) }}
          name={name}
          userData={{ schema: 'knowgrph-xr-v2-timeline-bone/v1', entityId }}
        >
          <mesh name={`kg_xr_v2_bone_visual:${name}`} position={[0, 0.28, 0]}>
            <boxGeometry args={[0.12, 0.56, 0.12]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.55} metalness={0.1} />
          </mesh>
        </bone>
      ))}
    </>
  )
}

function XrV2EntitySurface({
  entity,
  materialGraph,
  timelines,
  paused,
  visibleOverride,
  dispatchTrigger,
  registerBurst,
}: Readonly<{
  entity: XrAuthoringRenderEntity
  materialGraph: XrAuthoringRenderPlan['materialGraphs'][string] | null
  timelines: readonly XrAuthoringTimelinePlan[]
  paused: boolean
  visibleOverride: boolean | undefined
  dispatchTrigger: (entityId: number, trigger: BehaviorTrigger) => void
  registerBurst: (entityId: number, burst: ((count: number) => void) | null) => void
}>) {
  const rootRef = React.useRef<Group | null>(null)
  const meshRef = React.useRef<Mesh | null>(null)
  const material = React.useMemo(() => new MeshStandardMaterial({
    color: '#60a5fa', roughness: 0.65, metalness: 0.05,
  }), [])
  const geometry = React.useMemo(() => {
    if (entity.renderable?.geometry === 'sphere') return new SphereGeometry(0.5, 32, 20)
    if (entity.renderable?.geometry === 'plane') return new PlaneGeometry(1, 1, 1, 1)
    return new BoxGeometry(0.8, 0.8, 0.8)
  }, [entity.renderable?.geometry])
  const [materialReady, setMaterialReady] = React.useState(materialGraph === null)
  const visible = visibleOverride ?? entity.renderable?.visible ?? true

  React.useEffect(() => () => {
    disposeResourceOnce(geometry)
    disposeResourceOnce(material)
  }, [geometry, material])

  React.useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.quaternion.fromArray([...entity.transform.quaternion])
    root.updateMatrix()
  }, [entity.transform.quaternion])

  React.useLayoutEffect(() => {
    if (!meshRef.current || !materialGraph) {
      if (meshRef.current) meshRef.current.userData.xrMaterialBinding = 'not-requested'
      setMaterialReady(materialGraph === null)
      return
    }
    setMaterialReady(false)
    meshRef.current.userData.xrMaterialBinding = 'pending'
    const result = bindMaterialGraphToTargetMesh({ mesh: meshRef.current, resolveTexture: resolveBuiltinTexture })
    if (result.status !== 'ready') {
      meshRef.current.userData.xrMaterialBinding = 'invalid'
      return
    }
    const applied = result.binding.apply(materialGraph)
    meshRef.current.userData.xrMaterialBinding = applied.status
    setMaterialReady(applied.status === 'ready')
    return () => { result.binding.dispose() }
  }, [materialGraph])

  return (
    <group
      ref={rootRef}
      name={`kg_xr_v2_entity:${entity.entityRef}`}
      position={entity.transform.position}
      scale={entity.transform.scale}
      userData={{
        schema: 'knowgrph-xr-v2-mounted-ecs-entity/v1',
        entityId: entity.entityId,
        entityRef: entity.entityRef,
        componentNames: entity.componentNames,
      }}
    >
      {entity.renderable ? (
        <mesh
          ref={meshRef}
          name={`kg_xr_v2_mesh:${entity.entityRef}`}
          visible={visible && materialReady}
          geometry={geometry}
          material={material}
          dispose={null}
          castShadow
          receiveShadow
          onClick={event => { event.stopPropagation(); dispatchTrigger(entity.entityId, 'select') }}
          onPointerEnter={() => dispatchTrigger(entity.entityId, 'hover-enter')}
          onPointerLeave={() => dispatchTrigger(entity.entityId, 'hover-exit')}
        >
        </mesh>
      ) : null}
      {entity.particleEmitter ? (
        <XrV2ParticleSurface entity={entity} paused={paused} registerBurst={registerBurst} />
      ) : null}
      {timelines.length > 0 ? (
        <XrV2TimelineBinding entityId={entity.entityId} rootRef={rootRef} timelines={timelines} />
      ) : null}
    </group>
  )
}

function XrV2MountedPlan({ plan, paused }: Readonly<{ plan: XrAuthoringRenderPlan; paused: boolean }>) {
  const rootRef = React.useRef<Group | null>(null)
  const particleBurstsRef = React.useRef(new Map<number, (count: number) => void>())
  const behaviorRevisionRef = React.useRef(0)
  const behaviorEffectCountRef = React.useRef(0)
  const planDigestRef = React.useRef('')
  const evidenceLeaseRef = React.useRef<MountedAuthoringEvidenceLease | null>(null)
  const observationIntervalRef = React.useRef(0)
  const rendererRef = React.useRef<MountedAuthoringObservation['renderer']>({
    compileMethod: 'unavailable', compileStatus: 'unavailable', compileCallCount: 0,
    observedFrameCount: 0, renderCallCount: 0,
  })
  const behaviorRef = React.useRef<MountedAuthoringObservation['behavior']>({
    revision: 0, effectCount: 0, successfulDispatchCount: 0, lastDispatchEffectCount: 0,
    lastEventId: null, lastTrigger: null, lastStatus: null, lastInvokedActionIds: [],
  })
  const { camera, gl, scene } = useThree()
  const [visibleByEntityId, setVisibleByEntityId] = React.useState<Readonly<Record<number, boolean>>>({})
  const [materialGraphByEntityId, setMaterialGraphByEntityId] = React.useState<Readonly<Record<number, string>>>({})
  const [persistedBehaviorDigest, setPersistedBehaviorDigest] = React.useState<string | null>(null)
  React.useLayoutEffect(() => registerXrV2ImmersiveRenderer(gl), [gl])
  React.useEffect(() => {
    let cancelled = false
    setPersistedBehaviorDigest(null)
    void publishKgcBehaviorGraphContract(
      plan.behaviorContract,
      createKgcBehaviorGraphBrowserStorage(),
    ).then(() => {
      if (!cancelled) setPersistedBehaviorDigest(plan.sourceDigest)
    }).catch(() => {
      if (!cancelled) resetMountedAuthoringEvidence(undefined, 'behavior-contract-storage-failed')
    })
    return () => { cancelled = true }
  }, [plan.behaviorContract, plan.sourceDigest])
  if (planDigestRef.current !== plan.sourceDigest) {
    planDigestRef.current = plan.sourceDigest
    behaviorRevisionRef.current = 0
  }
  const registerBurst = React.useCallback((entityId: number, burst: ((count: number) => void) | null) => {
    if (burst) particleBurstsRef.current.set(entityId, burst)
    else particleBurstsRef.current.delete(entityId)
  }, [])
  const dispatcher = React.useMemo(() => createExactOnceBehaviorDispatcher(plan.behaviorGraph, ({ action }) => {
    let applied = false
    if (action.kind === 'set-visible') {
      const visible = action.parameters?.visible !== false
      setVisibleByEntityId(current => ({ ...current, [action.targetEntityId]: visible }))
      applied = true
    }
    if (action.kind === 'apply-material') {
      const graphId = String(action.parameters?.materialGraphId || '')
      if (plan.materialGraphs[graphId]) {
        setMaterialGraphByEntityId(current => ({ ...current, [action.targetEntityId]: graphId }))
        applied = true
      }
    }
    if (action.kind === 'emit-particle-burst') {
      const requested = Number(action.parameters?.count ?? 1)
      const count = Number.isSafeInteger(requested) ? Math.max(0, Math.min(4_096, requested)) : 0
      const burst = particleBurstsRef.current.get(action.targetEntityId)
      if (burst) {
        burst(count)
        applied = true
      }
    }
    if (action.kind === 'play-timeline') {
      setXrMotionReferencePlayhead(Number(action.parameters?.timeSeconds ?? 0))
      const store = useGraphStore.getState()
      store.setTimelineTransportState({
        documentKey: store.timelineTransportDocumentKey || store.markdownDocumentName || plan.documentKey,
        playing: true,
      })
      applied = true
    }
    if (applied) behaviorEffectCountRef.current += 1
  }), [plan])
  const dispatchTrigger = React.useCallback((entityId: number, trigger: BehaviorTrigger) => {
    const revision = behaviorRevisionRef.current + 1
    const eventId = `event-${entityId}-${revision}`
    const effectsBefore = behaviorEffectCountRef.current
    const result = dispatcher.dispatch({ id: eventId, revision, trigger, sourceEntityId: entityId })
    const dispatchEffectCount = behaviorEffectCountRef.current - effectsBefore
    behaviorRevisionRef.current = result.revision
    const exactSuccess = result.status === 'dispatched' && result.invokedActionIds.length > 0
      && new Set(result.invokedActionIds).size === result.invokedActionIds.length
      && dispatchEffectCount === result.invokedActionIds.length
    behaviorRef.current = exactSuccess ? {
      revision: result.revision,
      effectCount: behaviorEffectCountRef.current,
      successfulDispatchCount: behaviorRef.current.successfulDispatchCount + 1,
      lastDispatchEffectCount: dispatchEffectCount,
      lastEventId: eventId,
      lastTrigger: trigger,
      lastStatus: result.status,
      lastInvokedActionIds: result.invokedActionIds,
    } : { ...behaviorRef.current, revision: result.revision, effectCount: behaviorEffectCountRef.current }
  }, [dispatcher])

  const publishEvidence = React.useCallback((lease: MountedAuthoringEvidenceLease) => {
    const root = rootRef.current
    if (!root) return
    const motion = readXrMotionReferenceRuntime()
    publishMountedAuthoringObservation(lease, collectMountedAuthoringObservation({
      root,
      canvas: gl.domElement,
      canvasIdentity: ensureMountedAuthoringCanvasIdentity(gl.domElement),
      behavior: behaviorRef.current,
      renderer: rendererRef.current,
      canonicalTimeline: { playheadSeconds: motion.playheadSeconds, motionRevision: motion.revision },
    }))
  }, [gl.domElement])

  React.useLayoutEffect(() => {
    if (persistedBehaviorDigest !== plan.sourceDigest) {
      resetMountedAuthoringEvidence(undefined, 'behavior-contract-storage-pending')
      return undefined
    }
    const canvasIdentity = ensureMountedAuthoringCanvasIdentity(gl.domElement)
    const compileMethod = resolveXrV2RendererCompileMethod({
      ci: import.meta.env.CI ? 'true' : '',
      hasCompileAsync: typeof gl.compileAsync === 'function',
      hasCompile: typeof gl.compile === 'function',
    })
    rendererRef.current = {
      compileMethod,
      compileStatus: compileMethod === 'unavailable' ? 'unavailable' : 'pending',
      compileCallCount: compileMethod === 'unavailable' ? 0 : 1,
      observedFrameCount: 0,
      renderCallCount: 0,
    }
    let lease: MountedAuthoringEvidenceLease
    try {
      lease = beginMountedAuthoringEvidence(plan, canvasIdentity)
    } catch {
      resetMountedAuthoringEvidence(undefined, 'evidence-contract-rejected')
      return
    }
    evidenceLeaseRef.current = lease
    let cancelled = false
    publishEvidence(lease)
    const finishCompile = (status: 'ready' | 'failed') => {
      if (cancelled || evidenceLeaseRef.current !== lease) return
      rendererRef.current = { ...rendererRef.current, compileStatus: status }
      publishEvidence(lease)
    }
    try {
      if (compileMethod === 'compileAsync') {
        void gl.compileAsync(scene, camera).then(() => finishCompile('ready'), () => finishCompile('failed'))
      } else if (compileMethod === 'compile') {
        gl.compile(scene, camera)
        finishCompile('ready')
      }
    } catch {
      finishCompile('failed')
    }
    return () => {
      cancelled = true
      if (evidenceLeaseRef.current === lease) evidenceLeaseRef.current = null
      resetMountedAuthoringEvidence(lease, 'plan-unmounted')
    }
  }, [camera, gl, persistedBehaviorDigest, plan, publishEvidence, scene])

  useFrame((_state, deltaSeconds) => {
    const lease = evidenceLeaseRef.current
    if (!lease) return
    rendererRef.current = {
      ...rendererRef.current,
      observedFrameCount: Math.min(Number.MAX_SAFE_INTEGER, rendererRef.current.observedFrameCount + 1),
      renderCallCount: Math.min(Number.MAX_SAFE_INTEGER, rendererRef.current.renderCallCount + gl.info.render.calls),
    }
    observationIntervalRef.current += deltaSeconds
    if (rendererRef.current.observedFrameCount > 1 && observationIntervalRef.current < 0.1) return
    observationIntervalRef.current = 0
    publishEvidence(lease)
  })

  return (
    <group
      ref={rootRef}
      name="kg_xr_v2_authoring_scene"
      userData={{ schema: plan.schema, sourceDigest: plan.sourceDigest, graphDataRevision: plan.graphDataRevision }}
    >
      {plan.entities.map(entity => {
        const overrideGraphId = materialGraphByEntityId[entity.entityId]
        const graphId = overrideGraphId || entity.renderable?.materialGraphId || ''
        return (
          <XrV2EntitySurface
            key={`${plan.sourceDigest}:${entity.entityRef}`}
            entity={entity}
            materialGraph={graphId ? plan.materialGraphs[graphId] ?? null : null}
            timelines={plan.timelines.filter(timeline => timeline.entityRef === entity.entityRef)}
            paused={paused}
            visibleOverride={visibleByEntityId[entity.entityId]}
            dispatchTrigger={dispatchTrigger}
            registerBurst={registerBurst}
          />
        )
      })}
    </group>
  )
}

export function XrV2MountedAuthoringScene({ paused = false }: Readonly<{ paused?: boolean }>) {
  const graphData = useGraphStore(state => state.graphData)
  const graphDataRevision = useGraphStore(state => state.graphDataRevision)
  const documentName = useGraphStore(state => state.markdownDocumentName)
  const documentSourceUrl = useGraphStore(state => state.markdownDocumentSourceUrl)
  const runtime = React.useSyncExternalStore(
    subscribeXrAuthoringEcsRuntime,
    readXrAuthoringEcsRuntime,
    readXrAuthoringEcsRuntime,
  )

  React.useLayoutEffect(() => {
    const owner = acquireXrAuthoringEcsRuntimeOwner()
    return () => releaseXrAuthoringEcsRuntime(owner)
  }, [])
  React.useLayoutEffect(() => {
    reconcileXrAuthoringEcs({
      documentName,
      documentSourceUrl,
      graphData: graphData ?? EMPTY_GRAPH,
      graphDataRevision,
    })
  }, [documentName, documentSourceUrl, graphData, graphDataRevision])

  const expectedDocumentKey = `${String(documentName || 'untitled').trim() || 'untitled'}::${String(documentSourceUrl || 'local').trim() || 'local'}`
  return runtime.status === 'ready' && runtime.plan
    && runtime.documentKey === expectedDocumentKey
    && runtime.graphDataRevision === graphDataRevision
    ? <XrV2MountedPlan key={`${runtime.sourceDigest}:${runtime.revision}`} plan={runtime.plan} paused={paused} />
    : null
}
