import fs from 'node:fs'
import path from 'node:path'
import { finalizeVideoAgentDemoPresetTerminalStatus } from '@/features/chat/floatingPanelChat/videoAgentDemoPresetSubmit'

const invocation = '/video-agent @video-generation-demo-script @provider.byteplus @text @image @audio @video #spec.low #thinking.type.enabled #token-cap.medium [video-script.md](workspace:/docs/video-script.md)'

export async function testFloatingPanelChatVideoPresetPersistsOnlyTerminalRunStatusWithoutReplacingCanvas() {
  const payloads: Array<{
    rawAssistantText: string
    status?: 'ok' | 'error'
    applyWorkspaceDocumentToCanvas?: boolean
  }> = []
  const common = {
    input: invocation,
    startedResponse: 'Loaded the source-backed canvas.',
    assistantMessageId: 'video-preset-assistant-terminal',
    timestampMs: 1_720_000_000_002,
    modelId: 'byteplus-seedream',
    finalizeAssistantSuccess: async (payload: Parameters<Parameters<typeof finalizeVideoAgentDemoPresetTerminalStatus>[0]['finalizeAssistantSuccess']>[0]) => {
      payloads.push(payload)
    },
  }
  const runningPersisted = await finalizeVideoAgentDemoPresetTerminalStatus({
    ...common,
    status: { phase: 'running', message: 'Run All running 2/3: Image', current: 2, total: 3 },
  })
  if (runningPersisted || payloads.length) {
    throw new Error('non-terminal Run All progress must stay in the live Chat bubble without finalizing a canonical output')
  }
  const completePersisted = await finalizeVideoAgentDemoPresetTerminalStatus({
    ...common,
    status: { phase: 'complete', message: 'Run All complete: ran 3 nodes.', current: 3, total: 3 },
  })
  const payload = payloads[0]
  if (
    !completePersisted
    || payloads.length !== 1
    || payload?.status !== 'ok'
    || payload?.applyWorkspaceDocumentToCanvas !== false
    || !payload?.rawAssistantText.includes('Run All complete: ran 3 nodes.')
  ) {
    throw new Error(`expected one forward-only terminal KGC finalization that preserves the preset graph, got ${JSON.stringify(payloads)}`)
  }

  const finalizerSource = fs.readFileSync(path.join(process.cwd(), 'src', 'features', 'chat', 'floatingPanelChat', 'useFinalizeAssistantSuccess.ts'), 'utf8')
  if (!finalizerSource.includes([
    'if (applyWorkspaceDocumentToCanvas) {',
    '          args.followWorkspaceMarkdownPath(agenticGraphPath, { forceReveal: true })',
    '          canvasApplied = await applyChatKgcWorkspaceDocumentToCanvas(agenticGraphPath)',
  ].join('\n'))) {
    throw new Error('persist-only terminal finalization must suppress both workspace selection and direct canvas apply')
  }
}
