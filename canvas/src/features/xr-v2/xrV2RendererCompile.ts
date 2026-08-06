export type XrV2RendererCompileMethod = 'compileAsync' | 'compile' | 'unavailable'

export function resolveXrV2RendererCompileMethod(input: Readonly<{
  ci?: string | undefined
  hasCompileAsync: boolean
  hasCompile: boolean
}>): XrV2RendererCompileMethod {
  if (input.ci === 'true' && input.hasCompile) {
    // Headless Linux CI can leave compileAsync pending long enough to stall the
    // mounted authoring proof even when the renderer can compile synchronously.
    return 'compile'
  }
  if (input.hasCompileAsync) return 'compileAsync'
  if (input.hasCompile) return 'compile'
  return 'unavailable'
}
