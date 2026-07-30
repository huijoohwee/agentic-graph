import { generateStoryboardWidgetTextWithProvider } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowTextGenerationProvider'
import type { GraphState } from '@/hooks/useGraphStore'

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'

const responseStream = (events: readonly unknown[]): Response => {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        const data = event === '[DONE]' ? '[DONE]' : JSON.stringify(event)
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

export async function testStoryboardWidgetRetriesIncompleteResponsesWithoutReasoningAndPublishesTerminalText() {
  const originalFetch = globalThis.fetch
  const requestBodies: Array<Record<string, unknown>> = []
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/__chat_proxy/v1/responses') throw new Error(`unexpected endpoint ${String(input)}`)
      requestBodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
      if (requestBodies.length === 1) {
        return responseStream([
          { type: 'response.reasoning_summary_text.delta', delta: 'Inspect the request contract before answering.' },
          { type: 'response.output_text.delta', delta: '# Incomplete answer\n\nThis fragment must not be accepted.' },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              output: [{
                type: 'reasoning',
                summary: [{ type: 'summary_text', text: 'Inspect the request contract before answering.' }],
              }],
            },
          },
          '[DONE]',
        ])
      }
      const text = '# Comparison report\n\n| Item | Budget |\n| --- | ---: |\n| Option A | RM1,000 |'
      return responseStream([
        { type: 'response.output_text.delta', delta: text },
        { type: 'response.output_text.done', text },
        { type: 'response.content_part.done', part: { type: 'output_text', text } },
        {
          type: 'response.output_item.done',
          item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
        },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
          },
        },
        '[DONE]',
      ])
    }) as typeof fetch

    const publishedText: string[] = []
    const publishedThinking: string[] = []
    const result = await generateStoryboardWidgetTextWithProvider({
      properties: {
        chatProvider: 'openai',
        chatAuthMode: 'serverManaged',
        chatEndpointUrl: OPENAI_RESPONSES_ENDPOINT,
        chatModel: 'gpt-5-nano',
        chatMaxCompletionTokens: 1000,
        chatReasoningEffort: 'medium',
        chatStream: true,
      },
      store: {
        chatProvider: 'openai',
        chatAuthMode: 'serverManaged',
        chatApiKey: '',
        chatEndpointUrl: OPENAI_RESPONSES_ENDPOINT,
        chatModel: 'gpt-5-nano',
      } as unknown as GraphState,
      formId: 'textGeneration',
      localProperties: { chatReasoningEffort: 'medium' },
      prompt: 'Create a comparison and financial budget report.',
      onText: text => publishedText.push(text),
      onReasoningText: text => publishedThinking.push(text),
    })

    const firstReasoning = requestBodies[0]?.reasoning as { effort?: unknown } | undefined
    const retryReasoning = requestBodies[1]?.reasoning as { effort?: unknown } | undefined
    if (requestBodies.length !== 2 || firstReasoning?.effort !== 'medium' || retryReasoning?.effort !== 'minimal') {
      throw new Error(`expected one bounded minimal-reasoning retry, got ${JSON.stringify(requestBodies)}`)
    }
    if (
      !result.includes('# Comparison report')
      || !publishedText.some(text => text.includes('# Incomplete answer'))
      || publishedText[publishedText.length - 1] !== result
    ) {
      throw new Error(`expected an incomplete partial response to retry and end with terminal text, got ${JSON.stringify({ result, publishedText })}`)
    }
    if (!publishedThinking.some(text => text.includes('Inspect the request contract'))) {
      throw new Error(`expected provider-exposed reasoning to remain available as a separate output signal, got ${JSON.stringify(publishedThinking)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
