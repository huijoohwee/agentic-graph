import { unwrapKeyTypeValue as readNeutralTimelineRecordValue } from '@/lib/graph/keyTypeValue'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { readNodeProperties } from '@/lib/graph/nodeProperties'
import { toMetadataRecord } from '@/lib/graph/documentMetadata'
import { isPlainObject } from '@/lib/graph/value'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { extractYamlFrontmatterHeaderBlock } from '@/lib/markdown/frontmatter'
import {
  readMermaidDiagramKind,
  splitMermaidDiagrams,
  type MermaidDiagramKind,
} from 'grph-shared/markdown/mermaidInput'
import {
  formatMermaidGanttFrameSamplesToken,
  formatMermaidGanttFrameThumbnailToken,
} from './mermaidGanttFrameThumbnailToken'

export type MermaidStructuredDiagramKind = Extract<MermaidDiagramKind, 'flowchart' | 'gitgraph' | 'gantt' | 'timeline' | 'architecture' | 'eventmodeling'>

export type MermaidDiagramCommandRow = {
  key: string
  lineIndex: number
  lineNumber: number
  raw: string
  kind: string
  label: string
}

export type MermaidDiagramCodeModel = {
  kind: MermaidStructuredDiagramKind
  code: string
  lines: string[]
  declarationLineIndex: number
  rows: MermaidDiagramCommandRow[]
}

type NeutralTimelineTrack = {
  durationMs: number
  frameSamples: unknown
  id: string
  label: string
  startMs: number
  thumbnailUrl: string
}

type NeutralTimelineLane = {
  id: string
  label: string
  tracks: string[]
}

type MermaidFlowchartWorkflowNode = {
  id: string
  label: string
}

type MermaidWorkflowStep = {
  id: string
  label: string
}

const MERMAID_TYPED_TYPE_BY_KIND: Record<MermaidStructuredDiagramKind, string> = {
  flowchart: 'mermaid_flowchart',
  gitgraph: 'mermaid_gitgraph',
  gantt: 'mermaid_gantt',
  timeline: 'mermaid_timeline',
  architecture: 'mermaid_architecture',
  eventmodeling: 'mermaid_eventmodeling',
}

const MAX_TYPED_SCAN_DEPTH = 8
const MAX_TYPED_SCAN_NODES = 600

const readCode = (value: unknown): string => {
  return typeof value === 'string' ? String(value || '').trim() : ''
}

