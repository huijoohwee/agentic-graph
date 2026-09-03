import type { FlowDetails, SettingMeta } from '@/features/settings/types'
export { buildBytePlusImageGenerationFields } from '@/lib/storyboardWidget/byteplusImageWidgetFields'

export type BytePlusImageApiDocRow = {
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

export type BytePlusImageVirtualSettingsEntry = {
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

export const BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA = 'BytePlus Image Generation API'
export const BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL = 'https://docs.byteplus.com/en/docs/ModelArk/1666945'
const BYTEPLUS_IMAGE_TOOLTIP_ROLE = 'BytePlus Image Generation API'

export function getBytePlusImageGenerationApiRowAnchorId(rowKey: string): string {
  const normalized = String(rowKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `byteplus-image-generation-api-row-${normalized || 'entry'}`
}

export const BYTEPLUS_IMAGE_GENERATION_MAPPED_VALUE_KEYS = [
  'byteplusImageModel',
  'byteplusImageSize',
  'byteplusImageOutputFormat',
  'byteplusImageResponseFormat',
  'byteplusImageOptimizePromptOptions',
  'byteplusImageAspectRatio',
  'byteplusImageStream',
  'byteplusImageWatermark',
  'byteplusImageSeed',
  'byteplusImageGuidanceScale',
] as const

export const BYTEPLUS_IMAGE_KEY_ACTIONS_BY_VALUE_KEY: Readonly<Record<string, string[]>> = {
  byteplusImageModel: ['select image model', 'pin image default'],
  byteplusImageSize: ['select image size', 'pin output dimensions'],
  byteplusImageOutputFormat: ['select output format', 'pin image encoding'],
  byteplusImageResponseFormat: ['select response format', 'choose asset delivery'],
  byteplusImageOptimizePromptOptions: ['select prompt optimization', 'tune speed vs quality'],
  byteplusImageAspectRatio: ['set aspect ratio', 'shape output composition'],
  byteplusImageStream: ['toggle stream mode', 'choose progressive delivery'],
  byteplusImageWatermark: ['toggle watermark', 'control output marking'],
  byteplusImageSeed: ['set deterministic seed', 'stabilize reruns'],
  byteplusImageGuidanceScale: ['set guidance strength', 'tune prompt adherence'],
}

function toBaseType(typeLabel: string): SettingMeta['type'] {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

function buildDetailNotes(row: BytePlusImageApiDocRow): string {
  return String(row.notes || '').trim()
}

export const BYTEPLUS_IMAGE_GENERATION_DOC_ROWS: ReadonlyArray<BytePlusImageApiDocRow> = [
  {
    key: 'model',
    typeLabel: 'enum',
    value: 'Required. seedream-4-0-250828 | seedream-4-5-251128 | seedream-5-0-260128.',
    keyDescription: 'Model selector -> pick the BytePlus image engine -> decide which image capability family executes the prompt.',
    valueDescription: 'Default: seedream-4-0-250828; Curated higher-tier models expand image capability coverage; pinning one model narrows drift across Integrations, Workflow Manager, and widget runs.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > model`,
    module: [
      'canvas/src/features/settings/registry-ui.ui.ts',
      'canvas/src/features/chat/byteplusRunGeneration.ts',
      'canvas/src/features/storyboard-widget-manager/registryTemplates.ts',
    ],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus', 'buildBytePlusImageGenerationFields'],
    valueKey: 'byteplusImageModel',
    responsibility: 'Selects the BytePlus ModelArk image generation model used for the request.',
    searchHints: ['model byteplus image seedream dola byteplus image widget integrations'],
    tooltipDefaultValue: 'seedream-4-0-250828',
    tooltipExpansionNote: 'Higher-tier curated models expand image quality and coverage.',
    tooltipContractionNote: 'Keeping one pinned model narrows drift and activation surprises.',
    notes: 'Request body field: `model`.',
  },
  {
    key: 'docs_url',
    typeLabel: 'string',
    value: BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL,
    keyDescription: 'Reference locator -> point the operator to the official ModelArk image documentation -> keep request interpretation anchored to the vendor source.',
    valueDescription: 'Default: https://docs.byteplus.com/en/docs/ModelArk/1666945; Opening the vendor docs expands source context; staying inside agentic-graph narrows attention to the curated request surface.',
    ssot: BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL,
    module: ['canvas/src/features/panels/views/SettingsView.tsx', 'docs/documents/agentic-graph-byteplus-openark-image-generation-api-reference.md'],
    className: ['SettingsView'],
    functionName: ['buildMarkdown'],
    responsibility: 'Links to the official BytePlus ModelArk Image Generation API documentation.',
    searchHints: ['byteplus docs modelark image generation api'],
  },
  {
    key: 'endpoint',
    typeLabel: 'string',
    value: 'POST /api/v3/images/generations',
    keyDescription: 'Request dispatcher -> send the image-generation payload to BytePlus -> create a new image generation run from prompt text and optional reference image.',
    valueDescription: 'Default: POST /api/v3/images/generations; Sending to the BytePlus image endpoint expands runnable image output; changing the path narrows compatibility with the shared proxy pipeline.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request endpoint`,
    module: ['canvas/src/features/chat/byteplusRunGeneration.ts', 'canvas/src/lib/chatEndpoint.ts'],
    className: ['RunGenerationConfig'],
    functionName: ['generateRunImageWithBytePlus', 'resolveBytePlusContentEndpointForRequest'],
    responsibility: 'Creates an image generation request from prompt text plus optional image input.',
    searchHints: ['images generations post'],
    notes: 'agentic-graph routes this through the proxy and keeps binary decoding on the shared image pipeline.',
  },
  {
    key: 'guidance_scale',
    typeLabel: 'number',
    value: 'Optional. Default 0 (omit API override).',
    keyDescription: 'Prompt-adherence tuner -> strengthen or relax guidance pressure -> balance prompt obedience against freer model interpretation.',
    valueDescription: 'Default: 0; Min: 0; Max: 20; Interval: 0.1; Higher guidance expands prompt adherence; lower guidance narrows constraint and allows looser composition.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > guidance_scale`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageGuidanceScale',
    responsibility: 'Controls prompt guidance strength when the selected image model supports it.',
    searchHints: ['guidance scale prompt strength image generation'],
    tooltipDefaultValue: 0,
    tooltipMin: 0,
    tooltipMax: 20,
    tooltipInterval: 0.1,
    tooltipExpansionNote: 'More guidance expands prompt obedience.',
    tooltipContractionNote: 'Less guidance narrows forced adherence and allows freer variation.',
  },
  {
    key: 'image',
    typeLabel: 'string | array',
    value: 'Optional. Reference image URL or Base64 payload.',
    keyDescription: 'Reference-image injector -> pass source imagery into the request -> let BytePlus perform image-conditioned generation or editing flows when supported.',
    valueDescription: 'Default: empty; Adding a reference image expands conditioning context; omitting it narrows the request to pure text-to-image generation.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > image`,
    module: ['canvas/src/features/chat/byteplusRunGeneration.ts', 'canvas/src/components/StoryboardWidget/WidgetEditorForm.tsx'],
    className: ['RunImageGenerationOptions'],
    functionName: ['generateRunImageWithBytePlus', 'buildWidgetDraftFromSmartFields'],
    responsibility: 'Carries the optional reference image URL or Base64 payload for image-conditioned runs.',
    searchHints: ['reference image image generation image url base64'],
    notes: 'agentic-graph maps widget `reference_image` into the upstream `image` field.',
  },
  {
    key: 'output_format',
    typeLabel: 'string',
    value: 'Optional. Seedream 4.0/4.5: fixed jpeg. Seedream 5.0: png | jpeg.',
    keyDescription: 'Encoding selector -> choose the final image file format -> control how BytePlus returns the generated asset.',
    valueDescription: 'Default: jpeg; Seedream 4.0/4.5 narrows output to JPEG only; Seedream 5.0 expands optional PNG output.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > output_format`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageOutputFormat',
    responsibility: 'Selects the generated image format returned by BytePlus.',
    searchHints: ['output format jpeg png image generation'],
    tooltipDefaultValue: 'jpeg',
    tooltipExpansionNote: 'PNG expands lossless image fidelity.',
    tooltipContractionNote: 'JPEG narrows payload size and usually reduces transfer overhead.',
  },
  {
    key: 'prompt',
    typeLabel: 'string',
    value: 'Required. Image generation prompt text.',
    keyDescription: 'Image brief -> describe the visual outcome -> steer BytePlus toward the requested composition, style, and subject matter.',
    valueDescription: 'Default: empty; Richer prompt detail expands scene control; shorter prompts narrow specification and leave more to model inference.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > prompt`,
    module: ['canvas/src/features/chat/byteplusRunGeneration.ts', 'canvas/src/features/storyboard-widget-manager/registryTemplates.ts'],
    className: ['RunImageGenerationOptions', 'WidgetRegistryEntry'],
    functionName: ['generateRunImageWithBytePlus', 'buildBytePlusImageGenerationFields'],
    responsibility: 'Carries the required text prompt used for image generation.',
    searchHints: ['prompt image generation'],
  },
  {
    key: 'optimize_prompt_options',
    typeLabel: 'enum',
    value: 'Optional. Default fast. fast | standard.',
    keyDescription: 'Prompt optimizer -> choose prompt rewriting speed vs depth -> control how aggressively BytePlus optimizes prompt text before generation.',
    valueDescription: 'Default: fast; fast expands lower latency; standard expands stronger prompt optimization at higher latency.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > optimize_prompt_options`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageOptimizePromptOptions',
    responsibility: 'Selects BytePlus prompt optimization mode when supported by the model.',
    tooltipDefaultValue: 'fast',
    tooltipExpansionNote: 'Standard expands prompt optimization depth.',
    tooltipContractionNote: 'Fast narrows optimization cost and latency.',
  },
  {
    key: 'aspect_ratio',
    typeLabel: 'number',
    value: 'Optional. Default 1/16. Range [1/16, 16].',
    keyDescription: 'Composition scaler -> set width/height ratio -> control the output aspect framing budget.',
    valueDescription: 'Default: 1/16; Min: 0.0625; Max: 16; Higher values expand width vs height; lower values expands height vs width.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > aspect_ratio`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageAspectRatio',
    responsibility: 'Controls aspect ratio override when supported by the model.',
    tooltipDefaultValue: 0.0625,
    tooltipMin: 0.0625,
    tooltipMax: 16,
    tooltipInterval: 0.0001,
    tooltipExpansionNote: 'Higher ratios expand horizontal composition.',
    tooltipContractionNote: 'Lower ratios expand vertical composition.',
  },
  {
    key: 'response_format',
    typeLabel: 'string',
    value: 'Optional. Default b64_json. b64_json | url.',
    keyDescription: 'Transport format pin -> force the upstream response into a predictable binary-return shape -> keep the shared image asset pipeline deterministic.',
    valueDescription: 'Default: b64_json; b64_json expands in-app asset decoding; url expands remote asset delivery; switching formats changes how assets are fetched and rendered.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > response_format`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageResponseFormat',
    responsibility: 'Selects the BytePlus image response format used by agentic-graph.',
    searchHints: ['response format b64_json image generation'],
    tooltipDefaultValue: 'b64_json',
    notes: 'When set to `url`, the pipeline fetches the asset through the download proxy before rendering.',
  },
  {
    key: 'stream',
    typeLabel: 'boolean | null',
    value: 'Optional. Default true.',
    keyDescription: 'Delivery controller -> choose progressive delivery vs one-shot response -> align widget UX with upstream streaming behavior.',
    valueDescription: 'Default: true; Streaming expands progressive delivery; disabling stream narrows delivery to a single payload.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > stream`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageStream',
    responsibility: 'Toggles streaming delivery when supported by the image generation endpoint.',
    tooltipDefaultValue: true,
  },
  {
    key: 'seed',
    typeLabel: 'integer',
    value: 'Optional. Default 0 (omit deterministic seed).',
    keyDescription: 'Determinism control -> reuse a stable random seed -> make image reruns more reproducible when you want the same composition family.',
    valueDescription: 'Default: 0; Min: 0; Max: 2147483647; Interval: 1; Higher non-zero seeds expand reproducible reruns; zero narrows determinism by omitting the upstream override.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > seed`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageSeed',
    responsibility: 'Pins deterministic generation when you need reproducible image output.',
    searchHints: ['seed deterministic image generation'],
    tooltipDefaultValue: 0,
    tooltipMin: 0,
    tooltipMax: 2147483647,
    tooltipInterval: 1,
    tooltipExpansionNote: 'Non-zero seeds expand reproducible reruns.',
    tooltipContractionNote: 'Zero narrows determinism by omitting the upstream override.',
  },
  {
    key: 'size',
    typeLabel: 'string',
    value: 'Optional. Default 2K.',
    keyDescription: 'Dimension preset -> choose the output image size -> control the resolution budget sent to BytePlus.',
    valueDescription: 'Default: 2K; Options: 1K | 2K | 3K | 4K; Larger sizes expand detail and token cost; smaller sizes narrow resolution and generation cost.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > size`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageSize',
    responsibility: 'Controls the output image size preset sent to the Image Generation API.',
    searchHints: ['size 1k 2k 3k 4k image generation'],
    tooltipDefaultValue: '2K',
    tooltipExpansionNote: 'Larger sizes expand output detail and canvas headroom.',
    tooltipContractionNote: 'Smaller sizes narrow resolution and reduce cost.',
  },
  {
    key: 'watermark',
    typeLabel: 'boolean',
    value: 'Optional. Default false.',
    keyDescription: 'Marking policy -> decide whether BytePlus adds an AI watermark -> control the default compliance marker on generated output.',
    valueDescription: 'Default: false; Enabling watermark expands explicit AI marking; disabling it narrows visible output annotations.',
    ssot: `${BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL} :: Request > watermark`,
    module: ['canvas/src/features/settings/registry-ui.ui.ts', 'canvas/src/features/chat/byteplusRunGeneration.ts'],
    className: ['SettingsRegistryItem', 'RunImageGenerationOptions'],
    functionName: ['readBytePlusImageWidgetDefaults', 'generateRunImageWithBytePlus'],
    valueKey: 'byteplusImageWatermark',
    responsibility: 'Controls whether a watermark is added to the generated image.',
    searchHints: ['watermark image generation'],
    tooltipDefaultValue: false,
    tooltipExpansionNote: 'Enabling watermark expands explicit generated-image marking.',
    tooltipContractionNote: 'Disabling watermark narrows visible output annotations.',
  },
]

const BYTEPLUS_IMAGE_DOC_ROW_MAP: ReadonlyMap<string, BytePlusImageApiDocRow> = new Map(
  BYTEPLUS_IMAGE_GENERATION_DOC_ROWS.map(row => [
    `byteplusImageApi.${String(row.key || '').trim()}`,
    row,
  ] as const),
)

export function getBytePlusImageApiDocRowByRowKey(rowKey: string): BytePlusImageApiDocRow | null {
  const normalized = String(rowKey || '').trim()
  if (!normalized) return null
  const direct = BYTEPLUS_IMAGE_DOC_ROW_MAP.get(normalized)
  if (direct) return direct
  const withPrefix = normalized.startsWith('byteplusImageApi.') ? normalized : `byteplusImageApi.${normalized}`
  return BYTEPLUS_IMAGE_DOC_ROW_MAP.get(withPrefix) || null
}

export const BYTEPLUS_IMAGE_GENERATION_API_DOC_ENTRIES: ReadonlyArray<BytePlusImageVirtualSettingsEntry> =
  BYTEPLUS_IMAGE_GENERATION_DOC_ROWS.map(row => ({
    meta: {
      key: `byteplusImageApi.${row.key}`,
      type: toBaseType(row.typeLabel),
      source: 'backendEnv',
      read: () => row.value,
    },
    value: row.value,
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? BYTEPLUS_IMAGE_TOOLTIP_ROLE : undefined,
    tooltipActions: row.valueKey ? BYTEPLUS_IMAGE_KEY_ACTIONS_BY_VALUE_KEY[row.valueKey] : undefined,
    tooltipDefaultValue: row.tooltipDefaultValue,
    tooltipMin: row.tooltipMin,
    tooltipMax: row.tooltipMax,
    tooltipInterval: row.tooltipInterval,
    tooltipExpansionNote: row.tooltipExpansionNote,
    tooltipContractionNote: row.tooltipContractionNote,
    tooltipImpact: row.tooltipImpact,
    searchHints: [
      'byteplus image generation api request parameters',
      row.key,
      ...(row.searchHints || []),
    ],
    details: {
      area: BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: buildDetailNotes(row),
      modules: row.module,
      classes: row.className,
      functions: row.functionName,
    } satisfies FlowDetails,
  }))

export function resolveBytePlusImageWidgetApiRowKey(args: {
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
    if (candidate === 'model') return 'byteplusImageApi.model'
    if (candidate === 'size') return 'byteplusImageApi.size'
    if (candidate === 'output_format') return 'byteplusImageApi.output_format'
    if (candidate === 'watermark') return 'byteplusImageApi.watermark'
    if (candidate === 'seed') return 'byteplusImageApi.seed'
    if (candidate === 'guidance_scale') return 'byteplusImageApi.guidance_scale'
    if (candidate === 'response_format') return 'byteplusImageApi.response_format'
    if (candidate === 'optimize_prompt_options') return 'byteplusImageApi.optimize_prompt_options'
    if (candidate === 'aspect_ratio') return 'byteplusImageApi.aspect_ratio'
    if (candidate === 'stream') return 'byteplusImageApi.stream'
    if (candidate === 'prompt' || candidate === 'prompt_in') return 'byteplusImageApi.prompt'
    if (candidate === 'reference_image' || candidate === 'image') return 'byteplusImageApi.image'
    if (candidate === 'imageUrl') return 'byteplusImageApi.response_format'
  }
  return null
}
