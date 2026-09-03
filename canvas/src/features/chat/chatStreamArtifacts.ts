import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { resolveWorkspaceSourceIndexSnapshot } from '@/features/workspace-fs/sourceIndex'
import { mergeWorkspaceEntriesIntoSourceFiles, resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { readWorkspaceSourceFilesDocsOnlySetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT,
  normalizeChatLocalStorageRootPath,
} from './chatStorageConfig'
import { formatReasoningStepSummary } from './floatingPanelChat/floatingPanelChatStreamParsing'
import {
  extractAgenticOsWorkspaceSessionId,
  formatAgenticOsWorkspaceSessionId,
  toAgenticOsTraceWorkspacePath,
} from './chatHistoryWorkspace.paths'
import { ensureChatWorkspaceMirrorFolder, mirrorChatWorkspaceFileToHost } from './chatWorkspaceMirror'
import { ensureWorkspaceFolderPathExists, writeWorkspaceFileTextEnsuringFile } from './chatWorkspaceFsWrite'
import {
  persistDereferencedChatStreamArtifacts,
  type DereferencedChatStreamArtifact,
} from './chatStreamArtifactDereference'
import { filterPersistableObservedUrls, sanitizeStreamArtifactPrompt } from './chatStreamArtifactSanitizers'
import { buildShareThinkingArtifactDocument } from './shareThinkingArtifact'
import { mergeAgenticOsTraceSection } from './chatAgenticOsConsolidatedArtifacts'
import {
  buildChatTraceQueryRelevance,
  type ChatTraceQueryRelevance,
} from './chatTraceQueryRelevance'

const REPORT_SHARE_HINT_RX = /\/report\/share\//i

const pad2 = (value: number): string => String(value).padStart(2, '0')

const toYamlScalar = (value: unknown): string => {
  return JSON.stringify(String(value ?? ''))
}

const toSlug = (value: unknown): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const clampText = (value: unknown, maxLength: number): string => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : text
}

const wrapFence = (content: string, language: string): string => {
  const safe = String(content || '').replace(/\r\n/g, '\n')
  const fence = safe.includes('```') ? '````' : '```'
  return `${fence}${language}\n${safe}\n${fence}`
}

const formatReadableUtc = (timestampMs: number): string => {
  const date = new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now())
  return [
    date.getUTCFullYear(),
    '-',
    pad2(date.getUTCMonth() + 1),
    '-',
    pad2(date.getUTCDate()),
    ' ',
    pad2(date.getUTCHours()),
    ':',
    pad2(date.getUTCMinutes()),
    ':',
    pad2(date.getUTCSeconds()),
    ' UTC',
  ].join('')
}

export const formatChatStreamArtifactSessionId = (timestampMs: number): string => {
  return formatAgenticOsWorkspaceSessionId(timestampMs)
}

const readSessionIdFromWorkspacePath = (workspacePath: string | null | undefined): string | null => {
  const raw = String(workspacePath || '').trim()
  if (!raw) return null
  return extractAgenticOsWorkspaceSessionId(normalizeWorkspacePath(raw))
}

const extractUniqueUrls = (values: readonly string[]): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  const urlRx = /https?:\/\/[^\s<>"')\]]+/gi
  values.forEach(value => {
    const text = String(value || '')
    let match: RegExpExecArray | null = null
    while ((match = urlRx.exec(text)) !== null) {
      const candidate = String(match[0] || '').replace(/[),.;]+$/g, '')
      if (!candidate) continue
      const key = candidate.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(candidate)
    }
  })
  return out
}

const isReportShareUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return REPORT_SHARE_HINT_RX.test(url.pathname)
  } catch {
    return false
  }
}

type StreamArtifactQueryRelevance = ChatTraceQueryRelevance

type WorkspaceOutputSnapshot = {
  headings: string[]
  previewLines: string[]
  requestedSectionsPresent: string[]
  namedTermsPresent: string[]
}

type StreamSignalSnapshot = {
  contentChunkCount: number
  reasoningChunkCount: number
  selectedSignals: string[]
  markdownProjectionLines: string[]
  reasoningHighlights: string[]
  toolSignals: string[]
  sourceUrls: string[]
}

const GENERIC_WORKSPACE_HEADING_RX = /^(computing flow definition|runner protocol|graph registry|document links|flow graph|pipeline|open questions|customization guide)\b/i
const GENERIC_PREVIEW_LINE_RX = /(this document is the pipeline|machine-readable source of truth|human-readable projection|self-runnable|graph-complete|schema-validated|ssot surfaces|renderers may use this block|dual-layer structure|workspace listings|execute .+ logic using bounded graph context|execution:\s*computing-flow|output:\s*"?computed analysis"?|stage:\s*"?execute"?)/i
const REQUEST_KEYWORD_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'by', 'for', 'from', 'how', 'in', 'into', 'is', 'of', 'on', 'or', 'the', 'to', 'with',
  'should', 'could', 'would', 'please', 'question', 'query', 'output', 'stream', 'report', 'response',
])

const uniqueText = (values: readonly string[]): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  values.forEach(value => {
    const text = String(value || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(text)
  })
  return out
}

export const buildStreamArtifactQueryRelevance = buildChatTraceQueryRelevance

const stripLeadingFrontmatter = (value: string): string => {
  const text = String(value || '').replace(/\r\n/g, '\n').trim()
  if (!text.startsWith('---\n')) return text
  const closingIndex = text.indexOf('\n---\n', 4)
  if (closingIndex < 0) return text
  return text.slice(closingIndex + 5).trim()
}

const extractMarkdownHeadingSnapshot = (value: string, maxCount = 6): string[] => {
  const body = stripLeadingFrontmatter(value)
  if (!body) return []
  const headings = uniqueText(
    body
      .split('\n')
      .map(line => {
        const match = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line)
        return match?.[1] ? clampText(match[1], 120) : ''
      })
      .filter(Boolean),
  )
  return headings.slice(0, Math.max(1, maxCount))
}

