import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  Bone, BoxGeometry, BufferAttribute, BufferGeometry, DataTexture, Group,
  Mesh, MeshStandardMaterial, Points, PointsMaterial,
} from 'three'

import { BEHAVIOR_DISPATCH_GRAPH_SCHEMA } from '../behaviorDispatcher'
import { MATERIAL_GRAPH_SCHEMA } from '../materialGraph'
import {
  beginMountedAuthoringEvidence,
  collectMountedAuthoringObservation,
  publishMountedAuthoringObservation,
  readMountedAuthoringEvidence,
  recordMountedAuthoringResourceDisposal,
  resetMountedAuthoringEvidence,
  subscribeMountedAuthoringEvidence,
  type MountedAuthoringObservation,
} from '../mountedAuthoringEvidence'
import { XR_AUTHORING_RENDER_PLAN_SCHEMA, type XrAuthoringRenderPlan } from '../authoringRenderPlan'
import { XR_V2_TIMELINE_SEQUENCE_SCHEMA } from '../timelineSequencer'

function plan(sourceDigest = 'fnv1a32:1234abcd'): XrAuthoringRenderPlan {
  return {
    schema: XR_AUTHORING_RENDER_PLAN_SCHEMA,
    documentKey: 'fixture.md::https://example.test/fixture.md',
    graphDataRevision: 3,
    sourceDigest,
    componentQueries: { transformed: [0], renderable: [0], particles: [0], rigs: [0] },
    entities: [{
      entityId: 0,
      entityRef: 'scene.hero',
      componentNames: ['XrTransform', 'XrRenderable', 'XrParticleEmitter', 'XrRig'],
      transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      renderable: { geometry: 'box', visible: true, materialGraphId: 'material.hero' },
      particleEmitter: { ratePerSecond: 10, lifetimeSeconds: 1, ceiling: 64, size: 0.05, color: 0x66ccff },
      timelineIds: ['timeline.hero'],
    }],
    materialGraphs: {
      'material.hero': {
        schema: MATERIAL_GRAPH_SCHEMA,
        nodes: [
          { id: 'color', type: 'color', value: '#336699' },
          { id: 'map', type: 'texture-2d', assetId: 'builtin:checker-v1' },
          { id: 'output', type: 'mesh-standard-output', bindings: { color: 'color', map: 'map' } },
        ],
      },
    },
    behaviorGraph: {
      schema: BEHAVIOR_DISPATCH_GRAPH_SCHEMA,
      actions: [{ id: 'hero-burst', kind: 'emit-particle-burst', targetEntityId: 0, parameters: { count: 8 } }],
      behaviors: [{ id: 'hero-select', trigger: 'select', sourceEntityId: 0, actionIds: ['hero-burst'] }],
    },
    behaviorContract: {
      graph_id: 'fixture-behavior',
      nodes: [
        { id: 'hero-select', type: 'trigger', config: { trigger: 'select', source_entity: '0' } },
        { id: 'hero-burst', type: 'action', config: { action: 'emit-particle-burst', target_entity: '0' } },
      ],
      edges: [{ from: 'hero-select', to: 'hero-burst' }],
      bound_entity: '0',
    },
    timelines: [{
      id: 'timeline.hero',
      entityRef: 'scene.hero',
      definition: {
        schema: XR_V2_TIMELINE_SEQUENCE_SCHEMA,
        durationSeconds: 2,
        loop: false,
        tracks: [{
          id: 'arm-pose', kind: 'bone-pose', targetName: 'Arm',
          keyframes: [
            { timeSeconds: 0, value: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
            { timeSeconds: 2, value: { translation: [0, 1, 0], rotation: [0, 1, 0, 0], scale: [1, 1, 1] } },
          ],
        }],
      },
    }],
  }
}

function readyObservation(overrides: Partial<MountedAuthoringObservation> = {}): MountedAuthoringObservation {
  return {
    canvas: { identity: 'canvas-fixture', connected: true, width: 800, height: 600 },
    entityIds: [0],
    meshes: [{
      entityId: 0, meshUuid: 'mesh-uuid', materialUuid: 'material-uuid', mapUuid: 'map-uuid',
      bindingStatus: 'ready', visible: true,
    }],
    particles: [{
      entityId: 0, pointsUuid: 'points-uuid', geometryUuid: 'particle-geometry-uuid',
      capacity: 64, positionCount: 64, liveCount: 8, highWaterCount: 12,
      drawStart: 0, drawCount: 8, positionAttributeVersion: 4,
    }],
    bones: [{
      entityId: 0, name: 'Arm', boneUuid: 'bone-uuid', isBone: true,
      position: [0, 0.5, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1],
      expectedPosition: [0, 0.5, 0], expectedQuaternion: [0, 0, 0, 1], expectedScale: [1, 1, 1],
      appliedPlayheadSeconds: 1, motionRevision: 7,
    }],
    canonicalTimeline: { playheadSeconds: 1, motionRevision: 7 },
    behavior: {
      revision: 2, effectCount: 1, successfulDispatchCount: 1, lastDispatchEffectCount: 1,
      lastEventId: 'event-0-2', lastTrigger: 'select', lastStatus: 'dispatched',
      lastInvokedActionIds: ['hero-burst'],
    },
    renderer: {
      compileMethod: 'compileAsync', compileStatus: 'ready', compileCallCount: 1,
      observedFrameCount: 2, renderCallCount: 1,
    },
    observedResourceIds: ['mesh-geometry-uuid', 'material-uuid', 'particle-geometry-uuid'],
    ...overrides,
  }
}

test('collector reads actual Three mesh, mapped material, GPU Points, Bone pose, and disposal events', () => {
  resetMountedAuthoringEvidence(undefined, 'collector-start')
  const canvas = {
    dataset: { kgXrV2CanvasId: 'canvas-fixture' }, isConnected: true, width: 800, height: 600,
  } as unknown as HTMLCanvasElement
  const canvasIdentity = canvas.dataset.kgXrV2CanvasId!

  const root = new Group()
  const entity = new Group()
  entity.userData = { schema: 'agentic-graph-xr-v2-mounted-ecs-entity/v1', entityId: 0 }
  root.add(entity)
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  const material = new MeshStandardMaterial({ map: texture })
  const mesh = new Mesh(new BoxGeometry(), material)
  mesh.name = 'agentic_os_xr_v2_mesh:scene.hero'
  mesh.userData.xrMaterialBinding = 'ready'
  entity.add(mesh)
  const particleGeometry = new BufferGeometry()
  const position = new BufferAttribute(new Float32Array(64 * 3), 3)
  position.needsUpdate = true
  particleGeometry.setAttribute('position', position)
  particleGeometry.setDrawRange(0, 8)
  const particleMaterial = new PointsMaterial()
  const points = new Points(particleGeometry, particleMaterial)
  points.name = 'agentic_os_xr_v2_particles:scene.hero'
  points.userData = { capacity: 64, liveCount: 8, highWaterCount: 12 }
  entity.add(points)
  const bone = new Bone()
  bone.name = 'Arm'
  bone.position.set(0, 0.5, 0)
  bone.userData = {
    schema: 'agentic-graph-xr-v2-timeline-bone/v1', entityId: 0,
    appliedPlayheadSeconds: 1, motionRevision: 7,
    expectedPosition: [0, 0.5, 0], expectedQuaternion: [0, 0, 0, 1], expectedScale: [1, 1, 1],
  }
  entity.add(bone)

  const observation = collectMountedAuthoringObservation({
    root, canvas, canvasIdentity,
    canonicalTimeline: { playheadSeconds: 1, motionRevision: 7 },
    behavior: {
      revision: 2, effectCount: 1, successfulDispatchCount: 1, lastDispatchEffectCount: 1,
      lastEventId: 'event-0-2', lastTrigger: 'select', lastStatus: 'dispatched',
      lastInvokedActionIds: ['hero-burst'],
    },
    renderer: {
      compileMethod: 'compileAsync', compileStatus: 'ready', compileCallCount: 1,
      observedFrameCount: 2, renderCallCount: 1,
    },
  })
  assert.equal(observation.meshes[0].meshUuid, mesh.uuid)
  assert.equal(observation.meshes[0].mapUuid, texture.uuid)
  assert.deepEqual(observation.particles[0], {
    entityId: 0, pointsUuid: points.uuid, geometryUuid: particleGeometry.uuid,
    capacity: 64, positionCount: 64, liveCount: 8, highWaterCount: 12,
    drawStart: 0, drawCount: 8, positionAttributeVersion: position.version,
  })
  assert.equal(observation.bones[0].boneUuid, bone.uuid)
  assert.deepEqual(observation.bones[0].position, [0, 0.5, 0])
  const beforeDispose = readMountedAuthoringEvidence().resources.disposeEventCount
  mesh.geometry.dispose()
  assert.equal(readMountedAuthoringEvidence().resources.disposeEventCount, beforeDispose + 1)
  material.dispose()
  particleGeometry.dispose()
  particleMaterial.dispose()
  texture.dispose()
})

test('mounted timeline uses reconciler-owned intrinsic bones instead of undisposed primitives', () => {
  const source = readFileSync(new URL('../XrV2MountedAuthoringScene.tsx', import.meta.url), 'utf8')
  assert.match(source, /<bone/)
  assert.doesNotMatch(source, /<primitive/)
  assert.match(source, /CANVAS_IDENTITIES\.get\(canvas\)/)
})

test('mounted evidence becomes ready only from a complete immutable renderer observation', () => {
  resetMountedAuthoringEvidence(undefined, 'test-start')
  let notifications = 0
  const unsubscribe = subscribeMountedAuthoringEvidence(() => { notifications += 1 })
  const lease = beginMountedAuthoringEvidence(plan(), 'canvas-fixture')
  assert.equal(readMountedAuthoringEvidence().status, 'mounting')
  assert.deepEqual(readMountedAuthoringEvidence().source?.expected, {
    entityIds: [0], meshEntityIds: [0], materialGraphEntityIds: [0], mappedMaterialEntityIds: [0],
    particleEntityIds: [0],
    bones: [{ entityId: 0, name: 'Arm' }],
    behaviorEffectRequired: true,
  })

  const actions = ['hero-burst']
  const observation = readyObservation({
    behavior: {
      revision: 2, effectCount: 1, successfulDispatchCount: 1, lastDispatchEffectCount: 1,
      lastEventId: 'event-0-2', lastTrigger: 'select', lastStatus: 'dispatched',
      lastInvokedActionIds: actions,
    },
  })
  const ready = publishMountedAuthoringObservation(lease, observation)
  actions.push('caller-mutation')
  assert.equal(ready.status, 'ready')
  assert.equal(ready.reason, null)
  assert.deepEqual(ready.observation?.behavior.lastInvokedActionIds, ['hero-burst'])
  assert.equal(Object.isFrozen(ready), true)
  assert.equal(Object.isFrozen(ready.source?.expected.bones), true)
  assert.equal(Object.isFrozen(ready.observation?.particles[0]), true)

  const disposalBefore = ready.resources.disposeEventCount
  const disposed = recordMountedAuthoringResourceDisposal()
  assert.equal(disposed.resources.disposeEventCount, disposalBefore + 1)
  const idle = resetMountedAuthoringEvidence(lease, 'test-unmount')
  assert.equal(idle.status, 'idle')
  assert.equal(idle.source, null)
  assert.equal(idle.observation, null)
  assert.equal(idle.resources.observedCount, 0)
  const stale = publishMountedAuthoringObservation(lease, readyObservation())
  assert.equal(stale, idle)
  assert.ok(notifications >= 4)
  unsubscribe()
})

test('invalid particle or canvas evidence latches closed until a replacement plan begins', () => {
  resetMountedAuthoringEvidence(undefined, 'test-start')
  const lease = beginMountedAuthoringEvidence(plan('fnv1a32:bad00001'), 'canvas-fixture')
  const invalid = publishMountedAuthoringObservation(lease, readyObservation({
    particles: [{
      ...readyObservation().particles[0],
      liveCount: 8,
      highWaterCount: 65,
    }],
  }))
  assert.equal(invalid.status, 'invalid')
  assert.equal(invalid.reason, 'gpu-particle-surface-invalid')
  assert.equal(publishMountedAuthoringObservation(lease, readyObservation()), invalid)

  const replacement = beginMountedAuthoringEvidence(plan('fnv1a32:good0002'), 'canvas-replacement')
  assert.equal(readMountedAuthoringEvidence().status, 'mounting')
  const changedCanvas = publishMountedAuthoringObservation(replacement, readyObservation())
  assert.equal(changedCanvas.status, 'invalid')
  assert.equal(changedCanvas.reason, 'canvas-identity-changed')
  resetMountedAuthoringEvidence(replacement, 'test-end')
})

test('ready stays closed without map, render, active particles, expected pose, or exact behavior effect', () => {
  const cases: Array<Readonly<{
    name: string
    observation: MountedAuthoringObservation
    status: 'mounting' | 'invalid'
    reason?: string
  }>> = [
    {
      name: 'map', status: 'invalid', reason: 'material-map-binding-missing',
      observation: readyObservation({ meshes: [{ ...readyObservation().meshes[0], mapUuid: null }] }),
    },
    {
      name: 'frame', status: 'mounting',
      observation: readyObservation({ renderer: { ...readyObservation().renderer, observedFrameCount: 0 } }),
    },
    {
      name: 'render', status: 'mounting',
      observation: readyObservation({ renderer: { ...readyObservation().renderer, renderCallCount: 0 } }),
    },
    {
      name: 'particles', status: 'mounting',
      observation: readyObservation({
        particles: [{ ...readyObservation().particles[0], liveCount: 0, highWaterCount: 0, drawCount: 0 }],
      }),
    },
    {
      name: 'pose', status: 'invalid', reason: 'timeline-bone-pose-invalid',
      observation: readyObservation({
        bones: [{ ...readyObservation().bones[0], position: [0, 0.25, 0] }],
      }),
    },
    {
      name: 'playhead', status: 'mounting', reason: 'awaiting-canonical-timeline-pose',
      observation: readyObservation({
        bones: [{ ...readyObservation().bones[0], appliedPlayheadSeconds: 0.5 }],
      }),
    },
    {
      name: 'expected-pose', status: 'mounting', reason: 'awaiting-expected-bone-pose',
      observation: readyObservation({
        bones: [{ ...readyObservation().bones[0], expectedPosition: null }],
      }),
    },
    {
      name: 'behavior', status: 'mounting',
      observation: readyObservation({
        behavior: {
          revision: 1, effectCount: 0, successfulDispatchCount: 0, lastDispatchEffectCount: 0,
          lastEventId: null, lastTrigger: null, lastStatus: null, lastInvokedActionIds: [],
        },
      }),
    },
    {
      name: 'duplicate-effect', status: 'invalid', reason: 'behavior-exactly-once-proof-invalid',
      observation: readyObservation({
        behavior: {
          ...readyObservation().behavior,
          effectCount: 2,
          lastDispatchEffectCount: 2,
        },
      }),
    },
  ]
  for (const [index, entry] of cases.entries()) {
    resetMountedAuthoringEvidence(undefined, `gate-${entry.name}`)
    const lease = beginMountedAuthoringEvidence(plan(`fnv1a32:gate${String(index).padStart(4, '0')}`), 'canvas-fixture')
    const result = publishMountedAuthoringObservation(lease, entry.observation)
    assert.equal(result.status, entry.status, entry.name)
    if (entry.reason) assert.equal(result.reason, entry.reason, entry.name)
  }
  resetMountedAuthoringEvidence(undefined, 'gate-end')
})
