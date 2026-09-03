import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { WidgetRegistryField } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { CHAT_GEMINI_VIDEO_MODEL_DEFAULT } from '@/lib/chatEndpoint'

export type GeminiVideoApiDocRow = {
  key: string
  typeLabel: string
  value: string
  responsibility: string
  keyDescription: string
  valueDescription: string
  ssot: string
  module: string[]
  className: string[]
  functionName: string[]
  valueKey?: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
  tooltipMin?: string | number
  tooltipMax?: string | number
  tooltipInterval?: string | number
  tooltipExpansionNote?: string
  tooltipContractionNote?: string
  tooltipImpact?: string
}

export type GeminiVideoVirtualSettingsEntry = {
  meta: {
    key: string
    type: SettingMeta['type']
    source: 'backendEnv'
    read: () => string
  }
  value: string
  valueKey?: string
  typeLabel: string
  tooltipRole?: string
  tooltipActions?: string[]
  tooltipDefaultValue?: string | number | boolean | null
  tooltipMin?: string | number
  tooltipMax?: string | number
  tooltipInterval?: string | number
  tooltipExpansionNote?: string
  tooltipContractionNote?: string
  tooltipImpact?: string
  searchHints?: string[]
  details: FlowDetails
}

export const GEMINI_VIDEO_GENERATION_API_DOC_AREA = 'Gemini Veo Video Generation API'
export const GEMINI_VIDEO_GENERATION_API_DOCS_URL = 'https://ai.google.dev/gemini-api/docs/video'
const GEMINI_VIDEO_TOOLTIP_ROLE = 'Gemini Veo Video Generation API'

export function getGeminiVideoGenerationApiRowAnchorId(rowKey: string): string {
  const normalized = String(rowKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `gemini-video-generation-api-row-${normalized || 'entry'}`
}

export const GEMINI_VIDEO_GENERATION_MAPPED_VALUE_KEYS = [
  'geminiVideoModel',
  'geminiVideoAspectRatio',
  'geminiVideoResolution',
  'geminiVideoDurationSeconds',
  'geminiVideoPersonGeneration',
] as const

export const GEMINI_VIDEO_KEY_ACTIONS_BY_VALUE_KEY: Readonly<Record<string, string[]>> = {
  geminiVideoModel: ['select video model', 'pin video default'],
  geminiVideoAspectRatio: ['select aspect ratio', 'pin frame geometry'],
  geminiVideoResolution: ['select resolution', 'pin output clarity'],
  geminiVideoDurationSeconds: ['set duration', 'bound run length'],
  geminiVideoPersonGeneration: ['select person generation mode', 'control safety policy'],
}

const GEMINI_VIDEO_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '16:9', label: '16:9 (Default)' },
  { value: '9:16', label: '9:16' },
]

const GEMINI_VIDEO_RESOLUTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '720p', label: '720p (Default)' },
  { value: '1080p', label: '1080p (8s only)' },
  { value: '4k', label: '4k (8s only, not Lite)' },
]

const GEMINI_VIDEO_DURATION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '4', label: '4s' },
  { value: '6', label: '6s' },
  { value: '8', label: '8 (Default)' },
]

const GEMINI_VIDEO_PERSON_GENERATION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'allow_all', label: 'allow_all (text-to-video)' },
  { value: 'allow_adult', label: 'allow_adult (image-to-video)' },
  { value: 'dont_allow', label: 'dont_allow' },
]

