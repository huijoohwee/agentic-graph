import { resolveSubmitRuntimeFriendlyMessage } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitErrors'
import {
  CHAT_SUBMIT_OPENAI_RESPONSES_TIMEOUT_MS,
  CHAT_SUBMIT_TRANSPORT_TIMEOUT_ERROR,
  CHAT_SUBMIT_TRANSPORT_TIMEOUT_MS,
  executeChatSubmitTransportAttempt,
  resolveChatSubmitTransportTimeoutMs,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTransport'

export function testResolveSubmitRuntimeFriendlyMessageUsesTransportTimeoutCopy() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: CHAT_SUBMIT_TRANSPORT_TIMEOUT_ERROR,
    endpointUrl: 'https://api.openai.com/v1/responses',
    chatProvider: 'openai',
  })
  if (!friendly.includes('OpenAI') || !friendly.includes('request timeout')) {
    throw new Error(`Expected transport-timeout submit message to use provider-friendly copy, got: ${friendly}`)
  }
}

export function testResolveSubmitRuntimeFriendlyMessageSeparatesVertexFromGemini() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: 'Chat request failed with status 401.',
    endpointUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/endpoints/openapi/chat/completions',
    chatProvider: 'google-cloud',
    chatAuthMode: 'byok',
  })
  if (!friendly.includes('Vertex AI rejected the BYOK OAuth access token') || !friendly.includes('Google Gemini provider')) {
    throw new Error(`Expected the Vertex 401 message to distinguish direct Gemini credentials, got: ${friendly}`)
  }
}

export function testResolveChatSubmitTransportTimeoutExtendsOpenAiResponsesBudget() {
  const openAiGpt5 = resolveChatSubmitTransportTimeoutMs({
    chatProvider: 'openai',
    chatModel: 'gpt-5-nano',
    endpointUrl: 'https://api.openai.com/v1/responses',
  })
  if (openAiGpt5 !== CHAT_SUBMIT_OPENAI_RESPONSES_TIMEOUT_MS) {
    throw new Error(`Expected OpenAI GPT-5 Responses timeout ${CHAT_SUBMIT_OPENAI_RESPONSES_TIMEOUT_MS}, got ${openAiGpt5}`)
  }
  const regularProvider = resolveChatSubmitTransportTimeoutMs({
    chatProvider: 'miromind',
    chatModel: 'mirothinker-1-7-deepresearch-mini',
    endpointUrl: 'https://api.miromind.ai/v1/chat/completions',
  })
  if (regularProvider !== CHAT_SUBMIT_TRANSPORT_TIMEOUT_MS) {
    throw new Error(`Expected regular provider timeout ${CHAT_SUBMIT_TRANSPORT_TIMEOUT_MS}, got ${regularProvider}`)
  }
}

export async function testExecuteChatSubmitTransportAttemptTimesOutAndAbortsHangingRequest() {
  const controller = new AbortController()
  let calls = 0
  let thrown = ''
  try {
    await executeChatSubmitTransportAttempt({
      effectiveModel: 'model-a',
      tokenLimitKey: 'max_completion_tokens',
      controller,
      sendChat: async () => {
        calls += 1
        return await new Promise<Response>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted.')
            abortError.name = 'AbortError'
            reject(abortError)
          }, { once: true })
        })
      },
      parseErrorBody: async () => null,
      providerModelOptions: ['model-a'],
      loadFallbackModelIds: async () => [],
      transportTimeoutMs: 5,
    })
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error || '')
  }
  if (!thrown.includes(CHAT_SUBMIT_TRANSPORT_TIMEOUT_ERROR)) {
    throw new Error(`Expected hanging transport attempt to throw timeout marker, got: ${thrown}`)
  }
  if (!controller.signal.aborted) {
    throw new Error('Expected hanging transport timeout to abort the active request controller')
  }
  if (calls !== 1) {
    throw new Error(`Expected timeout not to retry the aborted hanging request, got calls=${calls}`)
  }
}
