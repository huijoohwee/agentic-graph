import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MATERIAL_GRAPH_SCHEMA,
  compileMeshStandardMaterialGraph,
  type MaterialGraph,
} from '../materialGraph'

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
