import { hashText } from '@/features/parsers/hash'
import { inferCorpusMediaKind, type CorpusSourceUnit } from '@/features/queryable-corpus/corpusGraph'
import { WORKSPACE_ROOT_PATH, normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { yamlQuote } from './yaml'

export type VideoSequenceImportAsset = {
  workspacePath?: string | null
  relativePath?: string | null
  originalName: string
  sourceUrl?: string | null
  mimeHint?: string | null
  byteSize?: number | null
  durationSeconds?: number | null
  frameRate?: number | null
  displayWidth?: number | null
  displayHeight?: number | null
  importMode: CorpusSourceUnit['provenance']['importMode']
}

const VIDEO_SEQUENCE_DEFAULT_CLIP_DURATION_MINUTES = 5
const VIDEO_SEQUENCE_OVERLAY_STAGGER_MINUTES = 2
const VIDEO_SEQUENCE_DOCUMENT_SUFFIX = 'video-sequence.timeline.md'

const cleanInline = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim()

const cleanPath = (value: unknown): string => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()

const stripExtension = (name: string): string => String(name || '').replace(/\.[a-z0-9]+$/i, '').trim()

const readPositiveNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const sanitizeFilenamePart = (value: unknown): string => {
  const safe = cleanInline(value)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return safe || 'video'
}

const sanitizeMermaidLabel = (value: unknown, fallback: string): string => {
  const label = cleanInline(value)
    .replace(/[:|#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return label || fallback
}

const formatTimelineClock = (minutesRaw: number): string => {
  const minutes = Math.max(0, Math.floor(Number(minutesRaw) || 0))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

const formatSourceRangeToken = (startSecondsRaw: number, endSecondsRaw: number): string => {
  const normalize = (value: number): string => String(Math.max(0, Number(value.toFixed(3)))).replace(/\./g, '_')
  const startSeconds = Math.max(0, Number(startSecondsRaw) || 0)
  const endSeconds = Math.max(startSeconds, Number(endSecondsRaw) || startSeconds)
  return `kgsrc_${normalize(startSeconds)}_${normalize(endSeconds)}`
}

const buildClipId = (asset: VideoSequenceImportAsset, index: number): string => {
  const signature = [
    asset.workspacePath,
    asset.relativePath,
    asset.sourceUrl,
    asset.originalName,
    asset.byteSize,
    index,
  ].map(value => String(value || '')).join(':')
  return `clip_${hashText(signature).slice(0, 10)}`
}

const buildClipLaneId = (clipId: string, lane: 'video' | 'mask' | 'grade' | 'audio'): string => {
  return lane === 'video' ? clipId : `${clipId}_${lane}`
}

export function isVideoSequenceImportAsset(asset: VideoSequenceImportAsset | null | undefined): boolean {
  if (!asset) return false
  return inferCorpusMediaKind(asset.originalName || asset.relativePath || asset.sourceUrl || '', asset.mimeHint) === 'video'
}

export function buildVideoSequenceWorkspaceDocumentName(assetsRaw: ReadonlyArray<VideoSequenceImportAsset>): string {
  const assets = assetsRaw.filter(isVideoSequenceImportAsset)
  const first = assets[0] || null
  const base = first ? sanitizeFilenamePart(stripExtension(first.originalName || first.relativePath || first.sourceUrl || 'video')) : 'video'
  const prefix = assets.length > 1 ? `${base}-sequence` : base
  return `${prefix}.${VIDEO_SEQUENCE_DOCUMENT_SUFFIX}`
}

export function buildVideoSequenceTimelineImportMarkdown(assetsRaw: ReadonlyArray<VideoSequenceImportAsset>): string {
  const assets = assetsRaw.filter(isVideoSequenceImportAsset)
  const clips = assets.map((asset, index) => ({
    asset,
    clipId: buildClipId(asset, index),
    sourceDurationSeconds: readPositiveNumber(asset.durationSeconds) || VIDEO_SEQUENCE_DEFAULT_CLIP_DURATION_MINUTES * 60,
    index,
    label: sanitizeMermaidLabel(asset.originalName || asset.relativePath || asset.sourceUrl, `Video clip ${index + 1}`),
    startMinutes: index === 0 ? 0 : index * VIDEO_SEQUENCE_OVERLAY_STAGGER_MINUTES,
  })).map(clip => ({
    ...clip,
    durationMinutes: clip.sourceDurationSeconds / 60,
  }))
  const sourceLines = clips.flatMap(clip => {
    const asset = clip.asset
    const lines = [
      `  - id: ${yamlQuote(clip.clipId)}`,
      `    originalName: ${yamlQuote(cleanInline(asset.originalName) || clip.label)}`,
      `    relativePath: ${yamlQuote(cleanPath(asset.relativePath || asset.originalName || asset.sourceUrl || clip.label))}`,
      `    importMode: ${yamlQuote(asset.importMode)}`,
    ]
    const workspacePath = asset.workspacePath ? normalizeWorkspacePath(asset.workspacePath) : ''
    if (workspacePath) lines.push(`    workspacePath: ${yamlQuote(workspacePath)}`)
    const sourceUrl = cleanInline(asset.sourceUrl)
    if (sourceUrl) lines.push(`    sourceUrl: ${yamlQuote(sourceUrl)}`)
    const mimeHint = cleanInline(asset.mimeHint)
    if (mimeHint) lines.push(`    mimeHint: ${yamlQuote(mimeHint)}`)
    const byteSize = Number(asset.byteSize)
    if (Number.isFinite(byteSize) && byteSize >= 0) lines.push(`    byteSize: ${Math.floor(byteSize)}`)
    const durationSeconds = readPositiveNumber(asset.durationSeconds)
    if (durationSeconds > 0) lines.push(`    durationSeconds: ${durationSeconds}`)
    const frameRate = readPositiveNumber(asset.frameRate)
    if (frameRate > 0) lines.push(`    frameRate: ${frameRate}`)
    const displayWidth = readPositiveNumber(asset.displayWidth)
    const displayHeight = readPositiveNumber(asset.displayHeight)
    if (displayWidth > 0 && displayHeight > 0) {
      lines.push(`    displayWidth: ${Math.round(displayWidth)}`)
      lines.push(`    displayHeight: ${Math.round(displayHeight)}`)
    }
    return lines
  })
  const sourceYaml = sourceLines.length > 0 ? ['kgVideoSequenceSources:', ...sourceLines] : []
  const ganttLines = [
    'gantt',
    '  title Video Sequence',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Video',
    ...clips.map(clip => `  ${clip.label} : ${buildClipLaneId(clip.clipId, 'video')}, ${formatSourceRangeToken(0, clip.sourceDurationSeconds)}, ${formatTimelineClock(clip.startMinutes)}, ${clip.durationMinutes}m`),
    '  section Audio',
    ...clips.map(clip => `  ${clip.label} audio : ${buildClipLaneId(clip.clipId, 'audio')}, ${formatSourceRangeToken(0, clip.sourceDurationSeconds)}, ${formatTimelineClock(clip.startMinutes)}, ${clip.durationMinutes}m`),
  ]
  const clipTableLines = serializeMarkdownPipeTable({
    columns: ['Clip', 'Source', 'Mode'],
    rows: clips.map(clip => [
      clip.label,
      cleanPath(clip.asset.relativePath || clip.asset.sourceUrl || clip.asset.originalName) || clip.label,
      clip.asset.importMode,
    ]),
  })
  return [
    '---',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "media"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgVideoSequenceTimeline: true',
    `kgVideoSequenceImportSourceCount: ${clips.length}`,
    ...sourceYaml,
    'flow_diagrams:',
    '  video_sequence:',
    '    key: video_sequence',
    '    type: mermaid_gantt',
    '    value: |-',
    ...ganttLines.map(line => `      ${line}`),
    '---',
    '',
    '# Video Sequence Timeline',
    '',
    ...clipTableLines,
    '',
  ].join('\n')
}

export async function materializeVideoSequenceTimelineImportDocument(args: {
  fs: WorkspaceFs
  parentPath?: WorkspacePath | null
  assets: ReadonlyArray<VideoSequenceImportAsset>
}): Promise<WorkspacePath | null> {
  const assets = args.assets.filter(isVideoSequenceImportAsset)
  if (assets.length === 0) return null
  const text = buildVideoSequenceTimelineImportMarkdown(assets)
  const createdPath = await args.fs.createFile({
    parentPath: args.parentPath || WORKSPACE_ROOT_PATH,
    name: buildVideoSequenceWorkspaceDocumentName(assets),
    text,
  })
  return normalizeWorkspacePath(createdPath)
}
