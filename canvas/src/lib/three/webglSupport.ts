const fallbackDocuments = new WeakSet<Document>()
const fallbackPixelBudget = 1024 * 768

/** The browser reports a major performance caveat when this context needs the fallback path. */
export function resolveWebglCanvasDpr(
  adaptiveDpr?: number,
  documentValue: Document | null = typeof document === 'undefined' ? null : document,
): number | [number, number] {
  const view = documentValue?.defaultView
  if (!documentValue || !view || !fallbackDocuments.has(documentValue) || view.innerWidth <= 0 || view.innerHeight <= 0) {
    return adaptiveDpr ?? [1, 2]
  }
  const limit = Math.sqrt(fallbackPixelBudget / (view.innerWidth * view.innerHeight))
  return Math.min(adaptiveDpr ?? 2, view.devicePixelRatio || 1, limit)
}

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
    const getContext = (attributes?: WebGLContextAttributes) => (
      canvas.getContext('webgl2', attributes)
      || canvas.getContext('webgl', attributes)
      || canvas.getContext('experimental-webgl' as never, attributes)
    ) as WebGLRenderingContext | WebGL2RenderingContext | null
    const preferred = getContext({ failIfMajorPerformanceCaveat: true })
    const context = preferred || getContext()
    if (!context) return false
    if (preferred) fallbackDocuments.delete(documentValue)
    else fallbackDocuments.add(documentValue)
    // Release the probe promptly so the real renderer owns the browser's context budget.
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
