import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from '@/features/panels/views/byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from '@/features/panels/views/settingsRowAnchor'

export const SENSENOVA_API_DOC_AREA = 'SenseNova API'
export const SENSENOVA_PROVIDER_ID = 'sensenova'
export const SENSENOVA_PROVIDER_LABEL = 'SenseNova AI API'
export const SENSENOVA_BASE_URL = 'https://api.sensenova.cn'
export const SENSENOVA_PLATFORM_URL = 'https://platform.sensenova.cn'
export const SENSENOVA_CHAT_COMPLETIONS_PATH = '/v1/llm/chat-completions'
export const SENSENOVA_IMAGE_GENERATION_PATH = '/v1/images/generations'
export const SENSENOVA_VIDEO_GENERATION_PATH = '/v1/video/generations'
export const SENSENOVA_API_KEY_ENV = 'SENSENOVA_API_KEY'
export const SENSENOVA_POLL_MAX_ITERATIONS = 36
export const SENSENOVA_POLL_INTERVAL_MS = 10000

type SensenovaDocRow = {
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

const row = (item: SensenovaDocRow): SensenovaDocRow => item

const endpoint = (key: string, value: string, responsibility: string, notes?: string): SensenovaDocRow => ({
  key,
  typeLabel: 'endpoint',
  value,
  responsibility,
  notes,
  searchHints: [key, value],
})

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

const toRowClasses = (item: SensenovaDocRow): string[] => {
  if (item.key.startsWith('credential.') || item.key === 'base_url' || item.key === 'platform_url') {
    return ['SensenovaAuthRow']
  }
  if (item.key.startsWith('text.')) return ['SensenovaTextRow']
  if (item.key.startsWith('image.')) return ['SensenovaImageRow']
  if (item.key.startsWith('video.')) return ['SensenovaVideoRow']
  return ['SensenovaPipelineRow']
}

export function getSensenovaApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('sensenova-api-row', rowKey)
}

