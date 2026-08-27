import { hashText } from '@/features/parsers/hash'
import type { CorpusSourceUnit } from '@/features/queryable-corpus/corpusGraph'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { createUniqueId } from '@/lib/ids'
import { RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX, RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX } from '@/lib/render/richMediaPanelDefaults'
import { dump as stringifyYaml } from 'js-yaml'
import {
  buildRenderableIframeUrl,
  buildRenderableMediaThumbnailUrl,
  inferMediaKindFromResourceUrl,
} from '@/lib/graph/mediaUrlKind'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_FORM_ID,
  FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { buildMermaidGanttWorkflowCode } from '@/lib/mermaid/mermaidDiagramCode'
import { buildRemoteVideoFrameRequestUrl, getBilibiliVideoId, getYouTubeId, parseYouTubeStartSeconds } from 'grph-shared/rich-media/providers'
import { STRYBLDR_CAMERA_PROPERTY_KEY, buildStrybldrCameraHandoffLine, hasStrybldrCameraSettings, readStrybldrCameraSettings } from './strybldrCamera'
import { buildStrybldrCardOverridePatchFromGraphNodeChange, buildStrybldrWorkflowGanttCode } from './strybldrStoryboardMarkdownSync'
export { buildStrybldrCardOverridePatchFromGraphNodeChange, buildStrybldrWorkflowGanttCode } from './strybldrStoryboardMarkdownSync'
import type {
  StrybldrBox,
  StrybldrCardOverride,
  StrybldrDetectionProvider,
  StrybldrElement,
  StrybldrEvidenceKind,
  StrybldrExplainerVideoPanel,
  StrybldrExplainerVideoPanelTab,
  StrybldrExplainerVideoSnapshot,
  StrybldrWorkflow,
  StrybldrWorkflowEdge,
  StrybldrVideoHandoff,
  StrybldrVideoHandoffCard,
  StrybldrSource,
  StrybldrStoryboardDocument,
  StrytreeBranchCandidate,
  StrytreeCandidateRun,
  StrytreeStoryNode,
  StrytreeStorySnapshot,
} from './strybldrTypes'
const STRYBLDR_JSON_FENCE_RE = /```(?:json\s+)?strybldr-storyboard\s*\n([\s\S]*?)\n```/i
const STRYBLDR_FRONTMATTER_PAYLOAD_KEY = 'strybldr_storyboard'
const STRYBLDR_FRONTMATTER_PAYLOAD_KEYS = [
  STRYBLDR_FRONTMATTER_PAYLOAD_KEY,
  'strybldrStoryboard',
  'kgStrybldrStoryboardPayload',
] as const
const STRYBLDR_FRONTMATTER_MARKER_RE = /^\s*---[\s\S]*?(?:^|\n)\s*kgStrybldrStoryboard:\s*(?:"true"|'true'|true|1)\s*(?:\n|$)[\s\S]*?\n---/m
const DEFAULT_STRYBLDR_REMOTE_VIDEO_FRAME_SECONDS = 0
const asJson = (value: unknown): JSONValue => value as JSONValue
const cleanText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()
const cleanMultilineText = (value: unknown): string => String(value ?? '').replace(/\r\n?/g, '\n').trim()
const STRYBLDR_CARD_OVERRIDE_TEXT_KEYS = ['title', 'type', 'lane', 'summary', 'output', 'action', 'dialogue', 'prompt', 'style', 'chatModel', 'outputSrcDoc', 'imageUrl', 'mediaKind', 'mediaUrl', 'renderUrl', 'sourceUrl'] as const
const STRYBLDR_CARD_OVERRIDE_NUMBER_KEYS = ['order'] as const
const STRYBLDR_VIDEO_ARTIFACT_OVERRIDE_TEXT_KEYS = ['output', 'outputSrcDoc', 'imageUrl', 'mediaKind', 'mediaUrl', 'renderUrl', 'sourceUrl'] as const
const normalizePath = (raw: unknown): string => String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
const escapeRegExp = (value: string): string => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const shortHash = (value: unknown): string => hashText(String(value ?? '')).slice(0, 12)
const yamlQuote = (value: string): string => `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const yamlNestedBlock = (key: string, value: Record<string, unknown>): string[] => {
  const yaml = stringifyYaml(value, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd()
  return [
    `${key}:`,
    ...yaml.split('\n').map(line => `  ${line}`),
  ]
}
const CORPUS_MEDIA_KINDS = new Set(['code', 'sql', 'script', 'doc', 'paper', 'image', 'video', 'data', 'model', 'unknown'])
const htmlAttr = (value: string): string => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
const htmlText = (value: string): string => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
const SVG_TEXT_LINE_LENGTH = 42
const wrapSvgTextLines = (value: unknown, maxLines = 5): string[] => {
  const words = cleanText(value).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word
    if (nextLine.length > SVG_TEXT_LINE_LENGTH && line) {
      lines.push(line)
      line = word
    } else {
      line = nextLine
    }
    if (lines.length >= maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines.length > 0 ? lines : ['Strybldr generated image']
}
export const isStrybldrImageGenerationIntent = (value: unknown): boolean => {
  const text = cleanText(value).toLowerCase()
  if (!text) return false
  const hasExplicitImageTerm = /\b(image|picture|photo|poster|portrait|illustration|thumbnail|cover|visual|wukong|seedream|dall[- ]?e|gpt[- ]?image|png|jpeg|jpg)\b/.test(text)
  const hasFrameTerm = /\bframe\b/.test(text)
  const hasVideoTerm = /\b(video|animatic|clip|movie|motion|sequence)\b/.test(text)
  const hasGenerationTerm = /\b(generate|create|render|draw|make|produce|compose)\b/.test(text)
  const hasImageProviderTerm = /\b(wukong|seedream|dall[- ]?e|gpt[- ]?image)\b/.test(text)
  const hasImageTerm = hasExplicitImageTerm || (hasFrameTerm && !hasVideoTerm)
  return hasImageTerm && (hasGenerationTerm || hasImageProviderTerm)
}
export const buildStrybldrLocalImageDataUri = (args: {
  title?: unknown
  prompt?: unknown
  action?: unknown
  provider?: unknown
  model?: unknown
}): string => {
  const title = cleanText(args.title) || 'Strybldr generated image'
  const prompt = cleanMultilineText(args.prompt) || cleanMultilineText(args.action) || title
  const provider = cleanText(args.provider) || 'agenticgraph-local-image'
  const model = cleanText(args.model) || 'strybldr-local-image-v1'
  const titleLines = wrapSvgTextLines(title, 2)
  const promptLines = wrapSvgTextLines(prompt, 5)
  const titleText = titleLines.map((line, index) => `<text x="64" y="${96 + index * 36}" class="title">${htmlText(line)}</text>`).join('')
  const promptText = promptLines.map((line, index) => `<text x="64" y="${220 + index * 28}" class="body">${htmlText(line)}</text>`).join('')
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="0.55" stop-color="#dbeafe"/><stop offset="1" stop-color="#fef3c7"/></linearGradient>',
    '<style>',
    '.eyebrow{font:700 24px Inter,Arial,sans-serif;letter-spacing:0;fill:#475569}',
    '.title{font:800 42px Inter,Arial,sans-serif;letter-spacing:0;fill:#0f172a}',
    '.body{font:500 27px Inter,Arial,sans-serif;letter-spacing:0;fill:#1f2937}',
    '.meta{font:600 21px Inter,Arial,sans-serif;letter-spacing:0;fill:#475569}',
    '</style>',
    '</defs>',
    '<rect width="1280" height="720" fill="url(#bg)"/>',
    '<rect x="42" y="42" width="1196" height="636" rx="28" fill="rgba(255,255,255,0.74)" stroke="#cbd5e1" stroke-width="2"/>',
    '<rect x="64" y="496" width="1152" height="126" rx="18" fill="#0f172a" opacity="0.92"/>',
    '<text x="64" y="72" class="eyebrow">STRYBLDR IMAGE GENERATOR</text>',
    titleText,
    '<text x="64" y="184" class="eyebrow">PROMPT</text>',
    promptText,
    `<text x="96" y="550" class="meta" fill="#e2e8f0">Provider: ${htmlText(provider)}</text>`,
    `<text x="96" y="586" class="meta" fill="#e2e8f0">Model: ${htmlText(model)}</text>`,
    '<text x="96" y="622" class="meta" fill="#e2e8f0">Generated locally when no compatible live image provider is active.</text>',
    '</svg>',
  ].join('')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
const readCorpusMediaKind = (value: unknown): CorpusSourceUnit['mediaKind'] => {
  const raw = cleanText(value)
  return CORPUS_MEDIA_KINDS.has(raw) ? raw as CorpusSourceUnit['mediaKind'] : 'unknown'
}
const uniqueCleanTexts = (values: readonly unknown[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const text = cleanText(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}
const titleCase = (value: string): string => {
  const text = cleanText(value)
  if (!text) return ''
  return text
    .split(/[\s_.-]+/g)
    .filter(Boolean)
    .map(token => token.slice(0, 1).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ')
}
const basenameWithoutExt = (value: string): string => {
  const base = normalizePath(value).split('/').filter(Boolean).pop() || value || 'image'
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

const countLeadingSpaces = (value: string): number => {
  const match = String(value || '').match(/^\s*/)
  return match ? match[0].length : 0
}

const findLeadingUnfencedYamlEnd = (lines: readonly string[]): number => {
  let sawTopLevelKey = false
  for (let index = 0; index < lines.length; index += 1) {
    const raw = String(lines[index] || '')
    const trimmed = raw.trim()
    if (!trimmed) continue
    const indent = countLeadingSpaces(raw)
    if (indent === 0 && /^#{1,6}\s+/.test(trimmed)) return sawTopLevelKey ? index : -1
    if (indent === 0 && /^(```|~~~)/.test(trimmed)) return sawTopLevelKey ? index : -1
    if (indent === 0 && /^<[A-Za-z!/]/.test(trimmed)) return sawTopLevelKey ? index : -1
    if (indent === 0 && /^[A-Za-z0-9_.-]+\s*:/.test(trimmed)) sawTopLevelKey = true
  }
  return sawTopLevelKey ? lines.length : -1
}

const parseStrybldrStoryboardFrontmatter = (text: string): ReturnType<typeof parseMarkdownFrontmatter> => {
  const lines = splitMarkdownLines(String(text || ''))
  const fenced = parseMarkdownFrontmatter(lines)
  if (Object.keys(fenced.meta || {}).length > 0 || fenced.warnings.length > 0 || fenced.startIndex > 0) return fenced
  const end = findLeadingUnfencedYamlEnd(lines)
  if (end <= 0) return fenced
  return parseMarkdownFrontmatter(['---', ...lines.slice(0, end), '---'])
}

const readStrybldrFrontmatterLines = (text: string): string[] => {
  const lines = splitMarkdownLines(String(text || ''))
  let lead = 0
  while (lead < lines.length && !String(lines[lead] || '').trim()) lead += 1
  if (/^---\s*$/.test(String(lines[lead] || ''))) {
    for (let index = lead + 1; index < lines.length; index += 1) {
      if (/^---\s*$/.test(String(lines[index] || ''))) {
        return lines.slice(lead + 1, index)
      }
    }
    return []
  }
  const end = findLeadingUnfencedYamlEnd(lines)
  return end > 0 ? lines.slice(0, end) : []
}

const readStrybldrStoryboardPayloadFromLines = (lines: readonly string[]): Record<string, unknown> | null => {
  if (!Array.isArray(lines) || lines.length === 0) return null
  for (const key of STRYBLDR_FRONTMATTER_PAYLOAD_KEYS) {
    let start = -1
    for (let index = 0; index < lines.length; index += 1) {
      const raw = String(lines[index] || '')
      if (countLeadingSpaces(raw) !== 0) continue
      if (new RegExp(`^${escapeRegExp(key)}\\s*:`).test(raw.trim())) {
        start = index
        break
      }
    }
    if (start < 0) continue
    let end = lines.length
    for (let index = start + 1; index < lines.length; index += 1) {
      const raw = String(lines[index] || '')
      if (!raw.trim()) continue
      if (countLeadingSpaces(raw) === 0 && /^[A-Za-z0-9_.-]+\s*:/.test(raw.trim())) {
        end = index
        break
      }
    }
    const parsed = parseMarkdownFrontmatter(['---', ...lines.slice(start, end), '---'])
    const meta = parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)
      ? parsed.meta as Record<string, unknown>
      : null
    if (!meta) continue
    const value = meta[key]
    if (typeof value === 'string') {
      try {
        const parsedPayload = JSON.parse(value)
        if (parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)) {
          return parsedPayload as Record<string, unknown>
        }
      } catch {
        void 0
      }
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }
  return null
}

export const isStrybldrStoryboardMarkdown = (text: string): boolean => {
  const raw = String(text || '')
  return STRYBLDR_FRONTMATTER_MARKER_RE.test(raw) || STRYBLDR_JSON_FENCE_RE.test(raw) || STRYBLDR_FRONTMATTER_PAYLOAD_KEYS.some(key => raw.includes(`${key}:`))
}
export const isStrybldrStoryboardGraphData = (graphData: GraphData | null | undefined): boolean => {
  const metadata = graphData?.metadata && typeof graphData.metadata === 'object'
    ? graphData.metadata as Record<string, unknown>
    : {}
  if (String(graphData?.context || '') === 'strybldr-storyboard') return true
  if (String(metadata.kind || '') === 'strybldr-storyboard') return true
  if (String(metadata.parserId || '') === 'strybldr-storyboard') return true
  if (metadata.kgStrybldrStoryboard === true) return true
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  return nodes.some(node => String(node?.properties?.strybldrRunId || node?.properties?.strybldrSourceUnitId || '').trim().length > 0)
}
export const buildStrybldrRunId = (sources: readonly Pick<StrybldrSource, 'sourceUnitId' | 'workspacePath' | 'textHash'>[]): string => {
  const signature = sources
    .map(source => [source.sourceUnitId, source.workspacePath, source.textHash].map(v => cleanText(v)).join(':'))
    .sort()
    .join('|')
  return `strybldr-${shortHash(signature || 'empty')}`
}
export const buildStrybldrWorkspaceDocumentName = (source: Pick<StrybldrSource, 'originalName' | 'relativePath'>): string => {
  const base = basenameWithoutExt(source.originalName || source.relativePath || 'storyboard')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'storyboard'
  return `${base}.strybldr.md`
}
export const toStrybldrSource = (unit: CorpusSourceUnit, opts?: { mediaUrl?: string | null }): StrybldrSource => ({
  sourceUnitId: cleanText(unit.id),
  workspacePath: normalizePath(unit.workspacePath),
  relativePath: normalizePath(unit.relativePath || unit.originalName || unit.workspacePath),
  originalName: cleanText(unit.originalName || unit.relativePath || unit.workspacePath || 'image'),
  mediaKind: unit.mediaKind,
  mimeHint: unit.mimeHint || null,
  byteSize: Math.max(0, Number(unit.byteSize || 0)),
  textHash: cleanText(unit.textHash),
  mediaUrl: cleanText(opts?.mediaUrl) || null,
})
const sourceLabel = (source: StrybldrSource): string => titleCase(basenameWithoutExt(source.originalName || source.relativePath)) || 'Source'

