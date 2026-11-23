export type PromptPresetInvocationResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string }

export async function loadPromptPresetInvocation(id: string): Promise<PromptPresetInvocationResult> {
  const { selectGatewayPreset } = await import('./gatewayPresetCatalog')
  return selectGatewayPreset(id)
}
