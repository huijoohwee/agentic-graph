
import type { StoreApi } from 'zustand'
import type { GraphState } from '@/hooks/store/types'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { lsSetBool, lsSetFloat, lsSetInt, lsSetJson, lsSetNum } from '@/lib/persistence'
import {
  CHAT_DEFAULT_ENDPOINT_URL,
  normalizeChatEndpointUrlInput,
  CHAT_DEFAULT_PROVIDER,
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_BYTEPLUS_EU_WEST_ENDPOINT_URL,
  CHAT_OPENAI_ENDPOINT_URL,
  normalizeChatProviderId,
  getChatModelOptions,
  getDefaultChatModelForProvider,
  resolveChatModelIdForProvider,
} from '@/lib/chatEndpoint'
import { inferChatProviderFromEndpointUrl, inferChatProviderFromModelId } from '@/lib/chatEndpointProviderInference'
import { resolveChatModelSelectionValues, resolveChatProviderSelectionValues } from '@/lib/chatProviderSelection'
import {
  CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT,
  normalizeChatLocalStorageRootPath,
} from '@/features/chat/chatStorageConfig'
import {
  CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_MAX_TOKENS_DEFAULT,
  clampChatCompletionTokens,
  clampChatContextMaxTokens,
} from '@/features/chat/chatAiMarkdownSpec'
import { DEFAULT_INTEGRATION_CONFIGS, parseIntegrationConfigsJson, stringifyIntegrationConfigs } from '@/features/integrations/config'
import type { UiStorageReaders } from './uiSliceStorage'

type SetGraph = StoreApi<GraphState>['setState']

export const isCanonicalAgenticOsWorkspacePath = (value: unknown): boolean => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return false
  const normalized = raw.replace(/\\/g, '/')
  const fileName = normalized.split('/').filter(Boolean).slice(-1)[0] || ''
  return /^agenticOs_(?:\d{8}T\d{6}Z|\d{14})\.md$/i.test(fileName)
}

const clampChatPenalty = (value: unknown): number => {
  const next = Number(value)
  if (!Number.isFinite(next)) return 0
  return Math.max(-2, Math.min(2, next))
}

const clampChatTopP = (value: unknown): number => {
  const next = Number(value)
  if (!Number.isFinite(next)) return 0.7
  return Math.max(0, Math.min(1, next))
}

export const clampChatTopLogprobs = (value: unknown): number => {
  const next = Math.floor(Number(value))
  if (!Number.isFinite(next)) return 0
  return Math.max(0, Math.min(20, next))
}

export const normalizeChatServiceTier = (value: unknown): 'auto' | 'default' => {
  return String(value || '').trim().toLowerCase() === 'default' ? 'default' : 'auto'
}

export const normalizeChatReasoningEffort = (value: unknown): 'minimal' | 'low' | 'medium' | 'high' => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'minimal' || raw === 'low' || raw === 'high') return raw
  return 'medium'
}

export const normalizeChatThinkingType = (value: unknown): 'enabled' | 'disabled' | 'auto' => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'disabled' || raw === 'auto') return raw
  return 'enabled'
}

export const normalizeChatJsonText = (value: unknown): string => {
  return typeof value === 'string' ? value : ''
}

