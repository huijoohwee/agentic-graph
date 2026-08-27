import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl'
import type { Asset3DConfig } from 'grph-shared/geospatial/enhancedLayerContract'
import {
  computeAssetFrameMatrix,
  isSafeAssetProjectionInput,
} from './asset3dProjection.js'

export type AssetMesh = {
  positions: Float32Array
  indices: Uint16Array
  color: readonly [number, number, number, number]
}

export type Asset3DLayerHandle = {
  readonly id: string
  readonly contextId: string
  setVisible(assetId: string, visible: boolean): void
  remove(assetId: string): void
  dispose(): void
}

type GlResource = {
  positionBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  indexCount: number
}

type GlProgramState = {
  program: WebGLProgram
  positionLocation: number
  matrixLocation: WebGLUniformLocation
  colorLocation: WebGLUniformLocation
}

type VertexArrayApi = {
  bindingParameter: number
  create(): unknown
  bind(value: unknown): void
  destroy(value: unknown): void
}

type VertexAttributeState = {
  enabled: boolean
  buffer: WebGLBuffer | null
  size: number
  type: number
  normalized: boolean
  stride: number
  offset: number
}

const compileShader = (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

const createProgram = (gl: WebGLRenderingContext | WebGL2RenderingContext): GlProgramState | null => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec3 a_position;
    uniform mat4 u_matrix;
    void main() { gl_Position = u_matrix * vec4(a_position, 1.0); }
  `)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec4 u_color;
    void main() { gl_FragColor = u_color; }
  `)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const matrixLocation = gl.getUniformLocation(program, 'u_matrix')
    const colorLocation = gl.getUniformLocation(program, 'u_color')
    if (positionLocation >= 0 && matrixLocation && colorLocation) {
      return { program, positionLocation, matrixLocation, colorLocation }
    }
  }
  gl.deleteProgram(program)
  return null
}

const resolveVertexArrayApi = (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): VertexArrayApi | null => {
  const webGl2 = gl as WebGL2RenderingContext
  if (
    typeof webGl2.createVertexArray === 'function'
    && typeof webGl2.bindVertexArray === 'function'
    && typeof webGl2.deleteVertexArray === 'function'
  ) {
    return {
      bindingParameter: webGl2.VERTEX_ARRAY_BINDING,
      create: () => webGl2.createVertexArray(),
      bind: value => webGl2.bindVertexArray(value as WebGLVertexArrayObject | null),
      destroy: value => webGl2.deleteVertexArray(value as WebGLVertexArrayObject | null),
    }
  }

  const extension = gl.getExtension('OES_vertex_array_object')
  if (!extension) return null
  return {
    bindingParameter: extension.VERTEX_ARRAY_BINDING_OES,
    create: () => extension.createVertexArrayOES(),
    bind: value => extension.bindVertexArrayOES(value as WebGLVertexArrayObjectOES | null),
    destroy: value => extension.deleteVertexArrayOES(value as WebGLVertexArrayObjectOES | null),
  }
}

const captureVertexAttributeState = (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  location: number,
): VertexAttributeState | null => {
  try {
    return {
      enabled: Boolean(gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED)),
      buffer: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
      size: Number(gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE)),
      type: Number(gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE)),
      normalized: Boolean(gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED)),
      stride: Number(gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_STRIDE)),
      offset: gl.getVertexAttribOffset(location, gl.VERTEX_ATTRIB_ARRAY_POINTER),
    }
  } catch {
    return null
  }
}

const restoreVertexAttributeState = (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  location: number,
  state: VertexAttributeState | null,
): void => {
  if (state?.buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer)
    gl.vertexAttribPointer(
      location,
      state.size,
      state.type,
      state.normalized,
      state.stride,
      state.offset,
    )
  }
  if (state?.enabled) gl.enableVertexAttribArray(location)
  else gl.disableVertexAttribArray(location)
}

