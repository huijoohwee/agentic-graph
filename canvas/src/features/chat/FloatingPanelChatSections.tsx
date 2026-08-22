import React from 'react'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { getLocalStorage } from '@/lib/persistence'
import type { GraphNode } from '@/lib/graph/types'
import type { UiSectionChipStatusTone } from '@/lib/ui/sectionChipChrome'
import { getUiSectionStatusChipClassName } from '@/lib/ui/sectionChipChrome'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_CHAT_MESSAGE_BUBBLE_CLASSNAME,
  UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { ChatModelCredentialControls } from '@/features/chat/ChatModelCredentialControls'
import { FloatingPanelChatComposer } from '@/features/chat/floatingPanelChat/FloatingPanelChatComposer'
import { renderFloatingPanelChatMessageContent } from '@/features/chat/floatingPanelChat/FloatingPanelChatMessageContent'
import { FloatingPanelChatQuickActionGrid } from '@/features/chat/floatingPanelChat/FloatingPanelChatQuickActionGrid'
import type { HeadlessResponseRunReceipt } from '@/features/chat/headlessResponseCoordinator'

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; headlessResponseRun?: HeadlessResponseRunReceipt }
export type StreamingAssistantState = {
  id: string
  text: string
  reasoningPreview?: string | null
  reasoningStepCount?: number
  usageSummary?: string | null
  finishReason?: string | null
  modelId?: string | null
}
export type FloatingPanelChatContextItem = {
  id: string
  label: string
  value: string
  tone?: 'success' | 'info' | 'warning' | 'error' | 'neutral'
}
export type FloatingPanelChatQuickAction = {
  id: string
  label: string
  prompt: string
  disabled?: boolean
}
export type FloatingPanelChatPipelineStage = {
  id: 'ingest' | 'parse' | 'render'
  label: string
  detail: string
  status: 'waiting' | 'active' | 'ready' | 'error'
  prompt: string
}

const getFloatingPanelChatContextChipClassName = (
  tone: UiSectionChipStatusTone = 'neutral',
  className?: string,
): string => [
  'inline-flex w-full min-w-0 items-center gap-1 rounded border px-2 py-1 leading-none',
  UI_THEME_TOKENS.status[tone],
  className || '',
].filter(Boolean).join(' ')

const getFloatingPanelChatContextItemClassName = (id: string): string => {
  if (id === 'workspace' || id === 'selection') return 'min-w-0 col-span-2'
  return 'min-w-0'
}

const FloatingPanelChatStreamingStatus = React.memo(function FloatingPanelChatStreamingStatus({
  reasoningPreview,
  usageSummary,
  finishReason,
  writingWorkspaceFileLabel,
  uiPanelTextFontClass,
  uiPanelMicroLabelTextSizeClass,
}: {
  reasoningPreview?: string | null
  usageSummary?: string | null
  finishReason?: string | null
  writingWorkspaceFileLabel?: string | null
  uiPanelTextFontClass: string
  uiPanelMicroLabelTextSizeClass: string
}) {
  const reasoning = String(reasoningPreview || '').trim()
  const usage = String(usageSummary || '').trim()
  const finish = String(finishReason || '').trim()
  const writing = String(writingWorkspaceFileLabel || '').trim()
  if (!reasoning && !usage && !finish && !writing) return null

  return (
    <section
      aria-live="polite"
      role="status"
      data-kg-chat-stream-status="chronological"
      className={[
        'space-y-1 rounded border px-2 py-1.5',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      ].join(' ')}
    >
      {reasoning ? (
        <section
          data-kg-chat-stream-reasoning="true"
          className={[uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, UI_THEME_TOKENS.text.secondary].join(' ')}
        >
          {reasoning}
        </section>
      ) : null}
      {usage ? (
        <section className={[uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, UI_THEME_TOKENS.text.tertiary].join(' ')}>
          {usage}
        </section>
      ) : null}
      {finish ? (
        <section className={[uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, UI_THEME_TOKENS.text.tertiary].join(' ')}>
          Finish: {finish}
        </section>
      ) : null}
      {writing ? (
        <section className={getUiSectionStatusChipClassName('info', [uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass].join(' '))}>
          {writing}
        </section>
      ) : null}
    </section>
  )
})

