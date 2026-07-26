import { emitFloatingPanelOpen } from '@/features/canvas/utils'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  parseVoiceStudioInvocation,
  type VoiceStudioInvocation,
  type VoiceStudioOperation,
} from './voiceStudioContract'

export type VoiceStudioLaunchRequest = {
  revision: number
  operation: VoiceStudioOperation
  prompt: string
  invocation: VoiceStudioInvocation
}

type Listener = () => void
const listeners = new Set<Listener>()
let launchSnapshot: VoiceStudioLaunchRequest | null = null
let launchRevision = 0

export const readVoiceStudioLaunchRequest = (): VoiceStudioLaunchRequest | null => launchSnapshot
export const subscribeVoiceStudioLaunchRequest = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function requestVoiceStudioLaunch(invocation: VoiceStudioInvocation): VoiceStudioLaunchRequest {
  launchRevision += 1
  launchSnapshot = { revision: launchRevision, operation: invocation.operation, prompt: invocation.prompt, invocation }
  setMediaCatalogMode('voice-studio')
  const state = useGraphStore.getState()
  state.setFloatingPanelView('media')
  state.setFloatingPanelOpen(true)
  emitFloatingPanelOpen({ tab: 'media', open: true })
  for (const listener of listeners) listener()
  return launchSnapshot
}

export async function tryActivateVoiceStudioInvocation(args: {
  input: string
  submitArgs: FloatingPanelChatSubmitArgs
}): Promise<boolean> {
  const invocation = parseVoiceStudioInvocation(args.input)
  if (!invocation) return false
  requestVoiceStudioLaunch(invocation)
  const label = invocation.operation === 'clone' ? 'Clone' : invocation.operation === 'dictate' ? 'Dictate' : 'Create'
  const response = `${label} opened in AI Voice Studio. Recording and system-voice previews are browser-owned; cloned-voice provider execution remains consent- and adapter-gated.`
  const timestampMs = Date.now()
  const identity = timestampMs.toString(36)
  const exchange: ChatMessage[] = [
    { id: `voice-studio-user-${identity}`, role: 'user', content: args.input },
    { id: `voice-studio-assistant-${identity}`, role: 'assistant', content: response },
  ]
  args.submitArgs.setErrorText(null)
  args.submitArgs.setInput('')
  args.submitArgs.setMessages(previous => [...previous, ...exchange])
  args.submitArgs.pushUiLog?.({ kind: 'success', message: `${label} opened in AI Voice Studio.`, source: 'chat:voiceStudio' })
  args.submitArgs.pushChatExchangeLog({ request: args.input, response, status: 'ok', model: 'browser-voice-studio', tsMs: timestampMs })
  await args.submitArgs.persistChatExchangeLog({
    request: args.input,
    response,
    status: 'ok',
    model: 'browser-voice-studio',
    timestampMs,
  }).catch(() => void 0)
  return true
}

