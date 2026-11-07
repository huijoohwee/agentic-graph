import React from 'react'
import { createRoot } from 'react-dom/client'
import IntegrationsHubView from '@/features/panels/views/IntegrationsHubView'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  installDeterministicRaf,
  mountReactRoot,
  unmountReactRoot,
} from '@/tests/lib/reactRootHarness'
import {
  CHAT_OPENAI_BASE,
  CHAT_OPENAI_ENDPOINT_URL,
  CHAT_PROVIDER_OPENAI,
  buildChatProxyHeaders,
} from '@/lib/chatEndpoint'

const requireKtvValueCell = (container: Element, key: string): HTMLElement => {
  const row = (Array.from(container.querySelectorAll('dl')) as HTMLElement[])
    .find(candidate => String(candidate.children[0]?.textContent || '').trim() === key)
  if (!row) {
    throw new Error(`expected ${key} KTV row, got ${JSON.stringify(container.textContent || '')}`)
  }
  const valueCell = row.children[2] as HTMLElement | undefined
  if (!valueCell) {
    throw new Error(`expected ${key} row to have a Value cell`)
  }
  return valueCell
}

export async function testMainPanelOpenAiApiKeyUsesServerManagedProxyContract() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, React.createElement(IntegrationsHubView, {
      searchQuery: 'OPENAI_API_KEY',
    }), {
      window: dom.window as unknown as Window,
      frames: 6,
      tasks: 3,
    })

    const text = container.textContent || ''
    ;['OpenAI Chat API', 'openaiApi.auth_mode', 'openaiApi.api_key'].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected OpenAI server-managed key search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })

    const authValueCell = requireKtvValueCell(container, 'openaiApi.auth_mode')
    const authSelect = authValueCell.querySelector('button[data-kg-select]') as HTMLButtonElement | null
    if (!authSelect || authSelect.value !== 'serverManaged') {
      throw new Error(`expected openaiApi.auth_mode to default to serverManaged, got ${JSON.stringify(authValueCell.textContent || '')}`)
    }

    const apiKeyValueCell = requireKtvValueCell(container, 'openaiApi.api_key')
    const serverManagedInput = apiKeyValueCell.querySelector('input') as HTMLInputElement | null
    if (!serverManagedInput || serverManagedInput.type === 'password' || serverManagedInput.placeholder !== 'Server-managed Key') {
      throw new Error(`expected openaiApi.api_key to render the server-managed placeholder by default, got ${JSON.stringify(apiKeyValueCell.textContent || '')}`)
    }
    if (useGraphStore.getState().chatAuthMode !== 'serverManaged' || useGraphStore.getState().chatApiKey !== '') {
      throw new Error(`expected OpenAI server-managed mode to keep the browser key empty, got ${JSON.stringify({
        chatAuthMode: useGraphStore.getState().chatAuthMode,
        hasKey: Boolean(useGraphStore.getState().chatApiKey),
      })}`)
    }

    const headers = buildChatProxyHeaders({
      provider: CHAT_PROVIDER_OPENAI,
      endpointUrl: CHAT_OPENAI_ENDPOINT_URL,
      apiKey: '',
      clientRequestId: 'kg-openai-mainpanel-server-managed',
      aiGateway: {
        route: 'dynamic/draft',
        metadata: {
          intent: 'draft',
          request_surface: 'responses',
        },
        cacheTtlSeconds: 120,
      },
    })
    if (headers['X-KG-Chat-Provider'] !== CHAT_PROVIDER_OPENAI || headers['X-KG-Chat-Api-Key']) {
      throw new Error(`expected server-managed OpenAI requests to omit browser API-key headers, got ${JSON.stringify(headers)}`)
    }
    if (headers['X-KG-Chat-Upstream'] !== CHAT_OPENAI_BASE) {
      throw new Error(`expected OpenAI upstream to route through the shared proxy owner, got ${JSON.stringify(headers)}`)
    }
    if (headers['X-KG-AI-Gateway-Route'] !== 'dynamic/draft' || headers['X-KG-AI-Gateway-Cache-TTL'] !== '120') {
      throw new Error(`expected OpenAI server-managed requests to carry AI Gateway draft headers, got ${JSON.stringify(headers)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 2 })
    }
    restoreDom()
    restoreWindow()
  }
}