const sourceKindLabel = (source: Pick<StrybldrSource, 'mediaKind'>): string => {
  const labels: Partial<Record<CorpusSourceUnit['mediaKind'], string>> = { image: 'image', video: 'video', paper: 'paper', model: 'model', data: 'data', code: 'code', script: 'code', sql: 'code', doc: 'document' }
  return labels[source.mediaKind] || 'source'
}

const isRemoteVideoFrameExtractionCandidate = (sourceUrl: string): boolean => {
  const raw = cleanText(sourceUrl)
  return /^https?:\/\//i.test(raw) && (!!getYouTubeId(raw) || !!getBilibiliVideoId(raw))
}

const buildStrybldrRemoteVideoFrameThumbnailUrl = (source: StrybldrSource, sourceUrl: string): string => {
  if (source.mediaKind !== 'video' || !isRemoteVideoFrameExtractionCandidate(sourceUrl)) return ''
  const timeSeconds = parseYouTubeStartSeconds(sourceUrl) ?? DEFAULT_STRYBLDR_REMOTE_VIDEO_FRAME_SECONDS
  return buildRemoteVideoFrameRequestUrl({ sourceUrl, timeSeconds, format: 'png' })
}

const buildStrybldrSourceMediaFields = (source: StrybldrSource): {
  mediaUrl: string
  sourceUrl: string
  renderUrl: string
  thumbnailUrl: string
  references: string[]
} => {
  const mediaUrl = cleanText(source.mediaUrl) || cleanText(source.originalName)
  const sourceUrl = /^https?:\/\//i.test(mediaUrl) ? mediaUrl : ''
  const renderUrl = buildRenderableIframeUrl(mediaUrl)
  const fallbackThumbnailUrl = buildRenderableMediaThumbnailUrl(mediaUrl)
  const frameThumbnailUrl = buildStrybldrRemoteVideoFrameThumbnailUrl(source, sourceUrl)
  const thumbnailUrl = frameThumbnailUrl || fallbackThumbnailUrl
  const references = uniqueCleanTexts([
    source.workspacePath || source.relativePath || source.originalName,
    sourceUrl,
    thumbnailUrl,
    fallbackThumbnailUrl,
  ])
  return { mediaUrl, sourceUrl, renderUrl, thumbnailUrl, references }
}

const createFallbackElements = (source: StrybldrSource, sourceIndex: number): StrybldrElement[] => {
  const label = sourceLabel(source)
  const elementBase = `${source.sourceUnitId || source.workspacePath}:${source.textHash || source.originalName}`
  const sourceBox: StrybldrBox = { xmin: 0, ymin: 0, xmax: 1, ymax: 1, unit: 'percentage' }
  return [
    {
      id: `strybldr-el-${shortHash(`${elementBase}:subject`)}`,
      sourceUnitId: source.sourceUnitId,
      label: 'Primary subject',
      confidence: 0.1,
      sourceBox,
      evidenceKind: 'source-metadata',
      provider: 'fallback',
      order: sourceIndex * 10 + 1,
      summary: `Primary story evidence inferred from ${label}.`,
      action: 'Confirm or replace this element after reviewing source evidence.',
      prompt: `Describe the primary story subject in ${label} as a video storyboard element.`,
    },
    {
      id: `strybldr-el-${shortHash(`${elementBase}:composition`)}`,
      sourceUnitId: source.sourceUnitId,
      label: 'Composition',
      confidence: 0.1,
      sourceBox,
      evidenceKind: 'source-metadata',
      provider: 'fallback',
      order: sourceIndex * 10 + 2,
      summary: `Story composition placeholder for ${label}.`,
      action: 'Break the source into foreground, midground, background, or narrative beats.',
      prompt: `Create a concise shot plan from the available ${sourceKindLabel(source)} evidence in ${label}.`,
    },
  ]
}

export const buildStrybldrStoryboardDocument = (args: {
  sourceUnits: readonly CorpusSourceUnit[]
  mediaUrlBySourceUnitId?: Readonly<Record<string, string | null | undefined>>
  elements?: readonly StrybldrElement[]
  createdAtMs?: number | null
}): StrybldrStoryboardDocument => {
  const sources = args.sourceUnits
    .map(unit => toStrybldrSource(unit, { mediaUrl: args.mediaUrlBySourceUnitId?.[unit.id] || null }))
  const runId = buildStrybldrRunId(sources)
  const explicitElements = Array.isArray(args.elements) ? args.elements.slice() : []
  const fallbackElements = explicitElements.length > 0
    ? []
    : sources.flatMap((source, index) => createFallbackElements(source, index))
  return {
    version: 1,
    runId,
    createdAtMs: Number.isFinite(Number(args.createdAtMs)) ? Number(args.createdAtMs) : Date.now(),
    sources,
    elements: explicitElements.length > 0 ? explicitElements : fallbackElements,
  }
}

export const serializeStrybldrStoryboardMarkdown = (doc: StrybldrStoryboardDocument): string => {
  const first = doc.sources[0] || null
  const title = first ? `${sourceLabel(first)} Strybldr` : 'Strybldr'
  return [
    '---',
    'kgStrybldrStoryboard: true',
    'kgCanvasRenderMode: "2d"',
    ...'kgCanvas2dRenderer: "storyboard"\nkgDocumentSemanticMode: "document"\nkgFrontmatterModeEnabled: true\nkgMultiDimTableModeEnabled: false\nkgBottomPanelOpen: true\nkgBottomPanelTab: "gantt"\nkgFloatingPanelOpen: true\nkgFloatingPanelView: "gantt"'.split('\n'),
    `strybldrRunId: ${yamlQuote(doc.runId)}`,
    ...yamlNestedBlock(STRYBLDR_FRONTMATTER_PAYLOAD_KEY, doc as unknown as Record<string, unknown>),
    '---',
    '',
    `# ${title}`,
    '',
  ].join('\n')
}

export const replaceStrybldrStoryboardMarkdownPayload = (text: string, doc: StrybldrStoryboardDocument): string | null => {
  return replaceStrybldrStoryboardMarkdownRawPayload(text, doc as unknown as Record<string, unknown>)
}

const replaceStrybldrStoryboardMarkdownRawPayload = (text: string, payload: Record<string, unknown>): string | null => {
  const raw = String(text || '')
  const frontmatterReplaced = replaceStrybldrStoryboardFrontmatterRawPayload(raw, payload)
  if (frontmatterReplaced) return frontmatterReplaced
  if (!STRYBLDR_JSON_FENCE_RE.test(raw)) return null
  return raw.replace(STRYBLDR_JSON_FENCE_RE, [
    '```json strybldr-storyboard',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n'))
}

const readStrybldrStoryboardRawPayload = (text: string): Record<string, unknown> | null => {
  const frontmatterPayload = readStrybldrStoryboardFrontmatterRawPayload(text)
  if (frontmatterPayload) return frontmatterPayload
  const match = String(text || '').match(STRYBLDR_JSON_FENCE_RE)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1] || '')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

const readStrybldrStoryboardFrontmatterRawPayload = (text: string): Record<string, unknown> | null => {
  const parsed = parseStrybldrStoryboardFrontmatter(text)
  const meta = parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)
    ? parsed.meta as Record<string, unknown>
    : null
  if (meta) {
    for (const key of STRYBLDR_FRONTMATTER_PAYLOAD_KEYS) {
      const value = meta[key]
      if (!value) continue
      if (typeof value === 'string') {
        try {
          const parsedPayload = JSON.parse(value)
          return parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)
            ? parsedPayload as Record<string, unknown>
            : null
        } catch {
          return null
        }
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
      }
    }
  }
  return readStrybldrStoryboardPayloadFromLines(readStrybldrFrontmatterLines(text))
}

const replaceStrybldrStoryboardFrontmatterRawPayload = (text: string, payload: Record<string, unknown>): string | null => {
  const raw = String(text || '')
  const lines = splitMarkdownLines(raw)
  if (!lines.length || !/^---\s*$/.test(lines[0] || '')) return null
  let fenceEndIndex = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---\s*$/.test(lines[index] || '')) {
      fenceEndIndex = index
      break
    }
  }
  if (fenceEndIndex <= 0) return null
  const nextPayloadLines = yamlNestedBlock(STRYBLDR_FRONTMATTER_PAYLOAD_KEY, payload)
  for (let index = 1; index < fenceEndIndex; index += 1) {
    const line = lines[index] || ''
    const match = /^(\s*)([A-Za-z0-9_.-]+)\s*:/.exec(line)
    if (!match) continue
    const baseIndent = (match[1] || '').length
    if (baseIndent !== 0 || !STRYBLDR_FRONTMATTER_PAYLOAD_KEYS.includes(match[2] as typeof STRYBLDR_FRONTMATTER_PAYLOAD_KEYS[number])) continue
    let endIndex = index + 1
    while (endIndex < fenceEndIndex) {
      const nextLine = lines[endIndex] || ''
      if (nextLine.trim()) {
        const nextIndent = (nextLine.match(/^\s*/) || [''])[0].length
        if (nextIndent <= baseIndent) break
      }
      endIndex += 1
    }
    const indent = ' '.repeat(baseIndent)
    const replacement = nextPayloadLines.map(nextLine => `${indent}${nextLine}`)
    return [
      ...lines.slice(0, index),
      ...replacement,
      ...lines.slice(endIndex),
    ].join('\n')
  }
  return [
    ...lines.slice(0, fenceEndIndex),
    ...nextPayloadLines,
    ...lines.slice(fenceEndIndex),
  ].join('\n')
}

export const updateStrybldrStoryboardMarkdownCardOverride = (args: {
  text: string
  nodeId: string
  patch: Omit<Partial<StrybldrCardOverride>, 'nodeId'>
}): string | null => {
  const rawPayload = readStrybldrStoryboardRawPayload(args.text)
  const doc = rawPayload ? readParsedObject(rawPayload) : null
  const nodeId = cleanText(args.nodeId)
  if (!doc || !nodeId) return null
  const currentCards = Array.isArray(rawPayload?.cards) ? rawPayload.cards as unknown[] : []
  const index = currentCards.findIndex(card => (
    !!card
    && typeof card === 'object'
    && !Array.isArray(card)
    && cleanText((card as Partial<StrybldrCardOverride>).nodeId) === nodeId
  ))
  const current = index >= 0 && currentCards[index] && typeof currentCards[index] === 'object' && !Array.isArray(currentCards[index])
    ? currentCards[index] as StrybldrCardOverride
    : { nodeId }
  const next: StrybldrCardOverride = { ...current, nodeId }
  for (const key of STRYBLDR_CARD_OVERRIDE_TEXT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(args.patch, key)) continue
    const value = cleanMultilineText(args.patch[key])
    if (value) next[key] = value
    else delete next[key]
  }
  for (const key of STRYBLDR_CARD_OVERRIDE_NUMBER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(args.patch, key)) continue
    const value = Number(args.patch[key])
    if (Number.isFinite(value)) next[key] = value
    else delete next[key]
  }
  const hasOverride = STRYBLDR_CARD_OVERRIDE_TEXT_KEYS.some(key => cleanMultilineText(next[key])) || STRYBLDR_CARD_OVERRIDE_NUMBER_KEYS.some(key => Number.isFinite(Number(next[key])))
  const nextCards = index >= 0 ? currentCards.slice() : currentCards.concat(next)
  if (hasOverride) nextCards[index >= 0 ? index : nextCards.length - 1] = next
  else if (index >= 0) nextCards.splice(index, 1)
  const nextPayload = { ...rawPayload }
  if (nextCards.length > 0) nextPayload.cards = nextCards
  else delete nextPayload.cards
  return replaceStrybldrStoryboardMarkdownRawPayload(args.text, nextPayload)
}

export const clearStrybldrVideoArtifactMarkdownOverrides = (args: {
  text: string
  targetNodeId?: string | null
}): string | null => {
  const rawPayload = readStrybldrStoryboardRawPayload(args.text)
  const doc = rawPayload ? readParsedObject(rawPayload) : null
  const targetNodeId = cleanText(args.targetNodeId)
  if (!doc) return null
  const currentCards = Array.isArray(rawPayload?.cards) ? rawPayload.cards as unknown[] : []
  if (currentCards.length === 0) return args.text
  let changed = false
  const nextCards = currentCards.flatMap(card => {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return []
    const current = { ...(card as StrybldrCardOverride) }
    const nodeId = cleanText(current.nodeId)
    if (!nodeId || nodeId === targetNodeId) return [current]
    const hasArtifactOverride = STRYBLDR_VIDEO_ARTIFACT_OVERRIDE_TEXT_KEYS.some(key => cleanMultilineText(current[key]))
    if (!hasArtifactOverride) return [current]
    for (const key of STRYBLDR_VIDEO_ARTIFACT_OVERRIDE_TEXT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue
      delete current[key]
      changed = true
    }
    const hasRemainingOverride = STRYBLDR_CARD_OVERRIDE_TEXT_KEYS.some(key => cleanMultilineText(current[key]))
      || STRYBLDR_CARD_OVERRIDE_NUMBER_KEYS.some(key => Number.isFinite(Number(current[key])))
    return hasRemainingOverride ? [current] : []
  })
  if (!changed) return args.text
  const nextPayload = { ...rawPayload }
  if (nextCards.length > 0) nextPayload.cards = nextCards
  else delete nextPayload.cards
  return replaceStrybldrStoryboardMarkdownRawPayload(args.text, nextPayload)
}

export const createNextStrybldrStoryboardMarkdownNodeId = (args: {
  text: string
  prefix?: string
}): string | null => {
  const rawPayload = readStrybldrStoryboardRawPayload(args.text)
  const doc = rawPayload ? readParsedObject(rawPayload) : null
  if (!doc) return null
  const prefix = cleanText(args.prefix) || 'storyboard-card-'
  const usedIds = new Set<string>()
  const idRe = new RegExp(`${escapeRegExp(prefix)}\\d+`, 'g')
  for (const match of String(args.text || '').matchAll(idRe)) {
    const id = cleanText(match[0])
    if (id) usedIds.add(id)
  }
  return createUniqueId(prefix, usedIds)
}

