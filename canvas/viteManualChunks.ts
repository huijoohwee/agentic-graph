/** Separate renderer backends from shared geometry; GPU code remains opt-in. */
export function webGpuManualChunk(id: string): string | undefined {
  if (id.includes('/node_modules/three/examples/')) return 'three-examples'
  if (id.includes('/node_modules/@react-three/fiber/')) return 'three-fiber'
  if (!id.includes('/node_modules/three/')) return undefined
  if (id.endsWith('/src/Three.js')) return 'three-entry'
  if (id.includes('/src/math/') || id.endsWith('/src/constants.js')) return 'three-math'
  if (id.includes('/src/nodes/') || id.includes('/src/materials/nodes/')
    || /\/src\/renderers\/(common|webgpu|webgl-fallback)\//.test(id)) return 'three-webgpu-renderer'
  if (/\/(UniformsUtils|default_vertex.glsl|default_fragment.glsl)\.js$/.test(id)) return 'three-core'
  if (/\/src\/renderers\/(webgl\/|webxr\/|shaders\/|WebGLRenderer\.js)/.test(id)) return 'three-webgl-renderer'
  return 'three-core'
}
