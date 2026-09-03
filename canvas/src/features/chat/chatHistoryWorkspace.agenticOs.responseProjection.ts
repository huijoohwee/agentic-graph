import type { JSONValue } from '@/lib/graph/types'
import {
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { analyzeAgenticOsRequest, sanitizeRequestIntent, sanitizeScalar } from './chatAgenticOsRequestProfile'
import { buildNamedTermSummary, fallbackArtifact } from './chatHistoryWorkspace.agenticOs.fallbackSections'
import type { ChatResponseStructuredSurface } from './chatResponseStructuredContent'
import { STRUCTURED_SURFACE_INLINE_COMPUTE_SOURCE } from './chatResponseStructuredCompute'

export const isTraceOnlyAssistantText = (assistantText: string): boolean => {
  const text = String(assistantText || '')
  if (!/Provider Stream Trace/i.test(text)) return false
  if (/did not return final assistant text/i.test(text)) return true
  return /provider stream is active/i.test(text) && /Incoming reasoning, tool, and assistant deltas/i.test(text)
}

export const summariseAssistantSignal = (assistantText: string): string => {
  if (isTraceOnlyAssistantText(assistantText)) return ''
  const text = String(assistantText || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || text.startsWith('---')) return ''
  return sanitizeScalar(text, 220)
}

export const hasSubstantiveAssistantMarkdown = (assistantText: string): boolean => {
  const assistantMarkdown = String(assistantText || '').replace(/\r\n/g, '\n').trim()
  return Boolean(
    assistantMarkdown
    && !assistantMarkdown.startsWith('---')
    && !isTraceOnlyAssistantText(assistantMarkdown)
    && assistantMarkdown !== 'No response content.'
  )
}

export const hasCompleteAssistantMarkdownAnswer = (assistantText: string): boolean => {
  if (!hasSubstantiveAssistantMarkdown(assistantText)) return false
  const assistantMarkdown = String(assistantText || '').replace(/\r\n/g, '\n').trim()
  const wordCount = assistantMarkdown.split(/\s+/).filter(Boolean).length
  return wordCount >= 80 || /^#{1,3}\s+\S+/m.test(assistantMarkdown) || /\n\s*\n/.test(assistantMarkdown)
}

const RESPONSE_ENVELOPE_FENCE_RX = /```(?:ya?ml|json)?\s*\n\s*response\s*:/gi

const countFenceMarkers = (text: string): number => (text.match(/```/g) || []).length

