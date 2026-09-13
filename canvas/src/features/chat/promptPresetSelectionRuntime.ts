import {
  loadPromptPresetCatalog,
  type PromptPresetCatalogResult,
} from './promptPresetCatalog'
import {
  loadPromptPresetInvocation,
  type PromptPresetInvocationResult,
} from './promptPresetInvocation'

export type PromptPresetSelectionRuntime = {
  loadCatalog: () => Promise<PromptPresetCatalogResult>
  loadPrompt: (id: string) => Promise<PromptPresetInvocationResult>
}

export const defaultPromptPresetSelectionRuntime: PromptPresetSelectionRuntime = {
  loadCatalog: () => loadPromptPresetCatalog(),
  loadPrompt: id => loadPromptPresetInvocation(id),
}

/** Resolve a unique authored Chat preset; discovery never submits or executes a command. */
export async function loadPromptPresetForCommand(
  command: string,
  runtime: PromptPresetSelectionRuntime = defaultPromptPresetSelectionRuntime,
): Promise<PromptPresetInvocationResult | null> {
  const catalog = await runtime.loadCatalog()
  if ('error' in catalog) return catalog
  const matches = catalog.presets.filter(preset =>
    preset.runtimeCommand === command && preset.activation === 'chat-agent')
  if (!matches.length) return null
  if (matches.length !== 1) return { ok: false, error: 'Choose a specific prompt in Prompt Presets.' }
  return runtime.loadPrompt(matches[0]!.id)
}
