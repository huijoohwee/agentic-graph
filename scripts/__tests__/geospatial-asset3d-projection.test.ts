import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl'
import type { Asset3DConfig } from '../../grph-shared/src/geospatial/enhancedLayerContract.ts'
import {
  createAsset3DCustomLayer,
  type AssetMesh,
} from '../../gympgrph/src/asset3dCustomLayer.ts'
import {
  computeAssetFrameMatrix,
  computeAssetZUpLocalMatrix,
} from '../../gympgrph/src/asset3dProjection.ts'

const identityMatrix = (): Float64Array => new Float64Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
])

const translationMatrix = (x: number, y: number, z: number): Float64Array => {
  const matrix = identityMatrix()
  matrix[12] = x
  matrix[13] = y
  matrix[14] = z
  return matrix
}

const transformDirection = (
  matrix: ArrayLike<number>,
  direction: readonly [number, number, number],
): [number, number, number] => [
  Number(matrix[0]) * direction[0]
    + Number(matrix[4]) * direction[1]
    + Number(matrix[8]) * direction[2],
  Number(matrix[1]) * direction[0]
    + Number(matrix[5]) * direction[1]
    + Number(matrix[9]) * direction[2],
  Number(matrix[2]) * direction[0]
    + Number(matrix[6]) * direction[1]
    + Number(matrix[10]) * direction[2],
]

const createAsset = (overrides: Partial<Asset3DConfig> = {}): Asset3DConfig => ({
  id: 'landmark',
  url: '/fixtures/geospatial/neutral-mesh.json',
  lat: 1.3,
  lng: 103.8,
  altitudeMeters: 25,
  scale: 2,
  rotationDegrees: 0,
  tags: ['#landmarks'],
  visible: true,
  fetchBound: { timeoutMs: 1_000, maxBytes: 2_048 },
  ...overrides,
})

const frameInput = (mainMatrix: ArrayLike<number>): CustomRenderMethodInput => ({
  defaultProjectionData: { mainMatrix },
} as unknown as CustomRenderMethodInput)

test('z-up source axes become MapLibre y-up axes before geographic projection', () => {
  const matrix = computeAssetZUpLocalMatrix(createAsset())
  assert.deepEqual(transformDirection(matrix, [1, 0, 0]), [2, 0, 0])
  assert.deepEqual(transformDirection(matrix, [0, 1, 0]), [0, 0, 2])
  assert.deepEqual(transformDirection(matrix, [0, 0, 1]), [0, 2, 0])

  const rotated = computeAssetZUpLocalMatrix(createAsset({
    scale: 1,
    rotationDegrees: 90,
  }))
  const rotatedX = transformDirection(rotated, [1, 0, 0])
  assert.ok(Math.abs(rotatedX[0]) < 1e-12)
  assert.deepEqual(rotatedX.slice(1), [0, 1])
})

test('asset projection consumes the active map transform and frame matrix on every draw', () => {
  let modelMatrix = translationMatrix(10, 20, 30)
  const calls: Array<{ location: [number, number]; altitude: number | undefined }> = []
  const map = {
    transform: {
      getMatrixForModel(location: [number, number], altitude?: number) {
        calls.push({ location, altitude })
        return modelMatrix
      },
    },
  }
  const asset = createAsset({ scale: 1 })
  const first = computeAssetFrameMatrix(map, frameInput(identityMatrix()), asset)
  assert.ok(first)
  assert.deepEqual(calls[0], {
    location: [asset.lng, asset.lat],
    altitude: asset.altitudeMeters,
  })
  assert.deepEqual([...first.slice(12, 15)], [10, 20, 30])

  modelMatrix = translationMatrix(40, 50, 60)
  const mainMatrix = translationMatrix(1, 2, 3)
  const second = computeAssetFrameMatrix(map, frameInput(mainMatrix), asset)
  assert.ok(second)
  assert.equal(calls.length, 2)
  assert.deepEqual([...second.slice(12, 15)], [41, 52, 63])
})

test('projection validates inputs and rejects non-finite active-transform output', () => {
  let calls = 0
  const map = {
    transform: {
      getMatrixForModel() {
        calls += 1
        return identityMatrix()
      },
    },
  }
  const polarAsset = createAsset({ lat: 90 })
  assert.ok(computeAssetFrameMatrix(map, frameInput(identityMatrix()), polarAsset))
  assert.equal(calls, 1)

  assert.equal(
    computeAssetFrameMatrix(map, frameInput(identityMatrix()), createAsset({ lat: 90.000_1 })),
    null,
  )
  assert.equal(calls, 1)

  map.transform.getMatrixForModel = () => {
    const unsafeMatrix = identityMatrix()
    unsafeMatrix[0] = Number.NaN
    return unsafeMatrix
  }
  assert.equal(computeAssetFrameMatrix(map, frameInput(identityMatrix()), createAsset()), null)
})

type FakeGlState = {
  lost: boolean
  currentProgram: object | null
  arrayBuffer: object | null
  elementBuffer: object | null
  vertexArray: object | null
  drawCalls: number
  deletedBuffers: object[]
  deletedPrograms: object[]
  deletedVertexArrays: object[]
}