export function parseAssetMesh(bytes: Uint8Array): AssetMesh | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (value.schemaId !== 'agenticgraph-geo-asset-mesh/v1') return null
    if (!Array.isArray(value.positions) || value.positions.length < 9 || value.positions.length % 9 !== 0) return null
    if (!Array.isArray(value.indices) || value.indices.length < 3 || value.indices.length % 3 !== 0) return null
    const positions = value.positions.map(Number)
    const indices = value.indices.map(Number)
    const vertexCount = positions.length / 3
    if (positions.some(item => !Number.isFinite(item))) return null
    if (indices.some(item => !Number.isInteger(item) || item < 0 || item >= vertexCount || item > 65_535)) return null
    const rawColor = Array.isArray(value.color) ? value.color.map(Number) : [0.6, 0.65, 0.7, 1]
    if (rawColor.length !== 4 || rawColor.some(item => !Number.isFinite(item) || item < 0 || item > 1)) return null
    return {
      positions: new Float32Array(positions),
      indices: new Uint16Array(indices),
      color: rawColor as [number, number, number, number],
    }
  } catch {
    return null
  }
}

export function createAsset3DCustomLayer(args: {
  contextId: string
  assets: readonly Asset3DConfig[]
  meshes: ReadonlyMap<string, AssetMesh>
}): { layer: CustomLayerInterface; handle: Asset3DLayerHandle } | null {
  const renderableAssets = args.assets.filter(
    asset => args.meshes.has(asset.id) && isSafeAssetProjectionInput(asset),
  )
  if (renderableAssets.length === 0) return null
  const layerId = `kg-geo-assets:${args.contextId}`
  const visibility = new Map(renderableAssets.map(asset => [asset.id, asset.visible]))
  const resources = new Map<string, GlResource>()
  let map: MapLibreMap | null = null
  let glContext: WebGLRenderingContext | WebGL2RenderingContext | null = null
  let programState: GlProgramState | null = null
  let vertexArrayApi: VertexArrayApi | null = null
  let vertexArray: unknown = null
  let disposed = false

  const isContextLost = (gl: WebGLRenderingContext | WebGL2RenderingContext): boolean => {
    try {
      return gl.isContextLost()
    } catch {
      return true
    }
  }

  const releaseResources = (): void => {
    const context = glContext
    const ownedResources = [...resources.values()]
    resources.clear()
    const ownedProgram = programState?.program ?? null
    programState = null
    const ownedVertexArrayApi = vertexArrayApi
    const ownedVertexArray = vertexArray
    vertexArrayApi = null
    vertexArray = null
    if (!context || isContextLost(context)) return

    for (const resource of ownedResources) {
      context.deleteBuffer(resource.positionBuffer)
      context.deleteBuffer(resource.indexBuffer)
    }
    if (ownedProgram) context.deleteProgram(ownedProgram)
    if (ownedVertexArrayApi && ownedVertexArray) {
      ownedVertexArrayApi.destroy(ownedVertexArray)
    }
  }

  const initializeResources = (
    gl: WebGLRenderingContext | WebGL2RenderingContext,
  ): void => {
    releaseResources()
    glContext = gl
    programState = createProgram(gl)
    if (!programState) return
    vertexArrayApi = resolveVertexArrayApi(gl)
    vertexArray = vertexArrayApi?.create() ?? null
    const previousArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
    const previousElementBuffer = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null
    const previousVertexArray = vertexArrayApi && vertexArray
      ? gl.getParameter(vertexArrayApi.bindingParameter) as unknown
      : null

    try {
      if (vertexArrayApi && vertexArray) vertexArrayApi.bind(vertexArray)
      for (const asset of renderableAssets) {
        if (!visibility.has(asset.id)) continue
        const mesh = args.meshes.get(asset.id)
        if (!mesh) continue
        const positionBuffer = gl.createBuffer()
        const indexBuffer = gl.createBuffer()
        if (!positionBuffer || !indexBuffer) {
          if (positionBuffer) gl.deleteBuffer(positionBuffer)
          if (indexBuffer) gl.deleteBuffer(indexBuffer)
          continue
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
        resources.set(asset.id, {
          positionBuffer,
          indexBuffer,
          indexCount: mesh.indices.length,
        })
      }
    } finally {
      if (vertexArrayApi && vertexArray) vertexArrayApi.bind(previousVertexArray)
      gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElementBuffer)
    }
  }

  const layer: CustomLayerInterface = {
    id: layerId,
    type: 'custom',
    renderingMode: '3d',
    onAdd(nextMap, gl) {
      if (disposed) return
      map = nextMap
      initializeResources(gl)
    },
    render(gl, options: CustomRenderMethodInput) {
      const bindings = programState
      if (!bindings || disposed || !map || gl !== glContext || isContextLost(gl)) return
      const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null
      const previousArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      const previousElementBuffer = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      const activeVertexArrayApi = vertexArrayApi
      const activeVertexArray = vertexArray
      const previousVertexArray = activeVertexArrayApi && activeVertexArray
        ? gl.getParameter(activeVertexArrayApi.bindingParameter) as unknown
        : null
      const previousAttribute = activeVertexArray
        ? null
        : captureVertexAttributeState(gl, bindings.positionLocation)

      try {
        if (activeVertexArrayApi && activeVertexArray) {
          activeVertexArrayApi.bind(activeVertexArray)
        }
        gl.useProgram(bindings.program)
        for (const asset of renderableAssets) {
          if (!visibility.get(asset.id)) continue
          const mesh = args.meshes.get(asset.id)
          const resource = resources.get(asset.id)
          if (!mesh || !resource) continue
          const frameMatrix = computeAssetFrameMatrix(map, options, asset)
          if (!frameMatrix) continue
          gl.bindBuffer(gl.ARRAY_BUFFER, resource.positionBuffer)
          gl.enableVertexAttribArray(bindings.positionLocation)
          gl.vertexAttribPointer(bindings.positionLocation, 3, gl.FLOAT, false, 0, 0)
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resource.indexBuffer)
          gl.uniformMatrix4fv(bindings.matrixLocation, false, frameMatrix)
          gl.uniform4f(
            bindings.colorLocation,
            mesh.color[0] * mesh.color[3],
            mesh.color[1] * mesh.color[3],
            mesh.color[2] * mesh.color[3],
            mesh.color[3],
          )
          gl.drawElements(gl.TRIANGLES, resource.indexCount, gl.UNSIGNED_SHORT, 0)
        }
      } finally {
        if (activeVertexArrayApi && activeVertexArray) {
          activeVertexArrayApi.bind(previousVertexArray)
        } else {
          restoreVertexAttributeState(gl, bindings.positionLocation, previousAttribute)
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElementBuffer)
        gl.useProgram(previousProgram)
      }
    },
    onRemove() {
      releaseResources()
      map = null
      glContext = null
    },
  }

  const handle: Asset3DLayerHandle = {
    id: layerId,
    contextId: args.contextId,
    setVisible(assetId, visible) {
      if (!visibility.has(assetId)) return
      visibility.set(assetId, visible)
      map?.triggerRepaint?.()
    },
    remove(assetId) {
      if (!visibility.delete(assetId)) return
      const resource = resources.get(assetId)
      resources.delete(assetId)
      const context = glContext
      if (resource && context && !isContextLost(context)) {
        context.deleteBuffer(resource.positionBuffer)
        context.deleteBuffer(resource.indexBuffer)
      }
      map?.triggerRepaint?.()
    },
    dispose() {
      if (disposed) return
      disposed = true
      try {
        const container = map?.getContainer?.() as HTMLElement | undefined
        if (container?.dataset.kgEnhancedAssetContext === args.contextId) {
          delete container.dataset.kgEnhancedAssetContext
        }
      } catch {
        void 0
      }
      try {
        if (map?.getLayer(layerId)) map.removeLayer(layerId)
        else releaseResources()
      } catch {
        releaseResources()
      }
      map = null
    },
  }
  return { layer, handle }
}
