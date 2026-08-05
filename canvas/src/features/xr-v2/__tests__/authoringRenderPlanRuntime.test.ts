import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  acquireXrAuthoringEcsRuntimeOwner,
  readXrAuthoringEcsRuntime,
  reconcileXrAuthoringEcs,
  releaseXrAuthoringEcsRuntime,
} from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import type { GraphData } from '@/lib/graph/types'
import { MATERIAL_GRAPH_SCHEMA } from '../materialGraph'
import { XR_V2_TIMELINE_SEQUENCE_SCHEMA } from '../timelineSequencer'

function schemaNode(name: string, fields: Record<string, string>) {
  return {
    id: `schema:${name}`, label: name, type: 'EcsComponentSchema',
    properties: { ecsComponent: { name, fields } },
  }
}

function xrFixture(): GraphData {
  return {
    type: 'application/json',
    nodes: [
      schemaNode('XrTransform', {
        px: 'f32', py: 'f32', pz: 'f32', qx: 'f32', qy: 'f32', qz: 'f32', qw: 'f32',
        sx: 'f32', sy: 'f32', sz: 'f32',
      }),
      schemaNode('XrRenderable', { geometryKind: 'u8', visible: 'u8' }),
      schemaNode('XrParticleEmitter', { rate: 'f32', lifetime: 'f32', ceiling: 'u16', size: 'f32', color: 'u32' }),
      schemaNode('XrRig', { enabled: 'u8' }),
      {
        id: 'entity:scene.hero', label: 'Hero', type: 'EcsEntity',
        properties: { ecsEntity: {
          entityRef: 'scene.hero',
          components: {
            XrTransform: { px: 1, py: 2, pz: 3, qx: 0, qy: 0, qz: 0, qw: 1, sx: 1, sy: 1, sz: 1 },
            XrRenderable: { geometryKind: 0, visible: 1 },
            XrParticleEmitter: { rate: 20, lifetime: 0.5, ceiling: 64, size: 0.05, color: 0x66ccff },
            XrRig: { enabled: 1 },
          },
        } },
      },
      {
        id: 'entity:scene.marker', label: 'Marker', type: 'EcsEntity',
        properties: { ecsEntity: {
          entityRef: 'scene.marker',
          components: {
            XrTransform: { px: -1, py: 0.5, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, sx: 1, sy: 1, sz: 1 },
          },
        } },
      },
      {
        id: 'material:hero', label: 'Hero material', type: 'XrMaterialGraph',
        properties: { xrMaterialGraph: {
          schema: MATERIAL_GRAPH_SCHEMA,
          nodes: [
            { id: 'albedo', type: 'color', value: '#336699' },
            { id: 'surface', type: 'texture-2d', assetId: 'builtin:checker-v1' },
            { id: 'roughness', type: 'number', value: 0.35 },
            { id: 'output', type: 'mesh-standard-output', bindings: {
              color: 'albedo', map: 'surface', roughness: 'roughness',
            } },
          ],
        } },
      },
      {
        id: 'behavior:hero:select', label: 'Select hero', type: 'XrBehaviorTrigger',
        properties: { xrBehaviorTrigger: {
          behaviorId: 'hero-select', trigger: 'select', sourceEntityRef: 'scene.hero',
        } },
      },
      {
        id: 'action:hero:burst', label: 'Burst particles', type: 'XrBehaviorAction',
        properties: { xrBehaviorAction: {
          actionId: 'hero-burst', kind: 'emit-particle-burst', targetEntityRef: 'scene.hero',
          parameters: { count: 8 },
        } },
      },
      {
        id: 'timeline:hero', label: 'Hero animation', type: 'XrTimelineSequence',
        properties: { xrTimelineSequence: {
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
        } },
      },
    ],
    edges: [
      { id: 'edge:material', source: 'material:hero', target: 'entity:scene.hero', label: 'xr-material-target', type: 'xr-material-target', properties: {} },
      { id: 'edge:behavior', source: 'behavior:hero:select', target: 'action:hero:burst', label: 'xr-behavior-wire', type: 'xr-behavior-wire', properties: {} },
      { id: 'edge:timeline', source: 'timeline:hero', target: 'entity:scene.hero', label: 'xr-timeline-target', type: 'xr-timeline-target', properties: {} },
    ],
  } as GraphData
}

test('root-owned ECS runtime hydrates entity zero and a second entity into one immutable authoring render plan', () => {
  const owner = acquireXrAuthoringEcsRuntimeOwner()
  try {
    const graphData = xrFixture()
    const ready = reconcileXrAuthoringEcs({
      documentName: 'xr-fixture.md', documentSourceUrl: 'https://example.test/xr-fixture.md',
      graphData, graphDataRevision: 1,
    })
    assert.equal(ready.status, 'ready')
    assert.deepEqual(ready.counts, { entities: 2, materials: 1, behaviors: 1, particles: 1, timelines: 1 })
    assert.equal(ready.plan?.entities[0].entityId, 0)
    assert.deepEqual(ready.plan?.componentQueries, {
      transformed: [0, 1], renderable: [0], particles: [0], rigs: [0],
    })
    assert.equal(ready.plan?.entities[0].entityRef, 'scene.hero')
    assert.equal(ready.plan?.entities[0].renderable?.materialGraphId, 'material:hero')
    assert.deepEqual(ready.plan?.behaviorGraph.behaviors[0].actionIds, ['hero-burst'])
    assert.equal(Object.isFrozen(ready.plan?.entities), true)

    const deduplicated = reconcileXrAuthoringEcs({
      documentName: 'xr-fixture.md', documentSourceUrl: 'https://example.test/xr-fixture.md',
      graphData, graphDataRevision: 1,
    })
    assert.equal(deduplicated, ready)

    const invalid = structuredClone(graphData)
    const entity = invalid.nodes.find(node => node.id === 'entity:scene.hero')!
    const payload = entity.properties.ecsEntity as unknown as { components: { XrRenderable: { visible: number } } }
    payload.components.XrRenderable.visible = 2
    const rejected = reconcileXrAuthoringEcs({
      documentName: 'xr-fixture.md', documentSourceUrl: 'https://example.test/xr-fixture.md',
      graphData: invalid, graphDataRevision: 2,
    })
    assert.equal(rejected.status, 'invalid')
    assert.equal(rejected.plan, null)
    assert.match(rejected.error?.message ?? '', /invalid XrRenderable/)
  } finally {
    releaseXrAuthoringEcsRuntime(owner)
  }
  assert.equal(readXrAuthoringEcsRuntime().status, 'idle')
})

test('root-owned ECS runtime stays idle for documents without admitted XR schemas', () => {
  const owner = acquireXrAuthoringEcsRuntimeOwner()
  try {
    const result = reconcileXrAuthoringEcs({
      documentName: 'plain.md', documentSourceUrl: null,
      graphData: { type: 'application/json', nodes: [], edges: [] }, graphDataRevision: 1,
    })
    assert.equal(result.status, 'idle')
    assert.equal(result.plan, null)
  } finally {
    releaseXrAuthoringEcsRuntime(owner)
  }
})