const normalizeTypedToken = (value: unknown): string => {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

const isMatchingTypedMermaidDiagram = (
  value: Record<string, unknown>,
  kind: MermaidStructuredDiagramKind,
): boolean => {
  return normalizeTypedToken(value.type) === MERMAID_TYPED_TYPE_BY_KIND[kind]
}

const pushUniqueCode = (out: string[], code: string): void => {
  const next = readCode(code)
  if (!next || out.includes(next)) return
  out.push(next)
}

const TYPED_MERMAID_PRIORITY_KEYS = new Set(['flow_diagrams', 'frontmatterMeta', 'diagrams', 'mermaid', 'value'])

const readTypedMermaidScanValues = (record: Record<string, unknown>): unknown[] => {
  const priority: unknown[] = []
  const rest: unknown[] = []
  for (const [key, value] of Object.entries(record)) {
    if (TYPED_MERMAID_PRIORITY_KEYS.has(key)) priority.push(value)
    else rest.push(value)
  }
  return priority.concat(rest)
}

const readNeutralTimelineString = (value: unknown): string => (
  typeof value === 'string' ? String(value || '').trim() : ''
)

const readNeutralTimelineNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const sanitizeNeutralTimelineLabel = (value: unknown, fallback: string): string => {
  const cleaned = readNeutralTimelineString(value).replace(/[:\n\r]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}


const parseNeutralTimelinePayload = (value: unknown): unknown => {
  const unwrapped = readNeutralTimelineRecordValue(value)
  if (typeof unwrapped !== 'string') return unwrapped
  const text = unwrapped.trim()
  if (!text || !/^[{[]/.test(text)) return unwrapped
  try {
    return JSON.parse(text) as unknown
  } catch {
    return unwrapped
  }
}

const buildNeutralTimelineSourceFrameThumbnailUrl = (args: {
  record: Record<string, unknown>
}): string => {
  return readNeutralTimelineString(args.record.thumbnailUrl)
    || readNeutralTimelineString(args.record.frameImageUrl)
    || readNeutralTimelineString(args.record.imageUrl)
}

const normalizeNeutralTimelineTrack = (value: unknown, index: number): NeutralTimelineTrack | null => {
  const parsed = parseNeutralTimelinePayload(value)
  if (!isPlainObject(parsed)) return null
  const record = parsed as Record<string, unknown>
  const label = sanitizeNeutralTimelineLabel(record.label, `Track ${index + 1}`)
  const id = readNeutralTimelineString(record.id) || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `track_${index + 1}`
  const startMs = Math.max(0, readNeutralTimelineNumber(record.startMs ?? record.start ?? record.offsetMs))
  const durationMs = Math.max(0, readNeutralTimelineNumber(record.durationMs ?? record.duration))
  if (durationMs <= 0) return null
  const thumbnailUrl = buildNeutralTimelineSourceFrameThumbnailUrl({ record })
  const frameSamples = record.frameSamples ?? record.frameByFrameSamples ?? []
  return { durationMs, frameSamples, id, label, startMs, thumbnailUrl }
}

const normalizeNeutralTimelineLane = (value: unknown, index: number): NeutralTimelineLane | null => {
  const parsed = parseNeutralTimelinePayload(value)
  if (!isPlainObject(parsed)) return null
  const record = parsed as Record<string, unknown>
  const label = sanitizeNeutralTimelineLabel(record.label, `Lane ${index + 1}`)
  const id = readNeutralTimelineString(record.id) || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `lane_${index + 1}`
  const tracks = Array.isArray(record.tracks)
    ? record.tracks.map(item => readNeutralTimelineString(item)).filter(Boolean)
    : []
  return { id, label, tracks }
}

const resolveNeutralTimelineUnitMs = (tracks: readonly NeutralTimelineTrack[]): number => {
  const maxEndMs = tracks.reduce((max, track) => Math.max(max, track.startMs + track.durationMs), 0)
  return maxEndMs > 0 && maxEndMs <= 60000 ? 1000 : 60000
}

const formatNeutralTimelinePositionToken = (ms: number): string => {
  const minutes = Math.max(0, ms / 60000)
  return `kgpos_${String(Number(minutes.toFixed(6))).replace(/\./g, '_')}`
}

const formatNeutralTimelineClock = (ms: number, unitMs: number): string => {
  const totalMinutes = Math.max(0, Math.round(unitMs === 1000 ? ms / 1000 : ms / Math.max(1, unitMs)))
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const formatNeutralTimelineDurationMinutes = (ms: number, unitMs: number): string => {
  const minutes = unitMs === 1000 ? ms / 60000 : ms / Math.max(1, unitMs)
  return `${Math.max(0.001, Number(minutes.toFixed(6)))}m`
}

const readNeutralTimelineTitle = (payload: Record<string, unknown>): string => (
  sanitizeNeutralTimelineLabel(payload.title, 'Video Sequence Timeline')
)

const cleanMermaidFlowchartLabel = (value: unknown): string => String(value || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/[:\n\r]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const sanitizeMermaidFlowchartWorkflowId = (value: unknown, fallback: string): string => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  || fallback
)

export const buildMermaidGanttWorkflowCode = (
  args: {
    idPrefix: string
    title: string
    steps: readonly MermaidWorkflowStep[]
  },
): string => {
  if (!args.steps.length) return ''
  const stepMinutes = 1 / 6
  const lines = [
    'gantt',
    `  title ${args.title}`,
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Workflow',
  ]
  args.steps.forEach((step, index) => {
    const id = sanitizeMermaidFlowchartWorkflowId(step.id, `${args.idPrefix}_${index + 1}`)
    const label = cleanMermaidFlowchartLabel(step.label) || id
    const startToken = `kgpos_${String(Number((index * stepMinutes).toFixed(3))).replace(/\./g, '_')}`
    lines.push(`  ${label} : ${args.idPrefix}_${id}, ${startToken}, ${String(Number(stepMinutes.toFixed(3)))}m`)
  })
  return lines.join('\n')
}

const readMermaidFlowchartNodeToken = (value: string): MermaidFlowchartWorkflowNode | null => {
  const token = String(value || '').trim()
  if (!token || /^(?:class|classDef|click|end|flowchart|linkStyle|style|subgraph)\b/i.test(token)) return null
  const labelMatch = /^([A-Za-z0-9_:-]+)\s*(?:\[\[([\s\S]*?)\]\]|\[\s*"([\s\S]*?)"\s*\]|\[\s*'([\s\S]*?)'\s*\]|\[([\s\S]*?)\]|\(\(\s*"([\s\S]*?)"\s*\)\)|\(\(\s*'([\s\S]*?)'\s*\)\)|\(\(([\s\S]*?)\)\)|\(\s*"([\s\S]*?)"\s*\)|\(\s*'([\s\S]*?)'\s*\)|\(([\s\S]*?)\)|\{([\s\S]*?)\})/.exec(token)
  if (labelMatch) {
    const label = cleanMermaidFlowchartLabel(labelMatch.slice(2).find(part => part != null) || '')
    const id = cleanMermaidFlowchartLabel(labelMatch[1] || '')
    return id ? { id, label: label || id } : null
  }
  const bareMatch = /^([A-Za-z0-9_:-]+)\b/.exec(token)
  const id = cleanMermaidFlowchartLabel(bareMatch?.[1] || '')
  return id ? { id, label: id } : null
}

const collectMermaidFlowchartWorkflowNodes = (code: string): MermaidFlowchartWorkflowNode[] => {
  const nodeById = new Map<string, MermaidFlowchartWorkflowNode>()
  const pushNode = (node: MermaidFlowchartWorkflowNode | null): void => {
    if (!node || nodeById.has(node.id)) return
    nodeById.set(node.id, node)
  }
  for (const rawLine of String(code || '').replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%%') || /^flowchart\b/i.test(line)) continue
    const declaration = readMermaidFlowchartNodeToken(line)
    if (declaration?.label !== declaration?.id || !/(?:-->|---|==>|-.->|-\.-|~~~)/.test(line)) pushNode(declaration)
    const edgeParts = line.split(/\s*(?:-->|---|==>|-.->|-\.-|~~~)\s*/).map(part => part.trim()).filter(Boolean)
    if (edgeParts.length < 2) continue
    for (const part of edgeParts) pushNode(readMermaidFlowchartNodeToken(part))
  }
  return Array.from(nodeById.values())
}

export const buildMermaidGanttWorkflowCodeFromFlowchartCode = (code: string): string => {
  const nodes = collectMermaidFlowchartWorkflowNodes(code)
  return buildMermaidGanttWorkflowCode({
    idPrefix: 'flowchart',
    title: 'Flowchart Workflow',
    steps: nodes,
  })
}

export const buildMermaidGanttWorkflowCodeFromEventModelingCode = (code: string): string => {
  const model = parseMermaidDiagramCodeModel(code, 'eventmodeling')
  const steps = model.rows
    .filter(row => row.kind !== 'line' && row.kind !== 'timeframe' && row.kind !== 'reference')
    .map((row, index) => ({
      id: `${row.kind}_${row.label || index + 1}`,
      label: cleanMermaidFlowchartLabel(row.label) || `${row.kind} ${index + 1}`,
    }))
    .filter(step => !!step.label)
  return buildMermaidGanttWorkflowCode({
    idPrefix: 'event_model',
    title: 'Event Model Workflow',
    steps,
  })
}

export const buildMermaidGanttCodeFromNeutralTimelinePayload = (value: unknown): string => {
  const payload = parseNeutralTimelinePayload(value)
  if (!isPlainObject(payload)) return ''
  const record = payload as Record<string, unknown>
  const tracks = Array.isArray(record.timelineTracks)
    ? record.timelineTracks.map(normalizeNeutralTimelineTrack).filter((item): item is NeutralTimelineTrack => !!item)
    : []
  if (!tracks.length) return ''
  const unitMs = resolveNeutralTimelineUnitMs(tracks)
  const trackById = new Map(tracks.map(track => [track.id, track]))
  const lanes = Array.isArray(record.timelineLanes)
    ? record.timelineLanes.map(normalizeNeutralTimelineLane).filter((item): item is NeutralTimelineLane => !!item)
    : []
  const assignedTrackIds = new Set<string>()
  const lines = [
    'gantt',
    `  title ${readNeutralTimelineTitle(record)}`,
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
  ]
  const pushLane = (lane: NeutralTimelineLane): void => {
    const laneTracks = lane.tracks.map(id => trackById.get(id)).filter((item): item is NeutralTimelineTrack => !!item)
    if (!laneTracks.length) return
    lines.push(`  section ${sanitizeNeutralTimelineLabel(lane.label, lane.id)}`)
    for (const track of laneTracks) {
      assignedTrackIds.add(track.id)
      const frameSamplesToken = formatMermaidGanttFrameSamplesToken(track.frameSamples)
      const thumbnailToken = formatMermaidGanttFrameThumbnailToken(track.thumbnailUrl)
      const positionToken = unitMs === 1000 ? formatNeutralTimelinePositionToken(track.startMs) : ''
      lines.push(`  ${track.label} : ${[track.id, frameSamplesToken, thumbnailToken, positionToken, formatNeutralTimelineClock(track.startMs, unitMs), formatNeutralTimelineDurationMinutes(track.durationMs, unitMs)].filter(Boolean).join(', ')}`)
    }
  }
  for (const lane of lanes) pushLane(lane)
  const unassigned = tracks.filter(track => !assignedTrackIds.has(track.id))
  if (unassigned.length) {
    lines.push('  section Timeline')
    for (const track of unassigned) {
      const frameSamplesToken = formatMermaidGanttFrameSamplesToken(track.frameSamples)
      const thumbnailToken = formatMermaidGanttFrameThumbnailToken(track.thumbnailUrl)
      const positionToken = unitMs === 1000 ? formatNeutralTimelinePositionToken(track.startMs) : ''
      lines.push(`  ${track.label} : ${[track.id, frameSamplesToken, thumbnailToken, positionToken, formatNeutralTimelineClock(track.startMs, unitMs), formatNeutralTimelineDurationMinutes(track.durationMs, unitMs)].filter(Boolean).join(', ')}`)
    }
  }
  return lines.join('\n')
}

const collectNeutralTimelineGanttCodes = (
  value: unknown,
  out: string[],
  state: { depth: number; visited: number },
): void => {
  if (state.depth > MAX_TYPED_SCAN_DEPTH || state.visited > MAX_TYPED_SCAN_NODES) return
  state.visited += 1
  const parsed = parseNeutralTimelinePayload(value)
  const code = buildMermaidGanttCodeFromNeutralTimelinePayload(parsed)
  if (code) pushUniqueCode(out, code)
  if (Array.isArray(parsed)) {
    state.depth += 1
    for (const item of parsed) collectNeutralTimelineGanttCodes(item, out, state)
    state.depth -= 1
    return
  }
  if (!isPlainObject(parsed)) return
  state.depth += 1
  for (const item of Object.values(parsed as Record<string, unknown>)) {
    collectNeutralTimelineGanttCodes(item, out, state)
  }
  state.depth -= 1
}

export const readNeutralTimelineGanttCodes = (
  value: unknown,
): string[] => {
  const out: string[] = []
  collectNeutralTimelineGanttCodes(value, out, { depth: 0, visited: 0 })
  return out
}

const collectTypedMermaidDiagramCodes = (
  value: unknown,
  kind: MermaidStructuredDiagramKind,
  out: string[],
  state: { depth: number; visited: number },
): void => {
  if (state.depth > MAX_TYPED_SCAN_DEPTH || state.visited > MAX_TYPED_SCAN_NODES) return
  state.visited += 1

  if (Array.isArray(value)) {
    state.depth += 1
    for (const item of value) collectTypedMermaidDiagramCodes(item, kind, out, state)
    state.depth -= 1
    return
  }

  if (!isPlainObject(value)) return
  const record = value as Record<string, unknown>
  if (isMatchingTypedMermaidDiagram(record, kind)) {
    pushUniqueCode(out, readCode(record.value))
  }

  state.depth += 1
  for (const item of readTypedMermaidScanValues(record)) {
    collectTypedMermaidDiagramCodes(item, kind, out, state)
  }
  state.depth -= 1
}

export const readTypedMermaidDiagramCodes = (
  value: unknown,
  kind: MermaidStructuredDiagramKind,
): string[] => {
  const out: string[] = []
  collectTypedMermaidDiagramCodes(value, kind, out, { depth: 0, visited: 0 })
  return out
}

export const resolveMermaidDiagramCode = (
  candidates: ReadonlyArray<string | null | undefined>,
  kind: MermaidStructuredDiagramKind,
): string => {
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = readCode(candidates[i])
    if (!raw) continue
    const diagrams = splitMermaidDiagrams(raw)
    const match = diagrams.find(diagram => diagram.kind === kind)
    const code = readCode(match?.code)
    if (code) return code
  }
  return ''
}

export const readYamlFrontmatterMermaidDiagramCodes = (
  rawText: string,
  kind: MermaidStructuredDiagramKind,
): string[] => {
  const block = extractYamlFrontmatterHeaderBlock(rawText)
  if (!block) return []
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(block.rawBlock))
  const meta = isPlainObject(parsed.meta) ? parsed.meta : null
  if (!meta) return []
  const out = readTypedMermaidDiagramCodes(meta, kind)
  pushUniqueCode(out, readCode(meta.mermaid))
  return out
}

const isFrontmatterMermaidDiagram = (node: GraphNode | null | undefined): boolean => {
  if (!node || String(node.type || '') !== 'MermaidDiagram') return false
  const props = readNodeProperties(node)
  return props.isMermaidFrontmatter === true || props.mermaidScope === 'frontmatter'
}

export const readFrontmatterMermaidDiagramCodes = (
  graphData: GraphData | null | undefined,
  kind: MermaidStructuredDiagramKind,
): string[] => {
  if (!graphData) return []
  const out: string[] = []
  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
  for (const node of nodes) {
    if (!isFrontmatterMermaidDiagram(node)) continue
    const props = readNodeProperties(node)
    const code = readCode(props.code)
    if (!code) continue
    const propKind = normalizeTypedToken(props.diagramKind)
    if (propKind === kind || readMermaidDiagramKind(code) === kind) pushUniqueCode(out, code)
  }
  const metadata = toMetadataRecord(graphData.metadata)
  const frontmatterMeta = isPlainObject(metadata.frontmatterMeta) ? metadata.frontmatterMeta : null
  if (frontmatterMeta) {
    for (const code of readTypedMermaidDiagramCodes(frontmatterMeta, kind)) pushUniqueCode(out, code)
    pushUniqueCode(out, readCode((frontmatterMeta as Record<string, unknown>).mermaid))
  }
  if (kind === 'gantt') {
    for (const code of readNeutralTimelineGanttCodes(graphData)) pushUniqueCode(out, code)
  }
  return out
}

const readGanttRowKind = (trimmed: string): string => {
  if (/^section\b/i.test(trimmed)) return 'section'
  if (/^title\b/i.test(trimmed)) return 'title'
  if (/^(?:dateFormat|axisFormat|tickInterval|weekday|excludes|includes|todayMarker)\b/i.test(trimmed)) return 'config'
  if (/:/.test(trimmed)) return 'task'
  return 'line'
}

const readGanttRowLabel = (trimmed: string, kind: string): string => {
  if (kind === 'section') return trimmed.replace(/^section\b/i, '').trim() || trimmed
  if (kind === 'title') return trimmed.replace(/^title\b/i, '').trim() || trimmed
  if (kind === 'task') return trimmed.split(':', 1)[0]?.trim() || trimmed
  return trimmed
}

const readTimelineRowKind = (trimmed: string): string => {
  if (/^section\b/i.test(trimmed)) return 'section'
  if (/^title\b/i.test(trimmed)) return 'title'
  if (/:/.test(trimmed)) return 'event'
  return 'line'
}

const readTimelineRowLabel = (trimmed: string, kind: string): string => {
  if (kind === 'section') return trimmed.replace(/^section\b/i, '').trim() || trimmed
  if (kind === 'title') return trimmed.replace(/^title\b/i, '').trim() || trimmed
  if (kind === 'event') return trimmed.split(':', 1)[0]?.trim() || trimmed
  return trimmed
}

const readArchitectureRowKind = (trimmed: string): string => {
  if (/^group\b/i.test(trimmed)) return 'group'
  if (/^service\b/i.test(trimmed)) return 'service'
  if (/^junction\b/i.test(trimmed)) return 'junction'
  if (/--|<--|-->/.test(trimmed)) return 'connection'
  return 'line'
}

const readArchitectureRowLabel = (trimmed: string, kind: string): string => {
  if (kind === 'group') return trimmed.replace(/^group\b/i, '').trim() || trimmed
  if (kind === 'service') {
    const match = /^service\s+([^\s(]+)/i.exec(trimmed)
    return match?.[1]?.trim() || trimmed
  }
  if (kind === 'junction') return trimmed.replace(/^junction\b/i, '').trim() || trimmed
  return trimmed
}

const readEventModelingRowKind = (trimmed: string): string => {
  if (/^(?:timeframe|tf)\b/i.test(trimmed)) {
    if (/\b(?:ui)\b/i.test(trimmed)) return 'ui'
    if (/\b(?:command|cmd)\b/i.test(trimmed)) return 'command'
    if (/\b(?:event|evt)\b/i.test(trimmed)) return 'event'
    if (/\b(?:processor|pcr)\b/i.test(trimmed)) return 'processor'
    if (/\b(?:readmodel|rmo)\b/i.test(trimmed)) return 'read-model'
    return 'timeframe'
  }
  if (/^(?:rf)\b/i.test(trimmed)) return 'reference'
  return 'line'
}

const readEventModelingRowLabel = (trimmed: string): string => {
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  return tokens[tokens.length - 1] || trimmed
}

const readDiagramRowKind = (kind: MermaidStructuredDiagramKind, trimmed: string): string => {
  if (kind === 'gantt') return readGanttRowKind(trimmed)
  if (kind === 'timeline') return readTimelineRowKind(trimmed)
  if (kind === 'architecture') return readArchitectureRowKind(trimmed)
  if (kind === 'eventmodeling') return readEventModelingRowKind(trimmed)
  return trimmed.split(/\s+/, 1)[0] || 'line'
}

const readDiagramRowLabel = (kind: MermaidStructuredDiagramKind, trimmed: string, rowKind: string): string => {
  if (kind === 'gantt') return readGanttRowLabel(trimmed, rowKind)
  if (kind === 'timeline') return readTimelineRowLabel(trimmed, rowKind)
  if (kind === 'architecture') return readArchitectureRowLabel(trimmed, rowKind)
  if (kind === 'eventmodeling') return readEventModelingRowLabel(trimmed)
  return trimmed
}

export const parseMermaidDiagramCodeModel = (
  code: string,
  kind: MermaidStructuredDiagramKind,
): MermaidDiagramCodeModel => {
  const normalizedCode = String(code || '').replace(/\r/g, '')
  const lines = normalizedCode.split('\n')
  const declarationLineIndex = lines.findIndex(line => readMermaidDiagramKind(line) === kind)
  const rows: MermaidDiagramCommandRow[] = []
  if (declarationLineIndex >= 0) {
    for (let i = declarationLineIndex + 1; i < lines.length; i += 1) {
      const raw = String(lines[i] || '')
      const trimmed = raw.trim()
      if (!trimmed || trimmed.startsWith('%%')) continue
      const rowKind = readDiagramRowKind(kind, trimmed)
      rows.push({
        key: `${i}:${rowKind}:${trimmed}`,
        lineIndex: i,
        lineNumber: i + 1,
        raw: trimmed,
        kind: rowKind,
        label: readDiagramRowLabel(kind, trimmed, rowKind),
      })
    }
  }
  return {
    kind,
    code: normalizedCode,
    lines,
    declarationLineIndex,
    rows,
  }
}