const buildWorkspaceOutputSnapshot = (args: {
  requestText: string
  workspaceAssistantText?: string | null
}): WorkspaceOutputSnapshot => {
  const text = stripLeadingFrontmatter(String(args.workspaceAssistantText || '').trim())
  if (!text) {
    return {
      headings: [],
      previewLines: [],
      requestedSectionsPresent: [],
      namedTermsPresent: [],
    }
  }
  const queryRelevance = buildStreamArtifactQueryRelevance(args.requestText)
  const lowered = text.toLowerCase()
  const keywordSet = buildRequestKeywordSet(args.requestText, queryRelevance)
  const headings = extractMarkdownHeadingSnapshot(text).filter(heading => {
    const normalized = heading.replace(/^\{\{.+\}\}\s*·\s*/g, '').trim()
    if (!normalized) return false
    if (normalized.includes('{{')) return false
    if (GENERIC_WORKSPACE_HEADING_RX.test(normalized)) return false
    return scorePreviewLine(normalized, keywordSet) > 0
  })
  return {
    headings,
    previewLines: extractRelevantMarkdownPreviewLines({
      value: text,
      requestText: args.requestText,
      maxCount: 6,
    }),
    requestedSectionsPresent: queryRelevance.requestedSections.filter(section => lowered.includes(section.toLowerCase())),
    namedTermsPresent: queryRelevance.namedTerms.filter(term => lowered.includes(term.toLowerCase())),
  }
}

