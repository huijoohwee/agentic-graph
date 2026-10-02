import {
  normalizeDiagramSelectionText,
  readDiagramSelectionLabels,
  resolveDiagramRowKey,
  splitDiagramSelectionTokens,
  type DiagramSelectionRow,
} from '@/lib/diagram/diagramRowSelection'
import type { StoryboardWidgetPortRow } from '@/lib/storyboardWidget/storyboardWidgetPortRows'

export type StoryboardWidgetDiagramSelectionBridge = {
  diagramRowKeyToPortRowKey: Map<string, string>
  portRowKeyToDiagramRowKey: Map<string, string>
}

const MIN_FLOW_DIAGRAM_SELECTION_SCORE = 4
const VIDEO_AGENT_TIMELINE_AFFINITY_SCORE = 96
const OPAQUE_GANTT_MEDIA_TOKEN_RE = /\bkg(?:thumb|frames)_[A-Za-z0-9_-]+/g

type DiagramComparable = {
  key: string
  kind: string
  primaryLabels: string[]
  textKey: string
  tokens: Set<string>
  taskId: string
}

type PortComparable = {
  row: StoryboardWidgetPortRow
  nodeLabels: string[]
  nodeTokens: Set<string>
  portTokens: Set<string>
  portKey: string
  portKeyComparable: string
  socketTypeComparable: string
  videoAgentSourceSpec: boolean
}

const VIDEO_AGENT_STAGE_TASK_IDS = new Set([
  'video_agent_source_video',
  'video_agent_frame_by_frame_boxe',
  'video_agent_source_audio',
  'ingest',
  'parse',
  'search',
  'edit',
  'compile',
  'generate',
  'stream',
])

const VIDEO_AGENT_SOURCE_STAGE_TASK_IDS = new Set([
  'video_agent_source_video',
  'video_agent_frame_by_frame_boxe',
  'video_agent_source_audio',
  'ingest',
  'parse',
  'search',
  'edit',
  'compile',
  'generate',
])

const FLOW_DIAGRAM_SELECTION_STOP_TOKENS = new Set([
  'branch',
  'checkout',
  'commit',
  'edge',
  'edges',
  'field',
  'fields',
  'input',
  'inputs',
  'line',
  'merge',
  'node',
  'output',
  'outputs',
  'panel',
  'port',
  'ports',
  'row',
  'rows',
  'section',
  'tag',
  'title',
  'type',
  'value',
  'values',
])

