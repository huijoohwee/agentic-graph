import { normalizeChatLocalStorageRootPath } from '@/features/chat/chatStorageConfig'
import { LS_KEYS } from '@/lib/config.ls.keys'
import {
  CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_MAX_TOKENS_DEFAULT,
  CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT,
  DEFAULT_INTEGRATION_CONFIGS,
  type InitialChatUiContext,
  clampChatCompletionTokens,
  clampChatContextMaxTokens,
  clampChatTopLogprobs,
  isCanonicalKgcWorkspacePath,
  normalizeChatJsonText,
  normalizeChatReasoningEffort,
  normalizeChatServiceTier,
  normalizeChatThinkingType,
  parseIntegrationConfigsJson,
  stringifyIntegrationConfigs,
} from './uiSliceChat'
import type { UiStorageReaders } from './uiSliceStorage'

export const createChatUiInitialState = (
  readers: UiStorageReaders,
  chat: InitialChatUiContext,
) => {
  const { lsBool, lsFloat, lsInt, lsJson, lsNum } = readers
  const { initialChatProvider, initialChatAuthMode, initialChatEndpointUrl, initialChatModel } = chat

  return {
    chatProvider: initialChatProvider,
    chatAuthMode: initialChatAuthMode,
    chatApiKey: '',
    chatEndpointUrl: initialChatEndpointUrl,
    chatModel: initialChatModel,
    chatTemperature: lsNum(LS_KEYS.chatTemperature, 0.3),
    chatMaxCompletionTokens: clampChatCompletionTokens(
      lsInt(LS_KEYS.chatMaxCompletionTokens, CHAT_AI_MARKDOWN_MAX_TOKENS_DEFAULT),
    ),
    chatServiceTier: lsJson<'auto' | 'default'>(
      LS_KEYS.chatServiceTier,
      'auto',
      value => normalizeChatServiceTier(value),
    ),
    chatStream: lsBool(LS_KEYS.chatStream, true),
    chatMessagesJson: lsJson<string>(LS_KEYS.chatMessagesJson, '', value => normalizeChatJsonText(value)),
    chatReasoningEffort: lsJson<'minimal' | 'low' | 'medium' | 'high'>(
      LS_KEYS.chatReasoningEffort,
      'medium',
      value => normalizeChatReasoningEffort(value),
    ),
    chatThinkingType: lsJson<'enabled' | 'disabled' | 'auto'>(
      LS_KEYS.chatThinkingType,
      'enabled',
      value => normalizeChatThinkingType(value),
    ),
    chatThinkingJson: lsJson<string>(LS_KEYS.chatThinkingJson, '', value => normalizeChatJsonText(value)),
    chatFrequencyPenalty: lsFloat(LS_KEYS.chatFrequencyPenalty, 0, { min: -2, max: 2 }),
    chatPresencePenalty: lsFloat(LS_KEYS.chatPresencePenalty, 0, { min: -2, max: 2 }),
    chatTopP: lsFloat(LS_KEYS.chatTopP, 0.7, { min: 0, max: 1 }),
    chatLogprobs: lsBool(LS_KEYS.chatLogprobs, false),
    chatTopLogprobs: clampChatTopLogprobs(lsInt(LS_KEYS.chatTopLogprobs, 0)),
    chatParallelToolCalls: lsBool(LS_KEYS.chatParallelToolCalls, true),
    chatStopJson: lsJson<string>(LS_KEYS.chatStopJson, '', value => normalizeChatJsonText(value)),
    chatStreamOptionsJson: lsJson<string>(LS_KEYS.chatStreamOptionsJson, '', value => normalizeChatJsonText(value)),
    chatResponseFormatJson: lsJson<string>(LS_KEYS.chatResponseFormatJson, '', value => normalizeChatJsonText(value)),
    chatLogitBiasJson: lsJson<string>(LS_KEYS.chatLogitBiasJson, '', value => normalizeChatJsonText(value)),
    chatToolsJson: lsJson<string>(LS_KEYS.chatToolsJson, '', value => normalizeChatJsonText(value)),
    chatToolChoiceJson: lsJson<string>(LS_KEYS.chatToolChoiceJson, '', value => normalizeChatJsonText(value)),
    chatGraphSummaryMaxTokens: clampChatContextMaxTokens(
      lsInt(LS_KEYS.chatGraphSummaryMaxTokens, CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT),
      CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
    ),
    chatGuidelineDigestMaxTokens: clampChatContextMaxTokens(
      lsInt(LS_KEYS.chatGuidelineDigestMaxTokens, CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT),
      CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
    ),
    chatSystemPrompt: lsJson<string | null>(
      LS_KEYS.chatSystemPrompt,
      null,
      value => (typeof value === 'string' ? value : null),
    ),
    chatStorageTarget: lsJson<'chatAgenticGraph' | 'chatHistory'>(
      LS_KEYS.chatStorageTarget,
      'chatAgenticGraph',
      value => {
        const raw = String(value || '').trim().toLowerCase()
        if (raw === 'chathistory') return 'chatHistory'
        return 'chatAgenticGraph'
      },
    ),
    chatLocalStorageRootPath: lsJson<string>(
      LS_KEYS.chatLocalStorageRootPath,
      CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT,
      value => normalizeChatLocalStorageRootPath(typeof value === 'string' ? value : null),
    ),
    chatAgenticGraphStorageMode: lsJson<'local' | 'cloud'>(
      LS_KEYS.chatAgenticGraphStorageMode,
      'local',
      value => (String(value || '').trim().toLowerCase() === 'cloud' ? 'cloud' : 'local'),
    ),
    chatAgenticGraphWorkspacePath: lsJson<string | null>(
      LS_KEYS.chatAgenticGraphWorkspacePath,
      null,
      value => {
        const raw = typeof value === 'string' ? value.trim() : ''
        if (!raw) return null
        return isCanonicalKgcWorkspacePath(raw) ? raw : null
      },
    ),
    chatWorkspaceStreamingPath: null,
    chatWorkspaceStreamingText: null,
    chatAgenticGraphCloudUrl: lsJson<string | null>(
      LS_KEYS.chatAgenticGraphCloudUrl,
      null,
      value => {
        const raw = typeof value === 'string' ? value.trim() : ''
        return raw ? raw : null
      },
    ),
    chatHistoryWorkspacePath: lsJson<string | null>(
      LS_KEYS.chatHistoryWorkspacePath,
      null,
      value => {
        const raw = typeof value === 'string' ? value.trim() : ''
        return raw ? raw : null
      },
    ),
    chatHistoryStorageMode: lsJson<'local' | 'cloud'>(
      LS_KEYS.chatHistoryStorageMode,
      'local',
      value => {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
        return raw === 'cloud' ? 'cloud' : 'local'
      },
    ),
    chatHistoryCloudUrl: lsJson<string | null>(
      LS_KEYS.chatHistoryCloudUrl,
      null,
      value => {
        const raw = typeof value === 'string' ? value.trim() : ''
        return raw ? raw : null
      },
    ),
    chatContextScope: lsJson<'selection' | 'workspace' | 'hybrid'>(
      LS_KEYS.chatContextScope,
      'hybrid',
      value => {
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
        if (raw === 'selection') return 'selection'
        if (raw === 'workspace') return 'workspace'
        return 'hybrid'
      },
    ),
    integrationConfigsJson: lsJson<string>(
      LS_KEYS.integrationConfigsJson,
      stringifyIntegrationConfigs(DEFAULT_INTEGRATION_CONFIGS),
      value => stringifyIntegrationConfigs(parseIntegrationConfigsJson(typeof value === 'string' ? value : null)),
    ),
  }
}
