import React from 'react'
import { createRoot } from 'react-dom/client'
import IntegrationsHubView from '@/features/panels/views/IntegrationsHubView'
import McpHubView from '@/features/panels/views/McpHubView'
import { useGraphStore } from '@/hooks/useGraphStore'
import { CHAT_SEALION_MODEL_OPTIONS } from '@/lib/chatEndpoint'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

const getSelectOptionValues = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map(option => option.value).filter(Boolean)

const findModelSelectsWithOption = (container: Element, optionValue: string): HTMLSelectElement[] =>
  (Array.from(container.querySelectorAll('select')) as HTMLSelectElement[])
    .filter(select => getSelectOptionValues(select).includes(optionValue))

const hasSelectOption = (container: Element, optionValue: string): boolean =>
  (Array.from(container.querySelectorAll('select')) as HTMLSelectElement[])
    .some(select => getSelectOptionValues(select).includes(optionValue))

const findKtvRow = (container: Element, key: string): HTMLElement | undefined =>
  (Array.from(container.querySelectorAll('dl')) as HTMLElement[])
    .find(row => String(row.children[0]?.textContent || '').trim() === key)

const getKtvValueInputValue = (container: Element, key: string): string => {
  const row = findKtvRow(container, key)
  const input = row?.children[2]?.querySelector('input') as HTMLInputElement | null | undefined
  return String(input?.value || '')
}

export async function testMainPanelRequestedIntegrationsSearchShowsSealionApiConfigurableValues() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    useGraphStore.getState().resetAll()

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(IntegrationsHubView, { searchQuery: 'sealionApi' } as never),
      { window: dom.window, frames: 6 },
    )

    const text = container.textContent || ''
    ;[
      'AI Singapore SEA-LION API',
      'sealionApi.provider',
      'sealionApi.endpoint_url',
      'sealionApi.model',
      'sealionApi.models_endpoint_url',
      'sealionApi.embeddings_endpoint_url',
      'sealionApi.embedding_model',
      'sealionApi.mcp.server_url',
      'sealionApi.routing_policy',
      'sealionApi.distribution',
      'sealionApi.docs_url',
      'sealionApi.rate_limit.rpm_per_user',
    ].forEach(token => {
      if (!text.includes(token)) throw new Error(`expected SEA-LION integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    })

    const modelSelect = findModelSelectsWithOption(container, CHAT_SEALION_MODEL_OPTIONS[0])[0]
    if (!modelSelect) throw new Error(`expected SEA-LION model Value cell to render visible model dropdown, got ${JSON.stringify(text)}`)
    if (modelSelect.value !== CHAT_SEALION_MODEL_OPTIONS[0]) {
      throw new Error(`expected SEA-LION model dropdown to default to ${JSON.stringify(CHAT_SEALION_MODEL_OPTIONS[0])}, got ${JSON.stringify(modelSelect.value)}`)
    }
    ;[
      'serverManaged',
      'byok',
      'chat_completion',
      'tool_calling',
      'reasoning_thinking_mode',
      'safety_check',
      'embedding',
      'hosted_api',
      'ollama',
      'workers_ai',
      'aisingapore/Qwen-SEA-LION-v4.5-27B-IT',
    ].forEach(value => {
      if (!hasSelectOption(container, value)) throw new Error(`expected SEA-LION Value cells to expose configurable option ${JSON.stringify(value)}`)
    })
    ;[
      ['sealionApi.endpoint_url', 'https://api.sea-lion.ai/v1/chat/completions'],
      ['sealionApi.models_endpoint_url', 'https://api.sea-lion.ai/v1/models'],
      ['sealionApi.embeddings_endpoint_url', 'https://api.sea-lion.ai/v1/embeddings'],
      ['sealionApi.embedding_model', 'aisingapore/SEA-LION-ModernBERT-Embedding-600M'],
      ['sealionApi.docs_url', 'https://docs.sea-lion.ai/guides/inferencing/api.md'],
      ['sealionApi.rate_limit.rpm_per_user', '10'],
    ].forEach(([rowKey, expectedValue]) => {
      const value = getKtvValueInputValue(container, rowKey)
      if (value !== expectedValue) {
        throw new Error(`expected ${rowKey} Value cell to render ${JSON.stringify(expectedValue)}, got ${JSON.stringify(value)}`)
      }
    })
    if (text.includes('Shared chat provider id for SEA-LION')) throw new Error('expected SEA-LION Value cells to avoid responsibility prose')
  } finally {
    try {
      await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedMcpSearchShowsSealionSidecarTools() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    useGraphStore.getState().resetAll()

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(McpHubView, { searchQuery: 'sealionMcp' } as never),
      { window: dom.window, frames: 6 },
    )

    const text = container.textContent || ''
    ;[
      'AI Singapore SEA-LION MCP Sidecar',
      'sealionMcp.remote.url',
      'sealionMcp.env.api_key',
      'sealionMcp.tool.detect_language_variant',
      'sealionMcp.tool.translate_localize',
      'sealionMcp.tool.safety_check',
      'AGENTIC_OS_MCP_SEALION_API_KEY',
    ].forEach(token => {
      if (!text.includes(token)) throw new Error(`expected SEA-LION MCP search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    })
    ;[
      ['sealionMcp.tool.detect_language_variant', 'sealion.detect_language_variant'],
      ['sealionMcp.tool.translate_localize', 'sealion.translate_localize'],
      ['sealionMcp.tool.safety_check', 'sealion.safety_check'],
    ].forEach(([rowKey, expectedValue]) => {
      const value = getKtvValueInputValue(container, rowKey)
      if (value !== expectedValue) {
        throw new Error(`expected ${rowKey} Value cell to render ${JSON.stringify(expectedValue)}, got ${JSON.stringify(value)}`)
      }
    })
    if (text.includes('Server-side AISG API key env for local agentic-graph MCP')) {
      throw new Error('expected SEA-LION MCP Value cells to avoid responsibility prose')
    }
  } finally {
    try {
      await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