const expandComparableText = (value: unknown): string => {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

const normalizeToken = (token: string): string => {
  const lower = token.toLowerCase()
  if (lower.length > 4 && lower.endsWith('s')) return lower.slice(0, -1)
  return lower
}

const normalizeComparableKey = (value: unknown): string => {
  return normalizeDiagramSelectionText(value).replace(/\s+/g, '')
}

const pushComparableTokens = (out: Set<string>, value: unknown): void => {
  const expanded = expandComparableText(value)
  const variants = [expanded, expanded.replace(/[_-]+/g, ' ')]
  for (const variant of variants) {
    for (const token of splitDiagramSelectionTokens(variant)) {
      const normalized = normalizeToken(token)
      if (!normalized || FLOW_DIAGRAM_SELECTION_STOP_TOKENS.has(normalized)) continue
      out.add(normalized)
    }
  }
}

const readComparableTokens = (values: ReadonlyArray<unknown>): Set<string> => {
  const out = new Set<string>()
  for (const value of values) pushComparableTokens(out, value)
  return out
}

const countSharedTokens = (left: Set<string>, right: Set<string>): number => {
  let count = 0
  const relatedTokens = Array.from(right)
  left.forEach(token => {
    if (right.has(token)) {
      count += 1
      return
    }
    const hasRelatedToken = relatedTokens.some(candidate => (
      token.length >= 5
      && candidate.length >= 5
      && (token.startsWith(candidate) || candidate.startsWith(token))
    ))
    if (hasRelatedToken) count += 1
  })
  return count
}

const readDiagramLabels = (row: DiagramSelectionRow): string[] => {
  const labels = readDiagramSelectionLabels(row)
  return labels.length ? labels : [row.label, row.raw].map(value => String(value || '').trim()).filter(Boolean)
}

const readPrimaryDiagramLabels = (row: DiagramSelectionRow): string[] => {
  return [row.label, row.raw].map(value => String(value || '').trim()).filter(Boolean)
}

const readDiagramComparableText = (row: DiagramSelectionRow): string => {
  return readDiagramLabels(row).join(' ')
}

const readMermaidTaskId = (row: DiagramSelectionRow): string => {
  const raw = String(row.raw || '')
  const match = raw.match(/:\s*([A-Za-z][A-Za-z0-9_-]*)\s*,/)
  return normalizeToken(match?.[1] || '')
}

const isFlowSelectableDiagramRow = (row: DiagramSelectionRow): boolean => {
  const kind = normalizeDiagramSelectionText(row.kind)
  return kind !== 'title' && kind !== 'section'
}

const buildDiagramComparable = (row: DiagramSelectionRow, index: number): DiagramComparable => {
  // Encoded media belongs to playback; it has no semantic selection labels.
  // Keep the authored row/key intact and remove payloads only before matching.
  const comparableRow = {
    ...row,
    label: String(row.label || '').replace(OPAQUE_GANTT_MEDIA_TOKEN_RE, ''),
    raw: String(row.raw || '').replace(OPAQUE_GANTT_MEDIA_TOKEN_RE, ''),
  }
  return {
    key: resolveDiagramRowKey(row, index),
    kind: normalizeDiagramSelectionText(row.kind),
    primaryLabels: readPrimaryDiagramLabels(comparableRow).map(normalizeDiagramSelectionText).filter(Boolean),
    textKey: normalizeComparableKey(readDiagramComparableText(comparableRow)),
    tokens: isFlowSelectableDiagramRow(row) ? readComparableTokens(readDiagramLabels(comparableRow)) : new Set(),
    taskId: readMermaidTaskId(comparableRow),
  }
}

const isVideoAgentSourceSpecPort = (portRow: StoryboardWidgetPortRow): boolean => {
  const tokens = readComparableTokens([portRow.nodeId, portRow.nodeLabel, portRow.nodeType, portRow.socketType])
  return (
    tokens.has('video')
    && (tokens.has('agent') || tokens.has('html'))
    && (tokens.has('render') || tokens.has('spec') || tokens.has('renderer') || tokens.has('source'))
  )
}

const buildPortComparable = (row: StoryboardWidgetPortRow): PortComparable => {
  const nodeLabels = [row.nodeLabel, row.nodeId, row.nodeType]
  return {
    row,
    nodeLabels: nodeLabels.map(normalizeDiagramSelectionText).filter(Boolean),
    nodeTokens: readComparableTokens(nodeLabels),
    portTokens: readComparableTokens([row.portKey, row.socketType, row.direction]),
    portKey: normalizeDiagramSelectionText(row.portKey),
    portKeyComparable: normalizeComparableKey(row.portKey),
    socketTypeComparable: normalizeComparableKey(row.socketType),
    videoAgentSourceSpec: isVideoAgentSourceSpecPort(row),
  }
}

const scoreVideoAgentTimelineAffinity = (diagram: DiagramComparable, port: PortComparable): number => {
  if (diagram.kind !== 'task') return 0
  const taskId = diagram.taskId
  const diagramText = diagram.textKey
  const normalizedPortKey = port.portKeyComparable
  const normalizedSocketType = port.socketTypeComparable
  let score = 0

  if (
    normalizedPortKey === 'frameboundingboxes'
    && (/framebox|framebyframe|bbox|boundingbox/.test(diagramText) || taskId.startsWith('frame_box'))
  ) {
    score += VIDEO_AGENT_TIMELINE_AFFINITY_SCORE
    if (normalizedSocketType === 'annotationjson') score += 24
    if (port.videoAgentSourceSpec) score += 12
  }

  if (!VIDEO_AGENT_STAGE_TASK_IDS.has(taskId)) return score
  if (VIDEO_AGENT_SOURCE_STAGE_TASK_IDS.has(taskId)) {
    if (normalizedPortKey === 'datajson') score += VIDEO_AGENT_TIMELINE_AFFINITY_SCORE
    if (normalizedSocketType === 'htmlvideospec') score += 36
    if (port.row.direction === 'output') score += 12
    if (port.videoAgentSourceSpec) score += 24
  } else if (taskId === 'stream') {
    if (normalizedPortKey === 'outputsrcdoc' || normalizedPortKey === 'videourl') score += VIDEO_AGENT_TIMELINE_AFFINITY_SCORE
    if (normalizedSocketType === 'htmlvideoartifact' || normalizedSocketType === 'richmediainlinehtml') score += 36
    if (port.videoAgentSourceSpec) score += 12
  }
  return score
}

const scoreDiagramRowAgainstPortRow = (diagram: DiagramComparable, port: PortComparable): number => {
  if (!diagram.tokens.size) return 0
  const hasExactOrContainedNodeLabel = diagram.primaryLabels.some(diagramLabel => {
    return port.nodeLabels.some(nodeLabel => {
      return diagramLabel === nodeLabel || nodeLabel.includes(diagramLabel) || diagramLabel.includes(nodeLabel)
    })
  })

  const hasExactOrContainedPortKey = port.portKey
    ? diagram.primaryLabels.some(diagramLabel => {
      return diagramLabel === port.portKey || diagramLabel.includes(port.portKey) || port.portKey.includes(diagramLabel)
    })
    : false

  const sharedNodeTokens = countSharedTokens(diagram.tokens, port.nodeTokens)
  const sharedPortTokens = countSharedTokens(diagram.tokens, port.portTokens)
  let score = sharedNodeTokens * 8 + sharedPortTokens * 3 + scoreVideoAgentTimelineAffinity(diagram, port)
  if (hasExactOrContainedNodeLabel) score += 32
  if (hasExactOrContainedPortKey) score += 24
  if (port.row.connectedEdgeCount > 0) score += 1
  return score
}

export const buildStoryboardWidgetDiagramSelectionBridge = ({
  diagramRows,
  flowRows,
}: {
  diagramRows: readonly DiagramSelectionRow[]
  flowRows: readonly StoryboardWidgetPortRow[]
}): StoryboardWidgetDiagramSelectionBridge => {
  const diagrams = diagramRows.map(buildDiagramComparable)
  const ports = flowRows.map(buildPortComparable)
  const diagramRowKeyToPortRowKey = new Map<string, string>()
  const portRowKeyToDiagramRowKey = new Map<string, string>()
  const bestDiagrams = ports.map(() => ({ score: 0, key: '' }))
  for (const diagram of diagrams) {
    if (!diagram.key) continue
    let bestPortScore = 0
    let bestPortKey = ''
    ports.forEach((port, index) => {
      const score = scoreDiagramRowAgainstPortRow(diagram, port)
      if (score > bestPortScore) {
        bestPortScore = score
        bestPortKey = port.row.key
      }
      if (score > bestDiagrams[index].score) bestDiagrams[index] = { score, key: diagram.key }
    })
    if (bestPortScore >= MIN_FLOW_DIAGRAM_SELECTION_SCORE && bestPortKey) {
      diagramRowKeyToPortRowKey.set(diagram.key, bestPortKey)
    }
  }
  ports.forEach((port, index) => {
    const best = bestDiagrams[index]
    if (best.score >= MIN_FLOW_DIAGRAM_SELECTION_SCORE && best.key) portRowKeyToDiagramRowKey.set(port.row.key, best.key)
  })
  return { diagramRowKeyToPortRowKey, portRowKeyToDiagramRowKey }
}

export const resolveStoryboardWidgetPortRowKeyForDiagramRow = (
  bridge: StoryboardWidgetDiagramSelectionBridge,
  diagramRowKey: string | null | undefined,
): string => bridge.diagramRowKeyToPortRowKey.get(String(diagramRowKey || '').trim()) || ''

export const resolveDiagramRowKeyForStoryboardWidgetPortRow = (
  bridge: StoryboardWidgetDiagramSelectionBridge,
  portRowKey: string | null | undefined,
): string => bridge.portRowKeyToDiagramRowKey.get(String(portRowKey || '').trim()) || ''
