import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import {
  clearActiveDurableChatStreamRun,
  projectDurableChatHeadlessPreparationSeed,
  readActiveDurableChatStreamRun,
  restoreDurableChatHeadlessPreparation,
  writeActiveDurableChatStreamRun,
} from '@/features/chat/floatingPanelChat/floatingPanelChatDurableStream'
import { buildDurableChatResumedHeadlessRunResult } from '@/features/chat/floatingPanelChat/useResumeDurableChatStream'
import {
  prepareHeadlessResponseRun,
  projectHeadlessResponseRunReceipt,
} from '@/features/chat/headlessResponseCoordinator'
import { AGENTIC_OS_DOCS_MCP_TOOL_NAME } from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForTasks } from '@/tests/lib/reactRootHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'

const findFooterButton = (container: Element, label: string): HTMLButtonElement | null => {
  return (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
    .find(button => String(button.textContent || '').trim() === label) || null
}

export async function testFloatingPanelChatDurableResumeRestoresBoundedHeadlessReceiptWithoutMcpReplay() {
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  const assistantMessageId = 'assistant-durable-headless'
  const requestText = '/agentic-graph.probe-tree Compare the retained options.'
  let mcpCalls = 0
  try {
    const prepared = await prepareHeadlessResponseRun({
      runId: assistantMessageId,
      source: { kind: 'chat', id: assistantMessageId },
      requestText,
      responseContract: 'agenticOs',
      chatStorageTarget: 'chatAgenticGraph',
      provider: 'test-provider',
      model: 'test-model',
    }, {
      invokeDocsMcp: async request => {
        mcpCalls += 1
        return {
          ok: true,
          tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
          mcpInvoked: true,
          invocations: request.invocationTokens.map(token => ({
            token,
            ok: true,
            summary: 'This resolution detail must not enter the durable seed.',
            sourcePath: 'DICTIONARY-COMMAND.md#test-only',
          })),
        }
      },
    })
    const seed = projectDurableChatHeadlessPreparationSeed(prepared)
    const active = writeActiveDurableChatStreamRun({
      runId: 'trace-durable-headless',
      traceId: 'trace-durable-headless',
      assistantMessageId,
      requestText,
      requestTimestampMs: Date.UTC(2026, 6, 29, 9, 0, 0),
      chatStorageTarget: 'chatAgenticGraph',
      liveAgenticOsPath: '/workspace/chat/durable/agenticOs.md',
      providerSummary: 'test-provider:test-model',
      defaultLocalRootPath: '/workspace/chat',
      modelId: 'test-model',
      headlessPreparationSeed: seed,
    })
    const hydrated = readActiveDurableChatStreamRun()
    const restoredPreparation = restoreDurableChatHeadlessPreparation(
      hydrated?.headlessPreparationSeed,
      {
        requestText: hydrated?.requestText || '',
        expectedRunId: assistantMessageId,
        expectedAssistantMessageId: assistantMessageId,
      },
    )
    const resumedResult = buildDurableChatResumedHeadlessRunResult({
      prepared: restoredPreparation,
      responseText: 'Resumed response.',
      status: 'ok',
      modelId: hydrated?.modelId || null,
      artifactPath: hydrated?.liveAgenticOsPath || null,
    })
    const receipt = resumedResult ? projectHeadlessResponseRunReceipt(resumedResult) : null
    const serializedSeed = JSON.stringify(hydrated?.headlessPreparationSeed || null)
    if (
      !seed
      || !active
      || mcpCalls !== 1
      || hydrated?.runId !== 'trace-durable-headless'
      || hydrated.headlessPreparationSeed?.runId !== assistantMessageId
      || restoredPreparation?.invocation.tokens.join(' ') !== '/agentic-graph.probe-tree'
      || restoredPreparation?.invocation.mcpResponse?.invocations[0]?.token !== '/agentic-graph.probe-tree'
      || resumedResult?.status !== 'ok'
      || resumedResult?.invocation.mcpInvoked !== true
      || resumedResult?.invocation.tool !== AGENTIC_OS_DOCS_MCP_TOOL_NAME
      || receipt?.output.artifactPath !== '/workspace/chat/durable/agenticOs.md'
      || serializedSeed.includes('resolution detail')
      || serializedSeed.includes('sourcePath')
      || serializedSeed.includes(requestText)
      || serializedSeed.includes('systemMessages')
      || restoreDurableChatHeadlessPreparation(hydrated?.headlessPreparationSeed, {
        requestText,
        expectedRunId: 'different-assistant',
        expectedAssistantMessageId: assistantMessageId,
      }) !== null
    ) {
      throw new Error(`expected durable resume to reuse one compact validated preparation seed without replaying MCP, got ${JSON.stringify({
        mcpCalls,
        seed,
        active,
        hydrated,
        resumedResult,
        receipt,
      })}`)
    }
  } finally {
    clearActiveDurableChatStreamRun()
    restore()
  }
}

export async function testFloatingPanelChatDurableResumeSettlesBeforeNewChat() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setChatStorageTarget('chatAgenticGraph')
  useGraphStore.getState().setChatAgenticGraphWorkspacePath('/workspace/chat/20260707T000000Z/agenticOs_20260707T000000Z.md')
  useMarkdownExplorerStore.getState().setActivePath(null)
  writeActiveDurableChatStreamRun({
    runId: 'resume-loop-guard',
    traceId: 'resume-loop-guard',
    assistantMessageId: 'assistant-resume-loop-guard',
    requestText: 'resume this stream',
    requestTimestampMs: Date.UTC(2026, 6, 7),
    chatStorageTarget: 'chatAgenticGraph',
    liveAgenticOsPath: '/workspace/chat/20260707T000000Z/agenticOs_20260707T000000Z.md',
    providerSummary: 'Test Provider',
    defaultLocalRootPath: '/workspace/chat',
    modelId: 'gpt-5-nano',
  })

  try {
    await mountReactRoot(root, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 2,
      tasks: 2,
    })
    let newChatButton: HTMLButtonElement | null = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await act(async () => {
        await waitForTasks(1)
        await waitForFrames(dom.window as unknown as Window, 1)
      })
      newChatButton = findFooterButton(container, 'New Chat')
      if (newChatButton && !newChatButton.disabled) break
    }
    if (!newChatButton) throw new Error('expected FloatingPanel chat to render the New Chat command')
    if (newChatButton.disabled) throw new Error('expected durable resume failure to settle and re-enable New Chat')
    if (findFooterButton(container, 'Sending…')) {
      throw new Error('expected durable resume failure to leave the footer out of Sending state')
    }
    if (!String(container.textContent || '').includes('resume this stream')) {
      throw new Error('expected durable resume to keep the active request prompt visible')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    clearActiveDurableChatStreamRun('resume-loop-guard')
    container.remove()
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}

