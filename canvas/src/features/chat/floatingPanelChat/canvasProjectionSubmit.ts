import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import type { GraphState } from '@/hooks/store/types'
import { applyCanvasAuthoringReply } from '../chatAgenticOsCanvasApply'

export async function submitCanvasProjection(args: FloatingPanelChatSubmitArgs, initial: GraphState, controller: AbortController) {
  const request = args.input
  const reply = request.trimStart().split(/\r?\n/).slice(1).join('\n').trimStart()
  const result = await applyCanvasAuthoringReply(initial, controller, reply)
  if (args.abortRef.current !== controller) return
  const summary = `Applied diagram with ${result.graph.nodes.length} nodes and ${result.graph.edges.length} edges. Undo restores the previous source.`
  const id = crypto.randomUUID()
  args.setMessages(messages => [...messages, { id: id + '-request', role: 'user', content: request }, { id, role: 'assistant', content: summary }])
  args.setInput(current => current === request ? '' : current)
}
