import { UI_COPY } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { applyLoaderResultToParserUi } from '@/features/toolbar/importUi'
import { unwrapUserProvidedText } from '@/lib/url'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { slugify } from '@/features/parsers/markdownJsonLd'
import { runImportFlow } from '@/features/toolbar/importFlow'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { ensureMarkdownFileName, upsertWorkspaceTextDocument } from '@/features/workspace-fs/upsertWorkspaceTextDocument'
import { fetchYouTubeTranscriptMarkdown } from '@/features/transcription/youtubeTranscriptMarkdown'

export type YouTubeImportType = 'url'

function splitTranscriptMarkdown(markdown: string): { header: string; body: string } {
  const md = String(markdown || '')
  const lines = md.split('\n')
  if (
    lines.length >= 5 &&
    lines[0]?.startsWith('# ') &&
    String(lines[2] || '').startsWith('Video ID:') &&
    String(lines[3] || '').startsWith('Source:')
  ) {
    let headerEnd = 4
    const maybeImageLine = String(lines[headerEnd] || '').trim()
    if (maybeImageLine.startsWith('[![') || maybeImageLine.startsWith('![')) headerEnd += 1
    if (String(lines[headerEnd] || '').trim() === '') headerEnd += 1
    return { header: lines.slice(0, headerEnd).join('\n'), body: lines.slice(headerEnd).join('\n') }
  }
  const idx = md.indexOf('\n\n')
  if (idx >= 0) return { header: md.slice(0, idx + 2), body: md.slice(idx + 2) }
  return { header: md, body: '' }
}

async function maybeEnhanceYouTubeTranscriptMarkdown(args: {
  transcript: Record<string, JSONValue> | null
  fallbackMarkdown: string
}): Promise<string> {
  const tr = args.transcript
  if (!tr) return args.fallbackMarkdown
  const segments = tr.segments
  if (!Array.isArray(segments) || segments.length === 0) return args.fallbackMarkdown
  if (segments.length > 200) return args.fallbackMarkdown
  const sourceText = segments
    .map((s) => (s && typeof s === 'object' && 'text' in s ? String((s as { text?: unknown }).text || '').trim() : ''))
    .filter(Boolean)
    .join('\n')
  if (!sourceText.trim() || sourceText.length > 50_000) return args.fallbackMarkdown

  const state = useGraphStore.getState() as unknown as {
    chatEndpointUrl?: string | null
    chatModel?: string | null
    chatTemperature?: number
    chatSystemPrompt?: string | null
  }
  const endpoint = typeof state.chatEndpointUrl === 'string' ? state.chatEndpointUrl.trim() : ''
  const model = typeof state.chatModel === 'string' ? state.chatModel.trim() : ''
  if (!endpoint || !model) return args.fallbackMarkdown

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12_000)
  try {
    const systemPrompt = typeof state.chatSystemPrompt === 'string' && state.chatSystemPrompt.trim() ? state.chatSystemPrompt.trim() : ''
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: Number.isFinite(state.chatTemperature) ? Math.max(0, Math.min(2, state.chatTemperature || 0)) : 0.3,
        stream: false,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          {
            role: 'system',
            content:
              'Rewrite the transcript into natural paragraphs. Preserve all content and ordering. Return only the rewritten transcript text.',
          },
          { role: 'user', content: sourceText },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) return args.fallbackMarkdown
    const json = (await res.json()) as unknown
    const content = (() => {
      if (!json || typeof json !== 'object') return ''
      const choices = (json as { choices?: unknown }).choices
      if (!Array.isArray(choices) || choices.length === 0) return ''
      const first = choices[0] as { message?: unknown; text?: unknown } | null
      if (first && typeof first === 'object') {
        const msg = first.message as { content?: unknown } | null
        if (msg && typeof msg === 'object' && typeof msg.content === 'string') return msg.content
        if (typeof first.text === 'string') return first.text
      }
      return ''
    })()
    const enhancedBody = String(content || '').trim()
    if (!enhancedBody) return args.fallbackMarkdown
    const parts = splitTranscriptMarkdown(args.fallbackMarkdown)
    return `${parts.header}\n${enhancedBody}\n`
  } catch {
    return args.fallbackMarkdown
  } finally {
    clearTimeout(timeoutId)
  }
}