const ChatMessageRow = React.memo(function ChatMessageRow({
  message,
  uiPanelTextFontClass,
  uiPanelKeyValueTextSizeClass,
  overrideText,
  onOpenWorkspacePath,
  isStreaming = false,
}: {
  message: ChatMessage
  uiPanelTextFontClass: string
  uiPanelKeyValueTextSizeClass: string
  overrideText?: string | null
  onOpenWorkspacePath?: (path: string) => void
  isStreaming?: boolean
}) {
  const content = typeof overrideText === 'string' ? overrideText : message.content
  const isUser = message.role === 'user'
  const streamingState = isStreaming
    ? (String(content || '').trim() ? 'receiving' : 'pending')
    : null
  return (
    <section
      className="flex"
      data-kg-chat-streaming-tail={isStreaming ? 'true' : undefined}
      data-kg-chat-streaming-state={streamingState || undefined}
      aria-live={isStreaming ? 'polite' : undefined}
      aria-busy={streamingState === 'pending' ? 'true' : undefined}
    >
      <section
        className={[
          UI_RESPONSIVE_CHAT_MESSAGE_BUBBLE_CLASSNAME,
          uiPanelTextFontClass,
          uiPanelKeyValueTextSizeClass,
          isUser
            ? `ml-auto ${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText} ${UI_THEME_TOKENS.button.activeBorder}`
            : `mr-auto ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.panel.border}`,
        ].join(' ')}
      >
        {renderFloatingPanelChatMessageContent(
          streamingState === 'pending' ? UI_COPY.chatAssistantPendingStatus : content,
          onOpenWorkspacePath,
        )}
      </section>
    </section>
  )
})

type MessagesSectionProps = {
  messages: ChatMessage[]
  isLoading: boolean
  historyKey: string
  contextItems?: FloatingPanelChatContextItem[]
  pipelineStages?: FloatingPanelChatPipelineStage[]
  onPipelineStageAction?: (prompt: string) => void
  uiPanelTextFontClass: string
  uiPanelKeyValueTextSizeClass: string
  uiPanelMicroLabelTextSizeClass: string
  streamingReasoningPreview?: string | null
  streamingUsageSummary?: string | null
  streamingFinishReason?: string | null
  streamingAssistant?: StreamingAssistantState | null
  writingWorkspaceFileLabel?: string | null
  onOpenWorkspacePath?: (path: string) => void
  quickActions?: FloatingPanelChatQuickAction[]
  onQuickAction?: (prompt: string) => void
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}

