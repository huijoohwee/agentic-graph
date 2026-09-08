import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { withFetchAndEnv, withStoreMirrorState } from './helpers/workspaceSeedMirrorHarness'
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

const boundedChatOperation = async <T,>(operation: Promise<T>, stage = 'operation'): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Owned chat fixture ${stage} did not finish within 5 seconds`)), 5000)
  })]) } finally { clearTimeout(timer) }
}
const chatSignal = () => {
  let resolve!: () => void
  const promise = new Promise<void>(accept => { resolve = accept })
  return { promise, resolve }
}
const observeChatTerminal = (container: Element, predicate: () => boolean) => {
  const signal = chatSignal(), observer = new container.ownerDocument.defaultView!.MutationObserver(() => check())
  const check = () => { if (predicate()) signal.resolve() }
  const unsubscribe = useGraphStore.subscribe(check)
  observer.observe(container, { subtree: true, childList: true, attributes: true })
  check()
  return { wait: () => boundedChatOperation(signal.promise, 'terminal state'), close: () => { unsubscribe(); observer.disconnect() } }
}
const withLocalChatWorkspace = async (run: (fixture: { prepare(): Promise<void>; drain(): Promise<void>; readChatFile(path: string): Promise<string>; log: ReturnType<typeof chatSignal> }) => Promise<void>) => {
  const tempRoot = await fsPromises.mkdtemp(join(tmpdir(), 'graph-chat-owner-')), docsRoot = join(tempRoot, 'docs')
  const pending = new Set<Promise<Response>>(), failures = new Set<unknown>(), unexpected: string[] = [], log = chatSignal()
  let closed = false
  try {
    await fsPromises.mkdir(docsRoot)
    await fsPromises.writeFile(join(docsRoot, 'fixture.md'), '# Owned local chat fixture\n')
    const fetcher = (async (input, init) => {
      if (closed) { const error = new Error('Chat fixture request arrived after terminal teardown'); failures.add(error); throw error }
      const route = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost').pathname
      const operation = (async () => {
        if (route.startsWith('/@fs/')) {
          const target = resolve(decodeURIComponent(route.slice(4)))
          if (!target.startsWith(tempRoot + '/')) throw new Error('Chat fixture read escaped its owned temporary root')
          try { return new Response(await fsPromises.readFile(target, 'utf8')) }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response('', { status: 404 }); throw error }
        }
        if (route === '/__agentic_os_fs_list') {
          if (JSON.parse(String(init?.body || '{}')).path !== docsRoot) return Response.json({ ok: false }, { status: 404 })
          return Response.json({ ok: true, files: [{ relPath: 'fixture.md', text: await fsPromises.readFile(join(docsRoot, 'fixture.md'), 'utf8'), updatedAtMs: 1 }] })
        }
        if (route === '/__agentic_os_fs_write') {
          const body = JSON.parse(String(init?.body || '{}')), target = resolve(String(body.path || ''))
          if (!target.startsWith(tempRoot + '/')) throw new Error('Chat fixture write escaped its owned temporary root')
          await fsPromises.mkdir(typeof body.text === 'string' ? dirname(target) : target, { recursive: true })
          if (typeof body.text === 'string') await fsPromises.writeFile(target, body.text)
          return Response.json({ ok: true })
        }
        if (route === '/__chat_log_append') {
          await fsPromises.appendFile(join(tempRoot, 'exchange.jsonl'), String(init?.body || '') + '\n')
          log.resolve(); return Response.json({ ok: true })
        }
        unexpected.push(route); throw new Error(`Unexpected chat fixture route: ${route}`)
      })()
      pending.add(operation)
      try { return await operation } catch (error) { failures.add(error); throw error } finally { pending.delete(operation) }
    }) as typeof fetch
    const drain = async () => {
      // Drain native local IO even after a UI deadline fails; never abandon a sibling write.
      while (pending.size) await Promise.allSettled([...pending])
      if (failures.size || unexpected.length) throw new AggregateError([...failures], [...failures].map(error => String((error as Error)?.message || error)).join('; ') || `Unowned chat requests: ${unexpected.join(', ')}`)
    }
    await withStoreMirrorState(() => withFetchAndEnv({
      VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: docsRoot, VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: docsRoot,
      VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT: join(tempRoot, 'chat'), VITE_AGENTIC_OS_STORAGE_BASE_URL: '',
      VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL: 'false', VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: 'false',
    }, fetcher, async () => {
      try { await run({ log, drain, readChatFile: async workspacePath => {
        if (!/^\/chat-log\/\d{8}T\d{6}Z\/agenticOs_\d{8}T\d{6}Z\.md$/.test(workspacePath)) throw new Error('Expected a canonical chat artifact path')
        return fsPromises.readFile(join(tempRoot, 'chat', workspacePath.slice('/chat-log/'.length)), 'utf8')
      }, prepare: async () => {
        useGraphStore.setState({ sourceFiles: [], localMarkdownFolderHandle: null, localMarkdownFolderCacheId: null, localMarkdownSelectedFolderPath: docsRoot })
        await boundedChatOperation(getWorkspaceFs())
      } }) } catch (error) { failures.add(error); throw error } finally { closed = true; await drain() }
    }))
  } finally { await fsPromises.rm(tempRoot, { recursive: true, force: true }) }
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
  await withLocalChatWorkspace(async fixture => {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const originalFetch = globalThis.fetch
  let fetchStarted = false
  const transport = chatSignal()
  let terminal: ReturnType<typeof observeChatTerminal> | undefined
  let removeAbortListener = () => {}
  let rejectPending: ((error: Error) => void) | null = null
  const promptText = '/prd-tad.create airvio_.JPEG'
  const findPromptBubble = () => {
    return (Array.from(container.querySelectorAll('.kg-floating-chat-message-bubble')) as HTMLElement[])
      .find(element => String(element.textContent || '').includes(promptText)) || null
  }

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const route = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost').pathname
    if (route !== '/__chat_proxy/v1/responses' || String(init?.method || 'GET').toUpperCase() !== 'POST') return originalFetch(input, init)
    return new Promise<Response>((_resolve, reject) => {
      fetchStarted = true
      transport.resolve()
      rejectPending = reject
      const signal = init?.signal || null
      if (signal?.aborted) {
        reject(new Error('Aborted'))
        return
      }
      const onAbort = () => reject(new Error('Aborted'))
      signal?.addEventListener('abort', onAbort, { once: true })
      removeAbortListener = () => signal?.removeEventListener('abort', onAbort)
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
    await fixture.prepare()
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
    let observedSending = false
    terminal = observeChatTerminal(container, () => {
      const sending = Boolean(findFooterButton(container, 'Sending…')) || useGraphStore.getState().chatWorkspaceStreamingPath != null
      observedSending ||= sending
      return fetchStarted && observedSending && !sending
    })
    await act(async () => { Simulate.submit(form); await boundedChatOperation(transport.promise) })
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
    try {
      await act(async () => {
        rejectPending?.(new Error('test cleanup'))
        if (fetchStarted) await boundedChatOperation(fixture.log.promise)
      })
      if (fetchStarted) await terminal?.wait()
      await fixture.drain()
    } finally {
      terminal?.close(); removeAbortListener()
      try {
        try { await unmountReactRoot(root, { window: dom.window as unknown as Window }) } finally { await fixture.drain() }
      }
      finally {
        globalThis.fetch = originalFetch; container.remove(); useMarkdownExplorerStore.getState().setActivePath(null)
        useGraphStore.getState().resetAll(); resetWorkspaceFsForTests(); restore()
      }
    }
  }
  })
}

export async function testFloatingPanelChatNewChatStopsSendingAndCreatesFreshSessionFolder() {
  await withLocalChatWorkspace(async fixture => {
  const { dom, restore } = initJsdomHarness(), doc = dom.window.document
  const container = doc.createElement('section'); doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement), originalFetch = globalThis.fetch
  const transport = chatSignal()
  let fetchStarted = false, abortObserved = false
  let rejectPending: ((error: Error) => void) | null = null
  let removeAbortListener = () => {}
  let terminal: ReturnType<typeof observeChatTerminal> | undefined
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const route = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost').pathname
    if (route !== '/__chat_proxy/v1/responses' || String(init?.method || 'GET').toUpperCase() !== 'POST') return originalFetch(input, init)
    return new Promise<Response>((_resolve, reject) => {
      fetchStarted = true; transport.resolve(); rejectPending = reject
      const signal = init?.signal || null
      const onAbort = () => { abortObserved = true; reject(new Error('Aborted')) }
      if (signal?.aborted) { onAbort(); return }
      signal?.addEventListener('abort', onAbort, { once: true })
      removeAbortListener = () => signal?.removeEventListener('abort', onAbort)
    })
  }) as typeof fetch
  resetWorkspaceFsForTests(); useGraphStore.getState().resetAll()
  useGraphStore.getState().setChatStorageTarget('chatAgenticGraph')
  useGraphStore.getState().setChatAgenticGraphWorkspacePath(null)
  useGraphStore.getState().setChatProvider('lmstudio-local')
  useGraphStore.getState().setChatModel('gpt-5-nano')
  useMarkdownExplorerStore.getState().setActivePath(null)
  try {
    await fixture.prepare()
    await mountReactRoot(root, React.createElement(FloatingPanelChat), { window: dom.window as unknown as Window, frames: 2, tasks: 1 })
    const input = container.querySelector('[data-kg-chat-input="1"]') as HTMLElement | null
    if (!input) throw new Error('expected FloatingPanel chat input to render')
    await act(async () => {
      input.textContent = '/prd-tad.create #media @operator'; Simulate.input(input)
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    const form = input.closest('form') as HTMLFormElement | null
    if (!form) throw new Error('expected FloatingPanel chat input to be inside a form')
    await act(async () => { Simulate.submit(form); await boundedChatOperation(transport.promise) })
    if (!fetchStarted) throw new Error('expected chat submit to reach the streaming transport')
    const streamingPath = String(useGraphStore.getState().chatAgenticGraphWorkspacePath || '')
    if (!streamingPath) throw new Error('expected chat submit preflight to allocate the first AGENTIC_OS workspace path')
    const newChatButton = findFooterButton(container, 'New Chat')
    if (!newChatButton) throw new Error('expected New Chat to remain rendered while Sending')
    if (newChatButton.disabled) throw new Error('expected New Chat to stay enabled while Sending so it can allocate a fresh chat-log session')
    terminal = observeChatTerminal(container, () => {
      const nextPath = useGraphStore.getState().chatAgenticGraphWorkspacePath
      return Boolean(nextPath && nextPath !== streamingPath) && useGraphStore.getState().workspaceViewMode === 'editor' && !findFooterButton(container, 'Sending…')
    })
    // Let act commit the Sending-state update before waiting for its DOM projection.
    await act(async () => { newChatButton.click() })
    await terminal.wait()
    if (!abortObserved) throw new Error('expected New Chat to abort the active Sending request before switching sessions')
    await boundedChatOperation(fixture.log.promise); await fixture.drain()
    const freshPath = String(useGraphStore.getState().chatAgenticGraphWorkspacePath || '')
    if (!/^\/.+\/\d{8}T\d{6}Z\/agenticOs_\d{8}T\d{6}Z\.md$/.test(freshPath) || freshPath === streamingPath) {
      throw new Error(`expected New Chat while Sending to allocate a fresh canonical AGENTIC_OS workspace path, got ${JSON.stringify(freshPath)}`)
    }
    const parts = freshPath.split('/').filter(Boolean), folderSession = parts[parts.length - 2]
    const fileSession = /^agenticOs_(\d{8}T\d{6}Z)\.md$/i.exec(parts[parts.length - 1] || '')?.[1]
    if (folderSession !== fileSession) throw new Error(`expected AGENTIC_OS folder and filename session ids to match, got ${JSON.stringify(freshPath)}`)
    if (await fixture.readChatFile(freshPath) !== '') throw new Error('expected the completed canonical New Chat mirror file to exist with empty bytes')
    const workspaceFileText = await (await getWorkspaceFs()).readFileText(freshPath)
    if (workspaceFileText !== '') throw new Error(`expected fresh New Chat AGENTIC_OS file to start empty, got ${JSON.stringify(workspaceFileText)}`)
    if (findFooterButton(container, 'Sending…')) throw new Error('expected New Chat to leave the footer out of Sending state')
  } finally {
    try {
      await act(async () => { rejectPending?.(new Error('test cleanup')); if (fetchStarted) await boundedChatOperation(fixture.log.promise) })
      await fixture.drain()
    } finally {
      terminal?.close(); removeAbortListener()
      try { await unmountReactRoot(root, { window: dom.window as unknown as Window }); await fixture.drain() }
      finally {
        globalThis.fetch = originalFetch; container.remove(); useMarkdownExplorerStore.getState().setActivePath(null)
        useGraphStore.getState().resetAll(); resetWorkspaceFsForTests(); restore()
      }
    }
  }
  })
}

export async function testFloatingPanelChatNewChatCreatesAndFollowsCanonicalWorkspaceFile() {
  await withLocalChatWorkspace(async fixture => {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setWorkspaceViewMode('canvas')
  useGraphStore.getState().setEditorWorkspacePane('markdown')
  useGraphStore.getState().setChatStorageTarget('chatAgenticGraph')
  useGraphStore.getState().setChatAgenticGraphWorkspacePath(null)
  useMarkdownExplorerStore.getState().setActivePath(null)
  let terminal: ReturnType<typeof observeChatTerminal> | undefined
  try {
    await fixture.prepare()
    await mountReactRoot(root, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 2,
      tasks: 1,
    })
    const newChatButton = (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
      .find(button => String(button.textContent || '').trim() === 'New Chat') as HTMLButtonElement | undefined
    if (!newChatButton) throw new Error('expected FloatingPanel chat to render the New Chat command')
    terminal = observeChatTerminal(container, () => Boolean(useGraphStore.getState().chatAgenticGraphWorkspacePath) && useGraphStore.getState().workspaceViewMode === 'editor')
    await act(async () => { newChatButton.click(); await terminal!.wait() })
    await fixture.drain()
    const state = useGraphStore.getState()
    const chatPath = String(state.chatAgenticGraphWorkspacePath || '')
    if (state.workspaceViewMode !== 'editor') throw new Error(`expected New Chat to open editor workspace, got ${state.workspaceViewMode}`)
    if (!/^\/.+\/\d{8}T\d{6}Z\/agenticOs_\d{8}T\d{6}Z\.md$/.test(chatPath)) {
      throw new Error(`expected New Chat to allocate canonical AGENTIC_OS workspace path, got ${JSON.stringify(chatPath)}`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== chatPath) throw new Error('expected New Chat to select the canonical AGENTIC_OS workspace file')
    const workspaceFileText = await (await getWorkspaceFs()).readFileText(chatPath)
    if (workspaceFileText !== '') throw new Error(`expected New Chat to create an empty canonical AGENTIC_OS workspace file, got ${JSON.stringify(workspaceFileText)}`)
  } finally {
    terminal?.close()
    try {
        try { await unmountReactRoot(root, { window: dom.window as unknown as Window }) } finally { await fixture.drain() }
      }
    finally {
      container.remove(); useMarkdownExplorerStore.getState().setActivePath(null)
      useGraphStore.getState().resetAll(); resetWorkspaceFsForTests(); restore()
    }
  }
  })
}
