import { renderChatStreamArtifacts } from '@/features/chat/chatStreamArtifacts'

export async function testRenderChatStreamArtifactsSurfacesCompactStreamErrors() {
  const rendered = await renderChatStreamArtifacts({
    workspacePath: '/chat-log/20260708T061137Z/agenticOs_20260708T061137Z.md',
    timestampMs: Date.UTC(2026, 6, 8, 6, 11, 37),
    defaultLocalRootPath: '/chat-log',
    traceId: 'trace-partial-stream',
    providerSummary: 'OpenAI · Global · gpt-5-nano',
    modelId: 'gpt-5-nano-2025-08-07',
    requestText: '/prd-tad.create [attached image]',
    rawAssistantText: '## Provider Stream Trace\n\n- stream_error: network stream closed',
    workspaceAssistantText: '',
    usageSummary: null,
    finishReason: 'error',
    reasoningSteps: ['stream_error: network stream closed'],
    rawSseEvents: ['{"type":"response.created","response":{"status":"in_progress","model":"gpt-5-nano-2025-08-07","error":null}}'],
    status: 'error',
  })
  if (!rendered.logText.includes('Reasoning Steps: 1') || !rendered.logText.includes('stream_error: network stream closed')) {
    throw new Error(`expected stream log to surface compact partial-stream errors, got ${rendered.logText}`)
  }
  if (!rendered.logText.includes('- Finish: error') || !rendered.logText.includes('Selected Signals:')) {
    throw new Error(`expected stream log to preserve terminal error metadata, got ${rendered.logText}`)
  }
}

export async function testRenderChatStreamArtifactsSurfacesMetadataOnlyStreamSignal() {
  const rendered = await renderChatStreamArtifacts({
    workspacePath: '/chat-log/20260708T062621Z/agenticOs_20260708T062621Z.md',
    timestampMs: Date.UTC(2026, 6, 8, 6, 26, 21),
    defaultLocalRootPath: '/chat-log',
    traceId: 'trace-metadata-only-stream',
    providerSummary: 'OpenAI · Global · gpt-5-nano',
    modelId: 'gpt-5-nano-2025-08-07',
    requestText: '/prd-tad.create [attached image]',
    rawAssistantText: '## Provider Stream Trace\n\n- stream_empty: provider stream ended without assistant text',
    workspaceAssistantText: '',
    usageSummary: null,
    finishReason: 'error',
    reasoningSteps: ['stream_empty: provider stream ended without assistant text'],
    rawSseEvents: ['{"type":"response.created","response":{"status":"in_progress","model":"gpt-5-nano-2025-08-07","error":null}}'],
    status: 'error',
  })
  if (!rendered.logText.includes('stream_empty: provider stream ended without assistant text')) {
    throw new Error(`expected stream log to surface metadata-only stream signal, got ${rendered.logText}`)
  }
}
