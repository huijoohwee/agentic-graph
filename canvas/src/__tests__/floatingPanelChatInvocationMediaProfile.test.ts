import { analyzeAgenticOsRequest } from '@/features/chat/chatAgenticOsRequestProfile'
import { normalizeAgenticOsAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { buildStreamArtifactQueryRelevance } from '@/features/chat/chatStreamArtifacts'

const TRACE_ONLY_ASSISTANT_TEXT = [
  '## Provider Stream Trace',
  '',
  'The provider stream is active. Incoming reasoning, tool, and assistant deltas are appended below.',
  '',
  '### Stream Transcript',
  '',
  '[signal]',
  '- stream_empty: provider stream ended without assistant text',
  '',
  '### Terminal Metadata',
  '',
  '- Finish: error',
].join('\n')

export function testVisualInspectionAttachedMediaPromptsStayOutOfProductTerms() {
  for (const prompt of [
    'explain [attached image]',
    'describe [attached image]',
    'analyze [attached image]',
    'identify [attached image]',
    '/prd-tad.create explain [attached image]',
  ]) {
    const profile = analyzeAgenticOsRequest(prompt)
    if (profile.product || profile.namedTerms.length > 0) {
      throw new Error(`expected attached-media inspection prompt to stay out of product/named terms, got ${JSON.stringify({
        prompt,
        product: profile.product,
        namedTerms: profile.namedTerms,
      })}`)
    }
  }
}

export function testTraceOnlyFallbackDoesNotProjectProductOrNamedTerms() {
  const requestText = 'Draft a launch plan for **Universal Harness** with MapLibre, RxDB sync, and integrations.'
  const profile = analyzeAgenticOsRequest(requestText)
  if (!profile.product || profile.namedTerms.length <= 0) {
    throw new Error(`expected request profiler to retain structured terms before trace projection, got ${JSON.stringify({
      product: profile.product,
      namedTerms: profile.namedTerms,
    })}`)
  }
  const relevance = buildStreamArtifactQueryRelevance(requestText)
  if (relevance.namedTerms.length > 0 || relevance.focus.includes('Product:') || relevance.focus.includes('Named Terms:')) {
    throw new Error(`expected trace relevance to avoid Product/Named Terms projection, got ${JSON.stringify(relevance)}`)
  }
  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 8, 7, 18, 55),
    workspacePath: '/chat-log/20260708T071855Z/agenticOs_20260708T071855Z.md',
    requestText,
    assistantText: TRACE_ONLY_ASSISTANT_TEXT,
  })
  for (const required of [
    'title: "Chat Response"',
    'product: "{{product}}"',
    '$schema: "agentic-os-response/v1"',
    'agenticOsResponseOnly: true',
    'status: "trace_only"',
  ]) {
    if (!markdown.includes(required)) throw new Error(`expected neutral trace-only storage to include ${required}`)
  }
  for (const forbidden of [
    'Universal Harness · Chat Response',
    'product: "Universal Harness"',
    'Product: Universal Harness',
    'Named terms: Universal Harness',
  ]) {
    if (markdown.includes(forbidden)) throw new Error(`expected trace-only storage not to project ${forbidden}`)
  }
}

export function testLeadingInvocationVisualMediaTraceStaysQueryResponsiveNoBackfill() {
  const profile = analyzeAgenticOsRequest('/prd-tad.create explain [attached image]')
  if (profile.intent !== 'explain [attached image]' || profile.artifact !== 'PRD + TAD') {
    throw new Error(`expected route metadata to keep PRD/TAD artifact while preserving visual query intent, got ${JSON.stringify(profile)}`)
  }
  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 8, 5, 26, 25),
    workspacePath: '/chat-log/20260708T052625Z/agenticOs_20260708T052625Z.md',
    requestText: '/prd-tad.create explain [attached image]',
    assistantText: TRACE_ONLY_ASSISTANT_TEXT,
  })
  for (const required of [
    '$schema: "agentic-os-response/v1"',
    'agenticOsResponseOnly: true',
    '# Chat Response',
    'For the request "explain [attached image]"',
    'no answer is backfilled',
  ]) {
    if (!markdown.includes(required)) throw new Error(`expected visual inspection route output to include ${required}`)
  }
  for (const forbidden of [
    '$schema: "agentic-os-pipeline/v1"',
    'AI Pipeline',
    'Computing Flow Definition',
    'PRD — Product Requirements',
    'TAD — Technical Architecture',
    'product: "explain [attached image',
    'Product: explain [attached image',
    'Named terms: explain [attached image',
    'objective: "deliver PRD + TAD"',
  ]) {
    if (markdown.includes(forbidden)) throw new Error(`expected visual inspection route output not to backfill ${forbidden}`)
  }
}
