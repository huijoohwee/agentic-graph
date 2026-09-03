import { UI_COPY } from '@/lib/config'
import { CHAT_AI_MARKDOWN_MAX_RETRY } from '../chatAiMarkdownSpec'
import { upsertChatHistoryWorkspaceDraft } from '../chatHistoryWorkspace'
import { loadAvailableModelIds, parseErrorBody } from './floatingPanelChatHttp'
import type { ChatMessage } from '../FloatingPanelChatSections'
import { resolveChatAgenticGraphAttempt } from './floatingPanelChatAgenticOsAttempt'
import { handleSubmitIssueExit, resolveSubmitRuntimeFriendlyMessage } from './floatingPanelChatSubmitErrors'
import { finalizeSubmitTerminalState } from './floatingPanelChatSubmitLifecycle'
import {
  buildChatSubmitPayloadMessages,
  buildChatSubmitRequestContext,
  createChatSubmitRequestSender,
  resolveChatSubmitTokenLimitKey,
  resolveInitialChatSubmitModel,
} from './floatingPanelChatSubmitRequest'
import { bootstrapAgenticGraphSubmitDraft } from './floatingPanelChatSubmitPreflight'
import { executeChatSubmitTransportAttempt } from './floatingPanelChatSubmitTransport'
import { resolveChatSubmitTransportTimeoutMs } from './floatingPanelChatSubmitTransport'
import {
  buildProviderStreamDraftText,
  buildTraceOnlyAssistantText,
  createChatAgenticGraphDraftWriter,
  readAssistantResponseText,
} from './floatingPanelChatStreaming'
import {
  clearActiveDurableChatStreamRun,
  forgetDurableChatStreamRun,
  projectDurableChatHeadlessPreparationSeed,
} from './floatingPanelChatDurableStream'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import { resolveChatEndpointForModels, buildChatProxyHeaders, CHAT_DEFAULT_ENDPOINT_URL } from '@/lib/chatEndpoint'
import {
  publishLocalChatPipelineFinalizeSnapshot,
  publishLocalChatPipelineAgenticOsValidationSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import {
  finalizeHeadlessResponseRun,
  type HeadlessResponsePreparation,
} from '../headlessResponseCoordinator'

type SubmitRequestContext = Omit<
  Awaited<ReturnType<typeof buildChatSubmitRequestContext>>,
  'headlessPreparation'
> & {
  headlessPreparation?: HeadlessResponsePreparation
}
type AssistantStreamState = Awaited<ReturnType<typeof readAssistantResponseText>>

const CHAT_SUBMIT_PREPARATION_TIMEOUT_MS = 12_000
export const CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR = 'CHAT_SUBMIT_PREPARATION_TIMEOUT'

const withPreparationTimeout = async <T>(args: {
  label: 'draft-bootstrap' | 'request-context'
  promise: Promise<T>
  timeoutMs?: number
}): Promise<T> => {
  const timeoutMs = Number.isFinite(args.timeoutMs) ? Math.max(0, Number(args.timeoutMs)) : CHAT_SUBMIT_PREPARATION_TIMEOUT_MS
  if (timeoutMs <= 0) return await args.promise
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR}:${args.label}`))
    }, timeoutMs)
  })
  return await Promise.race([args.promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

export const executeFloatingPanelChatSubmitCoordinator = async (args: {
  submitArgs: FloatingPanelChatSubmitArgs
  requestUrl: string
  trimmedInput: string
  assistantMessageId: string
  nextMessages: ChatMessage[]
  requestTimestampMs: number
  traceId: string
  bootstrapDraft?: typeof bootstrapAgenticGraphSubmitDraft
  buildRequestContext?: (args: {
    submitArgs: FloatingPanelChatSubmitArgs
    nextMessages: ChatMessage[]
    assistantMessageId: string
  }) => Promise<SubmitRequestContext>
  createRequestSender?: typeof createChatSubmitRequestSender
  resolveInitialModel?: typeof resolveInitialChatSubmitModel
  executeTransportAttempt?: typeof executeChatSubmitTransportAttempt
  createDraftWriter?: typeof createChatAgenticGraphDraftWriter
  readAssistantResponse?: typeof readAssistantResponseText
  resolveAgenticGraphAttempt?: typeof resolveChatAgenticGraphAttempt
  handleIssueExit?: typeof handleSubmitIssueExit
  resolveRuntimeFriendly?: typeof resolveSubmitRuntimeFriendlyMessage
  finalizeTerminal?: typeof finalizeSubmitTerminalState
  preparationTimeoutMs?: number
}): Promise<void> => {
  const bootstrapDraft = args.bootstrapDraft || bootstrapAgenticGraphSubmitDraft
  const buildRequestContext = args.buildRequestContext || buildChatSubmitRequestContext
  const createRequestSender = args.createRequestSender || createChatSubmitRequestSender
  const resolveInitialModel = args.resolveInitialModel || resolveInitialChatSubmitModel
  const executeTransportAttempt = args.executeTransportAttempt || executeChatSubmitTransportAttempt
  const createDraftWriter = args.createDraftWriter || createChatAgenticGraphDraftWriter
  const readAssistantResponse = args.readAssistantResponse || readAssistantResponseText
  const resolveAgenticGraphAttempt = args.resolveAgenticGraphAttempt || resolveChatAgenticGraphAttempt
  const handleIssueExit = args.handleIssueExit || handleSubmitIssueExit
  const resolveRuntimeFriendly = args.resolveRuntimeFriendly || resolveSubmitRuntimeFriendlyMessage
  const finalizeTerminal = args.finalizeTerminal || finalizeSubmitTerminalState
  const finishDurableRun = () => {
    clearActiveDurableChatStreamRun(args.traceId)
    void forgetDurableChatStreamRun(args.traceId)
  }
  let activeHeadlessPreparation: HeadlessResponsePreparation | undefined
  let activeLiveAgenticOsPath: string | null = null
  let activeModelId = String(args.submitArgs.chatModel || '').trim() || null
  const buildHeadlessErrorResult = (responseText: string) => activeHeadlessPreparation
    ? finalizeHeadlessResponseRun({
        prepared: activeHeadlessPreparation,
        responseText,
        status: 'error',
        modelId: activeModelId,
        artifactPath: activeLiveAgenticOsPath,
      })
    : undefined

  try {
    const liveAgenticOsPath = await withPreparationTimeout({
      label: 'draft-bootstrap',
      timeoutMs: args.preparationTimeoutMs,
      promise: bootstrapDraft({
        submitArgs: args.submitArgs,
        requestTimestampMs: args.requestTimestampMs,
        trimmedInput: args.trimmedInput,
        traceId: args.traceId,
      }),
    })
    activeLiveAgenticOsPath = liveAgenticOsPath

    const requestContext = await withPreparationTimeout({
      label: 'request-context',
      timeoutMs: args.preparationTimeoutMs,
      promise: buildRequestContext({
        submitArgs: args.submitArgs,
        nextMessages: args.nextMessages,
        assistantMessageId: args.assistantMessageId,
      }),
    })
    const {
      packedContext,
      systemMessages,
      conversationMessages,
      headlessPreparation,
    } = requestContext
    activeHeadlessPreparation = headlessPreparation

    const controller = new AbortController()
    args.submitArgs.abortRef.current = controller
    const sendChat = createRequestSender({
      submitArgs: args.submitArgs,
      requestUrl: args.requestUrl,
      controller,
      durableStream: {
        runId: args.traceId,
        traceId: args.traceId,
        assistantMessageId: args.assistantMessageId,
        requestText: args.trimmedInput,
        requestTimestampMs: args.requestTimestampMs,
        chatStorageTarget: args.submitArgs.chatStorageTarget,
        liveAgenticOsPath,
        providerSummary: args.submitArgs.chatProviderSummary,
        defaultLocalRootPath: args.submitArgs.chatLocalStorageRootPath,
        packedFrontmatter: packedContext.frontmatter,
        headlessPreparationSeed: headlessPreparation
          ? projectDurableChatHeadlessPreparationSeed(headlessPreparation)
          : null,
      },
    })
    const {
      providerModelOptions,
      effectiveModel: initialEffectiveModel,
    } = resolveInitialModel({
      chatProvider: args.submitArgs.chatProvider,
      chatModel: args.submitArgs.chatModel,
    })
    let effectiveModel = initialEffectiveModel
    activeModelId = effectiveModel
    const maxValidationAttempts =
      args.submitArgs.chatStorageTarget === 'chatAgenticGraph' ? CHAT_AI_MARKDOWN_MAX_RETRY : 1
    let attempt = 0
    let correctionPrompt: string | null = null
    let finalAssistantText = ''
    let finalValidatedAgenticOs: string | null = null
    let finalStatus: 'ok' | 'error' = 'ok'
    const finalOverride: string | null = null
    let finalAssistantStream: AssistantStreamState | null = null

    publishLocalChatPipelineAgenticOsValidationSnapshot({
      stage: 'idle',
      attempt: 0,
      maxAttempts: maxValidationAttempts,
      failedRuleId: null,
      failedMessage: null,
      correctionPromptPreview: null,
      hasStructuredAgenticOs: false,
      hasStructuredResponseSurface: false,
      hasYamlFrontmatter: false,
      validatedAgenticOsLength: 0,
    })
    publishLocalChatPipelineFinalizeSnapshot({
      stage: 'idle',
      traceId: args.traceId,
      modelId: null,
      finalStatus: null,
      persistedAgenticGraphPath: liveAgenticOsPath || null,
      applied: null,
      message: null,
      failureNote: null,
      retryHint: null,
      retryCommand: null,
    })

    while (attempt < maxValidationAttempts) {
      attempt += 1
      const payloadMessages = buildChatSubmitPayloadMessages({
        systemMessages,
        conversationMessages,
        correctionPrompt,
      })
      const transport = await executeTransportAttempt({
        effectiveModel,
        tokenLimitKey: resolveChatSubmitTokenLimitKey(args.submitArgs.chatProvider),
        controller,
        sendChat: async (model, tokenLimitKey) => await sendChat(model, payloadMessages, tokenLimitKey),
        parseErrorBody,
        providerModelOptions,
        loadFallbackModelIds: async () => {
          const modelsEndpoint = resolveChatEndpointForModels(args.submitArgs.chatEndpointUrl || CHAT_DEFAULT_ENDPOINT_URL)
          if (!modelsEndpoint) return []
          return await loadAvailableModelIds(
            modelsEndpoint,
            buildChatProxyHeaders({
              provider: args.submitArgs.chatProvider,
              apiKey: args.submitArgs.chatAuthMode === 'byok' ? args.submitArgs.chatApiKey : null,
              endpointUrl: args.submitArgs.chatEndpointUrl || CHAT_DEFAULT_ENDPOINT_URL,
              clientRequestId: `kg-chat-models-${Date.now().toString(36)}`,
            }),
          )
        },
        onResolvedFallbackModel: fallback => {
          effectiveModel = fallback
          args.submitArgs.setChatModel(fallback)
        },
        transportTimeoutMs: resolveChatSubmitTransportTimeoutMs({
          chatProvider: args.submitArgs.chatProvider,
          chatModel: effectiveModel,
          endpointUrl: args.submitArgs.chatEndpointUrl,
        }),
      })
      effectiveModel = transport.effectiveModel
      activeModelId = effectiveModel
      const res = transport.response
      if (!res.ok) {
        const statusText = UI_COPY.chatRequestFailedStatus(res.status)
        const detailText = transport.detail
          ? resolveRuntimeFriendly({
              raw: transport.detail,
              endpointUrl: args.submitArgs.chatEndpointUrl,
              chatProvider: args.submitArgs.chatProvider,
              chatAuthMode: args.submitArgs.chatAuthMode,
            })
          : ''
        const suffix = detailText ? ` ${detailText}` : ''
        const responseText = `${statusText}${suffix}`.trim()
        handleIssueExit({
          assistantMessageId: args.assistantMessageId,
          requestText: args.trimmedInput,
          responseText,
          status: 'error',
          modelId: effectiveModel,
          runResult: buildHeadlessErrorResult(responseText),
          timestampMs: Date.now(),
          setStreamingAssistant: args.submitArgs.setStreamingAssistant,
          setMessages: args.submitArgs.setMessages,
          setErrorText: args.submitArgs.setErrorText,
          errorText: responseText,
          setConnectivity: args.submitArgs.setConnectivity,
          connectivity: 'error',
          setConnectivityDetail: args.submitArgs.setConnectivityDetail,
          connectivityDetail: null,
          setIsLoading: args.submitArgs.setIsLoading,
          abortRef: args.submitArgs.abortRef,
          setStreamingWorkspacePath: args.submitArgs.setStreamingWorkspacePath,
          setChatWorkspaceStreamingState: args.submitArgs.setChatWorkspaceStreamingState,
          streamFollowRef: args.submitArgs.streamFollowRef,
          streamDraftTextRef: args.submitArgs.streamDraftTextRef,
          pushChatExchangeLog: args.submitArgs.pushChatExchangeLog,
          persistChatExchangeLog: args.submitArgs.persistChatExchangeLog,
          pushUiLog: args.submitArgs.pushUiLog,
          requestHistorySubTab: args.submitArgs.requestHistorySubTab,
          chatProvider: args.submitArgs.chatProvider,
          chatAuthMode: args.submitArgs.chatAuthMode,
          endpointUrl: args.submitArgs.chatEndpointUrl,
          shouldReportIssue: false,
        })
        finishDurableRun()
        return
      }

      const contentType = String(res.headers.get('content-type') || '').toLowerCase()
      const flushDraft = createDraftWriter({
        chatStorageTarget: args.submitArgs.chatStorageTarget,
        liveAgenticOsPath,
        requestTimestampMs: args.requestTimestampMs,
        providerSummary: args.submitArgs.chatProviderSummary,
        userText: args.trimmedInput,
        defaultLocalRootPath: args.submitArgs.chatLocalStorageRootPath,
        traceId: args.traceId,
        streamDraftTextRef: args.submitArgs.streamDraftTextRef,
        followWorkspaceMarkdownPath: args.submitArgs.followWorkspaceMarkdownPath,
        setChatAgenticGraphWorkspacePath: args.submitArgs.setChatAgenticGraphWorkspacePath,
        setChatWorkspaceStreamingState: args.submitArgs.setChatWorkspaceStreamingState,
        persistDraft: upsertChatHistoryWorkspaceDraft,
        persistWorkspaceDrafts: true,
      })
      const assistantStream = await readAssistantResponse({
        response: res,
        isEventStream: contentType.includes('text/event-stream'),
        flushDraft,
        formatDraftText: args.submitArgs.chatStorageTarget === 'chatAgenticGraph'
          ? buildProviderStreamDraftText
          : undefined,
        onProgress: nextState => {
          args.submitArgs.setStreamingAssistant(current => ({
            id: current?.id || args.assistantMessageId,
            text: nextState.assistantText,
            reasoningPreview: nextState.reasoningPreview,
            reasoningStepCount: nextState.reasoningStepCount,
            usageSummary: nextState.usageSummary,
            finishReason: nextState.finishReason,
            modelId: nextState.modelId,
          }))
          args.submitArgs.setStreamingInsights({
            reasoningPreview: nextState.reasoningPreview,
            reasoningStepCount: nextState.reasoningStepCount,
            usageSummary: nextState.usageSummary,
            finishReason: nextState.finishReason,
            modelId: nextState.modelId,
          })
        },
      })
      const assistantText = assistantStream.assistantText
      finalAssistantStream = assistantStream

      if (!assistantText.trim()) {
        const traceOnlyAssistantText = buildTraceOnlyAssistantText(assistantStream)
        if (traceOnlyAssistantText) {
          await flushDraft(traceOnlyAssistantText, true)
          finalAssistantText = traceOnlyAssistantText
          finalStatus = 'error'
          break
        }
        handleIssueExit({
          assistantMessageId: args.assistantMessageId,
          requestText: args.trimmedInput,
          responseText: UI_COPY.chatResponseMissingContentError,
          status: 'error',
          modelId: effectiveModel,
          runResult: buildHeadlessErrorResult(UI_COPY.chatResponseMissingContentError),
          timestampMs: Date.now(),
          setStreamingAssistant: args.submitArgs.setStreamingAssistant,
          setMessages: args.submitArgs.setMessages,
          setErrorText: args.submitArgs.setErrorText,
          errorText: UI_COPY.chatResponseMissingContentError,
          setConnectivity: args.submitArgs.setConnectivity,
          connectivity: 'error',
          setConnectivityDetail: args.submitArgs.setConnectivityDetail,
          connectivityDetail: UI_COPY.chatResponseMissingContentStatus,
          setIsLoading: args.submitArgs.setIsLoading,
          abortRef: args.submitArgs.abortRef,
          setStreamingWorkspacePath: args.submitArgs.setStreamingWorkspacePath,
          setChatWorkspaceStreamingState: args.submitArgs.setChatWorkspaceStreamingState,
          streamFollowRef: args.submitArgs.streamFollowRef,
          streamDraftTextRef: args.submitArgs.streamDraftTextRef,
          pushChatExchangeLog: args.submitArgs.pushChatExchangeLog,
          persistChatExchangeLog: args.submitArgs.persistChatExchangeLog,
          pushUiLog: args.submitArgs.pushUiLog,
          requestHistorySubTab: args.submitArgs.requestHistorySubTab,
          chatProvider: args.submitArgs.chatProvider,
          chatAuthMode: args.submitArgs.chatAuthMode,
          endpointUrl: args.submitArgs.chatEndpointUrl,
        })
        finishDurableRun()
        return
      }

      finalAssistantText = assistantText
      if (args.submitArgs.chatStorageTarget !== 'chatAgenticGraph') break

      const agenticGraphAttempt = resolveAgenticGraphAttempt({
        assistantText,
        packedFrontmatter: packedContext.frontmatter,
        attempt,
        maxValidationAttempts: maxValidationAttempts,
      })
      publishLocalChatPipelineAgenticOsValidationSnapshot({
        ...agenticGraphAttempt.validation,
        correctionPromptPreview: agenticGraphAttempt.kind === 'retry'
          ? agenticGraphAttempt.correctionPrompt.slice(0, 240)
          : agenticGraphAttempt.validation.correctionPromptPreview,
      })
      if (agenticGraphAttempt.kind === 'retry') {
        correctionPrompt = agenticGraphAttempt.correctionPrompt
        continue
      }
      finalStatus = agenticGraphAttempt.status
      finalAssistantText = agenticGraphAttempt.finalAssistantText
      finalValidatedAgenticOs = agenticGraphAttempt.validatedAgenticOs
      break
    }

    const headlessRunResult = headlessPreparation
      ? finalizeHeadlessResponseRun({
          prepared: headlessPreparation,
          responseText: finalAssistantText,
          status: finalStatus,
          modelId: effectiveModel,
          artifactPath: liveAgenticOsPath,
        })
      : undefined
    await args.submitArgs.finalizeAssistantSuccess({
      assistantMessageId: args.assistantMessageId,
      requestText: args.trimmedInput,
      modelId: effectiveModel,
      rawAssistantText: finalAssistantText,
      runResult: headlessRunResult,
      validatedAgenticOs: finalValidatedAgenticOs,
      timestampMs: Date.now(),
      traceId: args.traceId,
      knownAgenticGraphPath: liveAgenticOsPath,
      status: finalStatus,
      finalAssistantOverride: finalOverride,
      streamUsageSummary: finalAssistantStream?.usageSummary || null,
      streamFinishReason: finalAssistantStream?.finishReason || null,
      streamReasoningSteps: finalAssistantStream?.reasoningSteps || [],
      rawSseEvents: finalAssistantStream?.rawSseEvents || [],
    })
    args.submitArgs.setConnectivity('ok')
    args.submitArgs.setConnectivityDetail(null)
    finishDurableRun()
    finalizeTerminal({
      setIsLoading: args.submitArgs.setIsLoading,
      abortRef: args.submitArgs.abortRef,
      setStreamingWorkspacePath: args.submitArgs.setStreamingWorkspacePath,
      setChatWorkspaceStreamingState: args.submitArgs.setChatWorkspaceStreamingState,
      streamFollowRef: args.submitArgs.streamFollowRef,
      streamDraftTextRef: args.submitArgs.streamDraftTextRef,
    })
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err || '')
    if (raw && raw.toLowerCase().includes('aborted')) {
      clearActiveDurableChatStreamRun(args.traceId)
      void forgetDurableChatStreamRun(args.traceId)
      handleIssueExit({
        assistantMessageId: args.assistantMessageId,
        requestText: args.trimmedInput,
        responseText: raw || 'Request aborted',
        status: 'aborted',
        modelId: args.submitArgs.chatModel || null,
        timestampMs: Date.now(),
        setStreamingAssistant: args.submitArgs.setStreamingAssistant,
        setMessages: args.submitArgs.setMessages,
        setConnectivity: args.submitArgs.setConnectivity,
        connectivity: 'unknown',
        setConnectivityDetail: args.submitArgs.setConnectivityDetail,
        connectivityDetail: null,
        setIsLoading: args.submitArgs.setIsLoading,
        abortRef: args.submitArgs.abortRef,
        setStreamingWorkspacePath: args.submitArgs.setStreamingWorkspacePath,
        setChatWorkspaceStreamingState: args.submitArgs.setChatWorkspaceStreamingState,
        streamFollowRef: args.submitArgs.streamFollowRef,
        streamDraftTextRef: args.submitArgs.streamDraftTextRef,
        pushChatExchangeLog: args.submitArgs.pushChatExchangeLog,
        persistChatExchangeLog: args.submitArgs.persistChatExchangeLog,
        pushUiLog: args.submitArgs.pushUiLog,
        requestHistorySubTab: args.submitArgs.requestHistorySubTab,
        chatProvider: args.submitArgs.chatProvider,
        chatAuthMode: args.submitArgs.chatAuthMode,
        endpointUrl: args.submitArgs.chatEndpointUrl,
      })
      return
    }
    const friendly = resolveRuntimeFriendly({
      raw,
      endpointUrl: args.submitArgs.chatEndpointUrl,
      chatProvider: args.submitArgs.chatProvider,
      chatAuthMode: args.submitArgs.chatAuthMode,
    })
    handleIssueExit({
      assistantMessageId: args.assistantMessageId,
      requestText: args.trimmedInput,
      responseText: friendly,
      status: 'error',
      modelId: args.submitArgs.chatModel || null,
      runResult: buildHeadlessErrorResult(friendly),
      timestampMs: Date.now(),
      setStreamingAssistant: args.submitArgs.setStreamingAssistant,
      setMessages: args.submitArgs.setMessages,
      setErrorText: args.submitArgs.setErrorText,
      errorText: friendly,
      setConnectivity: args.submitArgs.setConnectivity,
      connectivity: 'error',
      setConnectivityDetail: args.submitArgs.setConnectivityDetail,
      connectivityDetail: friendly,
      setIsLoading: args.submitArgs.setIsLoading,
      abortRef: args.submitArgs.abortRef,
      setStreamingWorkspacePath: args.submitArgs.setStreamingWorkspacePath,
      setChatWorkspaceStreamingState: args.submitArgs.setChatWorkspaceStreamingState,
      streamFollowRef: args.submitArgs.streamFollowRef,
      streamDraftTextRef: args.submitArgs.streamDraftTextRef,
      pushChatExchangeLog: args.submitArgs.pushChatExchangeLog,
      persistChatExchangeLog: args.submitArgs.persistChatExchangeLog,
      pushUiLog: args.submitArgs.pushUiLog,
      requestHistorySubTab: args.submitArgs.requestHistorySubTab,
      chatProvider: args.submitArgs.chatProvider,
      chatAuthMode: args.submitArgs.chatAuthMode,
      endpointUrl: args.submitArgs.chatEndpointUrl,
    })
    finishDurableRun()
  }
}