export function testFloatingPanelChatStopFinalizesDurableResumeState() {
  const componentSource = readFileSync(resolve(process.cwd(), 'src/features/chat/FloatingPanelChat.tsx'), 'utf8')
  if (!componentSource.includes('stopFloatingPanelChatStream({')) {
    throw new Error('expected FloatingPanelChat Stop handler to delegate to the shared durable stop finalizer')
  }
  const stopSource = readFileSync(resolve(process.cwd(), 'src/features/chat/floatingPanelChat/floatingPanelChatStop.ts'), 'utf8')
  if (!stopSource.includes('clearActiveDurableChatStreamRun(activeDurableRun.runId)')) {
    throw new Error('expected Stop to clear the active durable chat stream run')
  }
  if (!stopSource.includes('abortDurableChatStreamRun(activeDurableRun.runId)')) {
    throw new Error('expected Stop to abort the active durable chat stream run')
  }
  if (!stopSource.includes('finalizeSubmitTerminalState(args)')) {
    throw new Error('expected Stop to finalize local loading state even when a durable resume has no AbortController')
  }
  if (!stopSource.includes('setStreamingAssistant(null)') || !stopSource.includes('setStreamingInsights(null)')) {
    throw new Error('expected Stop to clear transient streaming assistant and insight state')
  }
}

