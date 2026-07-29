import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import IntegrationsHubView from '@/features/panels/views/IntegrationsHubView'
import {
  CHAT_BYTEPLUS_EU_WEST_ENDPOINT_URL,
  CHAT_BYTEPLUS_MODEL_OPTIONS,
  CHAT_AGNES_MODEL_OPTIONS,
  CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  CHAT_MIROMIND_MODEL_OPTIONS,
  CHAT_OPENAI_MODEL_OPTIONS,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_OPENAI,
  CHAT_PROVIDER_QWEN,
  CHAT_QWEN_ENDPOINT_OPTIONS,
  CHAT_QWEN_MODEL_OPTIONS,
} from '@/lib/chatEndpoint'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  installDeterministicRaf,
  mountReactRoot,
  unmountReactRoot,
  waitForFrames as waitForFramesShared,
} from '@/tests/lib/reactRootHarness'

const waitForFrames = async (count = 1) => {
  const win = (globalThis as unknown as { window?: Window }).window
  if (!win) throw new Error('expected window for frame flush')
  await waitForFramesShared(win, count)
}

const renderRequestedIntegrationsSearch = async (
  root: ReturnType<typeof createRoot>,
  requestedSearchQuery: string,
) => {
  const win = (globalThis as unknown as { window?: Window }).window
  if (!win) throw new Error('expected window for root render flush')
  await mountReactRoot(
    root,
    React.createElement(IntegrationsHubView, {
      searchQuery: requestedSearchQuery,
    } as never),
    { window: win, frames: 12 },
  )
}

const unmountAndFlush = async (root: ReturnType<typeof createRoot> | null) => {
  if (!root) return
  const win = (globalThis as unknown as { window?: Window }).window
  await unmountReactRoot(root, win ? { window: win } : undefined)
}

const createMainPanelHost = () => {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
  anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setChatProvider(CHAT_PROVIDER_OPENAI)
  useGraphStore.getState().setChatModel(CHAT_OPENAI_MODEL_OPTIONS[0])

  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  return {
    container,
    dom,
    root,
    restore: async () => {
      try {
        await unmountAndFlush(root)
      } catch {
        void 0
      }
      useGraphStore.getState().setChatProvider(CHAT_PROVIDER_OPENAI)
      useGraphStore.getState().setChatModel(CHAT_OPENAI_MODEL_OPTIONS[0])
      restoreDom()
      restoreWindow()
    },
  }
}

const findValueCellSelectForRowKey = (container: HTMLElement, rowKey: string) => {
  const valueRows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
  const row = valueRows.find(item => item.children[0]?.textContent?.trim() === rowKey)
  return row?.querySelector<HTMLSelectElement>('select') || null
}

const findValueCellInputForRowKey = (container: HTMLElement, rowKey: string) => {
  const valueRows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
  const row = valueRows.find(item => item.children[0]?.textContent?.trim() === rowKey)
  return row?.querySelector<HTMLInputElement>('input') || null
}