export const appendStrybldrStoryboardMarkdownElement = (args: {
  text: string
  nodeId: string
  title?: string | null
  type?: string | null
  lane?: string | null
  order?: number | null
  sourceUnitId?: string | null
  summary?: string | null
  action?: string | null
  prompt?: string | null
}): string | null => {
  const rawPayload = readStrybldrStoryboardRawPayload(args.text)
  const doc = rawPayload ? readParsedObject(rawPayload) : null
  const nodeId = cleanText(args.nodeId)
  if (!doc || !nodeId) return null
  const existingElementIds = new Set(doc.elements.map(element => cleanText(element.id)).filter(Boolean))
  const existingCardIds = new Set((doc.cards || []).map(card => cleanText(card.nodeId)).filter(Boolean))
  if (existingElementIds.has(nodeId) || existingCardIds.has(nodeId)) return null
  const sourceUnitId = cleanText(args.sourceUnitId) || cleanText(doc.sources[0]?.sourceUnitId)
  if (!sourceUnitId) return null
  const maxOrder = Math.max(
    0,
    ...doc.elements.map(element => Number(element.order)).filter(Number.isFinite),
    ...(doc.cards || []).map(card => Number(card.order)).filter(Number.isFinite),
  )
  const nextOrder = Number.isFinite(Number(args.order)) ? Number(args.order) : maxOrder + 1
  const title = cleanText(args.title) || 'New storyboard card'
  const summary = cleanMultilineText(args.summary)
  const action = cleanMultilineText(args.action)
  const prompt = cleanMultilineText(args.prompt)
  const lane = cleanText(args.lane)
  const type = cleanText(args.type)
  const nextElement: StrybldrElement = {
    id: nodeId,
    sourceUnitId,
    label: title,
    confidence: 1,
    sourceBox: null,
    evidenceKind: 'user-edit',
    provider: 'human',
    order: nextOrder,
    ...(summary ? { summary } : {}),
    ...(action ? { action } : {}),
    ...(prompt ? { prompt } : {}),
  }
  const nextCard: StrybldrCardOverride = {
    nodeId,
    ...(title ? { title } : {}),
    ...(type ? { type } : {}),
    ...(lane ? { lane } : {}),
    order: nextOrder,
    ...(summary ? { summary } : {}),
    ...(action ? { action } : {}),
    ...(prompt ? { prompt } : {}),
  }
  const nextPayload = {
    ...rawPayload,
    elements: [...doc.elements, nextElement],
    cards: [...(doc.cards || []), nextCard],
  }
  return replaceStrybldrStoryboardMarkdownRawPayload(args.text, nextPayload)
}

export const removeStrybldrStoryboardMarkdownElement = (args: {
  text: string
  nodeId: string
}): string | null => {
  const rawPayload = readStrybldrStoryboardRawPayload(args.text)
  const doc = rawPayload ? readParsedObject(rawPayload) : null
  const nodeId = cleanText(args.nodeId)
  if (!doc || !nodeId) return null
  const nextElements = doc.elements.filter(element => cleanText(element.id) !== nodeId)
  const nextCards = (doc.cards || []).filter(card => cleanText(card.nodeId) !== nodeId)
  if (nextElements.length === doc.elements.length && nextCards.length === (doc.cards || []).length) return null
  const nextPayload: Record<string, unknown> & { elements: typeof nextElements; cards?: typeof nextCards } = {
    ...rawPayload,
    elements: nextElements,
  }
  if (nextCards.length > 0) nextPayload.cards = nextCards
  else delete nextPayload.cards
  return replaceStrybldrStoryboardMarkdownRawPayload(args.text, nextPayload)
}

const readParsedObject = (value: unknown): StrybldrStoryboardDocument | null => {
  if (!value || typeof value !== 'object') return null
  const rec = value as Partial<StrybldrStoryboardDocument>
  const sources = Array.isArray(rec.sources)
    ? rec.sources
        .map((item): StrybldrSource | null => {
          if (!item || typeof item !== 'object') return null
          const source = item as Partial<StrybldrSource>
          const sourceUnitId = cleanText(source.sourceUnitId)
          const workspacePath = normalizePath(source.workspacePath)
          const originalName = cleanText(source.originalName || source.relativePath || workspacePath)
          if (!sourceUnitId || !originalName) return null
          return {
            sourceUnitId,
            workspacePath,
            relativePath: normalizePath(source.relativePath || originalName),
            originalName,
            mediaKind: readCorpusMediaKind(source.mediaKind),
            mimeHint: cleanText(source.mimeHint) || null,
            byteSize: Math.max(0, Number(source.byteSize || 0)),
            textHash: cleanText(source.textHash),
            mediaUrl: cleanText(source.mediaUrl) || null,
          }
        })
        .filter((item): item is StrybldrSource => !!item)
    : []
  if (sources.length === 0) return null
  const sourceIds = new Set(sources.map(source => source.sourceUnitId))
  const elements = Array.isArray(rec.elements)
    ? rec.elements
        .map((item, index): StrybldrElement | null => {
          if (!item || typeof item !== 'object') return null
          const el = item as Partial<StrybldrElement>
          const sourceUnitId = cleanText(el.sourceUnitId)
          if (!sourceUnitId || !sourceIds.has(sourceUnitId)) return null
          const label = cleanText(el.label) || `Element ${index + 1}`
          return {
            id: cleanText(el.id) || `strybldr-el-${shortHash(`${sourceUnitId}:${label}:${index}`)}`,
            sourceUnitId,
            label,
            confidence: Math.max(0, Math.min(1, Number(el.confidence || 0))),
            sourceBox: el.sourceBox || null,
            evidenceKind: el.evidenceKind || 'source-metadata',
            provider: el.provider || 'fallback',
            order: Number.isFinite(Number(el.order)) ? Number(el.order) : index,
            lane: cleanText(el.lane) || null,
            prompt: cleanText(el.prompt) || null,
            action: cleanText(el.action) || null,
            summary: cleanText(el.summary) || null,
          }
        })
        .filter((item): item is StrybldrElement => !!item)
    : []
  const elementIds = new Set(elements.map(element => element.id))
  const edges = readStrybldrWorkflowEdges((rec as Record<string, unknown>).edges, elementIds)
  const workflow = readStrybldrWorkflow((rec as Record<string, unknown>).workflow)
  const cards = Array.isArray((rec as Record<string, unknown>).cards)
    ? ((rec as Record<string, unknown>).cards as unknown[])
        .map((item): StrybldrCardOverride | null => {
          if (!item || typeof item !== 'object') return null
          const card = item as Partial<StrybldrCardOverride>
          const nodeId = cleanText(card.nodeId)
          if (!nodeId) return null
          const out: StrybldrCardOverride = { nodeId }
          for (const key of STRYBLDR_CARD_OVERRIDE_TEXT_KEYS) {
            const value = cleanMultilineText(card[key])
            if (value) out[key] = value
          }
          const order = Number(card.order)
          if (Number.isFinite(order)) out.order = order
          return out
        })
        .filter((item): item is StrybldrCardOverride => !!item)
    : []
  return {
    version: 1,
    runId: cleanText(rec.runId) || buildStrybldrRunId(sources),
    createdAtMs: Number.isFinite(Number(rec.createdAtMs)) ? Number(rec.createdAtMs) : 0,
    sources,
    elements: elements.length > 0 ? elements : sources.flatMap(createFallbackElements),
    ...(cards.length > 0 ? { cards } : {}),
    edges,
    workflow,
    notes: cleanText(rec.notes) || null,
    storytree: readStrytreeSnapshot((rec as Record<string, unknown>).storytree),
    explainerVideo: readExplainerVideoSnapshot((rec as Record<string, unknown>).explainerVideo),
  }
}

export const parseStrybldrStoryboardMarkdown = (text: string): StrybldrStoryboardDocument | null => {
  const rawPayload = readStrybldrStoryboardRawPayload(text)
  return rawPayload ? readParsedObject(rawPayload) : null
}

export const readStrybldrWorkflowGanttCodesFromMarkdown = (text: string): string[] => {
  const raw = String(text || '')
  if (
    !raw.includes(STRYBLDR_FRONTMATTER_PAYLOAD_KEY)
    && !raw.includes('strybldrStoryboard')
    && !raw.includes('kgStrybldrStoryboardPayload')
    && !STRYBLDR_JSON_FENCE_RE.test(raw)
  ) {
    return []
  }
  const code = buildStrybldrWorkflowGanttCode(parseStrybldrStoryboardMarkdown(raw))
  return code ? [code] : []
}

const createEdge = (source: string, target: string, label: string): GraphEdge => ({
  id: `strybldr:edge:${shortHash(`${source}:${label}:${target}`)}`,
  source,
  target,
  label,
  properties: {
    evidenceKind: asJson('source-metadata'),
    confidence: asJson('medium'),
  },
})

const createWorkflowEdge = (edge: StrybldrWorkflowEdge): GraphEdge => ({
  id: cleanText(edge.id) || `strybldr:workflow-edge:${shortHash(`${edge.source}:${edge.label}:${edge.target}`)}`,
  source: edge.source,
  target: edge.target,
  label: edge.label,
  properties: {
    evidenceKind: asJson('workflow-contract'),
    confidence: asJson('high'),
    strybldrWorkflowEdge: asJson(true),
  },
})

const readStrybldrWorkflowEdges = (value: unknown, elementIds: ReadonlySet<string>): StrybldrWorkflowEdge[] => {
  if (!Array.isArray(value) || elementIds.size === 0) return []
  const out: StrybldrWorkflowEdge[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const source = cleanText(rec.source)
    const target = cleanText(rec.target)
    const label = cleanText(rec.label)
    if (!source || !target || !label) continue
    if (!elementIds.has(source) || !elementIds.has(target)) continue
    const id = cleanText(rec.id) || `strybldr:workflow-edge:${shortHash(`${source}:${label}:${target}`)}`
    const key = `${source}\u0000${label}\u0000${target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id, source, target, label })
  }
  return out
}

function readStrybldrWorkflowEdgesFromGraphData(args: {
  graphData: GraphData | null | undefined
  elementIds: ReadonlySet<string>
}): StrybldrWorkflowEdge[] {
  if (args.elementIds.size === 0) return []
  const edges = Array.isArray(args.graphData?.edges) ? args.graphData.edges : []
  const out: StrybldrWorkflowEdge[] = []
  const seen = new Set<string>()
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i]
    const source = cleanText(edge?.source)
    const target = cleanText(edge?.target)
    const label = cleanText(edge?.label)
    if (!source || !target || !label) continue
    if (!args.elementIds.has(source) || !args.elementIds.has(target)) continue
    const key = `${source}\u0000${label}\u0000${target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: cleanText(edge?.id) || `strybldr:workflow-edge:${shortHash(`${source}:${label}:${target}`)}`,
      source,
      target,
      label,
    })
  }
  return out
}

export const syncStrybldrStoryboardMarkdownWorkflowEdges = (args: {
  text: string
  graphData: GraphData | null | undefined
}): string | null => {
  const rawPayload = readStrybldrStoryboardRawPayload(args.text)
  const doc = rawPayload ? readParsedObject(rawPayload) : null
  if (!doc) return null
  const elementIds = new Set(doc.elements.map(element => cleanText(element.id)).filter(Boolean))
  const currentEdges = readStrybldrWorkflowEdges(rawPayload?.edges, elementIds)
  const discoveredEdges = readStrybldrWorkflowEdgesFromGraphData({ graphData: args.graphData, elementIds })
  const nextEdges = currentEdges.slice()
  const seenEdgeKeys = new Set(currentEdges.map(edge => `${edge.source}\u0000${edge.label}\u0000${edge.target}`))
  for (let i = 0; i < discoveredEdges.length; i += 1) {
    const edge = discoveredEdges[i]
    const key = `${edge.source}\u0000${edge.label}\u0000${edge.target}`
    if (seenEdgeKeys.has(key)) continue
    seenEdgeKeys.add(key)
    nextEdges.push(edge)
  }
  const toComparableKey = (edge: StrybldrWorkflowEdge): string => [edge.id, edge.source, edge.label, edge.target].join('\u0000')
  const currentKeys = currentEdges.map(toComparableKey)
  const nextKeys = nextEdges.map(toComparableKey)
  if (currentKeys.length === nextKeys.length && currentKeys.every((key, index) => key === nextKeys[index])) {
    return args.text
  }
  const nextPayload = { ...rawPayload }
  if (nextEdges.length > 0) nextPayload.edges = nextEdges
  return replaceStrybldrStoryboardMarkdownRawPayload(args.text, nextPayload)
}

const readStrybldrWorkflow = (value: unknown): StrybldrWorkflow | null => {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const stages = Array.isArray(rec.stages)
    ? uniqueCleanTexts(rec.stages)
    : []
  const forkRec = rec.fork && typeof rec.fork === 'object' ? rec.fork as Record<string, unknown> : null
  const publishRec = rec.publish && typeof rec.publish === 'object' ? rec.publish as Record<string, unknown> : null
  const forkId = cleanText(forkRec?.id)
  const publishId = cleanText(publishRec?.id)
  const workflow: StrybldrWorkflow = {
    stages,
    fork: forkId
      ? {
          id: forkId,
          label: cleanText(forkRec?.label) || null,
          policy: cleanText(forkRec?.policy) || null,
          branches: Array.isArray(forkRec?.branches) ? uniqueCleanTexts(forkRec?.branches) : [],
        }
      : null,
    publish: publishId
      ? {
          id: publishId,
          label: cleanText(publishRec?.label) || null,
          policy: cleanText(publishRec?.policy) || null,
        }
      : null,
  }
  if (workflow.stages.length === 0 && !workflow.fork && !workflow.publish) return null
  return workflow
}

const resolveStrybldrElementLane = (args: {
  element: StrybldrElement
  workflow: StrybldrWorkflow | null | undefined
}): string => {
  const element = args.element
  const authoredLane = cleanText(element.lane)
  if (authoredLane) return authoredLane
  const primaryText = [
    element.id,
    element.label,
    element.evidenceKind,
    element.provider,
  ].map(value => cleanText(value).toLowerCase()).filter(Boolean).join(' ')
  const bodyText = [
    element.summary,
    element.action,
    element.prompt,
  ].map(value => cleanText(value).toLowerCase()).filter(Boolean).join(' ')
  if (/\bfork|operator[_ -]?fork|operator[_ -]?approval|operator[_ -]?approved\b/i.test(primaryText)) return 'Fork'
  if (/\bpublish|packet|release|export\b/i.test(primaryText)) return 'Publish'
  if (/\breview|search|stream|moderation|scorecard\b/i.test(primaryText)) return 'Review'
  if (/\bruntime|handoff|generate|generation|poll|api|mcp|rest|upload|index|sensenova|videodb|provider|media output|execution|readiness\b/i.test(primaryText)) return 'Runtime'
  if (/\bsource[_ -]?metadata|user[_ -]?edit|fallback\b/i.test(primaryText)) {
    const stages = Array.isArray(args.workflow?.stages) ? args.workflow.stages.map(stage => cleanText(stage)).filter(Boolean) : []
    return stages.find(stage => stage.toLowerCase() === 'elements') || 'Elements'
  }
  if (/\breview|search|stream|moderation|scorecard\b/i.test(bodyText)) return 'Review'
  if (/\bruntime|handoff|generate|generation|poll|api|mcp|rest|upload|index|sensenova|videodb|provider|media output|execution|readiness\b/i.test(bodyText)) return 'Runtime'
  const stages = Array.isArray(args.workflow?.stages) ? args.workflow.stages.map(stage => cleanText(stage)).filter(Boolean) : []
  return stages.find(stage => stage.toLowerCase() === 'elements') || 'Elements'
}

const isExplainerVideoXrMode = (doc: StrybldrStoryboardDocument): boolean => cleanText(doc.explainerVideo?.mode).toLowerCase() === 'xr'

const buildExplainerPanelSrcDoc = (title: string, text: string): string => {
  const safeTitle = htmlAttr(title || 'Explainer')
  const safeText = htmlAttr(text || '')
  return `<article style="font:14px/1.5 system-ui,sans-serif;padding:20px;color:#17202a"><h1 style="font-size:20px;margin:0 0 12px">${safeTitle}</h1><pre style="white-space:pre-wrap;margin:0">${safeText}</pre></article>`
}

