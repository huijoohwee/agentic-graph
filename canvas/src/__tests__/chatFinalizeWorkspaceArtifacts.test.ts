import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { useFinalizeAssistantSuccess } from '@/features/chat/floatingPanelChat/useFinalizeAssistantSuccess'
import { publishLocalChatPipelineSurfaceSnapshot, readLocalChatPipelineSurfaceSnapshot, resetBrowserLocalSurfaceSnapshotsForTests } from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { buildNeutralAgenticOsFixtureDocument } from '@/__tests__/helpers/neutralAgenticOsFixture'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testFinalizeAssistantSuccessAppendsWorkspaceDocumentPathSourceLink() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T191500Z/agenticOs_20260522T191500Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522191500.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        upsertUiToast: useGraphStore.getState().upsertUiToast,
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-memory-user-model',
        requestText: 'Materialize a scoped USER_MODEL document.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            tool: 'agentic-graph.memory.materialize_user_model',
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            document_path: 'data/memory-layer/user-models/user-model-founder.md',
          }, null, 2),
          '```',
        ].join('\n'),
        timestampMs: Date.UTC(2026, 4, 22, 19, 15, 0),
      })
    })

    if (!exchangeLog[0]?.response.includes('/workspace/chat/user-models/user-model-founder.md')) {
      throw new Error(`expected finalize response to include the materialized workspace document path, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!exchangeLog[0]?.response.includes('GENERATED · [Open USER_MODEL in Source Files: user-model-founder.md]')) {
      throw new Error(`expected finalize response to append a generated typed Source Files link for workspace_document_path, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessOrdersWorkspaceArtifactLinksByPriority() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T192000Z/agenticOs_20260522T192000Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522192000.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-artifact-ledger-order',
        requestText: 'Summarize generated artifacts.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            workspace_path: '/workspace/chat/20260522T192000Z/agentic-os-trace_20260522T192000Z.md',
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            workspacePath: '/workspace/chat/20260522T192000Z/agentic-os-output_20260522T192000Z-report.md',
          }, null, 2),
          '```',
        ].join('\n'),
        timestampMs: Date.UTC(2026, 4, 22, 19, 20, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    const userModelIndex = response.indexOf('Open USER_MODEL in Source Files: user-model-founder.md')
    const outputIndex = response.indexOf('Open OUTPUT in Source Files: agentic-os-output_20260522T192000Z-report.md')
    const traceIndex = response.indexOf('Open TRACE in Source Files: agentic-os-trace_20260522T192000Z.md')
    if (userModelIndex < 0 || outputIndex < 0 || traceIndex < 0) {
      throw new Error(`expected finalize response to append all typed artifact links, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!(userModelIndex < outputIndex && outputIndex < traceIndex)) {
      throw new Error(`expected typed artifact links to be ordered by priority, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessDedupesWorkspaceArtifactLinksAcrossOverrideAndToolPayload() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T193000Z/agenticOs_20260522T193000Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522193000.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-artifact-ledger-dedupe',
        requestText: 'Summarize generated user model artifacts.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            workspacePath: 'workspace:/workspace/chat/user-models/user-model-founder.md',
          }, null, 2),
          '```',
        ].join('\n'),
        finalAssistantOverride: [
          '- Materialized profile summary.',
          '- [Open in Source Files: user-model-founder.md](workspace:/workspace/chat/user-models/user-model-founder.md)',
          '- [Open USER_MODEL in Source Files: user-model-founder.md](/workspace/chat/user-models/user-model-founder.md)',
        ].join('\n'),
        timestampMs: Date.UTC(2026, 4, 22, 19, 30, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    const matches = response.match(/\[Open [^\]]+ in Source Files: user-model-founder\.md\]\((?:workspace:)?\/workspace\/chat\/user-models\/user-model-founder\.md\)/g) || []
    if (matches.length !== 1) {
      throw new Error(`expected finalize response to dedupe repeated workspace artifact links, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('GENERATED · [Open USER_MODEL in Source Files: user-model-founder.md]')) {
      throw new Error(`expected deduped workspace artifact link to preserve the typed generated ledger label, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessGroupsWorkspaceArtifactLinksIntoArtifactsBlock() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T194000Z/agenticOs_20260522T194000Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522194000.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-artifacts-block',
        requestText: 'Summarize generated artifacts.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            workspace_path: '/workspace/chat/20260522T194000Z/agentic-os-trace_20260522T194000Z.md',
          }, null, 2),
          '```',
        ].join('\n'),
        finalAssistantOverride: '- Materialized artifacts successfully.',
        timestampMs: Date.UTC(2026, 4, 22, 19, 40, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    if (!response.includes('Artifacts:\n- GENERATED · [Open USER_MODEL in Source Files: user-model-founder.md](/workspace/chat/user-models/user-model-founder.md)\n- GENERATED · [Open TRACE in Source Files: agentic-os-trace_20260522T194000Z.md](/workspace/chat/20260522T194000Z/agentic-os-trace_20260522T194000Z.md)')) {
      throw new Error(`expected finalize response to collect generated workspace links into an Artifacts block, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.startsWith('- Materialized artifacts successfully.\n\nArtifacts:\n')) {
      throw new Error(`expected finalize response to keep narrative content above the Artifacts block, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessReportsPromotionFailureDetails() {
  const previousEnabled = process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED
  const previousFetch = globalThis.fetch
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []
  const observedToasts: Array<{ id: string; kind?: string; message: string; actionLabels: string[] }> = []

  try {
    process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED = '1'
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: false,
      status: 'failed',
      error: 'github_write_failed',
    }), {
      status: 424,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch

    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatAgenticGraph',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md',
        chatHistoryWorkspacePath: null,
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        upsertUiToast: toast => {
          observedToasts.push({
            id: toast.id,
            kind: toast.kind,
            message: toast.message,
            actionLabels: Array.isArray(toast.actions) ? toast.actions.map(action => String(action.label || '').trim()) : [],
          })
          useGraphStore.getState().upsertUiToast(toast)
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    const requestText = 'Generate a canonical AGENTIC_OS document and report promotion failures.'
    publishLocalChatPipelineSurfaceSnapshot({
      messageCount: 1,
      isLoading: false,
      errorText: null,
      connectivity: 'ok',
      connectivityDetail: null,
      chatProviderSummary: 'openai:gpt-4.1-mini',
      chatProviderHint: null,
      chatContextScope: 'workspace',
      chatStorageTarget: 'chatAgenticGraph',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md',
      chatHistoryWorkspacePath: null,
      workspaceViewMode: 'canvas',
      editorWorkspacePane: 'markdown',
      markdownDocumentName: 'workspace:/docs/promotion-failure.md',
      selectedNodeId: null,
      streamingAssistant: null,
      streamingWorkspacePath: null,
      streamFollowPath: '/workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md',
      streamDraft: null,
    })
    const canonical = buildNeutralAgenticOsFixtureDocument({
      timestampMs: Date.UTC(2026, 4, 22, 19, 50, 0),
      workspacePath: '/workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md',
      requestText,
      assistantText: 'Create a neutral AGENTIC_OS pipeline that persists locally and reports mirror failures in the ledger.',
      expectationLabel: 'promotion failure ledger fixture',
    })

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-promotion-failure',
        requestText,
        modelId: 'model-a',
        rawAssistantText: canonical,
        validatedAgenticOs: canonical,
        timestampMs: Date.UTC(2026, 4, 22, 19, 50, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    const inspectedPipeline = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (!response.includes('PROMOTION_FAILED · [Open AGENTIC_OS in Source Files: agenticOs_20260522T195000Z.md]')) {
      throw new Error(`expected finalize response to mark the canonical AGENTIC_OS artifact as promotion failed, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('Promotion note: mirroring failed (github: github_write_failed; storage: skipped).')) {
      throw new Error(`expected finalize response to include the promotion failure detail note, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('Retry hint: verify the GitHub write route/config, or rerun with GitHub mirroring disabled for a local-only save.')) {
      throw new Error(`expected finalize response to include a recovery hint for GitHub mirroring failures, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md /workspace/chat/20260522T195000Z/agentic-os-trace_20260522T195000Z.md`')) {
      throw new Error(`expected finalize response to include an exact retry command for the saved local artifacts, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (
      inspectedPipeline.finalize.failureNote !== '- Promotion note: mirroring failed (github: github_write_failed; storage: skipped).'
      || inspectedPipeline.finalize.retryHint !== '- Retry hint: verify the GitHub write route/config, or rerun with GitHub mirroring disabled for a local-only save.'
      || inspectedPipeline.finalize.retryCommand !== '- Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md /workspace/chat/20260522T195000Z/agentic-os-trace_20260522T195000Z.md`'
    ) {
      throw new Error(`expected local chat pipeline inspection to expose promotion recovery diagnostics, got: ${JSON.stringify(inspectedPipeline.finalize)}`)
    }
    if (
      inspectedPipeline.promotionRecovery?.available !== true
      || inspectedPipeline.promotionRecovery?.scope !== 'mirror-saved-local-artifacts-only'
      || inspectedPipeline.promotionRecovery?.retryCommand !== '#promotion.retry /workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md /workspace/chat/20260522T195000Z/agentic-os-trace_20260522T195000Z.md'
      || inspectedPipeline.promotionRecovery?.retryCommandLine !== '- Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md /workspace/chat/20260522T195000Z/agentic-os-trace_20260522T195000Z.md`'
      || inspectedPipeline.promotionRecovery?.insertionMode !== 'append'
      || inspectedPipeline.promotionRecovery?.reusesSavedLocalArtifacts !== true
      || inspectedPipeline.promotionRecovery?.rerunsValidation !== false
      || inspectedPipeline.promotionRecovery?.reappliesCanvas !== false
      || inspectedPipeline.promotionRecovery?.githubBeforeStorage !== true
      || !Array.isArray(inspectedPipeline.promotionRecovery?.surfaces)
      || !inspectedPipeline.promotionRecovery.surfaces.includes('warning-toast')
    ) {
      throw new Error(`expected local chat pipeline inspection to expose the promotion retry operator contract, got: ${JSON.stringify(inspectedPipeline.promotionRecovery)}`)
    }
    const retryToast = observedToasts.find(toast => toast.id === 'chat-promotion-retry:/workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md') || null
    if (
      !retryToast
      || retryToast.kind !== 'warning'
      || !String(retryToast.message || '').includes('Artifact mirroring failed for the saved local artifacts.')
      || !String(retryToast.message || '').includes('Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md /workspace/chat/20260522T195000Z/agentic-os-trace_20260522T195000Z.md`')
      || !retryToast.actionLabels.includes('Insert Retry Command')
    ) {
      throw new Error(`expected finalize promotion failure to upsert a warning toast with the exact retry command, got: ${JSON.stringify(observedToasts)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    globalThis.fetch = previousFetch
    restoreDom()
    restoreWindow()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED
  }
}