export function FloatingPanelChatMessagesSection({
  messages,
  isLoading,
  historyKey,
  contextItems = [],
  pipelineStages = [],
  onPipelineStageAction,
  uiPanelTextFontClass,
  uiPanelKeyValueTextSizeClass,
  uiPanelMicroLabelTextSizeClass,
  streamingReasoningPreview,
  streamingUsageSummary,
  streamingFinishReason,
  streamingAssistant,
  writingWorkspaceFileLabel,
  onOpenWorkspacePath,
  quickActions = [],
  onQuickAction,
  setMessages,
}: MessagesSectionProps) {
  const liveStreamingReasoningPreview = isLoading ? streamingReasoningPreview : null
  const liveStreamingUsageSummary = isLoading ? streamingUsageSummary : null
  const liveStreamingFinishReason = isLoading ? streamingFinishReason : null
  const liveWritingWorkspaceFileLabel = isLoading ? writingWorkspaceFileLabel : null
  const liveStreamingAssistant = isLoading && streamingAssistant ? streamingAssistant : null

  return (
    <section data-kg-chat-thread-viewport="true" className="flex min-h-full flex-col gap-2">
      <header className="flex items-center justify-between rounded border px-2 py-1.5">
        <section className={[uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, UI_THEME_TOKENS.text.tertiary].join(' ')}>
          {UI_COPY.chatHistoryCountStatus(messages.length)}
        </section>
        <button
          type="button"
          className={`App-toolbar__btn ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} disabled:opacity-50`}
          onClick={() => {
            setMessages([])
            const storage = getLocalStorage()
            if (!storage) return
            try {
              storage.removeItem(historyKey)
            } catch {
              void 0
            }
          }}
          disabled={messages.length === 0 || isLoading}
        >
          {UI_LABELS.clear}
        </button>
      </header>

      {contextItems.length > 0 ? (
        <section
          aria-label="Chat context"
          data-kg-chat-context-rail="true"
          className={[
            'rounded border px-2 py-1',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          ].join(' ')}
        >
          <ul className="grid grid-cols-2 gap-1.5">
            {contextItems.map(item => (
              <li key={item.id} className={getFloatingPanelChatContextItemClassName(item.id)}>
                <span
                  data-kg-chat-context-chip="true"
                  data-kg-chat-context-id={item.id}
                  title={`${item.label}: ${item.value}`}
                  className={getFloatingPanelChatContextChipClassName(item.tone || 'neutral', [uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass].join(' '))}
                >
                  <span className="shrink-0 font-medium">{item.label}:</span>
                  {' '}
                  <span data-kg-chat-context-chip-value="true" className="min-w-0 truncate">
                    {item.value}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pipelineStages.length > 0 ? (
        <nav aria-label="Document pipeline" data-kg-chat-pipeline="true">
          <ol className="grid grid-cols-3 gap-1.5">
            {pipelineStages.map(stage => {
              const tone: UiSectionChipStatusTone = stage.status === 'ready'
                ? 'success'
                : stage.status === 'active'
                  ? 'info'
                  : stage.status === 'error'
                    ? 'error'
                    : 'neutral'
              return (
                <li key={stage.id} className="min-w-0">
                  <button
                    type="button"
                    data-kg-chat-pipeline-stage={stage.id}
                    data-status={stage.status}
                    title={`${stage.label}: ${stage.detail}`}
                    className={getFloatingPanelChatContextChipClassName(tone, [uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, 'flex-col items-start gap-0.5 text-left'].join(' '))}
                    onClick={() => onPipelineStageAction?.(stage.prompt)}
                  >
                    <span className="font-medium">{stage.label}</span>
                    <span className="w-full truncate opacity-80">{stage.detail}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      ) : null}

      {messages.length === 0 && (
        <section
          data-kg-chat-empty-state="true"
          className={['flex min-h-[12rem] flex-1 flex-col justify-between gap-2 rounded border border-dashed px-2 py-2', uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary].join(' ')}
        >
          <section>{UI_COPY.chatEmptyStateHelp}</section>
          <FloatingPanelChatQuickActionGrid
            quickActions={quickActions}
            isLoading={isLoading}
            uiPanelTextFontClass={uiPanelTextFontClass}
            uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
            placement="thread"
            onQuickAction={onQuickAction}
          />
        </section>
      )}

      {messages.map(m => {
        if (liveStreamingAssistant?.id === m.id && m.role === 'assistant') return null
        const hidePendingAssistant = m.role === 'assistant' && !String(m.content || '').trim()
        if (hidePendingAssistant) return null
        return (
          <ChatMessageRow
            key={m.id}
            message={m}
            uiPanelTextFontClass={uiPanelTextFontClass}
            uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
            onOpenWorkspacePath={onOpenWorkspacePath}
          />
        )
      })}

      {liveStreamingAssistant ? (
        <ChatMessageRow
          key={`streaming-${liveStreamingAssistant.id}`}
          message={{ id: liveStreamingAssistant.id, role: 'assistant', content: liveStreamingAssistant.text }}
          uiPanelTextFontClass={uiPanelTextFontClass}
          uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
          onOpenWorkspacePath={onOpenWorkspacePath}
          isStreaming
        />
      ) : null}

      <FloatingPanelChatStreamingStatus
        reasoningPreview={liveStreamingReasoningPreview}
        usageSummary={liveStreamingUsageSummary}
        finishReason={liveStreamingFinishReason}
        writingWorkspaceFileLabel={liveWritingWorkspaceFileLabel}
        uiPanelTextFontClass={uiPanelTextFontClass}
        uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
      />
    </section>
  )
}

type FooterProps = {
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  appendFocusRequestKey?: number
  submitRequestKey?: number
  isLoading: boolean
  errorText: string | null
  connectivity: 'unknown' | 'ok' | 'error'
  connectivityDetail: string | null
  relayStatus?: {
    tone: 'info' | 'ok' | 'error'
    detail: string
  } | null
  relaySummary?: string | null
  relayAction?: {
    label: string
    onClick: () => void
  } | null
  apiKeyPrompt?: {
    providerLabel: string
    credentialLabel: string
    value: string
    onChange: (value: string) => void
  } | null
  currentNode: GraphNode | null
  modelId: string
  modelOptions: string[]
  onModelChanged: (modelId: string) => void
  uiPanelTextFontClass: string
  uiPanelMicroLabelTextSizeClass: string
  isSubmitDisabled: boolean
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onStop: () => void
  showNewChatButton?: boolean
  isNewChatDisabled?: boolean
  onNewChat?: () => void
  quickActions?: FloatingPanelChatQuickAction[]
  onQuickAction?: (prompt: string) => void
  markdownText?: string | null
}

export function FloatingPanelChatFooter({
  input,
  setInput,
  appendFocusRequestKey,
  submitRequestKey = 0,
  isLoading,
  errorText,
  connectivity,
  connectivityDetail,
  relayStatus,
  relaySummary,
  relayAction,
  apiKeyPrompt,
  currentNode,
  modelId,
  modelOptions,
  onModelChanged,
  uiPanelTextFontClass,
  uiPanelMicroLabelTextSizeClass,
  isSubmitDisabled,
  onSubmit,
  onStop,
  showNewChatButton,
  isNewChatDisabled,
  onNewChat,
  quickActions = [],
  onQuickAction,
  markdownText,
}: FooterProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const handledSubmitRequestKeyRef = React.useRef(0)
  React.useEffect(() => {
    if (submitRequestKey <= handledSubmitRequestKeyRef.current || isSubmitDisabled) return
    handledSubmitRequestKeyRef.current = submitRequestKey
    formRef.current?.requestSubmit()
  }, [isSubmitDisabled, submitRequestKey])
  const normalizedErrorText = String(errorText || '').trim()
  const normalizedConnectivityDetail = String(connectivityDetail || '').trim()
  const duplicateConnectivityError = connectivity === 'error' &&
    normalizedErrorText.length > 0 &&
    normalizedErrorText === normalizedConnectivityDetail
  return (
    <section className={`border-t ${UI_THEME_TOKENS.panel.border} p-2 space-y-1.5`} data-kg-chat-footer="compact">
      {errorText && (
        <section className={[uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, 'text-red-700 dark:text-red-400'].join(' ')}>
          {errorText}
        </section>
      )}

      {connectivity !== 'unknown' && !duplicateConnectivityError && (
        <section
          className={[
            uiPanelTextFontClass,
            uiPanelMicroLabelTextSizeClass,
            connectivity === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400',
          ].join(' ')}
        >
          {connectivity === 'ok' ? UI_COPY.chatEndpointOkStatus : connectivityDetail || UI_COPY.chatEndpointUnreachableStatus}
        </section>
      )}
      {relayStatus?.detail ? (
        <section
          data-kg-chat-relay-status="true"
          className={[
            uiPanelTextFontClass,
            uiPanelMicroLabelTextSizeClass,
            relayStatus.tone === 'ok'
              ? 'text-green-700 dark:text-green-400'
              : relayStatus.tone === 'error'
                ? 'text-yellow-700 dark:text-yellow-400'
                : UI_THEME_TOKENS.text.secondary,
          ].join(' ')}
        >
          {relayStatus.detail}
        </section>
      ) : null}
      {relaySummary || relayAction ? (
        <section className="flex items-center justify-between gap-2">
          <section
            data-kg-chat-relay-summary="true"
            className={[
              uiPanelTextFontClass,
              uiPanelMicroLabelTextSizeClass,
              UI_THEME_TOKENS.text.tertiary,
            ].join(' ')}
          >
            {relaySummary}
          </section>
          {relayAction ? (
            <button
              type="button"
              data-kg-chat-relay-action="true"
              className={`App-toolbar__btn ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
              onClick={relayAction.onClick}
            >
              {relayAction.label}
            </button>
          ) : null}
        </section>
      ) : null}
      <ChatModelCredentialControls
        apiKeyPrompt={apiKeyPrompt}
        modelId={modelId}
        modelOptions={modelOptions}
        onModelChanged={onModelChanged}
        disabled={isLoading}
        uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
      />
      <FloatingPanelChatQuickActionGrid
        quickActions={quickActions}
        isLoading={isLoading}
        uiPanelTextFontClass={uiPanelTextFontClass}
        uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
        placement="footer"
        onQuickAction={onQuickAction}
      />
      <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
        <FloatingPanelChatComposer
          input={input}
          setInput={setInput}
          appendFocusRequestKey={appendFocusRequestKey}
          markdownText={markdownText}
          isLoading={isLoading}
          isSubmitDisabled={isSubmitDisabled}
          uiPanelTextFontClass={uiPanelTextFontClass}
          placeholder={UI_COPY.chatInputPlaceholder}
          responsiveEditorClassName={UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME}
        />

        <section className={`flex items-center gap-2 ${currentNode ? 'justify-between' : 'justify-end'}`}>
          {currentNode ? (
            <section className={[uiPanelTextFontClass, uiPanelMicroLabelTextSizeClass, UI_THEME_TOKENS.text.tertiary, 'min-w-0 truncate'].join(' ')}>
              {UI_COPY.chatUsingSelectedNodeContextStatus(currentNode.label, currentNode.type)}
            </section>
          ) : null}
          <section className="flex shrink-0 items-center gap-2">
            {showNewChatButton && (
              <button
                type="button"
                className={`App-toolbar__btn ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} disabled:opacity-50`}
                onClick={onNewChat}
                disabled={isNewChatDisabled}
              >
                {UI_COPY.chatNewChatButtonLabel}
              </button>
            )}
            {isLoading && (
              <button
                type="button"
                className={`App-toolbar__btn ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} disabled:opacity-50`}
                onClick={onStop}
              >
                {UI_COPY.chatStopButtonLabel}
              </button>
            )}
            <button
              type="submit"
              className={`App-toolbar__btn ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText} disabled:opacity-50`}
              disabled={isSubmitDisabled}
            >
              {isLoading ? UI_COPY.chatSendingButtonLabel : UI_COPY.chatSendButtonLabel}
            </button>
          </section>
        </section>
      </form>
    </section>
  )
}
