import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import {
  readLocalChatPipelineSurfaceSnapshot,
  readLocalSettingsChatReadinessSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { inspectLocalSettingsChatReadiness } from '@/features/agent-ready/localSettingsChatReadinessInspection'
import { useSettingsChatAssist } from '@/features/panels/views/useSettingsChatAssist'
import { useSettingsSync } from '@/features/panels/views/useSettingsSync'
import { useSettingsView } from '@/features/panels/views/useSettingsView'
import { renderSettingInput } from '@/features/settings/ui'
import { DEFAULT_PAYMENT_PROVIDER_ID } from '@/features/payments/providers'
import { CHAT_PROVIDER_OPENAI } from '@/lib/chatEndpoint'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

const CHAT_CONTEXT_SCOPE_LABELS = [
  'Selection + Workspace (Default)',
  'Canvas Selection',
  'Workspace Source Files',
]

type RegisteredSettingsActions = {
  apply: () => void
  reset: () => void
}

function SettingsApplyHarness(props: {
  actionsRef: React.MutableRefObject<RegisteredSettingsActions | null>
}): React.ReactElement {
  const {
    values,
    setValues,
    dirtyRef,
  } = useSettingsView({
    searchQuery: 'chat',
    mode: 'all',
    paymentsProviderId: DEFAULT_PAYMENT_PROVIDER_ID,
    onRegisterActions: next => {
      props.actionsRef.current = { apply: next.apply, reset: next.reset }
    },
  })

  useSettingsSync({ dirtyRef, setValues, values })
  useSettingsChatAssist({
    dirtyRef,
    openLocalChatApiKeyEntry: () => {},
    setValues,
    values,
  })

  return (
    <section>
      <section data-row="context">
        {renderSettingInput(
          'chatContextScope',
          'string',
          true,
          values,
          setValues,
          dirtyRef,
          ['hybrid', 'selection', 'workspace'],
        )}
      </section>
    </section>
  )
}

export async function testSettingsApplyCommitsChatContextScopeIntoFloatingChatPipelineInspection() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }

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
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsApplyHarness, { actionsRef }), {
      window: dom.window as unknown as Window,
      frames: 10,
    })
    await mountReactRoot(chatRoot, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 8,
    })

    if (!actionsRef.current?.apply) {
      throw new Error('expected Settings owner to register an apply action')
    }

    const initialSettingsInspection = inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot())
    const initialChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      initialSettingsInspection.available !== true ||
      initialSettingsInspection.routing.contextScope !== 'selection'
    ) {
      throw new Error(`expected initial Settings readiness context scope to be selection, got ${JSON.stringify(initialSettingsInspection)}`)
    }
    if (
      initialChatInspection.available !== true ||
      initialChatInspection.chatContextScope !== 'selection'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline context scope to be selection, got ${JSON.stringify(initialChatInspection)}`)
    }

    const contextRow = settingsContainer.querySelector('[data-row="context"]') as HTMLElement | null
    if (!contextRow) {
      throw new Error(`expected settings harness context row, got ${JSON.stringify(settingsContainer.textContent || '')}`)
    }
    const contextSelect = contextRow.querySelector('select') as HTMLSelectElement | null
    if (!contextSelect) {
      throw new Error(`expected chatContextScope Value dropdown, got ${JSON.stringify(contextRow.textContent || '')}`)
    }
    const optionLabels = Array.from(contextSelect.options).map(option => String(option.textContent || '').trim())
    CHAT_CONTEXT_SCOPE_LABELS.forEach(label => {
      if (!optionLabels.includes(label)) {
        throw new Error(`expected chatContextScope dropdown to include ${JSON.stringify(label)}, got ${JSON.stringify(optionLabels)}`)
      }
    })
    if (contextSelect.value !== 'selection') {
      throw new Error(`expected seeded chatContextScope dropdown value to be selection, got ${JSON.stringify(contextSelect.value)}`)
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')?.set
      if (!valueSetter) throw new Error('expected DOM select value setter')
      valueSetter.call(contextSelect, 'workspace')
      Simulate.change(contextSelect)
      await waitForFrames(dom.window as unknown as Window, 3)
    })

    const dirtySettingsInspection = inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot())
    const preApplyChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      dirtySettingsInspection.available !== true ||
      dirtySettingsInspection.routing.contextScope !== 'workspace'
    ) {
      throw new Error(`expected Settings readiness to reflect the dirty workspace context before apply, got ${JSON.stringify(dirtySettingsInspection)}`)
    }
    if (
      preApplyChatInspection.available !== true ||
      preApplyChatInspection.chatContextScope !== 'selection'
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline context scope to remain selection before Settings apply, got ${JSON.stringify(preApplyChatInspection)}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const appliedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedChatInspection.available !== true ||
      appliedChatInspection.chatContextScope !== 'workspace'
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline context scope to update to workspace after Settings apply, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (useGraphStore.getState().chatContextScope !== 'workspace') {
      throw new Error(`expected canonical store chatContextScope to be workspace after Settings apply, got ${JSON.stringify(useGraphStore.getState().chatContextScope)}`)
    }
  } finally {
    if (chatRoot) {
      await unmountReactRoot(chatRoot, { window: dom.window as unknown as Window })
    }
    const clearedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (clearedChatInspection.available !== false) {
      cleanupAssertionError = new Error(`expected FloatingPanel Chat pipeline snapshot cleanup after chat unmount, got ${JSON.stringify(clearedChatInspection)}`)
    }
    if (settingsRoot) {
      await unmountReactRoot(settingsRoot, { window: dom.window as unknown as Window })
    }
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
