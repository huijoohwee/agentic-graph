import { bootstrapAgenticGraphSubmitDraft } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitPreflight'
import { buildSubmitArgsFixture } from './helpers/chatSubmitArgsFixture'

export async function testBootstrapAgenticGraphSubmitDraftPublishesLiveEditorStateWithoutSeedPersistence() {
  const streamingStates: Array<{ path: string | null; text: string }> = []
  const followed: string[] = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T171500Z/kgc_20260522T171500Z.md',
    setChatAgenticGraphWorkspacePath: () => undefined,
    setStreamingWorkspacePath: () => undefined,
    setChatWorkspaceStreamingState: value => {
      streamingStates.push({
        path: String(value?.path || '').trim() || null,
        text: String(value?.text || ''),
      })
    },
    followWorkspaceMarkdownPath: path => { followed.push(path) },
  })
  const liveKgcPath = await bootstrapAgenticGraphSubmitDraft({
    submitArgs,
    requestTimestampMs: Date.UTC(2026, 4, 22, 17, 15, 0),
    trimmedInput: 'Generate KGC without delayed stream landing',
    traceId: 'trace-preflight-fast-live',
    ensureWorkspacePath: async () => '/workspace/chat/20260522T171500Z/kgc_20260522T171500Z.md',
  })
  const tracePath = '/workspace/chat/20260522T171500Z/kgc-trace_20260522T171500Z.md'
  if (liveKgcPath !== '/workspace/chat/20260522T171500Z/kgc_20260522T171500Z.md') {
    throw new Error(`Expected live KGC path to resolve before seed persistence completes, got ${liveKgcPath}`)
  }
  if (streamingStates.length !== 1 || streamingStates[0]?.path !== tracePath || streamingStates[0]?.text !== '_Streaming..._') {
    throw new Error(`Expected live editor streaming state without seed persistence, got ${JSON.stringify(streamingStates)}`)
  }
  if (followed.length !== 1 || followed[0] !== tracePath) {
    throw new Error(`Expected preflight to follow trace workspace without seed persistence, got ${JSON.stringify(followed)}`)
  }
}
