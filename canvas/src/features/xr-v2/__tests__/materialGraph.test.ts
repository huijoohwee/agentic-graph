import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BoxGeometry, DataTexture, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'

import {
  MATERIAL_GRAPH_SCHEMA,
  compileMeshStandardMaterialGraph,
  type MaterialGraph,
} from '../materialGraph'
import { bindMaterialGraphToMeshStandardMaterial, bindMaterialGraphToTargetMesh } from '../materialGraphThreeAdapter'

function renderFacingGraph(): MaterialGraph {
  return {
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'albedo', type: 'color', value: '#336699' },
      { id: 'emissive', type: 'color', value: '#102030' },
      { id: 'roughness', type: 'number', value: 0.25 },
      { id: 'metalness', type: 'number', value: 0.75 },
      { id: 'opacity', type: 'number', value: 0.5 },
      { id: 'emissiveIntensity', type: 'number', value: 2 },
      { id: 'enabled', type: 'boolean', value: true },
      { id: 'disabled', type: 'boolean', value: false },
      {
        id: 'output',
        type: 'mesh-standard-output',
        bindings: {
          color: 'albedo',
          emissive: 'emissive',
          roughness: 'roughness',
          metalness: 'metalness',
          opacity: 'opacity',
          emissiveIntensity: 'emissiveIntensity',
          transparent: 'enabled',
          wireframe: 'enabled',
          depthWrite: 'disabled',
        },
      },
    ],
  }
}

test('typed material graph compiles to a renderer-free MeshStandardMaterial descriptor', () => {
  const graph: MaterialGraph = {
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'base', type: 'number', value: 0.4 },
      { id: 'gain', type: 'number', value: 0.5 },
      { id: 'roughness', type: 'multiply', left: 'base', right: 'gain' },
      { id: 'albedo', type: 'color', value: '#Aa33CC' },
      { id: 'transparent', type: 'boolean', value: true },
      {
        id: 'output',
        type: 'mesh-standard-output',
        bindings: { color: 'albedo', roughness: 'roughness', transparent: 'transparent' },
      },
    ],
  }

  assert.deepEqual(compileMeshStandardMaterialGraph(graph), {
    status: 'ready',
    descriptor: {
      target: 'MeshStandardMaterial',
      parameters: { color: '#aa33cc', roughness: 0.2, transparent: true },
    },
  })
})

test('material graph rejects cycles, unsafe ranges, and parameter type mismatches', () => {
  assert.equal(compileMeshStandardMaterialGraph({
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'a', type: 'multiply', left: 'a', right: 'number' },
      { id: 'number', type: 'number', value: 1 },
      { id: 'output', type: 'mesh-standard-output', bindings: { opacity: 'a' } },
    ],
  }).status, 'invalid')

  assert.deepEqual(compileMeshStandardMaterialGraph({
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'tooBright', type: 'number', value: 2 },
      { id: 'output', type: 'mesh-standard-output', bindings: { metalness: 'tooBright' } },
    ],
  }), { status: 'invalid', reason: 'unsafe-parameter-value' })

  assert.deepEqual(compileMeshStandardMaterialGraph({
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'color', type: 'color', value: '#ffffff' },
      { id: 'output', type: 'mesh-standard-output', bindings: { roughness: 'color' } },
    ],
  }), { status: 'invalid', reason: 'type-mismatch' })
})

test('compiled graph updates an actual existing Three MeshStandardMaterial', () => {
  const material = new MeshStandardMaterial({ color: '#000000', roughness: 1 })
  const result = bindMaterialGraphToMeshStandardMaterial(material)
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return

  const initialVersion = material.version
  const applied = result.binding.apply(renderFacingGraph())
  assert.equal(applied.status, 'ready')
  assert.equal(result.binding.material, material)
  assert.equal(material.isMeshStandardMaterial, true)
  assert.equal(material.color.getHexString(), '336699')
  assert.equal(material.emissive.getHexString(), '102030')
  assert.equal(material.roughness, 0.25)
  assert.equal(material.metalness, 0.75)
  assert.equal(material.opacity, 0.5)
  assert.equal(material.emissiveIntensity, 2)
  assert.equal(material.transparent, true)
  assert.equal(material.wireframe, true)
  assert.equal(material.depthWrite, false)
  assert.ok(material.version > initialVersion)
  assert.deepEqual(applied.state, {
    target: 'MeshStandardMaterial',
    uuid: material.uuid,
    version: material.version,
    bindingDisposed: false,
    color: '#336699',
    emissive: '#102030',
    roughness: 0.25,
    metalness: 0.75,
    opacity: 0.5,
    emissiveIntensity: 2,
    transparent: true,
    wireframe: true,
    depthWrite: false,
  })

  result.binding.dispose()
  material.dispose()
})

