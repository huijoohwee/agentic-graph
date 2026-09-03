import {
  buildStreamArtifactQueryRelevance,
  renderChatStreamArtifacts,
} from '@/features/chat/chatStreamArtifacts'

export async function testRenderChatStreamArtifactsKeepsLeadingInvocationRouteOutOfKeywordSnapshots() {
  const requestText = '/prd-tad.create explain [attached image]'
  const relevance = buildStreamArtifactQueryRelevance(requestText)
  if (
    relevance.intent !== 'explain [attached image]' ||
    relevance.namedTerms.length > 0 ||
    !relevance.focus.startsWith('explain [attached image]')
  ) {
    throw new Error(`expected leading invocation relevance to stay centered on the remaining media query, got ${JSON.stringify(relevance)}`)
  }
  const rendered = await renderChatStreamArtifacts({
    workspacePath: '/chat-log/20260708T052625Z/agenticOs_20260708T052625Z.md',
    timestampMs: Date.UTC(2026, 6, 8, 5, 26, 25),
    defaultLocalRootPath: '/chat-log',
    traceId: 'trace-leading-invocation-media',
    providerSummary: 'OpenAI · Global · gpt-5-nano',
    modelId: 'gpt-5-nano-2025-08-07',
    requestText,
    rawAssistantText: '## Provider Stream Trace\n\n- stream_empty: provider stream ended without assistant text',
    workspaceAssistantText: [
      '# PRD/TAD Product Requirements',
      '',
      'PRD/TAD create scaffold route metadata should not become the response snapshot for sparse media prompts.',
      '',
      '## Attached Image Observation',
      '',
      'The attached image was the only query subject; no answer is backfilled without provider content.',
    ].join('\n'),
    usageSummary: null,
    finishReason: 'error',
    reasoningSteps: ['stream_empty: provider stream ended without assistant text'],
    rawSseEvents: [
      JSON.stringify({
        type: 'response.created',
        response: { status: 'in_progress', model: 'gpt-5-nano-2025-08-07', error: null },
      }),
    ],
    status: 'error',
  })
  if (!rendered.logText.includes('Heading Snapshot: Attached Image Observation')) {
    throw new Error(`expected stream log heading snapshot to follow the media query, got ${rendered.logText}`)
  }
  if (
    rendered.logText.includes('Heading Snapshot: PRD/TAD Product Requirements') ||
    rendered.logText.includes('- PRD/TAD create scaffold route metadata')
  ) {
    throw new Error(`expected stream log not to select route scaffold snapshots, got ${rendered.logText}`)
  }
}

export async function testRenderChatStreamArtifactsKeepsSparseMediaInvocationArtifactOutOfTraceFocus() {
  const requestText = '/prd-tad.create [attached image]'
  const relevance = buildStreamArtifactQueryRelevance(requestText)
  if (
    relevance.intent !== "what's [attached image]" ||
    relevance.focus !== "what's [attached image]" ||
    relevance.focus.includes('Artifact: PRD + TAD') ||
    relevance.focus.includes('/prd-tad.create')
  ) {
    throw new Error(`expected sparse media invocation trace focus to match plain attached-image query, got ${JSON.stringify(relevance)}`)
  }
  const rendered = await renderChatStreamArtifacts({
    workspacePath: '/chat-log/20260708T064823Z/agenticOs_20260708T064823Z.md',
    timestampMs: Date.UTC(2026, 6, 8, 6, 48, 23),
    defaultLocalRootPath: '/chat-log',
    traceId: 'trace-sparse-media-invocation',
    providerSummary: 'OpenAI · Global · gpt-5-nano',
    modelId: 'gpt-5-nano-2025-08-07',
    requestText,
    rawAssistantText: '## Provider Stream Trace\n\n- stream_empty: provider stream ended without assistant text',
    workspaceAssistantText: '',
    usageSummary: null,
    finishReason: 'error',
    reasoningSteps: ['stream_empty: provider stream ended without assistant text'],
    rawSseEvents: [
      JSON.stringify({
        type: 'response.created',
        response: { status: 'in_progress', model: 'gpt-5-nano-2025-08-07', error: null },
      }),
    ],
    status: 'error',
  })
  for (const required of [
    '- Intent: what\'s [attached image]',
    '- Focus: what\'s [attached image]',
    '- Active request focus: what\'s [attached image]',
  ]) {
    if (!rendered.logText.includes(required)) throw new Error(`expected sparse invocation trace log to include ${required}`)
  }
  for (const forbidden of ['Focus: what\'s [attached image] · Artifact: PRD + TAD', 'Active request focus: what\'s [attached image] · Artifact: PRD + TAD']) {
    if (rendered.logText.includes(forbidden)) throw new Error(`expected sparse invocation trace log not to include ${forbidden}`)
  }
}