type StrytreeNodeRuntime = {
  depth: number
  childBranchCount: number
  pathNodeIds: string[]
  inheritedAssetIds: string[]
  allAssetIds: string[]
  likeRate: number | null
  unlockRequired: boolean
  canUnlock: boolean
  accessState: 'open' | 'unlock-ready' | 'unlock-needs-credits' | 'draft' | 'audit-only'
  generationAffordable: boolean
  projectedBalanceAfterUnlock: number | null
  projectedBalanceAfterGeneration: number | null
  engagementScore: number
}

type StrytreeRuntime = {
  activeBranchCount: number
  totalLikes: number
  totalPaidUnlocks: number
  protectedBranchCount: number
  freeWindowCount: number
  droppedBranchCount: number
  requiredUnlockCredits: number
  rootBranchCount: number
  maxDepth: number
  generationBudgetCount: number
  nodeById: Map<string, StrytreeStoryNode>
  nodeRuntimeById: Map<string, StrytreeNodeRuntime>
}

const buildStrytreeRuntime = (storytree: StrytreeStorySnapshot): StrytreeRuntime => {
  const nodeById = new Map<string, StrytreeStoryNode>()
  const childIdsByNodeId = new Map<string, string[]>()
  for (const node of storytree.nodes) {
    nodeById.set(node.nodeId, node)
    if (!node.parentNodeId) continue
    const children = childIdsByNodeId.get(node.parentNodeId) || []
    children.push(node.nodeId)
    childIdsByNodeId.set(node.parentNodeId, children)
  }
  const resolvingDepth = new Set<string>()
  const depthByNodeId = new Map<string, number>()
  const resolveDepth = (nodeId: string): number => {
    if (depthByNodeId.has(nodeId)) return depthByNodeId.get(nodeId) || 0
    const node = nodeById.get(nodeId)
    if (!node?.parentNodeId || !nodeById.has(node.parentNodeId) || resolvingDepth.has(nodeId)) {
      depthByNodeId.set(nodeId, 0)
      return 0
    }
    resolvingDepth.add(nodeId)
    const depth = resolveDepth(node.parentNodeId) + 1
    resolvingDepth.delete(nodeId)
    depthByNodeId.set(nodeId, depth)
    return depth
  }
  const resolvingPath = new Set<string>()
  const pathByNodeId = new Map<string, string[]>()
  const resolvePath = (nodeId: string): string[] => {
    const existing = pathByNodeId.get(nodeId)
    if (existing) return existing
    const node = nodeById.get(nodeId)
    if (!node || resolvingPath.has(nodeId)) return [nodeId]
    resolvingPath.add(nodeId)
    const parentPath = node.parentNodeId && nodeById.has(node.parentNodeId)
      ? resolvePath(node.parentNodeId)
      : []
    resolvingPath.delete(nodeId)
    const path = uniqueCleanTexts([...parentPath, nodeId])
    pathByNodeId.set(nodeId, path)
    return path
  }

  const tokenBalance = Math.max(0, readNumber(storytree.tokenBalance, 0))
  const generationCostCredits = Math.max(0, readNumber(storytree.generationCostCredits, 5))
  const nodeRuntimeById = new Map<string, StrytreeNodeRuntime>()
  let maxDepth = 0
  for (const node of storytree.nodes) {
    const depth = resolveDepth(node.nodeId)
    maxDepth = Math.max(maxDepth, depth)
    const pathNodeIds = resolvePath(node.nodeId)
    const inheritedAssetIds = uniqueCleanTexts(pathNodeIds
      .slice(0, -1)
      .flatMap(id => nodeById.get(id)?.ownAssetIds || []))
    const allAssetIds = uniqueCleanTexts([...inheritedAssetIds, ...(node.ownAssetIds || [])])
    const impressions = Math.max(0, node.impressions || 0)
    const likes = Math.max(0, node.likes || 0)
    const likeRate = impressions > 0 ? Number(((likes / impressions) * 100).toFixed(1)) : null
    const unlockPriceCredits = Math.max(0, node.unlockPriceCredits || 0)
    const unlockRequired = node.isProtected === true && node.isFreeWindow !== true && unlockPriceCredits > 0
    const canUnlock = !unlockRequired || tokenBalance >= unlockPriceCredits
    const generationEligible = node.status !== 'dropped' && node.status !== 'draft'
    const generationAffordable = generationEligible && generationCostCredits === 0 ? true : generationEligible && tokenBalance >= generationCostCredits
    const accessState: StrytreeNodeRuntime['accessState'] = node.status === 'dropped'
      ? 'audit-only'
      : node.status === 'draft'
        ? 'draft'
        : unlockRequired
          ? canUnlock ? 'unlock-ready' : 'unlock-needs-credits'
          : 'open'
    nodeRuntimeById.set(node.nodeId, {
      depth,
      childBranchCount: childIdsByNodeId.get(node.nodeId)?.length || 0,
      pathNodeIds,
      inheritedAssetIds,
      allAssetIds,
      likeRate,
      unlockRequired,
      canUnlock,
      accessState,
      generationAffordable,
      projectedBalanceAfterUnlock: unlockRequired ? Math.max(0, tokenBalance - unlockPriceCredits) : null,
      projectedBalanceAfterGeneration: generationEligible ? Math.max(0, tokenBalance - generationCostCredits) : null,
      engagementScore: Number((likes + Math.max(0, node.paidUnlocks || 0) * 3 + (likeRate || 0)).toFixed(1)),
    })
  }

  const activeBranchCount = storytree.activeBranchCount ?? storytree.nodes.filter(node => node.status !== 'dropped').length
  const totalLikes = storytree.totalLikes ?? storytree.nodes.reduce((sum, node) => sum + Math.max(0, node.likes || 0), 0)
  const protectedBranchCount = storytree.nodes.filter(node => node.isProtected && !node.isFreeWindow).length
  const freeWindowCount = storytree.nodes.filter(node => node.isFreeWindow).length
  return {
    activeBranchCount,
    totalLikes,
    totalPaidUnlocks: storytree.nodes.reduce((sum, node) => sum + Math.max(0, node.paidUnlocks || 0), 0),
    protectedBranchCount,
    freeWindowCount,
    droppedBranchCount: storytree.nodes.filter(node => node.status === 'dropped').length,
    requiredUnlockCredits: storytree.nodes.reduce((sum, node) => sum + (node.isProtected && !node.isFreeWindow ? Math.max(0, node.unlockPriceCredits || 0) : 0), 0),
    rootBranchCount: storytree.nodes.filter(node => !node.parentNodeId || !nodeById.has(node.parentNodeId)).length,
    maxDepth,
    generationBudgetCount: generationCostCredits > 0 ? Math.floor(tokenBalance / generationCostCredits) : storytree.nodes.length,
    nodeById,
    nodeRuntimeById,
  }
}

const appendStrytreeGraphData = (args: {
  doc: StrybldrStoryboardDocument
  nodes: GraphNode[]
  edges: GraphEdge[]
}): void => {
  const storytree = args.doc.storytree
  if (!storytree || storytree.nodes.length === 0) return
  const storyId = storytree.storyId || args.doc.runId
  const overviewId = `strytree:story:${shortHash(storyId)}`
  const runtime = buildStrytreeRuntime(storytree)
  args.nodes.push({
    id: overviewId,
    label: storytree.title,
    type: 'StorytreeSnapshot',
    properties: {
      title: asJson(storytree.title),
      lane: asJson('Storytree'),
      order: asJson(-100),
      summary: asJson(storytree.synopsis || `${runtime.activeBranchCount} active branches, ${runtime.totalLikes} total likes, ${runtime.protectedBranchCount} protected branches, and a read-only ${storytree.tokenBalance || 0} credit-token balance.`),
      action: asJson('Review parent-derived branches, quote generation cost, then run the approved handoff through the server-side provider harness.'),
      prompt: asJson('Create a continuation plan from this Strytree snapshot without trusting client-side wallet or unlock state.'),
      tags: asJson(uniqueCleanTexts([
        'strytree',
        'storytree',
        'server-owned-ledger',
        `roots:${runtime.rootBranchCount}`,
        `protected:${runtime.protectedBranchCount}`,
        `max-depth:${runtime.maxDepth}`,
      ])),
      strytreeStoryId: asJson(storyId),
      tokenBalance: asJson(storytree.tokenBalance || 0),
      activeBranchCount: asJson(runtime.activeBranchCount),
      totalLikes: asJson(runtime.totalLikes),
      totalPaidUnlocks: asJson(runtime.totalPaidUnlocks),
      protectedBranchCount: asJson(runtime.protectedBranchCount),
      freeWindowCount: asJson(runtime.freeWindowCount),
      droppedBranchCount: asJson(runtime.droppedBranchCount),
      requiredUnlockCredits: asJson(runtime.requiredUnlockCredits),
      rootBranchCount: asJson(runtime.rootBranchCount),
      maxDepth: asJson(runtime.maxDepth),
      generationBudgetCount: asJson(runtime.generationBudgetCount),
      generationCostCredits: asJson(storytree.generationCostCredits || 5),
      unlockCurrency: asJson(storytree.unlockCurrency || 'credits'),
    },
  })

  const graphIdByNodeId = new Map<string, string>()
  storytree.nodes.forEach((node, index) => {
    const graphNodeId = `strytree:node:${shortHash(node.nodeId)}`
    graphIdByNodeId.set(node.nodeId, graphNodeId)
    const videoUrl = cleanText(node.videoUrl)
    const renderUrl = videoUrl ? buildRenderableIframeUrl(videoUrl) || videoUrl : ''
    const thumbnailUrl = videoUrl ? buildRenderableMediaThumbnailUrl(videoUrl) : ''
    const impressions = Math.max(0, node.impressions || 0)
    const likes = Math.max(0, node.likes || 0)
    const nodeRuntime = runtime.nodeRuntimeById.get(node.nodeId)
    const likeRate = nodeRuntime?.likeRate ?? null
    const protectedState = node.isProtected && !node.isFreeWindow ? 'protected' : 'free-window'
    args.nodes.push({
      id: graphNodeId,
      label: node.title,
      type: 'StorytreeNode',
      properties: {
        title: asJson(node.title),
        lane: asJson('Storytree'),
        order: asJson(index),
        index: asJson(`${(nodeRuntime?.depth ?? 0) + 1}.${index + 1}`),
        slugline: asJson(`Depth ${nodeRuntime?.depth ?? 0} / ${nodeRuntime?.accessState || 'open'} / ${storytree.unlockCurrency || 'credits'}`),
        summary: asJson(node.synopsis || `${node.status} story branch.`),
        action: asJson(node.status === 'dropped'
          ? 'Keep this dropped branch visible for moderation, lineage, and audit review.'
          : nodeRuntime?.unlockRequired
            ? 'Quote unlock cost through the server ledger before showing protected media.'
            : nodeRuntime?.generationAffordable === false
              ? 'Quote a top-up before allowing this branch to enter a generation job.'
              : 'Fork this branch only through an audited generation job.'),
        prompt: asJson(node.prompt || `Continue the story from branch ${node.title}.`),
        branchStatus: asJson(node.status),
        strytreeStatus: asJson(node.status),
        tags: asJson(uniqueCleanTexts([
          'story-branch',
          protectedState,
          node.status,
          nodeRuntime?.accessState,
          `depth:${nodeRuntime?.depth ?? 0}`,
          `children:${nodeRuntime?.childBranchCount ?? 0}`,
          nodeRuntime?.generationAffordable ? 'generation-ready' : 'generation-needs-credits',
        ])),
        strytreeStoryId: asJson(storyId),
        strytreeNodeId: asJson(node.nodeId),
        parent_node_id: asJson(node.parentNodeId || null),
        parentNodeId: asJson(node.parentNodeId || null),
        authorName: asJson(node.authorName || null),
        duration: asJson(node.duration || null),
        ageDays: asJson(node.ageDays ?? null),
        isFreeWindow: asJson(node.isFreeWindow === true),
        isProtected: asJson(node.isProtected === true),
        unlockPriceCredits: asJson(node.unlockPriceCredits || 0),
        likes: asJson(likes),
        impressions: asJson(impressions),
        likeRate: asJson(likeRate),
        paidUnlocks: asJson(node.paidUnlocks || 0),
        childBranchCount: asJson(nodeRuntime?.childBranchCount ?? 0),
        depth: asJson(nodeRuntime?.depth ?? 0),
        pathNodeIds: asJson(nodeRuntime?.pathNodeIds || [node.nodeId]),
        inheritedAssetIds: asJson(nodeRuntime?.inheritedAssetIds || []),
        allAssetIds: asJson(nodeRuntime?.allAssetIds || node.ownAssetIds || []),
        unlockRequired: asJson(nodeRuntime?.unlockRequired === true),
        canUnlock: asJson(nodeRuntime?.canUnlock !== false),
        accessState: asJson(nodeRuntime?.accessState || 'open'),
        generationAffordable: asJson(nodeRuntime?.generationAffordable === true),
        projectedBalanceAfterUnlock: asJson(nodeRuntime?.projectedBalanceAfterUnlock ?? null),
        projectedBalanceAfterGeneration: asJson(nodeRuntime?.projectedBalanceAfterGeneration ?? null),
        engagementScore: asJson(nodeRuntime?.engagementScore ?? likes),
        ownAssetIds: asJson(node.ownAssetIds || []),
        mediaUrl: asJson(videoUrl || null),
        sourceUrl: asJson(videoUrl || null),
        renderUrl: asJson(renderUrl || null),
        thumbnailUrl: asJson(thumbnailUrl || null),
        mediaKind: asJson(videoUrl ? inferMediaKindFromResourceUrl(videoUrl) || 'video' : 'unknown'),
        references: asJson(uniqueCleanTexts([videoUrl, thumbnailUrl, ...(node.ownAssetIds || [])])),
      },
    })
  })
  for (const node of storytree.nodes) {
    const childId = graphIdByNodeId.get(node.nodeId)
    if (!childId) continue
    const parentId = node.parentNodeId ? graphIdByNodeId.get(node.parentNodeId) : overviewId
    if (parentId) args.edges.push(createEdge(parentId, childId, node.parentNodeId ? 'parent_node_id' : 'rootBranch'))
  }

  const candidateRuns = Array.isArray(storytree.candidateRuns) ? storytree.candidateRuns : []
  candidateRuns.forEach((run, runIndex) => {
    const parentGraphId = graphIdByNodeId.get(run.parentNodeId)
    if (!parentGraphId) return
    const parentNode = runtime.nodeById.get(run.parentNodeId)
    const runGraphId = `strytree:candidate-run:${shortHash(run.candidateRunId)}`
    args.nodes.push({
      id: runGraphId,
      label: `ForkCompare ${runIndex + 1}`,
      type: 'StorytreeCandidateRun',
      properties: {
        title: asJson(`ForkCompare run for ${parentNode?.title || run.parentNodeId}`),
        lane: asJson('ForkCompare'),
        order: asJson(1000 + runIndex * 100),
        summary: asJson(`${run.candidates.length} continuation candidates, ${run.quotedCostCredits} quoted credits, ${run.status} status.`),
        action: asJson('Compare candidate scorecards, then publish one selected continuation into the durable storytree.'),
        prompt: asJson('Select the highest-value branch candidate without adding hidden provider calls.'),
        tags: asJson(uniqueCleanTexts([
          'forkcompare',
          'candidate-run',
          run.status,
          `max:${Math.min(3, Math.max(0, run.maxCandidates || run.candidates.length))}`,
          `quote:${run.quotedCostCredits}`,
        ])),
        strytreeStoryId: asJson(storyId),
        candidateRunId: asJson(run.candidateRunId),
        parentNodeId: asJson(run.parentNodeId),
        parentGraphNodeId: asJson(parentGraphId),
        status: asJson(run.status),
        maxCandidates: asJson(run.maxCandidates),
        quotedCostCredits: asJson(run.quotedCostCredits),
        scorecardMode: asJson(run.scorecardMode || 'cost_continuity'),
        candidateCount: asJson(run.candidates.length),
      },
    })
    args.edges.push(createEdge(parentGraphId, runGraphId, 'candidateRun'))

    run.candidates.slice(0, 3).forEach((candidate, candidateIndex) => {
      const candidateGraphId = `strytree:candidate:${shortHash(`${run.candidateRunId}:${candidate.candidateId}`)}`
      const mediaUrl = cleanText(candidate.videoUrl)
      const thumbnailUrl = cleanText(candidate.thumbnailUrl) || (mediaUrl ? buildRenderableMediaThumbnailUrl(mediaUrl) : '')
      const publishEligible = candidate.publishEligible === true && cleanText(candidate.moderationStatus || 'approved') !== 'rejected'
      const continuityScore = Math.max(0, Math.min(1, readNumber(candidate.continuityScore, 0)))
      args.nodes.push({
        id: candidateGraphId,
        label: candidate.title,
        type: 'StorytreeCandidate',
        properties: {
          title: asJson(candidate.title),
          lane: asJson('ForkCompare'),
          order: asJson(1000 + runIndex * 100 + candidateIndex + 1),
          index: asJson(`${runIndex + 1}.${candidateIndex + 1}`),
          slugline: asJson(`${Math.max(0, Math.round(continuityScore * 100))}% continuity / ${candidate.creditCost || 0} credits / ${candidate.moderationStatus || 'pending'}`),
          summary: asJson(candidate.synopsis),
          action: asJson(publishEligible
            ? 'Publish this candidate only if its scorecard beats the alternatives.'
            : 'Keep this candidate private for audit; it is not publish eligible.'),
          prompt: asJson(candidate.prompt || parentNode?.prompt || `Continue from ${parentNode?.title || run.parentNodeId}.`),
          tags: asJson(uniqueCleanTexts([
            'forkcompare',
            'branch-candidate',
            candidate.status || run.status,
            publishEligible ? 'publish-ready' : 'private-audit',
            candidate.selected ? 'selected' : '',
            candidate.fallbackStatus ? `fallback:${candidate.fallbackStatus}` : '',
          ])),
          strytreeStoryId: asJson(storyId),
          candidateRunId: asJson(run.candidateRunId),
          strytreeCandidateId: asJson(candidate.candidateId),
          parentNodeId: asJson(run.parentNodeId),
          parentGraphNodeId: asJson(parentGraphId),
          provider: asJson(candidate.provider || 'local-harness'),
          candidateStatus: asJson(candidate.status || run.status),
          creditCost: asJson(candidate.creditCost || 0),
          elapsedMs: asJson(candidate.elapsedMs || 0),
          fallbackStatus: asJson(candidate.fallbackStatus || 'none'),
          moderationStatus: asJson(candidate.moderationStatus || 'pending'),
          inheritedAssetCount: asJson(candidate.inheritedAssetCount || runtime.nodeRuntimeById.get(run.parentNodeId)?.allAssetIds.length || 0),
          continuityScore: asJson(continuityScore),
          publishEligible: asJson(publishEligible),
          selectedCandidate: asJson(candidate.selected === true),
          privateCandidate: asJson(true),
          notes: asJson(candidate.notes || null),
          mediaUrl: asJson(mediaUrl || null),
          sourceUrl: asJson(mediaUrl || null),
          renderUrl: asJson(mediaUrl ? buildRenderableIframeUrl(mediaUrl) || mediaUrl : null),
          thumbnailUrl: asJson(thumbnailUrl || null),
          mediaKind: asJson(mediaUrl ? inferMediaKindFromResourceUrl(mediaUrl) || 'video' : 'unknown'),
          references: asJson(uniqueCleanTexts([
            mediaUrl,
            thumbnailUrl,
            candidate.notes,
            ...(runtime.nodeRuntimeById.get(run.parentNodeId)?.allAssetIds || []),
          ])),
        },
      })
      args.edges.push(createEdge(runGraphId, candidateGraphId, 'candidateScorecard'))
      args.edges.push(createEdge(parentGraphId, candidateGraphId, 'candidateOption'))
    })
  })
}

