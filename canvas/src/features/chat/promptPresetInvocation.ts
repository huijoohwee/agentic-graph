export type PromptPresetInvocationResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string }

export async function loadPromptPresetInvocation(id: string): Promise<PromptPresetInvocationResult> {
  const { selectGatewayPreset } = await import('./gatewayPresetCatalog')
  return selectGatewayPreset(id)
}

/** A deliberately submitted source projection can run entirely on the device. */
export function isCanvasSourceProjection(input: string): boolean {
  return /^\/canvas\.project\s+@source\.frontmatter\s+@source\.body\s+@canvas(?:\s|$)/.test(input.trimStart().split('\n', 1)[0] ?? '')
}
