import { getYouTubeId } from 'grph-shared/rich-media/providers'
import { splitVideoAgentValidationUrls } from '@/features/video-agent'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'

type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch }

export function readVideoAgentValidationUrlsFromEnv(): string[] {
  const plural = String(process.env.AGENTICGRAPH_VIDEO_AGENT_TEST_URLS || '').trim()
  if (plural) return splitVideoAgentValidationUrls(plural)
  return splitVideoAgentValidationUrls(String(process.env.AGENTICGRAPH_VIDEO_AGENT_TEST_URL || '').trim())
}

export function readVideoAgentContractTestUrls(contract: Record<string, unknown>): string[] {
  const urls = Array.isArray(contract.testUrls)
    ? contract.testUrls.map(value => String(value || '').trim()).filter(Boolean)
    : []
  const single = typeof contract.testUrl === 'string' ? contract.testUrl.trim() : ''
  return Array.from(new Set([...urls, single].filter(Boolean)))
}

export function assertVideoAgentContractCoversValidationUrls(args: {
  contract: Record<string, unknown>
  expectedUrls: readonly string[]
}): void {
  const contractUrls = readVideoAgentContractTestUrls(args.contract)
  for (const expectedUrl of args.expectedUrls) {
    if (!contractUrls.includes(expectedUrl)) {
      throw new Error(`expected validation input video-agent contract to include supplied test URL ${expectedUrl}`)
    }
  }
}

export function assertVideoAgentTranscriptPanelOwnsTimelineSyncedSrcDoc(node: unknown): void {
  const properties = ((node as { properties?: unknown } | null)?.properties || {}) as Record<string, unknown>
  const mediaSpec = getNodeMediaSpec(node as Parameters<typeof getNodeMediaSpec>[0])
  const srcDoc = String(mediaSpec && 'srcDoc' in mediaSpec ? mediaSpec.srcDoc || '' : '')
  for (const token of [
    'data-kg-video-agent-transcript-panel',
    'data-kg-video-agent-transcript-cue',
    'kg-rich-media-panel-srcdoc-timeline-transport',
    'agenticgraph:render-frame',
  ]) {
    if (!srcDoc.includes(token)) throw new Error(`expected transcript Rich Media panel srcdoc token ${token}`)
  }
  if (
    mediaSpec?.kind !== 'iframe'
    || !String(properties.sourceTranscript || '').includes('Validation import parse evidence')
    || !String(properties.frameByFrameTranscript || '').includes('transcriptSegmentIndex')
  ) {
    throw new Error(`expected transcript Rich Media panel to own timeline-synced transcript srcdoc, got ${JSON.stringify(mediaSpec)}`)
  }
}

export function installVideoAgentValidationYouTubeTranscriptFetch(calls: string[]): () => void {
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const url = input instanceof URL ? input.toString() : String(input || '')
    calls.push(url)
    if (!url.startsWith('/__youtube_transcript?')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    const qs = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    const sourceUrl = qs.get('url') || ''
    const videoId = getYouTubeId(sourceUrl) || 'validation-video'
    const title = `Validation transcript ${videoId}`
    const transcript = {
      ok: true,
      title,
      video_id: videoId,
      source_url: sourceUrl,
      segment_count: 3,
      segments: [
        { text: 'Validation import source evidence.', start: 0, duration: 1 },
        { text: 'Validation import parse evidence.', start: 26, duration: 1 },
        { text: 'Validation import render evidence.', start: 52, duration: 1 },
      ],
    }
    return new Response(JSON.stringify({
      ok: true,
      name: `youtube-${videoId}.md`,
      markdown: [`# ${title}`, '', sourceUrl, '', 'Validation import source evidence.'].join('\n'),
      transcript,
      transcriptJsonText: JSON.stringify(transcript, null, 2),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return () => {
    g.fetch = previousFetch
  }
}
