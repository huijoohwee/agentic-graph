import { load as parseYaml } from 'js-yaml'
import { buildDeterministicBaseTemplateAgenticOsTurn } from './chatHistoryWorkspace.agenticOs.baseFallback'
import { ensureAgenticOsBaseTemplateRequiredBodyScaffold } from './chatHistoryWorkspace.agenticOs.bodyScaffold'
import { sanitizeComputingFlowMarkdown } from './chatComputingFlowContract'
import { splitLeadingFrontmatterAndBody } from './chatAgenticOsFrontmatter'
import { isAgenticOsStructuredMarkdown } from './chatHistoryWorkspace.agenticOs.parse'
import { recoverStructuredAgenticOsAssistantPayload } from './chatHistoryWorkspace.agenticOs.recovery'
import { enforceAgenticOsQueryResponsiveContent } from './chatHistoryWorkspace.agenticOs.normalize'
import { extractChatResponseStructuredSurface, projectChatResponseStructuredSurfaceIntoAgenticOsFrontmatter } from './chatResponseStructuredContent'
import { buildResolvableVarKeySet, validateChatMarkdown } from './chatMarkdownValidation'
import { sanitizeChatHistoryTraceUserText } from './chatStreamArtifactSanitizers'
import { hasRecognizedChatRuntimeInvocation } from './chatRuntimeInvocationProfile'
import { analyzeAgenticOsRequest } from './chatAgenticOsRequestProfile'
import type { ChatResponseStructuredSource } from './chatResponseWidgetPaletteContract'

type AgenticOsStorageNormalizeArgs = {
  timestampMs: number
  workspacePath?: string
  requestText: string
  assistantText: string
  structuredResponseSource?: ChatResponseStructuredSource
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

const formatReadableTimestamp = (timestampMs: number): string => {
  const d = new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now())
  const yyyy = String(d.getFullYear())
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const min = pad2(d.getMinutes())
  const sec = pad2(d.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`
}

const wrapFence = (content: string, lang: string): string => {
  const safeLang = String(lang || '').trim() || 'text'
  const safe = String(content || '').replace(/\r\n/g, '\n')
  const ticks = safe.includes('```') ? '````' : '```'
  return [`${ticks}${safeLang}`, safe, ticks].join('\n')
}

const projectStructuredContentIntoAgenticOsMarkdown = (
  markdown: string,
  structuredResponseSource?: ChatResponseStructuredSource,
): string => {
  const parsed = splitLeadingFrontmatterAndBody(markdown)
  if (!parsed) return markdown
  const surface = extractChatResponseStructuredSurface(markdown, {
    trustedSource: structuredResponseSource,
  })
  if (!surface) return markdown
  const frontmatter = projectChatResponseStructuredSurfaceIntoAgenticOsFrontmatter({
    frontmatter: parsed.frontmatter,
    surface,
  })
  if (frontmatter === parsed.frontmatter) return markdown
  return ['---', frontmatter.trimEnd(), '---', parsed.body.trim()].join('\n').trimEnd() + '\n'
}

const isValidatedStorageAgenticOs = (markdown: string): boolean => {
  if (!isAgenticOsStructuredMarkdown(markdown)) return false
  const parsed = splitLeadingFrontmatterAndBody(markdown)
  if (!parsed) return false
  try {
    parseYaml(parsed.frontmatter)
  } catch {
    return false
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown })
  return validateChatMarkdown({ markdown, resolvableVarKeys }).ok
}

export const normalizeAgenticOsAssistantBodyForStorage = (args: AgenticOsStorageNormalizeArgs): string => {
  const raw = String(args.assistantText || '').replace(/\r\n/g, '\n').trim()
  const recovered = recoverStructuredAgenticOsAssistantPayload(raw)
  const agenticOs = typeof recovered.agenticOs === 'string' ? sanitizeComputingFlowMarkdown(recovered.agenticOs) : ''
  const profile = analyzeAgenticOsRequest(args.requestText)
  const hasStructuredAgenticOsInput = Boolean(agenticOs && isAgenticOsStructuredMarkdown(agenticOs))
  const allowStructuredAgenticOs = hasStructuredAgenticOsInput || hasRecognizedChatRuntimeInvocation(args.requestText) || profile.signals.computingFlow
  if (allowStructuredAgenticOs && agenticOs && isAgenticOsStructuredMarkdown(agenticOs)) {
    const queryResponsive = enforceAgenticOsQueryResponsiveContent({
      markdown: agenticOs,
      requestText: args.requestText,
      workspacePath: args.workspacePath,
      assistantText: args.assistantText,
    })
    const normalized = sanitizeComputingFlowMarkdown(projectStructuredContentIntoAgenticOsMarkdown(
      ensureAgenticOsBaseTemplateRequiredBodyScaffold(queryResponsive),
      args.structuredResponseSource,
    ))
    if (isValidatedStorageAgenticOs(normalized)) return normalized
  }
  const fileName = String(args.workspacePath || '').split('/').filter(Boolean).slice(-1)[0] || ''
  const fallback = buildDeterministicBaseTemplateAgenticOsTurn({
    timestampMs: args.timestampMs,
    fileName,
    requestText: args.requestText,
    assistantText: args.assistantText,
    structuredResponseSource: args.structuredResponseSource,
  })
  return sanitizeComputingFlowMarkdown(ensureAgenticOsBaseTemplateRequiredBodyScaffold(enforceAgenticOsQueryResponsiveContent({
    markdown: fallback,
    requestText: args.requestText,
    workspacePath: args.workspacePath,
    assistantText: args.assistantText,
  })))
}

export const buildAgenticOsWorkspaceDocument = (args: {
  canonicalAgenticOs: string
  historyBody?: string
}): string => {
  const canonical = String(args.canonicalAgenticOs || '').replace(/\r\n/g, '\n').trim()
  return `${canonical.trimEnd()}\n`
}

export const buildAgenticOsDraftEntry = (args: {
  timestampMs: number
  traceId: string
  providerSummary: string
  userText: string
  assistantText: string
}): string => {
  const heading = `## ${formatReadableTimestamp(args.timestampMs)} (in progress)`
  const assistantMarkdown = String(args.assistantText || '_Streaming..._').replace(/\r\n/g, '\n').trim() || '_Streaming..._'
  const userText = sanitizeChatHistoryTraceUserText(args.userText)
  return [
    `<!-- kg-chat-draft:start:${args.traceId} -->`,
    heading,
    '',
    `Trace-ID: ${args.traceId}`,
    '',
    `Provider: ${String(args.providerSummary || '').trim() || 'unknown'}`,
    '',
    '### user',
    wrapFence(userText, 'text'),
    '',
    '### assistant',
    wrapFence(assistantMarkdown, 'markdown'),
    `<!-- kg-chat-draft:end:${args.traceId} -->`,
  ].join('\n')
}