const shouldSkipPreviewLine = (line: string): boolean => {
  const normalized = String(line || '').trim()
  if (!normalized) return true
  if (normalized === '---') return true
  if (normalized.startsWith('```')) return true
  if (normalized.startsWith('|')) return true
  if (normalized.startsWith('[↑ ') || normalized.startsWith('[↓ ')) return true
  if (normalized.startsWith('`bg#')) return true
  if (normalized.includes('{{')) return true
  if (/^> \*\*Machine source:/i.test(normalized)) return true
  if (/^read the table left to right:/i.test(normalized)) return true
  if (GENERIC_PREVIEW_LINE_RX.test(normalized)) return true
  if (/^#{1,6}\s+/.test(normalized)) {
    const heading = normalized.replace(/^#{1,6}\s+/, '').trim()
    if (GENERIC_WORKSPACE_HEADING_RX.test(heading)) return true
  }
  return false
}

const extractKeywordTokens = (value: string): string[] => {
  const matches: string[] = String(value || '').match(/\b[A-Za-z0-9]{2,}\b/g) || []
  return uniqueText(matches.filter((token: string) => {
    const lowered = token.toLowerCase()
    if (REQUEST_KEYWORD_STOPWORDS.has(lowered)) return false
    if (/^[0-9]+$/.test(token)) return false
    if (token.length <= 2 && token !== token.toUpperCase()) return false
    return true
  }))
}
const buildRequestKeywordSet = (requestText: string, queryRelevance?: StreamArtifactQueryRelevance): Set<string> => (
  new Set([
    ...extractKeywordTokens(queryRelevance?.intent || requestText),
    ...(queryRelevance?.namedTerms || []).flatMap(term => extractKeywordTokens(term)),
    ...(queryRelevance?.requestedSections || []).flatMap(section => extractKeywordTokens(section)),
  ].map(keyword => keyword.toLowerCase()))
)
const scorePreviewLine = (line: string, keywordSet: Set<string>): number => {
  const normalized = String(line || '').trim()
  if (!normalized || shouldSkipPreviewLine(normalized)) return Number.NEGATIVE_INFINITY
  const tokens = extractKeywordTokens(normalized).map(token => token.toLowerCase())
  const overlap = tokens.filter(token => keywordSet.has(token))
  if (overlap.length === 0) return -1
  let score = overlap.length * 10
  if (/^#{1,6}\s+/.test(normalized)) score += 2
  if (normalized.length <= 160) score += 1
  return score
}

const extractRelevantMarkdownPreviewLines = (args: {
  value: string
  requestText: string
  maxCount?: number
}): string[] => {
  const maxCount = Math.max(1, args.maxCount || 6)
  const body = stripLeadingFrontmatter(args.value)
  if (!body) return []
  const queryRelevance = buildStreamArtifactQueryRelevance(args.requestText)
  const keywordSet = buildRequestKeywordSet(args.requestText, queryRelevance)
  const candidates = body
    .split('\n')
    .map((line, index) => ({
      line: clampText(String(line || '').trim(), 180),
      index,
    }))
    .filter(entry => entry.line)
    .map(entry => ({
      ...entry,
      score: scorePreviewLine(entry.line, keywordSet),
    }))
    .filter(entry => Number.isFinite(entry.score) && entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
  return uniqueText(candidates.map(entry => entry.line)).slice(0, maxCount)
}

const safeParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

const readStringField = (record: Record<string, unknown> | null, key: string): string => {
  const value = record?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

const pushUniqueLimited = (target: string[], value: unknown, maxCount = 16, maxLength = 220) => {
  if (target.length >= maxCount) return
  const text = clampText(value, maxLength)
  if (!text) return
  const key = text.toLowerCase()
  if (target.some(item => item.toLowerCase() === key)) return
  target.push(text)
}

const collectStepToolSignal = (step: unknown): string => {
  const record = asRecord(step)
  if (!record) return ''
  const summary = formatReasoningStepSummary(step)
  if (summary) return summary
  const type = readStringField(record, 'type')
  return type
}

const collectToolCallSignals = (delta: Record<string, unknown>): string[] => {
  const out: string[] = []
  const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls : []
  calls.forEach(call => {
    const record = asRecord(call)
    const fn = asRecord(record?.function)
    const name = readStringField(fn, 'name') || readStringField(record, 'name') || readStringField(record, 'type')
    if (name) pushUniqueLimited(out, `tool_call: ${name}`, 8, 120)
  })
  return out
}

const extractReasoningTexts = (delta: Record<string, unknown>): string[] => {
  return uniqueText([
    readStringField(delta, 'reasoning_content'),
    readStringField(delta, 'reasoning'),
    readStringField(delta, 'thought'),
    readStringField(delta, 'analysis'),
  ]).filter(Boolean)
}

const buildStreamSignalSnapshot = (args: { requestText: string; rawSseEvents: string[]; reasoningSteps?: string[] }): StreamSignalSnapshot => {
  const selectedSignals: string[] = []
  const contentParts: string[] = []
  const reasoningParts: string[] = []
  const reasoningHighlights: string[] = []
  const toolSignals: string[] = []
  const sourceUrlCandidates: string[] = []
  let contentChunkCount = 0
  let reasoningChunkCount = 0
  for (const event of args.rawSseEvents) {
    const parsed = safeParseJson(event)
    const parsedRecord = asRecord(parsed)
    const deltas = Array.isArray(parsedRecord?.choices) ? parsedRecord?.choices : []
    let eventSummary = ''
    for (const choice of deltas) {
      const choiceRecord = asRecord(choice)
      const delta = asRecord(choiceRecord?.delta) || asRecord(choiceRecord?.message) || {}
      const content = readStringField(delta, 'content')
      if (content.replace(/\s+/g, '').trim()) contentChunkCount += 1
      if (content) contentParts.push(content)
      const previewLines = extractRelevantMarkdownPreviewLines({
        value: content,
        requestText: args.requestText,
        maxCount: 2,
      })
      if (previewLines.length > 0) {
        eventSummary = `content: ${previewLines.join(' | ')}`
        break
      }
      const reasoningSteps = Array.isArray(delta.reasoning_steps) ? delta.reasoning_steps : []
      if (reasoningSteps.length > 0) {
        reasoningChunkCount += 1
        reasoningSteps.forEach(step => {
          const signal = collectStepToolSignal(step)
          pushUniqueLimited(toolSignals, signal, 12, 180)
          pushUniqueLimited(reasoningHighlights, signal, 12, 180)
          sourceUrlCandidates.push(...extractUniqueUrls([JSON.stringify(step)]))
        })
        eventSummary = `reasoning: ${reasoningSteps.length} step${reasoningSteps.length === 1 ? '' : 's'}`
      }
      const reasoningTexts = extractReasoningTexts(delta)
      if (reasoningTexts.length > 0) {
        reasoningChunkCount += 1
        reasoningParts.push(...reasoningTexts)
        reasoningTexts.forEach(text => {
          const relevantLines = extractRelevantMarkdownPreviewLines({
            value: text,
            requestText: args.requestText,
            maxCount: 2,
          })
          relevantLines.forEach(line => pushUniqueLimited(reasoningHighlights, line, 12, 180))
        })
        if (!eventSummary) eventSummary = `reasoning: ${clampText(reasoningTexts[0], 120)}`
      }
      collectToolCallSignals(delta).forEach(signal => pushUniqueLimited(toolSignals, signal, 12, 180))
      sourceUrlCandidates.push(...extractUniqueUrls([event, content, ...reasoningTexts]))
    }
    if (!eventSummary) {
      const urls = filterPersistableObservedUrls(extractUniqueUrls([event]))
      if (urls.length > 0) eventSummary = `url: ${clampText(urls[0], 160)}`
    }
    if (!eventSummary) continue
    selectedSignals.push(eventSummary)
  }
  const streamMarkdown = contentParts.join('')
  const markdownProjectionLines = extractRelevantMarkdownPreviewLines({
    value: streamMarkdown,
    requestText: args.requestText,
    maxCount: 8,
  })
  const reasoningProjectionLines = extractRelevantMarkdownPreviewLines({
    value: reasoningParts.join('\n'),
    requestText: args.requestText,
    maxCount: 4,
  })
  reasoningProjectionLines.forEach(line => pushUniqueLimited(reasoningHighlights, line, 12, 180))
  ;(args.reasoningSteps || []).forEach(step => {
    const signal = clampText(step, 180)
    pushUniqueLimited(reasoningHighlights, signal, 12, 180)
    if (/^(?:provider_error|stream_error|stream_empty|tool_call|web_search|fetch_url):/i.test(signal)) pushUniqueLimited(selectedSignals, signal, 12, 180)
  })
  return {
    contentChunkCount,
    reasoningChunkCount,
    selectedSignals: uniqueText(selectedSignals).slice(0, 8),
    markdownProjectionLines,
    reasoningHighlights: uniqueText(reasoningHighlights).slice(0, 8),
    toolSignals: uniqueText(toolSignals).slice(0, 8),
    sourceUrls: filterPersistableObservedUrls(extractUniqueUrls(sourceUrlCandidates)).slice(0, 8),
  }
}

type ArtifactNode = {
  id: string
  type: string
  label: string
  stage: string
  summary: string
  order: number
  prompt?: string
  action?: string
  href?: string
  tags?: string[]
  references?: string[]
}

type ArtifactEdge = {
  id: string
  source: string
  target: string
  label: string
}

type RenderedChatStreamReport = {
  path: string
  text: string
  reportUrl: string | null
}

type RenderedChatStreamExtraDocument = {
  path: string
  text: string
}

export type RenderedChatStreamArtifacts = {
  bundle: ChatStreamArtifactBundle
  observedUrls: string[]
  dereferencedArtifacts: DereferencedChatStreamArtifact[]
  logText: string
  reportDocuments: RenderedChatStreamReport[]
  extraDocuments: RenderedChatStreamExtraDocument[]
}

const pushNodeYaml = (lines: string[], node: ArtifactNode) => {
  lines.push(`  - id: ${toYamlScalar(node.id)}`)
  lines.push(`    type: ${toYamlScalar(node.type)}`)
  lines.push(`    label: ${toYamlScalar(node.label)}`)
  lines.push('    properties:')
  lines.push(`      stage: ${toYamlScalar(node.stage)}`)
  lines.push(`      summary: ${toYamlScalar(node.summary)}`)
  lines.push(`      order: ${node.order}`)
  if (node.prompt) lines.push(`      prompt: ${toYamlScalar(node.prompt)}`)
  if (node.action) lines.push(`      action: ${toYamlScalar(node.action)}`)
  if (node.href) lines.push(`      href: ${toYamlScalar(node.href)}`)
  if (node.tags && node.tags.length > 0) {
    lines.push('      tags:')
    node.tags.forEach(tag => {
      lines.push(`        - ${toYamlScalar(tag)}`)
    })
  }
  if (node.references && node.references.length > 0) {
    lines.push('      references:')
    node.references.forEach(reference => {
      lines.push(`        - ${toYamlScalar(reference)}`)
    })
  }
}

const pushEdgeYaml = (lines: string[], edge: ArtifactEdge) => {
  lines.push(`  - id: ${toYamlScalar(edge.id)}`)
  lines.push(`    source: ${toYamlScalar(edge.source)}`)
  lines.push(`    target: ${toYamlScalar(edge.target)}`)
  lines.push(`    label: ${toYamlScalar(edge.label)}`)
}

const buildArtifactFrontmatter = (args: {
  documentId: string
  documentTitle: string
  nodes: ArtifactNode[]
  edges: ArtifactEdge[]
}): string => {
  const lines = [
    '---',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: false',
    'kgDocumentStructureBaselineLock: false',
    'doc:',
    `  id: ${toYamlScalar(args.documentId)}`,
    `  title: ${toYamlScalar(args.documentTitle)}`,
    'nodes:',
  ]
  args.nodes.forEach(node => pushNodeYaml(lines, node))
  lines.push('edges:')
  args.edges.forEach(edge => pushEdgeYaml(lines, edge))
  lines.push('---', '')
  return lines.join('\n')
}

type ChatStreamArtifactBundle = {
  sessionId: string
  folderPath: string
  streamLogPath: string
  streamReportPath: string
}
export type PersistedChatStreamArtifactBundle = ChatStreamArtifactBundle & { createdArtifactPaths: WorkspacePath[] }
export const resolveChatStreamArtifactBundle = (args: {
  workspacePath?: string | null
  timestampMs: number
  defaultLocalRootPath: string
}): ChatStreamArtifactBundle => {
  const sessionId = readSessionIdFromWorkspacePath(args.workspacePath) || formatChatStreamArtifactSessionId(args.timestampMs)
  const rootPath = normalizeWorkspacePath(
    normalizeChatLocalStorageRootPath(String(args.defaultLocalRootPath || '').trim() || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT),
  )
  const folderPath = normalizeWorkspacePath(`${rootPath === '/' ? '' : rootPath}/${sessionId}`)
  const tracePath = args.workspacePath ? toAgenticOsTraceWorkspacePath(args.workspacePath) : null
  return {
    sessionId,
    folderPath,
    streamLogPath: tracePath || normalizeWorkspacePath(`${folderPath}/chat-stream-log_${sessionId}.md`),
    streamReportPath: normalizeWorkspacePath(`${folderPath}/chat-stream-report_${sessionId}.md`),
  }
}

export const resetChatStreamArtifactBundleForTests = (): void => {
  // Bundle resolution is currently pure; tests still rely on a shared reset hook.
}

export const ensureChatStreamArtifactBundleInitialized = async (args: {
  workspacePath?: string | null
  timestampMs: number
  defaultLocalRootPath: string
}): Promise<ChatStreamArtifactBundle> => {
  const bundle = resolveChatStreamArtifactBundle(args)
  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  await ensureWorkspaceFolderPathExists(bundle.folderPath)
  void ensureChatWorkspaceMirrorFolder(bundle.folderPath)
  return bundle
}

const buildStreamLogDocument = (args: {
  bundle: ChatStreamArtifactBundle
  timestampMs: number
  traceId: string
  providerSummary: string
  modelId: string | null
  workspacePath?: string | null
  requestText: string
  rawAssistantText: string
  workspaceAssistantText?: string | null
  usageSummary: string | null
  finishReason: string | null
  reasoningSteps: string[]
  rawSseEvents: string[]
  status: 'ok' | 'error'
  observedUrls: string[]
  dereferencedArtifacts: DereferencedChatStreamArtifact[]
}): string => {
  const documentId = `stream-log:${args.bundle.sessionId}:${toSlug(args.traceId) || 'trace'}`
  const queryRelevance = buildStreamArtifactQueryRelevance(args.requestText)
  const workspaceOutputSnapshot = buildWorkspaceOutputSnapshot({
    requestText: args.requestText,
    workspaceAssistantText: args.workspaceAssistantText,
  })
  const responsePreviewLines = workspaceOutputSnapshot.previewLines.length > 0
    ? workspaceOutputSnapshot.previewLines
    : extractRelevantMarkdownPreviewLines({
        value: args.rawAssistantText,
        requestText: args.requestText,
        maxCount: 6,
      })
  const streamSignalSnapshot = buildStreamSignalSnapshot({
    requestText: args.requestText,
    rawSseEvents: args.rawSseEvents,
    reasoningSteps: args.reasoningSteps,
  })
  const nodes: ArtifactNode[] = [
    {
      id: `${documentId}:session`,
      type: 'story',
      label: `Chat Session ${args.bundle.sessionId}`,
      stage: 'Lineage',
      summary: `${args.providerSummary || 'Provider pending'} streamed JSON SSE chunks into workspace artifacts.`,
      order: 1,
      tags: ['chat', 'session', 'stream-log'],
    },
    {
      id: `${documentId}:prompt`,
      type: 'beat',
      label: 'Prompt Contract',
      stage: 'Lineage',
      summary: clampText(queryRelevance.intent, 180) || 'Prompt unavailable.',
      prompt: clampText(sanitizeStreamArtifactPrompt(args.requestText), 400) || 'Prompt unavailable.',
      order: 2,
    },
    {
      id: `${documentId}:query`,
      type: 'beat',
      label: 'Query Relevance',
      stage: 'Lineage',
      summary: queryRelevance.focus,
      action: clampText(
        [
          queryRelevance.requestedSections.length > 0
            ? `Sections ${queryRelevance.requestedSections.join(', ')}`
            : null,
          queryRelevance.namedTerms.length > 0
            ? `Terms ${queryRelevance.namedTerms.join(', ')}`
            : null,
        ].filter(Boolean).join(' · '),
        240,
      ),
      order: 3,
    },
    {
      id: `${documentId}:stream`,
      type: 'panel',
      label: 'SSE Stream',
      stage: 'Observability',
      summary: `${args.rawSseEvents.length} JSON chunk${args.rawSseEvents.length === 1 ? '' : 's'} observed for ${clampText(queryRelevance.intent, 120) || 'the active query'}.`,
      action: clampText([args.usageSummary, args.finishReason ? `finish ${args.finishReason}` : null].filter(Boolean).join(' · '), 240),
      order: 4,
      tags: ['sse', 'json', args.status],
    },
  ]
  const edges: ArtifactEdge[] = [
    { id: `${documentId}:session-prompt`, source: `${documentId}:session`, target: `${documentId}:prompt`, label: 'prompts' },
    { id: `${documentId}:prompt-query`, source: `${documentId}:prompt`, target: `${documentId}:query`, label: 'scopes' },
    { id: `${documentId}:query-stream`, source: `${documentId}:query`, target: `${documentId}:stream`, label: 'streams' },
  ]
  args.observedUrls.slice(0, 8).forEach((url, index) => {
    const nodeId = `${documentId}:url:${index + 1}`
    nodes.push({
      id: nodeId,
      type: 'panel',
      label: `Observed URL ${index + 1}`,
      stage: isReportShareUrl(url) ? 'Reports' : 'References',
      summary: clampText(url, 180),
      href: url,
      order: 10 + index,
      references: [url],
    })
    edges.push({
      id: `${documentId}:stream-url:${index + 1}`,
      source: `${documentId}:stream`,
      target: nodeId,
      label: isReportShareUrl(url) ? 'publishes' : 'references',
    })
  })
  args.dereferencedArtifacts.slice(0, 8).forEach((artifact, index) => {
    const nodeId = `${documentId}:dereference:${index + 1}`
    nodes.push({
      id: nodeId,
      type: 'panel',
      label: `Dereferenced Artifact ${index + 1}`,
      stage: 'Reports',
      summary: clampText(artifact.fileName, 180),
      href: artifact.url,
      order: 30 + index,
      references: [artifact.url, artifact.workspacePath],
    })
    edges.push({
      id: `${documentId}:stream-dereference:${index + 1}`,
      source: `${documentId}:stream`,
      target: nodeId,
      label: 'dereferences',
    })
  })
  return [
    buildArtifactFrontmatter({
      documentId,
      documentTitle: `Chat Stream Log ${args.bundle.sessionId}`,
      nodes,
      edges,
    }),
    '# Chat Stream Log',
    '',
    `- Session: \`${args.bundle.sessionId}\``,
    `- Trace: \`${args.traceId}\``,
    `- Created: ${formatReadableUtc(args.timestampMs)}`,
    `- Provider: ${args.providerSummary || 'unknown'}`,
    `- Model: ${args.modelId || 'unknown'}`,
    `- Status: ${args.status}`,
    `- Finish: ${args.finishReason || 'pending'}`,
    `- Usage: ${args.usageSummary || 'unavailable'}`,
    `- Reasoning Steps: ${args.reasoningSteps.length}`,
    '',
    '## Prompt',
    '',
    wrapFence(sanitizeStreamArtifactPrompt(args.requestText), 'markdown'),
    '',
    '## Query Relevance',
    '',
    `- Intent: ${queryRelevance.intent}`,
    `- Focus: ${queryRelevance.focus}`,
    `- Requested Sections: ${queryRelevance.requestedSections.length > 0 ? queryRelevance.requestedSections.join(', ') : 'none explicitly requested'}`,
    `- Named Terms: ${queryRelevance.namedTerms.length > 0 ? queryRelevance.namedTerms.join(', ') : 'none extracted'}`,
    '',
    ...(String(args.workspaceAssistantText || '').trim()
      ? [
          '## Editor Workspace Output',
          '',
          `- Path: \`${String(args.workspacePath || '').trim() || 'unavailable'}\``,
          `- Heading Snapshot: ${workspaceOutputSnapshot.headings.length > 0 ? workspaceOutputSnapshot.headings.join(' | ') : 'no query-specific headings extracted'}`,
          `- Requested Sections Present: ${workspaceOutputSnapshot.requestedSectionsPresent.length > 0 ? workspaceOutputSnapshot.requestedSectionsPresent.join(', ') : 'none detected'}`,
          `- Named Terms Present: ${workspaceOutputSnapshot.namedTermsPresent.length > 0 ? workspaceOutputSnapshot.namedTermsPresent.join(', ') : 'none detected'}`,
          '',
        ]
      : []),
    '## Response Snapshot',
    '',
    ...(responsePreviewLines.length > 0
      ? responsePreviewLines.map(line => `- ${line}`)
      : [`- Active request focus: ${queryRelevance.focus}`]),
    '',
    '## Stream Signals',
    '',
    `- SSE Chunks Observed: ${args.rawSseEvents.length}`,
    `- Content Chunks: ${streamSignalSnapshot.contentChunkCount}`,
    `- Reasoning Chunks: ${streamSignalSnapshot.reasoningChunkCount}`,
    ...(streamSignalSnapshot.selectedSignals.length > 0
      ? [
          '- Selected Signals:',
          ...streamSignalSnapshot.selectedSignals.map(signal => `  - ${signal}`),
        ]
      : ['- Selected Signals: none extracted']),
    '',
    '## SSE Markdown Projection',
    '',
    '### Content Chunks',
    '',
    ...(streamSignalSnapshot.markdownProjectionLines.length > 0
      ? streamSignalSnapshot.markdownProjectionLines.map(line => `- ${line}`)
      : [`- No query-specific content lines extracted from JSON chunks for ${queryRelevance.focus}.`]),
    '',
    '### Reasoning and Tool Trace',
    '',
    ...(streamSignalSnapshot.reasoningHighlights.length > 0 || streamSignalSnapshot.toolSignals.length > 0
      ? uniqueText([
          ...streamSignalSnapshot.reasoningHighlights,
          ...streamSignalSnapshot.toolSignals,
        ]).slice(0, 10).map(line => `- ${line}`)
      : ['- No reasoning/tool signals extracted from streamed JSON chunks.']),
    '',
    '### Source Links',
    '',
    ...(streamSignalSnapshot.sourceUrls.length > 0
      ? streamSignalSnapshot.sourceUrls.map(url => `- ${url}`)
      : ['- No source URLs extracted from streamed JSON chunks.']),
    '',
    '## Dereferenced Workspace Artifacts',
    '',
    args.dereferencedArtifacts.length > 0
      ? args.dereferencedArtifacts.map(artifact => `- [${artifact.fileName}](${artifact.workspacePath}) ← ${artifact.url}`).join('\n')
      : 'No eligible share/report URLs were dereferenced.',
    '',
  ].join('\n')
}

const buildStreamReportDocument = (args: {
  bundle: ChatStreamArtifactBundle
  timestampMs: number
  traceId: string
  providerSummary: string
  modelId: string | null
  workspacePath?: string | null
  requestText: string
  rawAssistantText: string
  workspaceAssistantText?: string | null
  usageSummary: string | null
  finishReason: string | null
  reasoningSteps: string[]
  status: 'ok' | 'error'
  reportUrl: string | null
  reportIndex: number
  reportCount: number
  observedUrls: string[]
  dereferencedArtifacts: DereferencedChatStreamArtifact[]
}): string => {
  const suffix = args.reportCount > 1 ? `-${args.reportIndex + 1}` : ''
  const documentId = `stream-report${suffix}:${args.bundle.sessionId}:${toSlug(args.traceId) || 'trace'}`
  const queryRelevance = buildStreamArtifactQueryRelevance(args.requestText)
  const workspaceAssistantText = String(args.workspaceAssistantText || '').trim()
  const rawAssistantText = String(args.rawAssistantText || '').trim()
  const primaryReportText = workspaceAssistantText || rawAssistantText || 'Report content unavailable.'
  const workspaceOutputSnapshot = buildWorkspaceOutputSnapshot({
    requestText: args.requestText,
    workspaceAssistantText,
  })
  const reportLabel =
    args.reportCount > 1
      ? `Chat Stream Report ${args.reportIndex + 1}`
      : 'Chat Stream Report'
  const nodes: ArtifactNode[] = [
    {
      id: `${documentId}:session`,
      type: 'story',
      label: `Chat Session ${args.bundle.sessionId}`,
      stage: 'Lineage',
      summary: `${args.providerSummary || 'Provider pending'} finalized a stream-derived markdown report.`,
      order: 1,
      tags: ['chat', 'session', 'stream-report'],
    },
    {
      id: `${documentId}:report`,
      type: 'panel',
      label: reportLabel,
      stage: 'Reports',
      summary: clampText(
        [queryRelevance.intent, queryRelevance.focus].filter(Boolean).join(' · '),
        180,
      ) || 'Stream-derived report content pending.',
      action: clampText([args.usageSummary, args.finishReason ? `finish ${args.finishReason}` : null].filter(Boolean).join(' · '), 240),
      href: args.reportUrl || undefined,
      order: 2,
      references: args.reportUrl ? [args.reportUrl] : undefined,
    },
    {
      id: `${documentId}:observability`,
      type: 'beat',
      label: 'Observability',
      stage: 'Observability',
      summary: `Reasoning steps ${args.reasoningSteps.length}; ${args.usageSummary || 'usage unavailable'}`,
      order: 3,
    },
  ]
  const edges: ArtifactEdge[] = [
    { id: `${documentId}:session-report`, source: `${documentId}:session`, target: `${documentId}:report`, label: 'publishes' },
    { id: `${documentId}:report-observability`, source: `${documentId}:report`, target: `${documentId}:observability`, label: 'observed-by' },
  ]
  args.observedUrls.slice(0, 8).forEach((url, index) => {
    const nodeId = `${documentId}:reference:${index + 1}`
    nodes.push({
      id: nodeId,
      type: 'panel',
      label: isReportShareUrl(url) ? `Shared Artifact ${index + 1}` : `Reference ${index + 1}`,
      stage: isReportShareUrl(url) ? 'Reports' : 'References',
      summary: clampText(url, 180),
      href: url,
      order: 10 + index,
      references: [url],
    })
    edges.push({
      id: `${documentId}:report-reference:${index + 1}`,
      source: `${documentId}:report`,
      target: nodeId,
      label: isReportShareUrl(url) ? 'shares' : 'references',
    })
  })
  args.dereferencedArtifacts.slice(0, 8).forEach((artifact, index) => {
    const nodeId = `${documentId}:dereferenced:${index + 1}`
    nodes.push({
      id: nodeId,
      type: 'panel',
      label: `Dereferenced Markdown ${index + 1}`,
      stage: 'Reports',
      summary: clampText(artifact.fileName, 180),
      href: artifact.url,
      order: 30 + index,
      references: [artifact.url, artifact.workspacePath],
    })
    edges.push({
      id: `${documentId}:report-dereference:${index + 1}`,
      source: `${documentId}:report`,
      target: nodeId,
      label: 'dereferences',
    })
  })
  return [
    buildArtifactFrontmatter({
      documentId,
      documentTitle: `${reportLabel} ${args.bundle.sessionId}`,
      nodes,
      edges,
    }),
    `# ${reportLabel}`,
    '',
    `- Session: \`${args.bundle.sessionId}\``,
    `- Trace: \`${args.traceId}\``,
    `- Created: ${formatReadableUtc(args.timestampMs)}`,
    `- Provider: ${args.providerSummary || 'unknown'}`,
    `- Model: ${args.modelId || 'unknown'}`,
    `- Status: ${args.status}`,
    `- Finish: ${args.finishReason || 'pending'}`,
    `- Usage: ${args.usageSummary || 'unavailable'}`,
    '',
    ...(args.reportUrl ? ['## Share URL', '', `- ${args.reportUrl}`, ''] : []),
    '## Query Relevance',
    '',
    `- Intent: ${queryRelevance.intent}`,
    `- Focus: ${queryRelevance.focus}`,
    `- Requested Sections: ${queryRelevance.requestedSections.length > 0 ? queryRelevance.requestedSections.join(', ') : 'none explicitly requested'}`,
    `- Named Terms: ${queryRelevance.namedTerms.length > 0 ? queryRelevance.namedTerms.join(', ') : 'none extracted'}`,
    '',
    ...(workspaceAssistantText
      ? [
          '## Editor Workspace Output',
          '',
          `- Path: \`${String(args.workspacePath || '').trim() || 'unavailable'}\``,
          `- Heading Snapshot: ${workspaceOutputSnapshot.headings.length > 0 ? workspaceOutputSnapshot.headings.join(' | ') : 'none extracted'}`,
          `- Requested Sections Present: ${workspaceOutputSnapshot.requestedSectionsPresent.length > 0 ? workspaceOutputSnapshot.requestedSectionsPresent.join(', ') : 'none detected'}`,
          `- Named Terms Present: ${workspaceOutputSnapshot.namedTermsPresent.length > 0 ? workspaceOutputSnapshot.namedTermsPresent.join(', ') : 'none detected'}`,
          '',
        ]
      : []),
    '## Dereferenced Workspace Artifacts',
    '',
    args.dereferencedArtifacts.length > 0
      ? args.dereferencedArtifacts.map(artifact => `- [${artifact.fileName}](${artifact.workspacePath}) ← ${artifact.url}`).join('\n')
      : 'No eligible share/report URLs were dereferenced.',
    '',
    '## Prompt',
    '',
    wrapFence(sanitizeStreamArtifactPrompt(args.requestText), 'markdown'),
    '',
    workspaceAssistantText ? '## Stream-Aligned Workspace Output' : '## Stream-Derived Report',
    '',
    wrapFence(primaryReportText, 'markdown'),
    '',
    ...(workspaceAssistantText && workspaceAssistantText !== rawAssistantText
      ? [
          '## Raw Stream Output',
          '',
          wrapFence(rawAssistantText || 'Assistant text unavailable.', 'markdown'),
          '',
        ]
      : []),
    '',
  ].join('\n')
}

const buildDereferencedThinkingDocument = (args: {
  artifact: DereferencedChatStreamArtifact
  bundle: ChatStreamArtifactBundle
  timestampMs: number
  traceId: string
  providerSummary: string
  modelId: string | null
  workspacePath?: string | null
  requestText: string
  rawAssistantText: string
  workspaceAssistantText?: string | null
  usageSummary: string | null
  finishReason: string | null
  reasoningSteps: string[]
  rawSseEvents: string[]
  status: 'ok' | 'error'
  observedUrls: string[]
  reportDocuments: RenderedChatStreamReport[]
}): string => {
  return buildShareThinkingArtifactDocument(args)
}

const toReportPath = (bundle: ChatStreamArtifactBundle, reportIndex: number, reportCount: number): string => {
  if (reportCount <= 1 || reportIndex === 0) return bundle.streamReportPath
  const ordinal = String(reportIndex + 1).padStart(2, '0')
  return normalizeWorkspacePath(`${bundle.folderPath}/chat-${ordinal}-stream-report_${bundle.sessionId}.md`)
}

const materializeChatStreamArtifactsIntoSourceFiles = async (args: {
  createdPaths: WorkspacePath[]
  chatLocalStorageRootPath: string
}): Promise<void> => {
  const createdPaths = Array.from(
    new Set(
      (Array.isArray(args.createdPaths) ? args.createdPaths : [])
        .map(path => normalizeWorkspacePath(path))
        .filter(path => path && path !== '/'),
    ),
  )
  if (createdPaths.length === 0) return
  const store = useGraphStore.getState()
  const existing = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
  const existingBySourcePath = new Map<string, (typeof existing)[number]>()
  for (let i = 0; i < existing.length; i += 1) {
    const sourcePath = String(existing[i]?.source?.path || '')
    if (!sourcePath) continue
    existingBySourcePath.set(sourcePath, existing[i])
  }
  const fs = await getWorkspaceFs()
  const workspaceEntries = await fs.listEntries()
  const merged = mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries,
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(undefined),
    forceIncludePaths: createdPaths,
    forceIncludeOnly: true,
    workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
    workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
      chatLocalStorageRootPath: args.chatLocalStorageRootPath,
    }),
  })
  if (merged === existing) return
  const createdSourcePaths = new Set(createdPaths.map(path => resolveWorkspaceSourcePathKey(path)))
  let changed = false
  const next = merged.map(file => {
    const sourcePath = String(file?.source?.path || '')
    if (!createdSourcePaths.has(sourcePath)) return file
    const previous = existingBySourcePath.get(sourcePath) || null
    const nextEnabled = previous?.enabled === true
    if (file?.enabled === nextEnabled) return file
    changed = true
    return { ...file, enabled: nextEnabled }
  })
  store.setSourceFiles(changed ? next : merged)
}