export const createInitialChatUiContext = (readers: UiStorageReaders) => {
  const { lsJson } = readers
  const storedChatProvider = lsJson<string>(LS_KEYS.chatProvider, CHAT_DEFAULT_PROVIDER, value => normalizeChatProviderId(value))
  const storedChatModel = lsJson<string | null>(LS_KEYS.chatModel, null, value => (typeof value === 'string' ? value : null))
  const normalizedStoredProvider = normalizeChatProviderId(storedChatProvider)
  const inferredStoredProvider = inferChatProviderFromModelId(storedChatModel, normalizedStoredProvider)
  const normalizedStoredModel = resolveChatModelIdForProvider(storedChatModel, inferredStoredProvider, { preserveUnknownCustomModel: true })
  const shouldMigrateLegacyProviderDefault = inferredStoredProvider !== CHAT_DEFAULT_PROVIDER && !normalizedStoredModel && getChatModelOptions(inferredStoredProvider).length === 0
  const initialChatProvider = shouldMigrateLegacyProviderDefault ? CHAT_DEFAULT_PROVIDER : inferredStoredProvider
  const initialChatAuthMode = lsJson<'serverManaged' | 'byok'>(LS_KEYS.chatAuthMode, 'serverManaged', value => (value === 'byok' ? 'byok' : 'serverManaged'))
  const storedChatEndpointUrl = lsJson<string | null>(LS_KEYS.chatEndpointUrl, null, value => (typeof value === 'string' ? value : null))
  const initialChatEndpointUrl = lsJson<string | null>(LS_KEYS.chatEndpointUrl, shouldMigrateLegacyProviderDefault ? normalizeChatEndpointUrlInput(null, initialChatProvider) : normalizeChatEndpointUrlInput(storedChatEndpointUrl, initialChatProvider), value => {
    const normalized = normalizeChatEndpointUrlInput(value, initialChatProvider)
    if (!shouldMigrateLegacyProviderDefault) return normalized
    const raw = typeof value === 'string' ? value.trim() : ''
    const shouldKeepCustomEndpoint = !!raw && raw !== CHAT_DEFAULT_ENDPOINT_URL && raw !== CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL && raw !== CHAT_BYTEPLUS_EU_WEST_ENDPOINT_URL && raw !== CHAT_OPENAI_ENDPOINT_URL
    return shouldKeepCustomEndpoint ? normalizeChatEndpointUrlInput(raw, initialChatProvider) : normalizeChatEndpointUrlInput(null, initialChatProvider)
  })
  const initialChatModel = resolveChatModelIdForProvider(
    shouldMigrateLegacyProviderDefault ? null : storedChatModel,
    initialChatProvider,
    { preserveUnknownCustomModel: true },
  ) || getDefaultChatModelForProvider(initialChatProvider)
  return { initialChatProvider, initialChatAuthMode, initialChatEndpointUrl, initialChatModel }
}

export type InitialChatUiContext = ReturnType<typeof createInitialChatUiContext>

