import { hasRecognizedChatRuntimeInvocation } from '../chatRuntimeInvocationProfile'
import { isChatRuntimeInvocationMediaOnlyRequest } from '../chatRuntimeInvocationQuery'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
export {
  buildAgenticOsRuntimeInvocationSystemPrompt,
  buildRuntimeInvocationRoutingSystemPrompt,
  hasRecognizedChatRuntimeInvocation,
} from '../chatRuntimeInvocationProfile'

export type ChatSubmitResponseContract = 'plain' | 'agenticOs'

export const resolveChatSubmitResponseContract = (args: {
  chatStorageTarget: FloatingPanelChatSubmitArgs['chatStorageTarget']
  userQuery: string
}): ChatSubmitResponseContract => {
  if (args.chatStorageTarget !== 'chatAgenticGraph') return 'plain'
  if (isChatRuntimeInvocationMediaOnlyRequest(args.userQuery)) return 'plain'
  return hasRecognizedChatRuntimeInvocation(args.userQuery) ? 'agenticOs' : 'plain'
}