const appendExplainerVideoGraphData = (args: {
  doc: StrybldrStoryboardDocument
  nodes: GraphNode[]
  edges: GraphEdge[]
  sourceNodeIdByUnit?: ReadonlyMap<string, string>
}): void => {
  const explainer = args.doc.explainerVideo
  if (!explainer || explainer.panels.length === 0) return
  const isXr = isExplainerVideoXrMode(args.doc)
  const overviewId = `strybldr:explainer:${shortHash(`${args.doc.runId}:${explainer.title}`)}`
  const transcript = cleanMultilineText(explainer.transcriptMarkdown)
  const referenceImageUrl = cleanText(explainer.referenceImageUrl)
  const videoUrl = cleanText(explainer.videoUrl)
  const overviewMediaUrl = videoUrl || referenceImageUrl
  args.nodes.push({
    id: overviewId,
    label: explainer.title,
    type: 'ExplainerVideoSnapshot',
    properties: {
      title: asJson(explainer.title),
      lane: asJson('Explainer Video'),
      order: asJson(-90),
      summary: asJson(explainer.summary || 'Source-backed text artifact prepared as an inspectable explainer-video plan.'),
      action: asJson('Inspect the text, image, and video Rich Media Panel cards before running any optional media generation.'),
      prompt: asJson(explainer.storyboardPrompt || 'Turn the approved text artifact and visual cards into a concise explainer video.'),
      tags: asJson(uniqueCleanTexts([
        'text-artifact',
        'explainer-video',
        isXr ? 'xr-mode' : '',
        `panels:${explainer.panels.length}`,
      ])),
      textArtifactToExplainerVideo: asJson(true),
      richMediaPanelTabs: asJson(['text', 'image', 'video']),
      transcriptMarkdown: asJson(explainer.transcriptMarkdown || null),
      output: asJson(explainer.transcriptMarkdown || null),
      outputSrcDoc: asJson(transcript ? buildExplainerPanelSrcDoc(explainer.title, transcript) : null),
      imageUrl: asJson(referenceImageUrl || null),
      videoUrl: asJson(videoUrl || null),
      mediaUrl: asJson(overviewMediaUrl || null),
      sourceUrl: asJson(overviewMediaUrl || null),
      renderUrl: asJson(videoUrl ? buildRenderableIframeUrl(videoUrl) || videoUrl : null),
      thumbnailUrl: asJson(referenceImageUrl || (videoUrl ? buildRenderableMediaThumbnailUrl(videoUrl) : null)),
      mediaKind: asJson(videoUrl ? 'video' : referenceImageUrl ? inferMediaKindFromResourceUrl(referenceImageUrl) || 'image' : 'iframe'),
      kgCanvasSurfaceMode: asJson(isXr ? 'xr' : '2d'),
      kgCanvasRenderMode: asJson(isXr ? '3d' : '2d'),
      kgCanvas3dMode: asJson(isXr ? 'xr' : null),
      references: asJson(uniqueCleanTexts([referenceImageUrl, videoUrl, explainer.storyboardPrompt, explainer.transcriptMarkdown])),
    },
  })

  explainer.panels.forEach((panel, index) => {
    const panelGraphId = `strybldr:explainer-panel:${shortHash(`${overviewId}:${panel.panelId}`)}`
    const output = cleanMultilineText(panel.output)
    const outputSrcDoc = cleanMultilineText(panel.outputSrcDoc) || (panel.activeTab === 'text' && output ? buildExplainerPanelSrcDoc(panel.title, output) : '')
    const imageUrl = cleanText(panel.imageUrl)
    const panelVideoUrl = cleanText(panel.videoUrl)
    const mediaUrl = panel.activeTab === 'video' ? panelVideoUrl : panel.activeTab === 'image' ? imageUrl : ''
    const thumbnailUrl = imageUrl || (panelVideoUrl ? buildRenderableMediaThumbnailUrl(panelVideoUrl) : '')
    args.nodes.push({
      id: panelGraphId,
      label: panel.title,
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      properties: {
        title: asJson(panel.title),
        lane: asJson('Explainer Video'),
        order: asJson(index),
        summary: asJson(panel.summary || `${titleCase(panel.activeTab)} panel for an inspectable explainer-video artifact.`),
        action: asJson('Inspect this media panel through the shared Rich Media Panel surface.'),
        prompt: asJson(panel.prompt || explainer.storyboardPrompt || 'Review this approved media artifact before video assembly.'),
        tags: asJson(uniqueCleanTexts(['rich-media-panel', panel.activeTab, isXr ? 'xr-mode' : ''])),
        textArtifactToExplainerVideo: asJson(true),
        richMediaActiveTab: asJson(panel.activeTab),
        freezeConnectedOutput: asJson(true),
        output: asJson(output || null),
        outputSrcDoc: asJson(outputSrcDoc || null),
        imageUrl: asJson(imageUrl || null),
        videoUrl: asJson(panelVideoUrl || null),
        mediaUrl: asJson(mediaUrl || null),
        sourceUrl: asJson(mediaUrl || null),
        renderUrl: asJson(panelVideoUrl ? buildRenderableIframeUrl(panelVideoUrl) || panelVideoUrl : null),
        thumbnailUrl: asJson(thumbnailUrl || null),
        mediaKind: asJson(panel.activeTab === 'video' ? 'video' : panel.activeTab === 'image' ? inferMediaKindFromResourceUrl(imageUrl) || 'image' : 'iframe'),
        media_interactive: asJson(panel.activeTab !== 'image'),
        ['flow:widgetFormId']: asJson('richMediaPanel'),
        kgCanvasSurfaceMode: asJson(isXr ? 'xr' : '2d'),
        kgCanvasRenderMode: asJson(isXr ? '3d' : '2d'),
        kgCanvas3dMode: asJson(isXr ? 'xr' : null),
        strybldrRunId: asJson(args.doc.runId),
        strybldrExplainerPanelId: asJson(panel.panelId),
        references: asJson(uniqueCleanTexts([
          panel.sourceNodeId,
          output,
          outputSrcDoc,
          imageUrl,
          panelVideoUrl,
          panel.prompt,
          panel.summary,
        ])),
      },
    })
    args.edges.push(createEdge(overviewId, panelGraphId, 'rich_media_panel'))
    const sourceGraphId = panel.sourceNodeId ? args.sourceNodeIdByUnit?.get(panel.sourceNodeId) : undefined
    if (sourceGraphId) args.edges.push(createEdge(sourceGraphId, panelGraphId, 'explainerSource'))
  })
}

const readNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const readStrybldrBox = (value: unknown): StrybldrBox | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const xmin = readNumber(rec.xmin, NaN)
  const ymin = readNumber(rec.ymin, NaN)
  const xmax = readNumber(rec.xmax, NaN)
  const ymax = readNumber(rec.ymax, NaN)
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return null
  return {
    xmin,
    ymin,
    xmax,
    ymax,
    unit: rec.unit === 'pixel' ? 'pixel' : 'percentage',
  }
}

const readStrybldrEvidenceKind = (value: unknown): StrybldrEvidenceKind => {
  switch (cleanText(value)) {
    case 'local-object-detection':
      return 'local-object-detection'
    case 'local-human-geometry':
      return 'local-human-geometry'
    case 'modelark-visual-grounding':
      return 'modelark-visual-grounding'
    case 'user-edit':
      return 'user-edit'
    default:
      return 'source-metadata'
  }
}

const readStrybldrProvider = (value: unknown): StrybldrDetectionProvider => {
  switch (cleanText(value)) {
    case 'transformers-detr':
      return 'transformers-detr'
    case 'human':
      return 'human'
    case 'byteplus-modelark':
      return 'byteplus-modelark'
    default:
      return 'fallback'
  }
}

const readBoolean = (value: unknown): boolean => value === true || String(value || '').trim().toLowerCase() === 'true'

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return uniqueCleanTexts(value)
}

const readStrytreeStatus = (value: unknown): StrytreeStoryNode['status'] => {
  switch (cleanText(value)) {
    case 'hot':
      return 'hot'
    case 'locked':
      return 'locked'
    case 'dropped':
      return 'dropped'
    case 'draft':
      return 'draft'
    default:
      return 'active'
  }
}

const readStrytreeNode = (value: unknown, index: number): StrytreeStoryNode | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const nodeId = cleanText(rec.nodeId || rec.node_id || rec.id)
  if (!nodeId) return null
  const title = cleanText(rec.title || rec.label) || `Story branch ${index + 1}`
  return {
    nodeId,
    parentNodeId: cleanText(rec.parentNodeId || rec.parent_node_id || rec.parentId) || null,
    title,
    synopsis: cleanText(rec.synopsis || rec.summary || rec.description),
    prompt: cleanText(rec.prompt) || null,
    authorName: cleanText(rec.authorName || rec.author_name) || null,
    status: readStrytreeStatus(rec.status),
    duration: cleanText(rec.duration) || null,
    ageDays: Number.isFinite(Number(rec.ageDays || rec.age_days)) ? Number(rec.ageDays || rec.age_days) : null,
    isFreeWindow: readBoolean(rec.isFreeWindow || rec.is_free_window),
    isProtected: readBoolean(rec.isProtected || rec.is_protected),
    unlockPriceCredits: Math.max(0, readNumber(rec.unlockPriceCredits || rec.unlock_price_credits || rec.unlockPrice, 0)),
    likes: Math.max(0, readNumber(rec.likes, 0)),
    impressions: Math.max(0, readNumber(rec.impressions, 0)),
    paidUnlocks: Math.max(0, readNumber(rec.paidUnlocks || rec.paid_unlocks, 0)),
    videoUrl: cleanText(rec.videoUrl || rec.video_url) || null,
    ownAssetIds: readStringArray(rec.ownAssetIds || rec.own_asset_ids),
  }
}

