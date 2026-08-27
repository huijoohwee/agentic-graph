import { CHAT_PROVIDER_OPENAI, normalizeChatProviderId, type ChatProxyAiGatewayConfig } from '@/lib/chatEndpoint'

const toMetadataText = (value: unknown, maxLength = 96): string => {
  const next = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
  return next
}

export const buildChatSubmitAiGatewayConfig = (args: {
  chatProvider: string
  chatStorageTarget: 'chatHistory' | 'chatAgenticGraph'
  chatContextScope: 'selection' | 'workspace' | 'hybrid'
  workspaceContextCacheKey?: string | null
  historyKey?: string | null
  clientRequestId?: string | null
  requestSurface: 'chat-completions' | 'responses'
}): ChatProxyAiGatewayConfig | null => {
  if (normalizeChatProviderId(args.chatProvider) !== CHAT_PROVIDER_OPENAI) return null
  if (args.chatStorageTarget !== 'chatHistory') return null

  const metadata: Record<string, string | boolean> = {
    intent: 'draft',
    request_id: toMetadataText(args.clientRequestId, 64),
    request_surface: args.requestSurface,
    context_scope: args.chatContextScope,
    storage_target: args.chatStorageTarget,
  }
  const workspaceContextCacheKey = toMetadataText(args.workspaceContextCacheKey, 96)
  if (workspaceContextCacheKey) {
    delete metadata.storage_target
    metadata.workspace_context_cache_key = workspaceContextCacheKey
  } else {
    const historyKey = toMetadataText(args.historyKey, 64)
    if (historyKey) metadata.history_key = historyKey
  }

  return {
    route: 'dynamic/draft',
    metadata,
    cacheTtlSeconds: workspaceContextCacheKey ? 120 : 60,
  }
}