function toBaseType(typeLabel: string): SettingMeta['type'] {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

function buildDetailNotes(row: GeminiVideoApiDocRow): string {
  return String(row.notes || '').trim()
}

function buildFieldOptionLabels(options: ReadonlyArray<{ value: string | number; label: string }>): WidgetRegistryField['options'] {
  return options.map(option => ({
    value: option.value,
    label: option.label,
  }))
}

export const GEMINI_VIDEO_GENERATION_DOC_ROWS: ReadonlyArray<GeminiVideoApiDocRow> = [
  {
    key: 'model',
    typeLabel: 'string',
    value: `Required. Video model ID. Default: ${CHAT_GEMINI_VIDEO_MODEL_DEFAULT}.`,
    keyDescription: 'Model selector -> pick the Gemini Veo engine -> decide which Veo capability tier executes the generation task.',
    valueDescription: `Default: ${CHAT_GEMINI_VIDEO_MODEL_DEFAULT}; Higher-tier models expand resolution and reference-image support; pinning one model narrows drift across Integrations and widget runs.`,
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: Request body > model`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/geminiRunGeneration.ts', 'canvas/src/features/storyboard-widget-manager/registryTemplates.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions', 'WidgetRegistryEntry'],
    functionName: ['readGeminiVideoWidgetDefaults', 'generateRunVideoWithGemini', 'buildGeminiVideoGenerationFields'],
    valueKey: 'geminiVideoModel',
    responsibility: 'Selects the Gemini Veo video generation model used for the task.',
    searchHints: ['model gemini veo video generation geminiVideoApi.model'],
    tooltipDefaultValue: CHAT_GEMINI_VIDEO_MODEL_DEFAULT,
    tooltipExpansionNote: 'Higher-tier models expand resolution (4k) and reference-image support.',
    tooltipContractionNote: 'Pinning one model narrows drift and activation surprises.',
    notes: 'Request body field: `model`.',
  },
  {
    key: 'prompt',
    typeLabel: 'string',
    value: 'Required. Video generation prompt text. Max 1024 tokens. Supports audio prompts.',
    keyDescription: 'Scene brief -> describe the target motion, style, and narrative -> steer Veo toward the requested video outcome.',
    valueDescription: 'Default: empty; Richer prompt detail expands scene control; shorter prompts narrow specification and leave more to model inference.',
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: Request body > instances[0].prompt`,
    module: ['canvas/src/features/chat/geminiRunGeneration.ts', 'canvas/src/features/storyboard-widget-manager/registryTemplates.ts'],
    className: ['RunVideoGenerationOptions', 'WidgetRegistryEntry'],
    functionName: ['generateRunVideoWithGemini', 'buildGeminiVideoGenerationFields'],
    responsibility: 'Carries the prompt text used by the default content builder.',
    searchHints: ['prompt video generation text content'],
    notes: 'agentic-graph uses this field for the prompt text.',
  },
  {
    key: 'aspectRatio',
    typeLabel: 'enum',
    value: 'Optional. Default 16:9. 16:9 | 9:16.',
    keyDescription: 'Frame-shape selector -> pick landscape or portrait layout -> pass the aspectRatio string to the Veo generation config.',
    valueDescription: 'Default: 16:9; 9:16 expands vertical/portrait framing; 16:9 narrows to standard landscape.',
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: Parameters > aspectRatio`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/geminiRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readGeminiVideoWidgetDefaults', 'generateRunVideoWithGemini'],
    valueKey: 'geminiVideoAspectRatio',
    responsibility: 'Controls the output video aspect ratio (landscape or portrait).',
    searchHints: ['aspect ratio 16:9 9:16 video generation'],
    tooltipDefaultValue: '16:9',
    tooltipExpansionNote: 'Portrait (9:16) expands vertical framing for mobile/social content.',
    tooltipContractionNote: 'Landscape (16:9) narrows to standard horizontal composition.',
  },
  {
    key: 'resolution',
    typeLabel: 'enum',
    value: 'Optional. Default 720p. 720p | 1080p | 4k.',
    keyDescription: 'Clarity preset -> choose the output video resolution -> control the render detail budget sent to Veo.',
    valueDescription: 'Default: 720p; 1080p and 4k require 8s duration; 4k not available on Veo 3.1 Lite; higher resolution expands detail and cost.',
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: Parameters > resolution`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/geminiRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readGeminiVideoWidgetDefaults', 'generateRunVideoWithGemini'],
    valueKey: 'geminiVideoResolution',
    responsibility: 'Controls the output video resolution preset.',
    searchHints: ['resolution 720p 1080p 4k video generation'],
    tooltipDefaultValue: '720p',
    tooltipExpansionNote: 'Higher resolution expands detail and playback clarity; 1080p/4k require 8s duration.',
    tooltipContractionNote: 'Lower resolution narrows output size and usually lowers latency.',
  },
  {
    key: 'durationSeconds',
    typeLabel: 'enum',
    value: 'Optional. Default 8. 4 | 6 | 8.',
    keyDescription: 'Run-length selector -> pick the target video length -> control generation time and output pacing.',
    valueDescription: 'Default: 8; Must be 8 for 1080p/4k/reference images/video extension; shorter durations narrow output length.',
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: Parameters > durationSeconds`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/geminiRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readGeminiVideoWidgetDefaults', 'generateRunVideoWithGemini'],
    valueKey: 'geminiVideoDurationSeconds',
    responsibility: 'Controls the output video duration in seconds.',
    searchHints: ['duration seconds video generation'],
    tooltipDefaultValue: '8',
    tooltipExpansionNote: 'Longer durations expand narrative runtime.',
    tooltipContractionNote: 'Shorter durations narrow output length and reduce generation time.',
    notes: 'Must be 8 when using 1080p, 4k, reference images, or video extension.',
  },
  {
    key: 'personGeneration',
    typeLabel: 'enum',
    value: 'Optional. allow_all | allow_adult | dont_allow. Default varies by region.',
    keyDescription: 'Safety-policy selector -> control person generation behavior -> comply with regional restrictions on generated persons.',
    valueDescription: 'Default: allow_all (text-to-video), allow_adult (image-to-video); EU/UK/CH/MENA regions restrict to allow_adult only; dont_allow narrows output to exclude persons.',
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: Parameters > personGeneration`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/geminiRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readGeminiVideoWidgetDefaults', 'generateRunVideoWithGemini'],
    valueKey: 'geminiVideoPersonGeneration',
    responsibility: 'Controls the person generation safety policy for the video task.',
    searchHints: ['person generation safety policy allow_all allow_adult dont_allow'],
    tooltipDefaultValue: 'allow_all',
    tooltipExpansionNote: 'allow_all expands full person generation for text-to-video.',
    tooltipContractionNote: 'dont_allow narrows output to exclude generated persons.',
    notes: 'Region-restricted: EU/UK/CH/MENA default to allow_adult for text-to-video.',
  },
  {
    key: 'docs_url',
    typeLabel: 'string',
    value: GEMINI_VIDEO_GENERATION_API_DOCS_URL,
    keyDescription: 'Reference locator -> point the operator to the official Gemini Veo API docs -> keep request interpretation anchored to the vendor source.',
    valueDescription: `Default: ${GEMINI_VIDEO_GENERATION_API_DOCS_URL}; Opening the vendor docs expands source context; staying inside agentic-graph narrows attention to the curated request surface.`,
    ssot: GEMINI_VIDEO_GENERATION_API_DOCS_URL,
    module: ['canvas/src/features/panels/views/SettingsView.tsx'],
    className: ['SettingsView'],
    functionName: ['buildMarkdown'],
    responsibility: 'Links to the official Gemini Veo Video Generation API documentation.',
    searchHints: ['gemini docs veo video generation api'],
  },
  {
    key: 'endpoint',
    typeLabel: 'string',
    value: 'POST /v1beta/models/{model}:predictLongRunning',
    keyDescription: 'Task-creation dispatcher -> send the video-generation payload to Gemini -> create an asynchronous long-running operation for later polling.',
    valueDescription: 'Default: POST /v1beta/models/{model}:predictLongRunning; Sending to the Gemini endpoint expands runnable video output; changing the path narrows compatibility with the shared proxy pipeline.',
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: REST API > Generate video`,
    module: ['canvas/src/features/chat/geminiRunGeneration.ts', 'canvas/src/lib/chatEndpoint.ts'],
    className: ['RunGenerationConfig'],
    functionName: ['generateRunVideoWithGemini'],
    responsibility: 'Creates a Gemini Veo video generation long-running operation.',
    searchHints: ['predictLongRunning post models video generation'],
    notes: 'agentic-graph routes this through the proxy with x-goog-api-key header.',
  },
  {
    key: 'polling_endpoint',
    typeLabel: 'string',
    value: 'GET /v1beta/{operation.name}',
    keyDescription: 'Task-status reader -> poll the long-running operation until done -> retrieve the final video URI for the shared asset pipeline.',
    valueDescription: 'Default: GET /v1beta/{operation.name}; Polling expands asynchronous task completion into a downloadable asset; skipping it narrows the flow to task creation without usable output.',
    ssot: `${GEMINI_VIDEO_GENERATION_API_DOCS_URL} :: Handling asynchronous operations`,
    module: ['canvas/src/features/chat/geminiRunGeneration.ts'],
    className: ['RunGenerationConfig'],
    functionName: ['generateRunVideoWithGemini'],
    responsibility: 'Polls Gemini long-running operation status until the generated video URI is available.',
    searchHints: ['operation name polling status long running'],
  },
]

const GEMINI_VIDEO_DOC_ROW_BY_ROW_KEY: Readonly<Record<string, GeminiVideoApiDocRow>> = Object.fromEntries(
  GEMINI_VIDEO_GENERATION_DOC_ROWS.map(row => [`geminiVideoApi.${row.key}`, row] as const),
)

export function getGeminiVideoApiDocRowByRowKey(rowKey: string): GeminiVideoApiDocRow | null {
  const normalized = String(rowKey || '').trim()
  return GEMINI_VIDEO_DOC_ROW_BY_ROW_KEY[normalized] || null
}

export const GEMINI_VIDEO_GENERATION_API_DOC_ENTRIES: ReadonlyArray<GeminiVideoVirtualSettingsEntry> =
  GEMINI_VIDEO_GENERATION_DOC_ROWS.map(row => ({
    meta: {
      key:
        row.valueKey === 'geminiVideoModel'
          ? 'geminiVideoModel'
          : (row.key.startsWith('geminiVideo') ? row.key : `geminiVideoApi.${row.key}`),
      type: toBaseType(row.typeLabel),
      source: 'backendEnv',
      read: () => row.value,
    },
    value: row.value,
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? GEMINI_VIDEO_TOOLTIP_ROLE : undefined,
    tooltipActions: row.valueKey ? GEMINI_VIDEO_KEY_ACTIONS_BY_VALUE_KEY[row.valueKey] : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    tooltipMin: row.tooltipMin,
    tooltipMax: row.tooltipMax,
    tooltipInterval: row.tooltipInterval,
    tooltipExpansionNote: row.tooltipExpansionNote,
    tooltipContractionNote: row.tooltipContractionNote,
    tooltipImpact: row.tooltipImpact,
    searchHints: [
      'gemini veo video generation api request parameters',
      row.key,
      ...(row.searchHints || []),
    ],
    details: {
      area: GEMINI_VIDEO_GENERATION_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: buildDetailNotes(row),
      modules: row.module,
      classes: row.className,
      functions: row.functionName,
    } satisfies FlowDetails,
  }))

export function buildGeminiVideoGenerationFields(): WidgetRegistryField[] {
  return [
    {
      fieldKey: 'model',
      fieldType: 'select',
      schemaPath: 'properties.model',
      required: true,
      label: 'Model',
      options: buildFieldOptionLabels([
        { value: 'veo-3.1-generate-preview', label: 'Veo 3.1 (Default)' },
        { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
        { value: 'veo-3.1-lite-generate-preview', label: 'Veo 3.1 Lite' },
        { value: 'veo-3.0-generate-001', label: 'Veo 3.0' },
        { value: 'veo-2.0-generate-001', label: 'Veo 2.0' },
      ]),
    },
    {
      fieldKey: 'prompt',
      fieldType: 'textarea',
      schemaPath: 'properties.prompt',
      required: true,
      label: 'Prompt',
    },
    {
      fieldKey: 'aspect_ratio',
      fieldType: 'select',
      schemaPath: 'properties.aspect_ratio',
      required: true,
      label: 'Aspect Ratio',
      options: buildFieldOptionLabels(GEMINI_VIDEO_ASPECT_RATIO_OPTIONS),
    },
    {
      fieldKey: 'resolution',
      fieldType: 'select',
      schemaPath: 'properties.resolution',
      required: true,
      label: 'Resolution',
      options: buildFieldOptionLabels(GEMINI_VIDEO_RESOLUTION_OPTIONS),
    },
    {
      fieldKey: 'duration_seconds',
      fieldType: 'select',
      schemaPath: 'properties.duration_seconds',
      required: true,
      label: 'Duration',
      options: buildFieldOptionLabels(GEMINI_VIDEO_DURATION_OPTIONS),
    },
    {
      fieldKey: 'person_generation',
      fieldType: 'select',
      schemaPath: 'properties.person_generation',
      required: true,
      label: 'Person Generation',
      options: buildFieldOptionLabels(GEMINI_VIDEO_PERSON_GENERATION_OPTIONS),
    },
  ]
}

export function resolveGeminiVideoWidgetApiRowKey(args: {
  schemaPath?: string
  fieldKey?: string
  portKey?: string
}): string | null {
  const candidates = [
    String(args.schemaPath || '').trim(),
    String(args.fieldKey || '').trim(),
    String(args.portKey || '').trim(),
  ]
    .filter(Boolean)
    .map(value => value.replace(/^properties\./, ''))
  for (const candidate of candidates) {
    if (candidate === 'model') return 'geminiVideoApi.model'
    if (candidate === 'aspect_ratio') return 'geminiVideoApi.aspectRatio'
    if (candidate === 'resolution') return 'geminiVideoApi.resolution'
    if (candidate === 'duration_seconds') return 'geminiVideoApi.durationSeconds'
    if (candidate === 'person_generation') return 'geminiVideoApi.personGeneration'
    if (candidate === 'prompt' || candidate === 'prompt_in') return 'geminiVideoApi.prompt'
  }
  return null
}