const readStrytreeBranchCandidate = (value: unknown, index: number): StrytreeBranchCandidate | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const candidateId = cleanText(rec.candidateId || rec.candidate_id || rec.id)
  const title = cleanText(rec.title || rec.label) || `Candidate ${index + 1}`
  return {
    candidateId: candidateId || `candidate-${shortHash(`${title}:${index}`)}`,
    title,
    synopsis: cleanText(rec.synopsis || rec.summary || rec.description),
    prompt: cleanText(rec.prompt) || null,
    provider: cleanText(rec.provider) || null,
    status: cleanText(rec.status) || 'succeeded',
    creditCost: Math.max(0, readNumber(rec.creditCost || rec.credit_cost || rec.costCredits || rec.cost_credits, 0)),
    elapsedMs: Math.max(0, readNumber(rec.elapsedMs || rec.elapsed_ms, 0)),
    fallbackStatus: cleanText(rec.fallbackStatus || rec.fallback_status) || null,
    moderationStatus: cleanText(rec.moderationStatus || rec.moderation_status) || null,
    inheritedAssetCount: Math.max(0, readNumber(rec.inheritedAssetCount || rec.inherited_asset_count, 0)),
    continuityScore: Math.max(0, Math.min(1, readNumber(rec.continuityScore || rec.continuity_score, 0))),
    publishEligible: readBoolean(rec.publishEligible || rec.publish_eligible),
    selected: readBoolean(rec.selected || rec.selectedCandidate || rec.selected_candidate),
    videoUrl: cleanText(rec.videoUrl || rec.video_url) || null,
    thumbnailUrl: cleanText(rec.thumbnailUrl || rec.thumbnail_url) || null,
    notes: cleanText(rec.notes) || null,
  }
}

const readStrytreeCandidateRun = (value: unknown, index: number): StrytreeCandidateRun | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const parentNodeId = cleanText(rec.parentNodeId || rec.parent_node_id || rec.parentId)
  if (!parentNodeId) return null
  const candidates = Array.isArray(rec.candidates)
    ? rec.candidates.map(readStrytreeBranchCandidate).filter((item): item is StrytreeBranchCandidate => !!item).slice(0, 3)
    : []
  if (candidates.length === 0) return null
  const candidateRunId = cleanText(rec.candidateRunId || rec.candidate_run_id || rec.id) || `candrun-${shortHash(`${parentNodeId}:${index}:${candidates.map(candidate => candidate.candidateId).join('|')}`)}`
  const quotedCostCredits = Number.isFinite(Number(rec.quotedCostCredits || rec.quoted_cost_credits))
    ? Math.max(0, Number(rec.quotedCostCredits || rec.quoted_cost_credits))
    : candidates.reduce((sum, candidate) => sum + Math.max(0, candidate.creditCost || 0), 0)
  return {
    candidateRunId,
    parentNodeId,
    status: cleanText(rec.status) || 'completed',
    maxCandidates: Math.min(3, Math.max(0, readNumber(rec.maxCandidates || rec.max_candidates, candidates.length))),
    quotedCostCredits,
    scorecardMode: cleanText(rec.scorecardMode || rec.scorecard_mode) || 'cost_continuity',
    candidates,
  }
}

const readStrytreeSnapshot = (value: unknown): StrytreeStorySnapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const nodes = Array.isArray(rec.nodes)
    ? rec.nodes.map(readStrytreeNode).filter((item): item is StrytreeStoryNode => !!item)
    : []
  const candidateRunsRaw = rec.candidateRuns || rec.candidate_runs
  const candidateRuns = Array.isArray(candidateRunsRaw)
    ? candidateRunsRaw.map(readStrytreeCandidateRun).filter((item): item is StrytreeCandidateRun => !!item)
    : []
  if (nodes.length === 0) return null
  const activeBranchCount = nodes.filter(node => node.status !== 'dropped').length
  const totalLikes = nodes.reduce((sum, node) => sum + Math.max(0, node.likes || 0), 0)
  return {
    storyId: cleanText(rec.storyId || rec.story_id) || `strytree-${shortHash(nodes.map(node => node.nodeId).join('|'))}`,
    title: cleanText(rec.title) || 'Strytree story universe',
    synopsis: cleanText(rec.synopsis || rec.summary) || null,
    tokenBalance: Number.isFinite(Number(rec.tokenBalance || rec.token_balance)) ? Number(rec.tokenBalance || rec.token_balance) : 0,
    activeBranchCount: Number.isFinite(Number(rec.activeBranchCount || rec.active_branch_count)) ? Number(rec.activeBranchCount || rec.active_branch_count) : activeBranchCount,
    totalLikes: Number.isFinite(Number(rec.totalLikes || rec.total_likes)) ? Number(rec.totalLikes || rec.total_likes) : totalLikes,
    generationCostCredits: Number.isFinite(Number(rec.generationCostCredits || rec.generation_cost_credits)) ? Number(rec.generationCostCredits || rec.generation_cost_credits) : 5,
    unlockCurrency: cleanText(rec.unlockCurrency || rec.unlock_currency) || 'credits',
    nodes,
    candidateRuns,
  }
}

const readExplainerVideoMode = (value: unknown): StrybldrExplainerVideoSnapshot['mode'] => {
  const raw = cleanText(value).toLowerCase()
  return raw === 'xr' || raw === '3d' || raw === '2d' ? raw : null
}

const readExplainerPanelTab = (value: unknown): StrybldrExplainerVideoPanelTab => {
  const raw = cleanText(value).toLowerCase()
  if (raw === 'image' || raw === 'video') return raw
  return 'text'
}

const readExplainerVideoPanel = (value: unknown, index: number): StrybldrExplainerVideoPanel | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const title = cleanText(rec.title || rec.label) || `Explainer panel ${index + 1}`
  const panelId = cleanText(rec.panelId || rec.panel_id || rec.id) || `explainer-panel-${shortHash(`${title}:${index}`)}`
  const activeTab = readExplainerPanelTab(rec.activeTab || rec.active_tab || rec.kind)
  return {
    panelId,
    title,
    activeTab,
    output: cleanMultilineText(rec.output || rec.text || rec.markdown) || null,
    outputSrcDoc: cleanMultilineText(rec.outputSrcDoc || rec.output_srcdoc || rec.srcDoc || rec.srcdoc) || null,
    imageUrl: cleanText(rec.imageUrl || rec.image_url || rec.image) || null,
    videoUrl: cleanText(rec.videoUrl || rec.video_url || rec.video) || null,
    summary: cleanText(rec.summary || rec.description) || null,
    prompt: cleanText(rec.prompt) || null,
    sourceNodeId: cleanText(rec.sourceNodeId || rec.source_node_id || rec.sourceUnitId || rec.source_unit_id) || null,
  }
}

const readExplainerVideoSnapshot = (value: unknown): StrybldrExplainerVideoSnapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const panels = Array.isArray(rec.panels)
    ? rec.panels.map(readExplainerVideoPanel).filter((item): item is StrybldrExplainerVideoPanel => !!item)
    : []
  if (panels.length === 0) return null
  return {
    mode: readExplainerVideoMode(rec.mode),
    title: cleanText(rec.title) || 'Explainer video artifact',
    summary: cleanText(rec.summary) || null,
    transcriptMarkdown: cleanMultilineText(rec.transcriptMarkdown || rec.transcript_markdown || rec.script || rec.output) || null,
    storyboardPrompt: cleanText(rec.storyboardPrompt || rec.storyboard_prompt || rec.prompt) || null,
    referenceImageUrl: cleanText(rec.referenceImageUrl || rec.reference_image_url || rec.imageUrl || rec.image_url) || null,
    videoUrl: cleanText(rec.videoUrl || rec.video_url) || null,
    panels,
  }
}

const readStrybldrElementFromNode = (node: GraphNode, index: number): StrybldrElement | null => {
  if (cleanText(node.type) !== FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID) return null
  const props = node.properties || {}
  const sourceUnitId = cleanText(props.strybldrSourceUnitId)
  if (!sourceUnitId) return null
  const label = cleanText(props.title || node.label) || `Element ${index + 1}`
  return {
    id: cleanText(props.strybldrElementId || node.id) || `strybldr-el-${shortHash(`${sourceUnitId}:${label}:${index}`)}`,
    sourceUnitId,
    label,
    confidence: Math.max(0, Math.min(1, readNumber(props.confidence, 0))),
    sourceBox: readStrybldrBox(props.sourceBox),
    evidenceKind: readStrybldrEvidenceKind(props.evidenceKind),
    provider: readStrybldrProvider(props.provider),
    order: readNumber(props.order, index),
    lane: cleanText(props.lane) || null,
    prompt: cleanText(props.prompt) || null,
    action: cleanText(props.action) || null,
    summary: cleanText(props.summary) || null,
  }
}

const buildStrybldrCardOverrideMap = (cards: readonly StrybldrCardOverride[] | null | undefined): Map<string, StrybldrCardOverride> => {
  const out = new Map<string, StrybldrCardOverride>()
  for (const card of Array.isArray(cards) ? cards : []) {
    const nodeId = cleanText(card.nodeId)
    if (nodeId) out.set(nodeId, card)
  }
  return out
}

const applyStrybldrCardOverride = (
  node: GraphNode,
  override: StrybldrCardOverride | null | undefined,
): GraphNode => {
  if (!override) return node
  const properties = {
    ...(node.properties || {}),
  } as Record<string, JSONValue>
  for (const key of STRYBLDR_CARD_OVERRIDE_TEXT_KEYS) {
    const value = cleanMultilineText(override[key])
    if (!value) continue
    if (key === 'title') {
      properties.title = asJson(value)
      continue
    }
    if (key === 'type') {
      continue
    }
    properties[key] = asJson(value)
  }
  const order = Number(override.order)
  if (Number.isFinite(order)) properties.order = asJson(order)
  const title = cleanMultilineText(override.title)
  const type = cleanMultilineText(override.type)
  return {
    ...node,
    ...(title ? { label: title } : {}),
    ...(type ? { type } : {}),
    properties,
  }
}

const withStrybldrD3StoryboardCardSurface = (node: GraphNode): GraphNode => {
  const properties = { ...(node.properties || {}) } as Record<string, JSONValue>
  if (typeof properties['visual:shape'] !== 'string' || !cleanText(properties['visual:shape'])) {
    properties['visual:shape'] = asJson('rect')
  }
  if (typeof properties['visual:width'] !== 'number' || !Number.isFinite(properties['visual:width']) || properties['visual:width'] <= 0) {
    properties['visual:width'] = asJson(RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX)
  }
  if (typeof properties['visual:height'] !== 'number' || !Number.isFinite(properties['visual:height']) || properties['visual:height'] <= 0) {
    properties['visual:height'] = asJson(RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX)
  }
  if (typeof properties['visual:fill'] !== 'string' || !cleanText(properties['visual:fill'])) {
    properties['visual:fill'] = asJson('var(--kg-panel-bg)')
  }
  if (typeof properties['visual:stroke'] !== 'string' || !cleanText(properties['visual:stroke'])) {
    properties['visual:stroke'] = asJson('var(--kg-border)')
  }
  if (properties['visual:preserveBody'] !== true) {
    properties['visual:preserveBody'] = asJson(true)
  }
  if (properties['visual:hideLabel'] !== true) {
    properties['visual:hideLabel'] = asJson(true)
  }
  return { ...node, properties }
}

