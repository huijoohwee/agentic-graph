import React, { act } from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import MainPanel from '@/features/panels/MainPanel'
import IntegrationsHubView from '@/features/panels/views/IntegrationsHubView'
import McpHubView from '@/features/panels/views/McpHubView'
import MapsHubView from '@/features/panels/views/MapsHubView'
import CommerceHubView from '@/features/panels/views/CommerceHubView'
import { FloatingPropsPanel } from '@/features/toolbar/FloatingPropsPanel'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { installMainPanelSectionDescriptionsHarness } from '@/tests/lib/mainPanelSectionDescriptionsHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames as waitForFramesShared, waitForTasks as waitForTasksShared } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { PROPS_PANEL_OPEN_EVENT, FLOATING_PANEL_OPEN_EVENT } from '@/features/canvas/utils'
import { MAIN_PANEL_OPEN_EVENT } from '@/features/panels/utils/useMainPanelRect'
import {
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_AGNES_MODEL_OPTIONS,
  CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
  CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  CHAT_MIROMIND_MODEL_OPTIONS,
  CHAT_QWEN_ENDPOINT_URL,
  CHAT_QWEN_MODEL_OPTIONS,
} from '@/lib/chatEndpoint'
import { MAIN_PANEL_TABS } from '@/features/panels/mainPanelTabs'
import { getMainPanelVirtualSettingStorageKey } from '@/features/panels/mainPanelVirtualSettings'
import { getBytePlusSharedTextApiRowAnchorId } from '@/features/panels/views/byteplusSharedTextApiDocs'
import {
  assertMapsHubOmitsGrabMapsMcpConfig,
  assertMcpHubRendersConfigurableValueControls,
  assertMcpHubSurfacesApiNativeBrowserMcpConfig,
  assertMcpHubSurfacesGrabMapsMcpConfig,
  assertMcpHubSurfacesOpenAiMcpConfig,
  assertMcpHubMaintainsKeyTypeValueHeader,
} from '@/__tests__/helpers/mainPanelMcpExpectations'
const waitForFrames = async (raf: ((cb: (ts: number) => void) => number) | undefined, count = 3) => {
  void raf
  const win = (globalThis as unknown as { window?: Window }).window
  if (!win) throw new Error('expected window for frame flush')
  await waitForFramesShared(win, count)
}
const renderAndFlush = async (
  root: ReturnType<typeof createRoot>,
  node: React.ReactNode,
  raf: ((cb: (ts: number) => void) => number) | undefined,
  frameCount = 3,
) => {
  void raf
  const win = (globalThis as unknown as { window?: Window }).window
  if (!win) throw new Error('expected window for root render flush')
  await mountReactRoot(root, node as React.ReactElement, { window: win, frames: frameCount })
}
const unmountAndFlush = async (root: ReturnType<typeof createRoot> | null) => {
  if (!root) return
  const win = (globalThis as unknown as { window?: Window }).window
  await unmountReactRoot(root, win ? { window: win } : undefined)
}
const getSelectOptionValues = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map(option => option.value).filter(Boolean)
const findModelSelectsWithOption = (container: Element, optionValue: string): HTMLSelectElement[] => (
  Array.from(container.querySelectorAll('select')) as HTMLSelectElement[]
).filter(select => getSelectOptionValues(select).includes(optionValue))

const hasSelectOption = (container: Element, optionValue: string): boolean =>
  (Array.from(container.querySelectorAll('select')) as HTMLSelectElement[])
    .some(select => getSelectOptionValues(select).includes(optionValue))

const findKtvRow = (container: Element, key: string): HTMLElement | undefined =>
  (Array.from(container.querySelectorAll('dl')) as HTMLElement[])
    .find(row => String(row.children[0]?.textContent || '').trim() === key)

const requireKtvValueCell = (container: Element, key: string): HTMLElement => {
  const row = findKtvRow(container, key)
  if (!row) {
    throw new Error(`expected ${key} KTV row, got ${JSON.stringify(container.textContent || '')}`)
  }
  const valueCell = row.children[2] as HTMLElement | undefined
  if (!valueCell) {
    throw new Error(`expected ${key} row to have a Value cell`)
  }
  return valueCell
}

