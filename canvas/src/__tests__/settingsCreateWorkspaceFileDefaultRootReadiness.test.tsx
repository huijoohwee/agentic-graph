import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import {
  readLocalChatPipelineSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT } from '@/features/chat/chatStorageConfig'
import { DEFAULT_PAYMENT_PROVIDER_ID } from '@/features/payments/providers'
import { useSettingsView } from '@/features/panels/views/useSettingsView'
import { useSettingsSync } from '@/features/panels/views/useSettingsSync'
import { useSettingsWorkspaceActions } from '@/features/panels/views/useSettingsWorkspaceActions'
import { CHAT_PROVIDER_OPENAI } from '@/lib/chatEndpoint'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

type RegisteredSettingsActions = {
  apply: () => void
  reset: () => void
}

const AGENTIC_OS_CREATED_PATH = `${CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT}/20260523T143000Z/kgc_20260523T143000Z.md`
const HISTORY_CREATED_PATH = `${CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT}/chh_20260523143000.md`

const findButtonByLabel = (container: HTMLElement, label: string): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
  const match = buttons.find(button => String(button.textContent || '').includes(label))
  if (!match) throw new Error(`expected button with label ${JSON.stringify(label)}`)
  return match
}

function SettingsCreateWorkspaceFileDefaultRootHarness(props: {
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

  const patchChatValues = React.useCallback((patch: Record<string, string>) => {
    Object.keys(patch).forEach(key => dirtyRef.current.add(key))
    setValues(prev => ({ ...prev, ...patch }))
  }, [dirtyRef, setValues])

  const {
    createAndSelectChatHistoryFile,
    createAndSelectAgenticGraphFile,
    chatHistoryPathStatus,
    agenticGraphPathStatus,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
  })

  return (
    <section>
      <section data-draft-root-path={String(values.chatLocalStorageRootPath || '')} />
      <section data-draft-agentic-graph-storage-mode={String(values.chatAgenticGraphStorageMode || '')} />
      <section data-draft-history-storage-mode={String(values.chatHistoryStorageMode || '')} />
      <section data-draft-agentic-graph-cloud-url={String(values.chatAgenticGraphCloudUrl || '')} />
      <section data-draft-history-cloud-url={String(values.chatHistoryCloudUrl || '')} />
      <section data-draft-agentic-graph-workspace-path={String(values.chatAgenticGraphWorkspacePath || '')} />
      <section data-draft-history-workspace-path={String(values.chatHistoryWorkspacePath || '')} />
      <section data-agentic-graph-status={String(agenticGraphPathStatus || '')} />
      <section data-history-status={String(chatHistoryPathStatus || '')} />
      <button
        type="button"
        onClick={() => patchChatValues({ chatLocalStorageRootPath: '' })}
      >
        Clear Local Root Draft
      </button>
      <button
        type="button"
        onClick={() => void createAndSelectAgenticGraphFile()}
      >
        Create agentic-graph File
      </button>
      <button
        type="button"
        onClick={() => void createAndSelectChatHistoryFile()}
      >
        Create History File
      </button>
    </section>
  )
}