export const buildStrybldrGraphData = (doc: StrybldrStoryboardDocument): GraphData => {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const sourceNodeIdByUnit = new Map<string, string>()
  const frameNodeIdByUnit = new Map<string, string>()
  const cardOverridesByNodeId = buildStrybldrCardOverrideMap(doc.cards)

  for (let index = 0; index < doc.sources.length; index += 1) {
    const source = doc.sources[index]!
    const base = source.sourceUnitId || source.workspacePath || source.originalName
    const sourceNodeId = `strybldr:source:${shortHash(base)}`
    const frameNodeId = `strybldr:frame:${shortHash(`${base}:frame`)}`
    const title = sourceLabel(source)
    const media = buildStrybldrSourceMediaFields(source)
    sourceNodeIdByUnit.set(source.sourceUnitId, sourceNodeId)
    frameNodeIdByUnit.set(source.sourceUnitId, frameNodeId)
    nodes.push(withStrybldrD3StoryboardCardSurface(applyStrybldrCardOverride({
      id: sourceNodeId,
      label: title,
      type: 'StrybldrImageSource',
      properties: {
        title: asJson(title),
        lane: asJson('Source'),
        order: asJson(index * 100),
        summary: asJson(`Imported ${sourceKindLabel(source)} source unit: ${source.originalName}.`),
        action: asJson('Review the source evidence into editable storyboard elements.'),
        prompt: asJson(`Use ${source.originalName} as the reference source.`),
        mediaUrl: asJson(media.mediaUrl),
        sourceUrl: asJson(media.sourceUrl || null),
        renderUrl: asJson(media.renderUrl || null),
        thumbnailUrl: asJson(media.thumbnailUrl || null),
        mediaKind: asJson(source.mediaKind),
        mimeHint: asJson(source.mimeHint || null),
        byteSize: asJson(source.byteSize),
        references: asJson(media.references),
        strybldrRunId: asJson(doc.runId),
        strybldrSourceUnitId: asJson(source.sourceUnitId),
        strybldrElementId: asJson(sourceNodeId),
        sourceBox: asJson({ xmin: 0, ymin: 0, xmax: 1, ymax: 1, unit: 'percentage' }),
        confidence: asJson(1),
        evidenceKind: asJson('source-metadata'),
      },
    }, cardOverridesByNodeId.get(sourceNodeId))))
    nodes.push(withStrybldrD3StoryboardCardSurface(applyStrybldrCardOverride({
      id: frameNodeId,
      label: `${title} Frame`,
      type: 'StoryboardFrame',
      properties: {
        title: asJson(`${title} Frame`),
        lane: asJson('Storyboard'),
        order: asJson(index * 100 + 1),
        summary: asJson('Frame-level storyboard card generated from the imported source.'),
        action: asJson('Review element cards, revise prompts, then send the approved sequence to video generation.'),
        prompt: asJson(`Create a short video storyboard beat from ${source.originalName}.`),
        mediaUrl: asJson(media.mediaUrl),
        sourceUrl: asJson(media.sourceUrl || null),
        renderUrl: asJson(media.renderUrl || null),
        thumbnailUrl: asJson(media.thumbnailUrl || null),
        mediaKind: asJson(source.mediaKind),
        mimeHint: asJson(source.mimeHint || null),
        byteSize: asJson(source.byteSize),
        references: asJson(media.references),
        strybldrRunId: asJson(doc.runId),
        strybldrSourceUnitId: asJson(source.sourceUnitId),
        strybldrElementId: asJson(frameNodeId),
        sourceBox: asJson({ xmin: 0, ymin: 0, xmax: 1, ymax: 1, unit: 'percentage' }),
        confidence: asJson(0.5),
        evidenceKind: asJson('source-metadata'),
      },
    }, cardOverridesByNodeId.get(frameNodeId))))
    edges.push(createEdge(sourceNodeId, frameNodeId, 'frames'))
  }

  for (const element of doc.elements.slice().sort((a, b) => a.order - b.order)) {
    const sourceNodeId = sourceNodeIdByUnit.get(element.sourceUnitId)
    const frameNodeId = frameNodeIdByUnit.get(element.sourceUnitId)
    if (!sourceNodeId || !frameNodeId) continue
    const source = doc.sources.find(item => item.sourceUnitId === element.sourceUnitId) || null
    const elementId = cleanText(element.id) || `strybldr:element:${shortHash(`${element.sourceUnitId}:${element.label}:${element.order}`)}`
    const media = source ? buildStrybldrSourceMediaFields(source) : null
    const mediaUrl = media?.mediaUrl || cleanText(source?.originalName), userAuthoredElement = element.evidenceKind === 'user-edit'
    nodes.push(withStrybldrD3StoryboardCardSurface(applyStrybldrCardOverride({
      id: elementId,
      label: element.label,
      type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
      properties: {
        title: asJson(element.label),
        lane: asJson(resolveStrybldrElementLane({ element, workflow: doc.workflow })),
        order: asJson(element.order),
        summary: asJson(element.summary || (userAuthoredElement ? '' : `${element.label} extracted from ${source?.originalName || 'image source'}.`)),
        action: asJson(element.action || (userAuthoredElement ? '' : 'Edit this element before video generation.')),
        prompt: asJson(element.prompt || (userAuthoredElement ? '' : `Animate ${element.label} as a distinct storyboard element.`)),
        mediaUrl: asJson(mediaUrl),
        sourceUrl: asJson(media?.sourceUrl || null),
        renderUrl: asJson(media?.renderUrl || null),
        thumbnailUrl: asJson(media?.thumbnailUrl || null),
        mediaKind: asJson(source?.mediaKind || 'image'),
        mimeHint: asJson(source?.mimeHint || null),
        byteSize: asJson(source?.byteSize || 0),
        references: asJson(media?.references || [source?.workspacePath || source?.relativePath || source?.originalName].filter(Boolean)),
        strybldrRunId: asJson(doc.runId),
        strybldrSourceUnitId: asJson(element.sourceUnitId),
        strybldrElementId: asJson(elementId),
        sourceBox: asJson(element.sourceBox || null),
        confidence: asJson(element.confidence),
        evidenceKind: asJson(element.evidenceKind),
        provider: asJson(element.provider),
        ['flow:widgetTypeId']: asJson(FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID),
        ['flow:widgetFormId']: asJson(FLOW_STORYBOARD_ELEMENT_FORM_ID),
      },
    }, cardOverridesByNodeId.get(elementId))))
    edges.push(createEdge(frameNodeId, elementId, 'containsElement'))
  }

  if (Array.isArray(doc.edges) && doc.edges.length > 0) {
    const graphNodeIds = new Set(nodes.map(node => cleanText(node.id)))
    const existingEdgeKeys = new Set(edges.map(edge => `${edge.source}\u0000${edge.label || ''}\u0000${edge.target}`))
    for (const workflowEdge of doc.edges) {
      if (!graphNodeIds.has(workflowEdge.source) || !graphNodeIds.has(workflowEdge.target)) continue
      const key = `${workflowEdge.source}\u0000${workflowEdge.label}\u0000${workflowEdge.target}`
      if (existingEdgeKeys.has(key)) continue
      existingEdgeKeys.add(key)
      edges.push(createWorkflowEdge(workflowEdge))
    }
  }

  appendStrytreeGraphData({ doc, nodes, edges })
  appendExplainerVideoGraphData({ doc, nodes, edges, sourceNodeIdByUnit })

  const isXr = isExplainerVideoXrMode(doc)

  const baseGraph: GraphData = {
    context: 'strybldr-storyboard',
    type: 'Graph',
    nodes,
    edges,
    metadata: {
      kind: 'strybldr-storyboard',
      parserId: 'strybldr-storyboard',
      strybldrRunId: doc.runId,
      sourcesCount: doc.sources.length,
      elementsCount: doc.elements.length,
      strytreeStoryId: doc.storytree?.storyId || null,
      strytreeNodesCount: doc.storytree?.nodes.length || 0,
      strytreeCandidateRunsCount: doc.storytree?.candidateRuns?.length || 0,
      workflowStages: doc.workflow?.stages || [],
      workflowForkId: doc.workflow?.fork?.id || null,
      workflowForkBranches: doc.workflow?.fork?.branches || [],
      workflowPublishId: doc.workflow?.publish?.id || null,
      workflowEdgesCount: doc.edges?.length || 0,
      explainerVideoPanelsCount: doc.explainerVideo?.panels.length || 0,
      textArtifactToExplainerVideo: doc.explainerVideo ? true : false,
      kgCanvasSurfaceMode: isXr ? 'xr' : '2d',
      kgCanvasRenderMode: isXr ? '3d' : '2d',
      kgCanvas3dMode: isXr ? 'xr' : null,
      kgCanvas2dRenderer: isXr ? null : 'storyboard',
    } as unknown as GraphData['metadata'],
  }
  const graphSemanticKey = buildScopedGraphSemanticKey('strybldr-storyboard', { graphData: baseGraph })
  return {
    ...baseGraph,
    metadata: {
      ...(baseGraph.metadata || {}),
      graphSemanticKey,
    } as unknown as GraphData['metadata'],
  }
}

export const mergeStrybldrElementsIntoGraphData = (args: {
  graphData: GraphData
  elements: readonly StrybldrElement[]
}): GraphData => {
  const graphNodes = Array.isArray(args.graphData.nodes) ? args.graphData.nodes : []
  const meta = args.graphData.metadata && typeof args.graphData.metadata === 'object'
    ? args.graphData.metadata as Record<string, unknown>
    : {}
  const sources = graphNodes
    .filter(node => String(node.type || '') === 'StrybldrImageSource')
    .map(node => {
      const props = node.properties || {}
      return {
        sourceUnitId: cleanText(props.strybldrSourceUnitId),
        workspacePath: cleanText((Array.isArray(props.references) ? props.references[0] : '') || ''),
        relativePath: cleanText((Array.isArray(props.references) ? props.references[0] : '') || ''),
        originalName: cleanText(node.label || 'source'),
        mediaKind: readCorpusMediaKind(props.mediaKind),
        mimeHint: cleanText(props.mimeHint) || null,
        byteSize: Number.isFinite(Number(props.byteSize)) ? Math.max(0, Number(props.byteSize)) : 0,
        textHash: '',
        mediaUrl: cleanText(props.mediaUrl) || cleanText(props.sourceUrl) || cleanText(props.renderUrl),
      }
    })
    .filter(source => source.sourceUnitId)
  const incomingElements = args.elements.slice()
  const incomingSourceIds = new Set(incomingElements.map(element => cleanText(element.sourceUnitId)).filter(Boolean))
  const existingElements = graphNodes
    .map(readStrybldrElementFromNode)
    .filter((element): element is StrybldrElement => !!element)
  const preservedElements = incomingSourceIds.size > 0
    ? existingElements.filter(element => !incomingSourceIds.has(element.sourceUnitId))
    : existingElements
  const doc: StrybldrStoryboardDocument = {
    version: 1,
    runId: cleanText(meta.strybldrRunId) || buildStrybldrRunId(sources),
    createdAtMs: Date.now(),
    sources,
    elements: [...preservedElements, ...incomingElements],
  }
  return buildStrybldrGraphData(doc)
}

const readNodeReferences = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.map(item => cleanText(item)).filter(Boolean)
}

