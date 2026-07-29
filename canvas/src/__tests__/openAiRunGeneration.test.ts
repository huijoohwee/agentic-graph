import { generateRunMarkdownWithProvider } from '@/features/chat/byteplusRunGeneration'

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
const OPENAI_TEST_MODEL = 'gpt-5-nano'

export async function testGenerateRunMarkdownWithProviderSupportsOpenAiResponsesApi() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url !== '/__chat_proxy/v1/responses') {
        throw new Error(`unexpected openai responses endpoint: ${url}`)
      }
      const body = JSON.parse(String(init?.body || '{}')) as {
        model?: string
        input?: unknown
        instructions?: unknown
        messages?: unknown
        reasoning?: { effort?: unknown }
      }
      if (!body.model) throw new Error('expected responses request to include model')
      if (typeof body.instructions !== 'string' || !body.instructions.trim()) {
        throw new Error('expected responses request to include instructions')
      }
      if (
        !body.instructions.includes('Infer response-language intent semantically')
        || !body.instructions.includes('genuinely ambiguous')
        || !body.instructions.includes('ask one concise clarification')
        || !body.instructions.includes('Do not ask for clarification solely because connected source context uses another language')
        || !body.instructions.includes('structured source records')
        || !body.instructions.includes('compact Sources section')
        || !body.instructions.includes('Never backfill missing evidence')
        || body.instructions.includes('Unicode')
      ) {
        throw new Error(`expected responses instructions to use semantic multilingual clarification without script hardcodes, got ${body.instructions}`)
      }
      if (typeof body.input !== 'string' || !body.input.trim()) {
        throw new Error('expected responses request to use input text payload')
      }
      if (body.input !== '<connected-source-context>\nSumber dalam Bahasa Melayu.\n</connected-source-context>\n\n<user-authored-request>\n生成财务报告\n</user-authored-request>') {
        throw new Error(`expected responses input to preserve multilingual source and authored prompt, got ${String(body.input)}`)
      }
      if (typeof body.messages !== 'undefined') {
        throw new Error('expected responses request to omit messages field')
      }
      if (body.reasoning?.effort !== 'minimal') {
        throw new Error(`expected final-output run to forward minimal Responses reasoning effort, got ${JSON.stringify(body.reasoning)}`)
      }
      return new Response(JSON.stringify({
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '# Final Output\n\nSpecific answer.' }],
        }],
      }), { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const text = await generateRunMarkdownWithProvider({
      config: {
        provider: 'openai',
        endpointUrl: OPENAI_RESPONSES_ENDPOINT,
        apiKey: '',
        chatModel: OPENAI_TEST_MODEL,
      },
      prompt: '<connected-source-context>\nSumber dalam Bahasa Melayu.\n</connected-source-context>\n\n<user-authored-request>\n生成财务报告\n</user-authored-request>',
      options: { chatMaxCompletionTokens: 120, chatReasoningEffort: 'minimal' },
    })
    if (text !== '# Final Output\n\nSpecific answer.') {
      throw new Error(`unexpected generated markdown from responses: ${String(text)}`)
    }

    globalThis.fetch = (async () => new Response(JSON.stringify({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [
        { type: 'reasoning', content: [] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"response":{"structuredContent":{"cards":[' }] },
      ],
    }), { headers: { 'content-type': 'application/json' } })) as typeof fetch
    let errorMessage = ''
    try {
      await generateRunMarkdownWithProvider({
        config: {
          provider: 'openai',
          endpointUrl: OPENAI_RESPONSES_ENDPOINT,
          chatModel: OPENAI_TEST_MODEL,
        },
        prompt: 'Generate markdown',
        options: { chatStream: false, chatMaxCompletionTokens: 1000 },
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error || '')
    }
    if (!errorMessage.includes('incomplete response (max_output_tokens)')) {
      throw new Error(`expected incomplete OpenAI Responses output to remain distinct from semantic rejection, got ${errorMessage}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