export const renderChatStreamArtifacts = async (args: {
  workspacePath?: string | null
  timestampMs: number
  defaultLocalRootPath: string
  traceId: string
  providerSummary: string
  modelId: string | null
  requestText: string
  rawAssistantText: string
  workspaceAssistantText?: string | null
  usageSummary: string | null
  finishReason: string | null
  reasoningSteps: string[]
  rawSseEvents: string[]
  status: 'ok' | 'error'
  fetchUrlContent?: typeof fetchWorkspaceUrlContent
}): Promise<RenderedChatStreamArtifacts> => {
  const bundle = resolveChatStreamArtifactBundle({
    workspacePath: args.workspacePath,
    timestampMs: args.timestampMs,
    defaultLocalRootPath: args.defaultLocalRootPath,
  })
  const observedUrls = filterPersistableObservedUrls(extractUniqueUrls([args.requestText, args.rawAssistantText, String(args.workspaceAssistantText || ''), ...args.rawSseEvents]))
  const reportUrls = observedUrls.filter(isReportShareUrl)
  const dereferencedArtifacts = await persistDereferencedChatStreamArtifacts({
    folderPath: bundle.folderPath,
    urls: observedUrls,
    fetchUrlContent: args.fetchUrlContent,
  })
  const logText = buildStreamLogDocument({
    bundle,
    timestampMs: args.timestampMs,
    traceId: args.traceId,
    providerSummary: args.providerSummary,
    modelId: args.modelId,
    workspacePath: args.workspacePath,
    requestText: args.requestText,
    rawAssistantText: args.rawAssistantText,
    workspaceAssistantText: args.workspaceAssistantText,
    usageSummary: args.usageSummary,
    finishReason: args.finishReason,
    reasoningSteps: args.reasoningSteps,
    rawSseEvents: args.rawSseEvents,
    status: args.status,
    observedUrls,
    dereferencedArtifacts,
  })
  const reportCount = reportUrls.length
  const reportDocuments: RenderedChatStreamReport[] = []
  for (let i = 0; i < reportCount; i += 1) {
    const reportPath = toReportPath(bundle, i, reportCount)
    const reportText = buildStreamReportDocument({
      bundle,
      timestampMs: args.timestampMs,
      traceId: args.traceId,
      providerSummary: args.providerSummary,
      modelId: args.modelId,
      workspacePath: args.workspacePath,
      requestText: args.requestText,
      rawAssistantText: args.rawAssistantText,
      workspaceAssistantText: args.workspaceAssistantText,
      usageSummary: args.usageSummary,
      finishReason: args.finishReason,
      reasoningSteps: args.reasoningSteps,
      status: args.status,
      reportUrl: reportUrls[i] || null,
      reportIndex: i,
      reportCount,
      observedUrls,
      dereferencedArtifacts,
    })
    reportDocuments.push({
      path: reportPath,
      text: reportText,
      reportUrl: reportUrls[i] || null,
    })
  }
  const extraDocuments: RenderedChatStreamExtraDocument[] = dereferencedArtifacts
    .filter(artifact => artifact.exportFolderPath && artifact.exportMarkdownPath && artifact.exportToken)
    .map(artifact => ({
      path: normalizeWorkspacePath(`${artifact.exportFolderPath}/${artifact.exportToken}-thinking.md`),
      text: buildDereferencedThinkingDocument({
        artifact,
        bundle,
        timestampMs: args.timestampMs,
        traceId: args.traceId,
        providerSummary: args.providerSummary,
        modelId: args.modelId,
        workspacePath: args.workspacePath,
        requestText: args.requestText,
        rawAssistantText: args.rawAssistantText,
        workspaceAssistantText: args.workspaceAssistantText,
        usageSummary: args.usageSummary,
        finishReason: args.finishReason,
        reasoningSteps: args.reasoningSteps,
        rawSseEvents: args.rawSseEvents,
        status: args.status,
        observedUrls,
        reportDocuments,
      }),
    }))
  return {
    bundle,
    observedUrls,
    dereferencedArtifacts,
    logText,
    reportDocuments,
    extraDocuments,
  }
}

