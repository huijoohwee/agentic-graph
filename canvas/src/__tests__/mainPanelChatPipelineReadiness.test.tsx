import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import {
  readLocalChatPipelineSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { CHAT_LOCAL_DEFAULT_MODEL, CHAT_PROVIDER_LM_STUDIO, CHAT_PROVIDER_OPENAI } from '@/lib/chatEndpoint'
import { useSettingsChatAssist } from '@/features/panels/views/useSettingsChatAssist'
import { useSettingsSync } from '@/features/panels/views/useSettingsSync'
import { CHAT_KTV_ROW_KEYS } from '@/features/panels/views/settingsView.constants'
import { renderSettingInput } from '@/features/settings/ui'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testMainPanelSettingsSyncsLiveFloatingChatPipelineInspection() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let mainPanelRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null

  let cleanupAssertionError: Error | null = null
  try {
    resetBrowserLocalSurfaceSnapshotsForTests()
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const store = useGraphStore.getState()
    store.resetAll()
    store.setChatProvider(CHAT_PROVIDER_OPENAI)
    store.setChatEndpointUrl('https://api.openai.com/v1/chat/completions')
    store.setChatModel('gpt-4.1-mini')
    store.setChatContextScope('selection')
    store.setChatStorageTarget('chatAgenticGraph')

    const doc = dom.window.document
    const mainPanelContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(mainPanelContainer)
    doc.body.appendChild(chatContainer)
    mainPanelRoot = createRoot(mainPanelContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    const SettingsHarness = () => {
      const dirtyRef = React.useRef(new Set<string>())
      const [values, setValues] = React.useState<Record<string, string | number | boolean>>({
        chatProvider: CHAT_PROVIDER_OPENAI,
        chatEndpointUrl: 'https://api.openai.com/v1/chat/completions',
        chatModel: 'gpt-4.1-mini',
        chatAuthMode: 'serverManaged',
        chatContextScope: 'selection',
        integrationConfigsJson: JSON.stringify({ aiChat: { enabled: false, provider: 'native', openTab: 'chat' } }),
      })
      useSettingsSync({ dirtyRef, setValues, values })
      const { buildChatAssistNodes } = useSettingsChatAssist({
        dirtyRef,
        openLocalChatApiKeyEntry: () => {},
        setValues,
        values,
      })
      return (
        <section>
          <section data-row="provider">
            {renderSettingInput(
              'chatProvider',
              'string',
              true,
              values,
              setValues,
              dirtyRef,
              [CHAT_PROVIDER_OPENAI, CHAT_PROVIDER_LM_STUDIO],
            )}
          </section>
          <section data-row="model-input">
            {renderSettingInput(
              'chatModel',
              'string',
              true,
              values,
              setValues,
              dirtyRef,
              ['gpt-4.1-mini', CHAT_LOCAL_DEFAULT_MODEL],
            )}
          </section>
          <section data-row="context">{buildChatAssistNodes(CHAT_KTV_ROW_KEYS.contextScope)}</section>
        </section>
      )
    }

    await mountReactRoot(
      mainPanelRoot,
      React.createElement(SettingsHarness),
      { window: dom.window as unknown as Window, frames: 10 },
    )
    await mountReactRoot(chatRoot, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 8,
    })

    const initialInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (initialInspection.available !== true) {
      throw new Error(`expected mounted FloatingPanel Chat pipeline readiness to be available, got ${JSON.stringify(initialInspection)}`)
    }
    if (
      initialInspection.chatContextScope !== 'selection' ||
      initialInspection.chatStorageTarget !== 'chatAgenticGraph'
    ) {
      throw new Error(`expected initial floating chat pipeline readiness to reflect the seeded store state, got ${JSON.stringify(initialInspection)}`)
    }
    if (!initialInspection.chatProviderSummary.includes('OpenAI')) {
      throw new Error(`expected initial floating chat pipeline readiness to report the OpenAI provider summary, got ${JSON.stringify(initialInspection.chatProviderSummary)}`)
    }

    const providerRow = mainPanelContainer.querySelector('[data-row="provider"]') as HTMLElement | null
    const providerInput = providerRow?.querySelector('input') as HTMLInputElement | null
    if (!providerInput || providerInput.readOnly !== true || providerInput.value !== CHAT_PROVIDER_OPENAI) {
      throw new Error(`expected chatProvider Value to be derived read-only OpenAI text, got ${JSON.stringify(providerRow?.textContent || providerInput?.value || '')}`)
    }
    if (providerRow?.querySelector('select')) {
      throw new Error('expected chatProvider Value to avoid a manual provider dropdown')
    }
    const modelInputRow = mainPanelContainer.querySelector('[data-row="model-input"]') as HTMLElement | null
    const modelSelect = modelInputRow?.querySelector('select') as HTMLSelectElement | null
    if (!modelSelect) {
      throw new Error(`expected chatModel Value dropdown, got ${JSON.stringify(modelInputRow?.textContent || '')}`)
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')?.set
      if (!valueSetter) throw new Error('expected DOM select value setter')
      valueSetter.call(modelSelect, CHAT_LOCAL_DEFAULT_MODEL)
      Simulate.change(modelSelect)
      await waitForFrames(dom.window as unknown as Window, 3)
    })
    await act(async () => {
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const updatedInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      updatedInspection.available !== true ||
      updatedInspection.chatContextScope !== 'selection' ||
      updatedInspection.chatStorageTarget !== 'chatAgenticGraph'
    ) {
      throw new Error(`expected floating chat pipeline readiness to preserve the current context/storage surface while MainPanel Settings provider changes sync live, got ${JSON.stringify(updatedInspection)}`)
    }
    if (!updatedInspection.chatProviderSummary.includes('Local Gateway')) {
      throw new Error(`expected floating chat pipeline readiness to reflect the Local provider summary after MainPanel Settings update, got ${JSON.stringify(updatedInspection.chatProviderSummary)}`)
    }
  } finally {
    if (chatRoot) {
      await unmountReactRoot(chatRoot, { window: dom.window as unknown as Window })
    }
    const clearedInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (clearedInspection.available !== false) {
      cleanupAssertionError = new Error(`expected floating chat pipeline readiness snapshot cleanup after chat unmount, got ${JSON.stringify(clearedInspection)}`)
    }
    if (mainPanelRoot) {
      await unmountReactRoot(mainPanelRoot, { window: dom.window as unknown as Window })
    }
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
