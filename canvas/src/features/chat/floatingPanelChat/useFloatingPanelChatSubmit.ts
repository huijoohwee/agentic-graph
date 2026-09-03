import React from 'react'
import {
  initializeChatSubmitOptimisticState,
  resolveChatSubmitRequestUrlOrSetError,
} from './floatingPanelChatSubmitPreflight'
import { executeFloatingPanelChatSubmitCoordinator } from './floatingPanelChatSubmitCoordinator'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import { normalizeInvocationTokenSpacing } from '@/lib/markdown/invocationTokens'
import { tryActivateVideoAgentDemoPreset } from './videoAgentDemoPresetSubmit'
import { tryActivateNativeCrawlerInvocation } from '../nativeCrawlerInvocation'
import { tryActivateNativeImportUrlInvocation } from '../nativeImportUrlInvocation'
import { tryActivateVoiceStudioInvocation } from '@/features/voice-studio/voiceStudioInvocation'
import { tryActivateGeospatialInvocation } from './geospatialInvocationSubmit'

export type FloatingPanelChatSubmitHookDeps = {
  resolveRequestUrlOrSetError?: typeof resolveChatSubmitRequestUrlOrSetError
  initializeOptimisticState?: typeof initializeChatSubmitOptimisticState
  executeCoordinator?: typeof executeFloatingPanelChatSubmitCoordinator
  activateGeospatialInvocation?: typeof tryActivateGeospatialInvocation
}

// Keep the hook as a thin shell so request-build, transport, streaming, and
// AGENTIC_OS retry logic stay centralized in the dedicated submit helpers.
export const useFloatingPanelChatSubmit = (
  args: FloatingPanelChatSubmitArgs,
  deps: FloatingPanelChatSubmitHookDeps = {},
) => {
  const resolveRequestUrlOrSetError = deps.resolveRequestUrlOrSetError || resolveChatSubmitRequestUrlOrSetError
  const initializeOptimisticState = deps.initializeOptimisticState || initializeChatSubmitOptimisticState
  const executeCoordinator = deps.executeCoordinator || executeFloatingPanelChatSubmitCoordinator
  const activateGeospatialInvocation = deps.activateGeospatialInvocation || tryActivateGeospatialInvocation

  return React.useCallback<React.FormEventHandler<HTMLFormElement>>(async ev => {
    ev.preventDefault()
    const trimmed = normalizeInvocationTokenSpacing(args.input.trim())
    if (!trimmed || args.isLoading) return
    if (await activateGeospatialInvocation({ input: trimmed, submitArgs: args })) return
    if (await tryActivateVideoAgentDemoPreset({ input: trimmed, submitArgs: args })) return
    if (await tryActivateVoiceStudioInvocation({ input: trimmed, submitArgs: args })) return
    if (await tryActivateNativeImportUrlInvocation({ input: trimmed, submitArgs: args })) return
    if (await tryActivateNativeCrawlerInvocation({ input: trimmed, submitArgs: args })) return
    const requestUrl = resolveRequestUrlOrSetError({
      chatModel: args.chatModel,
      chatEndpointUrl: args.chatEndpointUrl,
      chatProvider: args.chatProvider,
      chatAuthMode: args.chatAuthMode,
      chatApiKey: args.chatApiKey,
      storageChatRelayDecision: args.storageChatRelayDecision,
      setErrorText: args.setErrorText,
      setConnectivity: args.setConnectivity,
      setConnectivityDetail: args.setConnectivityDetail,
    })
    if (!requestUrl) return

    const {
      assistantMessageId,
      requestTimestampMs,
      traceId,
      nextMessages,
    } = initializeOptimisticState({
      historyKey: args.historyKey,
      trimmedInput: trimmed,
      messages: args.messages,
      setErrorText: args.setErrorText,
      setConnectivityDetail: args.setConnectivityDetail,
      setStreamingAssistant: args.setStreamingAssistant,
      setStreamingInsights: args.setStreamingInsights,
      setMessages: args.setMessages,
      setInput: args.setInput,
      setIsLoading: args.setIsLoading,
    })

    await executeCoordinator({
      submitArgs: args,
      requestUrl,
      trimmedInput: trimmed,
      assistantMessageId,
      nextMessages,
      requestTimestampMs,
      traceId,
    })
  }, [activateGeospatialInvocation, args, executeCoordinator, initializeOptimisticState, resolveRequestUrlOrSetError])
}
