import { selectMenuValue } from './helpers/semanticMenu'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import {
  CHAT_LOCAL_DEFAULT_MODEL,
  CHAT_PROVIDER_LM_STUDIO,
  CHAT_PROVIDER_OPENAI,
} from '@/lib/chatEndpoint'
import { DEFAULT_INTEGRATION_CONFIGS } from '@/features/integrations/config'
import {
  readLocalSettingsChatReadinessSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { inspectLocalSettingsChatReadiness } from '@/features/agent-ready/localSettingsChatReadinessInspection'
import { useSettingsChatAssist } from '@/features/panels/views/useSettingsChatAssist'
import { CHAT_KTV_ROW_KEYS } from '@/features/panels/views/settingsView.constants'
import { renderSettingInput } from '@/features/settings/ui'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  installDeterministicRaf,
  mountReactRoot,
  unmountReactRoot,
  waitForFrames,
  waitForTasks,
} from '@/tests/lib/reactRootHarness'

const buildIntegrationConfigsJson = (enabled: boolean): string =>
  JSON.stringify({
    ...DEFAULT_INTEGRATION_CONFIGS,
    aiChat: {
      ...DEFAULT_INTEGRATION_CONFIGS.aiChat,
      enabled,
      openTab: 'chat',
    },
  })

const findButtonByLabel = (container: HTMLElement, label: string): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
  const match = buttons.find(button => String(button.textContent || '').includes(label))
  if (!match) throw new Error(`expected button with label ${JSON.stringify(label)}`)
  return match
}

export async function testUseSettingsChatAssistPublishesLiveWebMcpReadinessState() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const previousFetch = globalThis.fetch
  const fetchCalls: string[] = []
  let releaseFetch: (() => void) | null = null

  let cleanupAssertionError: Error | null = null
  try {
    resetBrowserLocalSurfaceSnapshotsForTests()
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push(url)
      await new Promise<void>(resolve => {
        releaseFetch = resolve
      })
      return new Response(JSON.stringify({
        data: [
          { id: 'local/model-a' },
          { id: 'local/model-b' },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const Harness = () => {
      const dirtyRef = React.useRef(new Set<string>())
      const [values, setValues] = React.useState<Record<string, string | number | boolean>>({
        chatProvider: CHAT_PROVIDER_OPENAI,
        chatEndpointUrl: 'https://api.openai.com/v1/chat/completions',
        chatModel: 'gpt-4.1-mini',
        chatAuthMode: 'serverManaged',
        chatContextScope: 'selection',
        integrationConfigsJson: buildIntegrationConfigsJson(false),
      })
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
          <section data-row="routing">{buildChatAssistNodes(CHAT_KTV_ROW_KEYS.routing)}</section>
          <section data-row="model">{buildChatAssistNodes(CHAT_KTV_ROW_KEYS.model)}</section>
        </section>
      )
    }

    await mountReactRoot(root, <Harness />, {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    const initialInspection = inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot())
    if (initialInspection.available !== true) {
      throw new Error(`expected initial Settings readiness snapshot to be available, got ${JSON.stringify(initialInspection)}`)
    }
    if (
      initialInspection.provider.id !== CHAT_PROVIDER_OPENAI ||
      initialInspection.routing.contextScope !== 'selection' ||
      initialInspection.routing.integrationEnabled !== false
    ) {
      throw new Error(`expected initial Settings readiness state to reflect the mounted OpenAI configuration, got ${JSON.stringify(initialInspection)}`)
    }
    const contextRow = container.querySelector('[data-row="context"]') as HTMLElement | null
    if (contextRow && String(contextRow.textContent || '').trim()) {
      throw new Error(`expected chatContextScope assist row to stay empty because the Value dropdown owns scope selection, got ${JSON.stringify(contextRow.textContent || '')}`)
    }
    const providerRow = container.querySelector('[data-row="provider"]') as HTMLElement | null
    const providerInput = providerRow?.querySelector('input') as HTMLInputElement | null
    if (!providerInput || providerInput.readOnly !== true || providerInput.value !== CHAT_PROVIDER_OPENAI) {
      throw new Error(`expected chatProvider Value to be derived read-only OpenAI text, got ${JSON.stringify(providerRow?.textContent || providerInput?.value || '')}`)
    }
    if (providerRow?.querySelector('button[data-kg-select]')) {
      throw new Error('expected chatProvider Value to avoid a manual provider dropdown')
    }
    const modelInputRow = container.querySelector('[data-row="model-input"]') as HTMLElement | null
    const modelSelect = modelInputRow?.querySelector('button[data-kg-select]') as HTMLButtonElement | null
    if (!modelSelect) {
      throw new Error(`expected chatModel Value dropdown, got ${JSON.stringify(modelInputRow?.textContent || '')}`)
    }

    await act(async () => {
      const valueSetter = selectMenuValue
      if (!valueSetter) throw new Error('expected DOM select value setter')
      valueSetter(modelSelect, CHAT_LOCAL_DEFAULT_MODEL)
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(container, 'Enable AI Chat').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(container, 'Refresh Models').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForTasks(2)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const refreshingInspection = inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot())
    if (
      refreshingInspection.provider.id !== CHAT_PROVIDER_LM_STUDIO ||
      refreshingInspection.provider.model !== CHAT_LOCAL_DEFAULT_MODEL ||
      refreshingInspection.routing.contextScope !== 'selection' ||
      refreshingInspection.routing.integrationEnabled !== true
    ) {
      throw new Error(`expected Settings readiness snapshot to update after live provider/routing changes, got ${JSON.stringify(refreshingInspection)}`)
    }
    if (
      refreshingInspection.modelDiscovery.refreshing !== true ||
      refreshingInspection.modelDiscovery.status !== 'Refreshing models...'
    ) {
      throw new Error(`expected Settings readiness snapshot to expose in-flight model refresh state, got ${JSON.stringify(refreshingInspection.modelDiscovery)}`)
    }

    await act(async () => {
      if (!releaseFetch) throw new Error('expected model refresh request to be pending before release')
      releaseFetch()
      await waitForTasks(2)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const finalInspection = inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot())
    if (fetchCalls.length !== 1) {
      throw new Error(`expected exactly one model discovery request, got ${fetchCalls.length}`)
    }
    if (
      finalInspection.modelDiscovery.refreshing !== false ||
      finalInspection.modelDiscovery.discoveredCount !== 2 ||
      finalInspection.modelDiscovery.status !== 'Discovered 2 models.'
    ) {
      throw new Error(`expected Settings readiness snapshot to expose discovered models after refresh resolution, got ${JSON.stringify(finalInspection.modelDiscovery)}`)
    }
    if (finalInspection.modelDiscovery.ready !== true) {
      throw new Error(`expected Settings readiness inspection to remain ready after refresh resolution, got ${JSON.stringify(finalInspection)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    const clearedInspection = inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot())
    if (clearedInspection.available !== false) {
      cleanupAssertionError = new Error(`expected Settings readiness snapshot cleanup on unmount, got ${JSON.stringify(clearedInspection)}`)
    }
    resetBrowserLocalSurfaceSnapshotsForTests()
    globalThis.fetch = previousFetch
    restoreDom()
    restoreWindow()
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