export async function testIntegrationsHubReusesSettingsEntryList() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setChatProvider('lmstudio-local')
    api.setChatModel('qwen/qwen3.5-9b@q4_k_m')
    api.setChatEndpointUrl('/__chat_proxy/v1/chat/completions')
    api.setIntegrationConfigsJson(JSON.stringify({
      aiChat: { enabled: false, provider: 'native', openTab: 'chat' },
      simulationCommands: {
        enabled: true,
        commandPrefix: '/simulate',
        defaultPlatform: 'parallel',
        defaultSimulationId: 'sim_demo',
      },
    }))

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(IntegrationsHubView), anyWindow.requestAnimationFrame, 3)
    const text = container.textContent || ''
    const expectedTokens = [
      'Key',
      'Type',
      'Value',
      'Chat',
      'Open FloatingPanel Chat UI',
      'chatProvider',
      'chatModel',
      'chatContextScope',
      'integrationConfigsJson',
      'BytePlus Shared + Text API',
      'Open FloatingPanel Props Panel Widget Card',
      'byteplusApi.provider',
      'byteplus.auth_mode',
      'byteplus.endpoint_url',
      'byteplus.api_key',
      'byteplusApi.model',
      'byteplusApi.messages',
      'byteplusApi.response_format.type',
      'byteplusApi.tool_choice',
      'OpenAI Chat API',
      'Open FloatingPanel Props Panel Widget Card',
      'openaiApi.provider',
      'openaiApi.endpoint_url',
      'openaiApi.model',
      'openaiApi.input',
      'openaiApi.text',
      'openaiApi.tool_choice',
      'OpenAI Images API',
      'Open FloatingPanel Props Panel OpenAI Image Widget',
      'openaiImageApi.model',
      'openaiImageApi.prompt',
      'openaiImageApi.size',
      'openaiImageApi.output_format',
      'DeerFlow Gateway API',
      'Open FloatingPanel Props Panel Widget Card',
      'deerflowApi.provider',
      'deerflowApi.endpoint_url',
      'deerflowApi.model',
      'deerflowApi.input',
      'MiroMind API',
      'Open FloatingPanel Chat UI (MiroMind)',
      'miromindApi.provider',
      'miromindApi.auth_mode',
      'miromindApi.endpoint_url',
      'miromindApi.model',
      'miromindApi.mcp_servers',
      'miromindApi.streaming.reasoning_steps',
      'Agnes AI API',
      'Open FloatingPanel Chat UI (Agnes)',
      'agnesApi.provider',
      'agnesApi.auth_mode',
      'agnesApi.endpoint_url',
      'agnesApi.model',
      'agnesApi.streaming.json_chunks',
      'agnesApi.output_contract',
      'Qwen API',
      'Open FloatingPanel Chat UI (Qwen)',
      'qwenApi.provider',
      'qwenApi.auth_mode',
      'qwenApi.endpoint_url',
      'qwenApi.model',
      'qwenApi.messages',
      'qwenApi.output_contract',
      'Google Cloud Vertex AI API',
      'Open FloatingPanel Chat UI (Google Cloud)',
      'googleCloudApi.provider',
      'googleCloudApi.project_id',
      'googleCloudApi.location',
      'googleCloudApi.endpoint_url',
      'googleCloudApi.model',
      'googleCloudApi.output_contract',
      'BytePlus Video Generation API',
      'Open FloatingPanel BytePlus Video Widget',
      'BytePlus Image Generation API',
      'Open FloatingPanel BytePlus Image Widget',
    ]
    expectedTokens.forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected integrations hub settings surface to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    if (text.includes('Global Reset')) {
      throw new Error('expected integrations hub reuse to omit global reset section')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testIntegrationsHubSectionLinksOpenFloatingPanels() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(IntegrationsHubView), anyWindow.requestAnimationFrame, 3)

    const floatingPanelEvents: Array<string> = []
    const propsPanelEvents: Array<string> = []
    const eventWindow = globalThis.window as Window & typeof globalThis
    const originalDispatchEvent = eventWindow.dispatchEvent.bind(eventWindow)
    eventWindow.dispatchEvent = ((event: Event) => {
      if (event.type === FLOATING_PANEL_OPEN_EVENT) {
        const custom = event as CustomEvent<{ tab?: string }>
        floatingPanelEvents.push(String(custom.detail?.tab || ''))
      }
      if (event.type === PROPS_PANEL_OPEN_EVENT) {
        propsPanelEvents.push('propsPanel')
      }
      return originalDispatchEvent(event)
    }) as typeof eventWindow.dispatchEvent
    const clickButton = async (label: string) => {
      const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
      const button = buttons.find(node => Boolean(node.textContent?.includes(label)))
      if (!button) throw new Error(`expected integrations section button ${JSON.stringify(label)}`)
      await act(async () => {
        button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        await waitForFrames(anyWindow.requestAnimationFrame, 1)
      })
    }

    await clickButton('Open FloatingPanel Chat UI')
    await clickButton('Open FloatingPanel Chat UI (Agnes)')
    for (let index = 0; index < 2; index += 1) await clickButton('Open FloatingPanel Props Panel Widget Card')
    await clickButton('Open FloatingPanel Props Panel OpenAI Image Widget')
    await clickButton('Open FloatingPanel Props Panel Widget Card')
    await clickButton('Open FloatingPanel BytePlus Video Widget')
    await clickButton('Open FloatingPanel BytePlus Image Widget')

    if (floatingPanelEvents.filter(value => value === 'chat').length !== 2) {
      throw new Error(`expected chat section links to open floating chat twice, got ${JSON.stringify(floatingPanelEvents)}`)
    }
    if (propsPanelEvents.length !== 6) {
      throw new Error(`expected text/openai-chat/openai-images/deerflow/video/image section links to open floating props panel six times, got ${JSON.stringify(propsPanelEvents)}`)
    }
    eventWindow.dispatchEvent = originalDispatchEvent
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelIntegrationsDefaultsToServerManagedAndMemoryOnlyByok() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplus',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const authValueCell = requireKtvValueCell(container, 'byteplus.auth_mode')
    const authSelect = authValueCell.querySelector('select') as HTMLSelectElement | null
    if (!authSelect) {
      throw new Error(`expected byteplus.auth_mode to render an auth select, got ${JSON.stringify(authValueCell.textContent || '')}`)
    }
    const authOptions = getSelectOptionValues(authSelect)
    if (authSelect.value !== 'serverManaged' || authOptions[0] !== 'serverManaged' || authOptions[1] !== 'byok') {
      throw new Error(`expected serverManaged default before explicit BYOK fallback, got ${JSON.stringify({ value: authSelect.value, authOptions })}`)
    }

    const apiKeyValueCell = requireKtvValueCell(container, 'byteplus.api_key')
    const serverManagedInput = apiKeyValueCell.querySelector('input') as HTMLInputElement | null
    if (!serverManagedInput || serverManagedInput.type === 'password' || serverManagedInput.placeholder !== 'Server-managed Key') {
      throw new Error(`expected byteplus.api_key to render a server-managed placeholder by default, got ${JSON.stringify(apiKeyValueCell.textContent || '')}`)
    }
    if (useGraphStore.getState().chatAuthMode !== 'serverManaged' || useGraphStore.getState().chatApiKey !== '') {
      throw new Error(`expected initial chat auth to use serverManaged without a browser key, got ${JSON.stringify({
        chatAuthMode: useGraphStore.getState().chatAuthMode,
        hasKey: Boolean(useGraphStore.getState().chatApiKey),
      })}`)
    }

    const selectValueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')?.set
    if (!selectValueSetter) throw new Error('expected DOM select value setter')
    await act(async () => {
      selectValueSetter.call(authSelect, 'byok')
      Simulate.change(authSelect)
      await waitForFrames(anyWindow.requestAnimationFrame, 2)
    })

    const byokValueCell = requireKtvValueCell(container, 'byteplus.api_key')
    const byokInput = byokValueCell.querySelector('input[type="password"]') as HTMLInputElement | null
    if (!byokInput) {
      throw new Error('expected explicit BYOK mode to expose a password input for the memory-only key')
    }

    const inputValueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
    if (!inputValueSetter) throw new Error('expected DOM input value setter')
    await act(async () => {
      inputValueSetter.call(byokInput, 'sk-panel-memory-only')
      Simulate.change(byokInput)
      await waitForFrames(anyWindow.requestAnimationFrame, 2)
    })

    const storedValues = Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index) || ''
      return `${key}=${storage.getItem(key) || ''}`
    }).join('\n')
    if (storedValues.includes('sk-panel-memory-only')) {
      throw new Error(`expected MainPanel BYOK key to stay out of browser storage, got ${storedValues}`)
    }
    if (useGraphStore.getState().chatAuthMode !== 'byok' || useGraphStore.getState().chatApiKey !== 'sk-panel-memory-only') {
      throw new Error(`expected explicit BYOK to hold only the live store key, got ${JSON.stringify({
        chatAuthMode: useGraphStore.getState().chatAuthMode,
        chatApiKey: useGraphStore.getState().chatApiKey,
      })}`)
    }

    const nextAuthSelect = requireKtvValueCell(container, 'byteplus.auth_mode').querySelector('select') as HTMLSelectElement | null
    if (!nextAuthSelect) throw new Error('expected auth select to remain rendered after BYOK change')
    await act(async () => {
      selectValueSetter.call(nextAuthSelect, 'serverManaged')
      Simulate.change(nextAuthSelect)
      await waitForFrames(anyWindow.requestAnimationFrame, 2)
    })
    if (useGraphStore.getState().chatAuthMode !== 'serverManaged' || useGraphStore.getState().chatApiKey !== '') {
      throw new Error('expected returning to serverManaged to clear the memory-only BYOK key')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedSettingsSearchExcludesIntegrationEntries() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'settings',
        requestedSearchQuery: 'chat',
      } as never),
      anyWindow.requestAnimationFrame,
      10,
    )

    const text = container.textContent || ''
    if (text.includes('chatContextScope')) {
      throw new Error(`expected settings search to exclude chatContextScope, got ${JSON.stringify(text)}`)
    }
    if (text.includes('integrationConfigsJson')) {
      throw new Error(`expected settings search to exclude integrationConfigsJson, got ${JSON.stringify(text)}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsAiControls() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setChatContextScope('hybrid')
    api.setIntegrationConfigsJson(
      JSON.stringify({
        aiChat: { enabled: true, provider: 'native', openTab: 'chat' },
        simulationCommands: {
          enabled: true,
          commandPrefix: '/simulate',
          defaultPlatform: 'parallel',
          defaultSimulationId: 'sim_demo',
        },
      }),
    )

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'chat',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    const integrationsScrollHost = container.querySelector('[aria-label="Main Panel Content"]') as HTMLElement | null
    if (!integrationsScrollHost) {
      throw new Error('expected integrations tab to reuse MainPanelBody scroll host')
    }
    if (!integrationsScrollHost.className.includes('overflow-auto')) {
      throw new Error(`expected integrations scroll host to be overflow-auto, got ${JSON.stringify(integrationsScrollHost.className)}`)
    }
    ;[
      'chatContextScope',
      'integrationConfigsJson',
      'Enable AI Chat',
      'Disable AI Chat',
      'Format JSON',
      'Refresh Models',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected chat settings controls to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const contextRow = (Array.from(container.querySelectorAll('dl')) as HTMLElement[])
      .find(row => String(row.children[0]?.textContent || '').trim() === 'chatContextScope')
    if (!contextRow) {
      throw new Error(`expected integrations search to render chatContextScope KTV row, got ${JSON.stringify(text)}`)
    }
    const contextValueCell = contextRow.children[2] as HTMLElement | undefined
    const contextSelect = contextValueCell?.querySelector('select') as HTMLSelectElement | null
    if (!contextValueCell || !contextSelect) {
      throw new Error(`expected chatContextScope Value column to render a dropdown, got ${JSON.stringify(contextRow.textContent || '')}`)
    }
    if (contextSelect.value !== 'hybrid') {
      throw new Error(`expected chatContextScope default dropdown value to be hybrid, got ${JSON.stringify(contextSelect.value)}`)
    }
    const contextOptionLabels = Array.from(contextSelect.options).map(option => String(option.textContent || '').trim())
    ;[
      'Selection + Workspace (Default)',
      'Canvas Selection',
      'Workspace Source Files',
    ].forEach(label => {
      if (!contextOptionLabels.includes(label)) {
        throw new Error(`expected chatContextScope dropdown to include ${JSON.stringify(label)}, got ${JSON.stringify(contextOptionLabels)}`)
      }
    })
    const legacyActionLabels = (Array.from(contextRow.querySelectorAll('button')) as HTMLButtonElement[])
      .map(button => String(button.textContent || '').trim())
      .filter(label => label === 'Selection' || label === 'Workspace' || label === 'Hybrid')
    if (legacyActionLabels.length > 0) {
      throw new Error(`expected chatContextScope row to omit duplicate legacy action buttons, got ${JSON.stringify(legacyActionLabels)}`)
    }
    const integrationConfigsRow = (Array.from(container.querySelectorAll('dl')) as HTMLElement[])
      .find(row => String(row.children[0]?.textContent || '').trim() === 'integrationConfigsJson')
    if (!integrationConfigsRow) {
      throw new Error(`expected integrations search to render integrationConfigsJson KTV row, got ${JSON.stringify(text)}`)
    }
    if (integrationConfigsRow.children.length !== 3) {
      throw new Error(`expected integrationConfigsJson to stay one Key/Type/Value row, got ${integrationConfigsRow.children.length} cells`)
    }
    const integrationConfigsValueCell = integrationConfigsRow.children[2] as HTMLElement | undefined
    const integrationConfigsInput = integrationConfigsValueCell?.querySelector('input') as HTMLInputElement | null
    if (!integrationConfigsValueCell || !integrationConfigsInput) {
      throw new Error(`expected integrationConfigsJson Value cell to render one-line input, got ${JSON.stringify(integrationConfigsRow.textContent || '')}`)
    }
    if (integrationConfigsValueCell.querySelector('textarea')) {
      throw new Error('expected integrationConfigsJson Value cell to avoid multiline textarea expansion')
    }
    if (!integrationConfigsValueCell.querySelector('.kg-row-scroll')) {
      throw new Error(`expected integrationConfigsJson Value cell to reuse existing horizontal row scrolling, got ${JSON.stringify(integrationConfigsValueCell.getAttribute('class') || '')}`)
    }
    if (String(integrationConfigsInput.value || '').includes('\n')) {
      throw new Error('expected integrationConfigsJson Value input to stay compact without embedded newlines')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchPreservesCustomModelValue() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setChatModel('custom/provider-model')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'chat',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const modelSelects = findModelSelectsWithOption(container, CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT)
    if (modelSelects.length < 2) {
      throw new Error(`expected chat model rows to render visible model dropdowns, got ${modelSelects.length}`)
    }
    const optionValues = new Set(modelSelects.flatMap(select => getSelectOptionValues(select)))
    if (!modelSelects.some(select => select.value === 'custom/provider-model')) {
      throw new Error('expected visible chat model dropdown to preserve custom current model value')
    }
    ;[
      ...CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS,
      CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
    ].forEach(value => {
      if (!optionValues.has(value)) {
        throw new Error(`expected chat model dropdown to include ${value}`)
      }
    })
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsBytePlusImageApiRows() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusImageApi',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;[
      'BytePlus Image Generation API',
      'byteplusImageApi.size',
      'byteplusImageApi.output_format',
      'byteplusImageApi.response_format',
      'byteplusImageApi.optimize_prompt_options',
      'byteplusImageApi.aspect_ratio',
      'byteplusImageApi.stream',
      'byteplusImageApi.watermark',
      'byteplusImageApi.seed',
      'byteplusImageApi.guidance_scale',
      'Open FloatingPanel BytePlus Image Widget',
      'seedream-4-0-250828',
      'seedream-4-5-251128',
      'seedream-5-0-260128',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected BytePlus image integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    if (text.includes('seedream-5-0-lite-250817')) {
      throw new Error('expected stale Seedream 5.0 Lite image model id to be removed from integrations image API rows')
    }
    if (text.includes('Uses shared BytePlus auth_mode and api_key from BytePlus Shared + Text API.')) {
      throw new Error('expected BytePlus image row values to avoid section description prose in the KTV value slot')
    }
    if (text.includes('byteplusImageApi.auth_mode') || text.includes('byteplusImageApi.api_key')) {
      throw new Error('expected BytePlus image integrations search to reuse shared BytePlus auth rows instead of image-owned auth/api-key rows')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchKeepsBytePlusProviderReadonly() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setChatProvider('openai')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusApi.provider',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;['BytePlus Shared + Text API', 'byteplusApi.provider', 'byteplus-modelark'].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected BytePlus provider row search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const select = container.querySelector('select')
    if (select) {
      throw new Error('expected BytePlus provider row to stop reusing the global chatProvider dropdown')
    }
    if (text.includes('openai') && !text.includes('byteplus-modelark')) {
      throw new Error('expected BytePlus provider row to avoid leaking the active global provider value')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchBytePlusImageFieldUsesConfigurableValueSlot() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusImageApi.image',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    if (!text.includes('byteplusImageApi.image')) {
      throw new Error(`expected BytePlus image request field row in integrations search, got ${JSON.stringify(text)}`)
    }
    if (text.includes('Optional. Reference image URL or Base64 payload.')) {
      throw new Error('expected BytePlus image request field value cell to stop rendering descriptive prose')
    }
    const editors = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[]
    if (editors.length !== 1) {
      throw new Error(`expected BytePlus image request field row to render one configurable text input, got ${editors.length}`)
    }
    if (editors[0]?.value !== '') {
      throw new Error(`expected BytePlus image request field input to default to an empty configurable slot, got ${JSON.stringify(editors[0]?.value)}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchDropsProseVirtualValueDefaults() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusImageApi.prompt',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    let text = container.textContent || ''
    if (!text.includes('byteplusImageApi.prompt')) {
      throw new Error(`expected BytePlus prompt row in integrations search, got ${JSON.stringify(text)}`)
    }
    if (text.includes('Required. Image generation prompt text.')) {
      throw new Error('expected BytePlus prompt Value cell to avoid hardcoded explanatory text')
    }
    let textEditors = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[]
    let bytePlusPromptInput = textEditors.find(input => input.value === '')
    if (!bytePlusPromptInput) {
      throw new Error(`expected BytePlus prompt row to render an empty configurable input, got ${textEditors.map(input => input.value).join(' | ')}`)
    }

  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchBytePlusVideoCameraFixedUsesEditableValueSlot() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusVideoApi.camera_fixed',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const rows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
    const cameraFixedRow = rows.find(row => row.children[0]?.textContent?.includes('byteplusVideoApi.camera_fixed'))
    if (!cameraFixedRow) {
      throw new Error(`expected BytePlus camera_fixed row in integrations search, got ${JSON.stringify(container.textContent || '')}`)
    }
    const valueCell = cameraFixedRow.children[2] as HTMLElement | undefined
    if (!valueCell) {
      throw new Error('expected BytePlus camera_fixed row to have a Value cell')
    }
    if (valueCell.textContent?.includes('Uses shared BytePlus auth_mode and api_key from BytePlus Shared + Text API.')) {
      throw new Error('expected BytePlus camera_fixed Value cell to avoid section description prose')
    }
    const editors = Array.from(valueCell.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[]
    if (editors.length !== 1) {
      throw new Error(`expected BytePlus camera_fixed row to render one editable checkbox, got ${editors.length}`)
    }
    if (editors[0]?.checked !== false) {
      throw new Error(`expected BytePlus camera_fixed editable checkbox to default false, got ${String(editors[0]?.checked)}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsValueInputAcceptsTyping() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusImageApi.image',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="text"]')
    if (!input) {
      throw new Error('expected integrations value column to render a text input')
    }

    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('expected DOM input value setter')
    await act(async () => {
      valueSetter.call(input, 'Value')
      Simulate.change(input)
      await waitForFrames(anyWindow.requestAnimationFrame, 1)
    })

    const row = input.closest('dl')
    if (!row) {
      throw new Error('expected integrations value input to live inside a key/type/value row')
    }

    await act(async () => {
      row.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(anyWindow.requestAnimationFrame, 1)
    })

    const rerenderedInput = container.querySelector<HTMLInputElement>('input[type="text"]')
    if (rerenderedInput?.value !== 'Value') {
      throw new Error(`expected integrations value input to keep typed text across rerender, got ${JSON.stringify(rerenderedInput?.value)}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testIntegrationsHubSurfacesGrabMapsTravelVideoCopy() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  const restoreSectionDescriptions = installMainPanelSectionDescriptionsHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(IntegrationsHubView), anyWindow.requestAnimationFrame, 4)
    await act(async () => { await waitForTasksShared(4); await waitForFrames(anyWindow.requestAnimationFrame, 2) })

    const text = container.textContent || ''
    ;[
      'Travel-planning video prompts can reuse GrabMaps-selected geojson plus MainPanel Maps place-search context, while MainPanel MCP keeps backend/system/API/MCP config.',
      'Output stays on the shared widget -> edge -> Rich Media Panel pipeline for inline video rendering.',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected integrations hub to surface GrabMaps-aware video guidance ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
    restoreSectionDescriptions()
  }
}

export async function testMapsHubSurfacesGrabMapsSearchDiscoveryCopy() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(MapsHubView), anyWindow.requestAnimationFrame, 4)

    const text = container.textContent || ''
    ;[
      'Style loading uses Bearer auth against https://maps.grab.com/api/style.json.',
      'Directions default to lng,lat coordinate order unless lat_first is enabled.',
      'Use overview=full when you need route geometry suitable for animation or media prompts.',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected maps hub to retain backend/system/API GrabMaps guidance ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    assertMapsHubOmitsGrabMapsMcpConfig(text)
    if (text.includes('Global Reset')) {
      throw new Error('expected maps hub to omit global reset section')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMcpHubKtvHeaderMaintainsKeyTypeValue() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(McpHubView), anyWindow.requestAnimationFrame, 4)

    assertMcpHubMaintainsKeyTypeValueHeader(container)
    assertMcpHubRendersConfigurableValueControls(container)
    assertMcpHubSurfacesOpenAiMcpConfig(container)
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMcpHubSurfacesGrabMapsMcpServerConfig() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(McpHubView), anyWindow.requestAnimationFrame, 4)

    const text = container.textContent || ''
    const formValues = Array.from(container.querySelectorAll('input, textarea, select'))
      .map(el => (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
      .join('\n')
    const searchableText = `${text}\n${formValues}`
    assertMcpHubSurfacesGrabMapsMcpConfig(container)
    ;[
      'MiroMind MCP',
      'Open MiroMind MCP Docs',
      'miromindMcp.request_field',
      'mcp_servers',
      'miromindMcp.boundary',
      'markdown YAML frontmatter',
    ].forEach(token => {
      if (!searchableText.includes(token)) {
        throw new Error(`expected MCP hub settings surface to include ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
      }
    })
    if (text.includes('Global Reset')) {
      throw new Error('expected MCP hub to omit global reset section')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMcpHubSurfacesApiNativeBrowserMcpConfig() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(McpHubView), anyWindow.requestAnimationFrame, 4)

    assertMcpHubSurfacesApiNativeBrowserMcpConfig(container)
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export function testAgenticGraphMcpServerExposesApiNativeBrowserBridge() {
  const serverText = fs.readFileSync(path.resolve(process.cwd(), '..', 'mcp', 'server.js'), 'utf8')
  const localToolContractText = fs.readFileSync(path.resolve(process.cwd(), '..', 'mcp', 'local-tool-contract.js'), 'utf8')
  const runtimeText = fs.readFileSync(path.resolve(process.cwd(), '..', 'mcp', 'browser-api-runtime.js'), 'utf8')
  const nativeText = fs.readFileSync(path.resolve(process.cwd(), '..', 'mcp', 'browser-api-native-operations.js'), 'utf8')
  ;[
    'buildAgenticGraphLocalMcpToolDefinitions',
    'AGENTIC_OS_LOCAL_MCP_TOOL_NAMES',
    'callBrowserApiRuntime',
  ].forEach(token => {
    if (!serverText.includes(token)) {
      throw new Error(`expected agentic-graph MCP server to expose browser bridge token ${JSON.stringify(token)}`)
    }
  })
  ;[
    'BROWSER_API_TOOL',
    'SHARED_AGENTIC_OS_LOCAL_MCP_TOOL_NAMES',
    'export const AGENTIC_OS_LOCAL_MCP_TOOL_NAMES = SHARED_AGENTIC_OS_LOCAL_MCP_TOOL_NAMES',
  ].forEach(token => {
    if (!localToolContractText.includes(token)) {
      throw new Error(`expected agentic-graph local MCP tool contract to expose browser bridge token ${JSON.stringify(token)}`)
    }
  })
  ;[
    'agentic-graph.browser_api.run',
    'AGENTIC_OS_BROWSER_API_RUNTIME_URL',
    'AGENTIC_OS_BROWSER_API_ALLOW_REMOTE_RUNTIME',
    'API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL',
    'cookieImport',
    'confirmCookieImport',
    'runtimePath',
    '/v1/search',
    '/v1/search/domain',
    '/v1/intent/resolve',
    '/v1/auth/login',
    '/v1/auth/steal',
    '/v1/skills',
    '/v1/skills/${encodeURIComponent(requiredSkillId)}/execute',
    '/v1/skills/${encodeURIComponent(requiredSkillId)}/verify',
    '/v1/skills/${encodeURIComponent(requiredSkillId)}/issues',
    '/v1/feedback',
    '/v1/stats/summary',
    'dry_run',
    'confirm_unsafe',
    'confirm_third_party_terms',
    'confirm_cookie_import',
  ].forEach(token => {
    if (!runtimeText.includes(token)) {
      throw new Error(`expected agentic-graph MCP browser bridge to expose ${JSON.stringify(token)}`)
    }
  })
  const retiredCookieImportName = ['auth', 'Steal'].join('')
  if (runtimeText.includes(retiredCookieImportName)) {
    throw new Error('expected agentic-graph MCP browser bridge to expose cookieImport instead of the retired cookie import operation name')
  }
  ;[
    'go',
    'snap',
    'click',
    'fill',
    'screenshot',
    'markdown',
    'cookies',
    'eval',
    'sync',
    'sessions',
    'nativeBrowserPathForOperation',
    '/v1/browser/${encodeURIComponent(operation)}',
    '/v1/sessions',
  ].forEach(token => {
    if (!nativeText.includes(token)) {
      throw new Error(`expected agentic-graph MCP native browser bridge module to expose ${JSON.stringify(token)}`)
    }
  })
}

export async function testCommerceHubOmitsGlobalResetSection() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(CommerceHubView), anyWindow.requestAnimationFrame, 4)

    const text = container.textContent || ''
    ;['Key', 'Type', 'Value'].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected commerce hub settings surface to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    if (text.includes('Global Reset')) {
      throw new Error('expected commerce hub to omit global reset section')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelTabsPlaceMcpImmediatelyAfterIntegrations() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, { requestedTab: 'mcp' } as never),
      anyWindow.requestAnimationFrame,
      8,
    )

    const tabKeys = MAIN_PANEL_TABS.map(tab => tab.key)
    const integrationsIndex = tabKeys.indexOf('integrations')
    const mcpIndex = tabKeys.indexOf('mcp')
    if (integrationsIndex < 0 || mcpIndex < 0) {
      throw new Error(`expected tab keys to include integrations and mcp, got ${JSON.stringify(tabKeys)}`)
    }
    if (mcpIndex !== integrationsIndex + 1) {
      throw new Error(`expected MCP tab key to be immediately right of Integrations, got ${JSON.stringify(tabKeys)}`)
    }

    const mcpPanel = container.querySelector('#main-panel-mcp-panel')
    const integrationsPanel = container.querySelector('#main-panel-integrations-panel')
    if (!mcpPanel || mcpPanel.hasAttribute('hidden')) {
      throw new Error('expected requested mcp tab to render visible mcp panel')
    }
    if (!integrationsPanel || !integrationsPanel.hasAttribute('hidden')) {
      throw new Error('expected integrations panel to remain hidden while mcp tab is active')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testPropsPanelPaletteOmitsGrabMapsDiscoveryWidgetCopy() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(FloatingPropsPanel), anyWindow.requestAnimationFrame, 4)

    const text = container.textContent || ''
    ;[
      'Widget Card Type 0', 'Probe-Tree Type 1', 'Probe-Tree Type 2', 'Deliverables Widget Card', 'Rich Media Panel',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected props panel widget palette to include canonical palette token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    ;[
      'default/richMediaPanel',
      'default/textGeneration',
      'Discovery Widget',
      'GrabMaps Chat Discovery Widget',
      'grabmaps/grabmaps.discovery',
      'Search Places (Run Discovery)',
      'Open MainPanel Maps',
      'maps.grabmaps.mcp.discovery.chatModel',
      'maps.grabmaps.mcp.searchPlaces.query',
    ].forEach(token => {
      if (text.includes(token)) {
        throw new Error(`expected floating props panel palette cleanup to omit GrabMaps discovery token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testPropsPanelPaletteAvoidsDiscoveryWidgetNetworkSideEffects() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const globalWithFetch = globalThis as typeof globalThis & { fetch?: typeof fetch }
  const previousFetch = globalWithFetch.fetch
  const fetchCalls: Array<{ url: string; authorization: string }> = []

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    globalWithFetch.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : ''
      const headers = (init?.headers || {}) as Record<string, string>
      fetchCalls.push({
        url,
        authorization: String(headers.Authorization || ''),
      })
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        body: null,
        json: async () => ({}),
        text: async () => '',
      } as unknown as Response
    }) as typeof fetch

    const api = useGraphStore.getState()
    api.resetAll()
    api.setGrabMapsAuthMode('byok')
    api.setGrabMapsApiKey('gm_test_key')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(FloatingPropsPanel), anyWindow.requestAnimationFrame, 4)

    const text = container.textContent || ''
    if (text.includes('Search Places (Run Discovery)')) {
      throw new Error(`expected duplicate inline discovery run section to be removed from props panel, got ${JSON.stringify(text)}`)
    }
    if (container.querySelector('#grabmaps-discovery-widget-query')) {
      throw new Error('expected duplicate inline discovery query input to be removed from props panel')
    }
    if (fetchCalls.length !== 0) {
      throw new Error(`expected props panel render without inline discovery section to avoid network fetch calls, got ${JSON.stringify(fetchCalls)}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    globalWithFetch.fetch = previousFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelBytePlusModelRowNormalizesAwayOpenAiValueLeak() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setChatProvider('openai')
    api.setChatModel('gpt-5-nano')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusApi.model',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const modelSelects = findModelSelectsWithOption(container, CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT)
    if (modelSelects.length !== 1) {
      throw new Error(`expected filtered BytePlus API model search to render one shared model dropdown, got ${modelSelects.length}`)
    }
    const bytePlusModelSelect = modelSelects[0] as HTMLSelectElement | undefined
    if (!bytePlusModelSelect) {
      throw new Error('expected BytePlus API model dropdown to exist')
    }
    if (bytePlusModelSelect.value !== CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT) {
      throw new Error(`expected byteplusApi.model row to normalize to ${CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT}, got ${JSON.stringify(bytePlusModelSelect.value)}`)
    }
    if (String(bytePlusModelSelect.value) === 'gpt-5-nano') {
      throw new Error('expected byteplusApi.model row to avoid leaking the active OpenAI model value')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchUnifiesBytePlusVideoModelRow() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusVideoApi.model',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    if (!text.includes('byteplusVideoModel')) {
      throw new Error(`expected integrations video model search to surface unified byteplusVideoModel row, got ${JSON.stringify(text)}`)
    }
    if (text.includes('byteplusVideoApi.model')) {
      throw new Error('expected duplicate byteplusVideoApi.model alias row to be removed from integrations results')
    }
    const selects = Array.from(container.querySelectorAll('select'))
    if (selects.length !== 1) {
      throw new Error(`expected unified video model search to render one shared select editor, got ${selects.length}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchReusesBytePlusScalarConfig() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setChatTopP(0.92)
    useGraphStore.getState().setChatFrequencyPenalty(-0.5)

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'top_p',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    if (!text.includes('byteplusApi.top_p')) {
      throw new Error(`expected BytePlus top_p row in integrations search, got ${JSON.stringify(text)}`)
    }
    const topPInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'))
    if (topPInputs.length === 0) {
      throw new Error('expected integrations top_p row to render a writable numeric input')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchRendersBytePlusJsonEditor() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setChatResponseFormatJson('{"type":"json_object"}')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'response_format.type',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    if (!text.includes('byteplusApi.response_format.type')) {
      throw new Error(`expected BytePlus response_format.type row in integrations search, got ${JSON.stringify(text)}`)
    }
    const editors = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    if (editors.length === 0) {
      throw new Error('expected BytePlus response_format.type row to render a configurable text input')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchRendersWritableVirtualStringEditor() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    const persistedEndpoint = 'GET /api/v3/contents/generations/tasks/custom'
    dom.window.localStorage.setItem(
      getMainPanelVirtualSettingStorageKey('byteplusVideoApi.polling_endpoint'),
      JSON.stringify(persistedEndpoint),
    )

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusVideoApi.polling_endpoint',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    if (!text.includes('byteplusVideoApi.polling_endpoint')) {
      throw new Error(`expected BytePlus polling_endpoint row in integrations search, got ${JSON.stringify(text)}`)
    }
    const editors = (Array.from(container.querySelectorAll('input')) as HTMLInputElement[]).filter(
      input => input.value === persistedEndpoint,
    )
    if (editors.length !== 1) {
      throw new Error(`expected BytePlus polling_endpoint row to render one writable text editor seeded from persisted config, got ${editors.length}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelDocMappedReferenceRowsUseEditableVirtualValueSlots() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  const cases: Array<{
    tab: 'commerce' | 'maps' | 'mcp'
    query: string
    expectedKey: string
    expectedControl: 'input' | 'textarea'
  }> = [
    {
      tab: 'commerce',
      query: 'stripeApi.docs_url',
      expectedKey: 'stripeApi.docs_url',
      expectedControl: 'input',
    },
    {
      tab: 'maps',
      query: 'maps.grabmaps.docs_url',
      expectedKey: 'maps.grabmaps.docs_url',
      expectedControl: 'input',
    },
    {
      tab: 'mcp',
      query: 'browserMcp.agent_config',
      expectedKey: 'browserMcp.agent_config',
      expectedControl: 'textarea',
    },
  ]

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    for (const testCase of cases) {
      useGraphStore.getState().resetAll()
      const doc = dom.window.document
      const container = doc.createElement('section')
      doc.body.appendChild(container)
      root = createRoot(container as unknown as HTMLElement)
      await renderAndFlush(
        root,
        React.createElement(MainPanel, {
          requestedTab: testCase.tab,
          requestedSearchQuery: testCase.query,
        } as never),
        anyWindow.requestAnimationFrame,
        6,
      )

      const rows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
      const row = rows.find(item => item.children[0]?.textContent?.includes(testCase.expectedKey))
      if (!row) {
        throw new Error(`expected ${testCase.tab} row ${testCase.expectedKey}, got ${JSON.stringify(container.textContent || '')}`)
      }
      const valueCell = row.children[2] as HTMLElement | undefined
      if (!valueCell) {
        throw new Error(`expected ${testCase.expectedKey} row to have a Value cell`)
      }
      const controls = Array.from(valueCell.querySelectorAll(testCase.expectedControl))
      if (controls.length !== 1) {
        throw new Error(`expected ${testCase.expectedKey} Value cell to render one editable ${testCase.expectedControl}, got ${controls.length}`)
      }
      await unmountAndFlush(root)
      root = null
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchRendersBytePlusMessagesJsonEditor() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    useGraphStore.getState().setChatMessagesJson('[{"role":"user","content":"hi"}]')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'messages.role',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    if (!text.includes('byteplusApi.messages.role')) {
      throw new Error(`expected BytePlus messages.role row in integrations search, got ${JSON.stringify(text)}`)
    }
    const editors = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    if (editors.length === 0) {
      throw new Error('expected BytePlus messages.role row to render a configurable text input')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchRendersBytePlusNestedNumericField() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplusApi.messages.content.image_url.image_pixel_limit.max_pixels',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    if (!text.includes('byteplusApi.messages.content.image_url.image_pixel_limit.max_pixels')) {
      throw new Error(`expected BytePlus nested numeric field row in integrations search, got ${JSON.stringify(text)}`)
    }
    if (text.includes('Optional. Maximum allowed image pixels.')) {
      throw new Error('expected BytePlus nested numeric field value cell to stop rendering descriptive prose')
    }
    const editors = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[]
    if (editors.length !== 1) {
      throw new Error(`expected BytePlus nested numeric field row to render one numeric input, got ${editors.length}`)
    }
    if (editors[0]?.value !== '3136') {
      throw new Error(`expected BytePlus nested numeric field input to use the documented default 3136, got ${JSON.stringify(editors[0]?.value)}`)
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsOpenAiApiRows() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'openaiApi.input',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;['OpenAI Chat API', 'openaiApi.input'].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected OpenAI integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    if (text.includes('Text, image, or file inputs to the model, used to generate a response.')) {
      throw new Error('expected OpenAI input row value cell to stop rendering descriptive prose')
    }
    const jsonEditors = Array.from(container.querySelectorAll('textarea'))
    if (jsonEditors.length === 0) {
      throw new Error('expected OpenAI input row to reuse the shared multiline JSON editor')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsOpenAiImagesApiRows() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'openaiImageApi',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;[
      'OpenAI Images API',
      'openaiImageApi.prompt',
      'openaiImageApi.model',
      'openaiImageApi.output_format',
      'Open FloatingPanel Props Panel OpenAI Image Widget',
      'Open OpenAI Images API Docs',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected OpenAI Images integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const textEditors = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    if (textEditors.length === 0) {
      throw new Error('expected OpenAI Images prompt row to render a configurable text input')
    }
    const selects: HTMLSelectElement[] = Array.from(container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>)
    const findSelectWithOption = (optionValue: string): HTMLSelectElement | undefined => {
      for (const select of selects) {
        for (let index = 0; index < select.options.length; index += 1) {
          const option = select.options.item(index) as HTMLOptionElement | null
          if (option?.value === optionValue) return select
        }
      }
      return undefined
    }
    const modelSelect = findSelectWithOption('gpt-image-2')
    if (!modelSelect) {
      throw new Error('expected OpenAI Images model row to render SSOT-backed model options')
    }
    if (modelSelect.value !== 'gpt-image-2') {
      throw new Error(`expected OpenAI Images model select to use configurable default gpt-image-2, got ${JSON.stringify(modelSelect.value)}`)
    }
    if (!findSelectWithOption('webp')) {
      throw new Error('expected OpenAI Images output_format row to render png/jpeg/webp options')
    }
    if (!findSelectWithOption('transparent')) {
      throw new Error('expected OpenAI Images background row to render auto/transparent/opaque options')
    }
    const numberEditors = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'))
    if (numberEditors.length < 3) {
      throw new Error(`expected OpenAI Images numeric rows to render configurable number inputs, got ${numberEditors.length}`)
    }
    const streamEditors = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    if (streamEditors.length < 1) {
      throw new Error('expected OpenAI Images stream row to render a configurable checkbox')
    }
    if (text.includes('openaiImagesApi.')) {
      throw new Error('expected OpenAI Images rows to avoid stale plural openaiImagesApi aliases')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsMiroMindApiConfigurableValues() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'miromindApi',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;[
      'MiroMind API',
      'miromindApi.model',
      'miromindApi.mcp_servers',
      'miromindApi.streaming.reasoning_steps',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected MiroMind integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const modelSelects = findModelSelectsWithOption(container, CHAT_MIROMIND_MODEL_OPTIONS[0])
    const modelSelect = modelSelects.find(select => getSelectOptionValues(select).includes(CHAT_MIROMIND_MODEL_OPTIONS[1]))
    if (!modelSelect) {
      throw new Error(`expected MiroMind model Value cell to render visible model dropdown, got ${JSON.stringify(container.textContent || '')}`)
    }
    if (modelSelect.value !== CHAT_MIROMIND_MODEL_OPTIONS[0]) {
      throw new Error(`expected MiroMind model dropdown to default to ${JSON.stringify(CHAT_MIROMIND_MODEL_OPTIONS[0])}, got ${JSON.stringify(modelSelect.value)}`)
    }
    ;[
      'serverManaged',
      'byok',
      'delta.reasoning_steps',
    ].forEach(value => {
      if (!hasSelectOption(container, value)) {
        throw new Error(`expected MiroMind Value cells to expose configurable option ${JSON.stringify(value)}`)
      }
    })
    const valueRows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
    const mcpServersRow = valueRows.find(row => row.children[0]?.textContent?.includes('miromindApi.mcp_servers'))
    const mcpServersValue = mcpServersRow?.children[2] as HTMLElement | undefined
    if (!mcpServersValue?.querySelector('textarea')) {
      throw new Error('expected MiroMind mcp_servers Value cell to render a configurable JSON textarea')
    }
    if (mcpServersValue.textContent?.includes('Documents the optional provider request field')) {
      throw new Error('expected MiroMind mcp_servers Value cell to avoid responsibility prose')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsAgnesApiConfigurableValues() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'agnesApi',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;[
      'Agnes AI API',
      'agnesApi.model',
      'agnesApi.streaming.json_chunks',
      'agnesApi.output_contract',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected Agnes integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const modelSelect = findModelSelectsWithOption(container, CHAT_AGNES_MODEL_OPTIONS[0])[0]
    if (!modelSelect) {
      throw new Error(`expected Agnes model Value cell to render visible model dropdown, got ${JSON.stringify(container.textContent || '')}`)
    }
    if (modelSelect.value !== CHAT_AGNES_MODEL_OPTIONS[0]) {
      throw new Error(`expected Agnes model dropdown to default to ${JSON.stringify(CHAT_AGNES_MODEL_OPTIONS[0])}, got ${JSON.stringify(modelSelect.value)}`)
    }
    ;[
      'serverManaged',
      'byok',
      'delta.content',
      'frontmatter_agenticOs_markdown',
    ].forEach(value => {
      if (!hasSelectOption(container, value)) {
        throw new Error(`expected Agnes Value cells to expose configurable option ${JSON.stringify(value)}`)
      }
    })
    const valueRows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
    const outputContractRow = valueRows.find(row => row.children[0]?.textContent?.includes('agnesApi.output_contract'))
    const outputContractValue = outputContractRow?.children[2] as HTMLElement | undefined
    if (!outputContractValue?.querySelector('select')) {
      throw new Error('expected Agnes output_contract Value cell to render a configurable select')
    }
    if (outputContractValue.textContent?.includes('Pins Agnes to the canonical')) {
      throw new Error('expected Agnes output_contract Value cell to avoid responsibility prose')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsQwenApiConfigurableValues() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'qwenApi',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;[
      'Qwen API',
      'qwenApi.provider',
      'qwenApi.endpoint_url',
      'qwenApi.model',
      'qwenApi.messages',
      'qwenApi.output_contract',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected Qwen integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const modelSelect = findModelSelectsWithOption(container, CHAT_QWEN_MODEL_OPTIONS[0])
      .find(select => getSelectOptionValues(select).includes('qwen3-max') && getSelectOptionValues(select).includes('qwen-flash'))
    if (!modelSelect) {
      throw new Error(`expected Qwen model Value cell to render visible model dropdown, got ${JSON.stringify(container.textContent || '')}`)
    }
    if (modelSelect.value !== CHAT_QWEN_MODEL_OPTIONS[0]) {
      throw new Error(`expected Qwen model dropdown to default to ${JSON.stringify(CHAT_QWEN_MODEL_OPTIONS[0])}, got ${JSON.stringify(modelSelect.value)}`)
    }
    const endpointControls = Array.from(container.querySelectorAll('input, select')) as Array<HTMLInputElement | HTMLSelectElement>
    const endpointControl = endpointControls.find(control => control.value === CHAT_QWEN_ENDPOINT_URL)
    if (!endpointControl) {
      throw new Error(`expected Qwen endpoint Value cell to expose configurable endpoint ${JSON.stringify(CHAT_QWEN_ENDPOINT_URL)}`)
    }
    ;[
      'serverManaged',
      'byok',
      CHAT_QWEN_ENDPOINT_URL,
      'Singapore',
      'frontmatter_agenticOs_markdown',
    ].forEach(value => {
      if (!hasSelectOption(container, value)) {
        throw new Error(`expected Qwen Value cells to expose configurable option ${JSON.stringify(value)}`)
      }
    })
    const valueRows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
    const messagesRow = valueRows.find(row => row.children[0]?.textContent?.includes('qwenApi.messages'))
    const messagesValue = messagesRow?.children[2] as HTMLElement | undefined
    if (!messagesValue?.querySelector('textarea')) {
      throw new Error('expected Qwen messages Value cell to render a configurable JSON textarea')
    }
    if (messagesValue.textContent?.includes('States that Qwen reuses')) {
      throw new Error('expected Qwen messages Value cell to avoid responsibility prose')
    }
    const outputContractRow = valueRows.find(row => row.children[0]?.textContent?.includes('qwenApi.output_contract'))
    const outputContractValue = outputContractRow?.children[2] as HTMLElement | undefined
    if (!outputContractValue?.querySelector('select')) {
      throw new Error('expected Qwen output_contract Value cell to render a configurable select')
    }
    if (outputContractValue.textContent?.includes('Pins Qwen to the canonical')) {
      throw new Error('expected Qwen output_contract Value cell to avoid responsibility prose')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsZaiApiReferenceRows() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'zAiApi',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;[
      'Z.AI API',
      'zAiApi.provider',
      'zAiApi.runtime_status',
      'zAiApi.base_url',
      'zAiApi.endpoint',
      'zAiApi.model',
      'zAiApi.request_fields',
      'Open Z.AI Quick Start',
      'reference_only',
      'https://api.z.ai/api/paas/v4',
      'glm-5.2',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected Z.AI integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const runtimeStatusRow = (Array.from(container.querySelectorAll('dl')) as HTMLElement[])
      .find(row => row.children[0]?.textContent?.includes('zAiApi.runtime_status'))
    if (!runtimeStatusRow || runtimeStatusRow.children.length !== 3) {
      throw new Error('expected Z.AI runtime status to use the shared three-column Key-Type-Value row')
    }
    const runtimeStatusValue = runtimeStatusRow.children[2] as HTMLElement
    if (runtimeStatusValue.querySelector('input, select, textarea')) {
      throw new Error('expected Z.AI reference rows to remain non-editable until a provider runtime owner exists')
    }
    const quickStartLink = (Array.from(container.querySelectorAll('a')) as HTMLAnchorElement[])
      .find(link => link.textContent?.trim() === 'Open Z.AI Quick Start')
    if (quickStartLink?.getAttribute('href') !== 'https://docs.z.ai/guides/overview/quick-start.md') {
      throw new Error('expected the Z.AI reference section to link to the requested Quick Start URL')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsSearchShowsGoogleCloudApiConfigurableValues() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'googleCloudApi',
      } as never),
      anyWindow.requestAnimationFrame,
      6,
    )

    const text = container.textContent || ''
    ;[
      'Google Cloud Vertex AI API',
      'googleCloudApi.provider',
      'googleCloudApi.project_id',
      'googleCloudApi.location',
      'googleCloudApi.endpoint_url',
      'googleCloudApi.model',
      'googleCloudApi.messages',
      'googleCloudApi.output_contract',
    ].forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected Google Cloud integrations search to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })
    const modelSelect = findModelSelectsWithOption(container, CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0])
      .find(select => getSelectOptionValues(select).includes('google/gemini-1.5-flash-001'))
    if (!modelSelect) {
      throw new Error(`expected Google Cloud model Value cell to render visible model dropdown, got ${JSON.stringify(container.textContent || '')}`)
    }
    if (modelSelect.value !== CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0]) {
      throw new Error(`expected Google Cloud model dropdown to default to ${JSON.stringify(CHAT_GOOGLE_CLOUD_MODEL_OPTIONS[0])}, got ${JSON.stringify(modelSelect.value)}`)
    }
    const endpointControls = Array.from(container.querySelectorAll('input, select')) as Array<HTMLInputElement | HTMLSelectElement>
    const endpointControl = endpointControls.find(control => control.value === CHAT_GOOGLE_CLOUD_ENDPOINT_URL)
    if (!endpointControl) {
      throw new Error(`expected Google Cloud endpoint Value cell to expose configurable endpoint ${JSON.stringify(CHAT_GOOGLE_CLOUD_ENDPOINT_URL)}`)
    }
    ;[
      'serverManaged',
      'byok',
      'us-central1',
      'global',
      'frontmatter_agenticOs_markdown',
    ].forEach(value => {
      if (!hasSelectOption(container, value)) {
        throw new Error(`expected Google Cloud Value cells to expose configurable option ${JSON.stringify(value)}`)
      }
    })
    const valueRows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
    const projectRow = valueRows.find(row => row.children[0]?.textContent?.includes('googleCloudApi.project_id'))
    const projectValue = projectRow?.children[2] as HTMLElement | undefined
    if (!projectValue?.querySelector('input[type="text"]')) {
      throw new Error('expected Google Cloud project_id Value cell to render a configurable text input')
    }
    if (projectValue.textContent?.includes('Google Cloud project id segment')) {
      throw new Error('expected Google Cloud project_id Value cell to avoid responsibility prose')
    }
    const messagesRow = valueRows.find(row => row.children[0]?.textContent?.includes('googleCloudApi.messages'))
    const messagesValue = messagesRow?.children[2] as HTMLElement | undefined
    if (!messagesValue?.querySelector('textarea')) {
      throw new Error('expected Google Cloud messages Value cell to render a configurable JSON textarea')
    }
    if (messagesValue.textContent?.includes('Configurable message override')) {
      throw new Error('expected Google Cloud messages Value cell to avoid responsibility prose')
    }
    const outputContractRow = valueRows.find(row => row.children[0]?.textContent?.includes('googleCloudApi.output_contract'))
    const outputContractValue = outputContractRow?.children[2] as HTMLElement | undefined
    if (!outputContractValue?.querySelector('select')) {
      throw new Error('expected Google Cloud output_contract Value cell to render a configurable select')
    }
    if (outputContractValue.textContent?.includes('Pins Google Cloud to the canonical')) {
      throw new Error('expected Google Cloud output_contract Value cell to avoid responsibility prose')
    }
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedIntegrationsAnchorScrollsExactBytePlusRow() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    let scrolledAnchor = ''
    const originalScrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView
    dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      scrolledAnchor = String((this as HTMLElement).getAttribute('data-kg-anchor') || '')
    }

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    const anchorId = getBytePlusSharedTextApiRowAnchorId('byteplus.auth_mode')
    await renderAndFlush(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'integrations',
        requestedSearchQuery: 'byteplus.auth_mode',
        requestedAnchorId: anchorId,
        requestedAnchorSeq: 1,
      } as never),
      anyWindow.requestAnimationFrame,
      8,
    )

    if (scrolledAnchor !== anchorId) {
      throw new Error(`expected integrations request to scroll exact BytePlus row anchor ${JSON.stringify(anchorId)}, got ${JSON.stringify(scrolledAnchor)}`)
    }
    const target = container.querySelector(`[data-kg-anchor="${anchorId}"]`)
    if (!target) {
      throw new Error(`expected requested BytePlus row anchor to render: ${JSON.stringify(anchorId)}`)
    }
    dom.window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView
  } finally {
    try {
      await unmountAndFlush(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