const hasUnbalancedDoubleQuotes = (text: string): boolean => {
  const quoteCount = (String(text || '').match(/(?<!\\)"/g) || []).length
  return quoteCount % 2 === 1
}

const closeOpenFence = (text: string): string =>
  countFenceMarkers(text) % 2 === 1 ? `${text.trimEnd()}\n\`\`\`` : text.trimEnd()

const removeTrailingBrokenYamlScalar = (lines: string[]): string[] => {
  const out = [...lines]
  while (out.length > 0 && !out[out.length - 1].trim()) out.pop()
  if (out.length <= 0) return out
  const tail = out[out.length - 1]
  if (/^\s*[A-Za-z0-9_-]+\s*:\s*"/.test(tail) && hasUnbalancedDoubleQuotes(tail)) out.pop()
  return out
}

const normalizeAssistantMarkdownForResponseProjection = (assistantText: string): string => {
  const markdown = String(assistantText || '').replace(/\r\n/g, '\n').trim()
  const starts = Array.from(markdown.matchAll(RESPONSE_ENVELOPE_FENCE_RX))
    .map(match => match.index)
    .filter((index): index is number => typeof index === 'number')
  if (starts.length < 2) return markdown
  const firstEnvelope = markdown.slice(starts[0], starts[1])
  return closeOpenFence(removeTrailingBrokenYamlScalar(firstEnvelope.split('\n')).join('\n'))
}

export const resolveFallbackCanvas2dRenderer = (_profile: ReturnType<typeof analyzeAgenticOsRequest>): string => 'storyboard'

export const shouldMaterializeHeadlessResponseSurface = (profile: ReturnType<typeof analyzeAgenticOsRequest>): boolean =>
  profile.signals.headlessStructured ||
  profile.signals.strybldr ||
  profile.signals.storytree ||
  profile.signals.gitGraph ||
  profile.signals.gantt ||
  profile.signals.richMediaPanels ||
  profile.signals.mcp

export const buildResponseStatus = (assistantText: string): string => {
  if (isTraceOnlyAssistantText(assistantText)) return 'trace_only'
  if (summariseAssistantSignal(assistantText)) return 'assistant_signal'
  return 'request_profile'
}

export const buildResponseMarkdownLines = (args: {
  profile: ReturnType<typeof analyzeAgenticOsRequest>
  assistantText: string
}): string[] => {
  const assistantMarkdown = String(args.assistantText || '').replace(/\r\n/g, '\n').trim()
  if (
    hasSubstantiveAssistantMarkdown(assistantMarkdown)
  ) {
    return normalizeAssistantMarkdownForResponseProjection(assistantMarkdown)
      .split('\n')
      .map(line => String(line || '').replace(/^(#{1,2})(\s+)/, '###$2'))
  }
  const traceOnly = isTraceOnlyAssistantText(args.assistantText)
  const assistantSignal = traceOnly ? '' : summariseAssistantSignal(args.assistantText)
  const namedTerms = buildNamedTermSummary(args.profile)
  const artifact = fallbackArtifact(args.profile.artifact)
  const intent = sanitizeRequestIntent(args.profile.intent, 320) || 'Prompt unavailable.'
  const resultLine = traceOnly
    ? `For the request "${intent}", the provider returned trace/tool signals but no final assistant text. This document does not invent the missing answer or infer missing details; no answer is backfilled. Rerun the request or inspect the trace artifact.`
    : assistantSignal
      ? `Partial assistant signal: ${assistantSignal}. No answer is backfilled beyond the provider text.`
      : 'No final assistant answer was available. No answer is backfilled.'
  return [
    '### Result',
    '',
    resultLine,
    '',
    '### Request',
    '',
    `- Intent: ${intent}`,
    ...(namedTerms ? [`- Named terms: ${namedTerms}`] : []),
    `- Artifact: ${artifact}`,
  ]
}

export const buildResponseMarkdown = (args: {
  profile: ReturnType<typeof analyzeAgenticOsRequest>
  assistantText: string
}): string => buildResponseMarkdownLines(args).join('\n')

export const buildHeadlessResponseSurface = (args: {
  profile: ReturnType<typeof analyzeAgenticOsRequest>
  assistantText: string
}): ChatResponseStructuredSurface | null => {
  if (!shouldMaterializeHeadlessResponseSurface(args.profile)) return null
  const markdown = buildResponseMarkdown(args)
  const renderer = resolveFallbackCanvas2dRenderer(args.profile)
  const commonPanelProperties = {
    'chat:structuredContent': true,
    'flow:widgetFormId': FLOW_RICH_MEDIA_PANEL_FORM_ID,
    'flow:widgetTypeId': FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
    richMediaActiveTab: 'text',
    media_interactive: false,
  } satisfies Record<string, JSONValue>
  return {
    frontmatter: {
      kgCanvas2dRenderer: renderer,
      ...(args.profile.signals.strybldr || args.profile.signals.storytree ? { kgStrybldrStoryboard: true } : {}),
    },
    nodes: [
      {
        id: 'mcp-response-request-brief',
        label: 'Request Brief',
        nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        kind: 'text',
        sourceHandle: 'output',
        targetHandle: 'output',
        properties: {
          ...commonPanelProperties,
          'chat:structuredRole': 'card',
          richMediaActiveTab: 'text',
          media_interactive: false,
          output: markdown,
        },
      },
      {
        id: 'mcp-response-headless-compute',
        label: 'Headless Compute',
        nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
        kind: 'text',
        sourceHandle: 'output',
        targetHandle: 'prompt_in',
        properties: {
          'chat:structuredContent': true,
          'chat:structuredRole': 'widget',
          'flow:widgetFormId': 'textGeneration',
          'flow:widgetTypeId': 'default',
          'flow:compute': STRUCTURED_SURFACE_INLINE_COMPUTE_SOURCE,
          prompt: 'Headless structured response compute runner',
        },
      },
      {
        id: 'mcp-response-rich-media-panel',
        label: 'Response Rich Media Panel',
        nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        kind: 'text',
        sourceHandle: 'output',
        targetHandle: 'output',
        properties: {
          ...commonPanelProperties,
          'chat:structuredRole': 'panel',
          output: markdown,
        },
      },
    ],
    edges: [
      {
        id: 'e-mcp-response-brief-to-compute',
        source: 'mcp-response-request-brief',
        target: 'mcp-response-headless-compute',
        sourceHandle: 'output',
        targetHandle: 'prompt_in',
        label: 'output->prompt_in',
      },
      {
        id: 'e-mcp-response-compute-to-panel',
        source: 'mcp-response-headless-compute',
        target: 'mcp-response-rich-media-panel',
        sourceHandle: 'output',
        targetHandle: 'output',
        label: 'output->output',
      },
    ],
  }
}
