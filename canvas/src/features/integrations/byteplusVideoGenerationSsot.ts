import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { WidgetRegistryField } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import {
  STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS,
} from '@/lib/config.storyboard-widget'
import { CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT } from '@/lib/chatEndpoint'

export type BytePlusVideoApiDocRow = {
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

export type BytePlusVideoVirtualSettingsEntry = {
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

export const BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA = 'BytePlus Video Generation API'
export const BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL = 'https://api.byteplus.com/api-explorer/?action=CreateContentsGenerationsTasks&groupName=Video%20Generation%20API&serviceCode=ark&version=2024-01-01'
const BYTEPLUS_VIDEO_TOOLTIP_ROLE = 'BytePlus Video Generation API'

export function getBytePlusVideoGenerationApiRowAnchorId(rowKey: string): string {
  const normalized = String(rowKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `byteplus-video-generation-api-row-${normalized || 'entry'}`
}

export const BYTEPLUS_VIDEO_GENERATION_MAPPED_VALUE_KEYS = [
  'byteplusVideoModel',
  'byteplusVideoContentJson',
  'byteplusVideoResolution',
  'byteplusVideoRatio',
  'byteplusVideoDuration',
  'byteplusVideoGenerateAudio',
  'byteplusVideoDraft',
  'byteplusVideoCameraFixed',
  'byteplusVideoImageUrlUrl',
] as const

export const BYTEPLUS_VIDEO_KEY_ACTIONS_BY_VALUE_KEY: Readonly<Record<string, string[]>> = {
  byteplusVideoModel: ['select video model', 'pin video default'],
  byteplusVideoContentJson: ['edit content override', 'pin multimodal request payload'],
  byteplusVideoResolution: ['select resolution', 'pin output clarity'],
  byteplusVideoRatio: ['select ratio', 'pin frame geometry'],
  byteplusVideoDuration: ['set duration', 'bound run length'],
  byteplusVideoGenerateAudio: ['toggle audio generation', 'control synchronized sound'],
  byteplusVideoDraft: ['toggle draft mode', 'stage task generation'],
  byteplusVideoCameraFixed: ['toggle camera fixed', 'stabilize camera path'],
  byteplusVideoImageUrlUrl: ['select image input kind', 'choose base64 vs url'],
}

const BYTEPLUS_VIDEO_RESOLUTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '480p', label: '480p (Default)' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

const BYTEPLUS_VIDEO_RATIO_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '16:9', label: '16:9 (Default)' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' },
]

function toBaseType(typeLabel: string): SettingMeta['type'] {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

function buildDetailNotes(row: BytePlusVideoApiDocRow): string {
  return String(row.notes || '').trim()
}

function buildFieldOptionLabels(options: ReadonlyArray<{ value: string | number; label: string }>): WidgetRegistryField['options'] {
  return options.map(option => ({
    value: option.value,
    label: option.label,
  }))
}

export const BYTEPLUS_VIDEO_GENERATION_DOC_ROWS: ReadonlyArray<BytePlusVideoApiDocRow> = [
  {
    key: 'content',
    typeLabel: 'object[]',
    value: 'Optional. Integration-level content override array.',
    keyDescription: 'Multimodal override payload -> provide an explicit upstream content array -> replace the widget-built prompt/reference-image content when you need exact text/image/video/audio items.',
    valueDescription: 'Default: empty; Supplying JSON expands exact multimodal control; leaving it empty narrows the request to the shared prompt + optional reference image builder.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > content`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoContentJson',
    responsibility: 'Stores an optional JSON override for the upstream content array sent to BytePlus.',
    searchHints: ['content json multimodal override text image video audio reference'],
    tooltipDefaultValue: '',
    tooltipExpansionNote: 'Explicit JSON expands full multimodal request control, including reference audio/video items.',
    tooltipContractionNote: 'Empty content JSON narrows the request to the shared prompt builder.',
    notes: 'When present, this overrides the prompt + reference-image derived content array.',
  },
  {
    key: 'model',
    typeLabel: 'string',
    value: 'Required. Video model ID.',
    keyDescription: 'Model selector -> pick the BytePlus video engine -> decide which Seedance capability family executes the generation task.',
    valueDescription: `Default: ${CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT}; Curated higher-tier models expand multimodal coverage and audio support; pinning one model narrows drift across Integrations, Workflow Manager, and widget runs.`,
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > model`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts', 'canvas/src/features/storyboard-widget-manager/registryTemplates.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions', 'WidgetRegistryEntry'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus', 'buildBytePlusVideoGenerationFields'],
    valueKey: 'byteplusVideoModel',
    responsibility: 'Selects the BytePlus ModelArk video generation model used for the task.',
    searchHints: ['model byteplus video seedance dreamina byteplus video widget integrations byteplusVideoApi.model'],
    tooltipDefaultValue: CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
    tooltipExpansionNote: 'Higher-tier curated models expand multimodal input and audio support.',
    tooltipContractionNote: 'Keeping one pinned model narrows drift and activation surprises.',
    notes: 'Request body field: `model`.',
  },
  {
    key: 'ratio',
    typeLabel: 'string',
    value: 'Optional. Default 16:9. 16:9 | 4:3 | 1:1 | 3:4 | 9:16 | 21:9.',
    keyDescription: 'Frame-shape selector -> pick the layout geometry -> pass the ratio string through to the BytePlus `ratio` field sent to the task API.',
    valueDescription: 'Default: 16:9; Wider frames expand cinematic horizontal space; portrait ratios narrow canvas shape to vertical framing.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > ratio`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoRatio',
    responsibility: 'Controls the upstream BytePlus `ratio` string used for video generation.',
    searchHints: ['ratio 16:9 9:16 1:1 4:3 3:4 21:9 video generation'],
    tooltipDefaultValue: '16:9',
    tooltipExpansionNote: 'Wider ratios expand horizontal composition space.',
    tooltipContractionNote: 'Portrait ratios narrow canvas geometry around vertical framing.',
  },
  {
    key: 'duration',
    typeLabel: 'integer',
    value: 'Optional. Default 2 seconds.',
    keyDescription: 'Run-length cap -> bound the target video length -> control generation time, task cost, and output pacing from the widget surface.',
    valueDescription: 'Default: 2; Seedance 1.0: 2-12 seconds; Seedance 1.5/2.0: 4-15 seconds; Interval: 1. Runtime requests clamp to the resolved model range.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > duration`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoDuration',
    responsibility: 'Controls the output duration in seconds for the generated video task.',
    searchHints: ['duration seconds video generation'],
    tooltipDefaultValue: 2,
    tooltipMin: 2,
    tooltipMax: 15,
    tooltipInterval: 1,
    tooltipExpansionNote: 'Longer durations expand narrative runtime.',
    tooltipContractionNote: 'Shorter durations narrow output length and reduce generation time.',
  },
  {
    key: 'generate_audio',
    typeLabel: 'boolean',
    value: 'Optional. Default false.',
    keyDescription: 'Audio-output toggle -> request synchronized sound when the chosen model supports it -> decide whether BytePlus should generate audio alongside video frames.',
    valueDescription: 'Default: false; Enabling audio expands synchronized sound generation on supported models; disabling it narrows output to silent video.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > generate_audio`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoGenerateAudio',
    responsibility: 'Controls whether BytePlus should generate synchronized audio with the output video.',
    searchHints: ['generate audio synchronized sound video generation'],
    tooltipDefaultValue: false,
    tooltipExpansionNote: 'Audio expands multimodal output on supported models.',
    tooltipContractionNote: 'Disabling audio narrows the task to silent video output.',
  },
  {
    key: 'resolution',
    typeLabel: 'string',
    value: 'Optional. Default 480p.',
    keyDescription: 'Clarity preset -> choose the output video resolution -> control the render detail budget sent to BytePlus.',
    valueDescription: 'Default: 480p; Options: 480p | 720p | 1080p; Higher resolution expands detail and cost; lower resolution narrows output size and usually lowers latency.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > resolution`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoResolution',
    responsibility: 'Controls the output video resolution preset.',
    searchHints: ['resolution 480p 720p 1080p video generation'],
    tooltipDefaultValue: '480p',
    tooltipExpansionNote: 'Higher resolution expands detail and playback clarity.',
    tooltipContractionNote: 'Lower resolution narrows output size and usually lowers latency.',
  },
  {
    key: 'draft',
    typeLabel: 'boolean',
    value: 'Optional. Default true.',
    keyDescription: 'Draft toggle -> choose draft-mode generation -> decide whether to request draft output for faster iteration or preview flows.',
    valueDescription: 'Default: true; Draft is sent only for image-conditioned Seedance 1.5 Pro runs, the sole supported model family.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > draft`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoDraft',
    responsibility: 'Controls the upstream `draft` flag for the video generation task.',
    searchHints: ['draft video generation preview'],
    tooltipDefaultValue: true,
    tooltipExpansionNote: 'Draft expands faster iteration for image-conditioned Seedance 1.5 Pro runs.',
    tooltipContractionNote: 'Disabling draft narrows the run to final-quality behavior.',
  },
  {
    key: 'camera_fixed',
    typeLabel: 'boolean',
    value: 'Optional. Default false.',
    keyDescription: 'Camera stabilization toggle -> request fixed camera motion -> reduce camera drift for more stable compositions when supported.',
    valueDescription: 'Default: false; Enabling camera_fixed expands stable camera motion; in agenticgraph this flag is only sent for image-conditioned video runs (i2v).',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > camera_fixed`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoCameraFixed',
    responsibility: 'Controls the upstream `camera_fixed` flag for the video generation task.',
    searchHints: ['camera_fixed stable camera video generation'],
    tooltipDefaultValue: false,
    tooltipExpansionNote: 'Enabling camera_fixed expands stabilized camera behavior; agenticgraph sends this only for image-conditioned video runs (i2v).',
    tooltipContractionNote: 'Disabling camera_fixed narrows constraints and allows more camera motion.',
  },
  {
    key: 'content.image_url.url',
    typeLabel: 'enum',
    value: 'Optional. Default base64. base64 | url.',
    keyDescription: 'Reference-image kind selector -> choose whether the reference image is provided as base64 or as a URL -> keep image_url encoding explicit across Integrations and widget overrides.',
    valueDescription: 'Default: base64; local/proxied images are read back and embedded as data URLs under the 10 MB provider limit; url requires a provider-accessible remote asset.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > content.image_url.url`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts', 'canvas/src/components/StoryboardWidget/WidgetEditorForm.tsx'],
    className: ['SettingsRegistryItem', 'RunVideoGenerationOptions'],
    functionName: ['readBytePlusVideoWidgetDefaults', 'generateRunVideoWithBytePlus'],
    valueKey: 'byteplusVideoImageUrlUrl',
    responsibility: 'Selects the expected kind of the reference image_url.url payload.',
    searchHints: ['content image_url url base64 reference image video generation'],
    tooltipDefaultValue: 'base64',
    tooltipExpansionNote: 'URL mode expands remote-asset linking via proxies.',
    tooltipContractionNote: 'Base64 mode narrows the payload to inline embedded assets.',
  },
  {
    key: 'docs_url',
    typeLabel: 'string',
    value: BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL,
    keyDescription: 'Reference locator -> point the operator to the official BytePlus video task API explorer -> keep request interpretation anchored to the vendor source.',
    valueDescription: 'Default: https://api.byteplus.com/api-explorer/?action=CreateContentsGenerationsTasks&groupName=Video%20Generation%20API&serviceCode=ark&version=2024-01-01; Opening the vendor docs expands source context; staying inside agenticgraph narrows attention to the curated request surface.',
    ssot: BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL,
    module: ['canvas/src/features/panels/views/SettingsView.tsx', 'docs/documents/agenticgraph-byteplus-openark-video-generation-api-reference.md'],
    className: ['SettingsView'],
    functionName: ['buildMarkdown'],
    responsibility: 'Links to the official BytePlus ModelArk Video Generation API explorer.',
    searchHints: ['byteplus docs modelark video generation api explorer'],
  },
  {
    key: 'endpoint',
    typeLabel: 'string',
    value: 'POST /api/v3/contents/generations/tasks',
    keyDescription: 'Task-creation dispatcher -> send the video-generation payload to BytePlus -> create an asynchronous video generation task for later polling.',
    valueDescription: 'Default: POST /api/v3/contents/generations/tasks; Sending to the BytePlus task endpoint expands runnable video output; changing the path narrows compatibility with the shared proxy pipeline.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request endpoint`,
    module: ['canvas/src/features/chat/byteplusRunGeneration.ts', 'canvas/src/lib/chatEndpoint.ts'],
    className: ['RunGenerationConfig'],
    functionName: ['generateRunVideoWithBytePlus', 'resolveBytePlusContentEndpointForRequest'],
    responsibility: 'Creates a BytePlus video generation task from prompt content and generation parameters.',
    searchHints: ['contents generations tasks post'],
    notes: 'AgenticGraph routes this through the proxy and sets the upstream origin internally.',
  },
  {
    key: 'polling_endpoint',
    typeLabel: 'string',
    value: 'GET /api/v3/contents/generations/tasks/{id}',
    keyDescription: 'Task-status reader -> poll the created task until it reaches a downloadable succeeded state -> retrieve the final video URL for the shared asset pipeline.',
    valueDescription: 'Default: GET /api/v3/contents/generations/tasks/{id}; pending tasks use the vendor-recommended 10-second interval and a 60-attempt client window before a typed timeout.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Query task endpoint`,
    module: ['canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['RunGenerationConfig'],
    functionName: ['generateRunVideoWithBytePlus'],
    responsibility: 'Polls BytePlus task status until the generated video URL is available.',
    searchHints: ['contents generations tasks get status polling'],
  },
  {
    key: 'prompt',
    typeLabel: 'string',
    value: 'Required for the default builder. Video generation prompt text.',
    keyDescription: 'Scene brief -> describe the target motion, style, and narrative -> steer BytePlus toward the requested video outcome when content_json is not overriding the payload.',
    valueDescription: 'Default: empty; Richer prompt detail expands scene control; shorter prompts narrow specification and leave more to model inference.',
    ssot: `${BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL} :: Request body > content.text`,
    module: ['canvas/src/features/chat/byteplusRunGeneration.ts', 'canvas/src/features/storyboard-widget-manager/registryTemplates.ts'],
    className: ['RunVideoGenerationOptions', 'WidgetRegistryEntry'],
    functionName: ['generateRunVideoWithBytePlus', 'buildBytePlusVideoGenerationFields'],
    responsibility: 'Carries the prompt text used by the default content-array builder.',
    searchHints: ['prompt video generation text content'],
    notes: 'AgenticGraph uses this field when content_json is empty.',
  },
]

const BYTEPLUS_VIDEO_DOC_ROW_BY_ROW_KEY: Readonly<Record<string, BytePlusVideoApiDocRow>> = Object.fromEntries(
  BYTEPLUS_VIDEO_GENERATION_DOC_ROWS.map(row => [`byteplusVideoApi.${row.key}`, row] as const),
)

export function getBytePlusVideoApiDocRowByRowKey(rowKey: string): BytePlusVideoApiDocRow | null {
  const normalized = String(rowKey || '').trim()
  return BYTEPLUS_VIDEO_DOC_ROW_BY_ROW_KEY[normalized] || null
}

export const BYTEPLUS_VIDEO_GENERATION_API_DOC_ENTRIES: ReadonlyArray<BytePlusVideoVirtualSettingsEntry> =
  BYTEPLUS_VIDEO_GENERATION_DOC_ROWS.map(row => ({
    meta: {
      key:
        row.valueKey === 'byteplusVideoModel'
          ? 'byteplusVideoModel'
          : (row.key.startsWith('byteplusVideo') ? row.key : `byteplusVideoApi.${row.key}`),
      type: toBaseType(row.typeLabel),
      source: 'backendEnv',
      read: () => row.value,
    },
    value: row.value,
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? BYTEPLUS_VIDEO_TOOLTIP_ROLE : undefined,
    tooltipActions: row.valueKey ? BYTEPLUS_VIDEO_KEY_ACTIONS_BY_VALUE_KEY[row.valueKey] : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    tooltipMin: row.tooltipMin,
    tooltipMax: row.tooltipMax,
    tooltipInterval: row.tooltipInterval,
    tooltipExpansionNote: row.tooltipExpansionNote,
    tooltipContractionNote: row.tooltipContractionNote,
    tooltipImpact: row.tooltipImpact,
    searchHints: [
      'byteplus video generation api request parameters',
      row.key,
      ...(row.searchHints || []),
    ],
    details: {
      area: BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: buildDetailNotes(row),
      modules: row.module,
      classes: row.className,
      functions: row.functionName,
    } satisfies FlowDetails,
  }))

export function buildBytePlusVideoGenerationFields(): WidgetRegistryField[] {
  return [
    {
      fieldKey: 'model',
      fieldType: 'select',
      schemaPath: 'properties.model',
      required: true,
      label: 'Model',
      options: buildFieldOptionLabels(STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS),
    },
    {
      fieldKey: 'prompt',
      fieldType: 'textarea',
      schemaPath: 'properties.prompt',
      required: true,
      label: 'Prompt',
    },
    {
      fieldKey: 'content_json',
      fieldType: 'json',
      schemaPath: 'properties.content_json',
      label: 'Content (JSON)',
    },
    {
      fieldKey: 'ratio',
      fieldType: 'select',
      schemaPath: 'properties.ratio',
      required: true,
      label: 'Ratio',
      options: buildFieldOptionLabels(BYTEPLUS_VIDEO_RATIO_OPTIONS),
    },
    {
      fieldKey: 'resolution',
      fieldType: 'select',
      schemaPath: 'properties.resolution',
      required: true,
      label: 'Resolution',
      options: buildFieldOptionLabels(BYTEPLUS_VIDEO_RESOLUTION_OPTIONS),
    },
    {
      fieldKey: 'duration',
      fieldType: 'number',
      schemaPath: 'properties.duration',
      required: true,
      label: 'Duration',
    },
    {
      fieldKey: 'generate_audio',
      fieldType: 'boolean',
      schemaPath: 'properties.generate_audio',
      label: 'Generate audio',
    },
    {
      fieldKey: 'draft',
      fieldType: 'boolean',
      schemaPath: 'properties.draft',
      label: 'Draft',
    },
    {
      fieldKey: 'camera_fixed',
      fieldType: 'boolean',
      schemaPath: 'properties.camera_fixed',
      label: 'Camera fixed',
    },
    {
      fieldKey: 'image_url_url',
      fieldType: 'select',
      schemaPath: 'properties.image_url_url',
      required: true,
      label: 'content.image_url.url',
      options: [
        { value: 'base64', label: 'base64 (Default)' },
        { value: 'url', label: 'url' },
      ],
    },
    {
      fieldKey: 'reference_image',
      fieldType: 'text',
      schemaPath: 'properties.reference_image',
      label: 'Reference image',
    },
  ]
}

export function resolveBytePlusVideoWidgetApiRowKey(args: {
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
    if (candidate === 'model') return 'byteplusVideoApi.model'
    if (candidate === 'content_json') return 'byteplusVideoApi.content'
    if (candidate === 'ratio') return 'byteplusVideoApi.ratio'
    if (candidate === 'resolution') return 'byteplusVideoApi.resolution'
    if (candidate === 'duration') return 'byteplusVideoApi.duration'
    if (candidate === 'generate_audio') return 'byteplusVideoApi.generate_audio'
    if (candidate === 'draft') return 'byteplusVideoApi.draft'
    if (candidate === 'camera_fixed') return 'byteplusVideoApi.camera_fixed'
    if (candidate === 'image_url_url') return 'byteplusVideoApi.content.image_url.url'
    if (candidate === 'prompt' || candidate === 'prompt_in') return 'byteplusVideoApi.prompt'
    if (candidate === 'reference_image') return 'byteplusVideoApi.content.image_url.url'
    if (candidate === 'videoUrl') return 'byteplusVideoApi.polling_endpoint'
  }
  return null
}
