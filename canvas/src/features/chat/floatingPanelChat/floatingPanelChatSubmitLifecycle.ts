import type React from 'react'
import type { ChatMessage, StreamingAssistantState } from '../FloatingPanelChatSections'
import { projectHeadlessResponseRunToChatMessage } from '../headlessResponseChatProjection'
import type { HeadlessResponseRunResult } from '../headlessResponseCoordinator'

export type SubmitStreamingWorkspaceResetRefs = {
  setStreamingWorkspacePath: React.Dispatch<React.SetStateAction<string | null>>
  setChatWorkspaceStreamingState?: (value: { path?: string | null; text?: string | null } | null) => void
  streamFollowRef: { current: { path: string; atMs: number } | null }
  streamDraftTextRef: { current: { path: string; text: string } | null }
}

export const resetSubmitStreamingWorkspaceState = (
  args: SubmitStreamingWorkspaceResetRefs,
): void => {
  args.setStreamingWorkspacePath(null)
  args.setChatWorkspaceStreamingState?.(null)
  args.streamFollowRef.current = null
  args.streamDraftTextRef.current = null
}

export const finalizeSubmitTerminalState = (args: SubmitStreamingWorkspaceResetRefs & {
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  abortRef: { current: AbortController | null }
}): void => {
  args.setIsLoading(false)
  args.abortRef.current = null
  resetSubmitStreamingWorkspaceState(args)
}

export const materializePendingSubmitAssistantError = (args: {
  assistantMessageId: string
  responseText: string
  runResult?: HeadlessResponseRunResult
  setStreamingAssistant: React.Dispatch<React.SetStateAction<StreamingAssistantState | null>>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}): void => {
  args.setStreamingAssistant(null)
  args.setMessages(previous => previous.map(message => (
    message.id === args.assistantMessageId
      ? args.runResult
        ? projectHeadlessResponseRunToChatMessage({
            message,
            content: args.responseText,
            runResult: args.runResult,
            artifactPath: args.runResult.output.artifactPath,
          })
        : { ...message, content: args.responseText }
      : message
  )))
}