export async function testSettingsCreateFilesBlankRootFallsBackToDefaultLocalRootUntilApply() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }
  const originalDateNow = Date.now

  let cleanupAssertionError: Error | null = null
  try {
    resetBrowserLocalSurfaceSnapshotsForTests()
    resetWorkspaceFsForTests()
    Date.now = () => Date.UTC(2026, 4, 23, 14, 30, 0, 0)
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const store = useGraphStore.getState()
    store.resetAll()
    store.setChatProvider(CHAT_PROVIDER_OPENAI)
    store.setChatEndpointUrl('https://api.openai.com/v1/chat/completions')
    store.setChatModel('gpt-4.1-mini')
    store.setChatContextScope('workspace')
    store.setChatStorageTarget('chatAgenticGraph')
    store.setChatLocalStorageRootPath('/workspace/chat')
    store.setChatAgenticGraphStorageMode('cloud')
    store.setChatAgenticGraphCloudUrl('https://cloud.example/agentic-graph-before-default-root-create.md')
    store.setChatAgenticGraphWorkspacePath(null)
    store.setChatHistoryStorageMode('cloud')
    store.setChatHistoryCloudUrl('https://cloud.example/history-before-default-root-create.md')
    store.setChatHistoryWorkspacePath(null)

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsCreateWorkspaceFileDefaultRootHarness, { actionsRef }), {
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

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Clear Local Root Draft').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const clearedDraftRoot = settingsContainer.querySelector('[data-draft-root-path]')?.getAttribute('data-draft-root-path')
    if (clearedDraftRoot !== '') {
      throw new Error(`expected draft local root path to be cleared before create-file actions, got ${JSON.stringify(clearedDraftRoot)}`)
    }

    const initialChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      initialChatInspection.available !== true ||
      initialChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      initialChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      initialChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-before-default-root-create.md' ||
      initialChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-default-root-create.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline default-root create state to reflect committed cloud values, got ${JSON.stringify(initialChatInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Create agentic-graph File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 4)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Create History File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 4)
    })

    const draftAgenticGraphStorageMode = settingsContainer.querySelector('[data-draft-agentic-graph-storage-mode]')?.getAttribute('data-draft-agentic-graph-storage-mode')
    const draftHistoryStorageMode = settingsContainer.querySelector('[data-draft-history-storage-mode]')?.getAttribute('data-draft-history-storage-mode')
    const draftAgenticGraphCloudUrl = settingsContainer.querySelector('[data-draft-agentic-graph-cloud-url]')?.getAttribute('data-draft-agentic-graph-cloud-url')
    const draftHistoryCloudUrl = settingsContainer.querySelector('[data-draft-history-cloud-url]')?.getAttribute('data-draft-history-cloud-url')
    const draftAgenticGraphWorkspacePath = settingsContainer.querySelector('[data-draft-agentic-graph-workspace-path]')?.getAttribute('data-draft-agentic-graph-workspace-path')
    const draftHistoryWorkspacePath = settingsContainer.querySelector('[data-draft-history-workspace-path]')?.getAttribute('data-draft-history-workspace-path')
    const agenticGraphStatus = settingsContainer.querySelector('[data-agentic-graph-status]')?.getAttribute('data-agentic-graph-status')
    const historyStatus = settingsContainer.querySelector('[data-history-status]')?.getAttribute('data-history-status')

    if (
      draftAgenticGraphStorageMode !== 'local' ||
      draftHistoryStorageMode !== 'local' ||
      draftAgenticGraphCloudUrl !== '' ||
      draftHistoryCloudUrl !== '' ||
      draftAgenticGraphWorkspacePath !== AGENTIC_OS_CREATED_PATH ||
      draftHistoryWorkspacePath !== HISTORY_CREATED_PATH
    ) {
      throw new Error(`expected blank-root create-file actions to patch draft local storage state with default-root paths, got ${JSON.stringify({
        draftAgenticGraphStorageMode,
        draftHistoryStorageMode,
        draftAgenticGraphCloudUrl,
        draftHistoryCloudUrl,
        draftAgenticGraphWorkspacePath,
        draftHistoryWorkspacePath,
      })}`)
    }
    if (agenticGraphStatus !== AGENTIC_OS_CREATED_PATH || historyStatus !== HISTORY_CREATED_PATH) {
      throw new Error(`expected blank-root create-file actions to expose default-root workspace path status, got ${JSON.stringify({ agenticGraphStatus, historyStatus })}`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== HISTORY_CREATED_PATH) {
      throw new Error(`expected last created default-root workspace file to become the active editor path, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    }

    const fs = await getWorkspaceFs()
    const agenticGraphText = await fs.readFileText(AGENTIC_OS_CREATED_PATH)
    const historyText = await fs.readFileText(HISTORY_CREATED_PATH)
    if (agenticGraphText !== '' || historyText !== '') {
      throw new Error(`expected blank-root create-file actions to materialize empty default-root workspace files, got ${JSON.stringify({ agenticGraphText, historyText })}`)
    }

    const preApplyChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preApplyChatInspection.available !== true ||
      preApplyChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      preApplyChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      preApplyChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-before-default-root-create.md' ||
      preApplyChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-default-root-create.md'
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline blank-root create state to remain on committed values before Settings apply, got ${JSON.stringify(preApplyChatInspection)}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const appliedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedChatInspection.available !== true ||
      appliedChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== AGENTIC_OS_CREATED_PATH ||
      appliedChatInspection.workspacePaths.chatHistoryWorkspacePath !== HISTORY_CREATED_PATH ||
      appliedChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== null ||
      appliedChatInspection.cloudUrls.chatHistoryCloudUrl !== null
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline blank-root create state to update after Settings apply, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== AGENTIC_OS_CREATED_PATH ||
      useGraphStore.getState().chatHistoryWorkspacePath !== HISTORY_CREATED_PATH ||
      useGraphStore.getState().chatAgenticGraphStorageMode !== 'local' ||
      useGraphStore.getState().chatHistoryStorageMode !== 'local' ||
      useGraphStore.getState().chatLocalStorageRootPath !== CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT
    ) {
      throw new Error(`expected canonical store blank-root create state to commit default-root paths after Settings apply, got ${JSON.stringify({
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
        chatAgenticGraphStorageMode: useGraphStore.getState().chatAgenticGraphStorageMode,
        chatHistoryStorageMode: useGraphStore.getState().chatHistoryStorageMode,
        chatLocalStorageRootPath: useGraphStore.getState().chatLocalStorageRootPath,
      })}`)
    }
  } finally {
    Date.now = originalDateNow
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
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    useMarkdownExplorerStore.getState().setActivePath(null)
    restoreDom()
    restoreWindow()
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
