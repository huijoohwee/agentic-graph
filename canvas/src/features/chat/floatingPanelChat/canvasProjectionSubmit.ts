import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import type { ChatMessage } from '../FloatingPanelChatSections'
import { getCachedChatHistory, putChatHistoryCache } from './floatingPanelChatRuntime'
import type { GraphState } from '@/hooks/store/types'
import { createId } from '@/lib/id'
import { applyCanvasAuthoringReply } from '../chatAgenticOsCanvasApply'

const pendingCancels = new Map<string, AbortController>()

export function cancelCanvasProjection(actionId: string): boolean {
  const controller = pendingCancels.get(actionId)
  if (!controller || controller.signal.aborted) return false
  controller.abort()
  return true
}

export async function submitCanvasProjection(args: Pick<FloatingPanelChatSubmitArgs, 'input' | 'setInput' | 'setMessages' | 'abortRef' | 'historyKey'>, initial: GraphState, controller: AbortController) {
  const request = args.input
  const reply = request.trimStart().split(/\r?\n/).slice(1).join('\n').trimStart()
  const id = createId('canvas-turn')
  const cancelId = 'canvas-authoring.cancel:' + id
  args.setMessages(messages => [...messages, { id: id + '-request', role: 'user', content: request },
    { id, role: 'assistant', content: 'Applying diagram…', canvasPending: true }])
  const finish = (content: string, canvasHistoryEntryId?: string) => {
    const terminal: ChatMessage = { id, role: 'assistant', content, ...(canvasHistoryEntryId && { canvasHistoryEntryId }) }
    const replacePending = (messages: ChatMessage[]) => messages.map(message => message.id === id ? terminal : message)
    // A closed panel still has a cached turn. Update only the request that owns this result.
    const cached = getCachedChatHistory(args.historyKey)
    if (cached?.some(message => message.id === id)) putChatHistoryCache(args.historyKey, replacePending(cached))
    args.setMessages(replacePending)
  }
  pendingCancels.set(cancelId, controller)
  let displayed = false
  const timer = setTimeout(() => {
    if (controller.signal.aborted) return
    displayed = true
    initial.upsertUiToast({ id, kind: 'neutral', message: 'Applying diagram…', busy: true, ttlMs: null, log: false,
      actions: [{ id: cancelId, label: 'Cancel' }] })
  }, 250)
  try {
    const result = await applyCanvasAuthoringReply(initial, controller, reply)
    finish(result.historyLabel, result.historyEntryId)
    if (args.abortRef.current === controller) args.setInput(current => current === request ? '' : current)
  } catch (error) {
    const cancelled = controller.signal.aborted && controller.signal.reason?.name === 'AbortError'
    finish(cancelled ? 'Diagram cancelled.' : error instanceof Error ? error.message : 'Unable to apply diagram.')
  } finally {
    clearTimeout(timer)
    pendingCancels.delete(cancelId)
    if (displayed) initial.dismissUiToast(id)
  }
}