export const createUiChatActions = (set: SetGraph)=> ({
    setChatAuthMode: (mode: 'serverManaged' | 'byok') =>
      set(state => {
        const next = mode === 'byok' ? 'byok' : 'serverManaged'
        if (state.chatAuthMode === next) return {}
        const patch: Partial<GraphState> = {
          chatAuthMode: lsSetJson(LS_KEYS.chatAuthMode, next),
        }
        if (next === 'serverManaged' && state.chatApiKey) {
          patch.chatApiKey = ''
        }
        return patch
      }),
    setChatProvider: (provider: string) =>
      set(state => {
        const next = resolveChatProviderSelectionValues({
          currentEndpointUrl: state.chatEndpointUrl,
          currentModel: state.chatModel,
          currentProvider: state.chatProvider,
          provider,
        })
        if (
          state.chatProvider === next.chatProvider
          && state.chatModel === next.chatModel
          && state.chatEndpointUrl === next.chatEndpointUrl
        ) return {}
        return {
          chatProvider: lsSetJson(LS_KEYS.chatProvider, next.chatProvider),
          chatModel: lsSetJson(LS_KEYS.chatModel, next.chatModel),
          chatEndpointUrl: lsSetJson(LS_KEYS.chatEndpointUrl, next.chatEndpointUrl),
        }
      }),
    setChatApiKey: (apiKey: string | null) =>
      set(state => {
        const sanitized = String(apiKey || '')
          .replace(/[\r\n]/g, '')
          .trim()
          .slice(0, 512)
        if (state.chatAuthMode === 'serverManaged' && sanitized) {
          return {
            chatAuthMode: lsSetJson(LS_KEYS.chatAuthMode, 'byok'),
            chatApiKey: sanitized,
          }
        }
        if (state.chatApiKey === sanitized) return {}
        return { chatApiKey: sanitized }
      }),
    setChatEndpointUrl: (url: string | null) =>
      set(state => {
        const nextProvider = inferChatProviderFromEndpointUrl(url, state.chatProvider)
        const nextEndpointUrl = normalizeChatEndpointUrlInput(url, nextProvider)
        const nextModel = nextProvider === state.chatProvider
          ? state.chatModel
          : resolveChatModelIdForProvider(state.chatModel, nextProvider, { preserveUnknownCustomModel: true })
        if (
          state.chatProvider === nextProvider
          && state.chatEndpointUrl === nextEndpointUrl
          && state.chatModel === nextModel
        ) {
          return {}
        }
        return {
          chatProvider: lsSetJson(LS_KEYS.chatProvider, nextProvider),
          chatEndpointUrl: lsSetJson(LS_KEYS.chatEndpointUrl, nextEndpointUrl),
          chatModel: lsSetJson(LS_KEYS.chatModel, nextModel),
        }
      }),
    setChatModel: (model: string | null) =>
      set(state => {
        const next = resolveChatModelSelectionValues({
          currentEndpointUrl: state.chatEndpointUrl,
          currentProvider: state.chatProvider,
          model: String(model || '').trim(),
        })
        if (
          state.chatProvider === next.chatProvider
          && state.chatModel === next.chatModel
          && state.chatEndpointUrl === next.chatEndpointUrl
        ) {
          return {}
        }
        return {
          chatProvider: lsSetJson(LS_KEYS.chatProvider, next.chatProvider),
          chatModel: lsSetJson(LS_KEYS.chatModel, next.chatModel),
          chatEndpointUrl: lsSetJson(LS_KEYS.chatEndpointUrl, next.chatEndpointUrl),
        }
      }),
    setChatTemperature: (v: number) =>
      set({
        chatTemperature: lsSetNum(
          LS_KEYS.chatTemperature,
          Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0.3,
        ),
      }),
    setChatMaxCompletionTokens: (v: number) =>
      set({
        chatMaxCompletionTokens: lsSetInt(
          LS_KEYS.chatMaxCompletionTokens,
          clampChatCompletionTokens(v),
          { min: 64, max: 100_000 },
        ),
      }),
    setChatServiceTier: (v: 'auto' | 'default') =>
      set({
        chatServiceTier: lsSetJson(LS_KEYS.chatServiceTier, normalizeChatServiceTier(v)),
      }),
    setChatStream: (v: boolean) =>
      set({
        chatStream: lsSetBool(LS_KEYS.chatStream, !!v),
      }),
    setChatMessagesJson: (v: string | null) =>
      set({
        chatMessagesJson: lsSetJson(LS_KEYS.chatMessagesJson, typeof v === 'string' ? v : ''),
      }),
    setChatReasoningEffort: (v: 'minimal' | 'low' | 'medium' | 'high') =>
      set({
        chatReasoningEffort: lsSetJson(LS_KEYS.chatReasoningEffort, normalizeChatReasoningEffort(v)),
      }),
    setChatThinkingType: (v: 'enabled' | 'disabled' | 'auto') =>
      set({
        chatThinkingType: lsSetJson(LS_KEYS.chatThinkingType, normalizeChatThinkingType(v)),
      }),
    setChatThinkingJson: (v: string | null) =>
      set({
        chatThinkingJson: lsSetJson(LS_KEYS.chatThinkingJson, typeof v === 'string' ? v : ''),
      }),
    setChatFrequencyPenalty: (v: number) =>
      set({
        chatFrequencyPenalty: lsSetFloat(LS_KEYS.chatFrequencyPenalty, clampChatPenalty(v), { min: -2, max: 2 }),
      }),
    setChatPresencePenalty: (v: number) =>
      set({
        chatPresencePenalty: lsSetFloat(LS_KEYS.chatPresencePenalty, clampChatPenalty(v), { min: -2, max: 2 }),
      }),
    setChatTopP: (v: number) =>
      set({
        chatTopP: lsSetFloat(LS_KEYS.chatTopP, clampChatTopP(v), { min: 0, max: 1 }),
      }),
    setChatLogprobs: (v: boolean) =>
      set({
        chatLogprobs: lsSetBool(LS_KEYS.chatLogprobs, !!v),
      }),
    setChatTopLogprobs: (v: number) =>
      set({
        chatTopLogprobs: lsSetInt(LS_KEYS.chatTopLogprobs, clampChatTopLogprobs(v), { min: 0, max: 20 }),
      }),
    setChatParallelToolCalls: (v: boolean) =>
      set({
        chatParallelToolCalls: lsSetBool(LS_KEYS.chatParallelToolCalls, !!v),
      }),
    setChatStopJson: (v: string | null) =>
      set({
        chatStopJson: lsSetJson(LS_KEYS.chatStopJson, typeof v === 'string' ? v : ''),
      }),
    setChatStreamOptionsJson: (v: string | null) =>
      set({
        chatStreamOptionsJson: lsSetJson(LS_KEYS.chatStreamOptionsJson, typeof v === 'string' ? v : ''),
      }),
    setChatResponseFormatJson: (v: string | null) =>
      set({
        chatResponseFormatJson: lsSetJson(LS_KEYS.chatResponseFormatJson, typeof v === 'string' ? v : ''),
      }),
    setChatLogitBiasJson: (v: string | null) =>
      set({
        chatLogitBiasJson: lsSetJson(LS_KEYS.chatLogitBiasJson, typeof v === 'string' ? v : ''),
      }),
    setChatToolsJson: (v: string | null) =>
      set({
        chatToolsJson: lsSetJson(LS_KEYS.chatToolsJson, typeof v === 'string' ? v : ''),
      }),
    setChatToolChoiceJson: (v: string | null) =>
      set({
        chatToolChoiceJson: lsSetJson(LS_KEYS.chatToolChoiceJson, typeof v === 'string' ? v : ''),
      }),
    setChatGraphSummaryMaxTokens: (v: number) =>
      set({
        chatGraphSummaryMaxTokens: lsSetInt(
          LS_KEYS.chatGraphSummaryMaxTokens,
          clampChatContextMaxTokens(v, CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT),
          { min: 16, max: 10_000 },
        ),
      }),
    setChatGuidelineDigestMaxTokens: (v: number) =>
      set({
        chatGuidelineDigestMaxTokens: lsSetInt(
          LS_KEYS.chatGuidelineDigestMaxTokens,
          clampChatContextMaxTokens(v, CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT),
          { min: 16, max: 10_000 },
        ),
      }),
    setChatSystemPrompt: (v: string | null) =>
      set({
        chatSystemPrompt: lsSetJson(
          LS_KEYS.chatSystemPrompt,
          v && typeof v === 'string' ? v : null,
        ),
      }),
    setChatStorageTarget: (target: 'chatAgenticGraph' | 'chatHistory') =>
      set({
        chatStorageTarget: lsSetJson(
          LS_KEYS.chatStorageTarget,
          target === 'chatHistory' ? 'chatHistory' : 'chatAgenticGraph',
        ),
      }),
    setChatLocalStorageRootPath: (path: string | null) =>
      set(state => {
        const nextRoot = normalizeChatLocalStorageRootPath(path)
        const normalizedRoot = nextRoot.replace(/\\/g, '/').replace(/\/+$/, '')
        const isUnderRoot = (candidate: string | null | undefined): boolean => {
          const raw = String(candidate || '').trim()
          if (!raw) return false
          const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '')
          if (!normalizedRoot) return false
          if (normalized === normalizedRoot) return true
          return normalized.startsWith(`${normalizedRoot}/`)
        }
        const keepAgenticGraphPath = isUnderRoot(state.chatAgenticGraphWorkspacePath)
        const keepHistoryPath = isUnderRoot(state.chatHistoryWorkspacePath)
        return {
          chatLocalStorageRootPath: lsSetJson(LS_KEYS.chatLocalStorageRootPath, nextRoot),
          chatAgenticGraphWorkspacePath: lsSetJson(
            LS_KEYS.chatAgenticGraphWorkspacePath,
            keepAgenticGraphPath ? String(state.chatAgenticGraphWorkspacePath || '').trim() || null : null,
          ),
          chatHistoryWorkspacePath: lsSetJson(
            LS_KEYS.chatHistoryWorkspacePath,
            keepHistoryPath ? String(state.chatHistoryWorkspacePath || '').trim() || null : null,
          ),
        }
      }),
    setChatAgenticGraphStorageMode: (mode: 'local' | 'cloud') =>
      set({
        chatAgenticGraphStorageMode: lsSetJson(
          LS_KEYS.chatAgenticGraphStorageMode,
          mode === 'cloud' ? 'cloud' : 'local',
        ),
      }),
    setChatAgenticGraphWorkspacePath: (path: string | null) =>
      set({
        chatAgenticGraphWorkspacePath: lsSetJson(
          LS_KEYS.chatAgenticGraphWorkspacePath,
          (() => {
            const raw = String(path || '').trim()
            if (!raw) return null
            return isCanonicalAgenticOsWorkspacePath(raw) ? raw : null
          })(),
        ),
      }),
    setChatWorkspaceStreamingState: (value: { path?: string | null; text?: string | null } | null) =>
      set(state => {
        const nextPath = String(value?.path || '').trim() || null
        const nextText = String(value?.text || '')
        const normalizedText = nextPath ? nextText : ''
        if (
          state.chatWorkspaceStreamingPath === nextPath &&
          state.chatWorkspaceStreamingText === normalizedText
        ) {
          return {}
        }
        return {
          chatWorkspaceStreamingPath: nextPath,
          chatWorkspaceStreamingText: normalizedText,
        }
      }),
    setChatAgenticGraphCloudUrl: (url: string | null) =>
      set({
        chatAgenticGraphCloudUrl: lsSetJson(
          LS_KEYS.chatAgenticGraphCloudUrl,
          String(url || '').trim() || null,
        ),
      }),
    setChatHistoryWorkspacePath: (path: string | null) =>
      set({
        chatHistoryWorkspacePath: lsSetJson(
          LS_KEYS.chatHistoryWorkspacePath,
          String(path || '').trim() || null,
        ),
      }),
    setChatHistoryStorageMode: (mode: 'local' | 'cloud') =>
      set({
        chatHistoryStorageMode: lsSetJson(
          LS_KEYS.chatHistoryStorageMode,
          mode === 'cloud' ? 'cloud' : 'local',
        ),
      }),
    setChatHistoryCloudUrl: (url: string | null) =>
      set({
        chatHistoryCloudUrl: lsSetJson(
          LS_KEYS.chatHistoryCloudUrl,
          String(url || '').trim() || null,
        ),
      }),
    setChatContextScope: (scope: 'selection' | 'workspace' | 'hybrid') =>
      set({
        chatContextScope: lsSetJson(
          LS_KEYS.chatContextScope,
          scope === 'selection' || scope === 'workspace' ? scope : 'hybrid',
        ),
      }),
    setIntegrationConfigsJson: (v: string | null) =>
      set({
        integrationConfigsJson: lsSetJson(
          LS_KEYS.integrationConfigsJson,
          stringifyIntegrationConfigs(parseIntegrationConfigsJson(v)),
        ),
      }),
})

export {
  CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_MAX_TOKENS_DEFAULT,
  CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT,
  DEFAULT_INTEGRATION_CONFIGS,
  clampChatCompletionTokens,
  clampChatContextMaxTokens,
  parseIntegrationConfigsJson,
  stringifyIntegrationConfigs,
}
