import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import { createPresetWorkspace } from '@/__tests__/floatingPanelChatVideoPreset.test'
import {
  promptCatalogMarkdown,
} from '@/__tests__/fixtures/promptPresetCatalogFixture'
import {
  isPromptPresetCatalogError,
  loadPromptPreset,
  loadPromptPresetCatalog,
  PROMPT_PRESET_REQUIRED_IDS,
  PROMPT_PRESET_CATALOG_WORKSPACE_PATH,
} from '@/features/chat/promptPresetCatalog'
import {
  buildPromptPresetChatInvocationCatalogEntries,
  resolveChatInvocationCatalogEntryInsertionText,
} from '@/features/chat/chatInvocationRegistry'
import { FloatingPanelPromptPresetsView } from '@/features/toolbar/FloatingPanelPromptPresetsView'
import { resetWorkspaceSeedProviderStorageCacheForTests } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testFloatingPanelChatPromptPresetCatalogLoadsChatAndMcpPresets() {
  const workspace = await createPresetWorkspace()
  const catalog = await loadPromptPresetCatalog(workspace)
  if (isPromptPresetCatalogError(catalog)) throw new Error(catalog.error)
  if (catalog.sourcePath !== PROMPT_PRESET_CATALOG_WORKSPACE_PATH) throw new Error(`unexpected catalog source ${catalog.sourcePath}`)
  const ids = new Set(catalog.presets.map(preset => preset.id))
  for (const id of PROMPT_PRESET_REQUIRED_IDS) {
    if (!ids.has(id)) throw new Error(`centralized prompt presets missing ${id}`)
  }
  for (const preset of catalog.presets) {
    const loaded = await loadPromptPreset(preset.id, workspace)
    if (isPromptPresetCatalogError(loaded) || !loaded.preset.prompt.startsWith(preset.runtimeCommand)) throw new Error(`expected ${preset.id} to load from the centralized catalog, got ${JSON.stringify(loaded)}`)
    if (
      preset.invocationModes[1] !== 'mcp-invocation'
      || preset.mcpTool !== 'knowgrph.agentic_canvas_os.docs.invoke'
      || preset.mcpToken !== preset.runtimeCommand
      || (preset.invocationModes[0] === 'llm-chat-response' && preset.chatRoute !== 'active Chat provider, endpoint, and model')
      || (preset.invocationModes[0] === 'native-chat-response' && preset.chatRoute !== 'active native shared runtime')
    ) throw new Error(`expected ${preset.id} to retain its Chat and MCP invocation metadata`)
  }
  const invocationEntries = buildPromptPresetChatInvocationCatalogEntries(catalog.presets)
  for (const [index, entry] of invocationEntries.entries()) {
    const preset = catalog.presets[index]
    if (
      !preset
      || entry.token !== preset.slashCommand
      || resolveChatInvocationCatalogEntryInsertionText(entry) !== preset.prompt
      || entry.invocationModes !== preset.invocationModes
      || entry.chatRoute !== preset.chatRoute
      || entry.mcpTool !== preset.mcpTool
      || entry.mcpToken !== preset.mcpToken
    ) {
      throw new Error(`expected ${entry.token} to insert its complete centralized prompt`)
    }
  }
  const extendedCatalogMarkdown = promptCatalogMarkdown.replace('\n---\n\n# Prompt presets', [
    '', '  - id: "crawler-agent-reference"', '    label: "Crawler Agent Reference"',
    '    slash_command: "/crawler-reference-prompt-preset"', '    runtime_command: "/crawler-agent"',
    '    description: "Reference crawler preset"', '    activation: "chat-agent"',
    '    invocation_modes: ["native-chat-response", "mcp-invocation"]',
    '    chat_route: "active native shared runtime"',
    '    mcp_tool: "knowgrph.agentic_canvas_os.docs.invoke"', '    mcp_token: "/crawler-agent"', '    prompt: |-',
    '      /crawler-agent @url:https://example.invalid @reference-policy #canvas', '',
    '      Crawl the referenced website with the reference policy.', '---', '', '# Prompt presets',
  ].join('\n'))
  await workspace.writeFileText(PROMPT_PRESET_CATALOG_WORKSPACE_PATH, extendedCatalogMarkdown)
  const extendedCatalog = await loadPromptPresetCatalog(workspace)
  if (isPromptPresetCatalogError(extendedCatalog) || extendedCatalog.presets.length !== catalog.presets.length + 1) throw new Error(`expected the source-backed catalog to accept future presets, got ${JSON.stringify(extendedCatalog)}`)
  const extendedInvocationEntries = buildPromptPresetChatInvocationCatalogEntries(extendedCatalog.presets)
  if (extendedInvocationEntries.at(-1)?.token !== '/crawler-reference-prompt-preset') {
    throw new Error(`expected future source-backed presets to join slash invocation without a local registry edit, got ${JSON.stringify(extendedInvocationEntries)}`)
  }
}