function buildYouTubeTranscriptGraphData(transcript: Record<string, JSONValue>): GraphData {
  const videoId = typeof transcript.video_id === 'string' ? transcript.video_id.trim() : ''
  const sourceUrl = typeof transcript.source_url === 'string' ? transcript.source_url.trim() : ''
  const title = typeof transcript.title === 'string' ? transcript.title.trim() : ''
  const thumbnail_url = typeof transcript.thumbnail_url === 'string' ? transcript.thumbnail_url.trim() : ''
  const scalarKeys = [
    'type',
    'title',
    'video_id',
    'source_url',
    'requested_language_code',
    'requested_language',
    'selected_language_code',
    'selected_language',
    'is_generated',
    'is_translatable',
    'start_s',
    'end_s',
    'duration_s',
    'segment_count',
    'generated_at_ms',
  ]
  const transcriptProperties: Record<string, JSONValue> = {}
  for (let i = 0; i < scalarKeys.length; i += 1) {
    const key = scalarKeys[i]!
    const value = transcript[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      transcriptProperties[key] = value
    }
  }
  const segments = Array.isArray(transcript.segments) ? transcript.segments : []
  if (segments.length > 0 && typeof transcriptProperties.segment_count !== 'number') {
    transcriptProperties.segment_count = segments.length as unknown as JSONValue
  }
  const translationLanguages = Array.isArray(transcript.translation_languages) ? transcript.translation_languages : []
  transcriptProperties.translation_language_count = translationLanguages.length as unknown as JSONValue

  const id = (() => {
    if (videoId) return `youtube:${videoId}`
    if (sourceUrl) return `youtube:${slugify(sourceUrl)}`
    return `youtube:${slugify(JSON.stringify(transcript).slice(0, 2000))}`
  })()

  const node: GraphNode = {
    id,
    label: title || (videoId ? `YouTube Transcript: ${videoId}` : 'YouTube Transcript'),
    type: 'YouTubeTranscript',
    properties: {
      ...transcriptProperties,
      image: thumbnail_url || undefined,
      imageUrl: thumbnail_url || undefined,
    },
  }

  return {
    type: 'application/vnd.agenticgraph.graph+json',
    nodes: [node],
    edges: [],
    metadata: {
      sourceDocument: {
        type: 'rag:YouTubeTranscript',
        video_id: videoId,
        source_url: sourceUrl,
      },
    },
  }
}

export async function performYouTubeImport(type: YouTubeImportType, providedUrlOrId?: string, lang?: string) {
  if (type !== 'url') return
  const raw = typeof providedUrlOrId === 'string' ? providedUrlOrId.trim() : ''
  if (!raw) return
  const cleaned = unwrapUserProvidedText(raw) || raw
  if (!cleaned) return

  try {
    const normalizedLang = typeof lang === 'string' ? lang.trim() : ''
    const converted = await fetchYouTubeTranscriptMarkdown({ url: cleaned, lang: normalizedLang || undefined })
    if (!converted) {
      applyLoaderResultToParserUi(null, { failureLabelOverride: UI_COPY.youtubeImportFetchFailedStatus(cleaned) })
      return
    }
    if ('error' in converted) {
      applyLoaderResultToParserUi(null, { failureLabelOverride: UI_COPY.youtubeImportConvertFailedStatusWithError(converted.error) })
      return
    }

    const markdownForEditors = await maybeEnhanceYouTubeTranscriptMarkdown({
      transcript: converted.transcript,
      fallbackMarkdown: converted.markdown,
    })

    const state = useGraphStore.getState()
    const markdownName = ensureMarkdownFileName(converted.displayName)
    state.setWorkspaceViewMode('editor')
    await state.setActiveMarkdownDocument({
      name: markdownName,
      text: markdownForEditors,
      normalizeMermaidMmd: false,
      sourceUrl: converted.sourceUrl,
      jsonSourceText: null,
      recent: { name: markdownName, url: converted.sourceUrl, type: 'markdown' },
    })

    void (async () => {
      try {
        const fs = await getWorkspaceFs()
        await fs.ensureSeed()
        const state = useGraphStore.getState()
        const outputDir = state.youtubeTranscriptOutputDir && state.youtubeTranscriptOutputDir.trim()
          ? state.youtubeTranscriptOutputDir.trim()
          : WORKSPACE_ROOT_PATH
        
        const format = state.youtubeTranscriptOutputFormat || 'markdown'

        if (format === 'json') {
           const jsonNameForEditors = `${converted.displayName.replace(/\.(md|markdown)$/i, '') || converted.displayName}.json`
           const jsonContent = converted.transcriptJsonText || '{}'
           const path = await upsertWorkspaceTextDocument({
             fs,
             parentPath: outputDir,
             name: jsonNameForEditors,
             text: jsonContent,
           })
           setWorkspaceEntrySource(path, { kind: 'url', url: converted.sourceUrl })
           useMarkdownExplorerStore.getState().setActivePath(path)
        } else {
           // Markdown (default)
           const path = await upsertWorkspaceTextDocument({
             fs,
             parentPath: outputDir,
             name: markdownName,
             text: markdownForEditors,
           })
           setWorkspaceEntrySource(path, { kind: 'url', url: converted.sourceUrl })
           useMarkdownExplorerStore.getState().setActivePath(path)
        }
      } catch {
        void 0
      }
    })()
    const jsonNameForEditors = `${converted.displayName.replace(/\.(md|markdown)$/i, '') || converted.displayName}.json`
    state.setJsonSourceDocument(jsonNameForEditors, converted.transcriptJsonText)

    const parseTarget = (() => {
      if (converted.transcript) {
        const graphData = buildYouTubeTranscriptGraphData(converted.transcript)
        const jsonText = JSON.stringify(graphData, null, 2)
        const base = converted.displayName.replace(/\.(md|markdown)$/i, '') || converted.displayName
        return { nameForParse: `${base}.json`, textForParse: jsonText }
      }
      return { nameForParse: converted.displayName, textForParse: converted.markdown }
    })()

    await runImportFlow({
      ...parseTarget,
      openWorkspaceViewMode: 'editor',
      onSuccess: (res) => {
        if (!res.input) return
      },
    })
  } catch (error) {
    const msg =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : String(error || '')
    applyLoaderResultToParserUi(null, { failureLabelOverride: UI_COPY.youtubeImportConvertFailedStatusWithError(msg.trim() ? msg.trim() : UI_COPY.parserDataLoadFailed) })
  }
}
