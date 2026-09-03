import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from '@/features/panels/views/byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from '@/features/panels/views/settingsRowAnchor'

export const VIDEODB_API_DOC_AREA = 'VideoDB API'
export const VIDEODB_BASE_URL = 'https://api.videodb.io'
export const VIDEODB_API_DOCS_URL = 'https://docs.videodb.io/api-reference/introduction.md'

type VideodbDocRow = {
  key: string
  typeLabel: string
  value: string
  responsibility: string
  notes?: string
  options?: readonly string[]
  tooltipDefaultValue?: string | number | boolean | null
  tooltipMin?: string | number
  tooltipMax?: string | number
  tooltipInterval?: string | number
  searchHints?: string[]
}

const endpoint = (key: string, value: string, responsibility: string, notes?: string): VideodbDocRow => ({
  key,
  typeLabel: 'endpoint',
  value,
  responsibility,
  notes,
  searchHints: [value, key],
})

const config = (row: VideodbDocRow): VideodbDocRow => row

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

const toRowClasses = (row: VideodbDocRow): string[] => {
  if (row.key === 'api_key' || row.key === 'base_url' || row.key === 'docs_url') {
    return ['VideodbAuthRow']
  }
  return ['VideodbEndpointRow']
}

export function getVideodbApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('videodb-api-row', rowKey)
}