export async function testMainPanelRequestedIntegrationsChatProviderValueCellDerivesFromChatModel() {
  const host = createMainPanelHost()

  try {
    await renderRequestedIntegrationsSearch(host.root, 'chat')

    const valueRows = Array.from(host.container.querySelectorAll('dl')) as HTMLElement[]
    const providerRow = valueRows.find(row => row.children[0]?.textContent?.trim() === 'chatProvider')
    const providerValueCell = providerRow as HTMLElement | undefined
    const providerInput = providerValueCell?.querySelector('input') as HTMLInputElement | null
    if (!providerValueCell || !providerInput || providerInput.readOnly !== true || providerInput.value !== CHAT_PROVIDER_OPENAI) {
      throw new Error(`expected chatProvider Value cell to render derived read-only OpenAI text, got ${JSON.stringify(providerValueCell?.textContent || providerInput?.value || '')}`)
    }
    if (providerValueCell.querySelector('select')) {
      throw new Error('expected chatProvider Value cell to avoid a manual provider dropdown')
    }
    if (providerValueCell.querySelector('button')) {
      throw new Error(`expected chatProvider Value cell to omit duplicate provider preset buttons, got ${JSON.stringify(providerValueCell.textContent || '')}`)
    }
    const modelSelect = findValueCellSelectForRowKey(host.container, 'chatModel')
    if (!modelSelect) {
      throw new Error('expected chatModel Value cell to own provider selection through the model dropdown')
    }

    const valueSetter = Object.getOwnPropertyDescriptor(host.dom.window.HTMLSelectElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('expected DOM select value setter')
    await act(async () => {
      valueSetter.call(modelSelect, CHAT_QWEN_MODEL_OPTIONS[0])
      Simulate.change(modelSelect)
      await waitForFrames()
    })

    const rerenderedRows = Array.from(host.container.querySelectorAll('dl')) as HTMLElement[]
    const rerenderedProviderRow = rerenderedRows.find(row => row.children[0]?.textContent?.trim() === 'chatProvider')
    const rerenderedProviderInput = rerenderedProviderRow?.querySelector('input') as HTMLInputElement | null
    if (rerenderedProviderInput?.value !== CHAT_PROVIDER_QWEN) {
      throw new Error(`expected chatProvider Value to derive ${JSON.stringify(CHAT_PROVIDER_QWEN)} from chatModel, got ${JSON.stringify(rerenderedProviderInput?.value)}`)
    }
  } finally {
    await host.restore()
  }
}

export async function testMainPanelRequestedIntegrationsChatModelValueCellUsesVisibleModelDropdown() {
  const host = createMainPanelHost()

  try {
    await renderRequestedIntegrationsSearch(host.root, 'chatModel')

    const modelSelect = findValueCellSelectForRowKey(host.container, 'chatModel')
    if (!modelSelect) {
      throw new Error('expected chatModel Value cell to render a visible model dropdown')
    }
    if (modelSelect.closest('dl')?.querySelector('input[list="settings-chat-model-options"]')) {
      throw new Error('expected chatModel Value cell to avoid plain datalist-only text input')
    }
    ;[
      CHAT_OPENAI_MODEL_OPTIONS[0],
      CHAT_MIROMIND_MODEL_OPTIONS[0],
      CHAT_AGNES_MODEL_OPTIONS[0],
      CHAT_QWEN_MODEL_OPTIONS[0],
      CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0],
    ].forEach(value => {
      if (!Array.from(modelSelect.options).some(option => option.value === value)) {
        throw new Error(`expected chatModel dropdown to include shared model option ${JSON.stringify(value)}`)
      }
    })
  } finally {
    await host.restore()
  }
}

export async function testMainPanelRequestedIntegrationsProviderModelRowsRejectKnownCrossProviderLeak() {
  const leakedOpenAiModel: string = CHAT_OPENAI_MODEL_OPTIONS[0]
  const cases = [
    {
      query: 'miromindApi.model',
      rowKey: 'miromindApi.model',
      expectedModel: CHAT_MIROMIND_MODEL_OPTIONS[0],
    },
    {
      query: 'agnesApi.model',
      rowKey: 'agnesApi.model',
      expectedModel: CHAT_AGNES_MODEL_OPTIONS[0],
    },
    {
      query: 'qwenApi.model',
      rowKey: 'qwenApi.model',
      expectedModel: CHAT_QWEN_MODEL_OPTIONS[0],
    },
    {
      query: 'googleCloudApi.model',
      rowKey: 'googleCloudApi.model',
      expectedModel: CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0],
    },
  ] as const

  for (const testCase of cases) {
    const host = createMainPanelHost()

    try {
      const graphState = useGraphStore.getState()
      graphState.setChatProvider(CHAT_PROVIDER_OPENAI)
      graphState.setChatModel(leakedOpenAiModel)
      const storedModel = useGraphStore.getState().chatModel
      if (storedModel !== leakedOpenAiModel) {
        throw new Error(`expected global chatModel setter to keep model-selected OpenAI value, got ${JSON.stringify(storedModel)}`)
      }

      await renderRequestedIntegrationsSearch(host.root, testCase.query)

      const modelSelect = findValueCellSelectForRowKey(host.container, testCase.rowKey)
      if (!modelSelect) {
        throw new Error(`expected ${testCase.rowKey} Value cell to render a configurable model dropdown`)
      }
      if (!Array.from(modelSelect.options).some(option => option.value === testCase.expectedModel)) {
        throw new Error(`expected ${testCase.rowKey} model dropdown to include ${JSON.stringify(testCase.expectedModel)}`)
      }
      if (modelSelect.value !== testCase.expectedModel) {
        throw new Error(`expected ${testCase.rowKey} to render ${JSON.stringify(testCase.expectedModel)} instead of leaked OpenAI model, got ${JSON.stringify(modelSelect.value)}`)
      }
      if (modelSelect.value === leakedOpenAiModel) {
        throw new Error(`expected ${testCase.rowKey} to avoid leaking ${JSON.stringify(leakedOpenAiModel)}`)
      }
    } finally {
      await host.restore()
    }
  }
}