export async function testFloatingPanelChatStreamingPromptSurvivesGraphHistoryKeyChurn() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const originalFetch = globalThis.fetch
  let fetchStarted = false
  let rejectPending: ((error: Error) => void) | null = null
  const promptText = '/prd-tad.create airvio_.JPEG'
  const findPromptBubble = () => {
    return (Array.from(container.querySelectorAll('.kg-floating-chat-message-bubble')) as HTMLElement[])
      .find(element => String(element.textContent || '').includes(promptText)) || null
  }

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/__agentic_os_fs_write')) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    if (String(init?.method || 'GET').toUpperCase() !== 'POST') {
      const body = String(input).includes('policies') ? { policies: [] } : { memberships: [] }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    return new Promise<Response>((_resolve, reject) => {
      fetchStarted = true
      rejectPending = reject
      const signal = init?.signal || null
      if (signal?.aborted) {
        reject(new Error('Aborted'))
        return
      }
      signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
    })
  }) as typeof fetch

  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setChatStorageTarget('chatAgenticGraph')
  useGraphStore.getState().setChatAgenticGraphWorkspacePath(null)
  useGraphStore.getState().setChatProvider('lmstudio-local')
  useGraphStore.getState().setChatModel('gpt-5-nano')
  useGraphStore.getState().setGraphData({
    context: '',
    type: 'Graph',
    nodes: [{ id: 'node-a', label: 'A', type: 'Node', properties: {} }],
    edges: [],
  } as never)
  useMarkdownExplorerStore.getState().setActivePath(null)

  try {
    await mountReactRoot(root, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 2,
      tasks: 1,
    })
    const input = container.querySelector('[data-kg-chat-input="1"]') as HTMLElement | null
    if (!input) throw new Error('expected FloatingPanel chat input to render')
    await act(async () => {
      input.textContent = promptText
      Simulate.input(input)
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    const form = input.closest('form') as HTMLFormElement | null
    if (!form) throw new Error('expected FloatingPanel chat input to be inside a form')
    await act(async () => {
      Simulate.submit(form)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (fetchStarted && findPromptBubble()) break
        await waitForTasks(1)
        await waitForFrames(dom.window as unknown as Window, 1)
      }
    })
    if (!fetchStarted) throw new Error('expected chat submit to reach the streaming transport')
    if (!findPromptBubble()) throw new Error('expected optimistic user prompt bubble to render before graph churn')

    await act(async () => {
      useGraphStore.getState().setGraphData({
        context: '',
        type: 'Graph',
        nodes: [
          { id: 'node-a', label: 'A', type: 'Node', properties: {} },
          { id: 'node-b', label: 'B', type: 'Node', properties: {} },
        ],
        edges: [],
      } as never)
      await waitForTasks(2)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    if (!findPromptBubble()) {
      throw new Error('expected active stream prompt bubble to survive graph-derived history key churn')
    }
  } finally {
    rejectPending?.(new Error('test cleanup'))
    globalThis.fetch = originalFetch
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}

export async function testFloatingPanelChatNewChatStopsSendingAndCreatesFreshSessionFolder() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const originalFetch = globalThis.fetch
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  let fetchStarted = false
  let abortObserved = false
  let mirroredWorkspacePath = ''
  let rejectPending: ((error: Error) => void) | null = null
  process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = '/tmp/agentic-graph-floating-panel-chat-log'
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/__agentic_os_fs_write')) {
      const body = String(init?.body || '')
      const match = /"path":"([^"]+)"/.exec(body)
      mirroredWorkspacePath = match ? match[1] || '' : body
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    if (String(init?.method || 'GET').toUpperCase() !== 'POST') {
      const body = String(input).includes('policies') ? { policies: [] } : { memberships: [] }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    return new Promise<Response>((_resolve, reject) => {
      fetchStarted = true
      rejectPending = reject
      const signal = init?.signal || null
      if (signal?.aborted) {
        abortObserved = true
        reject(new Error('Aborted'))
        return
      }
      signal?.addEventListener('abort', () => {
        abortObserved = true
        reject(new Error('Aborted'))
      }, { once: true })
    })
  }) as typeof fetch
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setChatStorageTarget('chatAgenticGraph')
  useGraphStore.getState().setChatAgenticGraphWorkspacePath(null)
  useGraphStore.getState().setChatProvider('lmstudio-local')
  useGraphStore.getState().setChatModel('gpt-5-nano')
  useMarkdownExplorerStore.getState().setActivePath(null)

  try {
    await mountReactRoot(root, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 2,
      tasks: 1,
    })
    const input = container.querySelector('[data-kg-chat-input="1"]') as HTMLElement | null
    if (!input) throw new Error('expected FloatingPanel chat input to render')
    await act(async () => {
      input.textContent = '/prd-tad.create #media @operator'
      Simulate.input(input)
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    const form = input.closest('form') as HTMLFormElement | null
    if (!form) throw new Error('expected FloatingPanel chat input to be inside a form')
    await act(async () => {
      Simulate.submit(form)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (fetchStarted) break
        await waitForTasks(1)
        await waitForFrames(dom.window as unknown as Window, 1)
      }
    })
    if (!fetchStarted) throw new Error('expected chat submit to reach the streaming transport')
    let streamingPath = String(useGraphStore.getState().chatAgenticGraphWorkspacePath || '')
    for (let attempt = 0; attempt < 40 && !streamingPath; attempt += 1) {
      await act(async () => {
        await waitForTasks(1)
        await waitForFrames(dom.window as unknown as Window, 1)
      })
      streamingPath = String(useGraphStore.getState().chatAgenticGraphWorkspacePath || '')
    }
    if (!streamingPath) throw new Error('expected chat submit preflight to allocate the first AGENTIC_OS workspace path')
    const newChatButton = findFooterButton(container, 'New Chat')
    if (!newChatButton) throw new Error('expected New Chat to remain rendered while Sending')
    if (newChatButton.disabled) throw new Error('expected New Chat to stay enabled while Sending so it can allocate a fresh chat-log session')
    await act(async () => {
      newChatButton.click()
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const nextPath = String(useGraphStore.getState().chatAgenticGraphWorkspacePath || '')
        if (nextPath && nextPath !== streamingPath) break
        await waitForTasks(1)
        await waitForFrames(dom.window as unknown as Window, 1)
      }
    })
    if (!abortObserved) throw new Error('expected New Chat to abort the active Sending request before switching sessions')
    const freshPath = String(useGraphStore.getState().chatAgenticGraphWorkspacePath || '')
    if (!/^\/.+\/\d{8}T\d{6}Z\/agenticOs_\d{8}T\d{6}Z\.md$/.test(freshPath) || freshPath === streamingPath) {
      throw new Error(`expected New Chat while Sending to allocate a fresh canonical AGENTIC_OS workspace path, got ${JSON.stringify(freshPath)}`)
    }
    const parts = freshPath.split('/').filter(Boolean)
    const folderSession = parts[parts.length - 2]
    const fileSession = /^agenticOs_(\d{8}T\d{6}Z)\.md$/i.exec(parts[parts.length - 1] || '')?.[1]
    if (folderSession !== fileSession) throw new Error(`expected AGENTIC_OS folder and filename session ids to match, got ${JSON.stringify(freshPath)}`)
    if (!mirroredWorkspacePath.endsWith(`/${folderSession}/agenticOs_${fileSession}.md`)) {
      throw new Error(`expected New Chat to mirror the fresh canonical AGENTIC_OS path, got ${mirroredWorkspacePath} for ${freshPath}`)
    }
    const workspaceFileText = await (await getWorkspaceFs()).readFileText(freshPath)
    if (workspaceFileText !== '') throw new Error(`expected fresh New Chat AGENTIC_OS file to start empty, got ${JSON.stringify(workspaceFileText)}`)
    if (findFooterButton(container, 'Sending…')) throw new Error('expected New Chat to leave the footer out of Sending state')
  } finally {
    rejectPending?.(new Error('test cleanup'))
    globalThis.fetch = originalFetch
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}
