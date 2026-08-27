import { buildVideoAgentUrlImportMarkdown } from '@/features/markdown-workspace/workspaceImport/videoAgentUrlImport'
import { formatWorkspaceImportTranscriptStatusLine } from '@/features/markdown-workspace/workspaceImport/transcriptImportText'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'

const unwrapKtvValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  if ('value' in value) return (value as { value?: unknown }).value
  return value
}

const readJsonObject = (value: unknown): Record<string, unknown> => {
  const text = String(unwrapKtvValue(value) || '')
  const parsed = JSON.parse(text)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
}

export async function testVideoAgentImportUrlKeepsTranscriptStatusOutOfCueContent() {
  const videoId = 'Fallback01Z'
  const sourceUrl = ['https://www.', 'youtube.com/watch?v=', videoId].join('')
  const rawUpstreamError = 'Error processing YouTube video: Transcript unavailable via native fetch'
  const sourceText = [
    '# YouTube Video Source',
    '',
    sourceUrl,
    '',
    formatWorkspaceImportTranscriptStatusLine(rawUpstreamError),
    '',
  ].join('\n')
  const markdown = buildVideoAgentUrlImportMarkdown({ sourceUrl, sourceText })
  const parsed = await loadGraphDataFromTextViaParser('youtube.video-agent.md', markdown, { applyToStore: false })
  const nodes = Array.isArray(parsed?.graphData?.nodes) ? parsed.graphData.nodes : []
  const sourceSpec = nodes.find(node => String(node.id || '') === 'html_video_source_spec')
  const transcriptPanel = nodes.find(node => String(node.id || '') === 'video_agent_transcript_panel')
  if (!sourceSpec || !transcriptPanel) throw new Error('expected video-agent import to parse source and transcript panel nodes')

  const sourceTranscript = readJsonObject((sourceSpec.properties || {}).sourceTranscript)
  const segments = Array.isArray(sourceTranscript.segments) ? sourceTranscript.segments : []
  if (
    sourceTranscript.source !== 'youtube-transcript-unavailable'
    || sourceTranscript.status !== 'unavailable'
    || sourceTranscript.segmentCount !== 0
    || segments.length !== 0
  ) throw new Error(`expected unavailable transcript metadata without generated cue segments, got ${JSON.stringify(sourceTranscript)}`)

  const mediaSpec = getNodeMediaSpec(transcriptPanel)
  const srcDoc = String(mediaSpec && 'srcDoc' in mediaSpec ? mediaSpec.srcDoc || '' : '')
  if (
    mediaSpec?.kind !== 'iframe'
    || !srcDoc.includes('data-kg-video-agent-transcript-empty')
    || !srcDoc.includes('kg-rich-media-panel-srcdoc-timeline-transport')
    || !srcDoc.includes('agenticgraph:render-frame')
  ) throw new Error(`expected transcript panel to render synced empty state srcdoc, got ${JSON.stringify(mediaSpec)}`)
  for (const forbidden of ['Transcript status:', rawUpstreamError, '<li data-kg-video-agent-transcript-cue']) {
    if (srcDoc.includes(forbidden)) throw new Error(`expected transcript panel srcdoc to omit status-as-cue content ${forbidden}`)
  }
}
