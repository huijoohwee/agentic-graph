import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import { buildNeutralAgenticOsFixtureDocument } from '@/__tests__/helpers/neutralAgenticOsFixture'
import { executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { useFinalizeAssistantSuccess } from '@/features/chat/floatingPanelChat/useFinalizeAssistantSuccess'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { isAgenticOsStructuredMarkdown } from '@/features/chat/chatHistoryWorkspace'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

const buildSseResponse = (assistantText: string): Response => {
  const encoder = new TextEncoder()
  const chunks = [
    assistantText.slice(0, 480),
    assistantText.slice(480, 1200),
    assistantText.slice(1200),
  ].filter(Boolean)
  const events = [
    {
      model: 'model-a',
      choices: [{
        delta: {
          reasoning_content: 'Validate the AGENTIC_OS document, then materialize it through the shared workspace canvas apply owner.',
        },
      }],
    },
    ...chunks.map(content => ({ choices: [{ delta: { content } }] })),
  ]
  return new Response(
    new ReadableStream({
      start(controller) {
        events.forEach(event => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

export async function testFloatingPanelChatStreamsSseThroughWorkspaceTraceAndFinalCanvasApply() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  const previousFetch = globalThis.fetch
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const resolvedAgenticGraphPaths: string[] = []
  const followedPaths: string[] = []
  const streamingWorkspacePaths: Array<string | null> = []
  const streamingStates: Array<{ path: string | null; text: string }> = []
  const streamingAssistantTexts: string[] = []
  let streamingAssistantState: { id: string; text: string } | null = null

  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    globalThis.fetch = (async () => ({ ok: true, status: 200, headers: new Headers() } as Response)) as typeof fetch

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [messages, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [streamingAssistant, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatAgenticGraph',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260606T000000Z/agenticOs_20260606T000000Z.md',
        chatHistoryWorkspacePath: null,
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: path => { resolvedAgenticGraphPaths.push(path) },
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
        pushChatExchangeLog: () => {},
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      void messages
      void streamingAssistant
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })
    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose callback')

    const requestText = 'Generate a canonical AGENTIC_OS document and stream it into the workspace.'
    const canonical = buildNeutralAgenticOsFixtureDocument({
      timestampMs: Date.UTC(2026, 5, 6, 0, 0, 0),
      workspacePath: '/workspace/chat/20260606T000000Z/agenticOs_20260606T000000Z.md',
      requestText,
      assistantText: 'Create a neutral streaming AGENTIC_OS pipeline that lands through Source Files, Editor Workspace, and Canvas apply.',
      expectationLabel: 'neutral streaming AGENTIC_OS fixture',
    })
    const submitArgs = buildSubmitArgsFixture({
      chatStorageTarget: 'chatAgenticGraph',
      chatLocalStorageRootPath: '/workspace/chat',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260606T000000Z/agenticOs_20260606T000000Z.md',
      setChatAgenticGraphWorkspacePath: path => { resolvedAgenticGraphPaths.push(path) },
      setStreamingWorkspacePath: value => { streamingWorkspacePaths.push(typeof value === 'function' ? null : value) },
      setChatWorkspaceStreamingState: value => {
        streamingStates.push({
          path: String(value?.path || '').trim() || null,
          text: String(value?.text || ''),
        })
        useGraphStore.getState().setChatWorkspaceStreamingState(value)
      },
      setStreamingAssistant: value => {
        streamingAssistantState = typeof value === 'function'
          ? value(streamingAssistantState)
          : value
        streamingAssistantTexts.push(String(streamingAssistantState?.text || ''))
      },
      followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
      finalizeAssistantSuccess,
      abortRef: { current: null },
      streamDraftTextRef: { current: null },
      streamFollowRef: { current: null },
    })

    await act(async () => {
      await executeFloatingPanelChatSubmitCoordinator({
        submitArgs,
        requestUrl: 'https://chat.example.test/v1/chat/completions',
        trimmedInput: requestText,
        assistantMessageId: 'assistant-stream-e2e',
        nextMessages: [{ id: 'user-stream-e2e', role: 'user', content: requestText }],
        requestTimestampMs: Date.UTC(2026, 5, 6, 0, 0, 0),
        traceId: 'trace-stream-e2e',
        buildRequestContext: async () => ({
          packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
          systemMessages: [{ role: 'system', content: 'base-system' }],
          conversationMessages: [{ role: 'user', content: requestText }],
        }),
        createRequestSender: () => async () => buildSseResponse(canonical),
        resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
        executeTransportAttempt: async args => ({
          response: await args.sendChat('model-a', 'max_completion_tokens'),
          effectiveModel: 'model-a',
          detail: null,
        }),
      })
    })

    const canonicalPath = '/workspace/chat/20260606T000000Z/agenticOs_20260606T000000Z.md'
    const tracePath = '/workspace/chat/20260606T000000Z/agentic-os-trace_20260606T000000Z.md'
    const fs = await getWorkspaceFs()
    const canonicalText = String((await fs.readFileText(canonicalPath)) || '')
    const traceText = String((await fs.readFileText(tracePath)) || '')
    const graphState = useGraphStore.getState()

    if (!streamingWorkspacePaths.includes(tracePath)) {
      throw new Error(`expected preflight to target the trace workspace path, got ${JSON.stringify(streamingWorkspacePaths)}`)
    }
    if (!followedPaths.includes(tracePath) || !followedPaths.includes(canonicalPath)) {
      throw new Error(`expected stream flow to follow trace during SSE and canonical after finalize, got ${JSON.stringify(followedPaths)}`)
    }
    const liveTraceState = streamingStates.find(state =>
      state.path === tracePath &&
      state.text.includes('Provider Stream Trace') &&
      state.text.includes('Assistant Draft')
    )
    if (!liveTraceState?.text.includes('Assistant Draft') || !liveTraceState.text.includes('shared workspace canvas apply owner')) {
      throw new Error(`expected live SSE text to enter the trace workspace state, got ${JSON.stringify(streamingStates)}`)
    }
    if (!streamingAssistantTexts.some(text => text.includes('Source Files') && text.includes('Editor Workspace') && text.includes('Canvas'))) {
      throw new Error(`expected streaming assistant state to receive SSE content deltas, got ${JSON.stringify(streamingAssistantTexts)}`)
    }
    const finalStreamingState = streamingStates[streamingStates.length - 1]
    if (finalStreamingState?.path !== null || useGraphStore.getState().chatWorkspaceStreamingPath !== null) {
      throw new Error(`expected terminal success to clear live workspace streaming state, got ${JSON.stringify({
        finalStreamingState,
        storePath: useGraphStore.getState().chatWorkspaceStreamingPath,
      })}`)
    }
    if (!resolvedAgenticGraphPaths.includes(canonicalPath)) {
      throw new Error(`expected finalization to resolve canonical AGENTIC_OS path, got ${JSON.stringify(resolvedAgenticGraphPaths)}`)
    }
    if (!canonicalText.startsWith('---\n') || !isAgenticOsStructuredMarkdown(canonicalText) || !canonicalText.includes('Canvas apply')) {
      throw new Error(`expected canonical AGENTIC_OS workspace file to be persisted, got ${canonicalText.slice(0, 240)}`)
    }
    if (!traceText.includes('AGENTIC_OS Finalization Trace') || traceText.includes('kg-chat-draft:start')) {
      throw new Error(`expected trace companion to retain final trace without stale live draft blocks, got ${traceText.slice(0, 600)}`)
    }
    if (
      !String(graphState.markdownDocumentName || '').endsWith('agenticOs_20260606T000000Z.md') ||
      !isAgenticOsStructuredMarkdown(String(graphState.markdownDocumentText || '')) ||
      !Array.isArray(graphState.graphData?.nodes) ||
      graphState.graphData.nodes.length === 0
    ) {
      throw new Error(`expected finalized SSE AGENTIC_OS to apply into active editor and canvas graph state, got ${JSON.stringify({
        markdownDocumentName: graphState.markdownDocumentName,
        markdownDocumentText: String(graphState.markdownDocumentText || '').slice(0, 120),
        nodeCount: graphState.graphData?.nodes?.length || 0,
      })}`)
    }
  } finally {
    if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window })
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    globalThis.fetch = previousFetch
    restoreDom()
    restoreWindow()
  }
}