export async function testHomePromptPresetCatalogUsesCanonicalPublishedStorage() {
  const { restore } = initJsdomHarness()
  const globals = globalThis as typeof globalThis & { fetch?: typeof fetch }
  const originalFetch = globals.fetch
  const previousStorageBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const requestedUrls: string[] = []
  try {
    process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://storage.example.test'
    process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '0'
    resetWorkspaceSeedProviderStorageCacheForTests()
    globals.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      requestedUrls.push(url)
      if (url.includes('/api/storage/doc/kgws%3Acanonical-docs/agentic-canvas-os%2Fdocs%2FPROMPT-PRESETS.md')) {
        return new Response(promptCatalogMarkdown, {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        })
      }
      return new Response('', { status: 403 })
    }) as typeof fetch

    const catalog = await loadPromptPresetCatalog()
    if (isPromptPresetCatalogError(catalog)) throw new Error(catalog.error)
    if (catalog.presets.length < PROMPT_PRESET_REQUIRED_IDS.length) {
      throw new Error(`expected canonical published prompt presets, got ${catalog.presets.length}`)
    }
    if (!requestedUrls.some(url => url.includes('/api/storage/doc/kgws%3Acanonical-docs/agentic-canvas-os%2Fdocs%2FPROMPT-PRESETS.md'))) {
      throw new Error(`expected the exact canonical D1 prompt document request, got ${JSON.stringify(requestedUrls)}`)
    }
    if (requestedUrls.some(url => url.includes('github.com'))) {
      throw new Error(`Home prompt catalog must not request mutable GitHub sources: ${JSON.stringify(requestedUrls)}`)
    }

    resetWorkspaceSeedProviderStorageCacheForTests()
    requestedUrls.length = 0
    globals.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      requestedUrls.push(url)
      return new Response('', { status: 404 })
    }) as typeof fetch
    const missingCatalog = await loadPromptPresetCatalog()
    if (!isPromptPresetCatalogError(missingCatalog) || !missingCatalog.error.includes('unavailable')) {
      throw new Error(`missing canonical D1 catalog must fail closed, got ${JSON.stringify(missingCatalog)}`)
    }
    if (requestedUrls.some(url => url.includes('github.com'))) {
      throw new Error(`missing canonical D1 catalog must not activate a GitHub fallback: ${JSON.stringify(requestedUrls)}`)
    }
  } finally {
    resetWorkspaceSeedProviderStorageCacheForTests()
    globals.fetch = originalFetch
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousRepoLocal === 'string') process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    else delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    restore()
  }
}

export async function testFloatingPanelChatPromptPresetCatalogRejectsInvocationRouteDrift() {
  const driftedCatalogs = [
    promptCatalogMarkdown.replace(
      '    invocation_modes: ["llm-chat-response", "mcp-invocation"]',
      '    invocation_modes: ["llm-chat-response"]',
    ),
    promptCatalogMarkdown.replace(
      '    chat_route: "active Chat provider, endpoint, and model"',
      '    chat_route: "stale card-local provider route"',
    ),
    promptCatalogMarkdown.replace(
      '    mcp_tool: "knowgrph.agentic_canvas_os.docs.invoke"',
      '    mcp_tool: "knowgrph.unregistered.invoke"',
    ),
    promptCatalogMarkdown.replace(
      '    mcp_token: "/video-agent"',
      '    mcp_token: "/sme-care-agent"',
    ),
  ]
  for (const driftedCatalog of driftedCatalogs) {
    const workspace = await createPresetWorkspace()
    await workspace.writeFileText(PROMPT_PRESET_CATALOG_WORKSPACE_PATH, driftedCatalog)
    const catalog = await loadPromptPresetCatalog(workspace)
    if (!isPromptPresetCatalogError(catalog) || !catalog.error.includes('invalid preset')) {
      throw new Error(`expected prompt invocation drift to fail closed, got ${JSON.stringify(catalog)}`)
    }
  }
}

export async function testFloatingPanelPromptPresetsViewRendersAndInvokesAgentChoices() {
  const workspace = await createPresetWorkspace()
  const catalog = await loadPromptPresetCatalog(workspace)
  if (isPromptPresetCatalogError(catalog)) throw new Error(catalog.error)
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const invokedPrompts: string[] = []
  try {
    await mountReactRoot(root, React.createElement(FloatingPanelPromptPresetsView, { runtime: {
      loadCatalog: async () => catalog,
      loadPrompt: async id => {
        const result = await loadPromptPreset(id, workspace)
        return isPromptPresetCatalogError(result) ? { ok: false as const, error: result.error } : { ok: true as const, prompt: result.preset.prompt }
      },
      invokePrompt: prompt => { invokedPrompts.push(prompt); return true },
    } }), { window: dom.window as unknown as Window, frames: 4 })
    const rows = [...container.querySelectorAll<HTMLButtonElement>('button[data-kg-prompt-preset-row]')]
    if (rows.map(row => row.dataset.kgPromptPresetRow).join(',') !== catalog.presets.map(preset => preset.id).join(',')) throw new Error(`unexpected rendered preset rows ${rows.map(row => row.dataset.kgPromptPresetRow).join(',')}`)
    const tokens = [...container.querySelectorAll<HTMLElement>('[data-kg-prompt-preset-token-chip]')].map(token => token.textContent?.trim())
    if (tokens.join(',') !== catalog.presets.map(preset => preset.slashCommand).join(',')) throw new Error(`unexpected prompt preset invocation tokens ${tokens.join(',')}`)
    for (const row of rows) { await act(async () => { row.click() }); await waitForFrames(dom.window as unknown as Window, 3) }
    if (invokedPrompts.length !== catalog.presets.length) throw new Error(`expected each preset to invoke Chat, got ${invokedPrompts.length}`)
    for (const [index, preset] of catalog.presets.entries()) if (!invokedPrompts[index]?.startsWith(preset.runtimeCommand)) throw new Error(`expected ${preset.id} to invoke its complete centralized prompt, got ${invokedPrompts[index]}`)
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    restore()
  }
}