export const SENSENOVA_DOC_ROWS: ReadonlyArray<SensenovaDocRow> = [
  row({
    key: 'provider_id',
    typeLabel: 'string',
    value: SENSENOVA_PROVIDER_ID,
    responsibility: 'Provider namespace -> group SenseNova text, image, and video rows -> prevent mixed-provider setting drift.',
    tooltipDefaultValue: SENSENOVA_PROVIDER_ID,
    searchHints: ['provider sensenova SenseTime'],
  }),
  row({
    key: 'base_url',
    typeLabel: 'url',
    value: SENSENOVA_BASE_URL,
    responsibility: 'Base URL anchor -> pin SenseNova API calls -> keep all modalities on one upstream origin.',
    tooltipDefaultValue: SENSENOVA_BASE_URL,
    searchHints: ['base url api.sensenova.cn'],
  }),
  row({
    key: 'platform_url',
    typeLabel: 'url',
    value: SENSENOVA_PLATFORM_URL,
    responsibility: 'Operator reference -> open SenseNova platform console -> keep setup anchored to upstream account tooling.',
    tooltipDefaultValue: SENSENOVA_PLATFORM_URL,
    searchHints: ['platform console docs'],
  }),
  row({
    key: 'credential.api_key_env',
    typeLabel: 'env',
    value: SENSENOVA_API_KEY_ENV,
    responsibility: 'Server-managed API key variable -> identify the env name used by the server integration proxy -> keep raw SenseNova keys out of browser storage.',
    notes: 'Server Managed Key only. The actual value must stay in the host/server environment and must never be persisted in localStorage, markdown, tests, fixtures, or source.',
    tooltipDefaultValue: SENSENOVA_API_KEY_ENV,
    searchHints: ['credential env api key server managed host only'],
  }),
  row({
    key: 'auth.method',
    typeLabel: 'string',
    value: 'HMAC-SHA256 signed JWT',
    responsibility: 'Auth boundary -> derive Authorization bearer token at request time -> avoid treating SenseNova as a simple static API key.',
    notes: 'The MainPanel surface renders auth requirements only; raw signing keys remain outside browser state.',
    tooltipDefaultValue: 'HMAC-SHA256 signed JWT',
    searchHints: ['jwt hmac sha256 bearer signed token'],
  }),
  endpoint('text.chat_completions', `POST ${SENSENOVA_CHAT_COMPLETIONS_PATH}`, 'Text generator -> stream SenseNova chat completions -> reuse FloatingPanel Chat SSE and AGENTIC_OS validation path.'),
  row({
    key: 'text.default_model',
    typeLabel: 'enum',
    value: 'SenseChat-5',
    responsibility: 'Default text model -> seed text generation requests -> keep Strybldr text stage deterministic until operator changes it.',
    options: ['SenseChat-5', 'SenseChat-Turbo', 'SenseChat-Vision-5', 'nova-ptc-xl-v1', 'nova-ptc-s-v2'],
    tooltipDefaultValue: 'SenseChat-5',
    searchHints: ['SenseChat text model'],
  }),
  row({
    key: 'text.stream_supported',
    typeLabel: 'boolean',
    value: 'true',
    responsibility: 'Streaming capability flag -> route text output through shared SSE parser -> avoid new downstream streaming code.',
    tooltipDefaultValue: true,
    searchHints: ['SSE text/event-stream'],
  }),
  endpoint('image.generations', `POST ${SENSENOVA_IMAGE_GENERATION_PATH}`, 'Image generator -> return image URL or base64 synchronously -> feed Rich Media Panel image tab and Strybldr image stage.'),
  row({
    key: 'image.default_model',
    typeLabel: 'enum',
    value: 'artist-xl',
    responsibility: 'Default image model -> seed image generation requests -> feed approved Strybldr visual cards.',
    options: ['artist-xl', 'senseNova-img-enhance'],
    tooltipDefaultValue: 'artist-xl',
    searchHints: ['artist-xl image model'],
  }),
  endpoint('video.generations', `POST ${SENSENOVA_VIDEO_GENERATION_PATH}`, 'Video generator -> submit async video job -> poll boundedly -> feed VideoDB upload/index/search/stream pipeline.'),
  row({
    key: 'video.default_model',
    typeLabel: 'enum',
    value: 'SenseAnim',
    responsibility: 'Default video model -> seed video generation requests -> produce the video URL for VideoDB handoff.',
    options: ['SenseAnim', 'SenseAnim-Pro'],
    tooltipDefaultValue: 'SenseAnim',
    searchHints: ['SenseAnim video model'],
  }),
  row({
    key: 'video.async.circuit_breaker',
    typeLabel: 'string',
    value: `${SENSENOVA_POLL_MAX_ITERATIONS} x ${SENSENOVA_POLL_INTERVAL_MS}ms`,
    responsibility: 'Async polling bound -> prevent unbounded video generation waits -> align with VideoDB MCP/API circuit-breaker style.',
    tooltipDefaultValue: `${SENSENOVA_POLL_MAX_ITERATIONS} x ${SENSENOVA_POLL_INTERVAL_MS}ms`,
    searchHints: ['36 x 10000ms async poll video'],
  }),
  row({
    key: 'pipeline.publish_packet_schema',
    typeLabel: 'json',
    value: '["text_output","imageUrl","videoUrl","videodb_stream_url","approval_state"]',
    responsibility: 'Strybldr E2E packet schema -> join SenseNova outputs and VideoDB stream review -> write local publish packet only.',
    notes: 'All runtime output fields remain blank until returned by an operator-approved live run.',
    searchHints: ['Strybldr publish packet text image video videodb stream'],
  }),
  row({
    key: 'pipeline.video_to_videodb',
    typeLabel: 'string',
    value: 'SenseNova videoUrl -> VideoDB upload_video -> index_spoken_word -> search_video -> stream_video',
    responsibility: 'Cross-provider handoff -> send the approved generated video into VideoDB review -> keep REST and MCP paths convergent.',
    notes: 'No upload job id, VideoDB video id, transcript text, or stream URL is fabricated in docs, tests, or runtime defaults.',
    searchHints: ['VideoDB upload index search stream generated video'],
  }),
]

export const SENSENOVA_API_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> = SENSENOVA_DOC_ROWS.map(item => ({
  meta: {
    key: `sensenova.${item.key}`,
    type: toBaseType(item.typeLabel),
    source: 'backendEnv',
    options: item.options ? [...item.options] : undefined,
    read: () => item.value,
  },
  value: item.value,
  typeLabel: item.typeLabel,
  tooltipRole: SENSENOVA_API_DOC_AREA,
  tooltipDefaultValue: item.tooltipDefaultValue,
  tooltipMin: item.tooltipMin,
  tooltipMax: item.tooltipMax,
  tooltipInterval: item.tooltipInterval,
  searchHints: ['sensenova sensetime text image video ai api', item.key, ...(item.searchHints || [])],
  details: {
    area: SENSENOVA_API_DOC_AREA,
    responsibility: item.responsibility,
    notes: item.notes || '',
    modules: ['canvas/src/features/integrations/sensenovaSsot.ts', 'canvas/src/features/panels/views/SettingsView.tsx'],
    classes: toRowClasses(item),
    functions: ['MainPanel Integrations'],
  } satisfies FlowDetails,
}))