test('material binding rejects invalid updates atomically and tracks disposal', () => {
  const material = new MeshStandardMaterial({ color: '#123456', roughness: 0.6 })
  let disposeEvents = 0
  material.addEventListener('dispose', () => {
    disposeEvents += 1
  })

  const result = bindMaterialGraphToMeshStandardMaterial(material)
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return

  const before = result.binding.snapshot()
  const rejected = result.binding.apply({
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'unsafe', type: 'number', value: 4 },
      { id: 'output', type: 'mesh-standard-output', bindings: { roughness: 'unsafe' } },
    ],
  })
  assert.equal(rejected.status, 'invalid')
  assert.equal(rejected.reason, 'unsafe-parameter-value')
  assert.deepEqual(result.binding.snapshot(), before)

  const disposed = result.binding.dispose()
  assert.equal(disposed.bindingDisposed, true)
  assert.equal(disposeEvents, 0)
  const afterDispose = result.binding.apply(renderFacingGraph())
  assert.equal(afterDispose.status, 'invalid')
  assert.equal(afterDispose.reason, 'binding-disposed')
  result.binding.dispose()
  assert.equal(disposeEvents, 0)

  // The caller remains the material lifecycle owner after the binding unbinds.
  material.dispose()
  assert.equal(disposeEvents, 1)

  assert.deepEqual(bindMaterialGraphToMeshStandardMaterial({ isMeshStandardMaterial: true }), {
    status: 'invalid',
    reason: 'invalid-material',
  })
})

test('texture graph binds color multiplied by a caller-owned map to the target mesh', () => {
  const texture = new DataTexture(new Uint8Array([255, 128, 64, 255]), 1, 1)
  texture.needsUpdate = true
  const material = new MeshStandardMaterial({ color: '#ffffff' })
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)
  const graph: MaterialGraph = {
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'albedo', type: 'color', value: '#336699' },
      { id: 'surface', type: 'texture-2d', assetId: 'textures/checker-v1' },
      { id: 'output', type: 'mesh-standard-output', bindings: { color: 'albedo', map: 'surface' } },
    ],
  }
  assert.deepEqual(compileMeshStandardMaterialGraph(graph), {
    status: 'ready',
    descriptor: {
      target: 'MeshStandardMaterial',
      parameters: { color: '#336699' },
      textures: { map: 'textures/checker-v1' },
    },
  })

  const result = bindMaterialGraphToTargetMesh({
    mesh,
    resolveTexture: assetId => assetId === 'textures/checker-v1' ? texture : null,
  })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  const applied = result.binding.apply(graph)
  assert.equal(applied.status, 'ready')
  assert.equal(material.map, texture)
  assert.equal(material.color.getHexString(), '336699')
  assert.equal(applied.target.meshUuid, mesh.uuid)
  assert.equal(applied.target.mapUuid, texture.uuid)

  const before = result.binding.snapshot()
  const missingTexture = result.binding.apply({
    ...graph,
    nodes: graph.nodes.map(node => node.type === 'texture-2d' ? { ...node, assetId: 'textures/missing' } : node),
  })
  assert.equal(missingTexture.status, 'invalid')
  assert.equal(missingTexture.reason, 'texture-unavailable')
  assert.deepEqual(result.binding.snapshot(), before)

  const mapless = result.binding.apply(renderFacingGraph())
  assert.equal(mapless.status, 'ready')
  assert.equal(material.map, null)
  assert.equal(result.binding.snapshot().mapUuid, null)

  result.binding.dispose()
  assert.equal(texture.source.data, texture.image)
  mesh.geometry.dispose()
  material.dispose()
  texture.dispose()

  assert.deepEqual(bindMaterialGraphToTargetMesh({ mesh: {}, resolveTexture: () => null }), {
    status: 'invalid', reason: 'invalid-mesh',
  })
  const wrongMaterialMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  assert.deepEqual(bindMaterialGraphToTargetMesh({ mesh: wrongMaterialMesh, resolveTexture: () => null }), {
    status: 'invalid', reason: 'invalid-material',
  })
  wrongMaterialMesh.geometry.dispose()
  ;(wrongMaterialMesh.material as MeshBasicMaterial).dispose()
})
