import {
  extractAssistantDelta,
  extractAssistantStreamDelta,
  formatChatStreamUsageSummary,
  parseSseEvents,
} from '@/features/chat/floatingPanelChat/floatingPanelChatStreamParsing'
import { extractAssistantContentText } from '@/features/chat/assistantContentText'

export function testParseSseEventsSkipsHeartbeatCommentsAndKeepsMultiLinePayloads() {
  const input = [
    ': keep-alive',
    '',
    'data: {"choices":[{"delta":{"reasoning_steps":[{"type":"thinking","thought":"inspect graph"}]}}]}',
    '',
    'data: {"choices":[{"delta":{"content":"Hello"}}]}',
    'data: {"choices":[{"delta":{"content":" world"}}]}',
    '',
    '',
  ].join('\n')

  const parsed = parseSseEvents(input)

  if (parsed.rest !== '') {
    throw new Error(`expected SSE parser to flush the complete buffer, got ${JSON.stringify(parsed.rest)}`)
  }
  if (parsed.events.length !== 2) {
    throw new Error(`expected 2 SSE events, got ${JSON.stringify(parsed.events)}`)
  }
  if (!parsed.events[0]?.includes('"reasoning_steps"')) {
    throw new Error(`expected first SSE event to preserve reasoning payload, got ${JSON.stringify(parsed.events[0])}`)
  }
  if (parsed.events[1] !== '{"choices":[{"delta":{"content":"Hello"}}]}\n{"choices":[{"delta":{"content":" world"}}]}') {
    throw new Error(`expected multiline SSE payload join, got ${JSON.stringify(parsed.events[1])}`)
  }
}

export function testExtractAssistantStreamDeltaReadsMiroMindReasoningAndUsage() {
  const delta = extractAssistantStreamDelta({
    model: 'mirothinker-1-7-deepresearch-mini',
    choices: [
      {
        delta: {
          content: 'Answer',
          reasoning_steps: [
            { type: 'thinking', thought: 'inspect graph structure' },
            { type: 'web_search', web_search: { search_keywords: ['miromind', 'agenticOs'] } },
          ],
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 22,
      total_tokens: 33,
      reasoning_tokens: 7,
      num_search_queries: 2,
    },
  })

  if (delta.contentDelta !== 'Answer') {
    throw new Error(`expected content delta, got ${JSON.stringify(delta.contentDelta)}`)
  }
  if (delta.modelId !== 'mirothinker-1-7-deepresearch-mini') {
    throw new Error(`expected model id, got ${JSON.stringify(delta.modelId)}`)
  }
  if (delta.finishReason !== 'stop') {
    throw new Error(`expected finish reason, got ${JSON.stringify(delta.finishReason)}`)
  }
  if (
    delta.reasoningStepSummaries.length !== 2
    || delta.reasoningStepSummaries[0] !== 'inspect graph structure'
    || delta.reasoningStepSummaries[1] !== 'web_search: miromind, agenticOs'
  ) {
    throw new Error(`expected reasoning summaries, got ${JSON.stringify(delta.reasoningStepSummaries)}`)
  }
  const usageSummary = formatChatStreamUsageSummary(delta.usage)
  if (usageSummary !== 'Usage: prompt 11 · completion 22 · total 33 · reasoning 7 · searches 2') {
    throw new Error(`expected usage summary, got ${JSON.stringify(usageSummary)}`)
  }

  const structuredDelta = extractAssistantStreamDelta({
    model: 'mirothinker-1-7-deepresearch-mini',
    choices: [
      {
        delta: {
          content: [
            { type: 'text', text: 'Structured ' },
            { type: 'output_text', text: 'answer' },
          ],
        },
      },
    ],
  })
  if (structuredDelta.contentDelta !== 'Structured answer') {
    throw new Error(`expected structured content delta, got ${JSON.stringify(structuredDelta.contentDelta)}`)
  }

  const responsesDelta = extractAssistantStreamDelta({
    type: 'response.output_text.delta',
    delta: 'Responses chunk',
  })
  if (responsesDelta.contentDelta !== 'Responses chunk') {
    throw new Error(`expected root output_text delta, got ${JSON.stringify(responsesDelta.contentDelta)}`)
  }

  const traceOnlyDelta = extractAssistantStreamDelta({
    model: 'mirothinker-1-7-deepresearch-mini',
    choices: [
      {
        delta: {
          reasoning_content: 'Inspect market context before selecting a source.',
          tool_calls: [
            {
              type: 'function',
              function: { name: 'google_search', arguments: '{"q":"BTC gold ETF flows"}' },
            },
          ],
        },
        finish_reason: 'error',
      },
    ],
  })
  if (traceOnlyDelta.contentDelta !== '') {
    throw new Error(`expected trace-only delta not to become assistant text, got ${JSON.stringify(traceOnlyDelta.contentDelta)}`)
  }
  if (
    traceOnlyDelta.reasoningStepSummaries.length !== 2 ||
    !traceOnlyDelta.reasoningStepSummaries.includes('Inspect market context before selecting a source.') ||
    !traceOnlyDelta.reasoningStepSummaries.includes('tool_call: google_search') ||
    traceOnlyDelta.finishReason !== 'error'
  ) {
    throw new Error(`expected trace-only delta to preserve reasoning/tool signals, got ${JSON.stringify(traceOnlyDelta)}`)
  }

  const failedResponseDelta = extractAssistantStreamDelta({
    type: 'response.failed',
    response: {
      status: 'failed',
      model: 'gpt-5-nano',
      error: {
        code: 'unsupported_parameter',
        message: "Unsupported parameter: 'stop'.",
      },
    },
  })
  if (
    failedResponseDelta.contentDelta !== '' ||
    failedResponseDelta.finishReason !== 'error' ||
    failedResponseDelta.modelId !== 'gpt-5-nano' ||
    !failedResponseDelta.reasoningStepSummaries.includes("provider_error: Unsupported parameter: 'stop'.")
  ) {
    throw new Error(`expected failed Responses event to preserve provider error metadata, got ${JSON.stringify(failedResponseDelta)}`)
  }

  const completedResponseDelta = extractAssistantStreamDelta({
    type: 'response.completed',
    response: {
      output: [
        {
          type: 'reasoning',
          summary: [
            { type: 'summary_text', text: 'reasoning summary stays metadata' },
          ],
        },
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'Completed final answer' },
          ],
        },
      ],
    },
  })
  if (completedResponseDelta.contentDelta !== 'Completed final answer') {
    throw new Error(`expected completed response wrapper text, got ${JSON.stringify(completedResponseDelta.contentDelta)}`)
  }

  const directMessageText = extractAssistantDelta({
    choices: [
      {
        message: {
          role: 'assistant',
          text: 'Direct message text answer',
        },
      },
    ],
  })
  if (directMessageText !== 'Direct message text answer') {
    throw new Error(`expected direct message text answer, got ${JSON.stringify(directMessageText)}`)
  }

  const typedFinalAnswer = extractAssistantContentText({
    type: 'final_answer',
    text: 'Typed final answer',
  })
  if (typedFinalAnswer !== 'Typed final answer') {
    throw new Error(`expected typed final answer text, got ${JSON.stringify(typedFinalAnswer)}`)
  }

  const reasoningOnly = extractAssistantContentText({
    type: 'reasoning',
    text: 'reasoning should not become final assistant text',
  })
  if (reasoningOnly !== '') {
    throw new Error(`expected reasoning-only block to stay out of assistant text, got ${JSON.stringify(reasoningOnly)}`)
  }
}
