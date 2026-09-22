export const PROCEDURAL_ASSET_PROMPT_PRESET_ID = 'procedural-asset' as const
export const PROCEDURAL_ASSET_PROMPT_TOKENS = '/asset.create @text #procedural-asset' as const
export const PROCEDURAL_ASSET_PRESET_CHAT_ROUTE = 'native Card Run; Chat execution pending' as const
export const PROCEDURAL_ASSET_PENDING_SURFACES = ['chat-send', 'mcp-execution', 'webmcp-execution', 'xr'] as const

/** Catalog discovery grants insertion only; execution remains with the native Card Run owner. */
export function isProceduralAssetPromptPreset(value: Record<string, unknown>): boolean {
  const pending = value.pending_surfaces
  return value.id === PROCEDURAL_ASSET_PROMPT_PRESET_ID
    && value.slash_command === '/asset.create'
    && value.runtime_command === '/asset.create'
    && value.activation === 'card-inline'
    && value.execution_surface === 'card-run'
    && value.chat_route === PROCEDURAL_ASSET_PRESET_CHAT_ROUTE
    && value.semantic_contract === 'PROCEDURAL-ASSET-SKILL.md'
    && Array.isArray(pending)
    && pending.length === PROCEDURAL_ASSET_PENDING_SURFACES.length
    && PROCEDURAL_ASSET_PENDING_SURFACES.every(surface => pending.includes(surface))
    && typeof value.prompt === 'string'
    && value.prompt.trim().split(/\r?\n/, 1)[0] === PROCEDURAL_ASSET_PROMPT_TOKENS
}