export const VIDEODB_DOC_ROWS: ReadonlyArray<VideodbDocRow> = [
  endpoint('ai.dub_video', 'POST /video/{id}/generate/dub', 'AI dubbing dispatcher -> submit an asynchronous dub operation -> poll for dubbed asset output.'),
  endpoint('ai.generate_audio', 'POST /video/{id}/generate/audio', 'AI audio generator -> submit an asynchronous audio generation job -> poll for generated audio output.'),
  endpoint('ai.generate_image', 'POST /video/{id}/generate/image', 'AI image generator -> submit an asynchronous image generation job -> poll for generated image output.'),
  endpoint('ai.generate_text', 'POST /video/{id}/generate/text', 'AI text generator -> submit an asynchronous text generation job -> poll for captions or summaries.'),
  endpoint('ai.generate_video', 'POST /video/{id}/generate/video', 'AI video generator -> submit an asynchronous video generation job -> poll for generated video output.'),
  endpoint('ai.translate_video', 'POST /video/{id}/generate/translation', 'AI translation dispatcher -> submit an asynchronous translation job -> poll for translated video output.'),
  config({
    key: 'api_key',
    typeLabel: 'string',
    value: 'VIDEODB_API_KEY',
    responsibility: 'Server-managed API key variable -> identify the env name used by the server integration proxy -> authorize VideoDB API requests without browser-stored secrets.',
    notes: 'Server Managed Key only. Required for live calls at runtime. Never hardcode the actual VIDEODB_API_KEY value; it must stay in the host/server environment and must never be persisted in browser storage.',
    tooltipDefaultValue: 'VIDEODB_API_KEY',
    searchHints: ['x-access-token api key credential server managed env never hardcode VIDEODB_API_KEY'],
  }),
  endpoint('asset.list', 'GET /asset', 'Asset lister -> retrieve available media assets -> expose asset inventory for timeline and generation operations.'),
  endpoint('async_response.get', 'GET /async-response/{id}', 'Shared async poller -> poll upload, transcription, index, generation, download, timeline, or RTStream jobs -> stop at terminal status.', 'Maximum 60 upstream polls; agentic-graph circuit-breaker is 36 iterations at 10-second intervals.'),
  config({
    key: 'base_url',
    typeLabel: 'url',
    value: VIDEODB_BASE_URL,
    responsibility: 'Base URL anchor -> pin VideoDB API host -> keep direct and proxied calls on one upstream origin.',
    tooltipDefaultValue: VIDEODB_BASE_URL,
    searchHints: ['base url api.videodb.io'],
  }),
  endpoint('chat', 'POST /chat', 'Conversational query dispatcher -> send grounded video questions -> retrieve VideoDB chat responses.'),
  endpoint('collection.create', 'POST /collection', 'Collection creator -> create a media collection -> group videos, audios, and images for VideoDB workflows.'),
  endpoint('collection.delete', 'DELETE /collection/{id}', 'Collection deleter -> remove an operator-selected collection -> release associated media and metadata.'),
  endpoint('collection.get', 'GET /collection/{id}', 'Collection reader -> retrieve collection metadata -> inspect one operator-selected collection.'),
  endpoint('collection.list', 'GET /collection', 'Collection lister -> enumerate account collections -> choose a runtime collection for upload and search.'),
  endpoint('collection.search', 'GET /collection/{id}/search', 'Collection search runner -> query across collection videos -> retrieve matched transcript or scene segments.'),
  endpoint('collection.upload', 'POST /collection/{id}/upload', 'Async video uploader -> submit an upload job -> poll GET /async-response/{id} for the created video id.'),
  config({
    key: 'docs_url',
    typeLabel: 'url',
    value: VIDEODB_API_DOCS_URL,
    responsibility: 'Reference locator -> open official VideoDB API docs -> keep operator interpretation anchored to upstream docs.',
    tooltipDefaultValue: VIDEODB_API_DOCS_URL,
    searchHints: ['docs url reference'],
  }),
  endpoint('download.create', 'POST /download', 'Async download creator -> submit a media download job -> poll for the resulting download URL.'),
  endpoint('download.get', 'GET /download/{id}', 'Download reader -> retrieve download status and result URL -> confirm asset retrieval completion.'),
  endpoint('editor.compile', 'POST /editor/timeline/compile', 'Editor timeline compiler -> compile timeline definition -> return a playable assembled stream.'),
  endpoint('health', 'GET /health', 'Readiness probe -> check VideoDB service availability -> gate live calls in MainPanel Integrations.'),
  endpoint('index.scene', 'POST /video/{id}/index/scene/', 'Async scene indexer -> create a visual scene index -> unlock scene search after polling completion.'),
  config({
    key: 'index.scene.scene_type',
    typeLabel: 'enum',
    value: 'shot | time_based',
    responsibility: 'Scene segmentation selector -> choose shot or time-based indexing -> control scene search granularity.',
    options: ['shot', 'time_based'],
    tooltipDefaultValue: 'shot',
    searchHints: ['scene type shot time_based'],
  }),
  endpoint('index.spoken_word', 'POST /video/{id}/index/', 'Async spoken-word indexer -> create transcript index -> unlock semantic and keyword spoken-word search.'),
  endpoint('rtstream.create', 'POST /rtstream', 'RTStream creator -> create a real-time stream session -> provision live ingest.'),
  endpoint('rtstream.export', 'POST /rtstream/{id}/export', 'RTStream exporter -> export a completed live stream -> create a persistent searchable asset.'),
  endpoint('rtstream.start', 'POST /rtstream/{id}/status', 'RTStream start controller -> begin live ingestion -> start the streaming pipeline.'),
  endpoint('rtstream.stop', 'POST /rtstream/{id}/status', 'RTStream stop controller -> halt live ingestion -> finalize the streaming session.'),
  endpoint('timeline.compile', 'POST /timeline/compile', 'Timeline compiler -> assemble search-result clips -> return a compiled stream after success.'),
  endpoint('timeline.create', 'POST /timeline', 'Timeline creator -> create a clip sequence container -> prepare programmatic video composition.'),
  endpoint('transcode', 'POST /transcode', 'Transcode dispatcher -> submit media conversion -> produce alternate encoded output.'),
  endpoint('transcription.create', 'POST /video/{id}/transcription', 'Async transcription creator -> submit speech-to-text job -> poll for transcript completion.'),
  endpoint('transcription.get', 'GET /video/{id}/transcription', 'Transcription reader -> retrieve completed transcript -> expose spoken-word text after polling.'),
  endpoint('video.delete', 'DELETE /video/{id}', 'Video deleter -> remove operator-selected video -> release media and associated metadata.'),
  endpoint('video.get', 'GET /video/{id}', 'Video reader -> retrieve video metadata -> inspect one uploaded asset.'),
  endpoint('video.list', 'GET /collection/{id}/video', 'Video lister -> enumerate videos in a collection -> choose an asset for indexing and search.'),
  endpoint('video.search', 'POST /video/{id}/search/', 'Video search runner -> query spoken-word or scene index -> retrieve matched segments.'),
  config({
    key: 'video.character_clips',
    typeLabel: 'sdk',
    value: 'video.generate_stream(timeline=subject_timeline_ranges)',
    responsibility: 'Character or subject clip stream generator -> pass approved timeline ranges into VideoDB generate_stream -> return per-subject playable clips for Strybldr review.',
    notes: 'Timeline ranges come from imported metadata, search results, or operator-approved Strybldr cards. agentic-graph must not fabricate clip stream URLs before a live VideoDB response.',
    searchHints: ['character clips subject clips generate_stream timeline video rag'],
  }),
  config({
    key: 'video.character_clips.schema',
    typeLabel: 'object',
    value: '{"subjects":{"subject_key":{"timeline":[[0,0]],"clip":""}}}',
    responsibility: 'Character clip packet schema -> store subject timeline ranges and returned clip URL -> keep review and publish packets structurally aligned.',
    notes: 'The clip field stays blank until VideoDB returns a live generated stream.',
    searchHints: ['persons_data subjects timeline clip schema'],
  }),
  config({
    key: 'video.search.index_type',
    typeLabel: 'enum',
    value: 'spoken_word | scene',
    responsibility: 'Index-type selector -> choose transcript or scene search -> route queries to the created index.',
    options: ['spoken_word', 'scene'],
    tooltipDefaultValue: 'spoken_word',
  }),
  config({
    key: 'video.search.query',
    typeLabel: 'string',
    value: '',
    responsibility: 'Query supplier -> provide search text -> steer VideoDB retrieval over the selected index.',
    tooltipDefaultValue: '',
    tooltipMax: 500,
  }),
  config({
    key: 'video.search.result_threshold',
    typeLabel: 'integer',
    value: '5',
    responsibility: 'Result cap -> bound returned matches -> control result volume.',
    tooltipDefaultValue: 5,
    tooltipMin: 1,
    tooltipMax: 100,
    tooltipInterval: 1,
  }),
  config({
    key: 'video.search.score_threshold',
    typeLabel: 'number',
    value: '0.5',
    responsibility: 'Score filter -> reject low-confidence matches -> tune precision and recall.',
    tooltipDefaultValue: 0.5,
    tooltipMin: 0,
    tooltipMax: 1,
    tooltipInterval: 0.1,
  }),
  config({
    key: 'video.search.search_type',
    typeLabel: 'enum',
    value: 'semantic | keyword',
    responsibility: 'Search-mode selector -> choose semantic or keyword retrieval -> control matching strategy.',
    options: ['semantic', 'keyword'],
    tooltipDefaultValue: 'semantic',
  }),
  config({
    key: 'video.search.stitch',
    typeLabel: 'boolean',
    value: 'false',
    responsibility: 'Clip stitch toggle -> request stitched search output -> switch between raw segments and playable compilation.',
    tooltipDefaultValue: false,
  }),
  endpoint('video.stream', 'POST /video/{id}/stream/', 'Stream URL resolver -> request playable video URL -> return non-empty http:// or https:// stream output.'),
  config({
    key: 'video.stream.format',
    typeLabel: 'enum',
    value: 'mp4 | webm | hls',
    responsibility: 'Stream format selector -> choose output container -> match browser playback needs.',
    options: ['mp4', 'webm', 'hls'],
    tooltipDefaultValue: 'mp4',
  }),
  config({
    key: 'video.stream.quality',
    typeLabel: 'enum',
    value: 'low | medium | high',
    responsibility: 'Stream quality selector -> choose bitrate/resolution preset -> balance fidelity and bandwidth.',
    options: ['low', 'medium', 'high'],
    tooltipDefaultValue: 'medium',
  }),
  endpoint('video.update', 'PUT /video/{id}', 'Video updater -> modify video metadata -> keep title and description current.'),
]

export const VIDEODB_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> = VIDEODB_DOC_ROWS.map(row => ({
  meta: {
    key: `videodb.${row.key}`,
    type: toBaseType(row.typeLabel),
    source: 'backendEnv',
    options: row.options ? [...row.options] : undefined,
    read: () => row.value,
  },
  value: row.value,
  typeLabel: row.typeLabel,
  tooltipRole: 'VideoDB API',
  tooltipDefaultValue: row.tooltipDefaultValue,
  tooltipMin: row.tooltipMin,
  tooltipMax: row.tooltipMax,
  tooltipInterval: row.tooltipInterval,
  searchHints: ['videodb video database upload index search stream', row.key, ...(row.searchHints || [])],
  details: {
    area: VIDEODB_API_DOC_AREA,
    responsibility: row.responsibility,
    notes: row.notes || '',
    modules: ['canvas/src/features/integrations/videodbSsot.ts', 'canvas/src/features/panels/views/SettingsView.tsx'],
    classes: toRowClasses(row),
    functions: ['MainPanel Integrations'],
  } satisfies FlowDetails,
}))
