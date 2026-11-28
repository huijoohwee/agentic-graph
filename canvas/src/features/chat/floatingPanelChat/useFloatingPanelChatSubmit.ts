import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isCanvasDrawingRequest, isCanvasSourceProjection } from '../promptPresetInvocation'
import {
  initializeChatSubmitOptimisticState,
  resolveChatSubmitRequestUrlOrSetError,
} from './floatingPanelChatSubmitPreflight'
import { executeFloatingPanelChatSubmitCoordinator } from './floatingPanelChatSubmitCoordinator'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import { normalizeInvocationTokenSpacing } from '@/lib/markdown/invocationTokens'
import { tryActivateVideoAgentDemoPreset } from './videoAgentDemoPresetSubmit'
import { tryActivateNativeCrawlerInvocation } from '../nativeCrawlerInvocation'
import { isNativeImportUrlInvocationAttempt, tryActivateNativeImportUrlInvocation } from '../nativeImportUrlInvocation'
import { tryActivateVoiceStudioInvocation } from '@/features/voice-studio/voiceStudioInvocation'
import { tryActivateGeospatialInvocation } from './geospatialInvocationSubmit'

export function canSubmitChatWithoutModel(input: string) {
  return isCanvasSourceProjection(input) || isCanvasDrawingRequest(input) || isNativeImportUrlInvocationAttempt(input) || /^\/canvas\.widget(?:\s|$)/.test(input.trim())
}

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
    if (isCanvasSourceProjection(args.input) || isCanvasDrawingRequest(args.input)) {
      if (args.abortRef.current) return
      const initial = useGraphStore.getState()
      const controller = new AbortController()
      args.abortRef.current = controller
      args.setIsLoading(true)
      args.setErrorText(null)
      try {
        const { submitCanvasProjection } = await import('./canvasProjectionSubmit')
        await submitCanvasProjection(args, initial, controller)
      } catch (error) {
        if (args.abortRef.current === controller) args.setErrorText(error instanceof Error ? error.message : 'Unable to apply diagram.')
      } finally {
        if (args.abortRef.current === controller) {
          args.abortRef.current = null
          args.setIsLoading(false)
        }
      }
      return
    }
    if (/^\/canvas\.widget(?:\s|$)/.test(trimmed)) {
      try {
        await (await import('@/components/DashboardCanvas/dashboardWidgetTools')).controlDashboardWidget({ invocation: trimmed })
        args.setErrorText(''); args.setInput('')
      } catch (error) { args.setErrorText(error instanceof Error ? error.message : 'Widget configuration is unavailable.') }
      return
    }
    if (/^\/canvas\.view\.set(?:\s|$)/.test(trimmed)) {
      try {
        const { activateAgentRunPrompt } = await import('@/features/agent-ready/agentRunInspectionStore')
        activateAgentRunPrompt(trimmed); args.setErrorText('')
      } catch (error) { args.setErrorText(error instanceof Error ? error.message : 'Observability is unavailable.') }
      return
    }
    if (/^\/python\.learning(?:\s|$)/.test(trimmed)) {
      await (await import('@/features/python-learning/programmaticDronePreset')).invokeProgrammaticDroneInspection(args)
      return
    }
    if (/^\/launch-copilot(?:\s|$)/.test(trimmed)) {
      await (await import('@/features/agent-graph/launchCopilotInvocation')).invokeLaunchCopilot(args)
      return
    }
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