const createFakeGl = (): {
  gl: WebGL2RenderingContext
  state: FakeGlState
  initial: {
    program: object
    arrayBuffer: object
    elementBuffer: object
    vertexArray: object
  }
} => {
  let resourceIndex = 0
  const resource = (kind: string): object => ({ kind, id: resourceIndex += 1 })
  const initial = {
    program: resource('host-program'),
    arrayBuffer: resource('host-array-buffer'),
    elementBuffer: resource('host-element-buffer'),
    vertexArray: resource('host-vertex-array'),
  }
  const vertexArrayElements = new Map<object | null, object | null>([
    [initial.vertexArray, initial.elementBuffer],
  ])
  const state: FakeGlState = {
    lost: false,
    currentProgram: initial.program,
    arrayBuffer: initial.arrayBuffer,
    elementBuffer: initial.elementBuffer,
    vertexArray: initial.vertexArray,
    drawCalls: 0,
    deletedBuffers: [],
    deletedPrograms: [],
    deletedVertexArrays: [],
  }
  const constants = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7,
    CURRENT_PROGRAM: 8,
    ARRAY_BUFFER_BINDING: 9,
    ELEMENT_ARRAY_BUFFER_BINDING: 10,
    VERTEX_ARRAY_BINDING: 11,
    FLOAT: 12,
    TRIANGLES: 13,
    UNSIGNED_SHORT: 14,
    VERTEX_ATTRIB_ARRAY_ENABLED: 15,
    VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 16,
    VERTEX_ATTRIB_ARRAY_SIZE: 17,
    VERTEX_ATTRIB_ARRAY_TYPE: 18,
    VERTEX_ATTRIB_ARRAY_NORMALIZED: 19,
    VERTEX_ATTRIB_ARRAY_STRIDE: 20,
    VERTEX_ATTRIB_ARRAY_POINTER: 21,
  }
  const gl = {
    ...constants,
    isContextLost: () => state.lost,
    createShader: () => resource('shader'),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    deleteShader: () => undefined,
    createProgram: () => resource('program'),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getUniformLocation: () => resource('uniform'),
    deleteProgram: (value: object) => state.deletedPrograms.push(value),
    createVertexArray: () => resource('vertex-array'),
    bindVertexArray: (value: object | null) => {
      state.vertexArray = value
      state.elementBuffer = vertexArrayElements.get(value) ?? null
    },
    deleteVertexArray: (value: object) => state.deletedVertexArrays.push(value),
    createBuffer: () => resource('buffer'),
    deleteBuffer: (value: object) => state.deletedBuffers.push(value),
    bindBuffer: (target: number, value: object | null) => {
      if (target === constants.ARRAY_BUFFER) {
        state.arrayBuffer = value
      } else {
        state.elementBuffer = value
        vertexArrayElements.set(state.vertexArray, value)
      }
    },
    bufferData: () => undefined,
    getParameter: (parameter: number) => {
      if (parameter === constants.CURRENT_PROGRAM) return state.currentProgram
      if (parameter === constants.ARRAY_BUFFER_BINDING) return state.arrayBuffer
      if (parameter === constants.ELEMENT_ARRAY_BUFFER_BINDING) return state.elementBuffer
      if (parameter === constants.VERTEX_ARRAY_BINDING) return state.vertexArray
      return null
    },
    getExtension: () => null,
    getVertexAttrib: () => null,
    getVertexAttribOffset: () => 0,
    enableVertexAttribArray: () => undefined,
    disableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    useProgram: (value: object | null) => { state.currentProgram = value },
    uniformMatrix4fv: () => undefined,
    uniform4f: () => undefined,
    drawElements: () => { state.drawCalls += 1 },
  } as unknown as WebGL2RenderingContext
  return { gl, state, initial }
}

test('custom asset layer restores host GL state and recreates resources after context loss', () => {
  const asset = createAsset({ scale: 1 })
  const mesh: AssetMesh = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    color: [0.6, 0.65, 0.7, 1],
  }
  const created = createAsset3DCustomLayer({
    contextId: 'projection-test',
    assets: [asset],
    meshes: new Map([[asset.id, mesh]]),
  })
  assert.ok(created)
  const map = {
    transform: { getMatrixForModel: () => identityMatrix() },
    triggerRepaint: () => undefined,
  } as unknown as MapLibreMap
  const first = createFakeGl()

  created.layer.onAdd?.(map, first.gl)
  assert.equal(first.state.arrayBuffer, first.initial.arrayBuffer)
  assert.equal(first.state.elementBuffer, first.initial.elementBuffer)
  assert.equal(first.state.vertexArray, first.initial.vertexArray)
  created.layer.render(first.gl, frameInput(identityMatrix()))
  assert.equal(first.state.drawCalls, 1)
  assert.equal(first.state.currentProgram, first.initial.program)
  assert.equal(first.state.arrayBuffer, first.initial.arrayBuffer)
  assert.equal(first.state.elementBuffer, first.initial.elementBuffer)
  assert.equal(first.state.vertexArray, first.initial.vertexArray)

  first.state.lost = true
  created.layer.onRemove?.(map, first.gl)
  assert.equal(first.state.deletedBuffers.length, 0)
  assert.equal(first.state.deletedPrograms.length, 0)
  assert.equal(first.state.deletedVertexArrays.length, 0)

  const restored = createFakeGl()
  created.layer.onAdd?.(map, restored.gl)
  created.layer.render(restored.gl, frameInput(identityMatrix()))
  assert.equal(restored.state.drawCalls, 1)
  created.layer.onRemove?.(map, restored.gl)
  assert.equal(restored.state.deletedBuffers.length, 2)
  assert.equal(restored.state.deletedPrograms.length, 1)
  assert.equal(restored.state.deletedVertexArrays.length, 1)
})

test('custom asset layer rejects unsafe coordinates before allocating a GL context', () => {
  const asset = createAsset({ lng: Number.POSITIVE_INFINITY })
  const mesh: AssetMesh = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    color: [1, 1, 1, 1],
  }
  assert.equal(createAsset3DCustomLayer({
    contextId: 'unsafe',
    assets: [asset],
    meshes: new Map([[asset.id, mesh]]),
  }), null)
})
