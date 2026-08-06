export type XrV2RendererCompileMethod = 'compileAsync' | 'compile' | 'unavailable'

export function resolveXrV2RendererCompileMethod(input: Readonly<{
  automatedBrowser: boolean
  hasCompileAsync: boolean
  hasCompile: boolean
}>): XrV2RendererCompileMethod {
  if (input.automatedBrowser && input.hasCompile) {
    // Chromium automation can leave compileAsync pending long enough to stall
    // the mounted authoring proof even when synchronous compilation is ready.
    return 'compile'
  }
  if (input.hasCompileAsync) return 'compileAsync'
  if (input.hasCompile) return 'compile'
  return 'unavailable'
}
