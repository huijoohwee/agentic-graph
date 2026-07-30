import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { useFinalizeAssistantSuccess } from '@/features/chat/floatingPanelChat/useFinalizeAssistantSuccess'
import {
  finalizeHeadlessResponseRun,
  prepareHeadlessResponseRun,
} from '@/features/chat/headlessResponseCoordinator'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testHeadlessChatReceiptsUseResolvedWorkspaceArtifactPaths() {
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { dom, restore: restoreDom } = initJsdomHarness()
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch
  resetWorkspaceFsForTests()

  const runCase = async (args: {
    storageTarget: 'chatHistory' | 'chatKnowgrph'
    assistantId: string
    knowgrphPath: string
    historyPath: string
    expectedArtifactPath: string
  }): Promise<void> => {
    let root: ReturnType<typeof createRoot> | null = null
    let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
    let latestMessages: ChatMessage[] = []
    const prepared = await prepareHeadlessResponseRun({
      runId: `run-${args.assistantId}`,
      source: { kind: 'chat', id: args.assistantId },
      requestText: 'Persist this response with a bounded run receipt.',
      responseContract: args.storageTarget === 'chatKnowgrph' ? 'kgc' : 'plain',
      chatStorageTarget: args.storageTarget,
      provider: 'test-provider',
      model: 'test-model',
    })
    const runResult = finalizeHeadlessResponseRun({
      prepared,
      responseText: 'Workspace-backed response.',
      modelId: 'test-model',
    })

    try {
      const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
      anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
      const container = dom.window.document.createElement('section')
      dom.window.document.body.appendChild(container)
      root = createRoot(container)

      const HookHarness = () => {
        const [messages, setMessages] = React.useState<ChatMessage[]>([{
          id: args.assistantId,
          role: 'assistant',
          content: '',
        }])
        const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
        latestMessages = messages
        const callback = useFinalizeAssistantSuccess({
          chatStorageTarget: args.storageTarget,
          chatProviderSummary: 'test-provider:test-model',
          chatKnowgrphWorkspacePath: args.knowgrphPath,
          chatHistoryWorkspacePath: args.historyPath,
          chatLocalStorageRootPath: '/workspace/chat',
          setChatKnowgrphWorkspacePath: () => {},
          setChatHistoryWorkspacePath: () => {},
          followWorkspaceMarkdownPath: () => {},
          pushChatExchangeLog: () => {},
          setMessages,
          setStreamingAssistant,
          streamFollowRef: React.useRef(null),
          streamDraftTextRef: React.useRef(null),
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
      if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose callback')
      await act(async () => {
        await finalizeAssistantSuccess!({
          assistantMessageId: args.assistantId,
          requestText: prepared.requestText,
          modelId: 'test-model',
          rawAssistantText: runResult.responseText,
          runResult,
          timestampMs: Date.UTC(2026, 6, 29, 9, 0, 0),
          applyWorkspaceDocumentToCanvas: false,
        })
      })
      const receipt = latestMessages.find(message => message.id === args.assistantId)?.headlessResponseRun
      if (receipt?.output.artifactPath !== args.expectedArtifactPath) {
        throw new Error(`expected ${args.storageTarget} receipt to reference ${args.expectedArtifactPath}, got ${JSON.stringify(latestMessages)}`)
      }
    } finally {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
  }

  try {
    await runCase({
      storageTarget: 'chatHistory',
      assistantId: 'assistant-history',
      knowgrphPath: '/workspace/chat/20260729T090000Z/kgc_20260729T090000Z.md',
      historyPath: '/workspace/chat/chh_20260729090000.md',
      expectedArtifactPath: '/workspace/chat/chh_20260729090000.md',
    })
    await runCase({
      storageTarget: 'chatKnowgrph',
      assistantId: 'assistant-kgc',
      knowgrphPath: '/workspace/chat/20260729T090100Z/kgc_20260729T090100Z.md',
      historyPath: '/workspace/chat/chh_20260729090100.md',
      expectedArtifactPath: '/workspace/chat/20260729T090100Z/kgc_20260729T090100Z.md',
    })
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = previousFetch
    restoreDom()
    restoreWindow()
  }
}
