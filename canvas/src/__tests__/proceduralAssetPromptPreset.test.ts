import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createPresetWorkspace } from './floatingPanelChatVideoPreset.test'
import { promptCatalogMarkdown } from './fixtures/promptPresetCatalogFixture'
import { loadPromptPreset, loadPromptPresetCatalog, PROMPT_PRESET_CATALOG_WORKSPACE_PATH } from '@/features/chat/promptPresetCatalog'
import { loadPromptPresetForCommand } from '@/features/chat/promptPresetSelectionRuntime'
import { PROCEDURAL_ASSET_PRESET_CHAT_ROUTE, PROCEDURAL_ASSET_PROMPT_TOKENS } from '@/features/image-to-glb/proceduralAssetPromptPreset'
import { resolveProceduralAssetRunInput } from '@/features/image-to-glb/proceduralAssetWorkflowContract'
import { FloatingPanelPromptPresetsView } from '@/features/toolbar/FloatingPanelPromptPresetsView'
import { setActiveCardInlineTextExternalCommandTarget } from '@/lib/cards/cardInlineTextExternalCommands'
import { applyCardInlineCommandReplacement } from '@/lib/cards/CardInlineTextCommandMenuUtils'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

const preset = `  - id: "procedural-asset"
    label: "Create editable asset"
    slash_command: "/asset.create"
    runtime_command: "/asset.create"
    description: "Insert into an editable Card; use Card Run for local creation. Chat and tool execution remain pending."
    activation: "card-inline"
    invocation_modes: ["native-chat-response", "mcp-invocation"]
    chat_route: "native Card Run; Chat execution pending"
    execution_surface: "card-run"
    pending_surfaces: ["chat-send", "mcp-execution", "webmcp-execution", "xr"]
    mcp_tool: "agentic-graph.agentic_canvas_os.docs.invoke"
    mcp_token: "/asset.create"
    semantic_contract: "PROCEDURAL-ASSET-SKILL.md"
    prompt: |-
      /asset.create @text #procedural-asset

      Use a bounded native recipe. Preserve authored intent and editable source.
`
const catalogText = (entry = preset) => promptCatalogMarkdown.replace('prompt_presets:\n', `prompt_presets:\n${entry}`)
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message) }

export async function testProceduralAssetPresetRequiresCardExecutionGate() {
  const fs = await createPresetWorkspace()
  await fs.writeFileText(PROMPT_PRESET_CATALOG_WORKSPACE_PATH, catalogText())
  const loaded = await loadPromptPreset('procedural-asset', fs)
  assert(loaded.ok, 'The source-authored procedural preset must load')
  assert(loaded.preset.executionSurface === 'card-run' && loaded.preset.chatRoute === PROCEDURAL_ASSET_PRESET_CHAT_ROUTE, 'Catalog must retain the restricted execution surface')
  assert(loaded.preset.pendingSurfaces?.join(',') === 'chat-send,mcp-execution,webmcp-execution,xr', 'Unimplemented surfaces must remain pending')
  assert(loaded.preset.prompt.includes('Preserve authored intent'), 'Loading must retain the authored source prompt')
  let chatLoads = 0
  const routed = await loadPromptPresetForCommand('/asset.create', {
    loadCatalog: () => loadPromptPresetCatalog(fs),
    loadPrompt: async () => { chatLoads += 1; return { ok: true, prompt: loaded.preset.prompt } },
  })
  assert(routed === null && chatLoads === 0, 'Card execution cannot be promoted into Chat selection')
  for (const [label, invalid] of [
    ['absent gate', preset.replace('    execution_surface: "card-run"\n', '')],
    ['Chat gate', preset.replace('execution_surface: "card-run"', 'execution_surface: "chat-send"')],
    ['runtime claim', preset.replace(PROCEDURAL_ASSET_PRESET_CHAT_ROUTE, 'active native shared runtime')],
    ['missing pending tool', preset.replace('"webmcp-execution", ', '')],
    ['duplicate pending tool', preset.replace('"webmcp-execution"', '"mcp-execution"')],
    ['model route', preset.replace('native-chat-response', 'llm-chat-response')],
    ['alias drift', preset.replace('slash_command: "/asset.create"', 'slash_command: "/asset-prompt-preset"')],
    ['owner drift', preset.replace('PROCEDURAL-ASSET-SKILL.md', 'IMAGE-TO-GLB-SKILL.md')],
    ['invocation drift', preset.replace(PROCEDURAL_ASSET_PROMPT_TOKENS, '/asset.create @text')],
  ]) {
    await fs.writeFileText(PROMPT_PRESET_CATALOG_WORKSPACE_PATH, catalogText(invalid))
    assert(!(await loadPromptPresetCatalog(fs)).ok, `Catalog admitted ${label}`)
  }
}

export async function testProceduralAssetPresetInsertsIntoCardWithoutExecution() {
  const fs = await createPresetWorkspace()
  await fs.writeFileText(PROMPT_PRESET_CATALOG_WORKSPACE_PATH, catalogText())
  const loaded = await loadPromptPreset('procedural-asset', fs)
  assert(loaded.ok, 'Expected the procedural preset')
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const original = 'A blue robot\n\n![Existing attachment](workspace:/reference.png)'
  let text = original, insertions = 0, chatCalls = 0, promptLoads = 0
  setActiveCardInlineTextExternalCommandTarget({
    id: 'procedural-preset-source-card',
    insertMedia: () => { throw Error('Preset insertion must preserve existing attachments') },
    insertText: replacement => {
      insertions += 1
      text = applyCardInlineCommandReplacement({ text, selection: { start: text.length, end: text.length }, sigil: '/', query: '', replacement }).text
      return true
    },
  })
  try {
    await mountReactRoot(root, React.createElement(FloatingPanelPromptPresetsView, { runtime: {
      loadCatalog: async () => ({ ok: true as const, presets: [loaded.preset], sourcePath: loaded.sourcePath }),
      loadPrompt: async () => { promptLoads += 1; return { ok: true as const, prompt: loaded.preset.prompt } },
      invokePrompt: () => { chatCalls += 1; return true },
    } }), { window: dom.window as unknown as Window, frames: 2 })
    const button = container.querySelector<HTMLButtonElement>('[data-kg-prompt-preset-row="procedural-asset"]')
    assert(button?.getAttribute('aria-label') === 'Use Create editable asset in Card', 'The affordance must name Card insertion')
    assert(button.dataset.kgPromptPresetDelivery === 'card-insert-no-run', 'Insertion must not claim execution')
    await act(async () => { button.click() })
    assert(insertions === 1 && text.startsWith(original) && text.includes(PROCEDURAL_ASSET_PROMPT_TOKENS), 'Insert canonical tokens without replacing authored intent or attachments')
    assert(!text.includes('Use a bounded native recipe'), 'Instructional preset prose must not become the asset description')
    const input = resolveProceduralAssetRunInput({ node: { properties: { prompt: text } } })
    assert(input?.intent.includes('A blue robot'), 'Inserted tokens must resolve through the existing Card Run contract')
    assert(chatCalls === 0 && promptLoads === 0, 'Card insertion cannot dispatch Chat, tools or delayed loading')
    setActiveCardInlineTextExternalCommandTarget(null)
    await act(async () => { button.click() })
    assert(container.querySelector('[role="alert"]')?.textContent?.includes('Select an editable Card'), 'No Card must produce an actionable error')
    assert(insertions === 1 && chatCalls === 0, 'Missing Card must not fall back to Chat or mutate another surface')
  } finally {
    setActiveCardInlineTextExternalCommandTarget(null)
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    restore()
  }
}
