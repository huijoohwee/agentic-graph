import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import { resolveChatSubmitRequestUrlOrSetError } from './floatingPanelChatSubmitPreflight'
import { createChatSubmitRequestSender, type ChatSubmitMessage } from './floatingPanelChatSubmitRequest'
import { readAssistantResponseText } from './floatingPanelChatStreaming'
import { getChatProviderLabel } from '@/lib/chatEndpoint'

const diagramInstructions = 'Describe the requested diagram as JSON with one "paths" field. Each path is an ordered array of two or more short node labels. Adjacent labels are connected. Reuse labels to join branches. Use at most 32 nodes and 32 paths. Return only the JSON object.'

export async function generateCanvasDiagramPaths(args: FloatingPanelChatSubmitArgs, controller: AbortController, prompt: string): Promise<string[][]> {
  let detail = ''
  const url = resolveChatSubmitRequestUrlOrSetError({
    ...args, setErrorText: text => { if (typeof text === 'string') detail = text },
  })
  if (!url || !args.chatModel) throw new Error(detail || 'Select a Chat provider and model to generate diagram steps.')
  controller.signal.throwIfAborted()
  const messages: ChatSubmitMessage[] = []
  if (args.chatSystemPrompt?.trim()) messages.push({ role: 'system', content: args.chatSystemPrompt })
  messages.push({ role: 'system', content: diagramInstructions }, { role: 'user', content: prompt })
  const send = createChatSubmitRequestSender({ submitArgs: args, requestUrl: url, controller })
  const response = await send(args.chatModel, messages)
  if (!response.ok) {
    const provider = getChatProviderLabel(args.chatProvider)
    const mode = args.chatAuthMode === 'byok' ? 'BYOK' : 'server-managed'
    throw new Error(`${provider} diagram request failed (HTTP ${response.status}, ${mode}).`)
  }
  const { assistantText } = await readAssistantResponseText({
    response, isEventStream: response.headers.get('content-type')?.includes('text/event-stream') === true,
    flushDraft: text => { if (text.length > 16_384) throw new Error('The generated diagram exceeds the size limit.') },
  })
  controller.signal.throwIfAborted()
  if (assistantText.length > 16_384) throw new Error('The generated diagram exceeds the size limit.')
  const invalid = 'The provider returned an invalid diagram. Retry or enter connected steps directly.'
  let result: unknown
  try { result = JSON.parse(assistantText.trim().replace(/^```json\s*([\s\S]*?)\s*```$/i, '$1')) }
  catch { throw new Error(invalid) }
  const paths: unknown = result && typeof result === 'object' && 'paths' in result ? result.paths : null
  if (!Array.isArray(paths) || !paths.length || paths.length > 32 || !paths.every(path =>
    Array.isArray(path) && path.length >= 2 && path.length <= 32 && path.every(label =>
      typeof label === 'string' && label.trim() && label.length <= 80 && !/[\u0000-\u001f]/.test(label)))) throw new Error(invalid)
  return paths.map(path => path.map((label: string) => label.trim()))
}