export const persistChatStreamArtifacts = async (args: {
  workspacePath?: string | null
  timestampMs: number
  defaultLocalRootPath: string
  traceId: string
  providerSummary: string
  modelId: string | null
  requestText: string
  rawAssistantText: string
  workspaceAssistantText?: string | null
  usageSummary: string | null
  finishReason: string | null
  reasoningSteps: string[]
  rawSseEvents: string[]
  status: 'ok' | 'error'
  fetchUrlContent?: typeof fetchWorkspaceUrlContent
}): Promise<PersistedChatStreamArtifactBundle> => {
  const bundle = await ensureChatStreamArtifactBundleInitialized({
    workspacePath: args.workspacePath,
    timestampMs: args.timestampMs,
    defaultLocalRootPath: args.defaultLocalRootPath,
  })
  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  const rendered = await renderChatStreamArtifacts(args)
  const tracePath = args.workspacePath ? toAgenticOsTraceWorkspacePath(args.workspacePath) : null
  if (tracePath && normalizeWorkspacePath(tracePath) === normalizeWorkspacePath(bundle.streamLogPath)) {
    await mergeAgenticOsTraceSection({
      fs,
      workspacePath: args.workspacePath,
      sectionKey: `stream-log:${args.traceId}`,
      title: 'Chat Stream Log',
      text: rendered.logText,
      fenceLanguage: 'markdown',
    })
  } else {
    await writeWorkspaceFileTextEnsuringFile({ fs, path: bundle.streamLogPath, text: rendered.logText })
    await mirrorChatWorkspaceFileToHost({ workspacePath: bundle.streamLogPath, text: rendered.logText })
  }
  const createdArtifactPaths: WorkspacePath[] = [bundle.streamLogPath as WorkspacePath]
  for (const reportDocument of rendered.reportDocuments) {
    await writeWorkspaceFileTextEnsuringFile({ fs, path: reportDocument.path, text: reportDocument.text })
    await mirrorChatWorkspaceFileToHost({ workspacePath: reportDocument.path, text: reportDocument.text })
    createdArtifactPaths.push(reportDocument.path as WorkspacePath)
  }
  for (const artifact of rendered.dereferencedArtifacts) {
    createdArtifactPaths.push(artifact.workspacePath as WorkspacePath)
    createdArtifactPaths.push(artifact.exportMarkdownPath as WorkspacePath)
  }
  for (const document of rendered.extraDocuments) {
    await writeWorkspaceFileTextEnsuringFile({ fs, path: document.path, text: document.text })
    await mirrorChatWorkspaceFileToHost({ workspacePath: document.path, text: document.text })
    createdArtifactPaths.push(document.path as WorkspacePath)
  }
  await materializeChatStreamArtifactsIntoSourceFiles({
    createdPaths: createdArtifactPaths,
    chatLocalStorageRootPath: args.defaultLocalRootPath,
  })
  return { ...bundle, createdArtifactPaths }
}
