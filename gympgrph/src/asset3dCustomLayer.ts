import type { Asset3DConfig } from 'grph-shared/geospatial/enhancedLayerContract'

export type AssetMesh = {
  positions: Float32Array
  indices: Uint16Array
  color: readonly [number, number, number, number]
}

export type Asset3DLayerHandle = {
  readonly id: string
  readonly contextId: string
  setVisible(assetId: string, visible: boolean): void
  dispose(): void
}

const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * 6_371_008.8

const toMercatorCoordinate = (lng: number, lat: number, altitudeMeters: number) => {
  const latitudeRadians = lat * Math.PI / 180
  const circumferenceAtLatitude = EARTH_CIRCUMFERENCE_METERS * Math.cos(latitudeRadians)
  return {
    x: (180 + lng) / 360,
    y: (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)))) / 360,
    z: altitudeMeters / circumferenceAtLatitude,
    meterScale: 1 / circumferenceAtLatitude,
  }
}

type GlResource = {
  positionBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  indexCount: number
}

const multiplyMatrices = (left: ArrayLike<number>, right: ArrayLike<number>): Float32Array => {
  const result = new Float32Array(16)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] =
        left[row] * right[column * 4]
        + left[4 + row] * right[column * 4 + 1]
        + left[8 + row] * right[column * 4 + 2]
        + left[12 + row] * right[column * 4 + 3]
    }
  }
  return result
}

export function computeAssetModelMatrix(
  asset: Pick<Asset3DConfig, 'lat' | 'lng' | 'altitudeMeters' | 'scale' | 'rotationDegrees'>,
): Float64Array {
  const anchor = toMercatorCoordinate(asset.lng, asset.lat, asset.altitudeMeters)
  const meterScale = anchor.meterScale * asset.scale
  const radians = asset.rotationDegrees * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return new Float64Array([
    cosine * meterScale, sine * meterScale, 0, 0,
    -sine * meterScale, cosine * meterScale, 0, 0,
    0, 0, meterScale, 0,
    anchor.x, anchor.y, anchor.z, 1,
  ])
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

const createProgram = (gl: WebGLRenderingContext | WebGL2RenderingContext): WebGLProgram | null => {
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
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  gl.deleteProgram(program)
  return null
}

export function parseAssetMesh(bytes: Uint8Array): AssetMesh | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (value.schemaId !== 'knowgrph-geo-asset-mesh/v1') return null
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
}): { layer: unknown; handle: Asset3DLayerHandle } | null {
  const renderableAssets = args.assets.filter(asset => args.meshes.has(asset.id))
  if (renderableAssets.length === 0) return null
  const layerId = `kg-geo-assets:${args.contextId}`
  const visibility = new Map(renderableAssets.map(asset => [asset.id, asset.visible]))
  const resources = new Map<string, GlResource>()
  let map: any = null
  let glContext: WebGLRenderingContext | WebGL2RenderingContext | null = null
  let program: WebGLProgram | null = null
  let disposed = false

  const releaseResources = () => {
    if (!glContext) return
    for (const resource of resources.values()) {
      glContext.deleteBuffer(resource.positionBuffer)
      glContext.deleteBuffer(resource.indexBuffer)
    }
    resources.clear()
    if (program) glContext.deleteProgram(program)
    program = null
  }

  const layer = {
    id: layerId,
    type: 'custom' as const,
    renderingMode: '3d' as const,
    onAdd(nextMap: any, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      map = nextMap
      glContext = gl
      program = createProgram(gl)
      if (!program) return
      for (const asset of renderableAssets) {
        const mesh = args.meshes.get(asset.id)
        const positionBuffer = gl.createBuffer()
        const indexBuffer = gl.createBuffer()
        if (!mesh || !positionBuffer || !indexBuffer) continue
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
        resources.set(asset.id, { positionBuffer, indexBuffer, indexCount: mesh.indices.length })
      }
    },
    render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: { modelViewProjectionMatrix?: ArrayLike<number> }) {
      if (!program || disposed) return
      const projectionMatrix = options?.modelViewProjectionMatrix
      if (!projectionMatrix || projectionMatrix.length !== 16) return
      const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null
      const previousArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      const previousElementBuffer = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      gl.useProgram(program)
      const positionLocation = gl.getAttribLocation(program, 'a_position')
      const matrixLocation = gl.getUniformLocation(program, 'u_matrix')
      const colorLocation = gl.getUniformLocation(program, 'u_color')
      for (const asset of renderableAssets) {
        if (!visibility.get(asset.id)) continue
        const mesh = args.meshes.get(asset.id)
        const resource = resources.get(asset.id)
        if (!mesh || !resource) continue
        gl.bindBuffer(gl.ARRAY_BUFFER, resource.positionBuffer)
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resource.indexBuffer)
        gl.uniformMatrix4fv(matrixLocation, false, multiplyMatrices(projectionMatrix, computeAssetModelMatrix(asset)))
        gl.uniform4f(
          colorLocation,
          mesh.color[0] * mesh.color[3],
          mesh.color[1] * mesh.color[3],
          mesh.color[2] * mesh.color[3],
          mesh.color[3],
        )
        gl.drawElements(gl.TRIANGLES, resource.indexCount, gl.UNSIGNED_SHORT, 0)
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElementBuffer)
      gl.useProgram(previousProgram)
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
        if (map?.getLayer?.(layerId)) map.removeLayer(layerId)
        else releaseResources()
      } catch {
        releaseResources()
      }
      map = null
    },
  }
  return { layer, handle }
}