export async function testMainPanelRequestedIntegrationsMappedDropdownKeepsUserSelection() {
  const host = createMainPanelHost()

  try {
    await renderRequestedIntegrationsSearch(host.root, 'qwenApi.endpoint_url')

    const endpointSelect = Array.from(host.container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>)
      .find(select => Array.from(select.options).some(option => option.value === CHAT_QWEN_ENDPOINT_OPTIONS[1]))
    if (!endpointSelect) {
      throw new Error('expected Qwen endpoint_url Value cell to render a configurable dropdown')
    }
    const nextEndpoint = CHAT_QWEN_ENDPOINT_OPTIONS[1]
    const valueSetter = Object.getOwnPropertyDescriptor(host.dom.window.HTMLSelectElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('expected DOM select value setter')
    await act(async () => {
      valueSetter.call(endpointSelect, nextEndpoint)
      Simulate.change(endpointSelect)
      await waitForFrames()
    })

    const row = endpointSelect.closest('dl')
    if (!row) {
      throw new Error('expected Qwen endpoint dropdown to live inside a key/type/value row')
    }
    await act(async () => {
      row.dispatchEvent(new host.dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames()
    })

    const rerenderedEndpointSelect = Array.from(host.container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>)
      .find(select => Array.from(select.options).some(option => option.value === CHAT_QWEN_ENDPOINT_OPTIONS[1]))
    if (rerenderedEndpointSelect?.value !== nextEndpoint) {
      throw new Error(`expected mapped Qwen endpoint dropdown to keep edited value, got ${JSON.stringify(rerenderedEndpointSelect?.value)}`)
    }
  } finally {
    await host.restore()
  }
}

export async function testMainPanelRequestedIntegrationsMappedChatModelKeepsUserSelection() {
  const host = createMainPanelHost()

  try {
    await renderRequestedIntegrationsSearch(host.root, 'qwenApi.model')

    const modelSelect = findValueCellSelectForRowKey(host.container, 'qwenApi.model')
    if (!modelSelect) {
      throw new Error('expected Qwen model Value cell to render a configurable chatModel dropdown')
    }
    const nextModel = CHAT_QWEN_MODEL_OPTIONS[2]
    const valueSetter = Object.getOwnPropertyDescriptor(host.dom.window.HTMLSelectElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('expected DOM select value setter')
    await act(async () => {
      valueSetter.call(modelSelect, nextModel)
      Simulate.change(modelSelect)
      await waitForFrames()
    })

    const row = modelSelect.closest('dl')
    if (!row) {
      throw new Error('expected Qwen model dropdown to live inside a key/type/value row')
    }
    await act(async () => {
      row.dispatchEvent(new host.dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames()
    })

    const rerenderedModelSelect = findValueCellSelectForRowKey(host.container, 'qwenApi.model')
    if (rerenderedModelSelect?.value !== nextModel) {
      throw new Error(`expected mapped Qwen chatModel dropdown to keep edited value, got ${JSON.stringify(rerenderedModelSelect?.value)}`)
    }
  } finally {
    await host.restore()
  }
}

export async function testMainPanelChatSettingsCommitOneRouteUsedByFloatingPanel() {
  const host = createMainPanelHost()
  const floatingContainer = host.dom.window.document.createElement('section')
  host.dom.window.document.body.appendChild(floatingContainer)
  const floatingRoot = createRoot(floatingContainer as unknown as HTMLElement)
  const modelValueSetter = Object.getOwnPropertyDescriptor(host.dom.window.HTMLSelectElement.prototype, 'value')?.set
  const inputValueSetter = Object.getOwnPropertyDescriptor(host.dom.window.HTMLInputElement.prototype, 'value')?.set

  if (!modelValueSetter || !inputValueSetter) {
    throw new Error('expected native control value setters')
  }

  try {
    await mountReactRoot(floatingRoot, React.createElement(FloatingPanelChat), { window: host.dom.window as unknown as Window, frames: 2 })
    await renderRequestedIntegrationsSearch(host.root, 'chatModel')

    const nextModel = CHAT_BYTEPLUS_MODEL_OPTIONS.find(model => model === 'seed-2-0-pro-260328') || CHAT_BYTEPLUS_MODEL_OPTIONS[0]
    if (!nextModel) throw new Error('expected a BytePlus model option for the settings route regression')
    const modelSelect = findValueCellSelectForRowKey(host.container, 'chatModel')
    if (!modelSelect) throw new Error('expected MainPanel chatModel Value cell')

    const routes: Array<{ provider: string; endpointUrl: string | null; model: string | null }> = []
    const unsubscribe = useGraphStore.subscribe(state => {
      routes.push({
        provider: state.chatProvider,
        endpointUrl: state.chatEndpointUrl,
        model: state.chatModel,
      })
    })
    try {
      await act(async () => {
        modelValueSetter.call(modelSelect, nextModel)
        Simulate.change(modelSelect)
        await waitForFrames(3)
      })
    } finally {
      unsubscribe()
    }

    const chatState = useGraphStore.getState()
    if (
      routes.length !== 1
      || routes[0]?.provider !== chatState.chatProvider
      || routes[0]?.endpointUrl !== chatState.chatEndpointUrl
      || routes[0]?.model !== chatState.chatModel
    ) {
      throw new Error(`expected MainPanel chatModel to commit one complete provider route, got ${JSON.stringify(routes)}`)
    }
    if (chatState.chatProvider !== CHAT_PROVIDER_BYTEPLUS || chatState.chatModel !== nextModel) {
      throw new Error(`expected MainPanel chatModel to select BytePlus ${JSON.stringify(nextModel)}, got ${JSON.stringify(chatState)}`)
    }

    const floatingModelSelect = floatingContainer.querySelector<HTMLSelectElement>('[data-kg-chat-model-select="true"]')
    if (floatingModelSelect?.value !== nextModel) {
      throw new Error(`expected FloatingPanel model to follow MainPanel settings, got ${JSON.stringify(floatingModelSelect?.value)}`)
    }

    await renderRequestedIntegrationsSearch(host.root, 'byteplus.auth_mode')
    const authModeSelect = findValueCellSelectForRowKey(host.container, 'byteplus.auth_mode')
    if (!authModeSelect) throw new Error('expected BytePlus auth_mode Value cell')
    await act(async () => {
      modelValueSetter.call(authModeSelect, 'byok')
      Simulate.change(authModeSelect)
      await waitForFrames(2)
    })
    if (useGraphStore.getState().chatAuthMode !== 'byok') {
      throw new Error('expected BytePlus auth_mode Value cell to enable BYOK')
    }

    await renderRequestedIntegrationsSearch(host.root, 'byteplus.api_key')
    const apiKeyInput = findValueCellInputForRowKey(host.container, 'byteplus.api_key')
    if (!apiKeyInput || apiKeyInput.readOnly) throw new Error('expected BytePlus api_key Value cell to be editable in BYOK mode')
    await act(async () => {
      inputValueSetter.call(apiKeyInput, 'ephemeral-settings-test-key')
      Simulate.change(apiKeyInput)
      await waitForFrames(2)
    })
    if (useGraphStore.getState().chatApiKey !== 'ephemeral-settings-test-key') {
      throw new Error('expected BytePlus api_key Value cell to update the shared chat credential')
    }

    await renderRequestedIntegrationsSearch(host.root, 'byteplus.endpoint_url')
    const endpointInput = findValueCellInputForRowKey(host.container, 'byteplus.endpoint_url')
    if (!endpointInput || endpointInput.readOnly) throw new Error('expected BytePlus endpoint_url Value cell to be editable')
    await act(async () => {
      inputValueSetter.call(endpointInput, CHAT_BYTEPLUS_EU_WEST_ENDPOINT_URL)
      Simulate.change(endpointInput)
      await waitForFrames(2)
    })
    const finalState = useGraphStore.getState()
    if (finalState.chatEndpointUrl !== CHAT_BYTEPLUS_EU_WEST_ENDPOINT_URL || finalState.chatModel !== nextModel) {
      throw new Error(`expected BytePlus endpoint_url to retain the selected FloatingPanel model, got ${JSON.stringify(finalState)}`)
    }
  } finally {
    await unmountAndFlush(floatingRoot)
    floatingContainer.remove()
    await host.restore()
  }
}

export async function testMainPanelRequestedIntegrationsDropdownValuesStayEditableAndUnduplicated() {
  await testMainPanelRequestedIntegrationsChatProviderValueCellDerivesFromChatModel()
  await testMainPanelRequestedIntegrationsChatModelValueCellUsesVisibleModelDropdown()
  await testMainPanelRequestedIntegrationsProviderModelRowsRejectKnownCrossProviderLeak()
  await testMainPanelRequestedIntegrationsMappedDropdownKeepsUserSelection()
  await testMainPanelRequestedIntegrationsMappedChatModelKeepsUserSelection()
  await testMainPanelChatSettingsCommitOneRouteUsedByFloatingPanel()
}
