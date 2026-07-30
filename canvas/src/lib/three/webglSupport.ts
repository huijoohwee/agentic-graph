export function readWebglSupport(
  documentValue: Document | null = typeof document === 'undefined' ? null : document,
): boolean {
  if (!documentValue) return false
  try {
    const selector = 'canvas[data-engine^="three.js"]'
    const existingRendererCanvases = typeof documentValue.querySelectorAll === 'function'
      ? [...documentValue.querySelectorAll<HTMLCanvasElement>(selector)]
      : []
    if (existingRendererCanvases.length > 1) return false
    const existingRendererCanvas = existingRendererCanvases[0]
      || (
        typeof documentValue.querySelector === 'function'
          ? documentValue.querySelector<HTMLCanvasElement>(selector)
          : null
      )
    if (existingRendererCanvas) {
      const existingContext = (
        existingRendererCanvas.getContext('webgl2')
        || existingRendererCanvas.getContext('webgl')
        || existingRendererCanvas.getContext('experimental-webgl' as never)
      ) as WebGLRenderingContext | WebGL2RenderingContext | null
      return Boolean(
        existingContext
        && (
          typeof existingContext.isContextLost !== 'function'
          || !existingContext.isContextLost()
        ),
      )
    }
    const canvas = documentValue.createElement('canvas')
    const context = (
      canvas.getContext('webgl2')
      || canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl' as never)
    ) as WebGLRenderingContext | WebGL2RenderingContext | null
    if (!context) return false
    // Release the probe promptly so the real renderer owns the browser's context budget.
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