export const buildStrybldrVideoHandoffFromGraphData = (graphData: GraphData | null | undefined): StrybldrVideoHandoff => {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const sourceVideo = nodes
    .map(node => {
      const props = node.properties || {}
      const mediaKind = cleanText(props.mediaKind)
      const candidates = uniqueCleanTexts([cleanText(props.sourceUrl), cleanText(props.mediaUrl), ...readNodeReferences(props.references)])
      const sourceUrl = candidates.find(value => {
        const inferred = inferMediaKindFromResourceUrl(value)
        return mediaKind === 'video' || inferred === 'video' || inferred === 'iframe'
      }) || ''
      if (!sourceUrl) return null
      const renderUrl = cleanText(props.renderUrl) || buildRenderableIframeUrl(sourceUrl) || sourceUrl
      return { sourceUrl, renderUrl }
    })
    .find((item): item is { sourceUrl: string; renderUrl: string } => !!item?.sourceUrl && !!item.renderUrl) || null
  const cards: StrybldrVideoHandoffCard[] = nodes
    .filter(node => {
      const type = cleanText(node.type)
      return type === 'StrybldrImageSource' || type === 'StoryboardFrame' || type === FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID || type === 'StorytreeSnapshot' || type === 'StorytreeNode' || type === 'StorytreeCandidateRun' || type === 'StorytreeCandidate' || type === 'ExplainerVideoSnapshot' || type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    })
    .map((node, index): StrybldrVideoHandoffCard => {
      const props = node.properties || {}
      const mediaUrl = cleanText(props.mediaUrl)
      const thumbnailUrl = cleanText(props.thumbnailUrl)
      const fallbackThumbnailUrl = buildRenderableMediaThumbnailUrl(mediaUrl)
      const references = uniqueCleanTexts([...readNodeReferences(props.references), cleanText(props.sourceUrl), mediaUrl, thumbnailUrl, fallbackThumbnailUrl])
      const camera = hasStrybldrCameraSettings(props[STRYBLDR_CAMERA_PROPERTY_KEY])
        ? buildStrybldrCameraHandoffLine(readStrybldrCameraSettings(props[STRYBLDR_CAMERA_PROPERTY_KEY]))
        : ''
      return {
        id: cleanText(node.id) || `strybldr-card-${index + 1}`,
        lane: cleanText(props.lane) || 'Storyboard',
        title: cleanText(props.title || node.label) || `Card ${index + 1}`,
        summary: cleanText(props.summary),
        action: cleanText(props.action),
        prompt: cleanText(props.prompt),
        camera,
        references,
        order: Number.isFinite(Number(props.order)) ? Number(props.order) : index,
        sourceUnitId: cleanText(props.strybldrSourceUnitId),
      }
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

  const promptLines = ['Create one short video from the approved Strybldr storyboard cards below.', 'Use only these approved card fields and references; do not invent extra source images or hidden context.', 'Preserve source composition, element positions, and card order. Keep motion concise and demo-ready.', '', ...cards.map((card, index) => [
    `${index + 1}. [${card.lane}] ${card.title}`,
    card.summary ? `Summary: ${card.summary}` : '',
    card.action ? `Action: ${card.action}` : '',
    card.prompt ? `Prompt: ${card.prompt}` : '',
    card.camera,
    card.references.length > 0 ? `References: ${card.references.join(', ')}` : '',
  ].filter(Boolean).join('\n'))]

  const mediaUrl = nodes
    .flatMap(node => {
      const props = node.properties || {}
      const rawMediaUrl = cleanText(props.mediaUrl)
      const inferred = inferMediaKindFromResourceUrl(rawMediaUrl)
      const thumbnailUrl = cleanText(props.thumbnailUrl)
      const fallbackThumbnailUrl = buildRenderableMediaThumbnailUrl(rawMediaUrl)
      return [thumbnailUrl, fallbackThumbnailUrl, inferred === 'image' || inferred === 'svg' ? rawMediaUrl : '']
    })
    .find(value => /^https?:\/\//i.test(value)) || null

  const handoff: StrybldrVideoHandoff = {
    cards,
    prompt: promptLines.join('\n').trim(),
    referenceImageUrl: mediaUrl,
    sourceVideoUrl: sourceVideo?.sourceUrl || null,
    renderVideoUrl: sourceVideo?.renderUrl || null,
  }
  handoff.localAnimaticHtml = buildStrybldrLocalAnimaticHtml(handoff)
  return handoff
}

export const buildStrybldrLocalAnimaticHtml = (handoff: Pick<StrybldrVideoHandoff, 'cards' | 'referenceImageUrl' | 'sourceVideoUrl' | 'renderVideoUrl'>): string => {
  const cards = (Array.isArray(handoff.cards) ? handoff.cards : []).slice(0, 8)
  if (cards.length === 0) return ''
  const durationSeconds = Math.max(8, cards.length * 4)
  const referenceImageUrl = cleanText(handoff.referenceImageUrl)
  const sourceVideoUrl = cleanText(handoff.sourceVideoUrl)
  const renderVideoUrl = cleanText(handoff.renderVideoUrl)
  const slides = cards.map((card, index) => {
    const offset = `${Math.round((index / Math.max(1, cards.length)) * 1000) / 10}%`
    const next = `${Math.round(((index + 1) / Math.max(1, cards.length)) * 1000) / 10}%`
    const title = htmlText(card.title || `Beat ${index + 1}`)
    const lane = htmlText(card.lane || 'Storyboard')
    const summary = htmlText(card.summary || card.prompt || card.action || 'Approved Strybldr beat.')
    const action = htmlText(card.action || card.prompt || '')
    return [
      `<section class="kg-slide" style="--i:${index};--start:${offset};--end:${next}">`,
      `<p class="kg-kicker">${lane} / Beat ${index + 1}</p>`,
      `<h1>${title}</h1>`,
      `<p>${summary}</p>`,
      action ? `<p class="kg-action">${action}</p>` : '',
      '</section>',
    ].filter(Boolean).join('')
  }).join('')
  const chapters = cards.map((card, index) => {
    const start = index * 4
    const end = start + 4
    return [
      '<li>',
      `<span>${htmlText(`${start}s-${end}s`)}</span>`,
      `<strong>${htmlText(card.title || `Beat ${index + 1}`)}</strong>`,
      '</li>',
    ].join('')
  }).join('')
  const poster = referenceImageUrl ? `<img class="kg-poster" src="${htmlAttr(referenceImageUrl)}" alt="Reference image" />` : ''
  const sourceLink = sourceVideoUrl ? `<a class="kg-source" href="${htmlAttr(sourceVideoUrl)}">Imported source</a>` : ''
  const renderLink = renderVideoUrl && renderVideoUrl !== sourceVideoUrl ? `<a class="kg-source" href="${htmlAttr(renderVideoUrl)}">Source preview</a>` : ''
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    '<title>Strybldr Local Generated Video</title>',
    '<style>',
    ':root{color-scheme:light;--ink:#172033;--muted:#5f6675;--line:#d7dde8;--paper:#f8fafc;--accent:#0f766e;--warm:#f59e0b}',
    '*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}',
    '.kg-stage{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 34%;gap:28px;min-height:100vh;padding:34px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 48%,#ecfdf5 100%);overflow:hidden}',
    '.kg-slides{position:relative;min-height:520px;border:1px solid var(--line);background:rgba(255,255,255,.82);box-shadow:0 18px 42px rgba(15,23,42,.14);overflow:hidden}',
    '.kg-slide{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:18px;padding:56px;opacity:0;transform:translateX(5%) scale(.98);animation:kgSlide var(--duration) linear infinite}',
    '.kg-slide:before{content:"";position:absolute;inset:24px;border:1px solid rgba(15,118,110,.2);pointer-events:none}',
    '.kg-kicker{margin:0;font-size:13px;text-transform:uppercase;color:var(--accent);font-weight:800;letter-spacing:0}',
    'h1{margin:0;max-width:840px;font-size:44px;line-height:1.02;letter-spacing:0}p{margin:0;max-width:760px;font-size:20px;line-height:1.45;color:var(--muted)}.kg-action{color:#7c2d12;font-weight:700}',
    '.kg-side{display:flex;min-width:0;flex-direction:column;justify-content:space-between;gap:18px}.kg-poster{width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--line);background:#111827}',
    '.kg-meter{height:8px;background:#dbe4ef;overflow:hidden}.kg-meter:before{content:"";display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--accent),var(--warm));transform-origin:left;animation:kgMeter var(--duration) linear infinite}',
    '.kg-meta{display:grid;gap:12px}.kg-label{font-size:12px;text-transform:uppercase;color:var(--muted);font-weight:800;letter-spacing:0}.kg-value{font-size:16px;font-weight:800}.kg-source{color:#0f766e;text-decoration:none;font-weight:800;overflow-wrap:anywhere}',
    '.kg-chapters{display:grid;gap:8px;margin:0;padding:0;list-style:none}.kg-chapters li{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px;align-items:center;border-top:1px solid var(--line);padding-top:8px}.kg-chapters span{font-size:12px;color:var(--muted);font-weight:800}.kg-chapters strong{font-size:13px;line-height:1.3}',
    '@keyframes kgMeter{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    '@keyframes kgSlide{0%,100%{opacity:0;transform:translateX(5%) scale(.98)}4%,22%{opacity:1;transform:translateX(0) scale(1)}26%{opacity:0;transform:translateX(-5%) scale(.98)}}',
    cards.map((_, index) => `.kg-slide:nth-child(${index + 1}){animation-delay:calc(var(--duration) * ${index / Math.max(1, cards.length)} * -1)}`).join(''),
    '@media(max-width:860px){.kg-stage{grid-template-columns:1fr;padding:18px}.kg-slides{min-height:480px}.kg-slide{padding:34px}h1{font-size:34px}p{font-size:17px}}',
    '</style>',
    '</head>',
    `<body style="--duration:${durationSeconds}s">`,
    '<main class="kg-stage" aria-label="Strybldr local generated video">',
    `<section class="kg-slides">${slides}</section>`,
    '<aside class="kg-side">',
    poster,
    '<section class="kg-meta">',
    '<section><div class="kg-label">Generator</div><div class="kg-value">agenticgraph local animatic</div></section>',
    `<section><div class="kg-label">Chapter clips</div><ol class="kg-chapters">${chapters}</ol></section>`,
    `<section><div class="kg-label">Approved cards</div><div class="kg-value">${cards.length}</div></section>`,
    '<section><div class="kg-label">Runtime</div><div class="kg-meter"></div></section>',
    sourceLink,
    renderLink,
    '</section>',
    '</aside>',
    '</main>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('')
}

const isStrybldrRuntimeNode = (node: GraphNode): boolean => {
  const props = node.properties || {}
  const lane = cleanText(props.lane || props.status || props.group)
  const type = cleanText(node.type || props.type || props.kind)
  const title = cleanText(node.label || props.title || props.name)
  return /\bruntime\b/i.test([lane, type, title, cleanText(node.id)].join(' '))
}

const isStrybldrVideoArtifactTargetNode = (node: GraphNode): boolean => {
  const props = node.properties || {}
  const lane = cleanText(props.lane || props.status || props.group)
  const type = cleanText(node.type || props.type || props.kind)
  return type === 'StoryboardFrame'
    || /^storyboard$/i.test(lane)
    || type === 'ExplainerVideoSnapshot'
    || type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    || (isStrybldrRuntimeNode(node) && /^(video|iframe)$/i.test(cleanText(props.mediaKind)))
}

const isStrybldrStoryboardNode = (node: GraphNode): boolean => {
  const props = node.properties || {}
  return Boolean(
    cleanText(props.strybldrRunId)
    || cleanText(props.strybldrSourceUnitId)
    || cleanText(props.strybldrElementId)
    || cleanText(props.kgStrybldrStoryboardPayload)
    || /strybldr/i.test(cleanText(node.id))
    || /strybldr/i.test(cleanText(node.type)),
  )
}

export const resolveStrybldrVideoArtifactTargetNodeId = (args: {
  graphData: GraphData
  targetNodeId?: string | null
}): string => {
  const nodes = Array.isArray(args.graphData.nodes) ? args.graphData.nodes : []
  const targetNodeId = cleanText(args.targetNodeId)
  if (targetNodeId && nodes.some(node => cleanText(node.id) === targetNodeId && isStrybldrStoryboardNode(node) && isStrybldrVideoArtifactTargetNode(node))) return targetNodeId
  const storyboardNode = nodes.find(node => isStrybldrStoryboardNode(node) && isStrybldrVideoArtifactTargetNode(node) && cleanText(node.type || node.properties?.type || node.properties?.kind) === 'StoryboardFrame')
  if (storyboardNode?.id) return cleanText(storyboardNode.id)
  const storyboardLaneNode = nodes.find(node => isStrybldrStoryboardNode(node) && isStrybldrVideoArtifactTargetNode(node) && /^storyboard$/i.test(cleanText(node.properties?.lane)))
  if (storyboardLaneNode?.id) return cleanText(storyboardLaneNode.id)
  const runtimeNode = nodes.find(node => isStrybldrStoryboardNode(node) && isStrybldrRuntimeNode(node))
  if (runtimeNode?.id) return cleanText(runtimeNode.id)
  const firstVideoTargetNode = nodes.find(node => isStrybldrStoryboardNode(node) && isStrybldrVideoArtifactTargetNode(node))
  return cleanText(firstVideoTargetNode?.id)
}

export const applyStrybldrVideoArtifactToGraphData = (args: {
  graphData: GraphData | null | undefined
  targetNodeId?: string | null
  handoff: StrybldrVideoHandoff
  status: 'generated' | 'copied' | 'fallback'
  artifactPath: string
  artifactText: string
  provider: string
  model?: string | null
  renderUrl?: string | null
  sourceUrl?: string | null
}): GraphData | null => {
  const graphData = args.graphData
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  if (!graphData || nodes.length === 0) return null
  const targetNodeId = resolveStrybldrVideoArtifactTargetNodeId({ graphData, targetNodeId: args.targetNodeId })
  if (!targetNodeId) return null
  const localAnimaticHtml = cleanMultilineText(args.handoff.localAnimaticHtml)
  const renderUrl = cleanText(args.renderUrl)
  const sourceUrl = cleanText(args.sourceUrl)
  const artifactPath = cleanText(args.artifactPath)
  const safeStatus = args.status === 'generated' || args.status === 'copied' ? args.status : 'fallback'
  const output = [
    safeStatus === 'generated'
      ? 'Generated Strybldr local animatic handoff.'
      : safeStatus === 'copied'
        ? 'Generated Strybldr source video copy handoff.'
        : 'Generated Strybldr fallback handoff.',
    artifactPath ? `Artifact: ${artifactPath}` : '',
    renderUrl ? `Render: ${renderUrl}` : '',
    sourceUrl ? `Source: ${sourceUrl}` : '',
  ].filter(Boolean).join('\n')
  const references = [artifactPath, renderUrl, sourceUrl].filter(Boolean)
  return {
    ...graphData,
    nodes: nodes.map(node => {
      if (cleanText(node.id) !== targetNodeId) return node
      const props = node.properties || {}
      const nextReferences = uniqueCleanTexts([
        ...readNodeReferences(props.references),
        ...references,
      ])
      return {
        ...node,
        properties: {
          ...props,
          output,
          outputSrcDoc: localAnimaticHtml || null,
          strybldrVideoArtifactPath: artifactPath || null,
          strybldrVideoArtifactText: args.artifactText || null,
          strybldrVideoStatus: safeStatus,
          provider: cleanText(args.provider) || cleanText(props.provider) || 'agenticgraph-local-animatic',
          model: cleanText(args.model) || cleanText(props.model) || 'strybldr-local-animatic-v1',
          mediaKind: localAnimaticHtml ? 'iframe' : inferMediaKindFromResourceUrl(renderUrl || sourceUrl) || cleanText(props.mediaKind) || 'iframe',
          mediaUrl: renderUrl || sourceUrl || artifactPath || null,
          renderUrl: renderUrl || null,
          sourceUrl: sourceUrl || null,
          references: nextReferences,
        },
      }
    }),
  }
}

export const applyStrybldrImageArtifactToGraphData = (args: {
  graphData: GraphData | null | undefined
  targetNodeId?: string | null
  artifactPath: string
  artifactText: string
  provider: string
  model?: string | null
  imageUrl: string
  prompt?: string | null
}): GraphData | null => {
  const graphData = args.graphData
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  if (!graphData || nodes.length === 0) return null
  const targetNodeId = resolveStrybldrVideoArtifactTargetNodeId({ graphData, targetNodeId: args.targetNodeId })
  if (!targetNodeId) return null
  const imageUrl = cleanText(args.imageUrl)
  const artifactPath = cleanText(args.artifactPath)
  if (!imageUrl) return null
  const output = [
    'Generated Strybldr image handoff.',
    artifactPath ? `Artifact: ${artifactPath}` : '',
    `Image: ${imageUrl}`,
    cleanMultilineText(args.prompt) ? `Prompt: ${cleanMultilineText(args.prompt)}` : '',
  ].filter(Boolean).join('\n')
  const references = [artifactPath, imageUrl].filter(Boolean)
  return {
    ...graphData,
    nodes: nodes.map(node => {
      if (cleanText(node.id) !== targetNodeId) return node
      const props = node.properties || {}
      const nextReferences = uniqueCleanTexts([
        ...readNodeReferences(props.references),
        ...references,
      ])
      return {
        ...node,
        properties: {
          ...props,
          output,
          outputSrcDoc: null,
          outputLoading: false,
          outputLoadingKind: null,
          imageUrl,
          strybldrImageArtifactPath: artifactPath || null,
          strybldrImageArtifactText: args.artifactText || null,
          strybldrImageStatus: 'generated',
          provider: cleanText(args.provider) || cleanText(props.provider) || 'agenticgraph-local-image',
          model: cleanText(args.model) || cleanText(props.model) || 'strybldr-local-image-v1',
          mediaKind: 'image',
          mediaUrl: imageUrl,
          renderUrl: imageUrl,
          sourceUrl: null,
          references: nextReferences,
        },
      }
    }),
  }
}

export const buildStrybldrVideoHandoffMarkdown = (args: {
  handoff: StrybldrVideoHandoff
  status: 'generated' | 'copied' | 'fallback'
  provider: string
  model?: string | null
  renderUrl?: string | null
  sourceUrl?: string | null
  errorReason?: string | null
  copyReason?: string | null
  elapsedMs: number
  paidCallCount: number
  cacheHit?: boolean
}): string => {
  const safeStatus = args.status === 'generated' || args.status === 'copied' ? args.status : 'fallback'
  const title = safeStatus === 'generated' ? 'Strybldr Video Handoff' : safeStatus === 'copied' ? 'Strybldr Video Copy' : 'Strybldr Video Fallback'
  const renderUrl = cleanText(args.renderUrl)
  const sourceUrl = cleanText(args.sourceUrl)
  const sourceKind = inferMediaKindFromResourceUrl(sourceUrl)
  const renderKind = inferMediaKindFromResourceUrl(renderUrl)
  const iframeUrl = renderKind === 'iframe'
    ? renderUrl
    : buildRenderableIframeUrl(sourceUrl) || (sourceKind === 'iframe' ? sourceUrl : '')
  const videoUrl = sourceKind === 'video' || renderKind === 'video'
    ? renderUrl || sourceUrl
    : ''
  const localAnimaticHtml = cleanMultilineText(args.handoff.localAnimaticHtml)
  const playableLines = localAnimaticHtml
    ? [
        '## Video',
        '',
        `<iframe srcdoc="${htmlAttr(localAnimaticHtml)}" title="Strybldr local generated video" width="100%" height="405" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`,
        '',
        sourceUrl ? `[Open source video](${sourceUrl})` : '',
        renderUrl && renderUrl !== sourceUrl ? `[Open render URL](${renderUrl})` : '',
        '',
      ].filter(line => line !== '')
    : renderUrl || sourceUrl
    ? [
        '## Video',
        '',
        iframeUrl
          ? `<iframe src="${htmlAttr(iframeUrl)}" title="Strybldr video" width="100%" height="405" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
          : videoUrl
            ? `<video controls playsinline src="${htmlAttr(videoUrl)}"></video>`
            : `[Open Strybldr video](${renderUrl || sourceUrl})`,
        '',
        sourceUrl ? `[Open source video](${sourceUrl})` : '',
        renderUrl && renderUrl !== sourceUrl ? `[Open render URL](${renderUrl})` : '',
        '',
      ].filter(line => line !== '')
    : []
  return [
    '---',
    'kgStrybldrVideoHandoff: true',
    `status: ${yamlQuote(safeStatus)}`,
    `provider: ${yamlQuote(cleanText(args.provider) || 'unconfigured')}`,
    args.model ? `model: ${yamlQuote(cleanText(args.model))}` : '',
    `elapsedMs: ${Math.max(0, Math.round(args.elapsedMs))}`,
    `paidCallCount: ${Math.max(0, Math.round(args.paidCallCount))}`,
    `cacheHit: ${args.cacheHit === true ? 'true' : 'false'}`,
    renderUrl ? `renderUrl: ${yamlQuote(renderUrl)}` : '',
    sourceUrl ? `sourceUrl: ${yamlQuote(sourceUrl)}` : '',
    args.copyReason ? `copyReason: ${yamlQuote(cleanText(args.copyReason))}` : '',
    args.errorReason ? `errorReason: ${yamlQuote(cleanText(args.errorReason))}` : '',
    '---',
    '',
    `# ${title}`,
    '',
    ...playableLines,
    '## Compiled Prompt',
    '',
    '```text',
    args.handoff.prompt || 'No approved Strybldr cards were available.',
    '```',
    '',
    '## Approved Cards',
    '',
    '```json',
    JSON.stringify(args.handoff.cards, null, 2),
    '```',
    '',
  ].filter(line => line !== '').join('\n')
}

export const buildStrybldrImageHandoffMarkdown = (args: {
  title?: string | null
  prompt: string
  provider: string
  model?: string | null
  imageUrl: string
  errorReason?: string | null
  elapsedMs: number
  paidCallCount: number
  cacheHit?: boolean
}): string => {
  const title = cleanText(args.title) || 'Strybldr Image Handoff'
  const imageUrl = cleanText(args.imageUrl)
  return [
    '---',
    'kgStrybldrImageHandoff: true',
    'status: "generated"',
    `provider: ${yamlQuote(cleanText(args.provider) || 'agenticgraph-local-image')}`,
    args.model ? `model: ${yamlQuote(cleanText(args.model))}` : '',
    `elapsedMs: ${Math.max(0, Math.round(args.elapsedMs))}`,
    `paidCallCount: ${Math.max(0, Math.round(args.paidCallCount))}`,
    `cacheHit: ${args.cacheHit === true ? 'true' : 'false'}`,
    imageUrl ? `imageUrl: ${yamlQuote(imageUrl)}` : '',
    args.errorReason ? `fallbackReason: ${yamlQuote(cleanText(args.errorReason))}` : '',
    '---',
    '',
    `# ${title}`,
    '',
    imageUrl ? `![Generated Strybldr image](${imageUrl})` : 'No image URL was generated.',
    '',
    '## Prompt',
    '',
    '```text',
    args.prompt || 'No Strybldr image prompt was available.',
    '```',
    '',
  ].filter(line => line !== '').join('\n')
}
