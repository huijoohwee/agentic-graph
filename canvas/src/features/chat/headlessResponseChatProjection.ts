import type { ChatMessage } from './FloatingPanelChatSections'
import {
  projectHeadlessResponseRunReceipt,
  type HeadlessResponseRunResult,
} from './headlessResponseCoordinator'

export function projectHeadlessResponseRunToChatMessage(args: {
  message: ChatMessage
  content: string
  runResult?: HeadlessResponseRunResult
  artifactPath?: string | null
}): ChatMessage {
  return {
    ...args.message,
    content: args.content,
    headlessResponseRun: args.runResult
      ? projectHeadlessResponseRunReceipt(args.runResult, args.artifactPath)
      : undefined,
  }
}
