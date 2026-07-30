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
